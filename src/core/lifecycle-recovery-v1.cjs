'use strict';

// WP-204 composes the already-certified Writer recovery primitives. The
// caller remains responsible for supplying exact product-owned paths and the
// manifest publication authority; this module adds no live runtime adapter.

const crypto = require('node:crypto');
const path = require('node:path');

const {
  openTransactionalInboxOutbox,
} = require('./transactional-inbox-outbox-v1.cjs');
const {
  LIFECYCLE_EVENTS,
  createFreshOutboxObservation,
  evaluateLifecycleBarrier,
} = require('./lifecycle-conflict-v1.cjs');
const {
  recoverProjectTransaction,
} = require('./project-transaction-v1.cjs');
const {
  replayMigrationHistory,
} = require('./migration-history-backup-gc-v1.cjs');
const {
  openSelectedRecoveryLedger,
  verifyStorageSelection,
} = require('./storage-selection-v1.cjs');

const LIFECYCLE_RECOVERY_SCHEMA_VERSION = 'yalken.lifecycleRecovery.v1';
const LIFECYCLE_EVENT_SET = new Set(Object.values(LIFECYCLE_EVENTS));

class LifecycleRecoveryError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

function requiredText(value, code) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new LifecycleRecoveryError(code);
  return text;
}

function requiredAbsolutePath(value, code) {
  const candidate = requiredText(value, code);
  if (!path.isAbsolute(candidate) || path.normalize(candidate) !== candidate) {
    throw new LifecycleRecoveryError(code, 'absolute-normalized-path-required');
  }
  return candidate;
}

function requiredGeneration(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new LifecycleRecoveryError('E_LIFECYCLE_RECOVERY_GENERATION');
  }
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function digestReceipt(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex');
}

function checkpointId(record, index) {
  return requiredText(record?.checkpointId, `E_LIFECYCLE_RECOVERY_CHECKPOINT_ID_${index}`);
}

function buildCheckpointGcPlan(checkpoints, retainLast) {
  if (!Array.isArray(checkpoints)) throw new LifecycleRecoveryError('E_LIFECYCLE_RECOVERY_CHECKPOINTS_SHAPE');
  if (!Number.isInteger(retainLast) || retainLast < 1) {
    throw new LifecycleRecoveryError('E_LIFECYCLE_RECOVERY_RETAIN_BOUND');
  }
  const seen = new Set();
  const ordered = checkpoints.map((record, index) => {
    const id = checkpointId(record, index);
    if (seen.has(id)) throw new LifecycleRecoveryError('E_LIFECYCLE_RECOVERY_CHECKPOINT_DUPLICATE', id);
    seen.add(id);
    if (!Number.isInteger(record?.sequence) || record.sequence < 1) {
      throw new LifecycleRecoveryError('E_LIFECYCLE_RECOVERY_CHECKPOINT_SEQUENCE', id);
    }
    return { checkpointId: id, sequence: record.sequence };
  }).sort((left, right) => left.sequence - right.sequence || left.checkpointId.localeCompare(right.checkpointId));
  const deleteCount = Math.max(0, ordered.length - retainLast);
  return deepFreeze({
    retainLast,
    checkpointCount: ordered.length,
    wouldDeleteCheckpointIds: ordered.slice(0, deleteCount).map((record) => record.checkpointId),
    retainedCheckpointIds: ordered.slice(deleteCount).map((record) => record.checkpointId),
    automaticExecution: false,
  });
}

function normalizeProjectTransaction(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new LifecycleRecoveryError('E_LIFECYCLE_RECOVERY_PROJECT_TRANSACTION_REQUIRED');
  }
  if (typeof input.publishManifest !== 'function') {
    throw new LifecycleRecoveryError('E_LIFECYCLE_RECOVERY_MANIFEST_AUTHORITY_REQUIRED');
  }
  return {
    scenePath: requiredAbsolutePath(input.scenePath, 'E_LIFECYCLE_RECOVERY_SCENE_PATH'),
    manifestPath: requiredAbsolutePath(input.manifestPath, 'E_LIFECYCLE_RECOVERY_MANIFEST_PATH'),
    publishManifest: input.publishManifest,
    ...(input.fsAdapter ? { fsAdapter: input.fsAdapter } : {}),
  };
}

function publicLifecycleDecision(decision) {
  return {
    eventKind: decision.eventKind,
    decision: decision.decision,
    allowed: decision.allowed,
    reason: decision.reason,
    subjectId: decision.subjectId,
    observationGeneration: decision.observationGeneration,
    pendingEffectCount: decision.pendingEffectCount,
    activeHazards: [...decision.activeHazards],
    recoveryActions: [...decision.recoveryActions],
  };
}

