import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';

import { stage10ProjectPathIdentity } from './stage10ProjectIdentityKey.mjs';

export const PROJECT_LEASE_SCHEMA_VERSION = 'yalken.mainProjectLease.v3';
export const PROJECT_LEASE_FENCE_SCHEMA_VERSION = 'yalken.mainProjectLeaseFence.v2';
export const PROJECT_LEASE_HEARTBEAT_SCHEMA_VERSION = 'yalken.mainProjectLeaseHeartbeat.v2';
const LEGACY_PROJECT_LEASE_SCHEMA_V2 = 'yalken.mainProjectLease.v2';
const LEGACY_PROJECT_LEASE_SCHEMA_V1 = 'yalken.mainProjectLease.v1';
const LEGACY_PROJECT_LEASE_FENCE_SCHEMA = 'yalken.mainProjectLeaseFence.v1';
const LEGACY_PROJECT_LEASE_HEARTBEAT_SCHEMA = 'yalken.mainProjectLeaseHeartbeat.v1';

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

function defaultMonotonicNowMs() {
  return Number(process.hrtime.bigint() / 1_000_000n);
}

function processInstanceGuardEndpoint(ownerTokenDigest) {
  const endpointKey = createHash('sha256')
    .update(Buffer.from(`yalken.projectLease.guard:${ownerTokenDigest}`, 'utf8'))
    .digest('hex');
  if (process.platform === 'win32') return `\\\\.\\pipe\\yalken-project-lease-${endpointKey}`;
  return path.join(os.tmpdir(), `yalken-project-lease-${endpointKey}.sock`);
}

function probeProcessInstanceGuard(endpoint, timeoutMs = 500) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (alive) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(alive);
    };
    const socket = net.createConnection(endpoint);
    const timer = setTimeout(() => finish(false), timeoutMs);
    timer.unref?.();
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

async function startProcessInstanceGuard(ownerTokenDigest) {
  const endpoint = processInstanceGuardEndpoint(ownerTokenDigest);
  if (process.platform !== 'win32') {
    const active = await probeProcessInstanceGuard(endpoint);
    if (active) {
      throw typedError('E_PROJECT_LEASE_PROCESS_GUARD_COLLISION', 'PROJECT_LEASE_PROCESS_GUARD_COLLISION');
    }
    await fs.unlink(endpoint).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
  const server = net.createServer((socket) => socket.destroy());
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(endpoint);
  });
  server.unref();
  let closed = false;
  return {
    endpoint,
    async close() {
      if (closed) return;
      closed = true;
      await new Promise((resolve) => server.close(() => resolve()));
      if (process.platform !== 'win32') {
        await fs.unlink(endpoint).catch((error) => {
          if (error?.code !== 'ENOENT') throw error;
        });
      }
    },
  };
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

