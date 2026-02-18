const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');

const MODE_RELEASE = 'release';
const MODE_PROMOTION = 'promotion';
const RESULT_PASS = 'PASS';
const RESULT_WARN = 'WARN';
const RESULT_FAIL = 'FAIL';
const FAIL_SIGNAL_MENU_ARTIFACT = 'E_MENU_ARTIFACT_TAMPER_OR_DRIFT';
const HASH_METHOD_RAW_BYTES = 'sha256(raw-file-bytes)';

const REPO_ROOT = path.join(__dirname, '..', '..');
const DEFAULT_ARTIFACT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'ARTIFACTS', 'menu', 'menu.normalized.json');
const DEFAULT_LOCK_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'LOCKS', 'MENU_ARTIFACT_LOCK.json');
const DEFAULT_VERIFY_CANON_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'MENU_ARTIFACT_VERIFY_CANON.json');

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

function resolveModeFromInput(inputMode, env = process.env) {
  if (normalizeString(inputMode)) return normalizeMode(inputMode);
  if (parseBooleanish(env.promotionMode)
    || parseBooleanish(env.PROMOTION_MODE)
    || parseBooleanish(env.WAVE_PROMOTION_MODE)) {
    return MODE_PROMOTION;
  }
  return MODE_RELEASE;
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSha256Hex(value) {
  return /^[0-9a-f]{64}$/u.test(normalizeString(value).toLowerCase());
}

function readJsonSafe(filePath) {
  try {
    return {
      ok: true,
      value: JSON.parse(fs.readFileSync(filePath, 'utf8')),
      error: '',
    };
  } catch (error) {
    return {
      ok: false,
      value: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function hashFileSha256(filePath) {
  const data = fs.readFileSync(filePath);
  return createHash('sha256').update(data).digest('hex');
}

function normalizeRelativePath(filePath) {
  const normalized = String(filePath || '').trim().replaceAll('\\', '/');
  if (!normalized) return '';
  if (path.isAbsolute(normalized)) return '';
  if (normalized.split('/').some((segment) => segment.length === 0 || segment === '..')) return '';
  return normalized;
}

function toRepoRelativePath(filePath, repoRoot = REPO_ROOT) {
  const rel = path.relative(path.resolve(repoRoot), path.resolve(filePath)).replaceAll(path.sep, '/');
  return normalizeRelativePath(rel);
}

function resolvePath(inputPath, fallbackPath) {
  const raw = normalizeString(inputPath);
  if (!raw) return path.resolve(fallbackPath);
  if (path.isAbsolute(raw)) return path.resolve(raw);
  return path.resolve(raw);
}

function validateVerifyCanon(doc, issues) {
  if (!isObjectRecord(doc)) {
    issues.push({ code: 'VERIFY_CANON_INVALID', message: 'MENU_ARTIFACT_VERIFY_CANON.json must be an object.' });
    return;
  }
  if (Number(doc.schemaVersion) !== 1) {
    issues.push({ code: 'VERIFY_CANON_SCHEMA_INVALID', message: 'MENU_ARTIFACT_VERIFY_CANON.schemaVersion must be 1.' });
  }
  if (normalizeString(doc.hashMethod) !== HASH_METHOD_RAW_BYTES) {
    issues.push({ code: 'VERIFY_CANON_HASH_METHOD_INVALID', message: `hashMethod must be ${HASH_METHOD_RAW_BYTES}.` });
  }
}

function validateArtifact(doc, issues) {
  if (!isObjectRecord(doc)) {
    issues.push({ code: 'ARTIFACT_INVALID', message: 'menu artifact must be an object.' });
    return;
  }

  if (Number(doc.schemaVersion) !== 1) {
    issues.push({ code: 'ARTIFACT_SCHEMA_INVALID', message: 'menu artifact schemaVersion must be 1.' });
  }
  if (!normalizeString(doc.snapshotId)) {
    issues.push({ code: 'ARTIFACT_SNAPSHOT_ID_MISSING', message: 'menu artifact snapshotId is required.' });
  }
  if (!isSha256Hex(doc.normalizedHashSha256)) {
    issues.push({ code: 'ARTIFACT_HASH_INVALID', message: 'menu artifact normalizedHashSha256 must be sha256 hex.' });
  }
  if (!normalizeString(doc.generatedAt)) {
    issues.push({ code: 'ARTIFACT_GENERATED_AT_MISSING', message: 'menu artifact generatedAt is required.' });
  }
  if (!normalizeString(doc.generatedFromCommit)) {
    issues.push({ code: 'ARTIFACT_COMMIT_MISSING', message: 'menu artifact generatedFromCommit is required.' });
  }
  if (!isObjectRecord(doc.context)) {
    issues.push({ code: 'ARTIFACT_CONTEXT_INVALID', message: 'menu artifact context must be an object.' });
  }
  if (!Array.isArray(doc.commands)) {
    issues.push({ code: 'ARTIFACT_COMMANDS_INVALID', message: 'menu artifact commands must be an array.' });
  }
  if (!Array.isArray(doc.menus)) {
    issues.push({ code: 'ARTIFACT_MENUS_INVALID', message: 'menu artifact menus must be an array.' });
  }
  if (!Array.isArray(doc.sourceRefs)) {
    issues.push({ code: 'ARTIFACT_SOURCE_REFS_INVALID', message: 'menu artifact sourceRefs must be an array.' });
  }
}

function validateLock(doc, issues) {
  if (!isObjectRecord(doc)) {
    issues.push({ code: 'LOCK_INVALID', message: 'menu lock must be an object.' });
    return;
  }

  if (Number(doc.schemaVersion) !== 1) {
    issues.push({ code: 'LOCK_SCHEMA_INVALID', message: 'menu lock schemaVersion must be 1.' });
  }
  if (!normalizeRelativePath(doc.artifactPath)) {
    issues.push({ code: 'LOCK_ARTIFACT_PATH_INVALID', message: 'menu lock artifactPath must be valid repo-relative path.' });
  }
  if (!isSha256Hex(doc.normalizedHashSha256)) {
    issues.push({ code: 'LOCK_NORMALIZED_HASH_INVALID', message: 'menu lock normalizedHashSha256 must be sha256 hex.' });
  }
  if (!isSha256Hex(doc.artifactBytesSha256)) {
    issues.push({ code: 'LOCK_ARTIFACT_BYTES_HASH_INVALID', message: 'menu lock artifactBytesSha256 must be sha256 hex.' });
  }
  if (!normalizeString(doc.snapshotId)) {
    issues.push({ code: 'LOCK_SNAPSHOT_ID_MISSING', message: 'menu lock snapshotId is required.' });
  }
  if (!normalizeString(doc.lockedAt)) {
    issues.push({ code: 'LOCK_LOCKED_AT_MISSING', message: 'menu lock lockedAt is required.' });
  }
  if (!normalizeString(doc.lockedFromCommit)) {
    issues.push({ code: 'LOCK_COMMIT_MISSING', message: 'menu lock lockedFromCommit is required.' });
  }
  if (normalizeString(doc.hashMethod) !== HASH_METHOD_RAW_BYTES) {
    issues.push({ code: 'LOCK_HASH_METHOD_INVALID', message: `menu lock hashMethod must be ${HASH_METHOD_RAW_BYTES}.` });
  }
}

function evaluateMismatchResult(mode, hasMismatch) {
  if (!hasMismatch) {
    return {
      result: RESULT_PASS,
      ok: true,
      failSignalCode: '',
      exitCode: 0,
    };
  }

  if (mode === MODE_PROMOTION) {
    return {
      result: RESULT_FAIL,
      ok: false,
      failSignalCode: FAIL_SIGNAL_MENU_ARTIFACT,
      exitCode: 1,
    };
  }

  return {
    result: RESULT_WARN,
    ok: true,
    failSignalCode: FAIL_SIGNAL_MENU_ARTIFACT,
    exitCode: 0,
  };
}

function evaluateMenuArtifactLockState(input = {}) {
  const mode = resolveModeFromInput(input.mode, input.env || process.env);
  const artifactPath = resolvePath(input.artifactPath, DEFAULT_ARTIFACT_PATH);
  const lockPath = resolvePath(input.lockPath, DEFAULT_LOCK_PATH);
  const verifyCanonPath = resolvePath(input.verifyCanonPath, DEFAULT_VERIFY_CANON_PATH);
  const expectedSnapshotId = normalizeString(input.expectedSnapshotId);

  const issues = [];
  let artifactDoc = null;
  let lockDoc = null;
  let actualArtifactBytesSha256 = '';

  const verifyCanonState = readJsonSafe(verifyCanonPath);
  if (!verifyCanonState.ok) {
    issues.push({ code: 'VERIFY_CANON_UNREADABLE', message: `Cannot read verify canon: ${verifyCanonState.error}` });
  } else {
    validateVerifyCanon(verifyCanonState.value, issues);
  }

  if (!fs.existsSync(artifactPath)) {
    issues.push({ code: 'ARTIFACT_MISSING', message: `Menu artifact is missing: ${artifactPath}` });
  } else {
    const artifactState = readJsonSafe(artifactPath);
    if (!artifactState.ok) {
      issues.push({ code: 'ARTIFACT_UNREADABLE', message: `Cannot read menu artifact: ${artifactState.error}` });
    } else {
      artifactDoc = artifactState.value;
      validateArtifact(artifactDoc, issues);
      try {
        actualArtifactBytesSha256 = hashFileSha256(artifactPath);
      } catch (error) {
        issues.push({ code: 'ARTIFACT_HASH_READ_FAILED', message: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  if (!fs.existsSync(lockPath)) {
    issues.push({ code: 'LOCK_MISSING', message: `Menu artifact lock is missing: ${lockPath}` });
  } else {
    const lockState = readJsonSafe(lockPath);
    if (!lockState.ok) {
      issues.push({ code: 'LOCK_UNREADABLE', message: `Cannot read menu lock: ${lockState.error}` });
    } else {
      lockDoc = lockState.value;
      validateLock(lockDoc, issues);
    }
  }

  const expectedHash = lockDoc && isSha256Hex(lockDoc.normalizedHashSha256)
    ? normalizeString(lockDoc.normalizedHashSha256).toLowerCase()
    : '';
  const actualHash = artifactDoc && isSha256Hex(artifactDoc.normalizedHashSha256)
    ? normalizeString(artifactDoc.normalizedHashSha256).toLowerCase()
    : '';

  const expectedArtifactBytesSha256 = lockDoc && isSha256Hex(lockDoc.artifactBytesSha256)
    ? normalizeString(lockDoc.artifactBytesSha256).toLowerCase()
    : '';

  if (artifactDoc && lockDoc) {
    if (expectedHash && actualHash && expectedHash !== actualHash) {
      issues.push({ code: 'NORMALIZED_HASH_MISMATCH', message: 'normalizedHashSha256 differs between artifact and lock.' });
    }
    if (expectedArtifactBytesSha256 && actualArtifactBytesSha256 && expectedArtifactBytesSha256 !== actualArtifactBytesSha256) {
      issues.push({ code: 'ARTIFACT_BYTES_HASH_MISMATCH', message: 'artifact bytes hash differs from lock.' });
    }

    const lockSnapshotId = normalizeString(lockDoc.snapshotId);
    const artifactSnapshotId = normalizeString(artifactDoc.snapshotId);
    if (lockSnapshotId && artifactSnapshotId && lockSnapshotId !== artifactSnapshotId) {
      issues.push({ code: 'SNAPSHOT_ID_MISMATCH', message: 'snapshotId differs between artifact and lock.' });
    }
    if (expectedSnapshotId && artifactSnapshotId && expectedSnapshotId !== artifactSnapshotId) {
      issues.push({ code: 'EXPECTED_SNAPSHOT_ID_MISMATCH', message: 'artifact snapshotId differs from expected snapshotId.' });
    }

    const lockedArtifactPath = normalizeRelativePath(lockDoc.artifactPath);
    if (lockedArtifactPath) {
      const resolvedLockedArtifactPath = path.resolve(REPO_ROOT, lockedArtifactPath);
      if (path.resolve(artifactPath) !== resolvedLockedArtifactPath) {
        issues.push({ code: 'LOCK_ARTIFACT_PATH_MISMATCH', message: 'lock.artifactPath points to a different artifact path.' });
      }
    }
  }

  const mismatch = issues.length > 0;
  const outcome = evaluateMismatchResult(mode, mismatch);

  return {
    ok: outcome.ok,
    mode,
    mismatch,
    result: outcome.result,
    exitCode: outcome.exitCode,
    failSignalCode: outcome.failSignalCode,
    expectedHash,
    actualHash,
    expectedArtifactBytesSha256,
    actualArtifactBytesSha256,
    snapshotId: normalizeString(artifactDoc && artifactDoc.snapshotId),
    lockSnapshotId: normalizeString(lockDoc && lockDoc.snapshotId),
    artifactPath,
    lockPath,
    verifyCanonPath,
    issues,
  };
}

function buildMenuArtifactLockDocument(input = {}) {
  const repoRoot = path.resolve(input.repoRoot || REPO_ROOT);
  const artifactPath = path.resolve(String(input.artifactPath || DEFAULT_ARTIFACT_PATH));
  const normalizedHashSha256 = normalizeString(input.normalizedHashSha256).toLowerCase();
  const snapshotId = normalizeString(input.snapshotId);
  const lockedAt = normalizeString(input.lockedAt) || new Date().toISOString();
  const lockedFromCommit = normalizeString(input.lockedFromCommit);
  const artifactBytesSha256 = normalizeString(input.artifactBytesSha256).toLowerCase();

  return {
    schemaVersion: 1,
    artifactPath: toRepoRelativePath(artifactPath, repoRoot),
    normalizedHashSha256,
    artifactBytesSha256,
    snapshotId,
    hashMethod: HASH_METHOD_RAW_BYTES,
    lockedAt,
    lockedFromCommit,
  };
}

module.exports = {
  DEFAULT_ARTIFACT_PATH,
  DEFAULT_LOCK_PATH,
  DEFAULT_VERIFY_CANON_PATH,
  FAIL_SIGNAL_MENU_ARTIFACT,
  HASH_METHOD_RAW_BYTES,
  MODE_PROMOTION,
  MODE_RELEASE,
  RESULT_FAIL,
  RESULT_PASS,
  RESULT_WARN,
  buildMenuArtifactLockDocument,
  evaluateMenuArtifactLockState,
  hashFileSha256,
  resolveModeFromInput,
  toRepoRelativePath,
};