async function executeLifecycleRecovery({
  subjectId,
  observationGeneration,
  eventKind = LIFECYCLE_EVENTS.CRASH_RECOVERY,
  selection,
  recoveryLedgerDir,
  inboxOutboxDir,
  migrationStoreDir,
  projectTransaction,
  saveReceipt = null,
  diskObservation = null,
  retainCheckpoints = 3,
  recoveryLedgerOptions = undefined,
} = {}) {
  const subject = requiredText(subjectId, 'E_LIFECYCLE_RECOVERY_SUBJECT_REQUIRED');
  const generation = requiredGeneration(observationGeneration);
  if (!LIFECYCLE_EVENT_SET.has(eventKind)) {
    throw new LifecycleRecoveryError('E_LIFECYCLE_RECOVERY_EVENT', String(eventKind));
  }
  verifyStorageSelection(selection);
  const ledgerDir = requiredAbsolutePath(recoveryLedgerDir, 'E_LIFECYCLE_RECOVERY_LEDGER_PATH');
  const inboxDir = requiredAbsolutePath(inboxOutboxDir, 'E_LIFECYCLE_RECOVERY_INBOX_PATH');
  const migrationDir = requiredAbsolutePath(migrationStoreDir, 'E_LIFECYCLE_RECOVERY_MIGRATION_PATH');
  const transactionInput = normalizeProjectTransaction(projectTransaction);

  const ledger = await openSelectedRecoveryLedger(selection, ledgerDir, recoveryLedgerOptions);
  const inboxOutbox = await openTransactionalInboxOutbox(inboxDir);
  const transaction = await recoverProjectTransaction(transactionInput);
  const migration = await replayMigrationHistory(migrationDir);
  const outboxObservation = createFreshOutboxObservation({
    subjectId: subject,
    observationGeneration: generation,
    inboxOutbox,
  });
  const decision = evaluateLifecycleBarrier({
    eventKind,
    subjectId: subject,
    latestEditGeneration: generation,
    ackedGeneration: generation,
    ...(saveReceipt ? { saveReceipt } : {}),
    outboxObservation,
    ...(diskObservation ? { diskObservation } : {}),
  });
  const ledgerReplay = ledger.replay();
  const inboxReplay = inboxOutbox.replay();
  const gcPlan = buildCheckpointGcPlan(migration.checkpoints, retainCheckpoints);
  const body = {
    schemaVersion: LIFECYCLE_RECOVERY_SCHEMA_VERSION,
    subjectId: subject,
    observationGeneration: generation,
    selection: {
      selectionDigest: selection.selectionDigest,
      primaryStorageCandidateId: selection.selectedPrimaryStorage.candidateId,
      recoveryLedgerId: selection.selectedRecoveryLedger.ledgerId,
      liveStoragePathChange: false,
    },
    recoveryLedger: {
      entries: ledgerReplay.entries,
      subjects: ledgerReplay.subjects,
      headDigest: ledgerReplay.headDigest,
      tornTailTruncated: ledger.tornTailTruncated,
    },
    inboxOutbox: {
      intentCount: inboxReplay.intents.length,
      effectCount: inboxReplay.effects.length,
      pendingEffectIds: inboxOutbox.pendingEffects().map((effect) => effect.effectId),
      inboxDigest: inboxReplay.inboxDigest,
      outboxDigest: inboxReplay.outboxDigest,
      automaticPublication: false,
    },
    projectTransaction: {
      recovered: transaction.recovered,
      outcome: transaction.outcome,
      transactionId: transaction.transactionId || null,
    },
    migration: {
      historyCount: migration.historyCount,
      checkpointCount: migration.checkpoints.length,
      quarantineCount: migration.quarantines.length,
      tornTailTruncated: migration.tornTailTruncated,
      lastRecordKind: migration.lastRecord?.kind || null,
    },
    checkpointGcPlan: gcPlan,
    lifecycle: publicLifecycleDecision(decision),
    authority: {
      liveStorageAttachment: false,
      userDataMigration: false,
      automaticEffectPublication: false,
      automaticCheckpointGc: false,
    },
  };
  return deepFreeze({ ...body, receiptDigest: digestReceipt(body) });
}

module.exports = Object.freeze({
  LIFECYCLE_RECOVERY_SCHEMA_VERSION,
  LifecycleRecoveryError,
  buildCheckpointGcPlan,
  executeLifecycleRecovery,
});
