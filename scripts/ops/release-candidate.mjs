#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MODE_RELEASE = 'release';
const MODE_PROMOTION = 'promotion';
const RESULT_PASS = 'PASS';
const RESULT_WARN = 'WARN';
const RESULT_FAIL = 'FAIL';
const TOKEN_NAME = 'RELEASE_CANDIDATE_LOCK_MATCH_OK';
const FAIL_SIGNAL = 'E_RELEASE_CANDIDATE_DRIFT';
const TOOL_VERSION = 'release-candidate.v1';
const DEFAULT_MENU_SNAPSHOT_ID = 'menu-default-desktop-minimal';

const DEFAULT_LOCK_PATH = 'docs/OPS/STATUS/RELEASE_CANDIDATE_LOCK.json';
const DEFAULT_MENU_ARTIFACT_PATH = 'docs/OPS/ARTIFACTS/menu/menu.normalized.json';
const DEFAULT_MENU_SNAPSHOT_REGISTRY_PATH = 'docs/OPS/STATUS/MENU_SNAPSHOT_REGISTRY.json';
const DEFAULT_PERF_BASELINE_PATH = 'docs/OPS/PERF/PERF_LITE_BASELINE.json';
const DEFAULT_TOKEN_CATALOG_PATH = 'docs/OPS/TOKENS/TOKEN_CATALOG.json';
const DEFAULT_FAILSIGNAL_REGISTRY_PATH = 'docs/OPS/FAILSIGNALS/FAILSIGNAL_REGISTRY.json';
const DEFAULT_REQUIRED_TOKEN_SET_PATH = 'docs/OPS/EXECUTION/REQUIRED_TOKEN_SET.json';
const DEFAULT_EVIDENCE_ROOT = 'docs/OPS/EVIDENCE/promotion';
const SHA256_HEX_RE = /^[0-9a-f]{64}$/u;

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeMode(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === MODE_PROMOTION) return MODE_PROMOTION;
  return MODE_RELEASE;
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSha256Hex(value) {
  return SHA256_HEX_RE.test(normalizeString(value).toLowerCase());
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

function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readJsonObject(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return isObjectRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function resolveRepoRoot(inputPath) {
  const candidate = normalizeString(inputPath);
  return path.resolve(candidate || process.cwd());
}

function resolvePath(repoRoot, relOrAbsPath) {
  const candidate = normalizeString(relOrAbsPath);
  if (!candidate) return path.resolve(repoRoot);
  if (path.isAbsolute(candidate)) return path.resolve(candidate);
  return path.resolve(repoRoot, candidate);
}

function toRepoRelative(repoRoot, absPath) {
  return path.relative(repoRoot, absPath).replaceAll(path.sep, '/');
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    json: false,
    create: false,
    verify: false,
    mode: MODE_RELEASE,
    repoRoot: '',
    lockPath: DEFAULT_LOCK_PATH,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = normalizeString(argv[i]);
    if (!arg) continue;

    if (arg === '--json') {
      out.json = true;
      continue;
    }
    if (arg === '--create') {
      out.create = true;
      continue;
    }
    if (arg === '--verify') {
      out.verify = true;
      continue;
    }
    if (arg.startsWith('--mode=')) {
      out.mode = normalizeMode(arg.slice('--mode='.length));
      continue;
    }
    if (arg === '--mode' && i + 1 < argv.length) {
      out.mode = normalizeMode(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--repo-root=')) {
      out.repoRoot = normalizeString(arg.slice('--repo-root='.length));
      continue;
    }
    if (arg === '--repo-root' && i + 1 < argv.length) {
      out.repoRoot = normalizeString(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--lock-path=')) {
      out.lockPath = normalizeString(arg.slice('--lock-path='.length)) || DEFAULT_LOCK_PATH;
      continue;
    }
    if (arg === '--lock-path' && i + 1 < argv.length) {
      out.lockPath = normalizeString(argv[i + 1]) || DEFAULT_LOCK_PATH;
      i += 1;
    }
  }

  return out;
}

function readSnapshotHash(snapshotRegistryPath, preferredSnapshotId = '') {
  const registryDoc = readJsonObject(snapshotRegistryPath);
  if (!registryDoc || !Array.isArray(registryDoc.snapshots)) {
    return {
      ok: false,
      snapshotId: '',
      menuSnapshotHash: '',
      error: 'MENU_SNAPSHOT_REGISTRY_INVALID',
    };
  }

  const preferred = normalizeString(preferredSnapshotId) || DEFAULT_MENU_SNAPSHOT_ID;
  const row = registryDoc.snapshots.find((item) => item && String(item.id || '').trim() === preferred)
    || registryDoc.snapshots[0]
    || null;
  if (!row) {
    return {
      ok: false,
      snapshotId: '',
      menuSnapshotHash: '',
      error: 'MENU_SNAPSHOT_ENTRY_MISSING',
    };
  }

  const snapshotId = normalizeString(row.id);
  const snapshotHash = normalizeString(row.normalizedHashSha256).toLowerCase();
  if (!snapshotId || !isSha256Hex(snapshotHash)) {
    return {
      ok: false,
      snapshotId,
      menuSnapshotHash: '',
      error: 'MENU_SNAPSHOT_ENTRY_INVALID',
    };
  }

  return {
    ok: true,
    snapshotId,
    menuSnapshotHash: snapshotHash,
    error: '',
  };
}

function collectObservedState(repoRoot) {
  const menuArtifactPath = resolvePath(repoRoot, DEFAULT_MENU_ARTIFACT_PATH);
  const menuSnapshotRegistryPath = resolvePath(repoRoot, DEFAULT_MENU_SNAPSHOT_REGISTRY_PATH);
  const perfBaselinePath = resolvePath(repoRoot, DEFAULT_PERF_BASELINE_PATH);
  const tokenCatalogPath = resolvePath(repoRoot, DEFAULT_TOKEN_CATALOG_PATH);
  const failsignalRegistryPath = resolvePath(repoRoot, DEFAULT_FAILSIGNAL_REGISTRY_PATH);
  const requiredTokenSetPath = resolvePath(repoRoot, DEFAULT_REQUIRED_TOKEN_SET_PATH);
  const errors = [];

  const requiredFiles = [
    ['menuArtifactPath', menuArtifactPath],
    ['menuSnapshotRegistryPath', menuSnapshotRegistryPath],
    ['perfBaselinePath', perfBaselinePath],
    ['tokenCatalogPath', tokenCatalogPath],
    ['failsignalRegistryPath', failsignalRegistryPath],
    ['requiredTokenSetPath', requiredTokenSetPath],
  ];

  for (const [field, filePath] of requiredFiles) {
    if (!fs.existsSync(filePath)) {
      errors.push(`${field}:FILE_MISSING`);
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      hashes: null,
      paths: {
        menuArtifactPath,
        menuSnapshotRegistryPath,
        perfBaselinePath,
        tokenCatalogPath,
        failsignalRegistryPath,
        requiredTokenSetPath,
      },
    };
  }

  const artifactDoc = readJsonObject(menuArtifactPath);
  const preferredSnapshotId = artifactDoc ? normalizeString(artifactDoc.snapshotId) : '';
  const snapshotState = readSnapshotHash(menuSnapshotRegistryPath, preferredSnapshotId);
  if (!snapshotState.ok) {
    return {
      ok: false,
      errors: [snapshotState.error],
      hashes: null,
      paths: {
        menuArtifactPath,
        menuSnapshotRegistryPath,
        perfBaselinePath,
        tokenCatalogPath,
        failsignalRegistryPath,
        requiredTokenSetPath,
      },
    };
  }

  const hashes = {
    menuArtifactHash: sha256File(menuArtifactPath),
    menuSnapshotHash: snapshotState.menuSnapshotHash,
    perfBaselineHash: sha256File(perfBaselinePath),
    tokenCatalogHash: sha256File(tokenCatalogPath),
    failsignalRegistryHash: sha256File(failsignalRegistryPath),
    requiredTokenSetHash: sha256File(requiredTokenSetPath),
  };

  return {
    ok: true,
    errors: [],
    hashes,
    paths: {
      menuArtifactPath,
      menuSnapshotRegistryPath,
      perfBaselinePath,
      tokenCatalogPath,
      failsignalRegistryPath,
      requiredTokenSetPath,
    },
    snapshotId: snapshotState.snapshotId,
  };
}

function resolveHeadSha(repoRoot) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_OPTIONAL_LOCKS: '0',
    },
  });
  if (result.status !== 0) return '';
  const sha = normalizeString(result.stdout);
  return /^[0-9a-f]{40}$/u.test(sha) ? sha : '';
}

