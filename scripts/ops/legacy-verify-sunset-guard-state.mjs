#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN_NAME = 'LEGACY_VERIFY_SUNSET_GUARD_OK';
const FAIL_CODE = 'E_LEGACY_VERIFY_PATH_STILL_PASSING';
const DEFAULT_OPS_DIR = 'scripts/ops';
const DEFAULT_GUARDS_DIR = 'scripts/guards';
const CANONICAL_ORCHESTRATOR_FILE = 'post-merge-verify.mjs';
const HELPER_FILE = 'emit-post-merge-verify-attestation.mjs';
const LEGACY_NAME_RE = /^post-merge-verify[-._].+\.mjs$/u;
const PASS_EMISSION_RE = /(?:DOCTOR_OK|POST_MERGE_VERIFY_OK\s*=\s*1|[A-Z0-9_]+_OK\s*=\s*1)/u;
const LEGACY_MARKER_RE = /\bLEGACY\b/u;
const BLOCK_MARKER_RE = /\b(?:ADVISORY|DEPRECATED|SUNSET|E_LEGACY_|FAIL_REASON|process\.exit\(\s*1\s*\))\b/u;

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
  return JSON.stringify(stableSortObject(value), null, 2);
}

function parseArgs(argv) {
  const out = {
    json: false,
    opsDir: DEFAULT_OPS_DIR,
    guardsDir: DEFAULT_GUARDS_DIR,
    legacyPaths: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--ops-dir' && i + 1 < argv.length) {
      out.opsDir = String(argv[i + 1] || '').trim() || DEFAULT_OPS_DIR;
      i += 1;
    }
    if (arg === '--guards-dir' && i + 1 < argv.length) {
      out.guardsDir = String(argv[i + 1] || '').trim() || DEFAULT_GUARDS_DIR;
      i += 1;
    }
    if (arg === '--legacy-path' && i + 1 < argv.length) {
      const value = String(argv[i + 1] || '').trim();
      if (value) out.legacyPaths.push(value);
      i += 1;
    }
  }
  return out;
}

function listFiles(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((item) => item.isFile())
      .map((item) => item.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function toRelativeNormalized(filePath) {
  const normalized = String(filePath || '').trim().replaceAll('\\', '/');
  if (!normalized) return '';
  return path.normalize(normalized).replaceAll('\\', '/');
}

function collectLegacyCandidates({ opsDir, guardsDir, explicitLegacyPaths }) {
  const candidates = new Set();
  for (const candidate of explicitLegacyPaths || []) {
    const normalized = toRelativeNormalized(candidate);
    if (normalized) candidates.add(normalized);
  }

  const opsFiles = listFiles(opsDir);
  for (const name of opsFiles) {
    if (name === CANONICAL_ORCHESTRATOR_FILE || name === HELPER_FILE) continue;
    if (!LEGACY_NAME_RE.test(name)) continue;
    candidates.add(toRelativeNormalized(path.join(opsDir, name)));
  }

  const guardFiles = listFiles(guardsDir);
  for (const name of guardFiles) {
    if (!LEGACY_NAME_RE.test(name)) continue;
    candidates.add(toRelativeNormalized(path.join(guardsDir, name)));
  }

  return [...candidates].sort((a, b) => a.localeCompare(b));
}

function analyzeLegacyFile(filePath) {
  let body = '';
  let exists = false;
  try {
    body = fs.readFileSync(filePath, 'utf8');
    exists = true;
  } catch {
    exists = false;
  }
  const hasLegacyMarker = exists ? LEGACY_MARKER_RE.test(body) : false;
  const hasBlockMarker = exists ? BLOCK_MARKER_RE.test(body) : false;
  const emitsPassSignal = exists ? PASS_EMISSION_RE.test(body) : false;
  const safe = exists && !emitsPassSignal && (hasLegacyMarker || hasBlockMarker);

  return {
    filePath,
    exists: exists ? 1 : 0,
    hasLegacyMarker: hasLegacyMarker ? 1 : 0,
    hasBlockMarker: hasBlockMarker ? 1 : 0,
    emitsPassSignal: emitsPassSignal ? 1 : 0,
    safe: safe ? 1 : 0,
  };
}

export function evaluateLegacyVerifySunsetGuardState(input = {}) {
  const opsDir = String(input.opsDir || process.env.LEGACY_VERIFY_OPS_DIR || DEFAULT_OPS_DIR).trim() || DEFAULT_OPS_DIR;
  const guardsDir = String(input.guardsDir || process.env.LEGACY_VERIFY_GUARDS_DIR || DEFAULT_GUARDS_DIR).trim() || DEFAULT_GUARDS_DIR;
  const explicitLegacyPaths = Array.isArray(input.legacyPaths)
    ? input.legacyPaths.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  const legacyFiles = collectLegacyCandidates({
    opsDir,
    guardsDir,
    explicitLegacyPaths,
  });

  const analyses = legacyFiles.map((item) => analyzeLegacyFile(item));
  const unsafeEntries = analyses.filter((item) => item.exists !== 1 || item.safe !== 1);
  const ok = unsafeEntries.length === 0;

  return {
    ok,
    [TOKEN_NAME]: ok ? 1 : 0,
    code: ok ? '' : FAIL_CODE,
    details: {
      message: legacyFiles.length === 0 ? 'no legacy found' : 'legacy paths detected',
      legacyFiles,
      analyses,
      violatingPaths: unsafeEntries.map((item) => item.filePath).sort((a, b) => a.localeCompare(b)),
    },
    paths: {
      opsDir,
      guardsDir,
    },
  };
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`LEGACY_VERIFY_OPS_DIR=${state.paths.opsDir}`);
  console.log(`LEGACY_VERIFY_GUARDS_DIR=${state.paths.guardsDir}`);
  console.log(`LEGACY_VERIFY_PATHS=${JSON.stringify(state.details.legacyFiles)}`);
  console.log(`LEGACY_VERIFY_VIOLATIONS=${JSON.stringify(state.details.violatingPaths)}`);
  if (!state.ok) {
    console.log(`FAIL_REASON=${state.code}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateLegacyVerifySunsetGuardState({
    opsDir: args.opsDir,
    guardsDir: args.guardsDir,
    legacyPaths: args.legacyPaths,
  });
  if (args.json) {
    process.stdout.write(`${stableStringify(state)}\n`);
  } else {
    printHuman(state);
  }
  process.exit(state[TOKEN_NAME] === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
