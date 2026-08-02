import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { hashCanonicalValue } from '../core/browser-safe-hash.mjs';
import { validateStage10IntegrityAnchor } from './stage10IntegrityAnchor.mjs';
import { createProjectLeaseManager } from './projectLease.mjs';
import { validateStage10RecoverySnapshot } from './stage10RecoverySnapshot.mjs';

export const STAGE10_MAIN_PERSISTENCE_PORT_SCHEMA = 'yalken.stage10.mainPersistencePort.v1';
export const STAGE10_MAIN_TRANSACTION_SCHEMA = 'yalken.stage10.mainPersistenceTransaction.v3';
export const STAGE10_PROJECT_TRUTH_MUTATION_SCHEMA = 'yalken.stage10.projectTruthMutation.v1';
export const STAGE10_EXTERNAL_ARTIFACT_MUTATION_SCHEMA = 'yalken.stage10.externalArtifactMutation.v1';
const STAGE10_LEGACY_MAIN_TRANSACTION_SCHEMA = 'yalken.stage10.mainPersistenceTransaction.v1';
const STAGE10_LEGACY_MAIN_TRANSACTION_SCHEMA_V2 = 'yalken.stage10.mainPersistenceTransaction.v2';

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

function bundleRevision(bundle) {
  const events = bundle?.session?.eventLog?.events;
  return Array.isArray(events) ? events.length : 0;
}