async function writeJsonAtomic(targetPath, value) {
  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  try {
    await fs.rename(temporaryPath, targetPath);
  } finally {
    await fs.unlink(temporaryPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
}

function validFenceRecord(value, projectId, options = {}) {
  if (!isPlainObject(value)
    || normalizeString(value.projectId) !== normalizeString(projectId)
    || !Number.isSafeInteger(value.fencingGeneration)
    || value.fencingGeneration <= 0
    || !/^[a-f0-9]{64}$/u.test(normalizeString(value.ownerTokenDigest))) {
    return false;
  }
  if (value.schemaVersion === PROJECT_LEASE_FENCE_SCHEMA_VERSION) {
    return Boolean(normalizeString(value.processInstanceId));
  }
  return options.allowLegacy === true && value.schemaVersion === LEGACY_PROJECT_LEASE_FENCE_SCHEMA;
}

function validHeartbeatRecord(value, metadata) {
  if (!isPlainObject(value)
    || normalizeString(value.projectId) !== normalizeString(metadata?.projectId)
    || Number(value.fencingGeneration) !== Number(metadata?.fencingGeneration)
    || normalizeString(value.ownerTokenDigest) !== normalizeString(metadata?.ownerTokenDigest)
    || !Number.isSafeInteger(Number(value.renewalCount))
    || Number(value.renewalCount) < 0) {
    return false;
  }
  if (value.schemaVersion === PROJECT_LEASE_HEARTBEAT_SCHEMA_VERSION) {
    return normalizeString(value.processInstanceId) === normalizeString(metadata?.processInstanceId)
      && Number.isFinite(Number(value.monotonicRenewedAtMs))
      && Number.isFinite(Number(value.monotonicExpiresAtMs))
      && Number(value.monotonicExpiresAtMs) > Number(value.monotonicRenewedAtMs);
  }
  return value.schemaVersion === LEGACY_PROJECT_LEASE_HEARTBEAT_SCHEMA
    && Number.isFinite(Number(value.expiresAtMs));
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
  const monotonicClock = typeof input.nowMonotonicMs === 'function'
    ? input.nowMonotonicMs
    : (typeof input.nowMs === 'function' ? input.nowMs : defaultMonotonicNowMs);
  const requestedTtl = Number(input.ttlMs);
  const ttlMs = Number.isSafeInteger(requestedTtl)
    ? Math.min(60_000, Math.max(1_000, requestedTtl))
    : 15_000;
  const heartbeatIntervalMs = Math.max(250, Math.min(5_000, Math.floor(ttlMs / 3)));
  const processInstanceId = normalizeString(input.processInstanceId)
    || `${process.pid}:${randomUUID()}`;
  const useHeartbeatWorker = input.useHeartbeatWorker !== false;
  const useProcessInstanceGuard = input.useProcessInstanceGuard !== false
    && typeof input.nowMs !== 'function'
    && typeof input.nowMonotonicMs !== 'function';

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
      metadata: path.join(leaseDirectory, 'owner.v3.json'),
      legacyMetadataV2: path.join(leaseDirectory, 'owner.v2.json'),
      legacyMetadataV1: path.join(leaseDirectory, 'owner.v1.json'),
      fence: path.join(root, 'fencing-generation.v1.json'),
    };
  }

  function heartbeatPath(paths, ownerTokenDigest, version = 2) {
    const digest = normalizeString(ownerTokenDigest);
    if (!/^[a-f0-9]{64}$/u.test(digest)) return '';
    return path.join(paths.root, `lease-heartbeat.${digest}.v${version}.json`);
  }

  async function readLeaseMetadata(paths) {
    const current = await readJsonRecord(paths.metadata);
    if (current.exists) return current;
    const legacyV2 = await readJsonRecord(paths.legacyMetadataV2);
    if (legacyV2.exists) return legacyV2;
    return readJsonRecord(paths.legacyMetadataV1);
  }

  async function inspectLease(paths) {
    const [metadataRecord, fenceRecord] = await Promise.all([
      readLeaseMetadata(paths),
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
          heartbeat: null,
        };
      }
      throw error;
    }
    const metadata = metadataRecord.value;
    const fence = fenceRecord.value;
    const currentMetadata = metadata?.schemaVersion === PROJECT_LEASE_SCHEMA_VERSION;
    const currentHeartbeatPath = heartbeatPath(paths, metadata?.ownerTokenDigest, currentMetadata ? 2 : 1);
    const heartbeatRecord = currentHeartbeatPath
      ? await readJsonRecord(currentHeartbeatPath)
      : { exists: false, value: null };
    let heartbeatModifiedAtMs = 0;
    if (heartbeatRecord.exists && currentHeartbeatPath) {
      try {
        heartbeatModifiedAtMs = (await fs.stat(currentHeartbeatPath)).mtimeMs;
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    const heartbeat = validHeartbeatRecord(heartbeatRecord.value, metadata)
      ? heartbeatRecord.value
      : null;
    const metadataProjectMatches = normalizeString(metadata?.projectId) === paths.projectId;
    const ownershipBound = currentMetadata
      && metadataProjectMatches
      && normalizeString(metadata.ownerToken)
      && /^[a-f0-9]{64}$/u.test(normalizeString(metadata.ownerTokenDigest))
      && tokenDigest(metadata.ownerToken) === normalizeString(metadata.ownerTokenDigest)
      && normalizeString(metadata.processInstanceId)
      && validFenceRecord(fence, paths.projectId)
      && Number(metadata.fencingGeneration) === Number(fence.fencingGeneration)
      && normalizeString(metadata.ownerTokenDigest) === normalizeString(fence.ownerTokenDigest)
      && normalizeString(metadata.processInstanceId) === normalizeString(fence.processInstanceId);
    let expired;
    let processInstanceAlive = false;
    if (ownershipBound && heartbeat?.schemaVersion === PROJECT_LEASE_HEARTBEAT_SCHEMA_VERSION) {
      const monotonicNowMs = monotonicClock();
      const monotonicRenewedAtMs = Number(heartbeat.monotonicRenewedAtMs);
      const monotonicExpiresAtMs = Number(heartbeat.monotonicExpiresAtMs);
      const durationMs = monotonicExpiresAtMs - monotonicRenewedAtMs;
      const saneMonotonicWindow = durationMs > 0
        && durationMs <= ttlMs
        && monotonicRenewedAtMs <= monotonicNowMs + heartbeatIntervalMs;
      expired = !saneMonotonicWindow || monotonicNowMs >= monotonicExpiresAtMs;
    } else {
      const expiresAtMs = Number(heartbeat?.expiresAtMs ?? metadata?.expiresAtMs);
      const freshnessBaseMs = heartbeatModifiedAtMs || modifiedAtMs;
      const boundedExpiryMs = freshnessBaseMs + ttlMs;
      const expiry = Number.isFinite(expiresAtMs)
        ? Math.min(expiresAtMs, boundedExpiryMs)
        : boundedExpiryMs;
      expired = clock() >= expiry;
    }
    if (expired && ownershipBound && currentMetadata && useProcessInstanceGuard) {
      processInstanceAlive = await probeProcessInstanceGuard(
        processInstanceGuardEndpoint(metadata.ownerTokenDigest),
      );
      if (processInstanceAlive) expired = false;
    }
    return {
      exists: true,
      expired,
      ownerAlive: ownershipBound && !expired && (Boolean(heartbeat) || processInstanceAlive),
      processInstanceAlive,
      ownershipBound,
      metadata,
      fence,
      heartbeat,
    };
  }

  function makeHeartbeat(lease, binding = {}) {
    const renewedAtMs = clock();
    const monotonicRenewedAtMs = monotonicClock();
    return {
      schemaVersion: PROJECT_LEASE_HEARTBEAT_SCHEMA_VERSION,
      projectId: lease.projectId,
      processInstanceId: lease.processInstanceId,
      ownerTokenDigest: lease.ownerTokenDigest,
      fencingGeneration: lease.fencingGeneration,
      renewedAtMs,
      expiresAtMs: renewedAtMs + ttlMs,
      monotonicRenewedAtMs,
      monotonicExpiresAtMs: monotonicRenewedAtMs + ttlMs,
      renewalCount: Number(lease.heartbeat?.renewalCount || 0) + 1,
      expectedRevision: Number.isSafeInteger(binding.expectedRevision)
        ? binding.expectedRevision
        : lease.heartbeat?.expectedRevision ?? null,
      expectedAuthorityHeadDigest: normalizeString(binding.expectedAuthorityHeadDigest)
        || normalizeString(lease.heartbeat?.expectedAuthorityHeadDigest),
    };
  }

  async function acquire(projectId) {
    const paths = pathsFor(projectId);
    await fs.mkdir(paths.root, { recursive: true });
    const ownerToken = randomUUID();
    const ownerTokenDigest = tokenDigest(ownerToken);
    let recoveredExpiredLease = false;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      let createdLeaseDirectory = false;
      let processInstanceGuard = null;
      try {
        await fs.mkdir(paths.leaseDirectory);
        createdLeaseDirectory = true;
        if (useProcessInstanceGuard) {
          processInstanceGuard = await startProcessInstanceGuard(ownerTokenDigest);
        }
        const previousFenceRecord = await readJsonRecord(paths.fence);
        if (previousFenceRecord.exists && !validFenceRecord(previousFenceRecord.value, paths.projectId, { allowLegacy: true })) {
          throw typedError('E_PROJECT_LEASE_FENCE_INVALID', 'PROJECT_LEASE_FENCE_INVALID', {
            projectId: paths.projectId,
          });
        }
        const previousGeneration = Number(previousFenceRecord.value?.fencingGeneration) || 0;
        const fencingGeneration = previousGeneration + 1;
        const acquiredAtMs = clock();
        const monotonicAcquiredAtMs = monotonicClock();
        const fence = {
          schemaVersion: PROJECT_LEASE_FENCE_SCHEMA_VERSION,
          projectId: paths.projectId,
          processInstanceId,
          fencingGeneration,
          ownerTokenDigest,
          ownerPid: process.pid,
          issuedAtMs: acquiredAtMs,
          monotonicIssuedAtMs: monotonicAcquiredAtMs,
        };
        await writeJsonAtomic(paths.fence, fence);
        const metadata = {
          schemaVersion: PROJECT_LEASE_SCHEMA_VERSION,
          projectId: paths.projectId,
          processInstanceId,
          ownerToken,
          ownerTokenDigest,
          fencingGeneration,
          ownerPid: process.pid,
          acquiredAtMs,
          renewedAtMs: acquiredAtMs,
          expiresAtMs: acquiredAtMs + ttlMs,
          monotonicAcquiredAtMs,
          monotonicExpiresAtMs: monotonicAcquiredAtMs + ttlMs,
          renewalCount: 0,
          expectedRevision: null,
          expectedAuthorityHeadDigest: '',
        };
        await writeJsonAtomic(paths.metadata, metadata);
        const lease = {
          projectId: paths.projectId,
          processInstanceId,
          ownerToken,
          ownerTokenDigest,
          fencingGeneration,
          paths: { ...paths, heartbeat: heartbeatPath(paths, ownerTokenDigest, 2) },
          metadata,
          heartbeat: null,
          heartbeatController: null,
          processInstanceGuard,
          recoveredExpiredLease,
          renewalTail: Promise.resolve(),
        };
        lease.heartbeat = makeHeartbeat(lease);
        lease.heartbeat.renewalCount = 0;
        await writeJsonAtomic(lease.paths.heartbeat, lease.heartbeat);
        await assertOwned(lease);
        return lease;
      } catch (error) {
        if (error?.code !== 'EEXIST') {
          await processInstanceGuard?.close().catch(() => undefined);
          if (createdLeaseDirectory) {
            const failedHeartbeatPath = heartbeatPath(paths, ownerTokenDigest, 2);
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
        if (!existing.expired) {
          throw typedError('E_PROJECT_LEASE_HELD', 'PROJECT_LEASE_HELD_BY_ANOTHER_PROCESS', {
            projectId: paths.projectId,
            ownerPid: Number(existing.metadata?.ownerPid) || 0,
            expiresAtMs: Number(existing.heartbeat?.expiresAtMs ?? existing.metadata?.expiresAtMs) || 0,
            monotonicExpiresAtMs: Number(existing.heartbeat?.monotonicExpiresAtMs) || 0,
            ownerAlive: existing.ownerAlive,
            processInstanceAlive: existing.processInstanceAlive,
            processInstanceId: normalizeString(existing.metadata?.processInstanceId),
            fencingGeneration: Number(existing.metadata?.fencingGeneration) || 0,
          });
        }
        const expiredPath = `${paths.leaseDirectory}.expired.${process.pid}.${randomUUID()}`;
        try {
          await fs.rename(paths.leaseDirectory, expiredPath);
          recoveredExpiredLease = true;
          const version = existing.metadata?.schemaVersion === PROJECT_LEASE_SCHEMA_VERSION ? 2 : 1;
          const expiredHeartbeatPath = heartbeatPath(paths, existing.metadata?.ownerTokenDigest, version);
          if (expiredHeartbeatPath) {
            await fs.unlink(expiredHeartbeatPath).catch((unlinkError) => {
              if (unlinkError?.code !== 'ENOENT') throw unlinkError;
            });
          }
          if (
            useProcessInstanceGuard
            && process.platform !== 'win32'
            && /^[a-f0-9]{64}$/u.test(normalizeString(existing.metadata?.ownerTokenDigest))
          ) {
            await fs.unlink(processInstanceGuardEndpoint(existing.metadata.ownerTokenDigest)).catch((unlinkError) => {
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
      || normalizeString(metadata.processInstanceId) !== normalizeString(lease?.processInstanceId)
      || normalizeString(metadata.ownerToken) !== normalizeString(lease?.ownerToken)
      || normalizeString(metadata.ownerTokenDigest) !== normalizeString(lease?.ownerTokenDigest)
      || tokenDigest(metadata.ownerToken) !== normalizeString(metadata.ownerTokenDigest)
      || Number(metadata.fencingGeneration) !== Number(lease?.fencingGeneration)
      || !validFenceRecord(fence, lease?.projectId)
      || normalizeString(fence.processInstanceId) !== normalizeString(lease?.processInstanceId)
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
    if (typeof lease.heartbeatController === 'function') {
      const heartbeat = await lease.heartbeatController(binding);
      lease.heartbeat = heartbeat;
      await assertOwned(lease);
      return heartbeat;
    }
    const next = makeHeartbeat(lease, binding);
    await writeJsonAtomic(lease.paths.heartbeat, next);
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
    const proof = {
      projectId: lease.projectId,
      processInstanceId: lease.processInstanceId,
      fencingGeneration: lease.fencingGeneration,
      ownerTokenDigest: lease.ownerTokenDigest,
      assertOwned: () => assertOwned(lease),
    };
    const result = await operation(proof);
    await assertOwned(lease);
    return result;
  }

  async function startTimerHeartbeat(lease) {
    let stopped = false;
    let lastFailure = null;
    const timer = setInterval(() => {
      if (!stopped) renew(lease).catch((error) => { lastFailure = error; });
    }, heartbeatIntervalMs);
    timer.unref?.();
    return async () => {
      stopped = true;
      clearInterval(timer);
      await lease.renewalTail.catch(() => undefined);
      if (lastFailure) await assertOwned(lease);
    };
  }

  async function startWorkerHeartbeat(lease) {
    const worker = new Worker(new URL('./projectLeaseHeartbeatWorker.mjs', import.meta.url), {
      execArgv: process.execArgv.filter((argument) => !argument.startsWith('--input-type')),
      workerData: {
        projectId: lease.projectId,
        processInstanceId: lease.processInstanceId,
        ownerTokenDigest: lease.ownerTokenDigest,
        fencingGeneration: lease.fencingGeneration,
        metadataPath: lease.paths.metadata,
        fencePath: lease.paths.fence,
        heartbeatPath: lease.paths.heartbeat,
        ttlMs,
        intervalMs: heartbeatIntervalMs,
        initialRenewalCount: lease.heartbeat?.renewalCount || 0,
        expectedRevision: lease.heartbeat?.expectedRevision ?? null,
        expectedAuthorityHeadDigest: lease.heartbeat?.expectedAuthorityHeadDigest || '',
      },
    });
    worker.unref();
    let stopped = false;
    let fatal = null;
    let requestSequence = 0;
    const pending = new Map();
    let resolveReady;
    let rejectReady;
    const ready = new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    let resolveStopped;
    const stoppedPromise = new Promise((resolve) => { resolveStopped = resolve; });
    const fail = (error) => {
      fatal = error?.code
        ? error
        : typedError('E_PROJECT_LEASE_HEARTBEAT_FAILED', 'PROJECT_LEASE_HEARTBEAT_FAILED', {
          message: normalizeString(error?.message),
        });
      rejectReady(fatal);
      for (const waiter of pending.values()) waiter.reject(fatal);
      pending.clear();
    };
    worker.on('message', (message) => {
      if (message?.heartbeat) lease.heartbeat = message.heartbeat;
      if (message?.type === 'ready') {
        resolveReady(message.heartbeat);
      } else if (message?.type === 'renewed') {
        const waiter = pending.get(String(message.requestId || ''));
        if (waiter) {
          pending.delete(String(message.requestId || ''));
          waiter.resolve(message.heartbeat);
        }
      } else if (message?.type === 'fatal') {
        const error = typedError(
          message.code || 'E_PROJECT_LEASE_HEARTBEAT_FAILED',
          message.reason || 'PROJECT_LEASE_HEARTBEAT_FAILED',
        );
        const waiter = pending.get(String(message.requestId || ''));
        if (waiter) {
          pending.delete(String(message.requestId || ''));
          waiter.reject(error);
        }
        fail(error);
      } else if (message?.type === 'stopped') {
        resolveStopped();
      }
    });
    worker.once('error', fail);
    worker.once('exit', (code) => {
      resolveStopped();
      if (!stopped && code !== 0) {
        fail(typedError('E_PROJECT_LEASE_HEARTBEAT_EXITED', 'PROJECT_LEASE_HEARTBEAT_EXITED', { code }));
      }
    });
    const startupTimer = setTimeout(() => {
      fail(typedError('E_PROJECT_LEASE_HEARTBEAT_START_TIMEOUT', 'PROJECT_LEASE_HEARTBEAT_START_TIMEOUT'));
    }, Math.max(5_000, ttlMs * 2));
    startupTimer.unref?.();
    try {
      await ready;
    } catch (error) {
      stopped = true;
      try {
        worker.postMessage({ type: 'stop' });
      } catch {}
      await worker.terminate().catch(() => undefined);
      throw error;
    } finally {
      clearTimeout(startupTimer);
    }
    lease.heartbeatController = (binding = {}) => {
      if (fatal) return Promise.reject(fatal);
      const requestId = `${process.pid}:${++requestSequence}`;
      const response = new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }));
      worker.postMessage({ type: 'renew', requestId, binding });
      return response;
    };
    return async () => {
      stopped = true;
      lease.heartbeatController = null;
      await lease.renewalTail.catch(() => undefined);
      worker.postMessage({ type: 'stop' });
      const stopTimer = setTimeout(() => worker.terminate().catch(() => undefined), 2_000);
      stopTimer.unref?.();
      await stoppedPromise;
      clearTimeout(stopTimer);
      if (fatal) {
        await assertOwned(lease);
        throw fatal;
      }
    };
  }

  async function startHeartbeat(lease) {
    return useHeartbeatWorker ? startWorkerHeartbeat(lease) : startTimerHeartbeat(lease);
  }

  async function release(lease) {
    const [metadataRecord, fenceRecord] = await Promise.all([
      readJsonRecord(lease?.paths?.metadata),
      readJsonRecord(lease?.paths?.fence),
    ]);
    const metadata = metadataRecord.value;
    const fence = fenceRecord.value;
    const stillOwner = metadata?.schemaVersion === PROJECT_LEASE_SCHEMA_VERSION
      && normalizeString(metadata?.processInstanceId) === normalizeString(lease?.processInstanceId)
      && normalizeString(metadata?.ownerToken) === normalizeString(lease?.ownerToken)
      && Number(metadata?.fencingGeneration) === Number(lease?.fencingGeneration)
      && validFenceRecord(fence, lease?.projectId)
      && normalizeString(fence?.processInstanceId) === normalizeString(lease?.processInstanceId)
      && Number(fence?.fencingGeneration) === Number(lease?.fencingGeneration)
      && normalizeString(fence?.ownerTokenDigest) === normalizeString(lease?.ownerTokenDigest);
    if (!stillOwner) {
      if (lease?.paths?.heartbeat) {
        await fs.unlink(lease.paths.heartbeat).catch((error) => {
          if (error?.code !== 'ENOENT') throw error;
        });
      }
      await lease?.processInstanceGuard?.close().catch(() => undefined);
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
    await lease?.processInstanceGuard?.close().catch(() => undefined);
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
    let stopHeartbeat = null;
    try {
      stopHeartbeat = await startHeartbeat(lease);
      return await operation(lease);
    } finally {
      let heartbeatError = null;
      if (stopHeartbeat) {
        try {
          await stopHeartbeat();
        } catch (error) {
          heartbeatError = error;
        }
      }
      await release(lease);
      if (heartbeatError) throw heartbeatError;
    }
  }

  return Object.freeze({
    schemaVersion: PROJECT_LEASE_SCHEMA_VERSION,
    fenceSchemaVersion: PROJECT_LEASE_FENCE_SCHEMA_VERSION,
    heartbeatSchemaVersion: PROJECT_LEASE_HEARTBEAT_SCHEMA_VERSION,
    processInstanceId,
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
