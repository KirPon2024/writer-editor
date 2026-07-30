export const ATLAS_RELATION_SEGMENTS_PERSPECTIVE_SCHEMA_VERSION = 'derived.atlas.relationSegmentsPerspective.v1';
export const ATLAS_RELATION_SEGMENT_SCHEMA_VERSION = 'derived.atlas.relationSegment.v1';
export const ATLAS_RELATION_PERSPECTIVE_SCENE_SCHEMA_VERSION = 'derived.atlas.relationPerspectiveScene.v1';
export const ATLAS_RELATION_SEGMENT_PARITY_PROOF_SCHEMA_VERSION = 'derived.atlas.relationSegmentParityProof.v1';

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'en', { sensitivity: 'variant' });
}

function compareNumber(a, b) {
  return Number(a || 0) - Number(b || 0);
}

export function sortAtlasRelationSegments(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const pair = compareText(a.pairId, b.pairId);
    if (pair !== 0) return pair;
    const start = compareNumber(a.startSceneOrdinal, b.startSceneOrdinal);
    if (start !== 0) return start;
    return compareText(a.segmentId, b.segmentId);
  });
}

export function sortAtlasPerspectiveScenes(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const ordinal = compareNumber(a.sceneOrdinal, b.sceneOrdinal);
    if (ordinal !== 0) return ordinal;
    return compareText(a.sceneId, b.sceneId);
  });
}
