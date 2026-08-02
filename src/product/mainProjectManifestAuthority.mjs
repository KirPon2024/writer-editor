import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

import { createProjectLeaseManager } from './projectLease.mjs';
import { normalizeStage10ProjectId } from './stage10ProjectIdentityKey.mjs';

export const MAIN_PROJECT_MANIFEST_AUTHORITY_SCHEMA = 'yalken.mainProjectManifestAuthority.v1';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function hashText(value) {
  return createHash('sha256').update(Buffer.from(typeof value === 'string' ? value : '', 'utf8')).digest('hex');
}

function typedError(code, reason, details = {}) {
  return {
    code,
    op: 'main.projectManifestAuthority',
    reason,
    details: isPlainObject(details) ? { ...details } : {},
  };
}

async function readTextIfPresent(targetPath) {
  try {
    return { exists: true, text: await fs.readFile(targetPath, 'utf8') };
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, text: '' };
    throw error;
  }
}

async function syncFileAndParent(targetPath) {
  const fileHandle = await fs.open(targetPath, 'r');
  try {
    await fileHandle.sync();
  } finally {
    await fileHandle.close();
  }
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

async function createTextExclusively(targetPath, text) {
  const temporaryPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.manifest-cas.tmp`,
  );
  let handle;
  try {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    handle = await fs.open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(text, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.link(temporaryPath, targetPath);
    await syncFileAndParent(targetPath);
  } finally {
    await handle?.close().catch(() => undefined);
    await fs.unlink(temporaryPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
}

function assertManifestIdentity(projectId, text, label) {
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    throw typedError('E_MAIN_PROJECT_MANIFEST_JSON_INVALID', 'PROJECT_MANIFEST_JSON_INVALID', { label });
  }
  if (!isPlainObject(manifest) || normalizeStage10ProjectId(manifest.projectId) !== projectId) {
    throw typedError('E_MAIN_PROJECT_MANIFEST_IDENTITY_MISMATCH', 'PROJECT_MANIFEST_IDENTITY_MISMATCH', { label });
  }
  return manifest;
}

export function createMainProjectManifestAuthority(input = {}) {
  const anchorRoot = normalizeString(input.anchorRoot);
  if (!anchorRoot || !path.isAbsolute(anchorRoot) || anchorRoot === path.parse(anchorRoot).root) {
    throw typedError('E_MAIN_PROJECT_MANIFEST_AUTHORITY_ROOT_INVALID', 'PROJECT_MANIFEST_AUTHORITY_ROOT_INVALID');
  }
  const writeFileAtomic = typeof input.writeFileAtomic === 'function' ? input.writeFileAtomic : null;
  const leaseManager = input.leaseManager || createProjectLeaseManager({
    leaseRoot: anchorRoot,
    ttlMs: input.leaseTtlMs,
    nowMs: input.leaseNowMs,
    nowMonotonicMs: input.leaseNowMonotonicMs,
    useHeartbeatWorker: input.useLeaseHeartbeatWorker,
  });

  async function replaceText(targetPath, nextText, label) {
    if (!writeFileAtomic) {
      const temporaryPath = path.join(
        path.dirname(targetPath),
        `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.manifest-replace.tmp`,
      );
      let handle;
      try {
        handle = await fs.open(temporaryPath, 'wx', 0o600);
        await handle.writeFile(nextText, 'utf8');
        await handle.sync();
        await handle.close();
        handle = null;
        await fs.rename(temporaryPath, targetPath);
      } finally {
        await handle?.close().catch(() => undefined);
        await fs.unlink(temporaryPath).catch((error) => {
          if (error?.code !== 'ENOENT') throw error;
        });
      }
    } else {
      const result = await writeFileAtomic(targetPath, nextText);
      if (result?.success === false || result?.ok === false) {
        throw typedError('E_MAIN_PROJECT_MANIFEST_WRITE_REJECTED', 'PROJECT_MANIFEST_WRITE_REJECTED', { label });
      }
    }
    await syncFileAndParent(targetPath);
  }

  async function commitManifestText({
    projectId: inputProjectId,
    expectedProjectId: inputExpectedProjectId,
    targetPath: inputTargetPath,
    expectedText,
    nextText,
    lease = null,
    label = 'projectManifest',
  }) {
    const projectId = normalizeStage10ProjectId(inputProjectId);
    const hasExpectedProjectId = inputExpectedProjectId !== undefined && inputExpectedProjectId !== null;
    const expectedProjectId = hasExpectedProjectId
      ? normalizeStage10ProjectId(inputExpectedProjectId)
      : projectId;
    const targetPath = normalizeString(inputTargetPath);
    if (
      !projectId
      || !expectedProjectId
      || !path.isAbsolute(targetPath)
      || targetPath === path.parse(targetPath).root
    ) {
      throw typedError('E_MAIN_PROJECT_MANIFEST_COMMIT_INVALID', 'PROJECT_MANIFEST_COMMIT_INVALID');
    }
    if (expectedText !== null && typeof expectedText !== 'string') {
      throw typedError('E_MAIN_PROJECT_MANIFEST_EXPECTED_BYTES_REQUIRED', 'PROJECT_MANIFEST_EXPECTED_BYTES_REQUIRED');
    }
    if (typeof nextText !== 'string' || !nextText) {
      throw typedError('E_MAIN_PROJECT_MANIFEST_NEXT_BYTES_REQUIRED', 'PROJECT_MANIFEST_NEXT_BYTES_REQUIRED');
    }
    if (typeof expectedText === 'string') assertManifestIdentity(expectedProjectId, expectedText, 'expected');
    assertManifestIdentity(projectId, nextText, 'next');
    const publish = async (activeLease) => activeLease.publish(async (proof) => {
      const before = await readTextIfPresent(targetPath);
      const expectedExists = expectedText !== null;
      if (before.exists !== expectedExists || (expectedExists && before.text !== expectedText)) {
        throw typedError('E_MAIN_PROJECT_MANIFEST_CAS_FAILED', 'PROJECT_MANIFEST_REVISION_CONFLICT', {
          expectedExists,
          actualExists: before.exists,
          expectedHash: expectedExists ? hashText(expectedText) : '',
          actualHash: before.exists ? hashText(before.text) : '',
        });
      }
      await proof.assertOwned();
      try {
        if (expectedExists) await replaceText(targetPath, nextText, label);
        else await createTextExclusively(targetPath, nextText);
      } catch (error) {
        if (error?.code === 'EEXIST') {
          throw typedError('E_MAIN_PROJECT_MANIFEST_CAS_FAILED', 'PROJECT_MANIFEST_UNEXPECTEDLY_EXISTS');
        }
        throw error;
      }
      await proof.assertOwned();
      const readback = await readTextIfPresent(targetPath);
      if (!readback.exists || readback.text !== nextText) {
        throw typedError('E_MAIN_PROJECT_MANIFEST_READBACK_MISMATCH', 'PROJECT_MANIFEST_READBACK_MISMATCH', {
          expectedHash: hashText(nextText),
          actualHash: readback.exists ? hashText(readback.text) : '',
        });
      }
      return {
        ok: true,
        schemaVersion: MAIN_PROJECT_MANIFEST_AUTHORITY_SCHEMA,
        projectId,
        expectedProjectId,
        previousHash: expectedText === null ? '' : hashText(expectedText),
        nextHash: hashText(nextText),
        fencingGeneration: activeLease.fencingGeneration,
        processInstanceId: activeLease.processInstanceId,
        readbackVerified: true,
        durablePublication: true,
      };
    });
    if (lease) {
      if (normalizeStage10ProjectId(lease.projectId) !== projectId) {
        throw typedError('E_MAIN_PROJECT_MANIFEST_LEASE_PROJECT_MISMATCH', 'PROJECT_MANIFEST_LEASE_PROJECT_MISMATCH');
      }
      return publish(lease);
    }
    return leaseManager.withLease(projectId, publish);
  }

  return Object.freeze({
    schemaVersion: MAIN_PROJECT_MANIFEST_AUTHORITY_SCHEMA,
    leaseManager,
    withProjectLease: (projectId, operation) => leaseManager.withLease(projectId, operation),
    commitManifestText,
  });
}
