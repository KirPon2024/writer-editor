import crypto from 'node:crypto';
import fsPromises from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

export const BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_FEATURE_FLAG = 'yalken.blackBox.darwinDurablePublisher.p0bV1';

export const BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS = Object.freeze({
  artifact: 'yalken.blackBoxDarwinDurablePublisher.artifact.v1',
  featureFlag: 'yalken.blackBoxDarwinDurablePublisher.featureFlag.v1',
  receipt: 'yalken.blackBoxDarwinDurablePublisher.receipt.v1',
  request: 'yalken.blackBoxDarwinDurablePublisher.request.v1',
  sourceBinding: 'yalken.blackBoxDarwinDurablePublisher.sourceBinding.v1',
  target: 'yalken.blackBoxDarwinDurablePublisher.target.v1',
});

export const BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES = Object.freeze({
  ARTIFACT_DIGEST_MISMATCH: 'YALKEN_BLACK_BOX_P0B_ARTIFACT_DIGEST_MISMATCH',
  ARTIFACT_PUBLISHED: 'YALKEN_BLACK_BOX_P0B_ARTIFACT_PUBLISHED',
  DIRECTORY_SYNC_FAILED: 'YALKEN_BLACK_BOX_P0B_DIRECTORY_SYNC_FAILED',
  FEATURE_DISABLED: 'YALKEN_BLACK_BOX_P0B_FEATURE_DISABLED',
  FIELD_INVALID: 'YALKEN_BLACK_BOX_P0B_FIELD_INVALID',
  FILE_SYNC_FAILED: 'YALKEN_BLACK_BOX_P0B_FILE_SYNC_FAILED',
  KEYSET_INVALID: 'YALKEN_BLACK_BOX_P0B_KEYSET_INVALID',
  READBACK_MISMATCH: 'YALKEN_BLACK_BOX_P0B_READBACK_MISMATCH',
  SOURCE_BINDING_MISMATCH: 'YALKEN_BLACK_BOX_P0B_SOURCE_BINDING_MISMATCH',
  TARGET_DIRECTORY_INVALID: 'YALKEN_BLACK_BOX_P0B_TARGET_DIRECTORY_INVALID',
  TARGET_EXISTS: 'YALKEN_BLACK_BOX_P0B_TARGET_EXISTS',
  TARGET_SYMLINK_REJECTED: 'YALKEN_BLACK_BOX_P0B_TARGET_SYMLINK_REJECTED',
  UNSUPPORTED_PLATFORM: 'YALKEN_BLACK_BOX_P0B_UNSUPPORTED_PLATFORM',
  WRITE_FAILED: 'YALKEN_BLACK_BOX_P0B_WRITE_FAILED',
});