function bundleAuthorityHeadDigest(bundle) {
  return normalizeString(bundle?.authorityStore?.currentHead?.authorityHeadDigest);
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
  const leaseManager = createProjectLeaseManager({
    leaseRoot: anchorRoot,
    ttlMs: input.leaseTtlMs,
    nowMs: input.leaseNowMs,
  });

  function pathsFor(projectId) {
    const projectKey = safeProjectKey(projectId);
    const stateRoot = path.join(projectRoot, '.stage10-local');
    const projectAnchorRoot = path.join(anchorRoot, projectKey);
    return {
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

  async function writeProjectTruthText(mutation, target) {
    const next = target === 'next'
      ? { text: mutation.nextText, hash: mutation.nextHash }
      : { text: mutation.previousText, hash: mutation.previousHash };
    const targetPath = path.join(projectRoot, mutation.relativePath);
    const result = await writeFileAtomic(targetPath, next.text);
    if (result?.success === false || result?.ok === false) {
      throw typedError('E_STAGE10_PROJECT_TRUTH_WRITE_REJECTED', 'PROJECT_TRUTH_WRITE_REJECTED', { target });
    }
    await assertProjectTruthText(mutation, next.text, next.hash, 'PROJECT_TRUTH_READBACK_MISMATCH');
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

  async function writeExternalArtifact(mutation, target) {
    if (!mutation) return;
    if (target === 'next') {
      const result = await writeFileAtomic(mutation.targetPath, mutation.nextText);
      if (result?.success === false || result?.ok === false) {
        throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_WRITE_REJECTED', 'EXTERNAL_ARTIFACT_WRITE_REJECTED');
      }
      const readback = await readExternalArtifactText(mutation);
      if (readback !== mutation.nextText || hashText(readback) !== mutation.nextHash) {
        throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_READBACK_MISMATCH', 'EXTERNAL_ARTIFACT_READBACK_MISMATCH');
      }
      return;
    }
    const current = await readExternalArtifactText(mutation);
    if (current !== null && hashText(current) !== mutation.nextHash && (!mutation.previousExists || hashText(current) !== mutation.previousHash)) {
      throw typedError('E_STAGE10_EXTERNAL_ARTIFACT_RECOVERY_FORKED', 'EXTERNAL_ARTIFACT_RECOVERY_FORKED');
    }
    if (mutation.previousExists) {
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
  }

  async function writeProjectTruthRecovery(mutation, reason, previousIntegrityAnchorDigest) {
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
    await writeJson(paths.projectTruthRecovery, recovery, 'projectTruthRecovery');
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

  async function recoverPendingTransaction(projectId, lease) {
    if (lease) await lease.assertOwned();
    const paths = pathsFor(projectId);
    const transaction = await readJsonIfPresent(paths.transaction, 'transaction');
    if (!transaction) return false;
    const legacyV1 = transaction.schemaVersion === STAGE10_LEGACY_MAIN_TRANSACTION_SCHEMA;
    const legacyV2 = transaction.schemaVersion === STAGE10_LEGACY_MAIN_TRANSACTION_SCHEMA_V2;
    const legacyTransaction = legacyV1 || legacyV2;
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
    const projectTruthDigestValid = legacyV1
      ? projectTruthMutation === null
      : projectTruthMutation
        ? projectTruthMutationDigest === hashCanonicalValue(projectTruthMutation)
        : projectTruthMutationDigest === hashCanonicalValue(null);
    if (
      normalizeString(transaction.nextBundleDigest) !== bundleDigest(nextBundle)
      || normalizeString(transaction.previousBundleDigest) !== bundleDigest(previousBundle)
      || !projectTruthDigestValid
    ) {
      throw typedError('E_STAGE10_PERSISTENCE_RECOVERY_DIGEST_INVALID', 'PERSISTENCE_RECOVERY_TRANSACTION_DIGEST_INVALID');
    }
    if (!legacyTransaction) {
      const previousRevision = bundleRevision(previousBundle);
      const previousAuthorityHeadDigest = bundleAuthorityHeadDigest(previousBundle);
      if (
        Number(transaction.expectedPreviousRevision) !== previousRevision
        || normalizeString(transaction.expectedPreviousAuthorityHeadDigest) !== previousAuthorityHeadDigest
      ) {
        throw typedError('E_STAGE10_PERSISTENCE_RECOVERY_CAS_INVALID', 'PERSISTENCE_RECOVERY_CAS_BINDING_INVALID');
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
      await writeProjectTruthText(projectTruthMutation, target === nextBundle ? 'next' : 'previous');
      if (projectTruthMutation.externalArtifactMutation) {
        if (lease) await lease.renew();
        await writeExternalArtifact(
          projectTruthMutation.externalArtifactMutation,
          target === nextBundle ? 'next' : 'previous',
        );
      }
    }
    if (lease) await lease.renew();
    await writeJson(paths.authority, target.authorityStore, 'recoveryAuthority');
    if (lease) await lease.renew();
    await writeJson(paths.session, target.session, 'recoverySession');
    if (!currentDigest || currentDigest !== normalizeString(target.integrityAnchor.integrityAnchorDigest)) {
      if (lease) await lease.renew();
      await writeAnchor(projectId, target.integrityAnchor, previousBundle?.integrityAnchor || null);
    }
    await verifyBundleReadback(projectId, target);
    if (lease) await lease.renew();
    await fs.unlink(paths.transaction).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
    recoveryConsumedProjects.add(safeProjectKey(projectId));
    return true;
  }

  return {
    schemaVersion: STAGE10_MAIN_PERSISTENCE_PORT_SCHEMA,
    async readStage10State(projectId) {
      return serializeProjectOperation(projectId, () => leaseManager.withLease(projectId, async (lease) => {
        await recoverPendingTransaction(projectId, lease);
        const bundle = await readRawBundle(projectId);
        if (!bundle) return null;
        return {
          ...cloneJson(bundle),
          recoveryConsumed: recoveryConsumedProjects.has(safeProjectKey(projectId)),
        };
      }));
    },
    async commitStage10State(projectId, nextBundleInput, options = {}) {
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
          );
          if (projectTruthMutation.externalArtifactMutation) {
            await assertExternalArtifactBefore(projectTruthMutation.externalArtifactMutation);
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
          expectedPreviousRevision,
          expectedPreviousAuthorityHeadDigest,
        };
        const paths = pathsFor(projectId);
        await lease.renew();
        await writeJson(paths.transaction, transaction, 'transaction');
        await killpoint('after-transaction-write');
        await lease.renew();
        if (projectTruthMutation) {
          await writeProjectTruthText(projectTruthMutation, 'next');
          await killpoint('after-project-truth-write');
          await lease.renew();
          if (projectTruthMutation.externalArtifactMutation) {
            await writeExternalArtifact(projectTruthMutation.externalArtifactMutation, 'next');
            await killpoint('after-external-artifact-write');
            await lease.renew();
          }
        }
        await writeBundlePair(projectId, nextBundle);
        await lease.renew();
        const pairReadback = await Promise.all([
          readJsonIfPresent(paths.session, 'session'),
          readJsonIfPresent(paths.authority, 'authority'),
        ]);
        if (!sameValue(pairReadback[0], nextBundle.session) || !sameValue(pairReadback[1], nextBundle.authorityStore)) {
          throw typedError('E_STAGE10_PERSISTENCE_PAIR_READBACK_MISMATCH', 'PERSISTENCE_PAIR_READBACK_MISMATCH');
        }
        await writeAnchor(projectId, nextBundle.integrityAnchor, previousBundle?.integrityAnchor || null);
        await lease.renew();
        const verified = await verifyBundleReadback(projectId, nextBundle);
        if (projectTruthMutation) {
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
        }
        await lease.renew();
        await fs.unlink(paths.transaction);
        return {
          ok: true,
          schemaVersion: STAGE10_MAIN_PERSISTENCE_PORT_SCHEMA,
          storageWritten: true,
          atomicWrite: true,
          readbackVerified: true,
          interprocessLeaseHeld: true,
          revisionCasVerified: true,
          authorityCasVerified: true,
          recoveredExpiredLease: lease.recoveredExpiredLease === true,
          bundle: cloneJson(verified),
        };
      }));
    },
    async writeRecoverySnapshot(projectId, snapshotId, snapshotRecord) {
      return serializeProjectOperation(projectId, () => leaseManager.withLease(projectId, async (lease) => {
        const paths = pathsFor(projectId);
        const safeSnapshotId = safeProjectKey(snapshotId);
        const targetPath = path.join(paths.recoveryRoot, `${safeSnapshotId}.json`);
        await recoverPendingTransaction(projectId, lease);
        const currentBundle = await readRawBundle(projectId);
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
        if (!existing) await writeJson(targetPath, validated.snapshot, 'recoverySnapshot');
        return { ok: true, atomicWrite: true, readbackVerified: true };
      }));
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
