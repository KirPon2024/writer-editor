import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  REVISION_BRIDGE_W1_LIFECYCLE_STATES,
  evaluateW1ColdArchiveEligibility,
} from './reviewTransportContracts.mjs';

export const REVISION_BRIDGE_W1_ROUND_STORE_SCHEMA = 'revision-bridge.w1-round-store.v1';
export const REVISION_BRIDGE_W1_ROUND_MANIFEST_SCHEMA = 'revision-bridge.w1-round-manifest.v1';
export const REVISION_BRIDGE_W1_RECONCILIATION_INDEX_SCHEMA =
  'revision-bridge.w1-reconciliation-index.v1';

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
    throw storeError('E_W1_ROUND_ID_INVALID', 'roundId is invalid', { roundId });
  }
  return roundId;
}

function assertLifecycleState(value) {
  if (!REVISION_BRIDGE_W1_LIFECYCLE_STATES.includes(value)) {
    throw storeError('E_W1_ROUND_LIFECYCLE_INVALID', 'lifecycleState is invalid', { lifecycleState: value });
  }
  return value;
}

function assertPathInside(rootPath, candidatePath, field) {
  const relative = path.relative(rootPath, candidatePath);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return candidatePath;
  throw storeError('E_W1_ROUND_STORE_PATH_OUTSIDE_ROOT', `${field} resolves outside store root`, { field });
}

async function resolveSafeStoreRoot(storeRootRaw) {
  const storeRoot = path.resolve(rawString(storeRootRaw));
  if (!rawString(storeRootRaw)) {
    throw storeError('E_W1_ROUND_STORE_ROOT_REQUIRED', 'storeRoot is required');
  }
  await fs.mkdir(storeRoot, { recursive: true });
  const stat = await fs.lstat(storeRoot);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw storeError('E_W1_ROUND_STORE_ROOT_UNSAFE', 'storeRoot must be a real directory');
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

export async function commitW1RoundManifest(storeRootRaw, input = {}) {
  const storeRoot = await resolveSafeStoreRoot(storeRootRaw);
  const manifest = normalizeManifest(input);
  const roundPath = assertPathInside(storeRoot, path.join(storeRoot, manifest.roundId), 'roundPath');
  const tempPath = assertPathInside(
    storeRoot,
    path.join(storeRoot, `.tmp-${manifest.roundId}-${process.pid}-${Date.now()}`),
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
      code: 'E_W1_ROUND_ALREADY_EXISTS',
      roundId: manifest.roundId,
      roundPath,
    };
  }

  try {
    await fs.mkdir(tempPath, { recursive: false });
    const manifestPath = path.join(tempPath, 'manifest.json');
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(tempPath, roundPath);
    return {
      ok: true,
      schemaVersion: REVISION_BRIDGE_W1_ROUND_STORE_SCHEMA,
      status: 'committed',
      code: 'W1_ROUND_COMMITTED_OLD_OR_COMPLETE_NEW',
      roundId: manifest.roundId,
      roundPath,
      manifestPath: path.join(roundPath, 'manifest.json'),
      manifest,
    };
  } catch (error) {
    let cleanup = 'none';
    if (await pathExists(tempPath)) {
      try {
        await removeIfExists(tempPath);
        cleanup = 'temp-cleaned';
      } catch {
        await fs.rename(tempPath, quarantinePath);
        cleanup = 'temp-quarantined';
      }
    }
    return {
      ok: false,
      schemaVersion: REVISION_BRIDGE_W1_ROUND_STORE_SCHEMA,
      status: 'failed',
      code: 'E_W1_ROUND_COMMIT_FAILED',
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
    throw storeError('E_W1_ROUND_MANIFEST_UNSAFE', 'manifest must be a real file');
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
    schemaVersion: 'revision-bridge.w1-external-copy-failure.v1',
    status: 'external-copy-failed-round-preserved',
    code: 'E_W1_EXTERNAL_COPY_FAILED_ROUND_UNDAMAGED',
    roundId: rawString(roundManifest.roundId),
    preservedManifestDigest: rawString(roundManifest.manifestDigest),
    canWriteManuscript: false,
    canApply: false,
    reason: cloneJsonSafe(reason),
  };
}
