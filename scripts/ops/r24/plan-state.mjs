#!/usr/bin/env node
// R2.4 E0 — PlanExecutionState: durable atomic CAS store, formal transition
// engine, idempotency journal and total crash classification.
// Law source: sealed package machine/AUTONOMY_CONTROL_PLANE_R2_4.json
// (MissionState.expectedRevisionRequired, DURABLE_ATOMIC_CAS) and the
// delivery-law state machine. No blind overwrite, no silent transition.
import {
  readJsonBounded,
  writeJsonAtomic,
  classifyWriteArtifacts,
  canonicalDigest,
  R24Error,
  HEX40_RE,
} from './canonical-json.mjs';
import fs from 'node:fs';

export const PLAN_STATE_SCHEMA_VERSION = 'yalken.plan-state.r24.v2';
export const PLAN_STATE_REPLAY_BASELINE_VERSION = 'PlanStateReplayBaselineV1';
export const PLAN_STATE_TRANSITION_RECEIPT_VERSION = 'PlanStateTransitionReceiptV1';
const CONTOUR_MUTATION_TOKEN = Symbol('R24_CONTOUR_TRANSITION_ENGINE');

// Ported one-to-one from sealed machine/EXECUTABLE_PROGRAM_R2_4.json
// lifecycleStates + stateTransitions (graph SOT outranks delivery-law prose).
export const DEFAULT_TRANSITION_LAW = Object.freeze({
  lifecycleStates: Object.freeze([
    'PENDING', 'ELIGIBLE', 'RUNNING', 'WAIT_OWNER', 'BLOCKED_TYPED', 'FAILED',
    'DELIVERED', 'POSTMERGE_VERIFIED', 'DONE', 'CANCELLED', 'INELIGIBLE_OPTIONAL',
  ]),
  stateTransitions: Object.freeze({
    PENDING: Object.freeze(['ELIGIBLE', 'WAIT_OWNER', 'BLOCKED_TYPED', 'CANCELLED', 'INELIGIBLE_OPTIONAL']),
    ELIGIBLE: Object.freeze(['RUNNING', 'WAIT_OWNER', 'BLOCKED_TYPED', 'CANCELLED']),
    RUNNING: Object.freeze(['FAILED', 'DELIVERED', 'WAIT_OWNER', 'BLOCKED_TYPED', 'CANCELLED']),
    FAILED: Object.freeze(['ELIGIBLE', 'WAIT_OWNER', 'CANCELLED']),
    DELIVERED: Object.freeze(['POSTMERGE_VERIFIED', 'FAILED']),
    POSTMERGE_VERIFIED: Object.freeze(['DONE', 'FAILED']),
    WAIT_OWNER: Object.freeze(['ELIGIBLE', 'CANCELLED']),
    BLOCKED_TYPED: Object.freeze(['ELIGIBLE', 'CANCELLED']),
    DONE: Object.freeze([]),
    CANCELLED: Object.freeze([]),
    INELIGIBLE_OPTIONAL: Object.freeze([]),
  }),
});

export function createTransitionValidator(law = DEFAULT_TRANSITION_LAW) {
  const states = new Set(law.lifecycleStates);
  const transitions = law.stateTransitions;
  return function assertTransition(from, to) {
    if (!states.has(from)) throw new R24Error('E_TRANSITION_UNKNOWN_STATE', `from=${String(from)}`);
    if (!states.has(to)) throw new R24Error('E_TRANSITION_UNKNOWN_STATE', `to=${String(to)}`);
    const allowed = transitions[from];
    if (!Array.isArray(allowed)) throw new R24Error('E_TRANSITION_LAW_MISSING', `from=${from}`);
    if (allowed.length === 0) throw new R24Error('E_TERMINAL_STATE_HAS_NO_OUTGOING', from);
    if (!allowed.includes(to)) throw new R24Error('E_ILLEGAL_TRANSITION', `${from} -> ${to}`);
    return true;
  };
}

const contourStates = (contours) => Object.fromEntries(
  Object.entries(contours).map(([id, row]) => [id, row?.state]),
);

function assertLegacyPlanStateShape(state, filePath) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new R24Error('E_PLAN_STATE_SHAPE', filePath);
  if (state.schemaVersion !== 'yalken.plan-state.r24.v1') throw new R24Error('E_PLAN_STATE_LEGACY_SCHEMA_VERSION', filePath);
  if (!Number.isInteger(state.revision) || state.revision < 0) throw new R24Error('E_PLAN_STATE_REVISION_SHAPE', filePath);
  if (!Number.isInteger(state.fencingCounter) || state.fencingCounter < 0) throw new R24Error('E_PLAN_STATE_FENCING_SHAPE', filePath);
  for (const key of ['contours', 'leases', 'idempotency']) {
    if (!state[key] || typeof state[key] !== 'object' || Array.isArray(state[key])) throw new R24Error('E_PLAN_STATE_SECTION_SHAPE', `${filePath}:${key}`);
  }
}

