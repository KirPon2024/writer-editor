#!/usr/bin/env node
import fs from 'node:fs';

const RULE_ID = 'C-P0-01-RULE-001';
const INVARIANT_ID = 'C_RUNTIME_NO_BYPASS_CORE';
const REQUIRED_CHECK_ID = 'CHK-LAYER-IMPORT-BOUNDARY';

function parseArgs(argv) {
  const out = {
    invariantsPath: 'docs/OPS/INVARIANTS_REGISTRY.json',
    enforcementPath: 'docs/OPS/CONTOUR-C-ENFORCEMENT.json',
    ruleId: RULE_ID,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--invariants') out.invariantsPath = argv[index + 1] ?? out.invariantsPath;
    if (arg === '--enforcement') out.enforcementPath = argv[index + 1] ?? out.enforcementPath;
    if (arg === '--rule-id') out.ruleId = argv[index + 1] ?? out.ruleId;
    if (arg === '--invariants' || arg === '--enforcement' || arg === '--rule-id') index += 1;
  }

  return out;
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function buildViolation(ruleId, filePath, reason) {
  return { ruleId, filePath, line: 0, reason };
}

function validateInvariantEntry(invariants, ruleId, filePath) {
  const items = Array.isArray(invariants?.items) ? invariants.items : [];
  const item = items.find((entry) => entry && entry.invariantId === INVARIANT_ID);
  if (!item) return [buildViolation(ruleId, filePath, 'INVARIANT_ENTRY_MISSING')];

  const violations = [];
  if (item.maturity !== 'implemented') {
    violations.push(buildViolation(ruleId, filePath, 'INVARIANT_MATURITY_NOT_IMPLEMENTED'));
  }
  if (item.checkId !== REQUIRED_CHECK_ID) {
    violations.push(buildViolation(ruleId, filePath, 'INVARIANT_CHECK_ID_INVALID'));
  }
  return violations;
}

function validateEnforcementEntry(enforcement, ruleId, filePath) {
  const items = Array.isArray(enforcement?.items) ? enforcement.items : [];
  const item = items.find((entry) => entry && entry.invariantId === INVARIANT_ID);
  if (!item) return [buildViolation(ruleId, filePath, 'ENFORCEMENT_ENTRY_MISSING')];

  const violations = [];
  if (item.maturity !== 'implemented') {
    violations.push(buildViolation(ruleId, filePath, 'ENFORCEMENT_MATURITY_NOT_IMPLEMENTED'));
  }
  if (!Array.isArray(item.ruleIds)) {
    violations.push(buildViolation(ruleId, filePath, 'ENFORCEMENT_RULE_IDS_INVALID'));
  } else if (!item.ruleIds.includes(ruleId)) {
    violations.push(buildViolation(ruleId, filePath, 'ENFORCEMENT_RULE_NOT_REGISTERED'));
  }
  return violations;
}

function printViolation(violation) {
  process.stdout.write(`RULE_ID=${violation.ruleId}\n`);
  process.stdout.write(`FILE=${violation.filePath}\n`);
  process.stdout.write(`LINE=${violation.line}\n`);
  process.stdout.write(`REASON=${violation.reason}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const violations = [];

  let invariants;
  let enforcement;

  try {
    invariants = readJson(args.invariantsPath);
  } catch {
    violations.push(buildViolation(args.ruleId, args.invariantsPath, 'INVARIANTS_JSON_READ_FAIL'));
  }

  try {
    enforcement = readJson(args.enforcementPath);
  } catch {
    violations.push(buildViolation(args.ruleId, args.enforcementPath, 'ENFORCEMENT_JSON_READ_FAIL'));
  }

  if (invariants) {
    violations.push(...validateInvariantEntry(invariants, args.ruleId, args.invariantsPath));
  }
  if (enforcement) {
    violations.push(...validateEnforcementEntry(enforcement, args.ruleId, args.enforcementPath));
  }

  violations.sort((left, right) => {
    if (left.reason !== right.reason) return left.reason.localeCompare(right.reason);
    if (left.filePath !== right.filePath) return left.filePath.localeCompare(right.filePath);
    return left.line - right.line;
  });

  if (violations.length > 0) {
    for (const violation of violations) printViolation(violation);
    process.exit(1);
  }

  process.stdout.write(`RULE_ID=${args.ruleId}\n`);
  process.stdout.write(`FILE=${args.invariantsPath}\n`);
  process.stdout.write('LINE=0\n');
  process.stdout.write('REASON=OK\n');
  process.exit(0);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(`RULE_ID=${RULE_ID}\n`);
  process.stdout.write('FILE=scripts/guards/contour-c-p0-01.mjs\n');
  process.stdout.write('LINE=0\n');
  process.stdout.write(`REASON=UNHANDLED:${message}\n`);
  process.exit(1);
}
