export const ATLAS_MATRICES_SCHEMA_VERSION = 'derived.atlas.matrices.v1';
export const ATLAS_MATRICES_SURFACE_MANIFEST_VERSION = 'surface.atlas.matrices.v1';
export const ATLAS_ENTITY_SCENE_MATRIX_SCHEMA_VERSION = 'derived.atlas.entitySceneMatrix.v1';
export const ATLAS_RELATION_MATRIX_SCHEMA_VERSION = 'derived.atlas.relationMatrix.v1';
export const ATLAS_MATRIX_ACCESSIBILITY_CONTRACT_SCHEMA_VERSION = 'derived.atlas.matrixAccessibilityContract.v1';

function compareText(a, b) {
  return String(a).localeCompare(String(b), 'en', { sensitivity: 'variant' });
}

function compareNumberDesc(a, b) {
  return Number(b) - Number(a);
}

export function sortAtlasMatrixEntities(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const scenes = compareNumberDesc(a.sceneCount, b.sceneCount);
    if (scenes !== 0) return scenes;
    const appearances = compareNumberDesc(a.appearanceCount, b.appearanceCount);
    if (appearances !== 0) return appearances;
    const names = compareText(a.name, b.name);
    if (names !== 0) return names;
    return compareText(a.entityId, b.entityId);
  });
}

export function sortAtlasEntitySceneListRows(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const scene = Number(a.sceneOrdinal) - Number(b.sceneOrdinal);
    if (scene !== 0) return scene;
    const appearances = compareNumberDesc(a.appearanceCount, b.appearanceCount);
    if (appearances !== 0) return appearances;
    const entity = compareText(a.entityName, b.entityName);
    if (entity !== 0) return entity;
    return compareText(a.entityId, b.entityId);
  });
}

export function sortAtlasRelationListRows(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const scenes = compareNumberDesc(a.sceneCount, b.sceneCount);
    if (scenes !== 0) return scenes;
    const occurrences = compareNumberDesc(a.occurrenceCount, b.occurrenceCount);
    if (occurrences !== 0) return occurrences;
    const left = compareText(a.leftName, b.leftName);
    if (left !== 0) return left;
    const right = compareText(a.rightName, b.rightName);
    if (right !== 0) return right;
    return compareText(a.pairId, b.pairId);
  });
}
