// R2.4 WP-201_PROJECT_TRANSACTION - one recoverable scene + manifest commit.
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const { durableSaveTransaction } = require('./save-coordinator-v1.cjs');

const JOURNAL_SCHEMA_VERSION = 'yalken.project-transaction.journal.v1';
const COMMIT_SCHEMA_VERSION = 'yalken.project-transaction.commit.v1';
const MAX_ARTIFACT_BYTES = 32 * 1024 * 1024;

const TRANSACTION_PHASES = Object.freeze({
  ADMIT: 'ADMIT',
  RECOVER: 'RECOVER',
  PREPARE_JOURNAL: 'PREPARE_JOURNAL',
  MANIFEST_PUBLISH: 'MANIFEST_PUBLISH',
  SCENE_PUBLISH: 'SCENE_PUBLISH',
  COMMIT_POINT: 'COMMIT_POINT',
  READBACK: 'READBACK',
  CLEANUP: 'CLEANUP',
  ACK: 'ACK',
});

const TRANSACTION_PHASE_CHAIN = Object.freeze(Object.values(TRANSACTION_PHASES));

class ProjectTransactionError extends Error {
  constructor(code, phase, detail = '') {
    super(detail ? `${code}@${phase}: ${detail}` : `${code}@${phase}`);
    this.code = code;
    this.phase = phase;
  }
}

const sha256hex = (value) => crypto.createHash('sha256').update(value).digest('hex');
const journalPathFor = (manifestPath) => `${manifestPath}.wp201-transaction.json`;
const commitPathFor = (scenePath) => `${scenePath}.wp201-commit.json`;

function assertText(value, code, phase) {
  if (typeof value !== 'string') throw new ProjectTransactionError(code, phase);
  if (Buffer.byteLength(value, 'utf8') > MAX_ARTIFACT_BYTES) {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_ARTIFACT_BUDGET', phase, code);
  }
}

function assertPathPair(scenePath, manifestPath) {
  if (typeof scenePath !== 'string' || scenePath.length === 0) {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_SCENE_PATH_REQUIRED', TRANSACTION_PHASES.ADMIT);
  }
  if (typeof manifestPath !== 'string' || manifestPath.length === 0) {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_MANIFEST_PATH_REQUIRED', TRANSACTION_PHASES.ADMIT);
  }
  const relative = path.relative(path.dirname(manifestPath), scenePath);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_PATH_BOUNDARY', TRANSACTION_PHASES.ADMIT);
  }
}

function encodeOptionalText(value) {
  return value === null ? null : Buffer.from(value, 'utf8').toString('base64');
}

function decodeOptionalText(value, field) {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_JOURNAL_SHAPE', TRANSACTION_PHASES.RECOVER, field);
  }
  const decoded = Buffer.from(value, 'base64').toString('utf8');
  if (Buffer.byteLength(decoded, 'utf8') > MAX_ARTIFACT_BYTES) {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_ARTIFACT_BUDGET', TRANSACTION_PHASES.RECOVER, field);
  }
  return decoded;
}

