import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const PROJECT_LEASE_SCHEMA_VERSION = 'yalken.mainProjectLease.v1';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeKey(value) {
  const normalized = normalizeString(value);
  if (!normalized || !/^[a-zA-Z0-9._:-]{1,180}$/u.test(normalized)) {
    throw typedError('E_PROJECT_LEASE_PROJECT_ID_INVALID', 'PROJECT_LEASE_PROJECT_ID_INVALID');
  }
  return normalized.replace(/[^a-zA-Z0-9._-]/gu, '_');
}

function typedError(code, reason, details = {}) {
  return { code, op: 'project.lease', reason, details: isPlainObject(details) ? { ...details } : {} };
}

async function readMetadata(metadataPath) {
  try {
    const value = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
    return isPlainObject(value) ? value : null;
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
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
  const requestedTtl = Number(input.ttlMs);
  const ttlMs = Number.isSafeInteger(requestedTtl)
    ? Math.min(60_000, Math.max(1_000, requestedTtl))
    : 15_000;

  function pathsFor(projectId) {
    const root = path.join(leaseRoot, safeKey(projectId));
    const leaseDirectory = path.join(root, 'project-transaction.lease');
    return {
      root,
      leaseDirectory,
      metadata: path.join(leaseDirectory, 'owner.v1.json'),
    };
  }

  async function inspectLease(paths) {
    const metadata = await readMetadata(paths.metadata);
    let modifiedAtMs = 0;
    try {
      modifiedAtMs = (await fs.stat(paths.leaseDirectory)).mtimeMs;
    } catch (error) {
      if (error?.code === 'ENOENT') return { exists: false, expired: false, metadata: null };
      throw error;
    }
    const expiresAtMs = Number(metadata?.expiresAtMs);
    const expiry = Number.isFinite(expiresAtMs) ? expiresAtMs : modifiedAtMs + ttlMs;
    return { exists: true, expired: clock() >= expiry, metadata };
  }

  async function acquire(projectId) {
    const normalizedProjectId = normalizeString(projectId);
    const paths = pathsFor(normalizedProjectId);
    await fs.mkdir(paths.root, { recursive: true });
    const ownerToken = randomUUID();
    let recoveredExpiredLease = false;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await fs.mkdir(paths.leaseDirectory);
        const acquiredAtMs = clock();
        const metadata = {
          schemaVersion: PROJECT_LEASE_SCHEMA_VERSION,
          projectId: normalizedProjectId,
          ownerToken,
          ownerPid: process.pid,
          acquiredAtMs,
          renewedAtMs: acquiredAtMs,
          expiresAtMs: acquiredAtMs + ttlMs,
          expectedRevision: null,
          expectedAuthorityHeadDigest: '',
        };
        await fs.writeFile(paths.metadata, `${JSON.stringify(metadata, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
        return { projectId: normalizedProjectId, ownerToken, paths, metadata, recoveredExpiredLease };
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        const existing = await inspectLease(paths);
        if (!existing.exists) continue;
        if (!existing.expired) {
          throw typedError('E_PROJECT_LEASE_HELD', 'PROJECT_LEASE_HELD_BY_ANOTHER_PROCESS', {
            projectId: normalizedProjectId,
            ownerPid: Number(existing.metadata?.ownerPid) || 0,
            expiresAtMs: Number(existing.metadata?.expiresAtMs) || 0,
          });
        }
        const expiredPath = `${paths.leaseDirectory}.expired.${clock()}.${ownerToken}`;
        try {
          await fs.rename(paths.leaseDirectory, expiredPath);
          recoveredExpiredLease = true;
        } catch (renameError) {
          if (renameError?.code !== 'ENOENT') throw renameError;
        }
      }
    }
    throw typedError('E_PROJECT_LEASE_ACQUIRE_RACE', 'PROJECT_LEASE_ACQUIRE_RACE');
  }

  async function assertOwned(lease) {
    const metadata = await readMetadata(lease?.paths?.metadata);
    if (
      !metadata
      || metadata.schemaVersion !== PROJECT_LEASE_SCHEMA_VERSION
      || normalizeString(metadata.projectId) !== normalizeString(lease?.projectId)
      || normalizeString(metadata.ownerToken) !== normalizeString(lease?.ownerToken)
      || clock() >= Number(metadata.expiresAtMs)
    ) {
      throw typedError('E_PROJECT_LEASE_OWNERSHIP_LOST', 'PROJECT_LEASE_OWNERSHIP_LOST');
    }
    return metadata;
  }

  async function renew(lease, binding = {}) {
    const metadata = await assertOwned(lease);
    const renewedAtMs = clock();
    const next = {
      ...metadata,
      renewedAtMs,
      expiresAtMs: renewedAtMs + ttlMs,
      expectedRevision: Number.isSafeInteger(binding.expectedRevision)
        ? binding.expectedRevision
        : metadata.expectedRevision,
      expectedAuthorityHeadDigest: normalizeString(binding.expectedAuthorityHeadDigest)
        || normalizeString(metadata.expectedAuthorityHeadDigest),
    };
    await fs.writeFile(lease.paths.metadata, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    lease.metadata = next;
    return next;
  }

  async function release(lease) {
    const metadata = await readMetadata(lease?.paths?.metadata);
    if (!metadata || normalizeString(metadata.ownerToken) !== normalizeString(lease?.ownerToken)) return false;
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
    try {
      return await operation({
        ...lease,
        assertOwned: () => assertOwned(lease),
        renew: (binding) => renew(lease, binding),
      });
    } finally {
      await release(lease);
    }
  }

  return Object.freeze({
    schemaVersion: PROJECT_LEASE_SCHEMA_VERSION,
    ttlMs,
    acquire,
    assertOwned,
    renew,
    release,
    withLease,
    paths: pathsFor,
  });
}
