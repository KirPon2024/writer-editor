#!/usr/bin/env node
// R2.4 E0 — PlanExecutionState: durable atomic CAS store, formal transition
// engine, idempotency journal and total crash classification.
// Law source: sealed package machine/AUTONOMY_CONTROL_PLANE_R2_4.json
// (MissionState.expectedRevisionRequired, DURABLE_ATOMIC_CAS) and the
// delivery-law state machine. No blind overwrite, no silent transition.
import { readJsonBounded, writeJsonAtomic, classifyWriteArtifacts, R24Error } from './canonical-json.mjs';
import fs from 'node:fs';

export const PLAN_STATE_SCHEMA_VERSION = 'yalken.plan-state.r24.v1';

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

const assertPlanStateShape = (state, filePath) => {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new R24Error('E_PLAN_STATE_SHAPE', filePath);
  if (state.schemaVersion !== PLAN_STATE_SCHEMA_VERSION) throw new R24Error('E_PLAN_STATE_SCHEMA_VERSION', filePath);
  if (!Number.isInteger(state.revision) || state.revision < 0) throw new R24Error('E_PLAN_STATE_REVISION_SHAPE', filePath);
  if (!Number.isInteger(state.fencingCounter) || state.fencingCounter < 0) throw new R24Error('E_PLAN_STATE_FENCING_SHAPE', filePath);
  for (const key of ['contours', 'leases', 'idempotency']) {
    if (!state[key] || typeof state[key] !== 'object' || Array.isArray(state[key])) throw new R24Error('E_PLAN_STATE_SECTION_SHAPE', `${filePath}:${key}`);
  }
};

export function initPlanState(filePath) {
  if (fs.existsSync(filePath)) return readPlanState(filePath);
  const initial = {
    schemaVersion: PLAN_STATE_SCHEMA_VERSION,
    revision: 0,
    fencingCounter: 0,
    contours: {},
    leases: {},
    idempotency: {},
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
export function casUpdate(filePath, { expectedRevision, idempotencyKey = null, mutate }) {
  if (!Number.isInteger(expectedRevision)) throw new R24Error('E_CAS_REVISION_SHAPE');
  if (typeof mutate !== 'function') throw new R24Error('E_CAS_MUTATE_REQUIRED');
  const state = readPlanState(filePath);
  if (state.revision !== expectedRevision) {
    throw new R24Error('E_CAS_REVISION_CONFLICT', `expected=${expectedRevision} actual=${state.revision}`);
  }
  if (idempotencyKey !== null) {
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0) throw new R24Error('E_IDEMPOTENCY_KEY_SHAPE');
    const prior = state.idempotency[idempotencyKey];
    if (prior) {
      return { applied: false, duplicate: true, revision: state.revision, receipt: prior.receipt ?? null };
    }
  }
  const draft = structuredClone(state);
  const result = mutate(draft) || {};
  draft.revision = state.revision + 1;
  if (idempotencyKey !== null) {
    draft.idempotency[idempotencyKey] = { revision: draft.revision, receipt: result.receipt ?? null };
  }
  const write = writeJsonAtomic(filePath, draft);
  return { applied: true, duplicate: false, revision: draft.revision, result, write };
}

export function transitionContour(filePath, {
  contourId,
  to,
  expectedRevision,
  attemptId,
  idempotencyKey = null,
  now,
  headSha = null,
  law = DEFAULT_TRANSITION_LAW,
}) {
  if (typeof contourId !== 'string' || contourId.length === 0) throw new R24Error('E_CONTOUR_ID_REQUIRED');
  if (typeof attemptId !== 'string' || attemptId.length === 0) throw new R24Error('E_ATTEMPT_ID_REQUIRED');
  if (typeof now !== 'string' || now.length === 0) throw new R24Error('E_CLOCK_REQUIRED');
  const assertTransition = createTransitionValidator(law);
  return casUpdate(filePath, {
    expectedRevision,
    idempotencyKey,
    mutate: (draft) => {
      const current = draft.contours[contourId] || null;
      const from = current ? current.state : 'PENDING';
      assertTransition(from, to);
      draft.contours[contourId] = {
        state: to,
        previousState: from,
        attemptId,
        updatedAt: now,
        headSha,
      };
      return { transition: { contourId, from, to } };
    },
  });
}

export function classifyPlanStateAfterCrash(filePath, options = {}) {
  if (!fs.existsSync(filePath)) {
    return { classification: 'ROLLBACK_REQUIRED', reason: 'PLAN_STATE_MISSING' };
  }
  return classifyWriteArtifacts(filePath, options);
}
