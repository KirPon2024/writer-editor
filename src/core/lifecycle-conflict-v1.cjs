'use strict';

const { SAVE_ACK_KINDS, applySaveAck, deriveDirty } = require('./dirty-admission-v1.cjs');

const LIFECYCLE_EVENTS = Object.freeze({
  QUIT: 'QUIT',
  SUSPEND: 'SUSPEND',
  CRASH_RECOVERY: 'CRASH_RECOVERY',
  EXTERNAL_EDIT: 'EXTERNAL_EDIT',
});
const LIFECYCLE_DECISIONS = Object.freeze({ ALLOW: 'ALLOW', BLOCKED: 'BLOCKED' });
const LIFECYCLE_REASONS = Object.freeze({
  SAFE_TO_CLOSE: 'SAFE_TO_CLOSE',
  SAFE_TO_SUSPEND: 'SAFE_TO_SUSPEND',
  RECOVERY_CLEAN: 'RECOVERY_CLEAN',
  EXTERNAL_EDIT_NO_DIVERGENCE: 'EXTERNAL_EDIT_NO_DIVERGENCE',
  EVIDENCE_UNAVAILABLE: 'EVIDENCE_UNAVAILABLE',
  PROJECT_RECOVERY_REQUIRED: 'PROJECT_RECOVERY_REQUIRED',
  AT_RISK_WRITE_FAILURE: 'AT_RISK_WRITE_FAILURE',
  PENDING_EFFECT_REPLAY_REQUIRED: 'PENDING_EFFECT_REPLAY_REQUIRED',
  EXTERNAL_DIVERGENCE_DETECTED: 'EXTERNAL_DIVERGENCE_DETECTED',
  UNSAVED_AUTHORING_WORK: 'UNSAVED_AUTHORING_WORK',
});
const RECOVERY_ACTIONS = Object.freeze({
  NO_ACTION: 'NO_ACTION',
  KEEP_OPEN: 'KEEP_OPEN',
  SAVE_BEFORE_CLOSE: 'SAVE_BEFORE_CLOSE',
  REPLAY_PENDING_EFFECTS: 'REPLAY_PENDING_EFFECTS',
  FORK_RECOVERY_COPY: 'FORK_RECOVERY_COPY',
  COMPARE_EXTERNAL_EDIT: 'COMPARE_EXTERNAL_EDIT',
  KEEP_AUTHORING_DRAFT: 'KEEP_AUTHORING_DRAFT',
});
const OUTBOX_OBSERVATION_SOURCES = Object.freeze({
  NOT_ATTACHED: 'NO_OUTBOX_ATTACHED',
  R4_FRESH_REOPEN: 'R4_FRESH_REOPEN',
});
const CLEAN_P3_CLASSIFICATIONS = new Set(['OLD_COMMITTED', 'NEW_COMMITTED']);
const FRESH_OUTBOX_OBSERVATIONS = new WeakSet();
const EVENT_SET = new Set(Object.values(LIFECYCLE_EVENTS));
const SHA256_RE = /^[0-9a-f]{64}$/;

class LifecycleConflictError extends Error {
  constructor(code, detail = '') {
    super(detail ? code + ': ' + detail : code);
    this.code = code;
  }
}

function requiredText(value, code) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new LifecycleConflictError(code);
  return text;
}

function normalizeLifecycleEvent(eventKind) {
  const event = typeof eventKind === 'string' ? eventKind.trim() : '';
  if (!EVENT_SET.has(event)) throw new LifecycleConflictError('E_LIFECYCLE_EVENT_UNKNOWN', String(eventKind));
  return event;
}

function normalizeDigest(value, field, nullable = false) {
  if (nullable && (value === null || value === undefined || value === '')) return null;
  const digest = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!SHA256_RE.test(digest)) throw new LifecycleConflictError('E_LIFECYCLE_DIGEST_INVALID', field);
  return digest;
}

