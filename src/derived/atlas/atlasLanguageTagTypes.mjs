export const ATLAS_LANGUAGE_TAG_SCHEMA_VERSION = 'atlas.languageTag.v1';
export const ATLAS_MIXED_LANGUAGE_ROUTER_SCHEMA_VERSION = 'derived.atlas.mixedLanguageRouter.v1';
export const ATLAS_MIXED_LANGUAGE_ROUTE_SCHEMA_VERSION = 'derived.atlas.mixedLanguageRoute.v1';
export const ATLAS_LANGUAGE_TAGS_SURFACE_MANIFEST_VERSION = 'surface.atlas.languageTags.v1';

export const ATLAS_LANGUAGE_TAG_SCOPE_KIND = Object.freeze({
  PROJECT: 'project',
  SCENE: 'scene',
  BLOCK: 'block',
  RANGE: 'range',
});

export function sortAtlasLanguageTags(tags) {
  return [...(Array.isArray(tags) ? tags : [])].sort((left, right) => {
    const scope = String(left?.scopeKind || '').localeCompare(String(right?.scopeKind || ''), 'en', { sensitivity: 'variant' });
    if (scope !== 0) return scope;
    const scene = String(left?.sceneId || '').localeCompare(String(right?.sceneId || ''), 'en', { sensitivity: 'variant' });
    if (scene !== 0) return scene;
    const start = Number(left?.startOffset || 0) - Number(right?.startOffset || 0);
    if (start !== 0) return start;
    const end = Number(left?.endOffset || 0) - Number(right?.endOffset || 0);
    if (end !== 0) return end;
    return String(left?.id || '').localeCompare(String(right?.id || ''), 'en', { sensitivity: 'variant' });
  });
}

export function sortAtlasMixedLanguageRoutes(routes) {
  return [...(Array.isArray(routes) ? routes : [])].sort((left, right) => {
    const ordinal = Number(left?.sceneOrdinal || 0) - Number(right?.sceneOrdinal || 0);
    if (ordinal !== 0) return ordinal;
    const scene = String(left?.sceneId || '').localeCompare(String(right?.sceneId || ''), 'en', { sensitivity: 'variant' });
    if (scene !== 0) return scene;
    const start = Number(left?.startOffset || 0) - Number(right?.startOffset || 0);
    if (start !== 0) return start;
    const end = Number(left?.endOffset || 0) - Number(right?.endOffset || 0);
    if (end !== 0) return end;
    return String(left?.routeId || '').localeCompare(String(right?.routeId || ''), 'en', { sensitivity: 'variant' });
  });
}
