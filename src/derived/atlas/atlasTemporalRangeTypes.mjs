export const ATLAS_TEMPORAL_POINT_SCHEMA_VERSION = 'atlas.temporalPoint.v1';
export const ATLAS_TEMPORAL_RANGE_SCHEMA_VERSION = 'atlas.temporalRange.v1';
export const ATLAS_SCENE_TEMPORAL_ANCHOR_SCHEMA_VERSION = 'atlas.sceneTemporalAnchor.v1';
export const ATLAS_SCENE_TEMPORAL_ANCHORS_SCHEMA_VERSION = 'derived.atlas.sceneTemporalAnchors.v1';
export const ATLAS_SCENE_TEMPORAL_ANCHORS_SURFACE_MANIFEST_VERSION = 'surface.atlas.sceneTemporalAnchors.v1';

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'en', { sensitivity: 'variant' });
}

function compareNumber(a, b) {
  return Number(a || 0) - Number(b || 0);
}

export function sortAtlasSceneTemporalAnchors(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const ordinal = compareNumber(a.sceneOrdinal, b.sceneOrdinal);
    if (ordinal !== 0) return ordinal;
    return compareText(a.sceneId, b.sceneId);
  });
}