const REQUEST_KEYS = Object.freeze(['artifact', 'expectations', 'featureFlags', 'schemaVersion', 'sourceBinding', 'target']);
const SOURCE_BINDING_KEYS = Object.freeze([
  'canonicalRevision',
  'documentId',
  'generation',
  'projectId',
  'rootId',
  'schemaVersion',
  'sourceSetDigest',
  'workingRevision',
]);
const ARTIFACT_KEYS = Object.freeze(['byteLength', 'bytesBase64', 'schemaVersion', 'sha256', 'sourceSetDigest', 'type']);
const TARGET_KEYS = Object.freeze(['directoryPath', 'fileName', 'platform', 'schemaVersion']);
const EXPECTATION_KEYS = Object.freeze([
  'expectedAbsent',
  'noReplace',
  'requireDirectorySync',
  'requireFileSync',
  'requireFullReadback',
  'requireNoFollow',
]);
const BLACK_BOX_ARTIFACT_TYPE = 'BLACK_BOX_CAPSULE_ARTIFACT_OPAQUE_BYTES_V1';
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const SAFE_BASENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const CLAIM_STATUSES = Object.freeze(['PASS', 'UNKNOWN', 'ABSTAIN', 'CONFLICTING', 'FAIL']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!isPlainObject(value) && !Array.isArray(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    if ((isPlainObject(nested) || Array.isArray(nested)) && !Object.isFrozen(nested)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function sortedKeys(value) {
  return isPlainObject(value) ? Object.keys(value).sort() : [];
}

function sameKeys(value, keys) {
  const actual = sortedKeys(value);
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function validDigest(value) {
  return typeof value === 'string' && DIGEST_PATTERN.test(value);
}

function sha256Buffer(buffer) {
  return `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
}

function reason(code, field, expected, actual) {
  const out = { code, field };
  if (expected !== undefined) out.expected = expected;
  if (actual !== undefined) out.actual = actual;
  return Object.freeze(out);
}

function addKeysetReason(reasons, field, actual, expected) {
  reasons.push(reason(
    BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.KEYSET_INVALID,
    field,
    expected,
    sortedKeys(actual),
  ));
}

function deny(code, reasons = [reason(code, 'request')], details = {}) {
  return deepFreeze({
    ok: false,
    decision: 'DENY',
    code,
    reasons,
    ...details,
  });
}

function normalizeIdentifier(value) {
  if (typeof value !== 'string') return '';
  if (!value || value.trim() !== value) return '';
  if (/[\u0000-\u001F\\\/]/u.test(value)) return '';
  return value;
}

function normalizeRevision(value) {
  if (typeof value !== 'string') return '';
  if (!value || value.trim() !== value) return '';
  if (/[\u0000-\u001F]/u.test(value)) return '';
  return value;
}

function normalizeDirectoryPath(value) {
  if (typeof value !== 'string') return '';
  if (!value || value.trim() !== value) return '';
  if (/[\u0000]/u.test(value)) return '';
  if (!path.isAbsolute(value)) return '';
  return path.resolve(value);
}

function normalizeFileName(value) {
  if (typeof value !== 'string') return '';
  if (!value || value.trim() !== value) return '';
  if (value === '.' || value === '..') return '';
  if (value.includes('/') || value.includes('\\')) return '';
  if (!SAFE_BASENAME_PATTERN.test(value)) return '';
  return value;
}

function decodeBase64(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(value) || value.length % 4 !== 0) return null;
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) return null;
  return bytes;
}

function statsIsDirectory(stats) {
  return Boolean(stats && typeof stats.isDirectory === 'function' && stats.isDirectory());
}

function statsIsSymlink(stats) {
  return Boolean(stats && typeof stats.isSymbolicLink === 'function' && stats.isSymbolicLink());
}

function defaultFsPort() {
  return {
    constants: fsSync.constants,
    lstat: fsPromises.lstat,
    open: fsPromises.open,
    readFile: fsPromises.readFile,
  };
}

function validateSourceBinding(reasons, sourceBinding) {
  if (!isPlainObject(sourceBinding)) {
    addKeysetReason(reasons, 'sourceBinding', sourceBinding, SOURCE_BINDING_KEYS);
    return;
  }
  if (!sameKeys(sourceBinding, SOURCE_BINDING_KEYS)) {
    addKeysetReason(reasons, 'sourceBinding', sourceBinding, SOURCE_BINDING_KEYS);
  }
  if (sourceBinding.schemaVersion !== BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS.sourceBinding) {
    reasons.push(reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FIELD_INVALID, 'sourceBinding.schemaVersion'));
  }
  for (const key of ['projectId', 'rootId', 'documentId']) {
    if (!normalizeIdentifier(sourceBinding[key])) {
      reasons.push(reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FIELD_INVALID, `sourceBinding.${key}`));
    }
  }
  for (const key of ['canonicalRevision', 'workingRevision', 'generation']) {
    if (!normalizeRevision(sourceBinding[key])) {
      reasons.push(reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FIELD_INVALID, `sourceBinding.${key}`));
    }
  }
  if (!validDigest(sourceBinding.sourceSetDigest)) {
    reasons.push(reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FIELD_INVALID, 'sourceBinding.sourceSetDigest'));
  }
}

function validateArtifact(reasons, artifact) {
  if (!isPlainObject(artifact)) {
    addKeysetReason(reasons, 'artifact', artifact, ARTIFACT_KEYS);
    return null;
  }
  if (!sameKeys(artifact, ARTIFACT_KEYS)) {
    addKeysetReason(reasons, 'artifact', artifact, ARTIFACT_KEYS);
  }
  if (artifact.schemaVersion !== BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS.artifact) {
    reasons.push(reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FIELD_INVALID, 'artifact.schemaVersion'));
  }
  if (artifact.type !== BLACK_BOX_ARTIFACT_TYPE) {
    reasons.push(reason(
      BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FIELD_INVALID,
      'artifact.type',
      BLACK_BOX_ARTIFACT_TYPE,
      artifact.type,
    ));
  }
  if (!validDigest(artifact.sha256)) {
    reasons.push(reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FIELD_INVALID, 'artifact.sha256'));
  }
  if (!validDigest(artifact.sourceSetDigest)) {
    reasons.push(reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FIELD_INVALID, 'artifact.sourceSetDigest'));
  }
  const bytes = decodeBase64(artifact.bytesBase64);
  if (!bytes || !Number.isSafeInteger(artifact.byteLength) || artifact.byteLength <= 0 || bytes.byteLength !== artifact.byteLength) {
    reasons.push(reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FIELD_INVALID, 'artifact.bytesBase64'));
    return null;
  }
  if (validDigest(artifact.sha256) && sha256Buffer(bytes) !== artifact.sha256) {
    reasons.push(reason(
      BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.ARTIFACT_DIGEST_MISMATCH,
      'artifact.sha256',
      sha256Buffer(bytes),
      artifact.sha256,
    ));
  }
  return bytes;
}

function validateTarget(reasons, target) {
  if (!isPlainObject(target)) {
    addKeysetReason(reasons, 'target', target, TARGET_KEYS);
    return null;
  }
  if (!sameKeys(target, TARGET_KEYS)) {
    addKeysetReason(reasons, 'target', target, TARGET_KEYS);
  }
  if (target.schemaVersion !== BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS.target) {
    reasons.push(reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FIELD_INVALID, 'target.schemaVersion'));
  }
  if (target.platform !== 'darwin') {
    reasons.push(reason(
      BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.UNSUPPORTED_PLATFORM,
      'target.platform',
      'darwin',
      target.platform,
    ));
  }
  const directoryPath = normalizeDirectoryPath(target.directoryPath);
  const fileName = normalizeFileName(target.fileName);
  if (!directoryPath) reasons.push(reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FIELD_INVALID, 'target.directoryPath'));
  if (!fileName) reasons.push(reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FIELD_INVALID, 'target.fileName'));
  if (!directoryPath || !fileName) return null;
  const targetPath = path.join(directoryPath, fileName);
  if (path.dirname(targetPath) !== directoryPath) {
    reasons.push(reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FIELD_INVALID, 'target.fileName'));
    return null;
  }
  return { directoryPath, fileName, targetPath };
}

function validateExpectations(reasons, expectations) {
  if (!isPlainObject(expectations)) {
    addKeysetReason(reasons, 'expectations', expectations, EXPECTATION_KEYS);
    return;
  }
  if (!sameKeys(expectations, EXPECTATION_KEYS)) {
    addKeysetReason(reasons, 'expectations', expectations, EXPECTATION_KEYS);
  }
  for (const key of EXPECTATION_KEYS) {
    if (expectations[key] !== true) {
      reasons.push(reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FIELD_INVALID, `expectations.${key}`, true, expectations[key]));
    }
  }
}

function primaryCode(reasons) {
  const priority = [
    BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FEATURE_DISABLED,
    BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.KEYSET_INVALID,
    BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.UNSUPPORTED_PLATFORM,
    BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.ARTIFACT_DIGEST_MISMATCH,
    BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.SOURCE_BINDING_MISMATCH,
    BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FIELD_INVALID,
  ];
  for (const code of priority) {
    if (reasons.some((item) => item.code === code)) return code;
  }
  return reasons[0]?.code || BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FIELD_INVALID;
}

function validateRequest(request) {
  const reasons = [];
  if (!isPlainObject(request)) {
    return { ok: false, code: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.KEYSET_INVALID, reasons: [reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.KEYSET_INVALID, 'request')] };
  }
  if (!sameKeys(request, REQUEST_KEYS)) {
    addKeysetReason(reasons, 'request', request, REQUEST_KEYS);
  }
  if (request.schemaVersion !== BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS.request) {
    reasons.push(reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FIELD_INVALID, 'schemaVersion'));
  }
  const flag = resolveBlackBoxDarwinDurablePublisherFeatureFlag(request.featureFlags);
  if (!flag.enabled) {
    reasons.push(reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FEATURE_DISABLED, 'featureFlags'));
  }
  validateSourceBinding(reasons, request.sourceBinding);
  const bytes = validateArtifact(reasons, request.artifact);
  const target = validateTarget(reasons, request.target);
  validateExpectations(reasons, request.expectations);
  if (
    isPlainObject(request.sourceBinding)
    && isPlainObject(request.artifact)
    && validDigest(request.sourceBinding.sourceSetDigest)
    && validDigest(request.artifact.sourceSetDigest)
    && request.sourceBinding.sourceSetDigest !== request.artifact.sourceSetDigest
  ) {
    reasons.push(reason(
      BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.SOURCE_BINDING_MISMATCH,
      'artifact.sourceSetDigest',
      request.sourceBinding.sourceSetDigest,
      request.artifact.sourceSetDigest,
    ));
  }
  if (reasons.length > 0) return { ok: false, code: primaryCode(reasons), reasons };
  return { ok: true, bytes, target };
}

async function closeHandle(handle) {
  if (handle && typeof handle.close === 'function') {
    await handle.close().catch(() => {});
  }
}

async function lstatOrNull(fsPort, targetPath) {
  try {
    return await fsPort.lstat(targetPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export function resolveBlackBoxDarwinDurablePublisherFeatureFlag(featureFlags = {}) {
  const enabled = isPlainObject(featureFlags)
    && featureFlags[BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_FEATURE_FLAG] === true;
  return deepFreeze({
    enabled,
    canWriteManuscript: false,
    canReplaceArtifact: false,
    canRecoverProject: false,
    canPublishBlackBoxArtifact: enabled,
  });
}

export async function publishBlackBoxArtifactDarwinDurableV1(request, options = {}) {
  const validation = validateRequest(request);
  if (!validation.ok) return deny(validation.code, validation.reasons);

  const fsPort = options.fsPort || defaultFsPort();
  const { bytes, target } = validation;
  const constants = fsPort.constants || fsSync.constants;
  const noFollowFlag = Number.isInteger(constants.O_NOFOLLOW) ? constants.O_NOFOLLOW : 0;
  if (request.expectations.requireNoFollow === true && noFollowFlag === 0) {
    return deny(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.UNSUPPORTED_PLATFORM, [
      reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.UNSUPPORTED_PLATFORM, 'fs.constants.O_NOFOLLOW'),
    ]);
  }

  let directoryStats = null;
  try {
    directoryStats = await fsPort.lstat(target.directoryPath);
  } catch (error) {
    return deny(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.TARGET_DIRECTORY_INVALID, [
      reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.TARGET_DIRECTORY_INVALID, 'target.directoryPath', 'existing directory', error?.code || String(error)),
    ]);
  }
  if (!statsIsDirectory(directoryStats) || statsIsSymlink(directoryStats)) {
    return deny(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.TARGET_DIRECTORY_INVALID, [
      reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.TARGET_DIRECTORY_INVALID, 'target.directoryPath'),
    ]);
  }

  let existingTarget = null;
  try {
    existingTarget = await lstatOrNull(fsPort, target.targetPath);
  } catch (error) {
    return deny(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.TARGET_EXISTS, [
      reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.TARGET_EXISTS, 'target.fileName', 'absent', error?.code || String(error)),
    ]);
  }
  if (existingTarget) {
    if (statsIsSymlink(existingTarget)) {
      return deny(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.TARGET_SYMLINK_REJECTED, [
        reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.TARGET_SYMLINK_REJECTED, 'target.fileName'),
      ]);
    }
    return deny(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.TARGET_EXISTS, [
      reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.TARGET_EXISTS, 'target.fileName', 'absent', 'present'),
    ]);
  }

  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollowFlag;
  const mode = 0o600;
  let fileHandle = null;
  try {
    fileHandle = await fsPort.open(target.targetPath, flags, mode);
    await fileHandle.writeFile(bytes);
  } catch (error) {
    await closeHandle(fileHandle);
    return deny(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.WRITE_FAILED, [
      reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.WRITE_FAILED, 'target.fileName', 'exclusive durable write', error?.code || String(error)),
    ]);
  }
  try {
    await fileHandle.sync();
  } catch (error) {
    await closeHandle(fileHandle);
    return deny(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FILE_SYNC_FAILED, [
      reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FILE_SYNC_FAILED, 'target.fileName', 'file sync', error?.code || String(error)),
    ], { partialTargetMayExist: true });
  }
  await closeHandle(fileHandle);
  fileHandle = null;

  let directoryHandle = null;
  try {
    directoryHandle = await fsPort.open(target.directoryPath, 'r');
    await directoryHandle.sync();
  } catch (error) {
    await closeHandle(directoryHandle);
    return deny(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.DIRECTORY_SYNC_FAILED, [
      reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.DIRECTORY_SYNC_FAILED, 'target.directoryPath', 'directory sync', error?.code || String(error)),
    ], { partialTargetMayExist: true });
  }
  await closeHandle(directoryHandle);

  let readback = null;
  try {
    readback = await fsPort.readFile(target.targetPath);
  } catch (error) {
    return deny(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.READBACK_MISMATCH, [
      reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.READBACK_MISMATCH, 'target.fileName', 'full reread', error?.code || String(error)),
    ], { partialTargetMayExist: true });
  }
  const readbackDigest = sha256Buffer(readback);
  if (readback.byteLength !== bytes.byteLength || readbackDigest !== request.artifact.sha256 || !Buffer.from(readback).equals(bytes)) {
    return deny(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.READBACK_MISMATCH, [
      reason(BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.READBACK_MISMATCH, 'target.fileName', request.artifact.sha256, readbackDigest),
    ], { partialTargetMayExist: true });
  }

  const receipt = deepFreeze({
    schemaVersion: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS.receipt,
    durableDialect: 'DARWIN_CREATE_ONLY_FILE_DIRECTORY_FSYNC_REOPEN_REREAD_V1',
    sourceBinding: {
      schemaVersion: request.sourceBinding.schemaVersion,
      projectId: request.sourceBinding.projectId,
      rootId: request.sourceBinding.rootId,
      documentId: request.sourceBinding.documentId,
      canonicalRevision: request.sourceBinding.canonicalRevision,
      workingRevision: request.sourceBinding.workingRevision,
      generation: request.sourceBinding.generation,
      sourceSetDigest: request.sourceBinding.sourceSetDigest,
    },
    artifact: {
      schemaVersion: request.artifact.schemaVersion,
      type: request.artifact.type,
      byteLength: bytes.byteLength,
      sha256: request.artifact.sha256,
      sourceSetDigest: request.artifact.sourceSetDigest,
    },
    target: {
      schemaVersion: request.target.schemaVersion,
      platform: request.target.platform,
      directoryPath: target.directoryPath,
      fileName: target.fileName,
      targetPath: target.targetPath,
      modeOctal: '0600',
    },
    durability: {
      openedExclusive: true,
      noFollowRequested: true,
      noReplace: true,
      fileSynced: true,
      directorySynced: true,
      finalReopenReread: true,
      readbackDigest,
      processCrashProof: false,
      physicalPowerLossProof: false,
    },
    claims: {
      createOnly: true,
      replaceExisting: false,
      disasterReady: false,
      capsuleCrypto: false,
      recoveryImport: false,
      userDocumentAccess: false,
    },
  });

  return deepFreeze({
    ok: true,
    decision: 'ALLOW',
    code: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.ARTIFACT_PUBLISHED,
    receipt,
  });
}

export function p0bDarwinDurablePublisherClaimStrength(links) {
  if (!isPlainObject(links)) return 'UNKNOWN';
  const values = [
    links.sourceTrust,
    links.executedCoverage,
    links.artifactIntegrity,
    links.snapshotFreshness,
    links.oracleIndependence,
  ];
  if (!values.every((value) => CLAIM_STATUSES.includes(value))) return 'UNKNOWN';
  if (values.every((value) => value === 'PASS')) return 'PASS';
  if (values.includes('FAIL')) return 'FAIL';
  if (values.includes('CONFLICTING')) return 'CONFLICTING';
  if (values.includes('ABSTAIN')) return 'ABSTAIN';
  return 'UNKNOWN';
}
