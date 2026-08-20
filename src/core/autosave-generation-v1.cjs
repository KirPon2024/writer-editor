// R2.4 P0_AUTOSAVE_GENERATION — the autosave generation law.
// Every autosave capture binds the exact local edit generation it observed;
// an acknowledgement may clear the dirty mark only when the captured
// generation equals the latest edit generation. A stale or unbound
// acknowledgement can never clear newer work. Pure module, no I/O.
'use strict';

// R2.4 R0: the scalar generation comparison is routed through the unified
// revision algebra (single-component coordinates in a fixed local domain).
const { compareRevisionCoordinates, REVISION_ORDER } = require('./revision-algebra-v1.cjs');

const ACK_CLEAR_DIRTY = 'CLEAR_DIRTY';
const ACK_KEEP_DIRTY_STALE = 'KEEP_DIRTY_STALE';
const ACK_KEEP_DIRTY_UNBOUND = 'KEEP_DIRTY_UNBOUND';

const ACK_OUTCOMES = Object.freeze({
  CLEAR_DIRTY: ACK_CLEAR_DIRTY,
  KEEP_DIRTY_STALE: ACK_KEEP_DIRTY_STALE,
  KEEP_DIRTY_UNBOUND: ACK_KEEP_DIRTY_UNBOUND,
});

class AutosaveGenerationError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

function normalizeEditGeneration(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  return null;
}

// Monotonic per-session local edit generation tracker. The renderer owns the
// counter because it observes every local authoring mutation; main consumes
// snapshots and signals bound to it.
function createEditGenerationTracker(initial = 0) {
  const start = normalizeEditGeneration(initial);
  if (start === null) throw new AutosaveGenerationError('E_GENERATION_INITIAL_INVALID', String(initial));
  let current = start;
  return Object.freeze({
    current: () => current,
    bump: () => {
      current += 1;
      return current;
    },
  });
}

// Merge a signaled generation into the latest-known coordinate. Signals are
// authoritative only forward: an older signal can never move the coordinate
// backwards.
function mergeSignaledGeneration(latest, signaled) {
  const latestNorm = normalizeEditGeneration(latest);
  const signaledNorm = normalizeEditGeneration(signaled);
  if (latestNorm === null) throw new AutosaveGenerationError('E_GENERATION_LATEST_INVALID', String(latest));
  if (signaledNorm === null) return latestNorm;
  return Math.max(latestNorm, signaledNorm);
}

const EDIT_GENERATION_DOMAIN = Object.freeze({ projectId: 'yalken.local', entityId: 'edit-generation' });

const asCoordinate = (generation) => Object.freeze({
  domain: EDIT_GENERATION_DOMAIN,
  projectRevision: 0,
  entityRevision: 0,
  sourceRevision: 0,
  generation,
  writerEpoch: 0,
});

function decideAutosaveAck({ capturedGeneration, latestEditGeneration }) {
  const captured = normalizeEditGeneration(capturedGeneration);
  const latest = normalizeEditGeneration(latestEditGeneration);
  if (latest === null) throw new AutosaveGenerationError('E_GENERATION_LATEST_INVALID', String(latestEditGeneration));
  if (captured === null) {
    return Object.freeze({ outcome: ACK_KEEP_DIRTY_UNBOUND, capturedGeneration: null, latestEditGeneration: latest });
  }
  const order = compareRevisionCoordinates(asCoordinate(captured), asCoordinate(latest));
  if (order === REVISION_ORDER.GREATER) {
    throw new AutosaveGenerationError('E_GENERATION_REGRESSION', `captured=${captured} latest=${latest}`);
  }
  if (order === REVISION_ORDER.EQUAL) {
    return Object.freeze({ outcome: ACK_CLEAR_DIRTY, capturedGeneration: captured, latestEditGeneration: latest });
  }
  return Object.freeze({ outcome: ACK_KEEP_DIRTY_STALE, capturedGeneration: captured, latestEditGeneration: latest });
}

module.exports = Object.freeze({
  ACK_OUTCOMES,
  AutosaveGenerationError,
  createEditGenerationTracker,
  decideAutosaveAck,
  mergeSignaledGeneration,
  normalizeEditGeneration,
});
