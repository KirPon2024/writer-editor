import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  REVISION_BRIDGE_W1_LIFECYCLE_STATES,
  evaluateW1ColdArchiveEligibility,
} from './reviewTransportContracts.mjs';
import {
  RTK_ANALYSIS_BRANCH_V2_SCHEMA,
  RTK_RECONCILIATION_INDEX_V2_SCHEMA,
  RTK_ROUND_MANIFEST_V2_SCHEMA,
  RTK_ROUND_STORE_V2_SCHEMA,
} from './reviewTransportCore.mjs';

export const REVISION_BRIDGE_W1_ROUND_STORE_SCHEMA = RTK_ROUND_STORE_V2_SCHEMA;
export const REVISION_BRIDGE_W1_ROUND_MANIFEST_SCHEMA = RTK_ROUND_MANIFEST_V2_SCHEMA;
export const REVISION_BRIDGE_W1_RECONCILIATION_INDEX_SCHEMA =
  RTK_RECONCILIATION_INDEX_V2_SCHEMA;
export const REVISION_BRIDGE_W2_ANALYSIS_BRANCH_SCHEMA =
  RTK_ANALYSIS_BRANCH_V2_SCHEMA;

const ROUND_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,95}$/iu;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneJsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function rawString(value) {
  return typeof value === 'string' ? value : '';
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Json(value) {
  return crypto.createHash('sha256').update(Buffer.from(stableJson(value), 'utf8')).digest('hex');
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(Buffer.from(rawString(value), 'utf8')).digest('hex');
}

function storeError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.reason = code;
  error.details = details;
  return error;
}

function assertRoundId(value) {
  const roundId = rawString(value).trim();
  if (!ROUND_ID_PATTERN.test(roundId)) {
    throw storeError('RTK_WRITE_PRECONDITION_FAILED', 'roundId is invalid', { roundId });
  }
  return roundId;
}

function assertLifecycleState(value) {
  if (!REVISION_BRIDGE_W1_LIFECYCLE_STATES.includes(value)) {
    throw storeError('RTK_WRITE_PRECONDITION_FAILED', 'lifecycleState is invalid', { lifecycleState: value });
  }
  return value;
}

function assertPathInside(rootPath, candidatePath, field) {
  const relative = path.relative(rootPath, candidatePath);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return candidatePath;
  throw storeError('RTK_WRITE_PRECONDITION_FAILED', `${field} resolves outside store root`, { field });
}

async function resolveSafeStoreRoot(storeRootRaw) {
  const storeRoot = path.resolve(rawString(storeRootRaw));
  if (!rawString(storeRootRaw)) {
    throw storeError('RTK_WRITE_PRECONDITION_FAILED', 'storeRoot is required');
  }
  await fs.mkdir(storeRoot, { recursive: true });
  const stat = await fs.lstat(storeRoot);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw storeError('RTK_WRITE_PRECONDITION_FAILED', 'storeRoot must be a real directory');
  }
  return fs.realpath(storeRoot);
}

function normalizeManifest(input = {}) {
  const roundId = assertRoundId(input.roundId);
  const lifecycleState = assertLifecycleState(input.lifecycleState || 'OPEN_FOR_RETURN');
  const manifest = {
    schemaVersion: REVISION_BRIDGE_W1_ROUND_MANIFEST_SCHEMA,
    roundId,
    lifecycleState,
    exportActivationState: input.exportActivationState === 'EXPORTED' ? 'EXPORTED' : 'NOT_EXPORTED',
    roundLifecycleState: lifecycleState,
    sourceProjectDigest: rawString(input.sourceProjectDigest),
    publicArtifactDigest: rawString(input.publicArtifactDigest),
    externalCopy: isPlainObject(input.externalCopy) ? cloneJsonSafe(input.externalCopy) : null,
    terminalReceipt: isPlainObject(input.terminalReceipt) ? cloneJsonSafe(input.terminalReceipt) : null,
    canWriteManuscript: false,
    canApply: false,
  };
  return {
    ...manifest,
    manifestDigest: sha256Json(manifest),
  };
}

