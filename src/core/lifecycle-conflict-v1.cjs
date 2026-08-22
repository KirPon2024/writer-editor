'use strict';

// R2.4 R5_LIFECYCLE_EXTERNAL_CONFLICT — lifecycle barrier and recovery-choice
// protocol. This module is a pure Product Core decision surface: it consumes
// current authoring coordinates, pending outbox effects and disk identity
// observations, then returns a typed allow/block projection. It never writes
// project truth and never treats renderer visibility as authority.

const { SAVE_ACK_KINDS, deriveDirty } = require('./dirty-admission-v1.cjs');

const LIFECYCLE_EVENTS = Object.freeze({
  QUIT: 'QUIT',
  SUSPEND: 'SUSPEND',
  CRASH_RECOVERY: 'CRASH_RECOVERY',
  EXTERNAL_EDIT: 'EXTERNAL_EDIT',
});

const LIFECYCLE_DECISIONS = Object.freeze({
  ALLOW: 'ALLOW',
  BLOCKED: 'BLOCKED',
});

const LIFECYCLE_REASONS = Object.freeze({
  SAFE_TO_CLOSE: 'SAFE_TO_CLOSE',
  SAFE_TO_SUSPEND: 'SAFE_TO_SUSPEND',
  RECOVERY_CLEAN: 'RECOVERY_CLEAN',
  EXTERNAL_EDIT_NO_DIVERGENCE: 'EXTERNAL_EDIT_NO_DIVERGENCE',
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

class LifecycleConflictError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

const EVENT_SET = new Set(Object.values(LIFECYCLE_EVENTS));
const SHA256_RE = /^[0-9a-f]{64}$/;

function normalizeLifecycleEvent(eventKind) {
  const event = typeof eventKind === 'string' ? eventKind.trim() : '';
  if (!EVENT_SET.has(event)) throw new LifecycleConflictError('E_LIFECYCLE_EVENT_UNKNOWN', String(eventKind));
  return event;
}

function normalizeDigest(value, field) {
  if (value === null || value === undefined || value === '') return null;
  const digest = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!SHA256_RE.test(digest)) throw new LifecycleConflictError('E_LIFECYCLE_DIGEST_INVALID', field);
  return digest;
}

function normalizePendingEffects(pendingEffects = []) {
  if (!Array.isArray(pendingEffects)) throw new LifecycleConflictError('E_LIFECYCLE_PENDING_EFFECTS_SHAPE');
  const seen = new Set();
  return pendingEffects.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new LifecycleConflictError('E_LIFECYCLE_PENDING_EFFECT_SHAPE', String(index));
    }
    const effectId = typeof raw.effectId === 'string' ? raw.effectId.trim() : '';
    const intentId = typeof raw.intentId === 'string' ? raw.intentId.trim() : '';
    if (!effectId) throw new LifecycleConflictError('E_LIFECYCLE_PENDING_EFFECT_ID_REQUIRED', String(index));
    if (!intentId) throw new LifecycleConflictError('E_LIFECYCLE_PENDING_INTENT_ID_REQUIRED', effectId);
    if (raw.status !== undefined && raw.status !== 'PENDING') {
      throw new LifecycleConflictError('E_LIFECYCLE_PENDING_EFFECT_STATUS', `${effectId}:${String(raw.status)}`);
    }
    if (seen.has(effectId)) throw new LifecycleConflictError('E_LIFECYCLE_PENDING_EFFECT_DUPLICATE', effectId);
    seen.add(effectId);
    return Object.freeze({
      effectId,
      intentId,
      kind: typeof raw.kind === 'string' ? raw.kind.trim() : '',
    });
  });
}

function deriveDirtyTyped({ latestEditGeneration, ackedGeneration }) {
  try {
    return deriveDirty({ latestEditGeneration, ackedGeneration });
  } catch (error) {
    throw new LifecycleConflictError('E_LIFECYCLE_DIRTY_COORDINATE_INVALID', error && error.code ? error.code : String(error && error.message || error));
  }
}

function assertDigestPair(committedDigest, observedDiskDigest) {
  if ((committedDigest === null) !== (observedDiskDigest === null)) {
    throw new LifecycleConflictError('E_LIFECYCLE_DIGEST_PAIR_REQUIRED');
  }
}