function buildRcId(baseCommitSha, menuArtifactHash) {
  const shaPart = baseCommitSha ? baseCommitSha.slice(0, 12) : 'unknown';
  const hashPart = menuArtifactHash ? menuArtifactHash.slice(0, 8) : '00000000';
  return `rc-${shaPart}-${hashPart}`;
}

function buildReleaseCandidateLock(mode, observed, baseCommitSha, existingLock = null) {
  const rcId = buildRcId(baseCommitSha, observed.hashes.menuArtifactHash);
  const createdAt = isObjectRecord(existingLock)
    && normalizeString(existingLock.rcId) === rcId
    && normalizeString(existingLock.baseCommitSha) === baseCommitSha
    && Number.isFinite(Date.parse(String(existingLock.createdAt || '')))
    ? new Date(existingLock.createdAt).toISOString()
    : new Date().toISOString();

  return {
    rcId,
    baseCommitSha,
    menuArtifactHash: observed.hashes.menuArtifactHash,
    menuSnapshotHash: observed.hashes.menuSnapshotHash,
    perfBaselineHash: observed.hashes.perfBaselineHash,
    tokenCatalogHash: observed.hashes.tokenCatalogHash,
    failsignalRegistryHash: observed.hashes.failsignalRegistryHash,
    requiredTokenSetHash: observed.hashes.requiredTokenSetHash,
    createdAt,
    createdByMode: normalizeMode(mode),
  };
}

