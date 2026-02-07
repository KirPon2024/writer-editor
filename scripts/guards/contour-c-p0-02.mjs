#!/usr/bin/env node
import fs from 'node:fs';

const RULE_ID = 'C-P0-02-RULE-001';
const DEFAULT_POLICY_PATH = 'docs/OPS/CONTOUR_C/C-P0-02-CONTRACT-POLICY.json';

function parseArgs(argv) {
  const out = {
    policyPath: DEFAULT_POLICY_PATH,
    ruleId: RULE_ID,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--policy') out.policyPath = argv[index + 1] ?? out.policyPath;
    if (arg === '--rule-id') out.ruleId = argv[index + 1] ?? out.ruleId;
    if (arg === '--policy' || arg === '--rule-id') index += 1;
  }
  return out;
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function violation(ruleId, filePath, reason) {
  return { ruleId, filePath, line: 0, reason };
}

function validatePolicy(ruleId, filePath, policy) {
  const errors = [];
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    errors.push(violation(ruleId, filePath, 'POLICY_TOP_LEVEL_INVALID'));
    return errors;
  }
  if (policy.schemaVersion !== 1) {
    errors.push(violation(ruleId, filePath, 'POLICY_SCHEMA_VERSION_INVALID'));
  }
  if (policy.policyId !== 'C-P0-02-IPC-ADDITIVE-ONLY') {
    errors.push(violation(ruleId, filePath, 'POLICY_ID_INVALID'));
  }
  if (policy.contractScope !== 'ipc.dto') {
    errors.push(violation(ruleId, filePath, 'POLICY_SCOPE_INVALID'));
  }
  if (policy.envelopeVersion !== 1) {
    errors.push(violation(ruleId, filePath, 'POLICY_ENVELOPE_VERSION_INVALID'));
  }
  if (policy.additiveOnly !== true) {
    errors.push(violation(ruleId, filePath, 'POLICY_ADDITIVE_ONLY_FALSE'));
  }
  const requiredEnvelopeKeys = Array.isArray(policy.requiredEnvelopeKeys) ? policy.requiredEnvelopeKeys : [];
  const requiredSet = new Set(requiredEnvelopeKeys);
  const expectedRequired = ['kind', 'payload', 'version'];
  for (const key of expectedRequired) {
    if (!requiredSet.has(key)) {
      errors.push(violation(ruleId, filePath, `POLICY_REQUIRED_KEY_MISSING_${key.toUpperCase()}`));
    }
  }
  const forbiddenBreakingOps = Array.isArray(policy.forbiddenBreakingOps) ? policy.forbiddenBreakingOps : [];
  const forbiddenSet = new Set(forbiddenBreakingOps);
  const expectedForbidden = ['remove_required_field', 'rename_required_field', 'type_narrowing'];
  for (const value of expectedForbidden) {
    if (!forbiddenSet.has(value)) {
      errors.push(violation(ruleId, filePath, `POLICY_FORBIDDEN_OP_MISSING_${value.toUpperCase()}`));
    }
  }
  return errors;
}

function printViolation(item) {
  process.stdout.write(`RULE_ID=${item.ruleId}\n`);
  process.stdout.write(`FILE=${item.filePath}\n`);
  process.stdout.write(`LINE=${item.line}\n`);
  process.stdout.write(`REASON=${item.reason}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const problems = [];
  let policy;
  try {
    policy = readJson(args.policyPath);
  } catch {
    problems.push(violation(args.ruleId, args.policyPath, 'POLICY_JSON_READ_FAIL'));
  }
  if (policy) {
    problems.push(...validatePolicy(args.ruleId, args.policyPath, policy));
  }

  problems.sort((left, right) => {
    if (left.reason !== right.reason) return left.reason.localeCompare(right.reason);
    if (left.filePath !== right.filePath) return left.filePath.localeCompare(right.filePath);
    return left.line - right.line;
  });

  if (problems.length > 0) {
    for (const item of problems) printViolation(item);
    process.exit(1);
  }

  process.stdout.write(`RULE_ID=${args.ruleId}\n`);
  process.stdout.write(`FILE=${args.policyPath}\n`);
  process.stdout.write('LINE=0\n');
  process.stdout.write('REASON=OK\n');
  process.exit(0);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(`RULE_ID=${RULE_ID}\n`);
  process.stdout.write('FILE=scripts/guards/contour-c-p0-02.mjs\n');
  process.stdout.write('LINE=0\n');
  process.stdout.write(`REASON=UNHANDLED:${message}\n`);
  process.exit(1);
}