function normalizeGeneration(value, field) {
  if (!Number.isInteger(value) || value < 0) throw new LifecycleConflictError('E_LIFECYCLE_OBSERVATION_GENERATION', field);
  return value;
}

function normalizePendingEffects(pendingEffects) {
  if (!Array.isArray(pendingEffects)) throw new LifecycleConflictError('E_LIFECYCLE_PENDING_EFFECTS_SHAPE');
  const seen = new Set();
  return pendingEffects.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new LifecycleConflictError('E_LIFECYCLE_PENDING_EFFECT_SHAPE', String(index));
    }
    const effectId = requiredText(raw.effectId, 'E_LIFECYCLE_PENDING_EFFECT_ID_REQUIRED');
    const intentId = requiredText(raw.intentId, 'E_LIFECYCLE_PENDING_INTENT_ID_REQUIRED');
    if (raw.status !== undefined && raw.status !== 'PENDING') {
      throw new LifecycleConflictError('E_LIFECYCLE_PENDING_EFFECT_STATUS', effectId + ':' + String(raw.status));
    }
    if (seen.has(effectId)) throw new LifecycleConflictError('E_LIFECYCLE_PENDING_EFFECT_DUPLICATE', effectId);
    seen.add(effectId);
    return Object.freeze({ effectId, intentId, kind: typeof raw.kind === 'string' ? raw.kind.trim() : '' });
  });
}

function deriveDirtyTyped(coordinates) {
  try {
    return deriveDirty(coordinates);
  } catch (error) {
    throw new LifecycleConflictError('E_LIFECYCLE_DIRTY_COORDINATE_INVALID', error?.code || error?.message || String(error));
  }
}

function assertReceiptIdentity(receipt, subjectId, generation, schemaVersion) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) throw new LifecycleConflictError('E_LIFECYCLE_EVIDENCE_MISSING', schemaVersion);
  if (receipt.schemaVersion !== schemaVersion) throw new LifecycleConflictError('E_LIFECYCLE_EVIDENCE_SCHEMA', schemaVersion);
  if (requiredText(receipt.subjectId, 'E_LIFECYCLE_SUBJECT_REQUIRED') !== subjectId) throw new LifecycleConflictError('E_LIFECYCLE_EVIDENCE_SUBJECT');
  if (normalizeGeneration(receipt.observationGeneration, schemaVersion) !== generation) throw new LifecycleConflictError('E_LIFECYCLE_EVIDENCE_STALE');
}

function createSaveReceipt({ subjectId, observationGeneration, ack }) {
  return Object.freeze({
    schemaVersion: 'yalken.lifecycleSaveReceipt.v1',
    subjectId: requiredText(subjectId, 'E_LIFECYCLE_SUBJECT_REQUIRED'),
    observationGeneration: normalizeGeneration(observationGeneration, 'saveReceipt'),
    ack: ack && typeof ack === 'object' ? Object.freeze({ ...ack }) : ack,
  });
}

function createDetachedOutboxObservation({ subjectId, observationGeneration }) {
  return Object.freeze({
    schemaVersion: 'yalken.lifecycleOutboxObservation.v1',
    subjectId: requiredText(subjectId, 'E_LIFECYCLE_SUBJECT_REQUIRED'),
    observationGeneration: normalizeGeneration(observationGeneration, 'outboxObservation'),
    source: OUTBOX_OBSERVATION_SOURCES.NOT_ATTACHED,
    outboxDigest: null,
    pendingEffects: Object.freeze([]),
  });
}

