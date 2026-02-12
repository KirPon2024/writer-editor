#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const TOKEN_NAME = 'CONFIG_HASH_LOCK_OK';
const FAIL_CODE = 'E_CONFIG_HASH_CONFLICT';
const DEFAULT_LOCK_PATH = 'docs/OPS/LOCKS/CONFIG_HASH_LOCK.json';
const SHA256_HEX_RE = /^[0-9a-f]{64}$/u;

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

function computeConfigHash(items) {
  const payload = items
    .map((item) => `${item.path}\u0000${item.sha256}\n`)
    .join('');
  return sha256Hex(payload);
}

function resolveFileHash(rootDir, relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  if (!normalizedPath) return { ok: false, hash: 'PATH_INVALID' };

  const rootAbs = path.resolve(rootDir);
  const fileAbs = path.resolve(rootAbs, normalizedPath);
  const rel = path.relative(rootAbs, fileAbs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return { ok: false, hash: 'PATH_OUTSIDE_ROOT' };
  if (!fs.existsSync(fileAbs)) return { ok: false, hash: 'MISSING' };

  const stat = fs.statSync(fileAbs);
  if (!stat.isFile()) return { ok: false, hash: 'NOT_A_FILE' };

  return { ok: true, hash: sha256Hex(fs.readFileSync(fileAbs)) };
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
  const inputsRaw = Array.isArray(parsed.inputs) ? parsed.inputs : null;
  const inputHashes = isObjectRecord(parsed.inputHashes) ? parsed.inputHashes : null;
  const configHash = String(parsed.configHash || '').trim().toLowerCase();
  if (!version || !inputsRaw || !inputHashes || !SHA256_HEX_RE.test(configHash)) {
    return {
      ok: false,
      error: 'LOCK_FIELDS_INVALID',
      lock: null,
    };
  }

  const inputs = [];
  for (const rawPath of inputsRaw) {
    const normalizedPath = normalizeRelativePath(rawPath);
    if (!normalizedPath) {
      return {
        ok: false,
        error: 'LOCK_INPUT_PATH_INVALID',
        lock: null,
      };
    }
    inputs.push(normalizedPath);
  }

  const sortedInputs = [...inputs].sort((a, b) => a.localeCompare(b));
  if (sortedInputs.length !== inputs.length || sortedInputs.some((item, idx) => item !== inputs[idx])) {
    return {
      ok: false,
      error: 'LOCK_INPUTS_NOT_SORTED',
      lock: null,
    };
  }
  if (new Set(inputs).size !== inputs.length) {
    return {
      ok: false,
      error: 'LOCK_INPUTS_DUPLICATE',
      lock: null,
    };
  }

  const hashKeys = Object.keys(inputHashes).sort((a, b) => a.localeCompare(b));
  if (hashKeys.length !== inputs.length || hashKeys.some((item, idx) => item !== inputs[idx])) {
    return {
      ok: false,
      error: 'LOCK_INPUT_HASHES_KEYS_MISMATCH',
      lock: null,
    };
  }

  for (const key of inputs) {
    const hash = String(inputHashes[key] || '').trim().toLowerCase();
    if (!SHA256_HEX_RE.test(hash)) {
      return {
        ok: false,
        error: 'LOCK_INPUT_HASH_INVALID',
        lock: null,
      };
    }
  }

  return {
    ok: true,
    error: '',
    lock: {
      version,
      inputs,
      inputHashes,
      configHash,
    },
  };
}

function buildFailState(lockedConfigHash, observedConfigHash, details) {
  return {
    tokens: {
      [TOKEN_NAME]: 0,
    },
    lockedConfigHash,
    observedConfigHash,
    failSignal: {
      code: FAIL_CODE,
      details: {
        ...details,
        lockedConfigHash,
        observedConfigHash,
      },
    },
  };
}

export function evaluateConfigHashLockState(input = {}) {
  const lockPath = String(
    input.lockPath || process.env.CONFIG_HASH_LOCK_PATH || DEFAULT_LOCK_PATH,
  ).trim();
  const rootDir = String(
    input.rootDir || process.env.CONFIG_HASH_LOCK_ROOT || process.cwd(),
  ).trim();

  const parsed = parseLock(lockPath);
  if (!parsed.ok || !parsed.lock) {
    return buildFailState('', '', {
      path: lockPath,
      expected: 'VALID_CONFIG_HASH_LOCK',
      actual: parsed.error || 'LOCK_INVALID',
    });
  }

  const observedItems = [];
  for (const filePath of parsed.lock.inputs) {
    const hashState = resolveFileHash(rootDir, filePath);
    const actualHash = hashState.hash;
    observedItems.push({
      path: filePath,
      sha256: actualHash,
    });
    const expectedHash = String(parsed.lock.inputHashes[filePath] || '').trim().toLowerCase();
    if (!hashState.ok || actualHash !== expectedHash) {
      const observedConfigHash = computeConfigHash(observedItems);
      return buildFailState(parsed.lock.configHash, observedConfigHash, {
        path: filePath,
        expected: expectedHash,
        actual: actualHash,
      });
    }
  }

  const observedConfigHash = computeConfigHash(observedItems);
  if (observedConfigHash !== parsed.lock.configHash) {
    return buildFailState(parsed.lock.configHash, observedConfigHash, {
      expected: parsed.lock.configHash,
      actual: observedConfigHash,
    });
  }

  return {
    tokens: {
      [TOKEN_NAME]: 1,
    },
    lockedConfigHash: parsed.lock.configHash,
    observedConfigHash,
  };
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
  console.log(`${TOKEN_NAME}=${state.tokens[TOKEN_NAME]}`);
  console.log(`CONFIG_HASH_LOCK_LOCKED=${state.lockedConfigHash}`);
  console.log(`CONFIG_HASH_LOCK_OBSERVED=${state.observedConfigHash}`);
  if (state.failSignal) {
    console.log(`FAIL_REASON=${state.failSignal.code}`);
    console.log(`FAIL_DETAILS=${JSON.stringify(state.failSignal.details)}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateConfigHashLockState({
    lockPath: args.lockPath || undefined,
    rootDir: args.rootDir || undefined,
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