function assertReplayBaseline(baseline, filePath) {
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) throw new R24Error('E_REPLAY_BASELINE_SHAPE', filePath);
  if (baseline.schemaVersion !== PLAN_STATE_REPLAY_BASELINE_VERSION) throw new R24Error('E_REPLAY_BASELINE_VERSION', filePath);
  if (!Number.isInteger(baseline.revision) || baseline.revision < 0) throw new R24Error('E_REPLAY_BASELINE_REVISION', filePath);
  if (!Number.isInteger(baseline.fencingCounter) || baseline.fencingCounter < 0) throw new R24Error('E_REPLAY_BASELINE_FENCING', filePath);
  if (typeof baseline.contourStatesDigest !== 'string' || !/^[0-9a-f]{64}$/.test(baseline.contourStatesDigest)) {
    throw new R24Error('E_REPLAY_BASELINE_DIGEST', filePath);
  }
  if (!['GENESIS', 'ADOPTED_PRE_V2_UNREPLAYABLE_HISTORY'].includes(baseline.classification)) {
    throw new R24Error('E_REPLAY_BASELINE_CLASSIFICATION', filePath);
  }
  if (!Array.isArray(baseline.unreplayableContourIds) || new Set(baseline.unreplayableContourIds).size !== baseline.unreplayableContourIds.length) {
    throw new R24Error('E_REPLAY_BASELINE_UNREPLAYABLE_IDS', filePath);
  }
  if (baseline.classification === 'GENESIS' && baseline.unreplayableContourIds.length !== 0) {
    throw new R24Error('E_REPLAY_GENESIS_HAS_UNREPLAYABLE_HISTORY', filePath);
  }
  if (baseline.classification !== 'GENESIS') {
    if (typeof baseline.authority !== 'string' || baseline.authority.length === 0) throw new R24Error('E_REPLAY_BASELINE_AUTHORITY', filePath);
    if (typeof baseline.adoptedAt !== 'string' || !Number.isFinite(Date.parse(baseline.adoptedAt))) throw new R24Error('E_REPLAY_BASELINE_CLOCK', filePath);
    if (typeof baseline.sourceHeadSha !== 'string' || !HEX40_RE.test(baseline.sourceHeadSha)) throw new R24Error('E_REPLAY_BASELINE_HEAD', filePath);
  }
}

function assertTransitionRecord(record, filePath) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new R24Error('E_TRANSITION_RECORD_SHAPE', filePath);
  for (const key of ['transitionId', 'contourId', 'from', 'to', 'attemptId', 'writerId', 'idempotencyKey', 'requestDigest', 'appliedAt']) {
    if (typeof record[key] !== 'string' || record[key].length === 0) throw new R24Error('E_TRANSITION_RECORD_FIELD', `${filePath}:${key}`);
  }
  if (!/^[0-9a-f]{64}$/.test(record.transitionId) || !/^[0-9a-f]{64}$/.test(record.requestDigest)) {
    throw new R24Error('E_TRANSITION_RECORD_DIGEST', filePath);
  }
  if (!Number.isInteger(record.fromRevision) || !Number.isInteger(record.toRevision) || record.toRevision !== record.fromRevision + 1) {
    throw new R24Error('E_TRANSITION_RECORD_REVISION', filePath);
  }
  if (!Number.isInteger(record.fencingToken) || record.fencingToken < 1) throw new R24Error('E_TRANSITION_RECORD_FENCE', filePath);
  if (typeof record.baselinePresent !== 'boolean') throw new R24Error('E_TRANSITION_RECORD_BASELINE_PRESENCE', filePath);
  if (record.headSha !== null && !HEX40_RE.test(String(record.headSha))) throw new R24Error('E_TRANSITION_RECORD_HEAD', filePath);
  if (!Number.isFinite(Date.parse(record.appliedAt))) throw new R24Error('E_TRANSITION_RECORD_CLOCK', filePath);
}

