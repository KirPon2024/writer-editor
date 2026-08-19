import { createDerivedError } from '../deriveView.mjs';

export const ATLAS_SCENE_ORDER_ERROR_CODE = 'E_ATLAS_SCENE_ORDER_INVALID';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compareSceneId(left, right) {
  return left.localeCompare(right, 'en', { sensitivity: 'variant' });
}

function sceneRef(scenes, sceneId, sceneOrdinal, options) {
  const scene = isPlainObject(scenes[sceneId]) ? scenes[sceneId] : {};
  const rawTitle = typeof scene.title === 'string' ? scene.title : '';
  const sceneTitle = options.trimSceneTitle ? rawTitle.trim() : rawTitle;
  return {
    sceneId,
    sceneOrdinal,
    sceneTitle: sceneTitle || sceneId,
    ...(options.includeText ? { text: typeof scene.text === 'string' ? scene.text : '' } : {}),
  };
}

function invalid(reason, details = {}) {
  return {
    ok: false,
    error: {
      code: ATLAS_SCENE_ORDER_ERROR_CODE,
      reason,
      details,
    },
  };
}

export function resolveAtlasSceneOrder(project, options = {}) {
  const scenes = isPlainObject(project?.scenes) ? project.scenes : {};
  const sceneIds = Object.keys(scenes);
  const refOptions = {
    includeText: options?.includeText === true,
    trimSceneTitle: options?.trimSceneTitle === true,
  };
  const hasExplicitOrder = isPlainObject(project)
    && Object.prototype.hasOwnProperty.call(project, 'sceneOrder');

  if (!hasExplicitOrder) {
    const legacyIds = [...sceneIds].sort(compareSceneId);
    return {
      ok: true,
      source: 'legacy.lexicalSceneId',
      value: legacyIds.map((sceneId, sceneOrdinal) => (
        sceneRef(scenes, sceneId, sceneOrdinal, refOptions)
      )),
    };
  }

  if (!Array.isArray(project.sceneOrder)) {
    return invalid('SCENE_ORDER_ARRAY_REQUIRED', {
      actualType: project.sceneOrder === null ? 'null' : typeof project.sceneOrder,
    });
  }

  const orderedIds = project.sceneOrder.slice();
  const malformedIds = orderedIds.filter((sceneId) => (
    typeof sceneId !== 'string'
    || sceneId.length === 0
    || sceneId.trim() !== sceneId
  ));
  if (malformedIds.length > 0) {
    return invalid('SCENE_ORDER_SCENE_ID_INVALID', {
      malformedEntryCount: malformedIds.length,
    });
  }

  const seen = new Set();
  const duplicateSceneIds = [];
  for (const sceneId of orderedIds) {
    if (seen.has(sceneId)) duplicateSceneIds.push(sceneId);
    seen.add(sceneId);
  }
  const sceneIdSet = new Set(sceneIds);
  const missingSceneIds = sceneIds.filter((sceneId) => !seen.has(sceneId)).sort(compareSceneId);
  const unknownSceneIds = orderedIds.filter((sceneId) => !sceneIdSet.has(sceneId)).sort(compareSceneId);
  if (
    duplicateSceneIds.length > 0
    || missingSceneIds.length > 0
    || unknownSceneIds.length > 0
    || orderedIds.length !== sceneIds.length
  ) {
    return invalid('SCENE_ORDER_EXACT_COVERAGE_REQUIRED', {
      sceneCount: sceneIds.length,
      orderedSceneCount: orderedIds.length,
      duplicateSceneIds: [...new Set(duplicateSceneIds)].sort(compareSceneId),
      missingSceneIds,
      unknownSceneIds: [...new Set(unknownSceneIds)].sort(compareSceneId),
    });
  }

  return {
    ok: true,
    source: 'project.sceneOrder',
    value: orderedIds.map((sceneId, sceneOrdinal) => (
      sceneRef(scenes, sceneId, sceneOrdinal, refOptions)
    )),
  };
}

export function requireAtlasSceneOrder(project, viewId, options = {}) {
  const resolved = resolveAtlasSceneOrder(project, options);
  if (resolved.ok) return resolved.value;
  throw createDerivedError(
    resolved.error.code,
    viewId,
    resolved.error.reason,
    resolved.error.details,
  );
}
