// R2.4 WP-201_PROJECT_TRANSACTION - one recoverable scene + manifest commit.
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const { durableSaveTransaction } = require('./save-coordinator-v1.cjs');

const JOURNAL_SCHEMA_VERSION = 'yalken.project-transaction.journal.v1';
const COMMIT_SCHEMA_VERSION = 'yalken.project-transaction.commit.v1';
const RECOVERY_PACKET_SCHEMA_VERSION = 'yalken.project-transaction.recovery-packet.v1';
const PROJECT_COMMIT_REPAIR_CAPABILITY_ID = 'CAP_R24_PROJECT_COMMIT_REPAIR';
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
const recoveryDirectoryFor = (manifestPath) => path.join(path.dirname(manifestPath), '.yalken-recovery');
const recoveryPacketPathFor = (manifestPath, transactionId) => path.join(
  recoveryDirectoryFor(manifestPath),
  `wp201-${transactionId}.json`,
);

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const canonicalBytes = (value) => `${canonicalize(value)}\n`;

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
  if (!Number.isSafeInteger(journal.revision) || journal.revision < 0) {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_JOURNAL_REVISION', TRANSACTION_PHASES.RECOVER);
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

function isDigest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function corruptCommitState(source, reason) {
  return Object.freeze({ status: 'CORRUPT', source, reason });
}

async function readCommitRecordState({
  scenePath,
  manifestPath,
  expectedJournal = null,
  observedScene,
  observedManifest,
  fsAdapter = fsp,
}) {
  const source = await readOptionalText(commitPathFor(scenePath), fsAdapter);
  if (source === null) return Object.freeze({ status: 'ABSENT', source: null });
  let record;
  try {
    record = JSON.parse(source);
  } catch {
    return corruptCommitState(source, 'COMMIT_RECORD_JSON');
  }
  if (!record || record.schemaVersion !== COMMIT_SCHEMA_VERSION
    || !isDigest(record.transactionId)
    || !Number.isSafeInteger(record.revision) || record.revision < 0
    || !isDigest(record.sceneDigest) || !isDigest(record.manifestDigest)) {
    return corruptCommitState(source, 'COMMIT_RECORD_SCHEMA');
  }
  if (record.scenePath !== scenePath || record.manifestPath !== manifestPath) {
    return corruptCommitState(source, 'COMMIT_RECORD_BINDING');
  }
  if (expectedJournal) {
    const currentCommit = record.transactionId === expectedJournal.transactionId
      && record.revision === expectedJournal.revision
      && record.sceneDigest === sha256hex(expectedJournal.after.scene)
      && record.manifestDigest === sha256hex(expectedJournal.after.manifest);
    if (currentCommit) return Object.freeze({ status: 'VALID', relation: 'CURRENT', record, source });
    const priorCommit = record.sceneDigest === digestOptional(expectedJournal.before.scene)
      && record.manifestDigest === sha256hex(expectedJournal.before.manifest);
    if (priorCommit) return Object.freeze({ status: 'VALID', relation: 'PRIOR', record, source });
    if (record.transactionId === expectedJournal.transactionId && record.revision !== expectedJournal.revision) {
      return corruptCommitState(source, 'COMMIT_RECORD_REVISION_MISMATCH');
    }
    if (record.transactionId !== expectedJournal.transactionId) {
      return corruptCommitState(source, 'COMMIT_RECORD_TRANSACTION_MISMATCH');
    }
    return corruptCommitState(source, 'COMMIT_RECORD_DIGEST_MISMATCH');
  }
  if (observedScene !== undefined && record.sceneDigest !== digestOptional(observedScene)) {
    return corruptCommitState(source, 'COMMIT_RECORD_SCENE_DIGEST_MISMATCH');
  }
  if (observedManifest !== undefined && record.manifestDigest !== digestOptional(observedManifest)) {
    return corruptCommitState(source, 'COMMIT_RECORD_MANIFEST_DIGEST_MISMATCH');
  }
  return Object.freeze({ status: 'VALID', relation: 'OBSERVED', record, source });
}

function snapshotRole(role, value) {
  const present = value !== null;
  const bytes = present ? Buffer.from(value, 'utf8') : null;
  return {
    role,
    present,
    encoding: 'base64',
    sizeBytes: bytes ? bytes.length : 0,
    sha256: bytes ? sha256hex(bytes) : null,
    valueBase64: bytes ? bytes.toString('base64') : null,
  };
}

function buildRecoveryPacket({ journal, journalSource, commitState, currentScene, currentManifest }) {
  return {
    schemaVersion: RECOVERY_PACKET_SCHEMA_VERSION,
    capabilityId: PROJECT_COMMIT_REPAIR_CAPABILITY_ID,
    status: 'PRESERVED_AWAITING_INDEPENDENT_AUTHORITY',
    binding: {
      transactionId: journal.transactionId,
      revision: journal.revision,
      reasonCode: commitState.reason,
    },
    artifacts: [
      snapshotRole('BEFORE_SCENE', journal.before.scene),
      snapshotRole('BEFORE_MANIFEST', journal.before.manifest),
      snapshotRole('AFTER_SCENE', journal.after.scene),
      snapshotRole('AFTER_MANIFEST', journal.after.manifest),
      snapshotRole('OBSERVED_SCENE', currentScene),
      snapshotRole('OBSERVED_MANIFEST', currentManifest),
      snapshotRole('CORRUPT_COMMIT_METADATA', commitState.source),
      snapshotRole('TRANSACTION_JOURNAL', journalSource),
    ],
    repairContract: {
      allowedDecisions: ['REPAIR_TO_AFTER', 'REPAIR_TO_BEFORE'],
      exactPacketDigestRequired: true,
      independentVerifierRequired: true,
      automaticRepairForbidden: true,
    },
  };
}

function publicRecoveryBinding(packetDigest, journal) {
  return Object.freeze({
    capabilityId: PROJECT_COMMIT_REPAIR_CAPABILITY_ID,
    packetDigest,
    transactionId: journal.transactionId,
    versionRoles: Object.freeze(['BEFORE', 'AFTER', 'CORRUPT_COMMIT_METADATA']),
    repairAuthorityRequired: true,
  });
}

async function preserveRecoveryPacket({
  manifestPath,
  journal,
  journalSource,
  commitState,
  currentScene,
  currentManifest,
  fsAdapter = fsp,
}) {
  const packet = buildRecoveryPacket({ journal, journalSource, commitState, currentScene, currentManifest });
  const bytes = canonicalBytes(packet);
  const packetDigest = sha256hex(bytes);
  const packetPath = recoveryPacketPathFor(manifestPath, journal.transactionId);
  const recoveryDirectory = path.dirname(packetPath);
  await fsAdapter.mkdir(recoveryDirectory, { recursive: true });
  await fsyncDirectory(path.dirname(recoveryDirectory), fsAdapter);
  const existing = await readOptionalText(packetPath, fsAdapter);
  if (existing === null) {
    await durableSaveTransaction({ filePath: packetPath, content: bytes, revision: journal.revision, fsAdapter });
  } else if (existing !== bytes) {
    throw new ProjectTransactionError(
      'E_PROJECT_COMMIT_RECOVERY_PACKET_CONFLICT',
      TRANSACTION_PHASES.RECOVER,
      journal.transactionId,
    );
  }
  const readback = await fsAdapter.readFile(packetPath);
  if (sha256hex(readback) !== packetDigest || !readback.equals(Buffer.from(bytes))) {
    throw new ProjectTransactionError(
      'E_PROJECT_COMMIT_RECOVERY_PACKET_READBACK',
      TRANSACTION_PHASES.RECOVER,
      journal.transactionId,
    );
  }
  return Object.freeze({ packet, packetDigest, packetPath });
}

async function failCorruptCommit({
  manifestPath,
  journal,
  journalSource,
  commitState,
  currentScene,
  currentManifest,
  fsAdapter = fsp,
}) {
  const preserved = await preserveRecoveryPacket({
    manifestPath,
    journal,
    journalSource,
    commitState,
    currentScene,
    currentManifest,
    fsAdapter,
  });
  const error = new ProjectTransactionError(
    'E_PROJECT_COMMIT_CORRUPT',
    TRANSACTION_PHASES.RECOVER,
    commitState.reason,
  );
  error.recovery = publicRecoveryBinding(preserved.packetDigest, journal);
  throw error;
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
  const currentManifest = await readOptionalText(manifestPath, fsAdapter);
  const currentScene = await readOptionalText(scenePath, fsAdapter);
  const commitState = await readCommitRecordState({
    scenePath,
    manifestPath,
    expectedJournal: journal,
    fsAdapter,
  });
  if (commitState.status === 'CORRUPT') {
    await failCorruptCommit({
      manifestPath,
      journal,
      journalSource: source,
      commitState,
      currentScene,
      currentManifest,
      fsAdapter,
    });
  }
  const committed = commitState.status === 'VALID' && commitState.relation === 'CURRENT';
  const target = committed ? journal.after : journal.before;
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
  const priorCommitState = await readCommitRecordState({
    scenePath,
    manifestPath,
    observedScene,
    observedManifest,
    fsAdapter,
  });
  if (priorCommitState.status === 'CORRUPT') {
    await failCorruptCommit({
      manifestPath,
      journal: { ...journal, before, after },
      journalSource: null,
      commitState: priorCommitState,
      currentScene: observedScene,
      currentManifest: observedManifest,
      fsAdapter,
    });
  }
  const priorCommit = priorCommitState.status === 'VALID' ? priorCommitState.record : null;
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

function decodePacketRole(packet, role) {
  const matches = Array.isArray(packet?.artifacts)
    ? packet.artifacts.filter((artifact) => artifact?.role === role)
    : [];
  if (matches.length !== 1) {
    throw new ProjectTransactionError('E_PROJECT_COMMIT_RECOVERY_PACKET_SHAPE', TRANSACTION_PHASES.RECOVER, role);
  }
  const artifact = matches[0];
  if (artifact.encoding !== 'base64' || typeof artifact.present !== 'boolean') {
    throw new ProjectTransactionError('E_PROJECT_COMMIT_RECOVERY_PACKET_SHAPE', TRANSACTION_PHASES.RECOVER, role);
  }
  if (!artifact.present) {
    if (artifact.valueBase64 !== null || artifact.sha256 !== null || artifact.sizeBytes !== 0) {
      throw new ProjectTransactionError('E_PROJECT_COMMIT_RECOVERY_PACKET_SHAPE', TRANSACTION_PHASES.RECOVER, role);
    }
    return null;
  }
  if (typeof artifact.valueBase64 !== 'string' || !isDigest(artifact.sha256)
    || !Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes < 0) {
    throw new ProjectTransactionError('E_PROJECT_COMMIT_RECOVERY_PACKET_SHAPE', TRANSACTION_PHASES.RECOVER, role);
  }
  const bytes = Buffer.from(artifact.valueBase64, 'base64');
  if (bytes.toString('base64') !== artifact.valueBase64
    || bytes.length !== artifact.sizeBytes || sha256hex(bytes) !== artifact.sha256) {
    throw new ProjectTransactionError('E_PROJECT_COMMIT_RECOVERY_PACKET_DIGEST', TRANSACTION_PHASES.RECOVER, role);
  }
  return bytes.toString('utf8');
}

function journalWireRecord(journal) {
  return {
    schemaVersion: JOURNAL_SCHEMA_VERSION,
    transactionId: journal.transactionId,
    revision: journal.revision,
    scenePath: journal.scenePath,
    manifestPath: journal.manifestPath,
    before: {
      sceneBase64: encodeOptionalText(journal.before.scene),
      manifestBase64: encodeOptionalText(journal.before.manifest),
    },
    after: {
      sceneBase64: encodeOptionalText(journal.after.scene),
      manifestBase64: encodeOptionalText(journal.after.manifest),
    },
  };
}

async function repairCorruptProjectCommit({
  scenePath,
  manifestPath,
  publishManifest,
  decision,
  authorityProof,
  verifyAuthorityProof,
  recoveryTransactionId,
  recoveryPacketDigest,
  fsAdapter = fsp,
}) {
  assertPathPair(scenePath, manifestPath);
  if (typeof publishManifest !== 'function') {
    throw new ProjectTransactionError('E_PROJECT_TRANSACTION_MANIFEST_AUTHORITY_REQUIRED', TRANSACTION_PHASES.ADMIT);
  }
  if (!['REPAIR_TO_AFTER', 'REPAIR_TO_BEFORE'].includes(decision)) {
    throw new ProjectTransactionError('E_PROJECT_COMMIT_REPAIR_DECISION', TRANSACTION_PHASES.ADMIT);
  }
  if (typeof verifyAuthorityProof !== 'function') {
    throw new ProjectTransactionError('E_PROJECT_COMMIT_REPAIR_AUTHORITY_REQUIRED', TRANSACTION_PHASES.ADMIT);
  }

  const journalPath = journalPathFor(manifestPath);
  let journalSource = await readOptionalText(journalPath, fsAdapter);
  let journal;
  let syntheticJournal = false;
  let packetPath;
  let packetSource;
  if (journalSource === null) {
    if (!isDigest(recoveryTransactionId) || !isDigest(recoveryPacketDigest)) {
      throw new ProjectTransactionError('E_PROJECT_COMMIT_REPAIR_RECOVERY_BINDING_REQUIRED', TRANSACTION_PHASES.RECOVER);
    }
    packetPath = recoveryPacketPathFor(manifestPath, recoveryTransactionId);
    packetSource = await readOptionalText(packetPath, fsAdapter);
    if (packetSource === null || sha256hex(packetSource) !== recoveryPacketDigest) {
      throw new ProjectTransactionError('E_PROJECT_COMMIT_RECOVERY_PACKET_UNVERIFIED', TRANSACTION_PHASES.RECOVER);
    }
    let packet;
    try {
      packet = JSON.parse(packetSource);
    } catch {
      throw new ProjectTransactionError('E_PROJECT_COMMIT_RECOVERY_PACKET_SHAPE', TRANSACTION_PHASES.RECOVER);
    }
    if (packetSource !== canonicalBytes(packet)
      || packet.schemaVersion !== RECOVERY_PACKET_SCHEMA_VERSION
      || packet.capabilityId !== PROJECT_COMMIT_REPAIR_CAPABILITY_ID
      || packet.binding?.transactionId !== recoveryTransactionId
      || !Number.isSafeInteger(packet.binding?.revision) || packet.binding.revision < 0) {
      throw new ProjectTransactionError('E_PROJECT_COMMIT_RECOVERY_PACKET_SHAPE', TRANSACTION_PHASES.RECOVER);
    }
    const before = {
      scene: decodePacketRole(packet, 'BEFORE_SCENE'),
      manifest: decodePacketRole(packet, 'BEFORE_MANIFEST'),
    };
    const after = {
      scene: decodePacketRole(packet, 'AFTER_SCENE'),
      manifest: decodePacketRole(packet, 'AFTER_MANIFEST'),
    };
    if (before.manifest === null || after.scene === null || after.manifest === null) {
      throw new ProjectTransactionError('E_PROJECT_COMMIT_RECOVERY_PACKET_SHAPE', TRANSACTION_PHASES.RECOVER);
    }
    journal = {
      schemaVersion: JOURNAL_SCHEMA_VERSION,
      transactionId: recoveryTransactionId,
      revision: packet.binding.revision,
      scenePath,
      manifestPath,
      before,
      after,
    };
    if (transactionIdFor({ scenePath, manifestPath, revision: journal.revision, before, after }) !== recoveryTransactionId) {
      throw new ProjectTransactionError('E_PROJECT_COMMIT_RECOVERY_PACKET_BINDING', TRANSACTION_PHASES.RECOVER);
    }
    syntheticJournal = true;
  } else {
    journal = parseJournal(journalSource, { scenePath, manifestPath });
    packetPath = recoveryPacketPathFor(manifestPath, journal.transactionId);
    packetSource = await readOptionalText(packetPath, fsAdapter);
  }
  const currentScene = await readOptionalText(scenePath, fsAdapter);
  const currentManifest = await readOptionalText(manifestPath, fsAdapter);
  const commitState = await readCommitRecordState({
    scenePath,
    manifestPath,
    expectedJournal: journal,
    fsAdapter,
  });
  if (commitState.status !== 'CORRUPT') {
    throw new ProjectTransactionError('E_PROJECT_COMMIT_REPAIR_CONTEXT_CHANGED', TRANSACTION_PHASES.RECOVER);
  }

  const expectedPacket = buildRecoveryPacket({
    journal,
    journalSource,
    commitState,
    currentScene,
    currentManifest,
  });
  const expectedBytes = canonicalBytes(expectedPacket);
  const packetDigest = sha256hex(expectedBytes);
  if (packetSource === null || packetSource !== expectedBytes) {
    throw new ProjectTransactionError('E_PROJECT_COMMIT_RECOVERY_PACKET_UNVERIFIED', TRANSACTION_PHASES.RECOVER);
  }
  if (recoveryPacketDigest !== undefined && recoveryPacketDigest !== packetDigest) {
    throw new ProjectTransactionError('E_PROJECT_COMMIT_RECOVERY_PACKET_UNVERIFIED', TRANSACTION_PHASES.RECOVER);
  }

  let authorized = false;
  try {
    authorized = await verifyAuthorityProof(Object.freeze({
      capabilityId: PROJECT_COMMIT_REPAIR_CAPABILITY_ID,
      packetDigest,
      transactionId: journal.transactionId,
      decision,
      authorityProof,
    }));
  } catch {
    authorized = false;
  }
  if (authorized !== true) {
    throw new ProjectTransactionError('E_PROJECT_COMMIT_REPAIR_AUTHORITY_REQUIRED', TRANSACTION_PHASES.RECOVER);
  }

  const [journalReadback, commitReadback, sceneReadback, manifestReadback] = await Promise.all([
    readOptionalText(journalPath, fsAdapter),
    readOptionalText(commitPathFor(scenePath), fsAdapter),
    readOptionalText(scenePath, fsAdapter),
    readOptionalText(manifestPath, fsAdapter),
  ]);
  if (journalReadback !== journalSource || commitReadback !== commitState.source
    || sceneReadback !== currentScene || manifestReadback !== currentManifest) {
    throw new ProjectTransactionError('E_PROJECT_COMMIT_REPAIR_CONTEXT_CHANGED', TRANSACTION_PHASES.RECOVER);
  }

  if (syntheticJournal) {
    journalSource = `${JSON.stringify(journalWireRecord(journal))}\n`;
    await durableSaveTransaction({
      filePath: journalPath,
      content: journalSource,
      revision: journal.revision,
      fsAdapter,
    });
  }

  if (decision === 'REPAIR_TO_BEFORE') {
    await removeDurably(commitPathFor(scenePath), fsAdapter);
  } else {
    const commitPath = commitPathFor(scenePath);
    const commitRecord = {
      schemaVersion: COMMIT_SCHEMA_VERSION,
      transactionId: journal.transactionId,
      revision: journal.revision,
      scenePath,
      manifestPath,
      sceneDigest: sha256hex(journal.after.scene),
      manifestDigest: sha256hex(journal.after.manifest),
    };
    await durableSaveTransaction({
      filePath: commitPath,
      content: `${JSON.stringify(commitRecord)}\n`,
      revision: journal.revision,
      fsAdapter,
    });
  }
  const recovery = await recoverProjectTransaction({ scenePath, manifestPath, publishManifest, fsAdapter });
  return Object.freeze({
    repaired: true,
    decision,
    outcome: recovery.outcome,
    capabilityId: PROJECT_COMMIT_REPAIR_CAPABILITY_ID,
    packetDigest,
    transactionId: journal.transactionId,
    recoveryPacketRetained: true,
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
  PROJECT_COMMIT_REPAIR_CAPABILITY_ID,
  RECOVERY_PACKET_SCHEMA_VERSION,
  ProjectTransactionError,
  TRANSACTION_PHASES,
  TRANSACTION_PHASE_CHAIN,
  classifyProjectTransactionState,
  commitPathFor,
  commitProjectTransaction,
  journalPathFor,
  readPendingProjectTransactionBinding,
  recoveryPacketPathFor,
  recoverProjectTransaction,
  repairCorruptProjectCommit,
});