export function validateTransitionReplay(state, filePath = '<memory>') {
  assertReplayBaseline(state.replayBaseline, filePath);
  if (!Array.isArray(state.transitionHistory)) throw new R24Error('E_TRANSITION_HISTORY_SHAPE', filePath);
  const validate = createTransitionValidator();
  const reconstructed = contourStates(state.contours);
  const seenIds = new Set();
  const seenKeys = new Set();
  let nextUpperRevision = state.revision + 1;
  for (let index = state.transitionHistory.length - 1; index >= 0; index -= 1) {
    const record = state.transitionHistory[index];
    assertTransitionRecord(record, `${filePath}:transitionHistory[${index}]`);
    if (record.toRevision >= nextUpperRevision) throw new R24Error('E_TRANSITION_HISTORY_ORDER', `${record.toRevision} >= ${nextUpperRevision}`);
    nextUpperRevision = record.toRevision;
    if (reconstructed[record.contourId] !== record.to) {
      throw new R24Error('E_TRANSITION_REPLAY_FINAL_STATE', `${record.contourId}:${String(reconstructed[record.contourId])} != ${record.to}`);
    }
    if (record.baselinePresent) reconstructed[record.contourId] = record.from;
    else delete reconstructed[record.contourId];
  }
  if (canonicalDigest(reconstructed) !== state.replayBaseline.contourStatesDigest) {
    throw new R24Error('E_TRANSITION_REPLAY_BASELINE_DIGEST', filePath);
  }
  const lastByContour = new Map();
  let priorRevision = state.replayBaseline.revision;
  for (let index = 0; index < state.transitionHistory.length; index += 1) {
    const record = state.transitionHistory[index];
    validate(record.from, record.to);
    if (record.fromRevision < priorRevision) throw new R24Error('E_TRANSITION_HISTORY_ORDER', `${record.fromRevision} < ${priorRevision}`);
    priorRevision = record.toRevision;
    if (record.fencingToken < state.replayBaseline.fencingCounter) throw new R24Error('E_TRANSITION_HISTORY_STALE_FENCE', record.contourId);
    if (seenIds.has(record.transitionId)) throw new R24Error('E_TRANSITION_ID_DUPLICATE', record.transitionId);
    if (seenKeys.has(record.idempotencyKey)) throw new R24Error('E_TRANSITION_IDEMPOTENCY_DUPLICATE', record.idempotencyKey);
    seenIds.add(record.transitionId);
    seenKeys.add(record.idempotencyKey);
    const journal = state.idempotency[record.idempotencyKey];
    if (!journal || journal.requestDigest !== record.requestDigest || journal.receipt?.transitionId !== record.transitionId) {
      throw new R24Error('E_TRANSITION_IDEMPOTENCY_UNBOUND', record.idempotencyKey);
    }
    lastByContour.set(record.contourId, record);
  }
  for (const [id, record] of lastByContour) {
    const row = state.contours[id];
    if (!row || row.state !== record.to || row.previousState !== record.from || row.attemptId !== record.attemptId || row.headSha !== record.headSha) {
      throw new R24Error('E_TRANSITION_REPLAY_ROW_MISMATCH', id);
    }
  }
  if (state.transitionHistory.length > 0 && priorRevision > state.revision) throw new R24Error('E_TRANSITION_HISTORY_FUTURE_REVISION', filePath);
  return {
    verdict: 'PASS',
    baselineClassification: state.replayBaseline.classification,
    baselineRevision: state.replayBaseline.revision,
    replayedTransitions: state.transitionHistory.length,
    finalRevision: state.revision,
  };
}

const assertPlanStateShape = (state, filePath) => {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new R24Error('E_PLAN_STATE_SHAPE', filePath);
  if (state.schemaVersion !== PLAN_STATE_SCHEMA_VERSION) throw new R24Error('E_PLAN_STATE_SCHEMA_VERSION', filePath);
  if (!Number.isInteger(state.revision) || state.revision < 0) throw new R24Error('E_PLAN_STATE_REVISION_SHAPE', filePath);
  if (!Number.isInteger(state.fencingCounter) || state.fencingCounter < 0) throw new R24Error('E_PLAN_STATE_FENCING_SHAPE', filePath);
  for (const key of ['contours', 'leases', 'idempotency']) {
    if (!state[key] || typeof state[key] !== 'object' || Array.isArray(state[key])) throw new R24Error('E_PLAN_STATE_SECTION_SHAPE', `${filePath}:${key}`);
  }
  validateTransitionReplay(state, filePath);
};