function validateLockDoc(lockDoc) {
  const issues = [];
  if (!isObjectRecord(lockDoc)) {
    issues.push('LOCK_DOC_INVALID');
    return issues;
  }

  const requiredStringFields = [
    'rcId',
    'baseCommitSha',
    'createdAt',
    'createdByMode',
  ];
  for (const field of requiredStringFields) {
    if (!normalizeString(lockDoc[field])) {
      issues.push(`${field.toUpperCase()}_MISSING`);
    }
  }

  if (!Number.isFinite(Date.parse(String(lockDoc.createdAt || '')))) {
    issues.push('CREATED_AT_INVALID');
  }

  if (normalizeMode(lockDoc.createdByMode) !== normalizeString(lockDoc.createdByMode).toLowerCase()) {
    issues.push('CREATED_BY_MODE_INVALID');
  }

  const hashFields = [
    'menuArtifactHash',
    'menuSnapshotHash',
    'perfBaselineHash',
    'tokenCatalogHash',
    'failsignalRegistryHash',
    'requiredTokenSetHash',
  ];
  for (const field of hashFields) {
    if (!isSha256Hex(lockDoc[field])) {
      issues.push(`${field.toUpperCase()}_INVALID`);
    }
  }

  return issues;
}

function resolveVerifyOutcome(mode, mismatchDetected) {
  if (!mismatchDetected) {
    return {
      result: RESULT_PASS,
      ok: true,
      exitCode: 0,
      failSignalCode: '',
    };
  }
  if (mode === MODE_PROMOTION) {
    return {
      result: RESULT_FAIL,
      ok: false,
      exitCode: 1,
      failSignalCode: FAIL_SIGNAL,
    };
  }
  return {
    result: RESULT_WARN,
    ok: true,
    exitCode: 0,
    failSignalCode: FAIL_SIGNAL,
  };
}