async function pathExists(candidatePath) {
  try {
    await fs.lstat(candidatePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function removeIfExists(candidatePath) {
  await fs.rm(candidatePath, { recursive: true, force: true });
}

async function fsyncFileIfSupported(fileHandle) {
  try {
    await fileHandle.sync();
    return 'synced';
  } catch (error) {
    return `unsupported:${rawString(error?.code) || 'UNKNOWN'}`;
  }
}

async function fsyncDirectoryIfSupported(directoryPath) {
  let handle;
  try {
    handle = await fs.open(directoryPath, 'r');
    await handle.sync();
    return 'synced';
  } catch (error) {
    return `unsupported:${rawString(error?.code) || 'UNKNOWN'}`;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

async function writeJsonVerified(filePath, value) {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  const expectedSha256 = sha256Text(bytes);
  const handle = await fs.open(filePath, 'wx');
  try {
    await handle.writeFile(bytes, 'utf8');
    const fileSync = await fsyncFileIfSupported(handle);
    const observed = await fs.readFile(filePath, 'utf8');
    const observedSha256 = sha256Text(observed);
    if (observed !== bytes || observedSha256 !== expectedSha256) {
      throw storeError('RTK_WRITE_PRECONDITION_FAILED', 'written bytes did not verify', {
        expectedSha256,
        observedSha256,
      });
    }
    return {
      byteLength: Buffer.byteLength(bytes, 'utf8'),
      sha256: expectedSha256,
      fileSync,
    };
  } finally {
    await handle.close().catch(() => {});
  }
}

async function quarantineStage(tempPath, quarantinePath) {
  try {
    await fs.rename(tempPath, quarantinePath);
    return 'temp-quarantined';
  } catch {
    return 'temp-quarantine-failed';
  }
}

export async function commitW1RoundManifest(storeRootRaw, input = {}) {
  const storeRoot = await resolveSafeStoreRoot(storeRootRaw);
  const manifest = normalizeManifest(input);
  const roundPath = assertPathInside(storeRoot, path.join(storeRoot, manifest.roundId), 'roundPath');
  const tempPath = assertPathInside(
    storeRoot,
    path.join(storeRoot, `.stage-${manifest.roundId}-${process.pid}-${Date.now()}`),
    'tempPath',
  );
  const quarantinePath = assertPathInside(
    storeRoot,
    path.join(storeRoot, `.quarantine-${manifest.roundId}-${process.pid}-${Date.now()}`),
    'quarantinePath',
  );

  if (await pathExists(roundPath)) {
    return {
      ok: false,
      schemaVersion: REVISION_BRIDGE_W1_ROUND_STORE_SCHEMA,
      status: 'exists',
      code: 'RTK_ALREADY_IMPORTED',
      roundId: manifest.roundId,
      roundPath,
    };
  }

  try {
    await fs.mkdir(tempPath, { recursive: false });
    const manifestPath = path.join(tempPath, 'manifest.json');
    const manifestWrite = await writeJsonVerified(manifestPath, manifest);
    const stageDirectorySync = await fsyncDirectoryIfSupported(tempPath);
    await fs.rename(tempPath, roundPath);
    const parentDirectorySync = await fsyncDirectoryIfSupported(storeRoot);
    return {
      ok: true,
      schemaVersion: REVISION_BRIDGE_W1_ROUND_STORE_SCHEMA,
      status: 'committed',
      code: 'RTK_ROUND_OPEN_FOR_RETURN',
      roundId: manifest.roundId,
      roundPath,
      manifestPath: path.join(roundPath, 'manifest.json'),
      manifestWrite,
      stageDirectorySync,
      parentDirectorySync,
      durabilityClaim: parentDirectorySync === 'synced'
        ? 'DIRECTORY_SYNC_SUPPORTED'
        : 'RTK_DURABILITY_DIR_SYNC_UNAVAILABLE',
      manifest,
    };
  } catch (error) {
    let cleanup = 'none';
    if (await pathExists(tempPath)) {
      try {
        await removeIfExists(tempPath);
        cleanup = 'temp-cleaned';
      } catch {
        cleanup = await quarantineStage(tempPath, quarantinePath);
      }
    }
    return {
      ok: false,
      schemaVersion: REVISION_BRIDGE_W1_ROUND_STORE_SCHEMA,
      status: 'failed',
      code: 'RTK_WRITE_PRECONDITION_FAILED',
      roundId: manifest.roundId,
      cleanup,
      errorCode: rawString(error?.code),
    };
  }
}

export async function readW1RoundManifest(storeRootRaw, roundIdRaw) {
  const storeRoot = await resolveSafeStoreRoot(storeRootRaw);
  const roundId = assertRoundId(roundIdRaw);
  const manifestPath = assertPathInside(storeRoot, path.join(storeRoot, roundId, 'manifest.json'), 'manifestPath');
  const stat = await fs.lstat(manifestPath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw storeError('RTK_WRITE_PRECONDITION_FAILED', 'manifest must be a real file');
  }
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  return {
    ok: true,
    schemaVersion: REVISION_BRIDGE_W1_ROUND_STORE_SCHEMA,
    status: 'read',
    roundId,
    manifestPath,
    manifest,
  };
}

export function buildW1ReconciliationIndex(roundManifests = []) {
  const rounds = (Array.isArray(roundManifests) ? roundManifests : [])
    .filter(isPlainObject)
    .map((manifest) => ({
      roundId: rawString(manifest.roundId),
      lifecycleState: rawString(manifest.lifecycleState),
      manifestDigest: rawString(manifest.manifestDigest),
      archiveEligible: evaluateW1ColdArchiveEligibility(manifest).ok,
    }))
    .sort((a, b) => a.roundId.localeCompare(b.roundId));
  return {
    schemaVersion: REVISION_BRIDGE_W1_RECONCILIATION_INDEX_SCHEMA,
    rebuildable: true,
    canWriteManuscript: false,
    indexDigest: sha256Json(rounds),
    rounds,
  };
}

export function recordW1ExternalCopyFailure(roundManifest = {}, reason = {}) {
  return {
    ok: false,
    schemaVersion: 'yalken.rtk.external-copy-failure.v2',
    status: 'external-copy-failed-round-preserved',
    code: 'RTK_WRITE_PRECONDITION_FAILED',
    roundId: rawString(roundManifest.roundId),
    preservedManifestDigest: rawString(roundManifest.manifestDigest),
    canWriteManuscript: false,
    canApply: false,
    reason: cloneJsonSafe(reason),
  };
}

function assertAnalysisKey(value) {
  const key = rawString(value).trim();
  if (!ROUND_ID_PATTERN.test(key)) {
    throw storeError('RTK_WRITE_PRECONDITION_FAILED', 'analysis key is invalid', { key });
  }
  return key;
}

function normalizeW2AnalysisRecord(input = {}) {
  const roundId = assertRoundId(input.roundId);
  const cacheKey = rawString(input.cacheKey);
  const analysisDigest = rawString(input.analysisDigest);
  const parserProfileDigest = rawString(input.parserProfileDigest);
  if (!cacheKey || !analysisDigest || !parserProfileDigest) {
    throw storeError('RTK_WRITE_PRECONDITION_FAILED', 'analysis digests are required');
  }
  const record = {
    schemaVersion: REVISION_BRIDGE_W2_ANALYSIS_BRANCH_SCHEMA,
    roundId,
    exportId: rawString(input.exportId),
    returnId: rawString(input.returnId || input.returnedArtifactSha256),
    returnedArtifactSha256: rawString(input.returnedArtifactSha256),
    manifestDigest: rawString(input.manifestDigest),
    cacheKey,
    analysisDigest,
    parserProfileDigest,
    supportedSemanticDigest: rawString(input.supportedSemanticDigest),
    outcome: isPlainObject(input.outcome) ? cloneJsonSafe(input.outcome) : null,
    reviewIr: isPlainObject(input.reviewIr) ? cloneJsonSafe(input.reviewIr) : {},
    redactedPackageRewriteReport: isPlainObject(input.redactedPackageRewriteReport)
      ? cloneJsonSafe(input.redactedPackageRewriteReport)
      : null,
    canWriteManuscript: false,
    canApply: false,
  };
  return {
    ...record,
    recordChecksum: sha256Json(record),
  };
}

export async function commitW2AnalysisBranch(storeRootRaw, input = {}) {
  const storeRoot = await resolveSafeStoreRoot(storeRootRaw);
  const record = normalizeW2AnalysisRecord(input);
  const analysisKey = assertAnalysisKey(
    input.analysisKey || `${record.cacheKey.replace(/^sha256:/u, '')}`,
  );
  const branchId = `profile-${record.parserProfileDigest.replace(/^sha256:/u, '')}`;
  const branchRoot = assertPathInside(
    storeRoot,
    path.join(storeRoot, record.roundId, 'analysis', analysisKey),
    'analysisKeyPath',
  );
  const branchPath = assertPathInside(branchRoot, path.join(branchRoot, branchId), 'branchPath');
  const recordPath = path.join(branchPath, 'analysis.json');
  const tempPath = assertPathInside(
    storeRoot,
    path.join(storeRoot, `.stage-analysis-${record.roundId}-${analysisKey}-${process.pid}-${Date.now()}`),
    'tempPath',
  );
  const quarantinePath = assertPathInside(
    storeRoot,
    path.join(storeRoot, `.quarantine-analysis-${record.roundId}-${analysisKey}-${process.pid}-${Date.now()}`),
    'quarantinePath',
  );

  if (await pathExists(recordPath)) {
    const existing = JSON.parse(await fs.readFile(recordPath, 'utf8'));
    return {
      ok: true,
      schemaVersion: REVISION_BRIDGE_W2_ANALYSIS_BRANCH_SCHEMA,
      status: existing.analysisDigest === record.analysisDigest ? 'reused' : 'blocked',
      code: existing.analysisDigest === record.analysisDigest
        ? 'RTK_ALREADY_ANALYZED'
        : 'RTK_WRITE_PRECONDITION_FAILED',
      roundId: record.roundId,
      analysisKey,
      branchId,
      branchPath,
      recordPath,
      record: existing,
      canWriteManuscript: false,
      canApply: false,
    };
  }

  try {
    await fs.mkdir(tempPath, { recursive: false });
    const recordWrite = await writeJsonVerified(path.join(tempPath, 'analysis.json'), record);
    const stageDirectorySync = await fsyncDirectoryIfSupported(tempPath);
    await fs.mkdir(branchRoot, { recursive: true });
    await fs.rename(tempPath, branchPath);
    const parentDirectorySync = await fsyncDirectoryIfSupported(branchRoot);
    return {
      ok: true,
      schemaVersion: REVISION_BRIDGE_W2_ANALYSIS_BRANCH_SCHEMA,
      status: 'committed',
      code: 'RTK_ALREADY_ANALYZED',
      roundId: record.roundId,
      analysisKey,
      branchId,
      branchPath,
      recordPath,
      recordWrite,
      stageDirectorySync,
      parentDirectorySync,
      record,
      canWriteManuscript: false,
      canApply: false,
    };
  } catch (error) {
    let cleanup = 'none';
    if (await pathExists(tempPath)) {
      try {
        await removeIfExists(tempPath);
        cleanup = 'temp-cleaned';
      } catch {
        cleanup = await quarantineStage(tempPath, quarantinePath);
      }
    }
    return {
      ok: false,
      schemaVersion: REVISION_BRIDGE_W2_ANALYSIS_BRANCH_SCHEMA,
      status: 'failed',
      code: 'RTK_WRITE_PRECONDITION_FAILED',
      roundId: record.roundId,
      analysisKey,
      cleanup,
      errorCode: rawString(error?.code),
      canWriteManuscript: false,
      canApply: false,
    };
  }
}