export function adoptPlanStateReplayBaseline(legacyState, {
  sourceHeadSha,
  adoptedAt,
  authority,
  unreplayableContourIds,
}) {
  assertLegacyPlanStateShape(legacyState, '<legacy-plan-state>');
  if (Object.keys(legacyState.leases).length !== 0) throw new R24Error('E_REPLAY_BASELINE_ACTIVE_LEASES');
  if (!HEX40_RE.test(String(sourceHeadSha))) throw new R24Error('E_REPLAY_BASELINE_HEAD');
  if (!Number.isFinite(Date.parse(adoptedAt))) throw new R24Error('E_REPLAY_BASELINE_CLOCK');
  if (typeof authority !== 'string' || authority.length === 0) throw new R24Error('E_REPLAY_BASELINE_AUTHORITY');
  if (!Array.isArray(unreplayableContourIds) || unreplayableContourIds.length === 0) throw new R24Error('E_REPLAY_BASELINE_UNREPLAYABLE_IDS');
  const state = structuredClone(legacyState);
  state.schemaVersion = PLAN_STATE_SCHEMA_VERSION;
  state.replayBaseline = {
    schemaVersion: PLAN_STATE_REPLAY_BASELINE_VERSION,
    revision: state.revision,
    fencingCounter: state.fencingCounter,
    contourStatesDigest: canonicalDigest(contourStates(state.contours)),
    classification: 'ADOPTED_PRE_V2_UNREPLAYABLE_HISTORY',
    sourceHeadSha,
    adoptedAt,
    authority,
    unreplayableContourIds: [...new Set(unreplayableContourIds)].sort(),
  };
  state.transitionHistory = [];
  assertPlanStateShape(state, '<adopted-plan-state>');
  return state;
}

export function initPlanState(filePath) {
  if (fs.existsSync(filePath)) return readPlanState(filePath);
  const initial = {
    schemaVersion: PLAN_STATE_SCHEMA_VERSION,
    revision: 0,
    fencingCounter: 0,
    contours: {},
    leases: {},
    idempotency: {},
    replayBaseline: {
      schemaVersion: PLAN_STATE_REPLAY_BASELINE_VERSION,
      revision: 0,
      fencingCounter: 0,
      contourStatesDigest: canonicalDigest({}),
      classification: 'GENESIS',
      sourceHeadSha: null,
      adoptedAt: null,
      authority: 'PLAN_STATE_GENESIS',
      unreplayableContourIds: [],
    },
    transitionHistory: [],
  };
  writeJsonAtomic(filePath, initial);
  return initial;
}

export function readPlanState(filePath) {
  const state = readJsonBounded(filePath);
  assertPlanStateShape(state, filePath);
  return state;
}

// Compare-and-swap mutation. expectedRevision mismatch aborts before any
// mutation function runs; an already-applied idempotencyKey suppresses the
// duplicate effect and returns the stored receipt instead of writing again.
export function casUpdate(filePath, {
  expectedRevision,
  expectedFencingCounter = null,
  idempotencyKey = null,
  idempotencyPayload = null,
  mutate,
  _contourMutationToken = null,
}) {
  if (!Number.isInteger(expectedRevision)) throw new R24Error('E_CAS_REVISION_SHAPE');
  if (typeof mutate !== 'function') throw new R24Error('E_CAS_MUTATE_REQUIRED');
  const state = readPlanState(filePath);
  let requestDigest = null;
  if (idempotencyKey !== null) {
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0) throw new R24Error('E_IDEMPOTENCY_KEY_SHAPE');
    if (!idempotencyPayload || typeof idempotencyPayload !== 'object' || Array.isArray(idempotencyPayload)) throw new R24Error('E_IDEMPOTENCY_PAYLOAD_REQUIRED');
    requestDigest = canonicalDigest(idempotencyPayload);
    const prior = state.idempotency[idempotencyKey];
    if (prior) {
      if (typeof prior.requestDigest !== 'string') throw new R24Error('E_IDEMPOTENCY_LEGACY_UNVERIFIABLE', idempotencyKey);
      if (prior.requestDigest !== requestDigest) throw new R24Error('E_IDEMPOTENCY_KEY_REUSE', idempotencyKey);
      return { applied: false, duplicate: true, revision: state.revision, receipt: prior.receipt ?? null };
    }
  }
  if (state.revision !== expectedRevision) {
    throw new R24Error('E_CAS_REVISION_CONFLICT', `expected=${expectedRevision} actual=${state.revision}`);
  }
  if (expectedFencingCounter !== null) {
    if (!Number.isInteger(expectedFencingCounter) || expectedFencingCounter < 0) throw new R24Error('E_CAS_FENCING_SHAPE');
    if (state.fencingCounter !== expectedFencingCounter) {
      throw new R24Error('E_CAS_FENCING_CONFLICT', `expected=${expectedFencingCounter} actual=${state.fencingCounter}`);
    }
  }
  const draft = structuredClone(state);
  const beforeTransitionControlDigest = canonicalDigest({
    contours: draft.contours,
    replayBaseline: draft.replayBaseline,
    transitionHistory: draft.transitionHistory,
    idempotency: draft.idempotency,
  });
  const result = mutate(draft) || {};
  const afterTransitionControlDigest = canonicalDigest({
    contours: draft.contours,
    replayBaseline: draft.replayBaseline,
    transitionHistory: draft.transitionHistory,
    idempotency: draft.idempotency,
  });
  if (afterTransitionControlDigest !== beforeTransitionControlDigest && _contourMutationToken !== CONTOUR_MUTATION_TOKEN) {
    throw new R24Error('E_CONTOUR_MUTATION_REQUIRES_TRANSITION_ENGINE');
  }
  draft.revision = state.revision + 1;
  if (idempotencyKey !== null) {
    draft.idempotency[idempotencyKey] = { revision: draft.revision, requestDigest, receipt: result.receipt ?? null };
  }
  assertPlanStateShape(draft, filePath);
  const write = writeJsonAtomic(filePath, draft);
  return { applied: true, duplicate: false, revision: draft.revision, result, write };
}

