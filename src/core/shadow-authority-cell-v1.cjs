// R2.4 R1_SHADOW_PROJECT_AUTHORITY_CELL — one small per-project coordinator
// in shadow mode. It evaluates write admission as advisory truth only: no
// god object, no generic event bus, no write authority promotion, no mutation.
'use strict';

const { compareRevisionCoordinates, REVISION_ORDER, RevisionAlgebraError } = require('./revision-algebra-v1.cjs');

class ShadowAuthorityError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

const SHADOW_ADVICE = Object.freeze({
  WOULD_CLEAR: 'WOULD_CLEAR',
  WOULD_KEEP_STALE: 'WOULD_KEEP_STALE',
  WOULD_KEEP_UNBOUND: 'WOULD_KEEP_UNBOUND',
  WOULD_REJECT_REGRESSION: 'WOULD_REJECT_REGRESSION',
});

const SHADOW_DOMAIN = Object.freeze({ projectId: 'yalken.local', entityId: 'edit-generation' });

const asCoordinate = (generation) => Object.freeze({
  domain: SHADOW_DOMAIN,
  projectRevision: 0,
  entityRevision: 0,
  sourceRevision: 0,
  generation,
  writerEpoch: 0,
});

const isGeneration = (value) => Number.isInteger(value) && value >= 0;

// The cell is per-project and read-only: it observes generations through
// plain method calls and answers advisory evaluations. It has no subscribe,
// no emit and no promotion path by construction.
function createShadowAuthorityCell({ projectId }) {
  if (typeof projectId !== 'string' || projectId.length === 0) {
    throw new ShadowAuthorityError('E_SHADOW_PROJECT_IDENTITY_REQUIRED');
  }
  let observedLatest = null;
  let lastAdvice = null;

  const recordObservation = (latestEditGeneration) => {
    if (!isGeneration(latestEditGeneration)) throw new ShadowAuthorityError('E_SHADOW_GENERATION_INVALID', String(latestEditGeneration));
    if (observedLatest === null || latestEditGeneration > observedLatest) observedLatest = latestEditGeneration;
    return observedLatest;
  };

  const shadowEvaluateWriteAdmission = ({ capturedGeneration, latestEditGeneration }) => {
    const latest = isGeneration(latestEditGeneration)
      ? latestEditGeneration
      : observedLatest;
    if (latest === null) throw new ShadowAuthorityError('E_SHADOW_COORDINATE_UNBOUND');
    if (!isGeneration(latest)) throw new ShadowAuthorityError('E_SHADOW_GENERATION_INVALID', String(latestEditGeneration));
    recordObservation(latest);
    let advice;
    if (!isGeneration(capturedGeneration)) {
      advice = SHADOW_ADVICE.WOULD_KEEP_UNBOUND;
    } else {
      let order;
      try {
        order = compareRevisionCoordinates(asCoordinate(capturedGeneration), asCoordinate(latest));
      } catch (error) {
        if (error instanceof RevisionAlgebraError) throw new ShadowAuthorityError('E_SHADOW_DOMAIN_CONFLICT', error.code);
        throw error;
      }
      advice = order === REVISION_ORDER.EQUAL
        ? SHADOW_ADVICE.WOULD_CLEAR
        : (order === REVISION_ORDER.LESS
          ? SHADOW_ADVICE.WOULD_KEEP_STALE
          : SHADOW_ADVICE.WOULD_REJECT_REGRESSION);
    }
    lastAdvice = Object.freeze({ advice, capturedGeneration: isGeneration(capturedGeneration) ? capturedGeneration : null, latestEditGeneration: latest });
    return lastAdvice;
  };

  const shadowSnapshot = () => Object.freeze({
    projectId,
    mode: 'SHADOW_ONLY',
    observedLatestGeneration: observedLatest,
    lastAdvice,
  });

  return Object.freeze({
    projectId,
    recordObservation,
    shadowEvaluateWriteAdmission,
    shadowSnapshot,
    // Hard shadow law: promotion is always refused and typed.
    promoteToAuthority: () => {
      throw new ShadowAuthorityError('E_SHADOW_PROMOTION_DENIED');
    },
  });
}

module.exports = Object.freeze({
  SHADOW_ADVICE,
  ShadowAuthorityError,
  createShadowAuthorityCell,
});