function createFreshOutboxObservation({ subjectId, observationGeneration, inboxOutbox }) {
  if (!inboxOutbox || typeof inboxOutbox.replay !== 'function' || typeof inboxOutbox.pendingEffects !== 'function') {
    throw new LifecycleConflictError('E_LIFECYCLE_OUTBOX_ADAPTER_REQUIRED');
  }
  const replay = inboxOutbox.replay();
  if (!replay || replay.schemaVersion !== 'yalken.transactionalInboxOutbox.v1' || !Array.isArray(replay.effects)) {
    throw new LifecycleConflictError('E_LIFECYCLE_OUTBOX_REPLAY_INVALID');
  }
  const pendingEffects = normalizePendingEffects(inboxOutbox.pendingEffects());
  const replayPending = replay.effects.filter((effect) => effect && effect.status === 'PENDING');
  if (replayPending.length !== pendingEffects.length || replayPending.some((effect, index) => (
    effect.effectId !== pendingEffects[index].effectId || effect.intentId !== pendingEffects[index].intentId
  ))) {
    throw new LifecycleConflictError('E_LIFECYCLE_OUTBOX_REPLAY_MISMATCH');
  }
  const receipt = Object.freeze({
    schemaVersion: 'yalken.lifecycleOutboxObservation.v1',
    subjectId: requiredText(subjectId, 'E_LIFECYCLE_SUBJECT_REQUIRED'),
    observationGeneration: normalizeGeneration(observationGeneration, 'outboxObservation'),
    source: OUTBOX_OBSERVATION_SOURCES.R4_FRESH_REOPEN,
    outboxDigest: normalizeDigest(replay.outboxDigest, 'outboxDigest'),
    pendingEffects: Object.freeze(pendingEffects),
  });
  FRESH_OUTBOX_OBSERVATIONS.add(receipt);
  return receipt;
}

function normalizeSaveReceipt(receipt, subjectId, generation, coordinates) {
  assertReceiptIdentity(receipt, subjectId, generation, 'yalken.lifecycleSaveReceipt.v1');
  try {
    applySaveAck(coordinates, receipt.ack);
    if (normalizeGeneration(receipt.ack.latestEditGeneration, 'saveAck.latestEditGeneration') !== generation) {
      throw new LifecycleConflictError('E_LIFECYCLE_SAVE_ACK_INVALID', 'latestEditGeneration');
    }
    if (receipt.ack.kind === SAVE_ACK_KINDS.SAVED && receipt.ack.reason !== '') {
      throw new LifecycleConflictError('E_LIFECYCLE_SAVE_ACK_INVALID', 'savedReason');
    }
  } catch (error) {
    if (error instanceof LifecycleConflictError) throw error;
    throw new LifecycleConflictError('E_LIFECYCLE_SAVE_ACK_INVALID', error?.code || error?.message || String(error));
  }
  return Object.freeze({ ...receipt.ack });
}

function normalizeOutboxObservation(receipt, subjectId, generation, eventKind) {
  assertReceiptIdentity(receipt, subjectId, generation, 'yalken.lifecycleOutboxObservation.v1');
  if (!Object.values(OUTBOX_OBSERVATION_SOURCES).includes(receipt.source)) throw new LifecycleConflictError('E_LIFECYCLE_OUTBOX_SOURCE');
  const effects = normalizePendingEffects(receipt.pendingEffects);
  if (receipt.source === OUTBOX_OBSERVATION_SOURCES.NOT_ATTACHED) {
    if (receipt.outboxDigest !== null || effects.length !== 0) throw new LifecycleConflictError('E_LIFECYCLE_DETACHED_OUTBOX_NONEMPTY');
    if (eventKind === LIFECYCLE_EVENTS.CRASH_RECOVERY) throw new LifecycleConflictError('E_LIFECYCLE_CRASH_OUTBOX_NOT_FRESH');
  } else {
    if (!FRESH_OUTBOX_OBSERVATIONS.has(receipt)) throw new LifecycleConflictError('E_LIFECYCLE_OUTBOX_NOT_FRESH');
    normalizeDigest(receipt.outboxDigest, 'outboxDigest');
  }
  return effects;
}

