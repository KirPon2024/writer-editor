import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

import { hashCanonicalValue } from '../core/browser-safe-hash.mjs';
import { validateStage10IntegrityAnchor } from './stage10IntegrityAnchor.mjs';
import { createMainProjectManifestAuthority } from './mainProjectManifestAuthority.mjs';
import { stage10ProjectPathIdentity } from './stage10ProjectIdentityKey.mjs';
import { validateStage10RecoverySnapshot } from './stage10RecoverySnapshot.mjs';

export const STAGE10_MAIN_PERSISTENCE_PORT_SCHEMA = 'yalken.stage10.mainPersistencePort.v1';
export const STAGE10_MAIN_TRANSACTION_SCHEMA = 'yalken.stage10.mainPersistenceTransaction.v5';
export const STAGE10_PROJECT_TRUTH_MUTATION_SCHEMA = 'yalken.stage10.projectTruthMutation.v1';
export const STAGE10_EXTERNAL_ARTIFACT_MUTATION_SCHEMA = 'yalken.stage10.externalArtifactMutation.v1';
export const STAGE10_EXTERNAL_ARTIFACT_RESERVATION_SCHEMA = 'yalken.stage10.externalArtifactReservation.v1';
const STAGE10_LEGACY_MAIN_TRANSACTION_SCHEMA = 'yalken.stage10.mainPersistenceTransaction.v1';
const STAGE10_LEGACY_MAIN_TRANSACTION_SCHEMA_V2 = 'yalken.stage10.mainPersistenceTransaction.v2';
const STAGE10_LEGACY_MAIN_TRANSACTION_SCHEMA_V3 = 'yalken.stage10.mainPersistenceTransaction.v3';
const STAGE10_LEGACY_MAIN_TRANSACTION_SCHEMA_V4 = 'yalken.stage10.mainPersistenceTransaction.v4';

const SESSION_FILENAME = 'product-session.v2.json';
const AUTHORITY_FILENAME = 'command-receipt-authority-store.v2.json';
const RECOVERY_DIRNAME = 'recovery';
const PROJECT_TRUTH_RECOVERY_FILENAME = 'project-truth.latest.v1.json';
const PROJECT_SERIALIZATION_QUEUES = new Map();

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function typedError(code, reason, details) {
  const error = { code, op: 'stage10.mainPersistencePort', reason };
  if (isPlainObject(details)) error.details = cloneJson(details);
  return error;
}

function projectIdentity(projectId) {
  const identity = stage10ProjectPathIdentity(projectId);
  if (!identity.ok) {
    throw typedError('E_STAGE10_PERSISTENCE_PROJECT_ID_INVALID', 'PROJECT_ID_INVALID');
  }
  return identity;
}

function projectStorageKey(projectId) {
  return projectIdentity(projectId).canonicalKey;
}

function safeSnapshotKey(snapshotId) {
  const normalized = normalizeString(snapshotId);
  if (!normalized || !/^[a-zA-Z0-9._:-]{1,180}$/u.test(normalized)) {
    throw typedError('E_STAGE10_RECOVERY_SNAPSHOT_ID_INVALID', 'RECOVERY_SNAPSHOT_ID_INVALID');
  }
  return normalized.replace(/[^a-zA-Z0-9._-]/gu, '_');
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function defaultAtomicWrite(targetPath, content) {
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, content, 'utf8');
  await fs.rename(temporaryPath, targetPath);
  return { success: true };
}

