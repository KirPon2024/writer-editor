#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODE_RELEASE = 'release';
const MODE_PROMOTION = 'promotion';
const RESULT_PASS = 'PASS';
const RESULT_WARN = 'WARN';
const RESULT_FAIL = 'FAIL';
const FAIL_SIGNAL_CODE = 'E_LAW_PATH_DRIFT';
const LAW_PATH_CANON_INVALID = 'LAW_PATH_CANON_INVALID';
const LAW_FILE_BASENAME_PREFIX = 'XPLAT_UNIFIED_MASTER_EXECUTION_CONTRACT_';
const LAW_FILE_BASENAME_RE = /^XPLAT_UNIFIED_MASTER_EXECUTION_CONTRACT_.*\.md$/u;
const DEFAULT_CANON_PATH = 'docs/OPS/STATUS/LAW_PATH_CANON.json';
const ARCHIVE_PREFIX = 'docs/OPS/STATUS/ARCHIVE/';
const STATUS_DIR = 'docs/OPS/STATUS';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseBooleanish(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return false;
  return normalized === '1'
    || normalized === 'true'
    || normalized === 'yes'
    || normalized === 'on';
}

function normalizeMode(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === MODE_PROMOTION) return MODE_PROMOTION;
  return MODE_RELEASE;
}

function resolveMode(value) {
  if (normalizeString(value)) return normalizeMode(value);
  if (parseBooleanish(process.env.promotionMode)
    || parseBooleanish(process.env.PROMOTION_MODE)
    || parseBooleanish(process.env.WAVE_PROMOTION_MODE)) {
    return MODE_PROMOTION;
  }
  return MODE_RELEASE;
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toRepoRelative(repoRoot, absPath) {
  return path.relative(repoRoot, absPath).replaceAll(path.sep, '/');
}

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map((entry) => stableSortObject(entry));
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

function collectFilesRecursive(absDir, out = []) {
  if (!fs.existsSync(absDir)) return out;
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const absPath = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      collectFilesRecursive(absPath, out);
      continue;
    }
    if (entry.isFile()) out.push(absPath);
  }
  return out;
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    json: false,
    mode: '',
    repoRoot: process.cwd(),
    canonPath: DEFAULT_CANON_PATH,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = normalizeString(argv[i]);
    if (!arg) continue;
    if (arg === '--json') {
      out.json = true;
      continue;
    }
    if (arg.startsWith('--mode=')) {
      out.mode = normalizeString(arg.slice('--mode='.length));
      continue;
    }
    if (arg === '--mode' && i + 1 < argv.length) {
      out.mode = normalizeString(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--repo-root=')) {
      out.repoRoot = normalizeString(arg.slice('--repo-root='.length)) || process.cwd();
      continue;
    }
    if (arg === '--repo-root' && i + 1 < argv.length) {
      out.repoRoot = normalizeString(argv[i + 1]) || process.cwd();
      i += 1;
      continue;
    }
    if (arg.startsWith('--canon-path=')) {
      out.canonPath = normalizeString(arg.slice('--canon-path='.length)) || DEFAULT_CANON_PATH;
      continue;
    }
    if (arg === '--canon-path' && i + 1 < argv.length) {
      out.canonPath = normalizeString(argv[i + 1]) || DEFAULT_CANON_PATH;
      i += 1;
    }
  }

  return out;
}

function readLawPathCanon(repoRoot, canonPath) {
  const canonAbsPath = path.resolve(repoRoot, canonPath);
  const issues = [];

  if (!fs.existsSync(canonAbsPath)) {
    issues.push({
      code: LAW_PATH_CANON_INVALID,
      message: `Missing LAW_PATH_CANON file: ${canonPath}`,
      filePath: canonPath,
    });
    return {
      ok: false,
      issues,
      canonAbsPath,
      lawDocPath: '',
      lawDocId: '',
      lawStatus: '',
    };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(canonAbsPath, 'utf8'));
  } catch (error) {
    issues.push({
      code: LAW_PATH_CANON_INVALID,
      message: `Cannot parse LAW_PATH_CANON JSON: ${error.message}`,
      filePath: canonPath,
    });
    return {
      ok: false,
      issues,
      canonAbsPath,
      lawDocPath: '',
      lawDocId: '',
      lawStatus: '',
    };
  }

  if (!isObjectRecord(parsed) || Number(parsed.version) !== 1) {
    issues.push({
      code: LAW_PATH_CANON_INVALID,
      message: 'LAW_PATH_CANON must be an object with version=1.',
      filePath: canonPath,
    });
  }

  const lawDocPath = normalizeString(parsed && parsed.lawDocPath);
  const lawDocId = normalizeString(parsed && parsed.lawDocId);
  const lawStatus = normalizeString(parsed && parsed.status);

  if (!lawDocPath || lawDocPath.includes('..') || path.isAbsolute(lawDocPath)) {
    issues.push({
      code: LAW_PATH_CANON_INVALID,
      message: 'LAW_PATH_CANON.lawDocPath must be a non-empty repo-relative path.',
      filePath: canonPath,
    });
  }
  if (lawDocId !== 'XPLAT_UNIFIED_MASTER_EXECUTION_CONTRACT') {
    issues.push({
      code: LAW_PATH_CANON_INVALID,
      message: 'LAW_PATH_CANON.lawDocId must match canonical LAW doc id.',
      filePath: canonPath,
    });
  }
  if (lawStatus !== 'ACTIVE_CANON') {
    issues.push({
      code: LAW_PATH_CANON_INVALID,
      message: 'LAW_PATH_CANON.status must be ACTIVE_CANON.',
      filePath: canonPath,
    });
  }

  return {
    ok: issues.length === 0,
    issues,
    canonAbsPath,
    lawDocPath,
    lawDocId,
    lawStatus,
  };
}

