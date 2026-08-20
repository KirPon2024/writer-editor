// R2.4 P1_DIRTY_ADMISSION_ACK — dirty admission and typed save
// acknowledgements. Renderer boolean truth is replaced by exact generation
// admission: dirty iff latestEditGeneration > ackedGeneration. Every save
// lifecycle acknowledgement is explicit: SAVED, PROTECTED or AT_RISK.
'use strict';

const { normalizeEditGeneration, ACK_OUTCOMES } = require('./autosave-generation-v1.cjs');

class DirtyAdmissionError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

const ACK_KIND_SAVED = 'SAVED';
const ACK_KIND_PROTECTED = 'PROTECTED';
const ACK_KIND_AT_RISK = 'AT_RISK';

const SAVE_ACK_KINDS = Object.freeze({
  SAVED: ACK_KIND_SAVED,
  PROTECTED: ACK_KIND_PROTECTED,
  AT_RISK: ACK_KIND_AT_RISK,
});

function deriveDirty({ latestEditGeneration, ackedGeneration }) {
  const latest = normalizeEditGeneration(latestEditGeneration);
  const acked = normalizeEditGeneration(ackedGeneration);
  if (latest === null || acked === null) throw new DirtyAdmissionError('E_ADMISSION_COORDINATE_INVALID');
  if (acked > latest) throw new DirtyAdmissionError('E_ADMISSION_ACKED_AHEAD', `acked=${acked} latest=${latest}`);
  return latest > acked;
}

// Classify one save-lifecycle outcome into an explicit acknowledgement.
// writeSucceeded=false dominates every other signal: the work is at risk.
function classifySaveAck({ writeSucceeded, ackOutcome, savedGeneration, latestEditGeneration }) {
  const latest = normalizeEditGeneration(latestEditGeneration);
  if (latest === null) throw new DirtyAdmissionError('E_ADMISSION_COORDINATE_INVALID', 'latest');
  if (writeSucceeded !== true) {
    return Object.freeze({ kind: ACK_KIND_AT_RISK, reason: 'WRITE_FAILED', savedGeneration: null, latestEditGeneration: latest });
  }
  if (ackOutcome === ACK_OUTCOMES.CLEAR_DIRTY) {
    const saved = normalizeEditGeneration(savedGeneration);
    if (saved === null) throw new DirtyAdmissionError('E_ADMISSION_SAVED_GENERATION_INVALID');
    if (saved !== latest) {
      return Object.freeze({ kind: ACK_KIND_PROTECTED, reason: 'STALE_GENERATION', savedGeneration: saved, latestEditGeneration: latest });
    }
    return Object.freeze({ kind: ACK_KIND_SAVED, reason: '', savedGeneration: saved, latestEditGeneration: latest });
  }
  if (ackOutcome === ACK_OUTCOMES.KEEP_DIRTY_STALE) {
    return Object.freeze({ kind: ACK_KIND_PROTECTED, reason: 'STALE_GENERATION', savedGeneration: normalizeEditGeneration(savedGeneration), latestEditGeneration: latest });
  }
  return Object.freeze({ kind: ACK_KIND_AT_RISK, reason: 'UNBOUND_GENERATION', savedGeneration: null, latestEditGeneration: latest });
}

// Apply an acknowledgement to the admission coordinate. The acked generation
// never regresses; only a SAVED ack advances it.
function applySaveAck({ latestEditGeneration, ackedGeneration }, ack) {
  const latest = normalizeEditGeneration(latestEditGeneration);
  const acked = normalizeEditGeneration(ackedGeneration);
  if (latest === null || acked === null) throw new DirtyAdmissionError('E_ADMISSION_COORDINATE_INVALID');
  if (!ack || typeof ack !== 'object') throw new DirtyAdmissionError('E_SAVE_ACK_MISSING');
  if (!Object.values(SAVE_ACK_KINDS).includes(ack.kind)) throw new DirtyAdmissionError('E_SAVE_ACK_KIND_UNKNOWN', String(ack.kind));
  if (ack.kind === ACK_KIND_SAVED) {
    const saved = normalizeEditGeneration(ack.savedGeneration);
    if (saved === null) throw new DirtyAdmissionError('E_ADMISSION_SAVED_GENERATION_INVALID');
    if (saved !== latest) throw new DirtyAdmissionError('E_SAVE_ACK_STALE_AS_SAVED', `saved=${saved} latest=${latest}`);
    if (saved < acked) throw new DirtyAdmissionError('E_SAVE_ACK_REGRESSION', `saved=${saved} acked=${acked}`);
    return Object.freeze({ latestEditGeneration: latest, ackedGeneration: saved });
  }
  return Object.freeze({ latestEditGeneration: latest, ackedGeneration: acked });
}

module.exports = Object.freeze({
  SAVE_ACK_KINDS,
  DirtyAdmissionError,
  applySaveAck,
  classifySaveAck,
  deriveDirty,
});