async function readOptionalText(targetPath, fsAdapter = fsp) {
  try {
    return await fsAdapter.readFile(targetPath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function fsyncDirectory(dirPath, fsAdapter = fsp) {
  const handle = await fsAdapter.open(dirPath, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function removeDurably(targetPath, fsAdapter = fsp) {
  try {
    await fsAdapter.unlink(targetPath);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
  }
  await fsyncDirectory(path.dirname(targetPath), fsAdapter);
}

function digestOptional(value) {
  return value === null ? null : sha256hex(value);
}

function classifyBytes(actual, before, after) {
  if (actual === before) return 'BEFORE';
  if (actual === after) return 'AFTER';
  return 'OTHER';
}

function transactionIdFor({ scenePath, manifestPath, revision, before, after }) {
  return sha256hex(JSON.stringify({
    scenePath,
    manifestPath,
    revision,
    before: { sceneDigest: digestOptional(before.scene), manifestDigest: sha256hex(before.manifest) },
    after: { sceneDigest: sha256hex(after.scene), manifestDigest: sha256hex(after.manifest) },
  }));
}

function parseJournal(sourceText, { scenePath, manifestPath }) {
  let journal;
  try {
    journal = JSON.parse(sourceText);
  } catch {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_JOURNAL_JSON', TRANSACTION_PHASES.RECOVER);
  }
  if (!journal || journal.schemaVersion !== JOURNAL_SCHEMA_VERSION) {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_JOURNAL_SCHEMA', TRANSACTION_PHASES.RECOVER);
  }
  if (journal.scenePath !== scenePath || journal.manifestPath !== manifestPath) {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_JOURNAL_PATH_MISMATCH', TRANSACTION_PHASES.RECOVER);
  }
  const before = {
    scene: decodeOptionalText(journal.before?.sceneBase64, 'before.sceneBase64'),
    manifest: decodeOptionalText(journal.before?.manifestBase64, 'before.manifestBase64'),
  };
  const after = {
    scene: decodeOptionalText(journal.after?.sceneBase64, 'after.sceneBase64'),
    manifest: decodeOptionalText(journal.after?.manifestBase64, 'after.manifestBase64'),
  };
  if (before.manifest === null || after.scene === null || after.manifest === null) {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_JOURNAL_SHAPE', TRANSACTION_PHASES.RECOVER);
  }
  const expectedId = transactionIdFor({ scenePath, manifestPath, revision: journal.revision, before, after });
  if (journal.transactionId !== expectedId) {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_JOURNAL_DIGEST', TRANSACTION_PHASES.RECOVER);
  }
  return { ...journal, before, after };
}

async function readCommitRecord(scenePath, fsAdapter = fsp) {
  const source = await readOptionalText(commitPathFor(scenePath), fsAdapter);
  if (source === null) return null;
  try {
    const record = JSON.parse(source);
    if (!record || record.schemaVersion !== COMMIT_SCHEMA_VERSION) return null;
    return record;
  } catch {
    return null;
  }
}

async function readPendingProjectTransactionBinding({ manifestPath, fsAdapter = fsp }) {
  if (typeof manifestPath !== 'string' || manifestPath.length === 0) {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_MANIFEST_PATH_REQUIRED', TRANSACTION_PHASES.ADMIT);
  }
  const source = await readOptionalText(journalPathFor(manifestPath), fsAdapter);
  if (source === null) return Object.freeze({ pending: false });

  let candidate;
  try {
    candidate = JSON.parse(source);
  } catch {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_JOURNAL_JSON', TRANSACTION_PHASES.RECOVER);
  }
  if (!candidate || candidate.schemaVersion !== JOURNAL_SCHEMA_VERSION) {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_JOURNAL_SCHEMA', TRANSACTION_PHASES.RECOVER);
  }
  if (candidate.manifestPath !== manifestPath || typeof candidate.scenePath !== 'string') {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_JOURNAL_PATH_MISMATCH', TRANSACTION_PHASES.RECOVER);
  }
  assertPathPair(candidate.scenePath, manifestPath);
  const journal = parseJournal(source, { scenePath: candidate.scenePath, manifestPath });
  return Object.freeze({
    pending: true,
    scenePath: journal.scenePath,
    manifestPath: journal.manifestPath,
    transactionId: journal.transactionId,
  });
}

async function publishManifestExact({ publishManifest, manifestPath, expectedText, nextText, revision, reason }) {
  if (expectedText === nextText) return;
  try {
    await publishManifest({ manifestPath, expectedText, nextText, revision, reason });
  } catch (error) {
    const detail = error && (error.code || error.message) ? (error.code || error.message) : String(error);
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_MANIFEST_PUBLISH', TRANSACTION_PHASES.MANIFEST_PUBLISH, detail);
  }
}

async function publishSceneExact({ scenePath, expectedText, nextText, revision, fsAdapter = fsp }) {
  const current = await readOptionalText(scenePath, fsAdapter);
  if (current !== expectedText) {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_SCENE_CAS', TRANSACTION_PHASES.SCENE_PUBLISH);
  }
  if (nextText === null) {
    await removeDurably(scenePath, fsAdapter);
    return;
  }
  await durableSaveTransaction({ filePath: scenePath, content: nextText, revision, fsAdapter });
}

async function recoverProjectTransaction({ scenePath, manifestPath, publishManifest, fsAdapter = fsp }) {
  assertPathPair(scenePath, manifestPath);
  if (typeof publishManifest !== 'function') {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_MANIFEST_AUTHORITY_REQUIRED', TRANSACTION_PHASES.ADMIT);
  }
  const journalPath = journalPathFor(manifestPath);
  const source = await readOptionalText(journalPath, fsAdapter);
  if (source === null) return Object.freeze({ recovered: false, outcome: 'NO_JOURNAL' });
  const journal = parseJournal(source, { scenePath, manifestPath });
  const commit = await readCommitRecord(scenePath, fsAdapter);
  const committed = Boolean(commit && commit.transactionId === journal.transactionId);
  const target = committed ? journal.after : journal.before;
  const currentManifest = await readOptionalText(manifestPath, fsAdapter);
  const currentScene = await readOptionalText(scenePath, fsAdapter);
  const manifestClass = classifyBytes(currentManifest, journal.before.manifest, journal.after.manifest);
  const sceneClass = classifyBytes(currentScene, journal.before.scene, journal.after.scene);
  if (manifestClass === 'OTHER' || sceneClass === 'OTHER') {
    throw new ProjectTransactionError(
      'E_PROJECT_TRANSACTION_RECOVERY_DIVERGENCE',
      TRANSACTION_PHASES.RECOVER,
      `manifest=${manifestClass} scene=${sceneClass}`,
    );
  }
  if (currentManifest !== target.manifest) {
    await publishManifestExact({
      publishManifest,
      manifestPath,
      expectedText: currentManifest,
      nextText: target.manifest,
      revision: journal.revision,
      reason: committed ? 'recover-committed' : 'recover-uncommitted',
    });
  }
  if (currentScene !== target.scene) {
    await publishSceneExact({
      scenePath,
      expectedText: currentScene,
      nextText: target.scene,
      revision: journal.revision,
      fsAdapter,
    });
  }
  const finalManifest = await readOptionalText(manifestPath, fsAdapter);
  const finalScene = await readOptionalText(scenePath, fsAdapter);
  if (finalManifest !== target.manifest || finalScene !== target.scene) {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_RECOVERY_READBACK', TRANSACTION_PHASES.RECOVER);
  }
  await removeDurably(journalPath, fsAdapter);
  return Object.freeze({
    recovered: true,
    outcome: committed ? 'COMMITTED_CONVERGED' : 'UNCOMMITTED_ROLLED_BACK',
    transactionId: journal.transactionId,
  });
}

async function commitProjectTransaction({
  scenePath,
  sceneContent,
  expectedSceneContent,
  manifestPath,
  manifestContent,
  expectedManifestContent,
  revision,
  publishManifest,
  fsAdapter = fsp,
}) {
  assertPathPair(scenePath, manifestPath);
  assertText(sceneContent, 'E_PROJECT_TRANSACTION_SCENE_CONTENT', TRANSACTION_PHASES.ADMIT);
  if (expectedSceneContent !== null) {
    assertText(expectedSceneContent, 'E_PROJECT_TRANSACTION_EXPECTED_SCENE_CONTENT', TRANSACTION_PHASES.ADMIT);
  }
  assertText(manifestContent, 'E_PROJECT_TRANSACTION_MANIFEST_CONTENT', TRANSACTION_PHASES.ADMIT);
  assertText(expectedManifestContent, 'E_PROJECT_TRANSACTION_EXPECTED_MANIFEST_CONTENT', TRANSACTION_PHASES.ADMIT);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_REVISION', TRANSACTION_PHASES.ADMIT, String(revision));
  }
  if (typeof publishManifest !== 'function') {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_MANIFEST_AUTHORITY_REQUIRED', TRANSACTION_PHASES.ADMIT);
  }

  const recovery = await recoverProjectTransaction({ scenePath, manifestPath, publishManifest, fsAdapter });
  const observedScene = await readOptionalText(scenePath, fsAdapter);
  const observedManifest = await readOptionalText(manifestPath, fsAdapter);
  if (observedScene !== expectedSceneContent) {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_SCENE_CAS', TRANSACTION_PHASES.ADMIT);
  }
  if (observedManifest !== expectedManifestContent) {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_MANIFEST_CAS', TRANSACTION_PHASES.ADMIT);
  }

  const before = { scene: expectedSceneContent, manifest: expectedManifestContent };
  const after = { scene: sceneContent, manifest: manifestContent };
  const transactionId = transactionIdFor({ scenePath, manifestPath, revision, before, after });
  const priorCommit = await readCommitRecord(scenePath, fsAdapter);
  if (priorCommit
    && priorCommit.revision === revision
    && priorCommit.sceneDigest === sha256hex(after.scene)
    && priorCommit.manifestDigest === sha256hex(after.manifest)
    && priorCommit.scenePath === scenePath
    && priorCommit.manifestPath === manifestPath) {
    return Object.freeze({
      success: true,
      phases: TRANSACTION_PHASE_CHAIN,
      revision,
      transactionId: priorCommit.transactionId,
      sceneDigest: sha256hex(sceneContent),
      manifestDigest: sha256hex(manifestContent),
      recovery,
      idempotent: true,
    });
  }

  const journal = {
    schemaVersion: JOURNAL_SCHEMA_VERSION,
    transactionId,
    revision,
    scenePath,
    manifestPath,
    before: {
      sceneBase64: encodeOptionalText(before.scene),
      manifestBase64: encodeOptionalText(before.manifest),
    },
    after: {
      sceneBase64: encodeOptionalText(after.scene),
      manifestBase64: encodeOptionalText(after.manifest),
    },
  };
  const journalPath = journalPathFor(manifestPath);
  await durableSaveTransaction({
    filePath: journalPath,
    content: `${JSON.stringify(journal)}\n`,
    revision,
    fsAdapter,
  });

  await publishManifestExact({
    publishManifest,
    manifestPath,
    expectedText: before.manifest,
    nextText: after.manifest,
    revision,
    reason: 'project-transaction-publish',
  });
  await publishSceneExact({
    scenePath,
    expectedText: before.scene,
    nextText: after.scene,
    revision,
    fsAdapter,
  });

  const commitRecord = {
    schemaVersion: COMMIT_SCHEMA_VERSION,
    transactionId,
    revision,
    scenePath,
    manifestPath,
    sceneDigest: sha256hex(after.scene),
    manifestDigest: sha256hex(after.manifest),
  };
  await durableSaveTransaction({
    filePath: commitPathFor(scenePath),
    content: `${JSON.stringify(commitRecord)}\n`,
    revision,
    fsAdapter,
  });

  const finalScene = await readOptionalText(scenePath, fsAdapter);
  const finalManifest = await readOptionalText(manifestPath, fsAdapter);
  if (finalScene !== after.scene || finalManifest !== after.manifest) {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_READBACK', TRANSACTION_PHASES.READBACK);
  }
  await removeDurably(journalPath, fsAdapter);

  return Object.freeze({
    success: true,
    phases: TRANSACTION_PHASE_CHAIN,
    revision,
    transactionId,
    sceneDigest: sha256hex(sceneContent),
    manifestDigest: sha256hex(manifestContent),
    recovery,
    idempotent: false,
  });
}

function classifyProjectTransactionState({ scenePath, manifestPath }) {
  assertPathPair(scenePath, manifestPath);
  const commitPath = commitPathFor(scenePath);
  if (!fs.existsSync(commitPath)) return { classification: 'NO_COMMIT_RECORD' };
  let record;
  try {
    record = JSON.parse(fs.readFileSync(commitPath, 'utf8'));
  } catch {
    return { classification: 'PARTIAL_CORRUPTION_DETECTED', reason: 'COMMIT_RECORD_INVALID' };
  }
  if (!record || record.schemaVersion !== COMMIT_SCHEMA_VERSION
    || record.scenePath !== scenePath || record.manifestPath !== manifestPath) {
    return { classification: 'PARTIAL_CORRUPTION_DETECTED', reason: 'COMMIT_RECORD_BINDING' };
  }
  if (!fs.existsSync(scenePath) || !fs.existsSync(manifestPath)) {
    return { classification: 'PARTIAL_CORRUPTION_DETECTED', reason: 'ARTIFACT_MISSING' };
  }
  const sceneDigest = sha256hex(fs.readFileSync(scenePath));
  const manifestDigest = sha256hex(fs.readFileSync(manifestPath));
  if (sceneDigest !== record.sceneDigest || manifestDigest !== record.manifestDigest) {
    return { classification: 'PARTIAL_CORRUPTION_DETECTED', reason: 'ARTIFACT_DIGEST_MISMATCH' };
  }
  return { classification: 'NEW_COMMITTED', record };
}

module.exports = Object.freeze({
  COMMIT_SCHEMA_VERSION,
  JOURNAL_SCHEMA_VERSION,
  ProjectTransactionError,
  TRANSACTION_PHASES,
  TRANSACTION_PHASE_CHAIN,
  classifyProjectTransactionState,
  commitPathFor,
  commitProjectTransaction,
  journalPathFor,
  readPendingProjectTransactionBinding,
  recoverProjectTransaction,
});