async function readJsonIfPresent(targetPath, label) {
  let raw;
  try {
    raw = await fs.readFile(targetPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw typedError('E_STAGE10_PERSISTENCE_READ_FAILED', 'PERSISTENCE_READ_FAILED', { label, code: error?.code || '' });
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw typedError('E_STAGE10_PERSISTENCE_JSON_INVALID', 'PERSISTENCE_JSON_INVALID', { label });
  }
}

function bundleDigest(bundle) {
  if (!isPlainObject(bundle)) return '';
  return hashCanonicalValue({
    session: bundle.session,
    authorityStore: bundle.authorityStore,
    integrityAnchor: bundle.integrityAnchor,
  });
}

function bundleRevision(bundle) {
  const events = bundle?.session?.eventLog?.events;
  return Array.isArray(events) ? events.length : 0;
}

function bundleAuthorityHeadDigest(bundle) {
  return normalizeString(bundle?.authorityStore?.currentHead?.authorityHeadDigest);
}

function transactionFencingBindingDigest(transaction) {
  const binding = {
    schemaVersion: transaction?.schemaVersion,
    projectId: transaction?.projectId,
    fencingGeneration: transaction?.fencingGeneration,
    leaseOwnerTokenDigest: transaction?.leaseOwnerTokenDigest,
    previousBundleDigest: transaction?.previousBundleDigest,
    nextBundleDigest: transaction?.nextBundleDigest,
    projectTruthMutationDigest: transaction?.projectTruthMutationDigest,
    expectedPreviousRevision: transaction?.expectedPreviousRevision,
    expectedPreviousAuthorityHeadDigest: transaction?.expectedPreviousAuthorityHeadDigest,
  };
  if (transaction?.schemaVersion === STAGE10_MAIN_TRANSACTION_SCHEMA) {
    binding.externalArtifactReservationDigest = transaction?.externalArtifactReservationDigest;
  }
  return hashCanonicalValue(binding);
}

function sameValue(left, right) {
  return hashCanonicalValue(left) === hashCanonicalValue(right);
}

function hashText(value) {
  return createHash('sha256').update(Buffer.from(typeof value === 'string' ? value : '', 'utf8')).digest('hex');
}

function normalizeExternalArtifactMutation(input) {
  if (!isPlainObject(input)) return null;
  const mutation = {
    schemaVersion: input.schemaVersion,
    targetPath: normalizeString(input.targetPath),
    format: normalizeString(input.format),
    mediaType: normalizeString(input.mediaType),
    nextText: typeof input.nextText === 'string' ? input.nextText : null,
    nextHash: normalizeString(input.nextHash),
    previousExists: input.previousExists === true,
    previousText: typeof input.previousText === 'string' ? input.previousText : null,
    previousHash: normalizeString(input.previousHash),
  };
  if (
    mutation.schemaVersion !== STAGE10_EXTERNAL_ARTIFACT_MUTATION_SCHEMA
    || !path.isAbsolute(mutation.targetPath)
    || mutation.targetPath === path.parse(mutation.targetPath).root
    || !['json', 'svg'].includes(mutation.format)
    || !mutation.mediaType
    || mutation.nextText === null
    || mutation.nextText.length === 0
    || Buffer.byteLength(mutation.nextText, 'utf8') > 8 * 1024 * 1024
    || mutation.nextHash !== hashText(mutation.nextText)
    || mutation.previousText === null
    || (mutation.previousExists && mutation.previousHash !== hashText(mutation.previousText))
    || (!mutation.previousExists && (mutation.previousText !== '' || mutation.previousHash !== ''))
  ) {
    throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_MUTATION_INVALID', 'EXTERNAL_ARTIFACT_MUTATION_INVALID');
  }
  return mutation;
}

function createExternalArtifactReservation(projectId, mutation, lease) {
  if (!mutation) return null;
  const reservationId = randomUUID();
  const prefix = `${mutation.targetPath}.stage10-cas.${reservationId}`;
  return {
    schemaVersion: STAGE10_EXTERNAL_ARTIFACT_RESERVATION_SCHEMA,
    projectId: normalizeString(projectId),
    reservationId,
    targetPath: mutation.targetPath,
    candidatePath: `${prefix}.next`,
    backupPath: `${prefix}.previous`,
    conflictPath: `${mutation.targetPath}.stage10-aborted.${mutation.nextHash.slice(0, 12)}.${reservationId}`,
    previousExists: mutation.previousExists,
    previousHash: mutation.previousHash,
    nextHash: mutation.nextHash,
    fencingGeneration: Number(lease?.fencingGeneration),
    leaseOwnerTokenDigest: normalizeString(lease?.ownerTokenDigest),
  };
}

function normalizeExternalArtifactReservation(projectId, mutation, input) {
  if (!mutation && input === null) return null;
  if (!mutation || !isPlainObject(input)) {
    throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_RESERVATION_INVALID', 'EXTERNAL_ARTIFACT_RESERVATION_INVALID');
  }
  const reservation = {
    schemaVersion: input.schemaVersion,
    projectId: normalizeString(input.projectId),
    reservationId: normalizeString(input.reservationId),
    targetPath: normalizeString(input.targetPath),
    candidatePath: normalizeString(input.candidatePath),
    backupPath: normalizeString(input.backupPath),
    conflictPath: normalizeString(input.conflictPath),
    previousExists: input.previousExists === true,
    previousHash: normalizeString(input.previousHash),
    nextHash: normalizeString(input.nextHash),
    fencingGeneration: Number(input.fencingGeneration),
    leaseOwnerTokenDigest: normalizeString(input.leaseOwnerTokenDigest),
  };
  const parent = path.dirname(mutation.targetPath);
  const prefix = `${mutation.targetPath}.stage10-cas.${reservation.reservationId}`;
  if (
    reservation.schemaVersion !== STAGE10_EXTERNAL_ARTIFACT_RESERVATION_SCHEMA
    || reservation.projectId !== normalizeString(projectId)
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(reservation.reservationId)
    || reservation.targetPath !== mutation.targetPath
    || reservation.candidatePath !== `${prefix}.next`
    || reservation.backupPath !== `${prefix}.previous`
    || reservation.conflictPath !== `${mutation.targetPath}.stage10-aborted.${mutation.nextHash.slice(0, 12)}.${reservation.reservationId}`
    || [reservation.candidatePath, reservation.backupPath, reservation.conflictPath]
      .some((candidate) => path.dirname(candidate) !== parent)
    || reservation.previousExists !== mutation.previousExists
    || reservation.previousHash !== mutation.previousHash
    || reservation.nextHash !== mutation.nextHash
    || !Number.isSafeInteger(reservation.fencingGeneration)
    || reservation.fencingGeneration <= 0
    || !/^[a-f0-9]{64}$/u.test(reservation.leaseOwnerTokenDigest)
  ) {
    throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_RESERVATION_INVALID', 'EXTERNAL_ARTIFACT_RESERVATION_INVALID');
  }
  return reservation;
}

function normalizeProjectTruthMutation(projectId, input) {
  if (!isPlainObject(input)) return null;
  const normalized = {
    schemaVersion: input.schemaVersion,
    projectId: normalizeString(input.projectId),
    relativePath: normalizeString(input.relativePath),
    previousText: typeof input.previousText === 'string' ? input.previousText : null,
    nextText: typeof input.nextText === 'string' ? input.nextText : null,
    previousHash: normalizeString(input.previousHash),
    nextHash: normalizeString(input.nextHash),
    externalArtifactMutation: normalizeExternalArtifactMutation(input.externalArtifactMutation),
  };
  if (
    normalized.schemaVersion !== STAGE10_PROJECT_TRUTH_MUTATION_SCHEMA
    || normalized.projectId !== normalizeString(projectId)
    || normalized.relativePath !== 'project.craftsman.json'
    || normalized.previousText === null
    || normalized.nextText === null
    || normalized.previousHash !== hashText(normalized.previousText)
    || normalized.nextHash !== hashText(normalized.nextText)
  ) {
    throw typedError('E_STAGE10_PROJECT_TRUTH_MUTATION_INVALID', 'PROJECT_TRUTH_MUTATION_INVALID');
  }
  try {
    const previousManifest = JSON.parse(normalized.previousText);
    const nextManifest = JSON.parse(normalized.nextText);
    if (
      !isPlainObject(previousManifest)
      || !isPlainObject(nextManifest)
      || normalizeString(previousManifest.projectId) !== normalizeString(projectId)
      || normalizeString(nextManifest.projectId) !== normalizeString(projectId)
    ) {
      throw new Error('PROJECT_TRUTH_PROJECT_MISMATCH');
    }
  } catch {
    throw typedError('E_STAGE10_PROJECT_TRUTH_MUTATION_JSON_INVALID', 'PROJECT_TRUTH_MUTATION_JSON_INVALID');
  }
  return normalized;
}

function validateBundleIntegrity(projectId, bundle, previousAnchor) {
  if (!isPlainObject(bundle)) {
    throw typedError('E_STAGE10_PERSISTENCE_BUNDLE_INVALID', 'PERSISTENCE_BUNDLE_REQUIRED');
  }
  const verified = validateStage10IntegrityAnchor(bundle.integrityAnchor, {
    projectId,
    session: bundle.session,
    authorityStore: bundle.authorityStore,
    previousAnchor,
  });
  if (!verified.ok) {
    throw typedError(
      'E_STAGE10_PERSISTENCE_BUNDLE_INTEGRITY_INVALID',
      'PERSISTENCE_BUNDLE_INTEGRITY_INVALID',
      { anchorReason: verified.error?.reason || '' },
    );
  }
}

function serializeProjectOperation(projectId, operation) {
  const key = projectStorageKey(projectId);
  const previous = PROJECT_SERIALIZATION_QUEUES.get(key) || Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  PROJECT_SERIALIZATION_QUEUES.set(key, current);
  return current.finally(() => {
    if (PROJECT_SERIALIZATION_QUEUES.get(key) === current) {
      PROJECT_SERIALIZATION_QUEUES.delete(key);
    }
  });
}

export function createStage10MainPersistenceAdapter(input = {}) {
  const requestedProjectRoot = normalizeString(input.projectRoot);
  const requestedAnchorRoot = normalizeString(input.anchorRoot);
  if (!requestedProjectRoot || !requestedAnchorRoot) {
    throw typedError('E_STAGE10_PERSISTENCE_ROOT_INVALID', 'PERSISTENCE_ROOT_INVALID');
  }
  const projectRoot = path.resolve(requestedProjectRoot);
  const anchorRoot = path.resolve(requestedAnchorRoot);
  if (projectRoot === path.parse(projectRoot).root || anchorRoot === path.parse(anchorRoot).root) {
    throw typedError('E_STAGE10_PERSISTENCE_ROOT_INVALID', 'PERSISTENCE_ROOT_INVALID');
  }
  const writeFileAtomic = typeof input.writeFileAtomic === 'function' ? input.writeFileAtomic : defaultAtomicWrite;
  const onKillpoint = typeof input.onKillpoint === 'function' ? input.onKillpoint : null;
  const recoveryConsumedProjects = new Set();
  const leaseClock = typeof input.leaseNowMs === 'function' ? input.leaseNowMs : () => Date.now();
  const leaseMonotonicClock = typeof input.leaseNowMonotonicMs === 'function'
    ? input.leaseNowMonotonicMs
    : (typeof input.leaseNowMs === 'function'
      ? input.leaseNowMs
      : () => Number(process.hrtime.bigint() / 1_000_000n));
  const transactionAuthority = isPlainObject(input.transactionAuthority)
    && typeof input.transactionAuthority.withProjectLease === 'function'
    && typeof input.transactionAuthority.commitManifestText === 'function'
    ? input.transactionAuthority
    : createMainProjectManifestAuthority({
      anchorRoot,
      writeFileAtomic,
      leaseTtlMs: input.leaseTtlMs,
      leaseNowMs: leaseClock,
      leaseNowMonotonicMs: leaseMonotonicClock,
      useLeaseHeartbeatWorker: input.useLeaseHeartbeatWorker,
    });
  const leaseManager = transactionAuthority.leaseManager;

  async function readMigrationRecord(targetPath, label) {
    let raw;
    try {
      raw = await fs.readFile(targetPath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw typedError('E_STAGE10_PROJECT_KEY_MIGRATION_READ_FAILED', 'PROJECT_KEY_MIGRATION_READ_FAILED', {
        label,
        code: error?.code || '',
      });
    }
    try {
      const value = JSON.parse(raw);
      if (!isPlainObject(value)) throw new Error('NOT_OBJECT');
      return value;
    } catch {
      throw typedError('E_STAGE10_PROJECT_KEY_MIGRATION_RECORD_INVALID', 'PROJECT_KEY_MIGRATION_RECORD_INVALID', {
        label,
      });
    }
  }

  async function inspectAnchorRootIdentity(root) {
    let entries;
    try {
      entries = await fs.readdir(root);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return { exists: false, projectId: '', entries: [], leaseMetadata: null };
      }
      throw error;
    }
    const candidates = [
      ['anchor', path.join(root, 'integrity-anchor.v1.json')],
      ['anchorRecovery', path.join(root, 'integrity-anchor.recovery.v1.json')],
      ['transaction', path.join(root, 'pending-transaction.v1.json')],
      ['leaseV3', path.join(root, 'project-transaction.lease', 'owner.v3.json')],
      ['leaseV2', path.join(root, 'project-transaction.lease', 'owner.v2.json')],
      ['leaseV1', path.join(root, 'project-transaction.lease', 'owner.v1.json')],
      ['fence', path.join(root, 'fencing-generation.v1.json')],
    ];
    const evidence = [];
    let leaseMetadata = null;
    for (const [label, targetPath] of candidates) {
      const record = await readMigrationRecord(targetPath, label);
      if (!record) continue;
      const evidenceProjectId = normalizeString(record.projectId);
      if (!evidenceProjectId) {
        throw typedError('E_STAGE10_PROJECT_KEY_MIGRATION_IDENTITY_MISSING', 'PROJECT_KEY_MIGRATION_IDENTITY_MISSING', {
          label,
        });
      }
      evidence.push({ label, projectId: evidenceProjectId });
      if (label === 'leaseV3' || label === 'leaseV2' || label === 'leaseV1') leaseMetadata = record;
    }
    const projectIds = [...new Set(evidence.map((item) => item.projectId))];
    if (projectIds.length > 1) {
      throw typedError('E_STAGE10_PROJECT_KEY_MIGRATION_IDENTITY_CONFLICT', 'PROJECT_KEY_MIGRATION_IDENTITY_CONFLICT', {
        projectIds,
      });
    }
    return {
      exists: true,
      projectId: projectIds[0] || '',
      entries,
      leaseMetadata,
    };
  }

  async function legacyLeaseIsActive(root, evidence) {
    const leaseDirectory = path.join(root, 'project-transaction.lease');
    let stat;
    try {
      stat = await fs.stat(leaseDirectory);
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
    const ownerTokenDigest = normalizeString(evidence.leaseMetadata?.ownerTokenDigest);
    const maxTtlMs = Number(leaseManager.ttlMs) || 60_000;
    if (evidence.leaseMetadata?.schemaVersion === 'yalken.mainProjectLease.v3' && /^[a-f0-9]{64}$/u.test(ownerTokenDigest)) {
      const heartbeatPath = path.join(root, `lease-heartbeat.${ownerTokenDigest}.v2.json`);
      const heartbeat = await readMigrationRecord(heartbeatPath, 'leaseHeartbeatV2');
      const monotonicRenewedAtMs = Number(heartbeat?.monotonicRenewedAtMs);
      const monotonicExpiresAtMs = Number(heartbeat?.monotonicExpiresAtMs);
      const monotonicNowMs = leaseMonotonicClock();
      if (
        heartbeat?.projectId === evidence.projectId
        && heartbeat?.processInstanceId === evidence.leaseMetadata?.processInstanceId
        && heartbeat?.ownerTokenDigest === ownerTokenDigest
        && Number(heartbeat?.fencingGeneration) === Number(evidence.leaseMetadata?.fencingGeneration)
        && Number.isFinite(monotonicRenewedAtMs)
        && Number.isFinite(monotonicExpiresAtMs)
        && monotonicExpiresAtMs > monotonicRenewedAtMs
        && monotonicExpiresAtMs - monotonicRenewedAtMs <= maxTtlMs
        && monotonicRenewedAtMs <= monotonicNowMs + Number(leaseManager.heartbeatIntervalMs || 5_000)
      ) {
        return monotonicNowMs < monotonicExpiresAtMs;
      }
      return false;
    }
    if (/^[a-f0-9]{64}$/u.test(ownerTokenDigest)) {
      const heartbeatPath = path.join(root, `lease-heartbeat.${ownerTokenDigest}.v1.json`);
      const heartbeat = await readMigrationRecord(heartbeatPath, 'leaseHeartbeatV1');
      if (
        heartbeat?.projectId === evidence.projectId
        && heartbeat?.ownerTokenDigest === ownerTokenDigest
        && Number(heartbeat?.fencingGeneration) === Number(evidence.leaseMetadata?.fencingGeneration)
      ) {
        let heartbeatMtimeMs = 0;
        try {
          heartbeatMtimeMs = (await fs.stat(heartbeatPath)).mtimeMs;
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
        const expiresAtMs = Number(heartbeat.expiresAtMs);
        const boundedExpiryMs = heartbeatMtimeMs + maxTtlMs;
        if (heartbeatMtimeMs > 0) {
          return leaseClock() < (Number.isFinite(expiresAtMs)
            ? Math.min(expiresAtMs, boundedExpiryMs)
            : boundedExpiryMs);
        }
      }
    }
    const expiresAtMs = Number(evidence.leaseMetadata?.expiresAtMs);
    const boundedExpiryMs = stat.mtimeMs + maxTtlMs;
    return leaseClock() < (Number.isFinite(expiresAtMs)
      ? Math.min(expiresAtMs, boundedExpiryMs)
      : boundedExpiryMs);
  }

  async function ensureProjectAnchorRootBinding(projectId) {
    const identity = projectIdentity(projectId);
    const canonicalRoot = path.join(anchorRoot, identity.canonicalKey);
    const legacyRoot = path.join(anchorRoot, identity.legacyKey);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const [canonical, legacy] = await Promise.all([
        inspectAnchorRootIdentity(canonicalRoot),
        inspectAnchorRootIdentity(legacyRoot),
      ]);
      if (canonical.exists) {
        if (canonical.projectId && canonical.projectId !== identity.projectId) {
          throw typedError('E_STAGE10_PROJECT_KEY_CANONICAL_COLLISION', 'PROJECT_KEY_CANONICAL_COLLISION', {
            projectId: identity.projectId,
            boundProjectId: canonical.projectId,
          });
        }
        if (!canonical.projectId && canonical.entries.length > 0) {
          throw typedError('E_STAGE10_PROJECT_KEY_CANONICAL_AMBIGUOUS', 'PROJECT_KEY_CANONICAL_AMBIGUOUS');
        }
        if (legacy.exists && legacy.projectId === identity.projectId) {
          throw typedError('E_STAGE10_PROJECT_KEY_DUPLICATE_ROOT', 'PROJECT_KEY_DUPLICATE_ROOT');
        }
        if (legacy.exists && legacy.projectId && legacy.projectId !== identity.projectId) {
          throw typedError('E_STAGE10_PROJECT_KEY_LEGACY_COLLISION', 'PROJECT_KEY_LEGACY_COLLISION', {
            projectId: identity.projectId,
            boundProjectId: legacy.projectId,
          });
        }
        return { identity, migrated: false };
      }
      if (!legacy.exists) return { identity, migrated: false };
      if (!legacy.projectId) {
        if (legacy.entries.length === 0) return { identity, migrated: false };
        throw typedError('E_STAGE10_PROJECT_KEY_LEGACY_AMBIGUOUS', 'PROJECT_KEY_LEGACY_AMBIGUOUS');
      }
      if (legacy.projectId !== identity.projectId) {
        throw typedError('E_STAGE10_PROJECT_KEY_LEGACY_COLLISION', 'PROJECT_KEY_LEGACY_COLLISION', {
          projectId: identity.projectId,
          boundProjectId: legacy.projectId,
        });
      }
      if (await legacyLeaseIsActive(legacyRoot, legacy)) {
        throw typedError('E_STAGE10_PROJECT_KEY_MIGRATION_LEASE_HELD', 'PROJECT_KEY_MIGRATION_LEASE_HELD', {
          projectId: identity.projectId,
          ownerPid: Number(legacy.leaseMetadata?.ownerPid) || 0,
        });
      }
      try {
        await fs.mkdir(path.dirname(canonicalRoot), { recursive: true });
        await fs.rename(legacyRoot, canonicalRoot);
      } catch (error) {
        if (error?.code === 'ENOENT' || error?.code === 'EEXIST' || error?.code === 'ENOTEMPTY') continue;
        throw typedError('E_STAGE10_PROJECT_KEY_MIGRATION_FAILED', 'PROJECT_KEY_MIGRATION_FAILED', {
          code: error?.code || '',
        });
      }
      const migrated = await inspectAnchorRootIdentity(canonicalRoot);
      if (!migrated.exists || migrated.projectId !== identity.projectId) {
        throw typedError('E_STAGE10_PROJECT_KEY_MIGRATION_READBACK_INVALID', 'PROJECT_KEY_MIGRATION_READBACK_INVALID');
      }
      return { identity, migrated: true };
    }
    throw typedError('E_STAGE10_PROJECT_KEY_MIGRATION_RACE', 'PROJECT_KEY_MIGRATION_RACE');
  }

  function pathsFor(projectId) {
    const identity = projectIdentity(projectId);
    const projectKey = identity.canonicalKey;
    const stateRoot = path.join(projectRoot, '.stage10-local');
    const projectAnchorRoot = path.join(anchorRoot, projectKey);
    return {
      projectId: identity.projectId,
      projectKey,
      legacyProjectKey: identity.legacyKey,
      stateRoot,
      session: path.join(stateRoot, SESSION_FILENAME),
      authority: path.join(stateRoot, AUTHORITY_FILENAME),
      recoveryRoot: path.join(stateRoot, RECOVERY_DIRNAME),
      projectTruthRecovery: path.join(stateRoot, RECOVERY_DIRNAME, PROJECT_TRUTH_RECOVERY_FILENAME),
      anchorRoot: projectAnchorRoot,
      anchor: path.join(projectAnchorRoot, 'integrity-anchor.v1.json'),
      anchorRecovery: path.join(projectAnchorRoot, 'integrity-anchor.recovery.v1.json'),
      transaction: path.join(projectAnchorRoot, 'pending-transaction.v1.json'),
    };
  }

  async function writeJson(targetPath, value, label, lease = null) {
    const publication = async () => {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      const result = await writeFileAtomic(targetPath, jsonText(value));
      if (result?.success === false || result?.ok === false) {
        throw typedError('E_STAGE10_PERSISTENCE_WRITE_REJECTED', 'PERSISTENCE_WRITE_REJECTED', { label });
      }
      const readback = await readJsonIfPresent(targetPath, label);
      if (!sameValue(readback, value)) {
        throw typedError('E_STAGE10_PERSISTENCE_READBACK_MISMATCH', 'PERSISTENCE_READBACK_MISMATCH', { label });
      }
      return readback;
    };
    return lease ? lease.publish(publication) : publication();
  }

  async function killpoint(name) {
    if (onKillpoint) await onKillpoint(name);
  }

  async function readProjectTruthText(mutation) {
    try {
      return await fs.readFile(path.join(projectRoot, mutation.relativePath), 'utf8');
    } catch (error) {
      throw typedError('E_STAGE10_PROJECT_TRUTH_READ_FAILED', 'PROJECT_TRUTH_READ_FAILED', {
        code: error?.code || '',
      });
    }
  }

  async function assertProjectTruthText(mutation, expectedText, expectedHash, reason) {
    const actualText = await readProjectTruthText(mutation);
    if (actualText !== expectedText || hashText(actualText) !== expectedHash) {
      throw typedError('E_STAGE10_PROJECT_TRUTH_STALE', reason, {
        expectedHash,
        actualHash: hashText(actualText),
      });
    }
    return actualText;
  }

  async function writeProjectTruthText(mutation, target, lease = null) {
    const next = target === 'next'
      ? { text: mutation.nextText, hash: mutation.nextHash }
      : { text: mutation.previousText, hash: mutation.previousHash };
    const current = await readProjectTruthText(mutation);
    if (current === next.text && hashText(current) === next.hash) {
      if (lease) await lease.assertOwned();
      return { ok: true, unchanged: true };
    }
    const expectedText = target === 'next' ? mutation.previousText : mutation.nextText;
    const expectedHash = target === 'next' ? mutation.previousHash : mutation.nextHash;
    if (current !== expectedText || hashText(current) !== expectedHash) {
      throw typedError('E_STAGE10_PROJECT_TRUTH_STALE', 'PROJECT_TRUTH_REVISION_CONFLICT', {
        expectedHash,
        actualHash: hashText(current),
      });
    }
    try {
      return await transactionAuthority.commitManifestText({
        projectId: mutation.projectId,
        targetPath: path.join(projectRoot, mutation.relativePath),
        expectedText,
        nextText: next.text,
        lease,
        label: `stage10ProjectTruth:${target}`,
      });
    } catch (error) {
      if (error?.code === 'E_MAIN_PROJECT_MANIFEST_WRITE_REJECTED') {
        throw typedError('E_STAGE10_PROJECT_TRUTH_WRITE_REJECTED', 'PROJECT_TRUTH_WRITE_REJECTED', { target });
      }
      if (error?.code === 'E_MAIN_PROJECT_MANIFEST_CAS_FAILED') {
        throw typedError('E_STAGE10_PROJECT_TRUTH_STALE', 'PROJECT_TRUTH_REVISION_CONFLICT');
      }
      if (error?.code === 'E_MAIN_PROJECT_MANIFEST_READBACK_MISMATCH') {
        throw typedError('E_STAGE10_PROJECT_TRUTH_STALE', 'PROJECT_TRUTH_READBACK_MISMATCH');
      }
      throw error;
    }
  }

  async function readExternalArtifactText(mutation) {
    try {
      return await fs.readFile(mutation.targetPath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_READ_FAILED', 'EXTERNAL_ARTIFACT_READ_FAILED', {
        code: error?.code || '',
      });
    }
  }

  async function assertExternalArtifactBefore(mutation) {
    const current = await readExternalArtifactText(mutation);
    if (mutation.previousExists) {
      if (current !== mutation.previousText || hashText(current) !== mutation.previousHash) {
        throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_CAS_FAILED', 'EXTERNAL_ARTIFACT_REVISION_CONFLICT');
      }
    } else if (current !== null) {
      throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_CAS_FAILED', 'EXTERNAL_ARTIFACT_UNEXPECTEDLY_EXISTS');
    }
  }

  async function syncParentDirectory(targetPath) {
    let directoryHandle;
    try {
      directoryHandle = await fs.open(path.dirname(targetPath), 'r');
      await directoryHandle.sync();
    } catch (error) {
      if (!['EINVAL', 'EPERM', 'EISDIR'].includes(error?.code)) throw error;
    } finally {
      await directoryHandle?.close().catch(() => undefined);
    }
  }

  async function syncFileAndParent(targetPath) {
    const fileHandle = await fs.open(targetPath, 'r');
    try {
      await fileHandle.sync();
    } finally {
      await fileHandle.close();
    }
    await syncParentDirectory(targetPath);
  }

  async function readArtifactPath(targetPath) {
    try {
      const text = await fs.readFile(targetPath, 'utf8');
      return { exists: true, text, hash: hashText(text) };
    } catch (error) {
      if (error?.code === 'ENOENT') return { exists: false, text: '', hash: '' };
      throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_READ_FAILED', 'EXTERNAL_ARTIFACT_READ_FAILED', {
        code: error?.code || '',
      });
    }
  }

  async function writeArtifactCandidate(reservation, mutation) {
    const current = await readArtifactPath(reservation.candidatePath);
    if (current.exists) {
      if (current.text !== mutation.nextText || current.hash !== mutation.nextHash) {
        throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_RESERVATION_FORKED', 'EXTERNAL_ARTIFACT_CANDIDATE_FORKED');
      }
      return;
    }
    await fs.mkdir(path.dirname(reservation.candidatePath), { recursive: true });
    let handle;
    try {
      handle = await fs.open(reservation.candidatePath, 'wx', 0o600);
      await handle.writeFile(mutation.nextText, 'utf8');
      await handle.sync();
    } catch (error) {
      if (error?.code === 'EEXIST') {
        const raced = await readArtifactPath(reservation.candidatePath);
        if (raced.text === mutation.nextText && raced.hash === mutation.nextHash) return;
      }
      throw error;
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }

  async function linkArtifactExclusive(sourcePath, targetPath, conflictReason) {
    try {
      await fs.link(sourcePath, targetPath);
      await syncFileAndParent(targetPath);
      return true;
    } catch (error) {
      if (error?.code === 'EEXIST') {
        throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_CAS_FAILED', conflictReason);
      }
      throw error;
    }
  }

  async function preserveTargetAtConflictPath(reservation) {
    const target = await readArtifactPath(reservation.targetPath);
    if (!target.exists) return;
    const conflict = await readArtifactPath(reservation.conflictPath);
    if (conflict.exists) {
      if (conflict.hash === target.hash && conflict.text === target.text) {
        await fs.unlink(reservation.targetPath);
        await syncParentDirectory(reservation.targetPath);
        return;
      }
      throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_RECOVERY_FORKED', 'EXTERNAL_ARTIFACT_CONFLICT_PATH_OCCUPIED');
    }
    await fs.rename(reservation.targetPath, reservation.conflictPath);
    await syncFileAndParent(reservation.conflictPath);
  }

  async function restoreReservedPrevious(mutation, reservation) {
    if (!mutation.previousExists) return;
    const target = await readArtifactPath(reservation.targetPath);
    if (target.exists) return;
    const backup = await readArtifactPath(reservation.backupPath);
    if (!backup.exists) {
      throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_RECOVERY_FORKED', 'EXTERNAL_ARTIFACT_PREVIOUS_BYTES_MISSING');
    }
    await linkArtifactExclusive(
      reservation.backupPath,
      reservation.targetPath,
      'EXTERNAL_ARTIFACT_RECOVERY_TARGET_OCCUPIED',
    );
  }

  async function publishExternalArtifactReserved(mutation, reservation, lease) {
    return lease.publish(async (proof) => {
      await writeArtifactCandidate(reservation, mutation);
      await killpoint('after-external-artifact-candidate');
      await proof.assertOwned();
      if (mutation.previousExists) {
        let backup = await readArtifactPath(reservation.backupPath);
        if (!backup.exists) {
          const before = await readArtifactPath(reservation.targetPath);
          if (!before.exists) {
            throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_CAS_FAILED', 'EXTERNAL_ARTIFACT_UNEXPECTEDLY_MISSING');
          }
          await proof.assertOwned();
          await fs.rename(reservation.targetPath, reservation.backupPath);
          await syncFileAndParent(reservation.backupPath);
          await killpoint('after-external-artifact-reserve');
          backup = await readArtifactPath(reservation.backupPath);
        }
        if (backup.text !== mutation.previousText || backup.hash !== mutation.previousHash) {
          await restoreReservedPrevious(mutation, reservation);
          throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_CAS_FAILED', 'EXTERNAL_ARTIFACT_REVISION_CONFLICT');
        }
      }
      const target = await readArtifactPath(reservation.targetPath);
      if (!target.exists) {
        await proof.assertOwned();
        await linkArtifactExclusive(
          reservation.candidatePath,
          reservation.targetPath,
          mutation.previousExists
            ? 'EXTERNAL_ARTIFACT_CONCURRENT_CREATE'
            : 'EXTERNAL_ARTIFACT_UNEXPECTEDLY_EXISTS',
        );
      } else if (target.text !== mutation.nextText || target.hash !== mutation.nextHash) {
        throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_CAS_FAILED', 'EXTERNAL_ARTIFACT_CONCURRENT_CREATE');
      }
      const readback = await readArtifactPath(reservation.targetPath);
      if (readback.text !== mutation.nextText || readback.hash !== mutation.nextHash) {
        throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_READBACK_MISMATCH', 'EXTERNAL_ARTIFACT_READBACK_MISMATCH');
      }
      if (mutation.previousExists) {
        const stableBackup = await readArtifactPath(reservation.backupPath);
        if (stableBackup.text !== mutation.previousText || stableBackup.hash !== mutation.previousHash) {
          await preserveTargetAtConflictPath(reservation);
          await restoreReservedPrevious(mutation, reservation);
          throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_CAS_FAILED', 'EXTERNAL_ARTIFACT_IN_PLACE_REVISION_CONFLICT');
        }
      }
      await proof.assertOwned();
    });
  }

  async function reconcileExternalArtifact(mutation, reservation, target, lease) {
    if (!mutation) return;
    if (!reservation) {
      const current = await readExternalArtifactText(mutation);
      if (target === 'next') {
        if (current !== mutation.nextText || hashText(current) !== mutation.nextHash) {
          throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_RECOVERY_FORKED', 'EXTERNAL_ARTIFACT_LEGACY_RECOVERY_FORKED');
        }
        return;
      }
      if (mutation.previousExists) {
        if (current === mutation.previousText && hashText(current) === mutation.previousHash) return;
        if (current !== mutation.nextText || hashText(current) !== mutation.nextHash) {
          throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_RECOVERY_FORKED', 'EXTERNAL_ARTIFACT_LEGACY_RECOVERY_FORKED');
        }
        const result = await writeFileAtomic(mutation.targetPath, mutation.previousText);
        if (result?.success === false || result?.ok === false) {
          throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_RECOVERY_WRITE_REJECTED', 'EXTERNAL_ARTIFACT_RECOVERY_WRITE_REJECTED');
        }
        return;
      }
      if (current !== null) {
        const preservedPath = `${mutation.targetPath}.stage10-aborted.${mutation.nextHash.slice(0, 12)}`;
        await fs.rename(mutation.targetPath, preservedPath);
      }
      return;
    }
    await lease.assertOwned();
    const current = await readArtifactPath(reservation.targetPath);
    if (target === 'next') {
      if (current.exists && current.text === mutation.nextText && current.hash === mutation.nextHash) return;
      if (current.exists && (current.text !== mutation.previousText || current.hash !== mutation.previousHash)) {
        throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_RECOVERY_FORKED', 'EXTERNAL_ARTIFACT_RECOVERY_FORKED');
      }
      await publishExternalArtifactReserved(mutation, reservation, lease);
      return;
    }
    if (current.exists && current.text === mutation.previousText && current.hash === mutation.previousHash) return;
    if (current.exists && current.text === mutation.nextText && current.hash === mutation.nextHash) {
      await lease.publish(async (proof) => {
        await proof.assertOwned();
        await preserveTargetAtConflictPath(reservation);
        await restoreReservedPrevious(mutation, reservation);
      });
      return;
    }
    if (!current.exists) {
      if (mutation.previousExists) {
        await lease.publish(() => restoreReservedPrevious(mutation, reservation));
      }
      return;
    }
    // Foreign bytes are the concurrent writer's accepted outcome. They are never overwritten.
    // The canonical Stage-10 bundle rolls back while the external target remains untouched.
  }

  async function cleanupExternalArtifactReservation(mutation, reservation, lease) {
    if (!mutation || !reservation) return;
    await lease.publish(async (proof) => {
      await proof.assertOwned();
      const candidate = await readArtifactPath(reservation.candidatePath);
      if (candidate.exists && (candidate.text !== mutation.nextText || candidate.hash !== mutation.nextHash)) {
        throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_RESERVATION_FORKED', 'EXTERNAL_ARTIFACT_CANDIDATE_FORKED');
      }
      await fs.unlink(reservation.candidatePath).catch((error) => {
        if (error?.code !== 'ENOENT') throw error;
      });
      await fs.unlink(reservation.backupPath).catch((error) => {
        if (error?.code !== 'ENOENT') throw error;
      });
      await syncParentDirectory(reservation.targetPath);
    });
  }

  async function writeProjectTruthRecovery(mutation, reason, previousIntegrityAnchorDigest, lease = null) {
    const paths = pathsFor(mutation.projectId);
    const recovery = {
      schemaVersion: 'yalken.stage10.projectTruthRecovery.v1',
      projectId: mutation.projectId,
      reason: normalizeString(reason),
      previousIntegrityAnchorDigest: normalizeString(previousIntegrityAnchorDigest),
      previousHash: mutation.previousHash,
      intendedNextHash: mutation.nextHash,
      previousText: mutation.previousText,
    };
    await writeJson(paths.projectTruthRecovery, recovery, 'projectTruthRecovery', lease);
    return recovery;
  }

  async function readRawBundle(projectId) {
    const paths = pathsFor(projectId);
    const [session, authorityStore, integrityAnchor, previousIntegrityAnchor] = await Promise.all([
      readJsonIfPresent(paths.session, 'session'),
      readJsonIfPresent(paths.authority, 'authority'),
      readJsonIfPresent(paths.anchor, 'anchor'),
      readJsonIfPresent(paths.anchorRecovery, 'anchorRecovery'),
    ]);
    const presence = [session, authorityStore, integrityAnchor].map(Boolean);
    if (presence.every((value) => value === false)) return null;
    if (!presence.every((value) => value === true)) {
      throw typedError('E_STAGE10_PERSISTENCE_SPLIT_STATE', 'PERSISTENCE_SPLIT_STATE_DETECTED', {
        session: Boolean(session),
        authority: Boolean(authorityStore),
        anchor: Boolean(integrityAnchor),
      });
    }
    return { session, authorityStore, integrityAnchor, previousIntegrityAnchor };
  }

  async function writeBundlePair(projectId, bundle, lease = null) {
    const paths = pathsFor(projectId);
    await writeJson(paths.authority, bundle.authorityStore, 'authority', lease);
    await killpoint('after-authority-write');
    await writeJson(paths.session, bundle.session, 'session', lease);
    await killpoint('after-session-write');
  }

  async function writeAnchor(projectId, anchor, previousAnchor, lease = null) {
    const paths = pathsFor(projectId);
    if (isPlainObject(previousAnchor)) {
      await writeJson(paths.anchorRecovery, previousAnchor, 'anchorRecovery', lease);
    }
    await writeJson(paths.anchor, anchor, 'anchor', lease);
    await killpoint('after-anchor-write');
  }

  async function verifyBundleReadback(projectId, expected, lease = null) {
    if (lease) await lease.assertOwned();
    const actual = await readRawBundle(projectId);
    if (!actual || bundleDigest(actual) !== bundleDigest(expected)) {
      throw typedError('E_STAGE10_PERSISTENCE_BUNDLE_READBACK_MISMATCH', 'PERSISTENCE_BUNDLE_READBACK_MISMATCH');
    }
    if (lease) await lease.assertOwned();
    return actual;
  }

  async function recoverPendingTransaction(projectId, lease) {
    if (lease) await lease.assertOwned();
    const paths = pathsFor(projectId);
    const transaction = await readJsonIfPresent(paths.transaction, 'transaction');
    if (!transaction) {
      if (lease) await lease.assertOwned();
      return false;
    }
    if (lease) await lease.assertOwned();
    const legacyV1 = transaction.schemaVersion === STAGE10_LEGACY_MAIN_TRANSACTION_SCHEMA;
    const legacyV2 = transaction.schemaVersion === STAGE10_LEGACY_MAIN_TRANSACTION_SCHEMA_V2;
    const legacyV3 = transaction.schemaVersion === STAGE10_LEGACY_MAIN_TRANSACTION_SCHEMA_V3;
    const legacyV4 = transaction.schemaVersion === STAGE10_LEGACY_MAIN_TRANSACTION_SCHEMA_V4;
    const legacyTransaction = legacyV1 || legacyV2 || legacyV3 || legacyV4;
    if (
      (!legacyTransaction && transaction.schemaVersion !== STAGE10_MAIN_TRANSACTION_SCHEMA)
      || normalizeString(transaction.projectId) !== normalizeString(projectId)
      || !isPlainObject(transaction.nextBundle)
      || (legacyV1 && (
        Object.prototype.hasOwnProperty.call(transaction, 'projectTruthMutation')
        || Object.prototype.hasOwnProperty.call(transaction, 'projectTruthMutationDigest')
      ))
    ) {
      throw typedError('E_STAGE10_PERSISTENCE_RECOVERY_INVALID', 'PERSISTENCE_RECOVERY_INVALID');
    }
    const currentAnchor = await readJsonIfPresent(paths.anchor, 'anchor');
    const previousBundle = isPlainObject(transaction.previousBundle) ? transaction.previousBundle : null;
    const nextBundle = transaction.nextBundle;
    const projectTruthMutation = normalizeProjectTruthMutation(projectId, transaction.projectTruthMutation);
    const projectTruthMutationDigest = normalizeString(transaction.projectTruthMutationDigest);
    const externalArtifactMutation = projectTruthMutation?.externalArtifactMutation || null;
    const externalArtifactReservation = legacyTransaction
      ? null
      : normalizeExternalArtifactReservation(
        projectId,
        externalArtifactMutation,
        transaction.externalArtifactReservation,
      );
    const externalArtifactReservationDigest = normalizeString(transaction.externalArtifactReservationDigest);
    const projectTruthDigestValid = legacyV1
      ? projectTruthMutation === null
      : projectTruthMutation
        ? projectTruthMutationDigest === hashCanonicalValue(projectTruthMutation)
        : projectTruthMutationDigest === hashCanonicalValue(null);
    if (
      normalizeString(transaction.nextBundleDigest) !== bundleDigest(nextBundle)
      || normalizeString(transaction.previousBundleDigest) !== bundleDigest(previousBundle)
      || !projectTruthDigestValid
      || (!legacyTransaction && (
        externalArtifactReservationDigest !== hashCanonicalValue(externalArtifactReservation)
        || Boolean(externalArtifactMutation) !== Boolean(externalArtifactReservation)
      ))
    ) {
      throw typedError('E_STAGE10_PERSISTENCE_RECOVERY_DIGEST_INVALID', 'PERSISTENCE_RECOVERY_TRANSACTION_DIGEST_INVALID');
    }
    if (!legacyV1 && !legacyV2) {
      const previousRevision = bundleRevision(previousBundle);
      const previousAuthorityHeadDigest = bundleAuthorityHeadDigest(previousBundle);
      if (
        Number(transaction.expectedPreviousRevision) !== previousRevision
        || normalizeString(transaction.expectedPreviousAuthorityHeadDigest) !== previousAuthorityHeadDigest
      ) {
        throw typedError('E_STAGE10_PERSISTENCE_RECOVERY_CAS_INVALID', 'PERSISTENCE_RECOVERY_CAS_BINDING_INVALID');
      }
    }
    if (!legacyV1 && !legacyV2 && !legacyV3) {
      const transactionGeneration = Number(transaction.fencingGeneration);
      const transactionOwnerTokenDigest = normalizeString(transaction.leaseOwnerTokenDigest);
      if (
        !lease
        || !Number.isSafeInteger(transactionGeneration)
        || transactionGeneration <= 0
        || transactionGeneration > Number(lease.fencingGeneration)
        || !/^[a-f0-9]{64}$/u.test(transactionOwnerTokenDigest)
        || normalizeString(transaction.fencingBindingDigest) !== transactionFencingBindingDigest(transaction)
        || (externalArtifactReservation && (
          externalArtifactReservation.fencingGeneration !== transactionGeneration
          || externalArtifactReservation.leaseOwnerTokenDigest !== transactionOwnerTokenDigest
        ))
        || (
          transactionGeneration === Number(lease.fencingGeneration)
          && transactionOwnerTokenDigest !== normalizeString(lease.ownerTokenDigest)
        )
      ) {
        throw typedError('E_STAGE10_PERSISTENCE_RECOVERY_FENCE_INVALID', 'PERSISTENCE_RECOVERY_FENCE_BINDING_INVALID');
      }
    }
    const currentDigest = normalizeString(currentAnchor?.integrityAnchorDigest);
    const previousDigest = normalizeString(previousBundle?.integrityAnchor?.integrityAnchorDigest);
    const nextDigest = normalizeString(nextBundle?.integrityAnchor?.integrityAnchorDigest);
    let target;
    if (currentDigest && currentDigest === nextDigest) {
      target = nextBundle;
    } else if (previousBundle && currentDigest === previousDigest) {
      target = previousBundle;
    } else if (!currentDigest && !previousBundle) {
      target = nextBundle;
    } else {
      throw typedError('E_STAGE10_PERSISTENCE_RECOVERY_FORKED', 'PERSISTENCE_RECOVERY_ANCHOR_FORKED');
    }
    const targetPreviousAnchor = target === nextBundle
      ? previousBundle?.integrityAnchor || null
      : await readJsonIfPresent(paths.anchorRecovery, 'anchorRecovery');
    validateBundleIntegrity(projectId, target, targetPreviousAnchor);
    if (projectTruthMutation) {
      if (lease) await lease.renew();
      const currentProjectTruth = await readProjectTruthText(projectTruthMutation);
      const currentProjectTruthHash = hashText(currentProjectTruth);
      if (
        currentProjectTruthHash !== projectTruthMutation.previousHash
        && currentProjectTruthHash !== projectTruthMutation.nextHash
      ) {
        throw typedError('E_STAGE10_PROJECT_TRUTH_RECOVERY_FORKED', 'PROJECT_TRUTH_RECOVERY_FORKED');
      }
      await writeProjectTruthText(projectTruthMutation, target === nextBundle ? 'next' : 'previous', lease);
      if (projectTruthMutation.externalArtifactMutation) {
        if (lease) await lease.renew();
        await reconcileExternalArtifact(
          projectTruthMutation.externalArtifactMutation,
          externalArtifactReservation,
          target === nextBundle ? 'next' : 'previous',
          lease,
        );
      }
    }
    if (lease) await lease.renew();
    await writeJson(paths.authority, target.authorityStore, 'recoveryAuthority', lease);
    if (lease) await lease.renew();
    await writeJson(paths.session, target.session, 'recoverySession', lease);
    if (!currentDigest || currentDigest !== normalizeString(target.integrityAnchor.integrityAnchorDigest)) {
      if (lease) await lease.renew();
      await writeAnchor(projectId, target.integrityAnchor, previousBundle?.integrityAnchor || null, lease);
    }
    await verifyBundleReadback(projectId, target, lease);
    if (projectTruthMutation?.externalArtifactMutation && externalArtifactReservation) {
      await cleanupExternalArtifactReservation(
        projectTruthMutation.externalArtifactMutation,
        externalArtifactReservation,
        lease,
      );
    }
    if (lease) await lease.renew();
    const removeTransaction = () => fs.unlink(paths.transaction).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
    if (lease) await lease.publish(removeTransaction);
    else await removeTransaction();
    recoveryConsumedProjects.add(projectStorageKey(projectId));
    return true;
  }

  return {
    schemaVersion: STAGE10_MAIN_PERSISTENCE_PORT_SCHEMA,
    async readStage10State(projectId) {
      await ensureProjectAnchorRootBinding(projectId);
      return serializeProjectOperation(projectId, () => leaseManager.withLease(projectId, async (lease) => {
        await recoverPendingTransaction(projectId, lease);
        const bundle = await readRawBundle(projectId);
        await lease.assertOwned();
        if (!bundle) return null;
        return {
          ...cloneJson(bundle),
          recoveryConsumed: recoveryConsumedProjects.has(projectStorageKey(projectId)),
        };
      }));
    },
    async commitStage10State(projectId, nextBundleInput, options = {}) {
      await ensureProjectAnchorRootBinding(projectId);
      return serializeProjectOperation(projectId, () => leaseManager.withLease(projectId, async (lease) => {
        const nextBundle = cloneJson(nextBundleInput);
        if (!isPlainObject(nextBundle.session) || !isPlainObject(nextBundle.authorityStore) || !isPlainObject(nextBundle.integrityAnchor)) {
          throw typedError('E_STAGE10_PERSISTENCE_BUNDLE_INVALID', 'PERSISTENCE_BUNDLE_REQUIRED');
        }
        await recoverPendingTransaction(projectId, lease);
        const previousBundle = await readRawBundle(projectId);
        const expectedPreviousDigest = normalizeString(options.expectedPreviousIntegrityAnchorDigest);
        const actualPreviousDigest = normalizeString(previousBundle?.integrityAnchor?.integrityAnchorDigest);
        if (expectedPreviousDigest !== actualPreviousDigest) {
          throw typedError('E_STAGE10_PERSISTENCE_STALE_COMMIT', 'PERSISTENCE_STALE_OR_ROLLED_BACK_COMMIT');
        }
        const expectedPreviousRevision = Number(options.expectedPreviousRevision);
        const actualPreviousRevision = bundleRevision(previousBundle);
        const expectedPreviousAuthorityHeadDigest = normalizeString(options.expectedPreviousAuthorityHeadDigest);
        const actualPreviousAuthorityHeadDigest = bundleAuthorityHeadDigest(previousBundle);
        if (!Number.isSafeInteger(expectedPreviousRevision) || expectedPreviousRevision !== actualPreviousRevision) {
          throw typedError('E_STAGE10_PERSISTENCE_REVISION_CAS_FAILED', 'PERSISTENCE_REVISION_CAS_FAILED', {
            expectedPreviousRevision,
            actualPreviousRevision,
          });
        }
        if (expectedPreviousAuthorityHeadDigest !== actualPreviousAuthorityHeadDigest) {
          throw typedError('E_STAGE10_PERSISTENCE_AUTHORITY_CAS_FAILED', 'PERSISTENCE_AUTHORITY_HEAD_CAS_FAILED');
        }
        await lease.renew({
          expectedRevision: expectedPreviousRevision,
          expectedAuthorityHeadDigest: expectedPreviousAuthorityHeadDigest,
        });
        validateBundleIntegrity(projectId, nextBundle, previousBundle?.integrityAnchor || null);
        const projectTruthMutation = normalizeProjectTruthMutation(projectId, options.projectTruthMutation);
        let externalArtifactReservation = null;
        if (projectTruthMutation) {
          await assertProjectTruthText(
            projectTruthMutation,
            projectTruthMutation.previousText,
            projectTruthMutation.previousHash,
            'PROJECT_TRUTH_REVISION_CONFLICT',
          );
          await writeProjectTruthRecovery(
            projectTruthMutation,
            options.reason,
            actualPreviousDigest,
            lease,
          );
          if (projectTruthMutation.externalArtifactMutation) {
            await assertExternalArtifactBefore(projectTruthMutation.externalArtifactMutation);
            externalArtifactReservation = createExternalArtifactReservation(
              projectId,
              projectTruthMutation.externalArtifactMutation,
              lease,
            );
          }
        }
        const transaction = {
          schemaVersion: STAGE10_MAIN_TRANSACTION_SCHEMA,
          projectId: normalizeString(projectId),
          reason: normalizeString(options.reason),
          previousBundle: previousBundle ? cloneJson(previousBundle) : null,
          nextBundle,
          previousBundleDigest: bundleDigest(previousBundle),
          nextBundleDigest: bundleDigest(nextBundle),
          projectTruthMutation,
          projectTruthMutationDigest: hashCanonicalValue(projectTruthMutation),
          externalArtifactReservation,
          externalArtifactReservationDigest: hashCanonicalValue(externalArtifactReservation),
          expectedPreviousRevision,
          expectedPreviousAuthorityHeadDigest,
          fencingGeneration: lease.fencingGeneration,
          leaseOwnerTokenDigest: lease.ownerTokenDigest,
        };
        transaction.fencingBindingDigest = transactionFencingBindingDigest(transaction);
        const paths = pathsFor(projectId);
        await lease.renew();
        await writeJson(paths.transaction, transaction, 'transaction', lease);
        await killpoint('after-transaction-write');
        await lease.renew();
        if (projectTruthMutation) {
          await writeProjectTruthText(projectTruthMutation, 'next', lease);
          await killpoint('after-project-truth-write');
          await lease.renew();
          if (projectTruthMutation.externalArtifactMutation) {
            await publishExternalArtifactReserved(
              projectTruthMutation.externalArtifactMutation,
              externalArtifactReservation,
              lease,
            );
            await killpoint('after-external-artifact-write');
            await lease.renew();
          }
        }
        await writeBundlePair(projectId, nextBundle, lease);
        await lease.renew();
        await lease.assertOwned();
        const pairReadback = await Promise.all([
          readJsonIfPresent(paths.session, 'session'),
          readJsonIfPresent(paths.authority, 'authority'),
        ]);
        if (!sameValue(pairReadback[0], nextBundle.session) || !sameValue(pairReadback[1], nextBundle.authorityStore)) {
          throw typedError('E_STAGE10_PERSISTENCE_PAIR_READBACK_MISMATCH', 'PERSISTENCE_PAIR_READBACK_MISMATCH');
        }
        await lease.assertOwned();
        await writeAnchor(projectId, nextBundle.integrityAnchor, previousBundle?.integrityAnchor || null, lease);
        await lease.renew();
        const verified = await verifyBundleReadback(projectId, nextBundle, lease);
        if (projectTruthMutation) {
          await lease.assertOwned();
          await assertProjectTruthText(
            projectTruthMutation,
            projectTruthMutation.nextText,
            projectTruthMutation.nextHash,
            'PROJECT_TRUTH_READBACK_MISMATCH',
          );
          if (projectTruthMutation.externalArtifactMutation) {
            const artifactReadback = await readExternalArtifactText(projectTruthMutation.externalArtifactMutation);
            if (
              artifactReadback !== projectTruthMutation.externalArtifactMutation.nextText
              || hashText(artifactReadback) !== projectTruthMutation.externalArtifactMutation.nextHash
            ) {
              throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_READBACK_MISMATCH', 'EXTERNAL_ARTIFACT_READBACK_MISMATCH');
            }
          }
          await lease.assertOwned();
        }
        if (projectTruthMutation?.externalArtifactMutation) {
          await cleanupExternalArtifactReservation(
            projectTruthMutation.externalArtifactMutation,
            externalArtifactReservation,
            lease,
          );
        }
        await lease.renew();
        await lease.publish(() => fs.unlink(paths.transaction));
        return {
          ok: true,
          schemaVersion: STAGE10_MAIN_PERSISTENCE_PORT_SCHEMA,
          storageWritten: true,
          atomicWrite: true,
          readbackVerified: true,
          interprocessLeaseHeld: true,
          fencingVerified: true,
          fencingGeneration: lease.fencingGeneration,
          revisionCasVerified: true,
          authorityCasVerified: true,
          recoveredExpiredLease: lease.recoveredExpiredLease === true,
          bundle: cloneJson(verified),
        };
      }));
    },
    async writeRecoverySnapshot(projectId, snapshotId, snapshotRecord) {
      await ensureProjectAnchorRootBinding(projectId);
      return serializeProjectOperation(projectId, () => leaseManager.withLease(projectId, async (lease) => {
        const paths = pathsFor(projectId);
        const safeSnapshotId = safeSnapshotKey(snapshotId);
        const targetPath = path.join(paths.recoveryRoot, `${safeSnapshotId}.json`);
        await recoverPendingTransaction(projectId, lease);
        const currentBundle = await readRawBundle(projectId);
        await lease.assertOwned();
        if (!currentBundle) {
          throw typedError('E_STAGE10_RECOVERY_CURRENT_STATE_MISSING', 'RECOVERY_CURRENT_STATE_REQUIRED');
        }
        const validated = validateStage10RecoverySnapshot(snapshotRecord, {
          projectId,
          lifecycleId: currentBundle.session?.lifecycleId,
          currentSession: currentBundle.session,
          currentAuthorityStore: currentBundle.authorityStore,
          currentIntegrityAnchor: currentBundle.integrityAnchor,
          requireCurrent: true,
        });
        if (!validated.ok || normalizeString(validated.snapshot?.snapshotId) !== normalizeString(snapshotId)) {
          throw typedError(
            validated.error?.code || 'E_STAGE10_RECOVERY_SNAPSHOT_ID_MISMATCH',
            validated.error?.reason || 'RECOVERY_SNAPSHOT_ID_MISMATCH',
            validated.error?.details,
          );
        }
        const existing = await readJsonIfPresent(targetPath, 'recoverySnapshot');
        if (existing && !sameValue(existing, validated.snapshot)) {
          throw typedError('E_STAGE10_RECOVERY_IMMUTABLE_CONFLICT', 'RECOVERY_SNAPSHOT_IMMUTABLE_CONFLICT');
        }
        await lease.renew();
        if (!existing) await writeJson(targetPath, validated.snapshot, 'recoverySnapshot', lease);
        return {
          ok: true,
          atomicWrite: true,
          readbackVerified: true,
          fencingVerified: true,
          fencingGeneration: lease.fencingGeneration,
        };
      }));
    },
    async readRecoverySnapshot(projectId, snapshotId) {
      await ensureProjectAnchorRootBinding(projectId);
      return serializeProjectOperation(projectId, () => leaseManager.withLease(projectId, async (lease) => {
        const paths = pathsFor(projectId);
        const safeSnapshotId = safeSnapshotKey(snapshotId);
        const snapshot = await readJsonIfPresent(
          path.join(paths.recoveryRoot, `${safeSnapshotId}.json`),
          'recoverySnapshot',
        );
        await lease.assertOwned();
        return snapshot;
      }));
    },
    paths(projectId) {
      return { ...pathsFor(projectId) };
    },
  };
}
