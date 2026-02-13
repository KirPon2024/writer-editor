#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const TOKEN_NAME = 'OPS_GOVERNANCE_BASELINE_OK';
const DEFAULT_BASELINE_PATH = 'docs/OPS/BASELINE/OPS_GOVERNANCE_BASELINE_v1.0.json';
const BASELINE_VERSION = 'v1.0';
const BASELINE_SCOPE = 'OPS_GOVERNANCE_LAYER';
const SHA256_HEX_RE = /^[0-9a-f]{64}$/u;

const GOVERNED_FILES = Object.freeze([
  'docs/OPS/CLAIMS/CRITICAL_CLAIM_MATRIX.json',
  'docs/OPS/DOCTOR/INVARIANTS.md',
  'docs/OPS/EXECUTION/REQUIRED_TOKEN_SET.json',
  'docs/OPS/TOKENS/TOKEN_CATALOG_LOCK.json',
  'docs/OPS/TOKENS/TOKEN_DECLARATION.json',
].sort((a, b) => a.localeCompare(b)));

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
  return createHash('sha256').update(value).digest('hex');
}

function normalizeRelativePath(value) {
  const raw = String(value || '').trim().replaceAll('\\', '/');
  if (!raw || path.isAbsolute(raw)) return '';
  if (raw.split('/').some((segment) => segment.length === 0 || segment === '..')) return '';
  return raw;
}

function ensureInsideRoot(rootDir, relativePath) {
  const rootAbs = path.resolve(rootDir);
  const fileAbs = path.resolve(rootAbs, relativePath);
  const rel = path.relative(rootAbs, fileAbs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return '';
  return fileAbs;
}

function hashGovernedFile(rootDir, relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  if (!normalizedPath) {
    return { ok: false, hash: '', error: 'PATH_INVALID' };
  }
  const fileAbs = ensureInsideRoot(rootDir, normalizedPath);
  if (!fileAbs) {
    return { ok: false, hash: '', error: 'PATH_OUTSIDE_ROOT' };
  }
  if (!fs.existsSync(fileAbs)) {
    return { ok: false, hash: '', error: 'FILE_MISSING' };
  }
  const stat = fs.statSync(fileAbs);
  if (!stat.isFile()) {
    return { ok: false, hash: '', error: 'NOT_A_FILE' };
  }

  if (normalizedPath.endsWith('.json')) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(fileAbs, 'utf8'));
    } catch {
      return { ok: false, hash: '', error: 'JSON_INVALID' };
    }
    return { ok: true, hash: sha256Hex(stableStringify(parsed)), error: '' };
  }

  const raw = fs.readFileSync(fileAbs);
  return { ok: true, hash: sha256Hex(raw), error: '' };
}

function computeGlobalHash(fileHashes) {
  const lines = Object.keys(fileHashes)
    .sort((a, b) => a.localeCompare(b))
    .map((filePath) => `${filePath}\u0000${fileHashes[filePath]}\n`)
    .join('');
  return sha256Hex(lines);
}

function parseBaselineDoc(baselinePath) {
  if (!fs.existsSync(baselinePath)) {
    return { ok: false, error: 'BASELINE_MISSING', baseline: null };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  } catch {
    return { ok: false, error: 'BASELINE_INVALID_JSON', baseline: null };
  }

  if (!isObjectRecord(parsed)) {
    return { ok: false, error: 'BASELINE_SHAPE_INVALID', baseline: null };
  }

  const version = String(parsed.version || '').trim();
  const scope = String(parsed.scope || '').trim();
  const files = isObjectRecord(parsed.files) ? parsed.files : null;
  const globalSha = String(parsed.global_sha256 || '').trim().toLowerCase();
  const generatedAt = String(parsed.generated_at || '').trim();

  if (version !== BASELINE_VERSION) {
    return { ok: false, error: 'BASELINE_VERSION_INVALID', baseline: null };
  }
  if (scope !== BASELINE_SCOPE) {
    return { ok: false, error: 'BASELINE_SCOPE_INVALID', baseline: null };
  }
  if (!files) {
    return { ok: false, error: 'BASELINE_FILES_INVALID', baseline: null };
  }
  if (!SHA256_HEX_RE.test(globalSha)) {
    return { ok: false, error: 'BASELINE_GLOBAL_SHA_INVALID', baseline: null };
  }
  if (!generatedAt || !Number.isFinite(Date.parse(generatedAt))) {
    return { ok: false, error: 'BASELINE_GENERATED_AT_INVALID', baseline: null };
  }

  const observedPaths = Object.keys(files).sort((a, b) => a.localeCompare(b));
  const expectedPaths = [...GOVERNED_FILES];
  if (observedPaths.length !== expectedPaths.length || observedPaths.some((p, i) => p !== expectedPaths[i])) {
    return { ok: false, error: 'BASELINE_FILE_SET_MISMATCH', baseline: null };
  }

  const normalizedFiles = {};
  for (const filePath of observedPaths) {
    const row = files[filePath];
    if (!isObjectRecord(row)) {
      return { ok: false, error: 'BASELINE_FILE_ROW_INVALID', baseline: null };
    }
    const sha = String(row.sha256 || '').trim().toLowerCase();
    if (!SHA256_HEX_RE.test(sha)) {
      return { ok: false, error: 'BASELINE_FILE_SHA_INVALID', baseline: null };
    }
    normalizedFiles[filePath] = sha;
  }

  return {
    ok: true,
    error: '',
    baseline: {
      version,
      scope,
      files: normalizedFiles,
      global_sha256: globalSha,
      generated_at: generatedAt,
    },
  };
}

