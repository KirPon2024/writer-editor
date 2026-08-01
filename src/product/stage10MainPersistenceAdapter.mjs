import fs from 'node:fs/promises';
import path from 'node:path';

import { hashCanonicalValue } from '../core/browser-safe-hash.mjs';
import { validateStage10IntegrityAnchor } from './stage10IntegrityAnchor.mjs';

export const STAGE10_MAIN_PERSISTENCE_PORT_SCHEMA = 'yalken.stage10.mainPersistencePort.v1';
export const STAGE10_MAIN_TRANSACTION_SCHEMA = 'yalken.stage10.mainPersistenceTransaction.v1';

const SESSION_FILENAME = 'product-session.v2.json';
const AUTHORITY_FILENAME = 'command-receipt-authority-store.v2.json';
const RECOVERY_DIRNAME = 'recovery';
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

function safeProjectKey(projectId) {
  const normalized = normalizeString(projectId);
  if (!normalized || !/^[a-zA-Z0-9._:-]{1,180}$/u.test(normalized)) {
    throw typedError('E_STAGE10_PERSISTENCE_PROJECT_ID_INVALID', 'PROJECT_ID_INVALID');
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

function sameValue(left, right) {
  return hashCanonicalValue(left) === hashCanonicalValue(right);
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
  const key = safeProjectKey(projectId);
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
  const projectRoot = path.resolve(normalizeString(input.projectRoot));
  const anchorRoot = path.resolve(normalizeString(input.anchorRoot));
  if (!projectRoot || !anchorRoot || projectRoot === path.parse(projectRoot).root || anchorRoot === path.parse(anchorRoot).root) {
    throw typedError('E_STAGE10_PERSISTENCE_ROOT_INVALID', 'PERSISTENCE_ROOT_INVALID');
  }
  const writeFileAtomic = typeof input.writeFileAtomic === 'function' ? input.writeFileAtomic : defaultAtomicWrite;
  const onKillpoint = typeof input.onKillpoint === 'function' ? input.onKillpoint : null;
  const recoveryConsumedProjects = new Set();

  function pathsFor(projectId) {
    const projectKey = safeProjectKey(projectId);
    const stateRoot = path.join(projectRoot, '.stage10-local');
    const projectAnchorRoot = path.join(anchorRoot, projectKey);
    return {
      stateRoot,
      session: path.join(stateRoot, SESSION_FILENAME),
      authority: path.join(stateRoot, AUTHORITY_FILENAME),
      recoveryRoot: path.join(stateRoot, RECOVERY_DIRNAME),
      anchorRoot: projectAnchorRoot,
      anchor: path.join(projectAnchorRoot, 'integrity-anchor.v1.json'),
      anchorRecovery: path.join(projectAnchorRoot, 'integrity-anchor.recovery.v1.json'),
      transaction: path.join(projectAnchorRoot, 'pending-transaction.v1.json'),
    };
  }

  async function writeJson(targetPath, value, label) {
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
  }

  async function killpoint(name) {
    if (onKillpoint) await onKillpoint(name);
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

  async function writeBundlePair(projectId, bundle) {
    const paths = pathsFor(projectId);
    await writeJson(paths.authority, bundle.authorityStore, 'authority');
    await killpoint('after-authority-write');
    await writeJson(paths.session, bundle.session, 'session');
    await killpoint('after-session-write');
  }

  async function writeAnchor(projectId, anchor, previousAnchor) {
    const paths = pathsFor(projectId);
    if (isPlainObject(previousAnchor)) {
      await writeJson(paths.anchorRecovery, previousAnchor, 'anchorRecovery');
    }
    await writeJson(paths.anchor, anchor, 'anchor');
    await killpoint('after-anchor-write');
  }

  async function verifyBundleReadback(projectId, expected) {
    const actual = await readRawBundle(projectId);
    if (!actual || bundleDigest(actual) !== bundleDigest(expected)) {
      throw typedError('E_STAGE10_PERSISTENCE_BUNDLE_READBACK_MISMATCH', 'PERSISTENCE_BUNDLE_READBACK_MISMATCH');
    }
    return actual;
  }

  async function recoverPendingTransaction(projectId) {
    const paths = pathsFor(projectId);
    const transaction = await readJsonIfPresent(paths.transaction, 'transaction');
    if (!transaction) return false;
    if (
      transaction.schemaVersion !== STAGE10_MAIN_TRANSACTION_SCHEMA
      || normalizeString(transaction.projectId) !== normalizeString(projectId)
      || !isPlainObject(transaction.nextBundle)
    ) {
      throw typedError('E_STAGE10_PERSISTENCE_RECOVERY_INVALID', 'PERSISTENCE_RECOVERY_INVALID');
    }
    const currentAnchor = await readJsonIfPresent(paths.anchor, 'anchor');
    const previousBundle = isPlainObject(transaction.previousBundle) ? transaction.previousBundle : null;
    const nextBundle = transaction.nextBundle;
    if (
      normalizeString(transaction.nextBundleDigest) !== bundleDigest(nextBundle)
      || normalizeString(transaction.previousBundleDigest) !== bundleDigest(previousBundle)
    ) {
      throw typedError('E_STAGE10_PERSISTENCE_RECOVERY_DIGEST_INVALID', 'PERSISTENCE_RECOVERY_TRANSACTION_DIGEST_INVALID');
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
    await writeJson(paths.authority, target.authorityStore, 'recoveryAuthority');
    await writeJson(paths.session, target.session, 'recoverySession');
    if (!currentDigest || currentDigest !== normalizeString(target.integrityAnchor.integrityAnchorDigest)) {
      await writeAnchor(projectId, target.integrityAnchor, previousBundle?.integrityAnchor || null);
    }
    await verifyBundleReadback(projectId, target);
    await fs.unlink(paths.transaction).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
    recoveryConsumedProjects.add(safeProjectKey(projectId));
    return true;
  }

  return {
    schemaVersion: STAGE10_MAIN_PERSISTENCE_PORT_SCHEMA,
    async readStage10State(projectId) {
      return serializeProjectOperation(projectId, async () => {
        await recoverPendingTransaction(projectId);
        const bundle = await readRawBundle(projectId);
        if (!bundle) return null;
        return {
          ...cloneJson(bundle),
          recoveryConsumed: recoveryConsumedProjects.has(safeProjectKey(projectId)),
        };
      });
    },
    async commitStage10State(projectId, nextBundleInput, options = {}) {
      return serializeProjectOperation(projectId, async () => {
        const nextBundle = cloneJson(nextBundleInput);
        if (!isPlainObject(nextBundle.session) || !isPlainObject(nextBundle.authorityStore) || !isPlainObject(nextBundle.integrityAnchor)) {
          throw typedError('E_STAGE10_PERSISTENCE_BUNDLE_INVALID', 'PERSISTENCE_BUNDLE_REQUIRED');
        }
        await recoverPendingTransaction(projectId);
        const previousBundle = await readRawBundle(projectId);
        const expectedPreviousDigest = normalizeString(options.expectedPreviousIntegrityAnchorDigest);
        const actualPreviousDigest = normalizeString(previousBundle?.integrityAnchor?.integrityAnchorDigest);
        if (expectedPreviousDigest !== actualPreviousDigest) {
          throw typedError('E_STAGE10_PERSISTENCE_STALE_COMMIT', 'PERSISTENCE_STALE_OR_ROLLED_BACK_COMMIT');
        }
        validateBundleIntegrity(projectId, nextBundle, previousBundle?.integrityAnchor || null);
        const transaction = {
          schemaVersion: STAGE10_MAIN_TRANSACTION_SCHEMA,
          projectId: normalizeString(projectId),
          reason: normalizeString(options.reason),
          previousBundle: previousBundle ? cloneJson(previousBundle) : null,
          nextBundle,
          previousBundleDigest: bundleDigest(previousBundle),
          nextBundleDigest: bundleDigest(nextBundle),
        };
        const paths = pathsFor(projectId);
        await writeJson(paths.transaction, transaction, 'transaction');
        await killpoint('after-transaction-write');
        await writeBundlePair(projectId, nextBundle);
        const pairReadback = await Promise.all([
          readJsonIfPresent(paths.session, 'session'),
          readJsonIfPresent(paths.authority, 'authority'),
        ]);
        if (!sameValue(pairReadback[0], nextBundle.session) || !sameValue(pairReadback[1], nextBundle.authorityStore)) {
          throw typedError('E_STAGE10_PERSISTENCE_PAIR_READBACK_MISMATCH', 'PERSISTENCE_PAIR_READBACK_MISMATCH');
        }
        await writeAnchor(projectId, nextBundle.integrityAnchor, previousBundle?.integrityAnchor || null);
        const verified = await verifyBundleReadback(projectId, nextBundle);
        await fs.unlink(paths.transaction);
        return {
          ok: true,
          schemaVersion: STAGE10_MAIN_PERSISTENCE_PORT_SCHEMA,
          storageWritten: true,
          atomicWrite: true,
          readbackVerified: true,
          bundle: cloneJson(verified),
        };
      });
    },
    async writeRecoverySnapshot(projectId, snapshotId, snapshotRecord) {
      return serializeProjectOperation(projectId, async () => {
        const paths = pathsFor(projectId);
        const safeSnapshotId = safeProjectKey(snapshotId);
        const targetPath = path.join(paths.recoveryRoot, `${safeSnapshotId}.json`);
        await writeJson(targetPath, snapshotRecord, 'recoverySnapshot');
        return { ok: true, atomicWrite: true, readbackVerified: true };
      });
    },
    async readRecoverySnapshot(projectId, snapshotId) {
      return serializeProjectOperation(projectId, async () => {
        const paths = pathsFor(projectId);
        const safeSnapshotId = safeProjectKey(snapshotId);
        return readJsonIfPresent(path.join(paths.recoveryRoot, `${safeSnapshotId}.json`), 'recoverySnapshot');
      });
    },
    paths(projectId) {
      return { ...pathsFor(projectId) };
    },
  };
}
