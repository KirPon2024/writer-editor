#!/usr/bin/env node
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { evaluateGenerateRequiredTokenSetState } from './generate-required-token-set.mjs';

const TOOL_VERSION = 'required-token-set-lock-state.v1';
const TOKEN_NAME = 'REQUIRED_TOKEN_SET_LOCK_OK';
const DEFAULT_PROFILE_PATH = 'docs/OPS/EXECUTION/EXECUTION_PROFILE.example.json';
const DEFAULT_LOCK_PATH = 'docs/OPS/EXECUTION/REQUIRED_TOKEN_SET.json';

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

function readJsonObject(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return isObjectRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function evaluateRequiredTokenSetLockState(input = {}) {
  const profilePath = String(
    input.profilePath
      || process.env.EXECUTION_PROFILE_PATH
      || DEFAULT_PROFILE_PATH,
  ).trim();
  const lockPath = String(
    input.lockPath
      || process.env.REQUIRED_TOKEN_SET_PATH
      || DEFAULT_LOCK_PATH,
  ).trim();

  const failures = new Set();
  const lockDoc = isObjectRecord(input.lockDoc) ? input.lockDoc : readJsonObject(lockPath);
  if (!lockDoc) failures.add('E_REQUIRED_TOKEN_SET_LOCK_MISSING');

  const generated = evaluateGenerateRequiredTokenSetState({
    profilePath,
    lockPath,
    writeLock: false,
    profileDoc: isObjectRecord(input.profileDoc) ? input.profileDoc : undefined,
  });
  for (const failure of generated.failures || []) failures.add(failure);

  const expectedLock = generated.requiredTokenSet;
  if (!expectedLock) {
    failures.add('E_REQUIRED_TOKEN_SET_DRIFT');
  }

  const lockMatches = lockDoc && expectedLock
    ? stableStringify(lockDoc) === stableStringify(expectedLock)
    : false;

  if (!lockMatches) failures.add('E_REQUIRED_TOKEN_SET_DRIFT');
  const sortedFailures = [...failures].sort();
  const ok = sortedFailures.length === 0;

  return {
    ok,
    [TOKEN_NAME]: ok ? 1 : 0,
    failures: sortedFailures,
    profilePath,
    lockPath,
    lockMatches: lockMatches ? 1 : 0,
    toolVersion: TOOL_VERSION,
    configHash: sha256Hex(stableStringify({
      profilePath,
      lockPath,
      lockDoc: lockDoc || {},
      expectedLock: expectedLock || {},
    })),
  };
}

function parseArgs(argv) {
  const out = {
    json: false,
    profilePath: '',
    lockPath: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--profile' && i + 1 < argv.length) {
      out.profilePath = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--lock-path' && i + 1 < argv.length) {
      out.lockPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`REQUIRED_TOKEN_SET_LOCK_MATCHES=${state.lockMatches}`);
  console.log(`REQUIRED_TOKEN_SET_LOCK_FAILURES=${JSON.stringify(state.failures)}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateRequiredTokenSetLockState({
    profilePath: args.profilePath || undefined,
    lockPath: args.lockPath || undefined,
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