function computeCurrentHashes(rootDir) {
  const files = {};
  const mismatchFiles = [];

  for (const filePath of GOVERNED_FILES) {
    const state = hashGovernedFile(rootDir, filePath);
    if (!state.ok) {
      mismatchFiles.push(filePath);
      continue;
    }
    files[filePath] = state.hash;
  }

  const allPresent = mismatchFiles.length === 0;
  const global = allPresent ? computeGlobalHash(files) : '';
  return { files, global, mismatchFiles };
}

function writeBaselineFile(baselinePath, rootDir) {
  const current = computeCurrentHashes(rootDir);
  if (current.mismatchFiles.length > 0) {
    return {
      ok: false,
      error: 'BASELINE_WRITE_SOURCE_INVALID',
      baseline: null,
      mismatchFiles: current.mismatchFiles,
    };
  }

  const baselineDoc = {
    version: BASELINE_VERSION,
    scope: BASELINE_SCOPE,
    files: Object.fromEntries(
      Object.keys(current.files)
        .sort((a, b) => a.localeCompare(b))
        .map((filePath) => [filePath, { sha256: current.files[filePath] }]),
    ),
    global_sha256: current.global,
    generated_at: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(baselinePath, `${JSON.stringify(baselineDoc, null, 2)}\n`, 'utf8');

  return {
    ok: true,
    error: '',
    baseline: baselineDoc,
    mismatchFiles: [],
  };
}

function buildResult(input) {
  const {
    ok,
    mismatchFiles,
    expectedGlobal,
    actualGlobal,
    baselinePath,
    rootDir,
    baselineWritten,
    failReason,
  } = input;

  return {
    ok,
    tokens: {
      [TOKEN_NAME]: ok ? 1 : 0,
    },
    mismatch_files: [...mismatchFiles].sort((a, b) => a.localeCompare(b)),
    expected_global: expectedGlobal,
    actual_global: actualGlobal,
    baselinePath,
    rootDir,
    baselineWritten,
    failReason: ok ? '' : String(failReason || 'OPS_GOVERNANCE_BASELINE_MISMATCH'),
  };
}

export function evaluateOpsGovernanceBaselineState(input = {}) {
  const baselinePath = String(
    input.baselinePath || process.env.OPS_GOVERNANCE_BASELINE_PATH || DEFAULT_BASELINE_PATH,
  ).trim();
  const rootDir = String(
    input.rootDir || process.env.OPS_GOVERNANCE_BASELINE_ROOT || process.cwd(),
  ).trim();
  const writeBaseline = input.writeBaseline === true || process.env.OPS_GOVERNANCE_BASELINE_WRITE === '1';

  if (writeBaseline) {
    const writeState = writeBaselineFile(baselinePath, rootDir);
    if (!writeState.ok || !writeState.baseline) {
      return buildResult({
        ok: false,
        mismatchFiles: writeState.mismatchFiles || [],
        expectedGlobal: '',
        actualGlobal: '',
        baselinePath,
        rootDir,
        baselineWritten: 0,
        failReason: writeState.error || 'BASELINE_WRITE_FAILED',
      });
    }

    return buildResult({
      ok: true,
      mismatchFiles: [],
      expectedGlobal: writeState.baseline.global_sha256,
      actualGlobal: writeState.baseline.global_sha256,
      baselinePath,
      rootDir,
      baselineWritten: 1,
      failReason: '',
    });
  }

  const baselineState = parseBaselineDoc(baselinePath);
  if (!baselineState.ok || !baselineState.baseline) {
    return buildResult({
      ok: false,
      mismatchFiles: [],
      expectedGlobal: '',
      actualGlobal: '',
      baselinePath,
      rootDir,
      baselineWritten: 0,
      failReason: baselineState.error || 'BASELINE_INVALID',
    });
  }

  const current = computeCurrentHashes(rootDir);
  const mismatchFiles = new Set(current.mismatchFiles);

  for (const filePath of GOVERNED_FILES) {
    const expected = baselineState.baseline.files[filePath];
    const actual = current.files[filePath] || '';
    if (!actual || actual !== expected) mismatchFiles.add(filePath);
  }

  const expectedGlobal = baselineState.baseline.global_sha256;
  const actualGlobal = current.global;
  const ok = mismatchFiles.size === 0 && actualGlobal === expectedGlobal;

  return buildResult({
    ok,
    mismatchFiles: [...mismatchFiles],
    expectedGlobal,
    actualGlobal,
    baselinePath,
    rootDir,
    baselineWritten: 0,
    failReason: ok ? '' : 'OPS_GOVERNANCE_BASELINE_MISMATCH',
  });
}

function parseArgs(argv) {
  const out = {
    json: false,
    baselinePath: '',
    rootDir: '',
    writeBaseline: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--baseline-path' && i + 1 < argv.length) {
      out.baselinePath = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--root' && i + 1 < argv.length) {
      out.rootDir = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--write-baseline') out.writeBaseline = true;
  }

  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state.tokens[TOKEN_NAME]}`);
  console.log(`OPS_GOVERNANCE_BASELINE_EXPECTED_GLOBAL=${state.expected_global}`);
  console.log(`OPS_GOVERNANCE_BASELINE_ACTUAL_GLOBAL=${state.actual_global}`);
  console.log(`OPS_GOVERNANCE_BASELINE_MISMATCH_FILES=${JSON.stringify(state.mismatch_files)}`);
  console.log(`OPS_GOVERNANCE_BASELINE_WRITTEN=${state.baselineWritten}`);
  if (state.failReason) {
    console.log(`FAIL_REASON=${state.failReason}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateOpsGovernanceBaselineState({
    baselinePath: args.baselinePath || undefined,
    rootDir: args.rootDir || undefined,
    writeBaseline: args.writeBaseline,
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