function normalizeDiskObservation(receipt, subjectId, generation, eventKind) {
  const required = eventKind === LIFECYCLE_EVENTS.CRASH_RECOVERY || eventKind === LIFECYCLE_EVENTS.EXTERNAL_EDIT;
  if (!required && receipt === null) return { diverged: false, recoveryRequired: false };
  assertReceiptIdentity(receipt, subjectId, generation, 'yalken.lifecycleDiskObservation.v1');
  const committed = normalizeDigest(receipt.committedDigest, 'committedDigest');
  const observed = normalizeDigest(receipt.observedDiskDigest, 'observedDiskDigest');
  requiredText(receipt.p3Classification, 'E_LIFECYCLE_P3_CLASSIFICATION_REQUIRED');
  const recoveryRequired = !CLEAN_P3_CLASSIFICATIONS.has(receipt.p3Classification);
  return { diverged: committed !== observed, recoveryRequired };
}

function allowReasonFor(eventKind) {
  if (eventKind === LIFECYCLE_EVENTS.QUIT) return LIFECYCLE_REASONS.SAFE_TO_CLOSE;
  if (eventKind === LIFECYCLE_EVENTS.SUSPEND) return LIFECYCLE_REASONS.SAFE_TO_SUSPEND;
  if (eventKind === LIFECYCLE_EVENTS.CRASH_RECOVERY) return LIFECYCLE_REASONS.RECOVERY_CLEAN;
  return LIFECYCLE_REASONS.EXTERNAL_EDIT_NO_DIVERGENCE;
}

function buildDecision({ decision, reason, eventKind, subjectId, dirty, pendingEffects, diverged, hazards, recoveryActions }) {
  return Object.freeze({
    schemaVersion: 'yalken.lifecycleConflictDecision.v2',
    decision,
    allowed: decision === LIFECYCLE_DECISIONS.ALLOW,
    reason,
    eventKind,
    subjectId,
    dirty,
    pendingEffectCount: pendingEffects.length,
    pendingEffectIds: Object.freeze(pendingEffects.map((effect) => effect.effectId)),
    diverged,
    activeHazards: Object.freeze([...hazards]),
    recoveryActions: Object.freeze([...recoveryActions]),
  });
}

function blockedEvidence(eventKind, subjectId, dirty, detail) {
  return buildDecision({
    decision: LIFECYCLE_DECISIONS.BLOCKED,
    reason: LIFECYCLE_REASONS.EVIDENCE_UNAVAILABLE,
    eventKind,
    subjectId,
    dirty,
    pendingEffects: [],
    diverged: false,
    hazards: ['EVIDENCE_UNAVAILABLE:' + detail],
    recoveryActions: [RECOVERY_ACTIONS.KEEP_OPEN, RECOVERY_ACTIONS.KEEP_AUTHORING_DRAFT],
  });
}