function writeTextDeterministic(filePath, content, keepExisting = false) {
  if (keepExisting && fs.existsSync(filePath)) return 0;
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf8');
    if (existing === content) return 0;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return 1;
}

function ensureDoctorLog(repoRoot, outputPath) {
  if (fs.existsSync(outputPath)) return;
  const doctorScriptPath = resolvePath(repoRoot, 'scripts/doctor.mjs');
  if (!fs.existsSync(doctorScriptPath)) {
    writeTextDeterministic(outputPath, 'DOCTOR_STRICT_SKIPPED_MISSING_SCRIPT=1\n', true);
    return;
  }

  const result = spawnSync(process.execPath, ['scripts/doctor.mjs', '--strict'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');
  const combined = `${stdout}${stderr ? `\n${stderr}` : ''}`;
  if (result.status !== 0) {
    throw new Error(`DOCTOR_STRICT_FAILED:${result.status}`);
  }
  writeTextDeterministic(outputPath, combined.endsWith('\n') ? combined : `${combined}\n`, true);
}

function sanitizeRcIdForPath(rcId) {
  const normalized = normalizeString(rcId).replace(/[^a-zA-Z0-9._-]/gu, '-');
  return normalized || 'rc-unknown';
}

function generatePromotionEvidencePack({ repoRoot, lockDoc, lockPath, observed }) {
  const safeRcId = sanitizeRcIdForPath(lockDoc.rcId);
  const evidenceRoot = resolvePath(repoRoot, DEFAULT_EVIDENCE_ROOT);
  const evidenceDir = path.join(evidenceRoot, safeRcId);
  fs.mkdirSync(evidenceDir, { recursive: true });

  const releaseCandidateLockSha256 = sha256File(lockPath);
  const promotionSummaryPath = path.join(evidenceDir, 'promotion-summary.json');
  const menuArtifactHashPath = path.join(evidenceDir, 'menuArtifactHash.txt');
  const perfBaselineSnapshotPath = path.join(evidenceDir, 'perfBaseline.json');
  const doctorLogPath = path.join(evidenceDir, 'doctor-strict.log');
  const heavyLaneSummaryPath = path.join(evidenceDir, 'heavy-lane-summary.json');
  const requiredSetSnapshotPath = path.join(evidenceDir, 'token-required-set.json');
  const failsignalSnapshotPath = path.join(evidenceDir, 'failsignal-registry-snapshot.json');

  const promotionSummary = {
    schemaVersion: 1,
    toolVersion: TOOL_VERSION,
    rcId: lockDoc.rcId,
    baseCommitSha: lockDoc.baseCommitSha,
    createdAt: lockDoc.createdAt,
    createdByMode: lockDoc.createdByMode,
    mode: MODE_PROMOTION,
    releaseCandidateLockPath: toRepoRelative(repoRoot, lockPath),
    releaseCandidateLockSha256,
    releaseCandidateLockMatch: true,
    hashes: {
      menuArtifactHash: lockDoc.menuArtifactHash,
      menuSnapshotHash: lockDoc.menuSnapshotHash,
      perfBaselineHash: lockDoc.perfBaselineHash,
      tokenCatalogHash: lockDoc.tokenCatalogHash,
      failsignalRegistryHash: lockDoc.failsignalRegistryHash,
      requiredTokenSetHash: lockDoc.requiredTokenSetHash,
    },
  };

  const heavyLaneSummary = {
    schemaVersion: 1,
    toolVersion: TOOL_VERSION,
    mode: MODE_PROMOTION,
    result: RESULT_PASS,
    token: {
      [TOKEN_NAME]: 1,
    },
    failSignalCode: '',
    releaseCandidate: {
      rcId: lockDoc.rcId,
      match: true,
      menuSnapshotId: observed.snapshotId,
    },
  };

  writeTextDeterministic(promotionSummaryPath, `${stableStringify(promotionSummary)}\n`);
  writeTextDeterministic(menuArtifactHashPath, `${lockDoc.menuArtifactHash}\n`);
  writeTextDeterministic(perfBaselineSnapshotPath, fs.readFileSync(observed.paths.perfBaselinePath, 'utf8'));
  writeTextDeterministic(heavyLaneSummaryPath, `${stableStringify(heavyLaneSummary)}\n`);
  writeTextDeterministic(requiredSetSnapshotPath, fs.readFileSync(observed.paths.requiredTokenSetPath, 'utf8'));
  writeTextDeterministic(failsignalSnapshotPath, fs.readFileSync(observed.paths.failsignalRegistryPath, 'utf8'));
  ensureDoctorLog(repoRoot, doctorLogPath);

  return {
    evidenceDir,
    files: [
      promotionSummaryPath,
      menuArtifactHashPath,
      perfBaselineSnapshotPath,
      doctorLogPath,
      heavyLaneSummaryPath,
      requiredSetSnapshotPath,
      failsignalSnapshotPath,
    ],
  };
}

function runCreate({ mode, repoRoot, lockPath }) {
  const observed = collectObservedState(repoRoot);
  if (!observed.ok) {
    return {
      operation: 'create',
      mode,
      result: RESULT_FAIL,
      ok: false,
      exitCode: 1,
      failReason: observed.errors.join(','),
      failSignalCode: FAIL_SIGNAL,
      lockPath,
      token: {
        [TOKEN_NAME]: 0,
      },
    };
  }

  const existingLock = readJsonObject(lockPath);
  const baseCommitSha = resolveHeadSha(repoRoot) || 'unknown';
  const lockDoc = buildReleaseCandidateLock(mode, observed, baseCommitSha, existingLock);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, `${JSON.stringify(lockDoc, null, 2)}\n`, 'utf8');

  return {
    operation: 'create',
    mode,
    result: RESULT_PASS,
    ok: true,
    exitCode: 0,
    failReason: '',
    failSignalCode: '',
    lockPath,
    lock: lockDoc,
    token: {
      [TOKEN_NAME]: 1,
    },
  };
}

function runVerify({ mode, repoRoot, lockPath }) {
  const mismatches = [];
  const lockDoc = readJsonObject(lockPath);
  if (!lockDoc) {
    mismatches.push({
      code: 'LOCK_MISSING',
      field: 'lockPath',
      expected: toRepoRelative(repoRoot, lockPath),
      actual: '',
    });
  }

  if (lockDoc) {
    const lockIssues = validateLockDoc(lockDoc);
    for (const issue of lockIssues) {
      mismatches.push({
        code: issue,
        field: 'lock',
        expected: 'valid',
        actual: 'invalid',
      });
    }
  }

  const observed = collectObservedState(repoRoot);
  if (!observed.ok) {
    for (const error of observed.errors) {
      mismatches.push({
        code: error,
        field: 'observedState',
        expected: 'present',
        actual: 'missing_or_invalid',
      });
    }
  }

  if (lockDoc && observed.ok) {
    const expectedByField = {
      menuArtifactHash: lockDoc.menuArtifactHash,
      menuSnapshotHash: lockDoc.menuSnapshotHash,
      perfBaselineHash: lockDoc.perfBaselineHash,
      tokenCatalogHash: lockDoc.tokenCatalogHash,
      failsignalRegistryHash: lockDoc.failsignalRegistryHash,
      requiredTokenSetHash: lockDoc.requiredTokenSetHash,
    };
    for (const [field, expected] of Object.entries(expectedByField)) {
      const expectedNormalized = normalizeString(expected).toLowerCase();
      const actual = observed.hashes[field];
      if (!expectedNormalized || !actual || expectedNormalized !== actual) {
        mismatches.push({
          code: 'HASH_MISMATCH',
          field,
          expected: expectedNormalized,
          actual: actual || '',
        });
      }
    }

    const headSha = resolveHeadSha(repoRoot);
    if (headSha && normalizeString(lockDoc.baseCommitSha) && headSha !== normalizeString(lockDoc.baseCommitSha)) {
      mismatches.push({
        code: 'BASE_COMMIT_SHA_MISMATCH',
        field: 'baseCommitSha',
        expected: normalizeString(lockDoc.baseCommitSha),
        actual: headSha,
      });
    }
  }

  const mismatchDetected = mismatches.length > 0;
  const outcome = resolveVerifyOutcome(mode, mismatchDetected);
  const payload = {
    operation: 'verify',
    mode,
    result: outcome.result,
    ok: outcome.ok,
    exitCode: outcome.exitCode,
    failSignalCode: outcome.failSignalCode,
    failReason: mismatchDetected ? FAIL_SIGNAL : '',
    token: {
      [TOKEN_NAME]: mismatchDetected ? 0 : 1,
    },
    lockPath,
    rcId: normalizeString(lockDoc && lockDoc.rcId),
    mismatches,
  };

  if (!mismatchDetected && mode === MODE_PROMOTION && lockDoc && observed.ok) {
    const evidence = generatePromotionEvidencePack({
      repoRoot,
      lockDoc,
      lockPath,
      observed,
    });
    payload.evidencePackPath = toRepoRelative(repoRoot, evidence.evidenceDir);
    payload.evidenceFiles = evidence.files.map((filePath) => toRepoRelative(repoRoot, filePath));
  }

  return payload;
}

function printHuman(state) {
  console.log(`RELEASE_CANDIDATE_OPERATION=${state.operation}`);
  console.log(`RELEASE_CANDIDATE_MODE=${state.mode}`);
  console.log(`RELEASE_CANDIDATE_RESULT=${state.result}`);
  console.log(`${TOKEN_NAME}=${state.token && state.token[TOKEN_NAME] === 1 ? 1 : 0}`);
  console.log(`RELEASE_CANDIDATE_LOCK_PATH=${state.lockPath || ''}`);
  if (state.rcId) console.log(`RELEASE_CANDIDATE_ID=${state.rcId}`);
  if (state.failSignalCode) console.log(`RELEASE_CANDIDATE_FAIL_SIGNAL=${state.failSignalCode}`);
  if (Array.isArray(state.mismatches) && state.mismatches.length > 0) {
    console.log(`RELEASE_CANDIDATE_MISMATCHES=${JSON.stringify(state.mismatches)}`);
  }
  if (state.evidencePackPath) {
    console.log(`PROMOTION_EVIDENCE_PACK_PATH=${state.evidencePackPath}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = normalizeMode(args.mode);
  const repoRoot = resolveRepoRoot(args.repoRoot);
  const lockPath = resolvePath(repoRoot, args.lockPath || DEFAULT_LOCK_PATH);

  if ((args.create && args.verify) || (!args.create && !args.verify)) {
    const usage = {
      operation: '',
      mode,
      result: RESULT_FAIL,
      ok: false,
      exitCode: 1,
      failReason: 'USAGE',
      failSignalCode: '',
      token: {
        [TOKEN_NAME]: 0,
      },
      usage: 'node scripts/ops/release-candidate.mjs (--create|--verify) [--mode release|promotion] [--repo-root <path>] [--lock-path <path>] [--json]',
    };
    if (args.json) process.stdout.write(`${JSON.stringify(usage, null, 2)}\n`);
    else printHuman(usage);
    process.exit(1);
  }

  let state;
  try {
    state = args.create
      ? runCreate({ mode, repoRoot, lockPath })
      : runVerify({ mode, repoRoot, lockPath });
  } catch (error) {
    state = {
      operation: args.create ? 'create' : 'verify',
      mode,
      result: RESULT_FAIL,
      ok: false,
      exitCode: 1,
      failReason: error instanceof Error ? error.message : String(error),
      failSignalCode: FAIL_SIGNAL,
      token: {
        [TOKEN_NAME]: 0,
      },
      lockPath,
    };
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printHuman(state);
  }
  process.exit(Number.isInteger(state.exitCode) ? state.exitCode : (state.ok ? 0 : 1));
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
