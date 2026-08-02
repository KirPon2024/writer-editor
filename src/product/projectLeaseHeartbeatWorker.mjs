import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parentPort, workerData } from 'node:worker_threads';

const LEASE_SCHEMA = 'yalken.mainProjectLease.v3';
const FENCE_SCHEMA = 'yalken.mainProjectLeaseFence.v2';
const HEARTBEAT_SCHEMA = 'yalken.mainProjectLeaseHeartbeat.v2';

function monotonicNowMs() {
  return Number(process.hrtime.bigint() / 1_000_000n);
}

async function readJson(targetPath) {
  const raw = await fs.readFile(targetPath, 'utf8');
  return JSON.parse(raw);
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

function ownershipMatches(metadata, fence) {
  return metadata?.schemaVersion === LEASE_SCHEMA
    && fence?.schemaVersion === FENCE_SCHEMA
    && metadata.projectId === workerData.projectId
    && fence.projectId === workerData.projectId
    && metadata.processInstanceId === workerData.processInstanceId
    && fence.processInstanceId === workerData.processInstanceId
    && metadata.ownerTokenDigest === workerData.ownerTokenDigest
    && fence.ownerTokenDigest === workerData.ownerTokenDigest
    && Number(metadata.fencingGeneration) === workerData.fencingGeneration
    && Number(fence.fencingGeneration) === workerData.fencingGeneration;
}

let stopped = false;
let renewalCount = Number(workerData.initialRenewalCount) || 0;
let expectedRevision = Number.isSafeInteger(workerData.expectedRevision)
  ? workerData.expectedRevision
  : null;
let expectedAuthorityHeadDigest = typeof workerData.expectedAuthorityHeadDigest === 'string'
  ? workerData.expectedAuthorityHeadDigest
  : '';
let tail = Promise.resolve();

async function beat(binding = {}) {
  const [metadata, fence] = await Promise.all([
    readJson(workerData.metadataPath),
    readJson(workerData.fencePath),
  ]);
  if (!ownershipMatches(metadata, fence)) {
    const error = new Error('PROJECT_LEASE_OWNERSHIP_LOST');
    error.code = 'E_PROJECT_LEASE_OWNERSHIP_LOST';
    throw error;
  }
  if (Number.isSafeInteger(binding.expectedRevision)) expectedRevision = binding.expectedRevision;
  if (typeof binding.expectedAuthorityHeadDigest === 'string' && binding.expectedAuthorityHeadDigest.trim()) {
    expectedAuthorityHeadDigest = binding.expectedAuthorityHeadDigest.trim();
  }
  const monotonicRenewedAtMs = monotonicNowMs();
  const renewedAtMs = Date.now();
  renewalCount += 1;
  const heartbeat = {
    schemaVersion: HEARTBEAT_SCHEMA,
    projectId: workerData.projectId,
    processInstanceId: workerData.processInstanceId,
    ownerTokenDigest: workerData.ownerTokenDigest,
    fencingGeneration: workerData.fencingGeneration,
    renewedAtMs,
    expiresAtMs: renewedAtMs + workerData.ttlMs,
    monotonicRenewedAtMs,
    monotonicExpiresAtMs: monotonicRenewedAtMs + workerData.ttlMs,
    renewalCount,
    expectedRevision,
    expectedAuthorityHeadDigest,
  };
  await writeJsonAtomic(workerData.heartbeatPath, heartbeat);
  const currentFence = await readJson(workerData.fencePath);
  if (!ownershipMatches(metadata, currentFence)) {
    const error = new Error('PROJECT_LEASE_OWNERSHIP_LOST');
    error.code = 'E_PROJECT_LEASE_OWNERSHIP_LOST';
    throw error;
  }
  return heartbeat;
}

function enqueue(binding, requestId = '') {
  const pending = tail.then(() => beat(binding));
  tail = pending.catch(() => undefined);
  pending.then((heartbeat) => {
    parentPort?.postMessage({ type: requestId ? 'renewed' : 'heartbeat', requestId, heartbeat });
  }).catch((error) => {
    parentPort?.postMessage({
      type: 'fatal',
      requestId,
      code: typeof error?.code === 'string' ? error.code : 'E_PROJECT_LEASE_HEARTBEAT_FAILED',
      reason: typeof error?.message === 'string' ? error.message : 'PROJECT_LEASE_HEARTBEAT_FAILED',
    });
    stopped = true;
  });
  return pending;
}

const timer = setInterval(() => {
  if (!stopped) enqueue({});
}, workerData.intervalMs);
timer.unref?.();

parentPort?.on('message', (message) => {
  if (message?.type === 'renew' && !stopped) {
    enqueue(message.binding || {}, String(message.requestId || ''));
  } else if (message?.type === 'stop') {
    stopped = true;
    clearInterval(timer);
    tail.finally(() => {
      parentPort?.postMessage({ type: 'stopped' });
      parentPort?.close();
    });
  }
});

enqueue({}).then((heartbeat) => {
  parentPort?.postMessage({ type: 'ready', heartbeat });
}).catch(() => undefined);
