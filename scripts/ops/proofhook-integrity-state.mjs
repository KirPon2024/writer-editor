#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const TOKEN_NAME = 'PROOFHOOK_INTEGRITY_OK';
const DEFAULT_LOCK_PATH = 'docs/OPS/PROOFHOOKS/PROOFHOOK_INTEGRITY_LOCK.json';
const FAIL_TAMPER_CODE = 'E_PROOFHOOK_TAMPER_DETECTED';
const FAIL_LOCK_CODE = 'E_PROOFHOOK_LOCK_INVALID';
const HASH_RE = /^[0-9a-f]{64}$/u;

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeRelativePath(value) {
  const raw = String(value || '').trim().replaceAll('\\', '/');
  if (!raw || path.isAbsolute(raw)) return '';
  if (raw.split('/').some((segment) => segment.length === 0 || segment === '..')) return '';
  return raw;
}

function parseLock(lockPath) {
  if (!fs.existsSync(lockPath)) {
    return { ok: false, error: 'LOCK_MISSING', lock: null };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return { ok: false, error: 'LOCK_INVALID_JSON', lock: null };
  }

  if (!isObjectRecord(parsed)) {
    return { ok: false, error: 'LOCK_SHAPE_INVALID', lock: null };
  }

  const schemaVersion = Number(parsed.schemaVersion);
  const algorithm = String(parsed.algorithm || '').trim();
  const closurePathsRaw = Array.isArray(parsed.closurePaths) ? parsed.closurePaths : null;
  const closureFileHashes = isObjectRecord(parsed.closureFileHashes) ? parsed.closureFileHashes : null;
  const closureHash = String(parsed.closureHash || '').trim().toLowerCase();

  if (schemaVersion !== 1 || algorithm !== 'closure-sha256-v1') {
    return { ok: false, error: 'LOCK_HEADER_INVALID', lock: null };
  }
  if (!closurePathsRaw || closurePathsRaw.length === 0 || !closureFileHashes || !HASH_RE.test(closureHash)) {
    return { ok: false, error: 'LOCK_FIELDS_INVALID', lock: null };
  }

  const closurePaths = [];
  for (const item of closurePathsRaw) {
    const normalized = normalizeRelativePath(item);
    if (!normalized) return { ok: false, error: 'LOCK_PATH_INVALID', lock: null };
    closurePaths.push(normalized);
  }

  const sorted = [...closurePaths].sort((a, b) => a.localeCompare(b));
  if (sorted.some((item, index) => item !== closurePaths[index])) {
    return { ok: false, error: 'LOCK_PATHS_NOT_SORTED', lock: null };
  }
  if (new Set(closurePaths).size !== closurePaths.length) {
    return { ok: false, error: 'LOCK_PATHS_DUPLICATE', lock: null };
  }

  const hashKeys = Object.keys(closureFileHashes).sort((a, b) => a.localeCompare(b));
  if (hashKeys.length !== closurePaths.length || hashKeys.some((item, index) => item !== closurePaths[index])) {
    return { ok: false, error: 'LOCK_HASH_KEYS_MISMATCH', lock: null };
  }

  for (const filePath of closurePaths) {
    const expectedHash = String(closureFileHashes[filePath] || '').trim().toLowerCase();
    if (!HASH_RE.test(expectedHash)) {
      return { ok: false, error: 'LOCK_HASH_INVALID', lock: null };
    }
  }

  return {
    ok: true,
    error: '',
    lock: {
      schemaVersion,
      algorithm,
      closurePaths,
      closureFileHashes,
      closureHash,
    },
  };
}

function resolveFileHash(rootDir, filePath) {
  const normalized = normalizeRelativePath(filePath);
  if (!normalized) return { ok: false, hash: 'PATH_INVALID', reason: 'PATH_INVALID' };

  const rootAbs = path.resolve(rootDir);
  const absPath = path.resolve(rootAbs, normalized);
  const rel = path.relative(rootAbs, absPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, hash: 'PATH_OUTSIDE_ROOT', reason: 'PATH_OUTSIDE_ROOT' };
  }
  if (!fs.existsSync(absPath)) {
    return { ok: false, hash: 'MISSING', reason: 'MISSING' };
  }

  const stat = fs.statSync(absPath);
  if (!stat.isFile()) {
    return { ok: false, hash: 'NOT_A_FILE', reason: 'NOT_A_FILE' };
  }

  return { ok: true, hash: sha256Hex(fs.readFileSync(absPath)), reason: '' };
}

function computeClosureHash(entries) {
  const payload = entries
    .map((entry) => `${entry.path}${entry.sha256}`)
    .join('');
  return sha256Hex(payload);
}

function makeState(ok, code, details) {
  return {
    ok,
    [TOKEN_NAME]: ok ? 1 : 0,
    code: code || '',
    details,
  };
}

export function evaluateProofhookIntegrityState(input = {}) {
  const lockPath = String(
    input.lockPath || process.env.PROOFHOOK_INTEGRITY_LOCK_PATH || DEFAULT_LOCK_PATH,
  ).trim();
  const rootDir = String(
    input.rootDir || process.env.PROOFHOOK_INTEGRITY_ROOT || process.cwd(),
  ).trim();

  const parsed = parseLock(lockPath);
  if (!parsed.ok || !parsed.lock) {
    return makeState(false, FAIL_LOCK_CODE, {
      lockPath,
      lockError: parsed.error || 'LOCK_INVALID',
      closureHashComputed: '',
      closureHashLocked: '',
      mismatches: [],
    });
  }

  const entries = [];
  const mismatches = [];
  for (const closurePath of parsed.lock.closurePaths) {
    const resolved = resolveFileHash(rootDir, closurePath);
    const expectedHash = String(parsed.lock.closureFileHashes[closurePath] || '').trim().toLowerCase();
    entries.push({ path: closurePath, sha256: resolved.hash });
    if (!resolved.ok) {
      mismatches.push({
        path: closurePath,
        expected: expectedHash,
        actual: resolved.hash,
        reason: resolved.reason,
      });
      continue;
    }
    if (resolved.hash !== expectedHash) {
      mismatches.push({
        path: closurePath,
        expected: expectedHash,
        actual: resolved.hash,
        reason: 'HASH_MISMATCH',
      });
    }
  }

  const closureHashComputed = computeClosureHash(entries);
  if (closureHashComputed !== parsed.lock.closureHash) {
    mismatches.push({
      path: '<closure>',
      expected: parsed.lock.closureHash,
      actual: closureHashComputed,
      reason: 'CLOSURE_HASH_MISMATCH',
    });
  }

  const details = {
    lockPath,
    closureHashComputed,
    closureHashLocked: parsed.lock.closureHash,
    closureSize: parsed.lock.closurePaths.length,
    mismatches,
  };

  if (mismatches.length > 0) {
    return makeState(false, FAIL_TAMPER_CODE, details);
  }

  return makeState(true, '', details);
}

function parseArgs(argv) {
  const out = {
    json: false,
    lockPath: '',
    rootDir: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--lock-path' && i + 1 < argv.length) {
      out.lockPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--root' && i + 1 < argv.length) {
      out.rootDir = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`FAIL_REASON=${state.code || ''}`);
  console.log(`PROOFHOOK_INTEGRITY_DETAILS=${JSON.stringify(state.details)}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateProofhookIntegrityState({
    lockPath: args.lockPath || undefined,
    rootDir: args.rootDir || undefined,
  });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printHuman(state);
  }
  process.exit(state[TOKEN_NAME] === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
