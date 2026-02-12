#!/usr/bin/env node
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const TOOL_VERSION = 'validate-execution-profile.v1';
const TOKEN_NAME = 'EXECUTION_PROFILE_VALID_OK';
const DEFAULT_PROFILE_PATH = 'docs/OPS/EXECUTION/EXECUTION_PROFILE.example.json';
const DEFAULT_SCHEMA_PATH = 'docs/OPS/EXECUTION/EXECUTION_PROFILE.schema.json';
const TOKEN_RE = /^[A-Z0-9_]+$/u;
const APPLY_TO_ALLOWED = new Set(['core', 'release']);
const PROFILE_ALLOWED = new Set(['dev', 'pr', 'release']);
const GATE_TIER_ALLOWED = new Set(['core', 'release']);

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map((item) => stableSortObject(item));
  if (!isObjectRecord(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = stableSortObject(value[key]);
  }
  return out;
}

function stableStringify(value) {
  return JSON.stringify(stableSortObject(value));
}

function sha256Hex(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function uniqueSortedTokens(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of values) {
    const token = String(raw || '').trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out.sort();
}

function readJsonFile(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return isObjectRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function validateRequiredSetTokens(tokens, failures, failureCode) {
  const normalized = uniqueSortedTokens(tokens);
  if (!Array.isArray(tokens) || normalized.length !== tokens.length) {
    failures.add(failureCode);
  }
  if (!normalized.every((token) => TOKEN_RE.test(token))) {
    failures.add(failureCode);
  }
  return normalized;
}

export function validateExecutionProfileDocument(profileDoc = {}) {
  const failures = new Set();
  const profile = isObjectRecord(profileDoc) ? profileDoc : {};

  if (profile.schemaVersion !== 1) failures.add('E_EXECUTION_PROFILE_INVALID');
  if (!PROFILE_ALLOWED.has(String(profile.profile || ''))) failures.add('E_EXECUTION_PROFILE_INVALID');
  if (!GATE_TIER_ALLOWED.has(String(profile.gateTier || ''))) failures.add('E_EXECUTION_PROFILE_INVALID');

  if (typeof profile.requirePerfBaseline !== 'boolean') failures.add('E_EXECUTION_PROFILE_INVALID');
  if (typeof profile.economicClaimDeclared !== 'boolean') failures.add('E_EXECUTION_PROFILE_INVALID');
  if (typeof profile.requireScrSharedRatio !== 'boolean') failures.add('E_EXECUTION_PROFILE_INVALID');
  if (typeof profile.headStrictEnforced !== 'boolean') failures.add('E_EXECUTION_PROFILE_INVALID');
  if (typeof profile.networkStrictVerifyRequired !== 'boolean') failures.add('E_EXECUTION_PROFILE_INVALID');

  const scopeFlags = isObjectRecord(profile.scopeFlags) ? profile.scopeFlags : null;
  if (!scopeFlags) failures.add('E_EXECUTION_PROFILE_INVALID');
  if (scopeFlags && !Object.keys(scopeFlags).every((key) => typeof scopeFlags[key] === 'boolean')) {
    failures.add('E_EXECUTION_PROFILE_INVALID');
  }

  const requiredSets = isObjectRecord(profile.requiredSets) ? profile.requiredSets : null;
  if (!requiredSets) failures.add('E_EXECUTION_PROFILE_INVALID');

  const coreTokens = validateRequiredSetTokens(requiredSets ? requiredSets.core : null, failures, 'E_EXECUTION_PROFILE_INVALID');
  const releaseTokens = validateRequiredSetTokens(requiredSets ? requiredSets.release : null, failures, 'E_EXECUTION_PROFILE_INVALID');
  const freezeModeTokens = validateRequiredSetTokens(requiredSets ? requiredSets.freezeMode : null, failures, 'E_EXECUTION_PROFILE_INVALID');

  if (coreTokens.length === 0 || releaseTokens.length === 0 || freezeModeTokens.length === 0) {
    failures.add('E_EXECUTION_PROFILE_INVALID');
  }

  const conditional = requiredSets && Array.isArray(requiredSets.conditional) ? requiredSets.conditional : null;
  if (!conditional) {
    failures.add('E_EXECUTION_PROFILE_INVALID');
  } else {
    for (const row of conditional) {
      if (!isObjectRecord(row)) {
        failures.add('E_EXECUTION_PROFILE_INVALID');
        continue;
      }
      const flag = String(row.flag || '').trim();
      if (!flag || !TOKEN_RE.test(flag)) failures.add('E_EXECUTION_PROFILE_INVALID');
      if (!scopeFlags || !Object.prototype.hasOwnProperty.call(scopeFlags, flag)) {
        failures.add('E_EXECUTION_PROFILE_INVALID');
      }
      if (typeof row.enabledWhen !== 'boolean') failures.add('E_EXECUTION_PROFILE_INVALID');
      const tokens = validateRequiredSetTokens(row.tokens, failures, 'E_EXECUTION_PROFILE_INVALID');
      if (tokens.length === 0) failures.add('E_EXECUTION_PROFILE_INVALID');
      if (!Array.isArray(row.applyTo) || row.applyTo.length === 0) {
        failures.add('E_EXECUTION_PROFILE_INVALID');
      } else if (!row.applyTo.every((item) => APPLY_TO_ALLOWED.has(String(item || '')))) {
        failures.add('E_EXECUTION_PROFILE_INVALID');
      }
    }
  }

  if (profile.requireScrSharedRatio !== profile.economicClaimDeclared) {
    failures.add('E_EXECUTION_PROFILE_CONTRADICTION');
  }
  if (scopeFlags && profile.requirePerfBaseline !== Boolean(scopeFlags.RELEASE_SCOPE_PERF)) {
    failures.add('E_EXECUTION_PROFILE_CONTRADICTION');
  }
  if (scopeFlags && profile.requireScrSharedRatio !== Boolean(scopeFlags.ECONOMIC_CLAIM_SHARED_CODE)) {
    failures.add('E_EXECUTION_PROFILE_CONTRADICTION');
  }
  if (profile.gateTier === 'release' && profile.headStrictEnforced !== true) {
    failures.add('E_EXECUTION_PROFILE_CONTRADICTION');
  }
  if (profile.gateTier === 'core' && profile.headStrictEnforced !== false) {
    failures.add('E_EXECUTION_PROFILE_CONTRADICTION');
  }
  if (profile.profile === 'release' && profile.gateTier !== 'release') {
    failures.add('E_EXECUTION_PROFILE_CONTRADICTION');
  }
  if ((profile.profile === 'dev' || profile.profile === 'pr') && profile.gateTier !== 'core') {
    failures.add('E_EXECUTION_PROFILE_CONTRADICTION');
  }

  return {
    ok: failures.size === 0,
    failures: [...failures].sort(),
    normalizedProfile: stableSortObject(profile),
  };
}

export function evaluateExecutionProfileValidationState(input = {}) {
  const profilePath = String(
    input.profilePath
      || process.env.EXECUTION_PROFILE_PATH
      || DEFAULT_PROFILE_PATH,
  ).trim();
  const schemaPath = String(
    input.schemaPath
      || process.env.EXECUTION_PROFILE_SCHEMA_PATH
      || DEFAULT_SCHEMA_PATH,
  ).trim();

  const profileDoc = isObjectRecord(input.profileDoc) ? input.profileDoc : readJsonFile(profilePath);
  const schemaDoc = isObjectRecord(input.schemaDoc) ? input.schemaDoc : readJsonFile(schemaPath);

  const failures = new Set();
  if (!schemaDoc) failures.add('E_EXECUTION_PROFILE_SCHEMA_MISSING');
  if (!profileDoc) failures.add('E_EXECUTION_PROFILE_INVALID');

  let normalizedProfile = {};
  if (profileDoc) {
    const validated = validateExecutionProfileDocument(profileDoc);
    normalizedProfile = validated.normalizedProfile;
    for (const failure of validated.failures) failures.add(failure);
  }

  const sortedFailures = [...failures].sort();
  const ok = sortedFailures.length === 0;
  const configHash = sha256Hex(stableStringify({
    profilePath,
    schemaPath,
    normalizedProfile,
  }));

  return {
    ok,
    [TOKEN_NAME]: ok ? 1 : 0,
    failures: sortedFailures,
    profilePath,
    schemaPath,
    toolVersion: TOOL_VERSION,
    configHash,
  };
}

function parseArgs(argv) {
  const out = {
    json: false,
    profilePath: '',
    schemaPath: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--profile' && i + 1 < argv.length) {
      out.profilePath = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--schema' && i + 1 < argv.length) {
      out.schemaPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`EXECUTION_PROFILE_PATH=${state.profilePath}`);
  console.log(`EXECUTION_PROFILE_SCHEMA_PATH=${state.schemaPath}`);
  console.log(`EXECUTION_PROFILE_FAILURES=${JSON.stringify(state.failures)}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateExecutionProfileValidationState({
    profilePath: args.profilePath || undefined,
    schemaPath: args.schemaPath || undefined,
  });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printHuman(state);
  }
  process.exit(state.ok ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
