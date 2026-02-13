#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const TOKEN_NAME = 'TOKEN_CATALOG_IMMUTABLE_OK';
const DEFAULT_DECLARATION_PATH = 'docs/OPS/TOKENS/TOKEN_DECLARATION.json';
const DEFAULT_LOCK_PATH = 'docs/OPS/TOKENS/TOKEN_CATALOG_LOCK.json';
const LOCK_VERSION = 'v1.0';
const LOCK_CANONICAL_SOURCE = 'TOKEN_DECLARATION.json';
const SHA256_HEX_RE = /^[0-9a-f]{64}$/u;

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map((item) => stableSortObject(item));
  if (!isObjectRecord(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
    out[key] = stableSortObject(value[key]);
  }
  return out;
}

function stableStringify(value) {
  return JSON.stringify(stableSortObject(value));
}

function sha256Hex(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function readDeclarationCanonicalHash(declarationPath) {
  if (!fs.existsSync(declarationPath)) {
    return {
      ok: false,
      error: 'DECLARATION_MISSING',
      hash: '',
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(declarationPath, 'utf8'));
  } catch {
    return {
      ok: false,
      error: 'DECLARATION_INVALID_JSON',
      hash: '',
    };
  }

  if (!isObjectRecord(parsed)) {
    return {
      ok: false,
      error: 'DECLARATION_SHAPE_INVALID',
      hash: '',
    };
  }

  return {
    ok: true,
    error: '',
    hash: sha256Hex(stableStringify(parsed)),
  };
}

function parseLock(lockPath) {
  if (!fs.existsSync(lockPath)) {
    return {
      ok: false,
      error: 'LOCK_MISSING',
      lock: null,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return {
      ok: false,
      error: 'LOCK_INVALID_JSON',
      lock: null,
    };
  }

  if (!isObjectRecord(parsed)) {
    return {
      ok: false,
      error: 'LOCK_SHAPE_INVALID',
      lock: null,
    };
  }

  const version = String(parsed.version || '').trim();
  const canonicalSource = String(parsed.canonical_source || '').trim();
  const sha = String(parsed.sha256 || '').trim().toLowerCase();
  const generatedAt = String(parsed.generated_at || '').trim();

  if (version !== LOCK_VERSION) {
    return {
      ok: false,
      error: 'LOCK_VERSION_INVALID',
      lock: null,
    };
  }
  if (canonicalSource !== LOCK_CANONICAL_SOURCE) {
    return {
      ok: false,
      error: 'LOCK_CANONICAL_SOURCE_INVALID',
      lock: null,
    };
  }
  if (!SHA256_HEX_RE.test(sha)) {
    return {
      ok: false,
      error: 'LOCK_SHA256_INVALID',
      lock: null,
    };
  }
  if (!generatedAt || !Number.isFinite(Date.parse(generatedAt))) {
    return {
      ok: false,
      error: 'LOCK_GENERATED_AT_INVALID',
      lock: null,
    };
  }

  return {
    ok: true,
    error: '',
    lock: {
      version,
      canonical_source: canonicalSource,
      sha256: sha,
      generated_at: generatedAt,
    },
  };
}

function buildState({ declarationPath, lockPath, expected, actual, ok, failReason, lockWritten = 0 }) {
  return {
    ok,
    tokens: {
      [TOKEN_NAME]: ok ? 1 : 0,
    },
    expected,
    actual,
    declarationPath,
    lockPath,
    lockWritten,
    failReason: ok ? '' : String(failReason || 'TOKEN_CATALOG_LOCK_MISMATCH'),
  };
}

function writeLock(lockPath, sha256) {
  const lockDoc = {
    version: LOCK_VERSION,
    canonical_source: LOCK_CANONICAL_SOURCE,
    sha256,
    generated_at: new Date().toISOString(),
  };
  fs.writeFileSync(lockPath, `${JSON.stringify(lockDoc, null, 2)}\n`, 'utf8');
  return lockDoc;
}

export function evaluateTokenCatalogImmutabilityState(input = {}) {
  const declarationPath = String(
    input.declarationPath || process.env.TOKEN_DECLARATION_PATH || DEFAULT_DECLARATION_PATH,
  ).trim();
  const lockPath = String(
    input.lockPath || process.env.TOKEN_CATALOG_LOCK_PATH || DEFAULT_LOCK_PATH,
  ).trim();
  const writeLockRequested = input.writeLock === true || process.env.TOKEN_CATALOG_LOCK_WRITE === '1';

  const declarationState = readDeclarationCanonicalHash(declarationPath);
  if (!declarationState.ok) {
    return buildState({
      declarationPath,
      lockPath,
      expected: '',
      actual: '',
      ok: false,
      failReason: declarationState.error,
    });
  }

  if (writeLockRequested) {
    writeLock(lockPath, declarationState.hash);
    return buildState({
      declarationPath,
      lockPath,
      expected: declarationState.hash,
      actual: declarationState.hash,
      ok: true,
      lockWritten: 1,
    });
  }

  const parsedLock = parseLock(lockPath);
  if (!parsedLock.ok || !parsedLock.lock) {
    return buildState({
      declarationPath,
      lockPath,
      expected: '',
      actual: declarationState.hash,
      ok: false,
      failReason: parsedLock.error || 'LOCK_INVALID',
    });
  }

  const expected = parsedLock.lock.sha256;
  const actual = declarationState.hash;
  const ok = expected === actual;
  return buildState({
    declarationPath,
    lockPath,
    expected,
    actual,
    ok,
    failReason: ok ? '' : 'TOKEN_CATALOG_LOCK_MISMATCH',
  });
}

function parseArgs(argv) {
  const out = {
    json: false,
    declarationPath: '',
    lockPath: '',
    writeLock: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--declaration-path' && i + 1 < argv.length) {
      out.declarationPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--lock-path' && i + 1 < argv.length) {
      out.lockPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--write-lock') out.writeLock = true;
  }

  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state.tokens[TOKEN_NAME]}`);
  console.log(`TOKEN_CATALOG_LOCK_EXPECTED_SHA256=${state.expected}`);
  console.log(`TOKEN_CATALOG_LOCK_ACTUAL_SHA256=${state.actual}`);
  console.log(`TOKEN_CATALOG_LOCK_WRITTEN=${state.lockWritten}`);
  if (state.failReason) {
    console.log(`FAIL_REASON=${state.failReason}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateTokenCatalogImmutabilityState({
    declarationPath: args.declarationPath || undefined,
    lockPath: args.lockPath || undefined,
    writeLock: args.writeLock,
  });

  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printHuman(state);
  }

  process.exit(state.tokens[TOKEN_NAME] === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
