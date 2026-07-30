export const ATLAS_OVERVIEW_SCHEMA_VERSION = 'derived.atlas.overview.v1';
export const ATLAS_OVERVIEW_SURFACE_MANIFEST_VERSION = 'surface.atlas.overview.v1';

function safeString(value) {
  return typeof value === 'string' ? value : '';
}

function compareStrings(a, b) {
  return safeString(a).localeCompare(safeString(b), 'en', { sensitivity: 'variant' });
}

export function sortAtlasOverviewEntities(entities) {
  return [...(Array.isArray(entities) ? entities : [])].sort((a, b) => {
    const appearances = Number(b?.appearanceCount || 0) - Number(a?.appearanceCount || 0);
    if (appearances !== 0) return appearances;
    const scenes = Number(b?.sceneCount || 0) - Number(a?.sceneCount || 0);
    if (scenes !== 0) return scenes;
    const name = compareStrings(a?.name, b?.name);
    if (name !== 0) return name;
    return compareStrings(a?.entityId, b?.entityId);
  });
}

export function sortAtlasOverviewRelations(relations) {
  return [...(Array.isArray(relations) ? relations : [])].sort((a, b) => {
    const occurrences = Number(b?.occurrenceCount || 0) - Number(a?.occurrenceCount || 0);
    if (occurrences !== 0) return occurrences;
    const scenes = Number(b?.sceneCount || 0) - Number(a?.sceneCount || 0);
    if (scenes !== 0) return scenes;
    return compareStrings(a?.pairId, b?.pairId);
  });
}

export function sortAtlasOverviewSceneCoverage(scenes) {
  return [...(Array.isArray(scenes) ? scenes : [])].sort((a, b) => {
    const ordinal = Number(a?.sceneOrdinal || 0) - Number(b?.sceneOrdinal || 0);
    if (ordinal !== 0) return ordinal;
    return compareStrings(a?.sceneId, b?.sceneId);
  });
}