export function transitionContour(filePath, {
  contourId,
  to,
  expectedRevision,
  attemptId,
  writerId,
  fencingToken,
  idempotencyKey,
  now,
  headSha = null,
  law = DEFAULT_TRANSITION_LAW,
}) {
  if (typeof contourId !== 'string' || contourId.length === 0) throw new R24Error('E_CONTOUR_ID_REQUIRED');
  if (typeof attemptId !== 'string' || attemptId.length === 0) throw new R24Error('E_ATTEMPT_ID_REQUIRED');
  if (typeof writerId !== 'string' || writerId.length === 0) throw new R24Error('E_WRITER_ID_REQUIRED');
  if (!Number.isInteger(fencingToken) || fencingToken < 1) throw new R24Error('E_FENCE_STALE');
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0) throw new R24Error('E_IDEMPOTENCY_KEY_REQUIRED');
  if (typeof now !== 'string' || now.length === 0) throw new R24Error('E_CLOCK_REQUIRED');
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new R24Error('E_CLOCK_INVALID', now);
  if (headSha !== null && !HEX40_RE.test(String(headSha))) throw new R24Error('E_TRANSITION_HEAD_SHAPE');
  const assertTransition = createTransitionValidator(law);
  const idempotencyPayload = {
    operation: 'TRANSITION_CONTOUR',
    contourId,
    to,
    expectedRevision,
    attemptId,
    writerId,
    fencingToken,
    now,
    headSha,
  };
  const requestDigest = canonicalDigest(idempotencyPayload);
  const transitionId = canonicalDigest({ idempotencyKey, requestDigest });
  return casUpdate(filePath, {
    expectedRevision,
    expectedFencingCounter: fencingToken,
    idempotencyKey,
    idempotencyPayload,
    _contourMutationToken: CONTOUR_MUTATION_TOKEN,
    mutate: (draft) => {
      const current = draft.contours[contourId] || null;
      const from = current ? current.state : 'PENDING';
      assertTransition(from, to);
      const lease = draft.leases[contourId];
      if (!lease) throw new R24Error('E_TRANSITION_LEASE_REQUIRED', contourId);
      if (lease.writerId !== writerId) throw new R24Error('E_LEASE_WRITER_MISMATCH', contourId);
      if (lease.fencingToken !== fencingToken) throw new R24Error('E_FENCE_STALE', contourId);
      if (nowMs >= Date.parse(lease.expiresAt)) throw new R24Error('E_LEASE_EXPIRED', contourId);
      const receipt = {
        schemaVersion: PLAN_STATE_TRANSITION_RECEIPT_VERSION,
        transitionId,
        contourId,
        from,
        to,
        fromRevision: expectedRevision,
        toRevision: expectedRevision + 1,
        attemptId,
        writerId,
        fencingToken,
        idempotencyKey,
        requestDigest,
        headSha,
        appliedAt: now,
      };
      draft.contours[contourId] = {
        state: to,
        previousState: from,
        attemptId,
        updatedAt: now,
        headSha,
      };
      draft.transitionHistory.push({ ...receipt, baselinePresent: current !== null });
      return { transition: { contourId, from, to }, receipt };
    },
  });
}

export function classifyPlanStateAfterCrash(filePath, options = {}) {
  if (!fs.existsSync(filePath)) {
    return { classification: 'ROLLBACK_REQUIRED', reason: 'PLAN_STATE_MISSING' };
  }
  return classifyWriteArtifacts(filePath, options);
}
