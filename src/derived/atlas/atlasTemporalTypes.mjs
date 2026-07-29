export const ATLAS_TEMPORAL_CONTINUITY_SCHEMA_VERSION = 'derived.atlas.temporalContinuity.v1';
export const ATLAS_TEMPORAL_ENTITY_APPEARANCE_SCHEMA_VERSION = 'derived.atlas.entityAppearance.v1';
export const ATLAS_COOCCURRENCE_SCHEMA_VERSION = 'derived.atlas.cooccurrence.v1';
export const ATLAS_ABSENCE_INTERVAL_SCHEMA_VERSION = 'derived.atlas.absenceInterval.v1';
export const ATLAS_TEMPORAL_PARITY_PROOF_SCHEMA_VERSION = 'derived.atlas.temporalParityProof.v1';

function compareText(a, b) {
  return String(a).localeCompare(String(b), 'en', { sensitivity: 'variant' });
}

function compareNumber(a, b) {
  return Number(a) - Number(b);
}

export function sortAtlasTemporalSceneRefs(refs) {
  return [...(Array.isArray(refs) ? refs : [])].sort((a, b) => {
    const ordinal = compareNumber(a.sceneOrdinal, b.sceneOrdinal);
    if (ordinal !== 0) return ordinal;
    return compareText(a.sceneId, b.sceneId);
  });
}

export function sortAtlasEntityAppearances(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => compareText(a.entityId, b.entityId));
}

export function sortAtlasCooccurrences(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const left = compareText(a.leftEntityId, b.leftEntityId);
    if (left !== 0) return left;
    return compareText(a.rightEntityId, b.rightEntityId);
  });
}

export function sortAtlasAbsenceIntervals(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const entity = compareText(a.entityId, b.entityId);
    if (entity !== 0) return entity;
    const start = compareNumber(a.startSceneOrdinal, b.startSceneOrdinal);
    if (start !== 0) return start;
    const end = compareNumber(a.endSceneOrdinal, b.endSceneOrdinal);
    if (end !== 0) return end;
    return compareText(a.intervalId, b.intervalId);
  });
}