function allowReasonFor(eventKind) {
  if (eventKind === LIFECYCLE_EVENTS.QUIT) return LIFECYCLE_REASONS.SAFE_TO_CLOSE;
  if (eventKind === LIFECYCLE_EVENTS.SUSPEND) return LIFECYCLE_REASONS.SAFE_TO_SUSPEND;
  if (eventKind === LIFECYCLE_EVENTS.CRASH_RECOVERY) return LIFECYCLE_REASONS.RECOVERY_CLEAN;
  return LIFECYCLE_REASONS.EXTERNAL_EDIT_NO_DIVERGENCE;
}

function buildDecision({ decision, reason, eventKind, dirty, pendingEffects, diverged, recoveryActions }) {
  return Object.freeze({
    schemaVersion: 'yalken.lifecycleConflictDecision.v1',
    decision,
    allowed: decision === LIFECYCLE_DECISIONS.ALLOW,
    reason,
    eventKind,
    dirty,
    pendingEffectCount: pendingEffects.length,
    pendingEffectIds: Object.freeze(pendingEffects.map((effect) => effect.effectId)),
    diverged,
    recoveryActions: Object.freeze(recoveryActions),
  });
}

function evaluateLifecycleBarrier({
  eventKind,
  latestEditGeneration,
  ackedGeneration,
  pendingEffects = [],
  committedDigest = null,
  observedDiskDigest = null,
  saveAck = null,
} = {}) {
  const event = normalizeLifecycleEvent(eventKind);
  const dirty = deriveDirtyTyped({ latestEditGeneration, ackedGeneration });
  const effects = normalizePendingEffects(pendingEffects);
  const committed = normalizeDigest(committedDigest, 'committedDigest');
  const observed = normalizeDigest(observedDiskDigest, 'observedDiskDigest');
  assertDigestPair(committed, observed);
  const diverged = committed !== null && observed !== null && committed !== observed;

  if (saveAck && saveAck.kind === SAVE_ACK_KINDS.AT_RISK) {
    return buildDecision({
      decision: LIFECYCLE_DECISIONS.BLOCKED,
      reason: LIFECYCLE_REASONS.AT_RISK_WRITE_FAILURE,
      eventKind: event,
      dirty,
      pendingEffects: effects,
      diverged,
      recoveryActions: [RECOVERY_ACTIONS.KEEP_OPEN, RECOVERY_ACTIONS.SAVE_BEFORE_CLOSE],
    });
  }
  if (effects.length > 0) {
    return buildDecision({
      decision: LIFECYCLE_DECISIONS.BLOCKED,
      reason: LIFECYCLE_REASONS.PENDING_EFFECT_REPLAY_REQUIRED,
      eventKind: event,
      dirty,
      pendingEffects: effects,
      diverged,
      recoveryActions: [RECOVERY_ACTIONS.REPLAY_PENDING_EFFECTS, RECOVERY_ACTIONS.KEEP_OPEN],
    });
  }
  if (diverged) {
    return buildDecision({
      decision: LIFECYCLE_DECISIONS.BLOCKED,
      reason: LIFECYCLE_REASONS.EXTERNAL_DIVERGENCE_DETECTED,
      eventKind: event,
      dirty,
      pendingEffects: effects,
      diverged,
      recoveryActions: [RECOVERY_ACTIONS.FORK_RECOVERY_COPY, RECOVERY_ACTIONS.COMPARE_EXTERNAL_EDIT, RECOVERY_ACTIONS.KEEP_AUTHORING_DRAFT],
    });
  }
  if (dirty) {
    return buildDecision({
      decision: LIFECYCLE_DECISIONS.BLOCKED,
      reason: LIFECYCLE_REASONS.UNSAVED_AUTHORING_WORK,
      eventKind: event,
      dirty,
      pendingEffects: effects,
      diverged,
      recoveryActions: [RECOVERY_ACTIONS.SAVE_BEFORE_CLOSE, RECOVERY_ACTIONS.KEEP_OPEN],
    });
  }
  return buildDecision({
    decision: LIFECYCLE_DECISIONS.ALLOW,
    reason: allowReasonFor(event),
    eventKind: event,
    dirty,
    pendingEffects: effects,
    diverged,
    recoveryActions: [RECOVERY_ACTIONS.NO_ACTION],
  });
}

module.exports = Object.freeze({
  LIFECYCLE_EVENTS,
  LIFECYCLE_DECISIONS,
  LIFECYCLE_REASONS,
  RECOVERY_ACTIONS,
  LifecycleConflictError,
  evaluateLifecycleBarrier,
});