function isCompetingLawFile(repoRoot, relPath, expectedLawDocPath) {
  if (!relPath || relPath === expectedLawDocPath) return false;
  if (relPath.startsWith(ARCHIVE_PREFIX)) return false;
  const absPath = path.resolve(repoRoot, relPath);
  let text = '';
  try {
    text = fs.readFileSync(absPath, 'utf8');
  } catch {
    return true;
  }
  return /\bSTATUS:\s*ACTIVE_CANON\b/u.test(text);
}

export function evaluateLawPathCanonState(input = {}) {
  const repoRoot = path.resolve(normalizeString(input.repoRoot) || process.cwd());
  const mode = resolveMode(input.mode);
  const canonPath = normalizeString(input.canonPath) || DEFAULT_CANON_PATH;
  const lawPathCanon = readLawPathCanon(repoRoot, canonPath);
  const issues = [...lawPathCanon.issues];
  const lawDocPath = lawPathCanon.lawDocPath;
  const lawDocAbsPath = lawDocPath ? path.resolve(repoRoot, lawDocPath) : '';
  const lawDocFound = Boolean(lawDocAbsPath && fs.existsSync(lawDocAbsPath));

  if (lawPathCanon.ok) {
    if (!lawDocFound) {
      issues.push({
        code: LAW_PATH_CANON_INVALID,
        message: `LAW doc path does not exist: ${lawDocPath}`,
        filePath: lawDocPath,
      });
    } else {
      const basename = path.basename(lawDocAbsPath);
      if (!LAW_FILE_BASENAME_RE.test(basename)) {
        issues.push({
          code: LAW_PATH_CANON_INVALID,
          message: `LAW doc basename must start with ${LAW_FILE_BASENAME_PREFIX}`,
          filePath: lawDocPath,
        });
      }
    }
  }

  const competingLawPaths = [];
  if (lawPathCanon.ok && lawDocFound) {
    const statusDirAbsPath = path.resolve(repoRoot, STATUS_DIR);
    const candidates = collectFilesRecursive(statusDirAbsPath)
      .filter((absPath) => LAW_FILE_BASENAME_RE.test(path.basename(absPath)))
      .map((absPath) => toRepoRelative(repoRoot, absPath))
      .sort((a, b) => a.localeCompare(b));
    for (const candidate of candidates) {
      if (!isCompetingLawFile(repoRoot, candidate, lawDocPath)) continue;
      competingLawPaths.push(candidate);
    }
    if (competingLawPaths.length > 0) {
      issues.push({
        code: LAW_PATH_CANON_INVALID,
        message: 'Competing ACTIVE_CANON LAW files detected outside LAW_PATH_CANON allowlist.',
        filePath: canonPath,
        competingLawPaths,
      });
    }
  }

  const ok = issues.length === 0;
  const result = ok
    ? RESULT_PASS
    : (mode === MODE_PROMOTION ? RESULT_FAIL : RESULT_WARN);

  return {
    ok,
    mode,
    lawPathCanonPath: toRepoRelative(repoRoot, lawPathCanon.canonAbsPath || path.resolve(repoRoot, canonPath)),
    lawDocPath,
    lawDocFound,
    lawDocId: lawPathCanon.lawDocId,
    lawStatus: lawPathCanon.lawStatus,
    competingLawPaths,
    result,
    failSignalCode: ok ? '' : FAIL_SIGNAL_CODE,
    failReason: ok ? '' : String(issues[0]?.code || LAW_PATH_CANON_INVALID),
    issues,
  };
}

function printHuman(state) {
  process.stdout.write(`LAW_PATH_CANON_RESULT=${state.result}\n`);
  process.stdout.write(`LAW_PATH_CANON_MODE=${state.mode}\n`);
  process.stdout.write(`LAW_PATH_CANON_PATH=${state.lawPathCanonPath}\n`);
  process.stdout.write(`LAW_PATH_CANON_LAW_DOC_PATH=${state.lawDocPath}\n`);
  process.stdout.write(`LAW_PATH_CANON_LAW_DOC_FOUND=${state.lawDocFound ? 1 : 0}\n`);
  process.stdout.write(`LAW_PATH_CANON_COMPETING_COUNT=${state.competingLawPaths.length}\n`);
  if (state.failReason) process.stdout.write(`LAW_PATH_CANON_FAIL_REASON=${state.failReason}\n`);
  if (state.failSignalCode) process.stdout.write(`LAW_PATH_CANON_FAIL_SIGNAL=${state.failSignalCode}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateLawPathCanonState(args);
  if (args.json) {
    process.stdout.write(`${stableStringify(state)}\n`);
  } else {
    printHuman(state);
  }
  process.exit(state.result === RESULT_FAIL ? 1 : 0);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
