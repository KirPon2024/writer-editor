export const ATLAS_RELATION_DOSSIER_SCHEMA_VERSION = 'derived.atlas.relationDossier.v1';
export const ATLAS_RELATION_DOSSIER_SURFACE_MANIFEST_VERSION = 'surface.atlas.relationDossier.v1';
export const ATLAS_RELATION_EVIDENCE_PACKET_SCHEMA_VERSION = 'derived.atlas.relationEvidencePacket.v1';
export const ATLAS_RELATION_CONTEXTUAL_ACTIONS_SCHEMA_VERSION = 'derived.atlas.relationContextualActions.v1';

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'en', { sensitivity: 'variant' });
}

function compareNumber(a, b) {
  return Number(a || 0) - Number(b || 0);
}

export function sortAtlasRelationTimelineRows(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const ordinal = compareNumber(a.sceneOrdinal, b.sceneOrdinal);
    if (ordinal !== 0) return ordinal;
    return compareText(a.sceneId, b.sceneId);
  });
}

export function sortAtlasRelationEvidenceRows(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const scene = compareText(a.sceneId, b.sceneId);
    if (scene !== 0) return scene;
    const start = compareNumber(a.startOffset, b.startOffset);
    if (start !== 0) return start;
    const entity = compareText(a.entityId, b.entityId);
    if (entity !== 0) return entity;
    return compareText(a.observationId, b.observationId);
  });
}

export function sortAtlasRelationAbsenceRows(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const entity = compareText(a.entityId, b.entityId);
    if (entity !== 0) return entity;
    const start = compareNumber(a.startSceneOrdinal, b.startSceneOrdinal);
    if (start !== 0) return start;
    return compareText(a.intervalId, b.intervalId);
  });
}