function evaluateLifecycleBarrier({
  eventKind,
  subjectId,
  latestEditGeneration,
  ackedGeneration,
  saveReceipt = null,
  outboxObservation = null,
  diskObservation = null,
} = {}) {
  const event = normalizeLifecycleEvent(eventKind);
  const subject = requiredText(subjectId, 'E_LIFECYCLE_SUBJECT_REQUIRED');
  const coordinates = { latestEditGeneration, ackedGeneration };
  const dirty = deriveDirtyTyped(coordinates);
  const generation = latestEditGeneration;
  try {
    const saveAck = (event === LIFECYCLE_EVENTS.QUIT || event === LIFECYCLE_EVENTS.SUSPEND || saveReceipt !== null)
      ? normalizeSaveReceipt(saveReceipt, subject, generation, coordinates)
      : null;
    const effects = normalizeOutboxObservation(outboxObservation, subject, generation, event);
    const disk = normalizeDiskObservation(diskObservation, subject, generation, event);
    const hazards = [];
    if (disk.diverged) hazards.push('EXTERNAL_DIVERGENCE');
    if (disk.recoveryRequired) hazards.push('PROJECT_RECOVERY');
    if (saveAck?.kind === SAVE_ACK_KINDS.AT_RISK || saveAck?.kind === SAVE_ACK_KINDS.PROTECTED) hazards.push('SAVE_NOT_CURRENT');
    if (effects.length > 0) hazards.push('PENDING_EFFECTS');
    if (dirty) hazards.push('UNSAVED_AUTHORING');

    if (hazards.length === 0) {
      return buildDecision({
        decision: LIFECYCLE_DECISIONS.ALLOW,
        reason: allowReasonFor(event),
        eventKind: event,
        subjectId: subject,
        dirty,
        pendingEffects: effects,
        diverged: false,
        hazards,
        recoveryActions: [RECOVERY_ACTIONS.NO_ACTION],
      });
    }

    let reason;
    let recoveryActions;
    if (disk.diverged) {
      reason = LIFECYCLE_REASONS.EXTERNAL_DIVERGENCE_DETECTED;
      recoveryActions = [RECOVERY_ACTIONS.FORK_RECOVERY_COPY, RECOVERY_ACTIONS.COMPARE_EXTERNAL_EDIT, RECOVERY_ACTIONS.KEEP_AUTHORING_DRAFT];
    } else if (disk.recoveryRequired) {
      reason = LIFECYCLE_REASONS.PROJECT_RECOVERY_REQUIRED;
      recoveryActions = [RECOVERY_ACTIONS.KEEP_OPEN, RECOVERY_ACTIONS.FORK_RECOVERY_COPY];
    } else if (saveAck?.kind === SAVE_ACK_KINDS.AT_RISK || saveAck?.kind === SAVE_ACK_KINDS.PROTECTED) {
      reason = LIFECYCLE_REASONS.AT_RISK_WRITE_FAILURE;
      recoveryActions = effects.length > 0
        ? [RECOVERY_ACTIONS.KEEP_OPEN]
        : [RECOVERY_ACTIONS.KEEP_OPEN, RECOVERY_ACTIONS.SAVE_BEFORE_CLOSE];
    } else if (effects.length > 0) {
      reason = LIFECYCLE_REASONS.PENDING_EFFECT_REPLAY_REQUIRED;
      recoveryActions = [RECOVERY_ACTIONS.REPLAY_PENDING_EFFECTS, RECOVERY_ACTIONS.KEEP_OPEN];
    } else {
      reason = LIFECYCLE_REASONS.UNSAVED_AUTHORING_WORK;
      recoveryActions = [RECOVERY_ACTIONS.SAVE_BEFORE_CLOSE, RECOVERY_ACTIONS.KEEP_OPEN];
    }
    return buildDecision({
      decision: LIFECYCLE_DECISIONS.BLOCKED,
      reason,
      eventKind: event,
      subjectId: subject,
      dirty,
      pendingEffects: effects,
      diverged: disk.diverged,
      hazards,
      recoveryActions,
    });
  } catch (error) {
    const evidenceCodes = new Set([
      'E_LIFECYCLE_SAVE_ACK_INVALID',
      'E_LIFECYCLE_OUTBOX_SOURCE',
      'E_LIFECYCLE_DETACHED_OUTBOX_NONEMPTY',
      'E_LIFECYCLE_CRASH_OUTBOX_NOT_FRESH',
      'E_LIFECYCLE_OUTBOX_NOT_FRESH',
      'E_LIFECYCLE_P3_CLASSIFICATION_REQUIRED',
    ]);
    if (error instanceof LifecycleConflictError
      && (error.code.startsWith('E_LIFECYCLE_EVIDENCE') || evidenceCodes.has(error.code))) {
      return blockedEvidence(event, subject, dirty, error.code);
    }
    throw error;
  }
}

module.exports = Object.freeze({
  LIFECYCLE_EVENTS,
  LIFECYCLE_DECISIONS,
  LIFECYCLE_REASONS,
  RECOVERY_ACTIONS,
  OUTBOX_OBSERVATION_SOURCES,
  LifecycleConflictError,
  createSaveReceipt,
  createDetachedOutboxObservation,
  createFreshOutboxObservation,
  evaluateLifecycleBarrier,
});
