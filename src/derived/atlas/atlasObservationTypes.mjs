export const ATLAS_OBSERVATION_AGGREGATE_SCHEMA_VERSION = 'derived.atlas.observationAggregate.v1';
export const ATLAS_OBSERVATION_CANDIDATE_SCHEMA_VERSION = 'derived.atlas.observationCandidate.v1';
export const ATLAS_OBSERVATION_SCHEMA_VERSION = 'derived.atlas.observation.v1';
export const ATLAS_OBSERVATION_ANALYZER_ID = 'BASIC_EXACT_TERM_V1';

export const ATLAS_OBSERVATION_LANGUAGE_POLICY = Object.freeze({
  BASIC_SUPPORTED: 'BASIC_SUPPORTED',
  UNSUPPORTED_EXACT_ONLY: 'UNSUPPORTED_EXACT_ONLY',
});

const BASIC_SUPPORTED_LANGUAGE_CODES = Object.freeze(['en', 'ru', 'und']);

function compareText(a, b) {
  return String(a).localeCompare(String(b), 'en', { sensitivity: 'variant' });
}

export function normalizeAtlasObservationLanguagePolicy(languageCode) {
  const normalized = typeof languageCode === 'string' ? languageCode.trim().toLowerCase() : '';
  const code = normalized || 'und';
  const supported = BASIC_SUPPORTED_LANGUAGE_CODES.includes(code);
  return {
    analyzerId: ATLAS_OBSERVATION_ANALYZER_ID,
    languageCode: code,
    supported,
    policy: supported
      ? ATLAS_OBSERVATION_LANGUAGE_POLICY.BASIC_SUPPORTED
      : ATLAS_OBSERVATION_LANGUAGE_POLICY.UNSUPPORTED_EXACT_ONLY,
    exactOnly: true,
    fuzzyMatching: false,
    stemming: false,
    unsupportedLanguageExactOnly: !supported,
  };
}

export function sortAtlasObservationCandidates(candidates) {
  return [...(Array.isArray(candidates) ? candidates : [])].sort((a, b) => {
    const scene = compareText(a.sceneId, b.sceneId);
    if (scene !== 0) return scene;
    const start = Number(a.startOffset) - Number(b.startOffset);
    if (start !== 0) return start;
    const end = Number(a.endOffset) - Number(b.endOffset);
    if (end !== 0) return end;
    const entity = compareText(a.entityId, b.entityId);
    if (entity !== 0) return entity;
    return compareText(a.candidateId, b.candidateId);
  });
}

export function sortAtlasObservations(observations) {
  return [...(Array.isArray(observations) ? observations : [])].sort((a, b) => {
    const scene = compareText(a.sceneId, b.sceneId);
    if (scene !== 0) return scene;
    const start = Number(a.startOffset) - Number(b.startOffset);
    if (start !== 0) return start;
    const entity = compareText(a.entityId, b.entityId);
    if (entity !== 0) return entity;
    return compareText(a.observationId, b.observationId);
  });
}

export function sortAtlasObservationEntityAggregates(entities) {
  return [...(Array.isArray(entities) ? entities : [])].sort((a, b) => compareText(a.entityId, b.entityId));
}
