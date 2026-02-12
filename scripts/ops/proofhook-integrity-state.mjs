#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const TOKEN_NAME = 'PROOFHOOK_INTEGRITY_OK';
const FAIL_CODE = 'E_PROOFHOOK_TAMPER_DETECTED';
const DEFAULT_LOCK_PATH = 'docs/OPS/PROOFHOOKS/PROOFHOOK_INTEGRITY_LOCK.json';
const SHA256_HEX_RE = /^[0-9a-f]{64}$/u;

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeRelativePath(value) {
  const pathValue = String(value || '').trim().replaceAll('\\', '/');
  if (!pathValue || path.isAbsolute(pathValue)) return '';
  if (pathValue.split('/').some((segment) => segment === '..' || segment === '')) return '';
  return pathValue;
}

function parseLockManifest(lockPath) {
  if (!fs.existsSync(lockPath)) {
    return {
      ok: false,
      rawText: '',
      manifest: null,
      error: 'LOCK_MISSING',
    };
  }

  const rawText = fs.readFileSync(lockPath, 'utf8');
  let parsed = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      ok: false,
      rawText,
      manifest: null,
      error: 'LOCK_INVALID_JSON',
    };
  }

  if (!isObjectRecord(parsed) || !Array.isArray(parsed.items) || parsed.items.length === 0) {
    return {
      ok: false,
      rawText,
      manifest: null,
      error: 'LOCK_INVALID_SCHEMA',
    };
  }

  const version = String(parsed.version || '').trim();
  if (!version) {
    return {
      ok: false,
      rawText,
      manifest: null,
      error: 'LOCK_VERSION_MISSING',
    };
  }

  const items = [];
  for (let i = 0; i < parsed.items.length; i += 1) {
    const item = parsed.items[i];
    if (!isObjectRecord(item)) {
      return {
        ok: false,
        rawText,
        manifest: null,
        error: `LOCK_ITEM_INVALID_${i}`,
      };
    }

    const itemPath = normalizeRelativePath(item.path);
    const itemSha256 = String(item.sha256 || '').trim().toLowerCase();
    if (!itemPath || !SHA256_HEX_RE.test(itemSha256)) {
      return {
        ok: false,
        rawText,
        manifest: null,
        error: `LOCK_ITEM_SHAPE_INVALID_${i}`,
      };
    }
    items.push({ path: itemPath, sha256: itemSha256 });
  }

  const sortedPaths = [...items.map((item) => item.path)].sort((a, b) => a.localeCompare(b));
  const inOrder = items.every((item, idx) => item.path === sortedPaths[idx]);
  if (!inOrder) {
    return {
      ok: false,
      rawText,
      manifest: null,
      error: 'LOCK_ITEMS_NOT_LEXICOGRAPHIC',
    };
  }

  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.path)) {
      return {
        ok: false,
        rawText,
        manifest: null,
        error: 'LOCK_ITEM_PATH_DUPLICATE',
      };
    }
    seen.add(item.path);
  }

  return {
    ok: true,
    rawText,
    manifest: {
      version,
      items,
    },
    error: '',
  };
}

function computeClosureSha256(items) {
  const payload = items
    .map((item) => `${item.path}\u0000${item.sha256}\n`)
    .join('');
  return sha256Hex(payload);
}

function computeFileSha256(rootDir, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) {
    return {
      ok: false,
      hash: 'PATH_INVALID',
    };
  }

  const rootAbs = path.resolve(rootDir);
  const absolute = path.resolve(rootAbs, normalized);
  const rel = path.relative(rootAbs, absolute);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return {
      ok: false,
      hash: 'PATH_OUTSIDE_ROOT',
    };
  }

  if (!fs.existsSync(absolute)) {
    return {
      ok: false,
      hash: 'MISSING',
    };
  }

  const stat = fs.statSync(absolute);
  if (!stat.isFile()) {
    return {
      ok: false,
      hash: 'NOT_A_FILE',
    };
  }

  return {
    ok: true,
    hash: sha256Hex(fs.readFileSync(absolute)),
  };
}

function buildFailResult(closureSha256, lockManifestSha256, detailPath, expected, actual) {
  return {
    tokens: {
      [TOKEN_NAME]: 0,
    },
    closureSha256,
    lockManifestSha256,
    failSignal: {
      code: FAIL_CODE,
      details: {
        path: detailPath,
        expected,
        actual,
      },
    },
  };
}

export function evaluateProofhookIntegrityState(input = {}) {
  const lockPath = String(
    input.lockPath || process.env.PROOFHOOK_INTEGRITY_LOCK_PATH || DEFAULT_LOCK_PATH,
  ).trim();
  const rootDir = String(
    input.rootDir || process.env.PROOFHOOK_INTEGRITY_ROOT || process.cwd(),
  ).trim();

  const parsedLock = parseLockManifest(lockPath);
  const lockManifestSha256 = parsedLock.rawText ? sha256Hex(parsedLock.rawText) : '';
  const closureSha256 = parsedLock.manifest ? computeClosureSha256(parsedLock.manifest.items) : '';

  if (!parsedLock.ok || !parsedLock.manifest) {
    return buildFailResult(
      closureSha256,
      lockManifestSha256,
      lockPath,
      'VALID_LOCK_MANIFEST',
      parsedLock.error || 'LOCK_INVALID',
    );
  }

  for (const item of parsedLock.manifest.items) {
    const actual = computeFileSha256(rootDir, item.path);
    if (!actual.ok || actual.hash !== item.sha256) {
      return buildFailResult(
        closureSha256,
        lockManifestSha256,
        item.path,
        item.sha256,
        actual.hash,
      );
    }
  }

  return {
    tokens: {
      [TOKEN_NAME]: 1,
    },
    closureSha256,
    lockManifestSha256,
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
  console.log(`PROOFHOOK_INTEGRITY_CLOSURE_SHA256=${state.closureSha256}`);
  console.log(`PROOFHOOK_INTEGRITY_LOCK_MANIFEST_SHA256=${state.lockManifestSha256}`);
  if (state.failSignal) {
    console.log(`FAIL_REASON=${state.failSignal.code}`);
    console.log(`FAIL_DETAILS=${JSON.stringify(state.failSignal.details)}`);
  }
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
  process.exit(state.tokens[TOKEN_NAME] === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
