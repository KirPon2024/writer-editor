import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

import { stage10ProjectPathIdentity } from './stage10ProjectIdentityKey.mjs';

export const PROJECT_LEASE_SCHEMA_VERSION = 'yalken.mainProjectLease.v2';
export const PROJECT_LEASE_FENCE_SCHEMA_VERSION = 'yalken.mainProjectLeaseFence.v1';
export const PROJECT_LEASE_HEARTBEAT_SCHEMA_VERSION = 'yalken.mainProjectLeaseHeartbeat.v1';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function typedError(code, reason, details = {}) {
  return { code, op: 'project.lease', reason, details: isPlainObject(details) ? { ...details } : {} };
}

function projectIdentity(value) {
  const identity = stage10ProjectPathIdentity(value);
  if (!identity.ok) {
    throw typedError('E_PROJECT_LEASE_PROJECT_ID_INVALID', 'PROJECT_LEASE_PROJECT_ID_INVALID');
  }
  return identity;
}

function tokenDigest(value) {
  return createHash('sha256').update(Buffer.from(normalizeString(value), 'utf8')).digest('hex');
}

function defaultIsProcessAlive(ownerPid) {
  if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0) return false;
  try {
    process.kill(ownerPid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

async function readJsonRecord(targetPath) {
  let raw;
  try {
    raw = await fs.readFile(targetPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, value: null };
    throw error;
  }
  try {
    const value = JSON.parse(raw);
    return { exists: true, value: isPlainObject(value) ? value : null };
  } catch {
    return { exists: true, value: null };
  }
}

async function writeJsonAtomic(targetPath, value, ownerToken) {
  const temporaryPath = `${targetPath}.${process.pid}.${normalizeString(ownerToken)}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  try {
    await fs.rename(temporaryPath, targetPath);
  } finally {
    await fs.unlink(temporaryPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
}

function validFenceRecord(value, projectId) {
  return isPlainObject(value)
    && value.schemaVersion === PROJECT_LEASE_FENCE_SCHEMA_VERSION
    && normalizeString(value.projectId) === normalizeString(projectId)
    && Number.isSafeInteger(value.fencingGeneration)
    && value.fencingGeneration > 0
    && /^[a-f0-9]{64}$/u.test(normalizeString(value.ownerTokenDigest));
}

function validHeartbeatRecord(value, metadata) {
  return isPlainObject(value)
    && value.schemaVersion === PROJECT_LEASE_HEARTBEAT_SCHEMA_VERSION
    && normalizeString(value.projectId) === normalizeString(metadata?.projectId)
    && Number(value.fencingGeneration) === Number(metadata?.fencingGeneration)
    && normalizeString(value.ownerTokenDigest) === normalizeString(metadata?.ownerTokenDigest)
    && Number.isFinite(Number(value.expiresAtMs))
    && Number.isSafeInteger(Number(value.renewalCount))
    && Number(value.renewalCount) >= 0;
}

export function createProjectLeaseManager(input = {}) {
  const requestedLeaseRoot = normalizeString(input.leaseRoot);
  if (!requestedLeaseRoot) {
    throw typedError('E_PROJECT_LEASE_ROOT_INVALID', 'PROJECT_LEASE_ROOT_INVALID');
  }
  const leaseRoot = path.resolve(requestedLeaseRoot);
  if (leaseRoot === path.parse(leaseRoot).root) {
    throw typedError('E_PROJECT_LEASE_ROOT_INVALID', 'PROJECT_LEASE_ROOT_INVALID');
  }
  const clock = typeof input.nowMs === 'function' ? input.nowMs : () => Date.now();
  const isProcessAlive = typeof input.isProcessAlive === 'function'
    ? input.isProcessAlive
    : defaultIsProcessAlive;
  const requestedTtl = Number(input.ttlMs);
  const ttlMs = Number.isSafeInteger(requestedTtl)
    ? Math.min(60_000, Math.max(1_000, requestedTtl))
    : 15_000;
  const heartbeatIntervalMs = Math.max(250, Math.min(5_000, Math.floor(ttlMs / 3)));

  function pathsFor(projectId) {
    const identity = projectIdentity(projectId);
    const root = path.join(leaseRoot, identity.canonicalKey);
    const leaseDirectory = path.join(root, 'project-transaction.lease');
    return {
      projectId: identity.projectId,
      projectKey: identity.canonicalKey,
      legacyProjectKey: identity.legacyKey,
      root,
      leaseDirectory,
      metadata: path.join(leaseDirectory, 'owner.v2.json'),
      fence: path.join(root, 'fencing-generation.v1.json'),
    };
  }

  function heartbeatPath(paths, ownerTokenDigest) {
    const digest = normalizeString(ownerTokenDigest);
    if (!/^[a-f0-9]{64}$/u.test(digest)) return '';
    return path.join(paths.root, `lease-heartbeat.${digest}.v1.json`);
  }

  async function inspectLease(paths) {
    const [metadataRecord, fenceRecord] = await Promise.all([
      readJsonRecord(paths.metadata),
      readJsonRecord(paths.fence),
    ]);
    let modifiedAtMs = 0;
    try {
      modifiedAtMs = (await fs.stat(paths.leaseDirectory)).mtimeMs;
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return {
          exists: false,
          expired: false,
          ownerAlive: false,
          ownershipBound: false,
          metadata: null,
          fence: fenceRecord.value,
        };
      }
      throw error;
    }
    const metadata = metadataRecord.value;
    const fence = fenceRecord.value;
    const currentHeartbeatPath = heartbeatPath(paths, metadata?.ownerTokenDigest);
    const heartbeatRecord = currentHeartbeatPath
      ? await readJsonRecord(currentHeartbeatPath)
      : { exists: false, value: null };
    const heartbeat = validHeartbeatRecord(heartbeatRecord.value, metadata)
      ? heartbeatRecord.value
      : null;
    const expiresAtMs = Number(heartbeat?.expiresAtMs ?? metadata?.expiresAtMs);
    const expiry = Number.isFinite(expiresAtMs) ? expiresAtMs : modifiedAtMs + ttlMs;
    const metadataProjectMatches = normalizeString(metadata?.projectId) === paths.projectId;
    const ownerPid = Number(metadata?.ownerPid);
    let ownerProcessAlive = false;
    if (metadataProjectMatches && Number.isSafeInteger(ownerPid) && ownerPid > 0) {
      try {
        ownerProcessAlive = await isProcessAlive(ownerPid) === true;
      } catch {
        ownerProcessAlive = true;
      }
    }
    const ownershipBound = metadata?.schemaVersion === PROJECT_LEASE_SCHEMA_VERSION
      && metadataProjectMatches
      && normalizeString(metadata.ownerToken)
      && /^[a-f0-9]{64}$/u.test(normalizeString(metadata.ownerTokenDigest))
      && tokenDigest(metadata.ownerToken) === normalizeString(metadata.ownerTokenDigest)
      && validFenceRecord(fence, paths.projectId)
      && Number(metadata.fencingGeneration) === Number(fence.fencingGeneration)
      && normalizeString(metadata.ownerTokenDigest) === normalizeString(fence.ownerTokenDigest);
    const ownerAlive = ownershipBound && ownerProcessAlive;
    return {
      exists: true,
      expired: clock() >= expiry,
      ownerAlive,
      ownershipBound,
      metadata,
      fence,
      heartbeat,
    };
  }

  async function acquire(projectId) {
    const paths = pathsFor(projectId);
    await fs.mkdir(paths.root, { recursive: true });
    const ownerToken = randomUUID();
    const ownerTokenDigest = tokenDigest(ownerToken);
    let recoveredExpiredLease = false;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      let createdLeaseDirectory = false;
      try {
        await fs.mkdir(paths.leaseDirectory);
        createdLeaseDirectory = true;
        const previousFenceRecord = await readJsonRecord(paths.fence);
        if (previousFenceRecord.exists && !validFenceRecord(previousFenceRecord.value, paths.projectId)) {
          throw typedError('E_PROJECT_LEASE_FENCE_INVALID', 'PROJECT_LEASE_FENCE_INVALID', {
            projectId: paths.projectId,
          });
        }
        const previousGeneration = Number(previousFenceRecord.value?.fencingGeneration) || 0;
        const fencingGeneration = previousGeneration + 1;
        const acquiredAtMs = clock();
        const fence = {
          schemaVersion: PROJECT_LEASE_FENCE_SCHEMA_VERSION,
          projectId: paths.projectId,
          fencingGeneration,
          ownerTokenDigest,
          ownerPid: process.pid,
          issuedAtMs: acquiredAtMs,
        };
        await writeJsonAtomic(paths.fence, fence, ownerToken);
        const metadata = {
          schemaVersion: PROJECT_LEASE_SCHEMA_VERSION,
          projectId: paths.projectId,
          ownerToken,
          ownerTokenDigest,
          fencingGeneration,
          ownerPid: process.pid,
          acquiredAtMs,
          renewedAtMs: acquiredAtMs,
          expiresAtMs: acquiredAtMs + ttlMs,
          renewalCount: 0,
          expectedRevision: null,
          expectedAuthorityHeadDigest: '',
        };
        await writeJsonAtomic(paths.metadata, metadata, ownerToken);
        const heartbeat = {
          schemaVersion: PROJECT_LEASE_HEARTBEAT_SCHEMA_VERSION,
          projectId: paths.projectId,
          ownerTokenDigest,
          fencingGeneration,
          renewedAtMs: acquiredAtMs,
          expiresAtMs: acquiredAtMs + ttlMs,
          renewalCount: 0,
          expectedRevision: null,
          expectedAuthorityHeadDigest: '',
        };
        const currentHeartbeatPath = heartbeatPath(paths, ownerTokenDigest);
        await writeJsonAtomic(currentHeartbeatPath, heartbeat, ownerToken);
        const lease = {
          projectId: paths.projectId,
          ownerToken,
          ownerTokenDigest,
          fencingGeneration,
          paths: { ...paths, heartbeat: currentHeartbeatPath },
          metadata,
          heartbeat,
          recoveredExpiredLease,
          renewalTail: Promise.resolve(),
        };
        await assertOwned(lease);
        return lease;
      } catch (error) {
        if (error?.code !== 'EEXIST') {
          if (createdLeaseDirectory) {
            const failedHeartbeatPath = heartbeatPath(paths, ownerTokenDigest);
            await Promise.all([
              fs.unlink(failedHeartbeatPath).catch((unlinkError) => {
                if (unlinkError?.code !== 'ENOENT') throw unlinkError;
              }),
              fs.rm(paths.leaseDirectory, { recursive: true, force: true }),
            ]);
          }
          throw error;
        }
        const existing = await inspectLease(paths);
        if (!existing.exists) continue;
        if (!existing.expired || existing.ownerAlive) {
          throw typedError('E_PROJECT_LEASE_HELD', 'PROJECT_LEASE_HELD_BY_ANOTHER_PROCESS', {
            projectId: paths.projectId,
            ownerPid: Number(existing.metadata?.ownerPid) || 0,
            expiresAtMs: Number(existing.heartbeat?.expiresAtMs ?? existing.metadata?.expiresAtMs) || 0,
            ownerAlive: existing.ownerAlive,
            fencingGeneration: Number(existing.metadata?.fencingGeneration) || 0,
          });
        }
        const expiredPath = `${paths.leaseDirectory}.expired.${clock()}.${ownerToken}`;
        try {
          await fs.rename(paths.leaseDirectory, expiredPath);
          recoveredExpiredLease = true;
          const expiredHeartbeatPath = heartbeatPath(paths, existing.metadata?.ownerTokenDigest);
          if (expiredHeartbeatPath) {
            await fs.unlink(expiredHeartbeatPath).catch((unlinkError) => {
              if (unlinkError?.code !== 'ENOENT') throw unlinkError;
            });
          }
          await fs.rm(expiredPath, { recursive: true, force: true });
        } catch (renameError) {
          if (renameError?.code !== 'ENOENT') throw renameError;
        }
      }
    }
    throw typedError('E_PROJECT_LEASE_ACQUIRE_RACE', 'PROJECT_LEASE_ACQUIRE_RACE');
  }

  async function assertOwned(lease) {
    const [metadataRecord, fenceRecord] = await Promise.all([
      readJsonRecord(lease?.paths?.metadata),
      readJsonRecord(lease?.paths?.fence),
    ]);
    const metadata = metadataRecord.value;
    const fence = fenceRecord.value;
    if (
      metadata?.schemaVersion !== PROJECT_LEASE_SCHEMA_VERSION
      || normalizeString(metadata.projectId) !== normalizeString(lease?.projectId)
      || normalizeString(metadata.ownerToken) !== normalizeString(lease?.ownerToken)
      || normalizeString(metadata.ownerTokenDigest) !== normalizeString(lease?.ownerTokenDigest)
      || tokenDigest(metadata.ownerToken) !== normalizeString(metadata.ownerTokenDigest)
      || Number(metadata.fencingGeneration) !== Number(lease?.fencingGeneration)
      || !validFenceRecord(fence, lease?.projectId)
      || Number(fence.fencingGeneration) !== Number(lease?.fencingGeneration)
      || normalizeString(fence.ownerTokenDigest) !== normalizeString(lease?.ownerTokenDigest)
    ) {
      throw typedError('E_PROJECT_LEASE_OWNERSHIP_LOST', 'PROJECT_LEASE_OWNERSHIP_LOST', {
        projectId: normalizeString(lease?.projectId),
        fencingGeneration: Number(lease?.fencingGeneration) || 0,
      });
    }
    return metadata;
  }

  async function renewNow(lease, binding = {}) {
    await assertOwned(lease);
    const renewedAtMs = clock();
    const next = {
      schemaVersion: PROJECT_LEASE_HEARTBEAT_SCHEMA_VERSION,
      projectId: lease.projectId,
      ownerTokenDigest: lease.ownerTokenDigest,
      fencingGeneration: lease.fencingGeneration,
      renewedAtMs,
      expiresAtMs: renewedAtMs + ttlMs,
      renewalCount: Number(lease.heartbeat?.renewalCount || 0) + 1,
      expectedRevision: Number.isSafeInteger(binding.expectedRevision)
        ? binding.expectedRevision
        : lease.heartbeat?.expectedRevision,
      expectedAuthorityHeadDigest: normalizeString(binding.expectedAuthorityHeadDigest)
        || normalizeString(lease.heartbeat?.expectedAuthorityHeadDigest),
    };
    await writeJsonAtomic(lease.paths.heartbeat, next, lease.ownerToken);
    lease.heartbeat = next;
    await assertOwned(lease);
    return next;
  }

  function renew(lease, binding = {}) {
    const pending = lease.renewalTail
      .catch(() => undefined)
      .then(() => renewNow(lease, binding));
    lease.renewalTail = pending;
    return pending;
  }

  async function publish(lease, operation) {
    if (typeof operation !== 'function') {
      throw typedError('E_PROJECT_LEASE_PUBLICATION_INVALID', 'PROJECT_LEASE_PUBLICATION_REQUIRED');
    }
    await assertOwned(lease);
    const result = await operation({
      projectId: lease.projectId,
      fencingGeneration: lease.fencingGeneration,
      ownerTokenDigest: lease.ownerTokenDigest,
    });
    await assertOwned(lease);
    return result;
  }

  function startHeartbeat(lease) {
    let stopped = false;
    let lastFailure = null;
    const timer = setInterval(() => {
      if (stopped) return;
      renew(lease).catch((error) => {
        lastFailure = error;
      });
    }, heartbeatIntervalMs);
    timer.unref?.();
    return async () => {
      stopped = true;
      clearInterval(timer);
      await lease.renewalTail.catch(() => undefined);
      if (lastFailure) await assertOwned(lease);
    };
  }

  async function release(lease) {
    const [metadataRecord, fenceRecord] = await Promise.all([
      readJsonRecord(lease?.paths?.metadata),
      readJsonRecord(lease?.paths?.fence),
    ]);
    const metadata = metadataRecord.value;
    const fence = fenceRecord.value;
    const stillOwner = (
      normalizeString(metadata?.ownerToken) !== normalizeString(lease?.ownerToken)
      || Number(metadata?.fencingGeneration) !== Number(lease?.fencingGeneration)
      || !validFenceRecord(fence, lease?.projectId)
      || Number(fence.fencingGeneration) !== Number(lease?.fencingGeneration)
      || normalizeString(fence.ownerTokenDigest) !== normalizeString(lease?.ownerTokenDigest)
    ) === false;
    if (!stillOwner) {
      if (lease?.paths?.heartbeat) {
        await fs.unlink(lease.paths.heartbeat).catch((error) => {
          if (error?.code !== 'ENOENT') throw error;
        });
      }
      return false;
    }
    await fs.unlink(lease.paths.heartbeat).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
    await fs.unlink(lease.paths.metadata).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
    await fs.rmdir(lease.paths.leaseDirectory).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
    return true;
  }

  async function withLease(projectId, operation) {
    if (typeof operation !== 'function') {
      throw typedError('E_PROJECT_LEASE_OPERATION_INVALID', 'PROJECT_LEASE_OPERATION_REQUIRED');
    }
    const lease = await acquire(projectId);
    lease.assertOwned = () => assertOwned(lease);
    lease.renew = (binding) => renew(lease, binding);
    lease.publish = (publication) => publish(lease, publication);
    const stopHeartbeat = startHeartbeat(lease);
    try {
      return await operation(lease);
    } finally {
      await stopHeartbeat();
      await release(lease);
    }
  }

  return Object.freeze({
    schemaVersion: PROJECT_LEASE_SCHEMA_VERSION,
    fenceSchemaVersion: PROJECT_LEASE_FENCE_SCHEMA_VERSION,
    heartbeatSchemaVersion: PROJECT_LEASE_HEARTBEAT_SCHEMA_VERSION,
    ttlMs,
    heartbeatIntervalMs,
    acquire,
    inspect: async (projectId) => inspectLease(pathsFor(projectId)),
    assertOwned,
    renew,
    publish,
    release,
    withLease,
    paths: pathsFor,
  });
}
