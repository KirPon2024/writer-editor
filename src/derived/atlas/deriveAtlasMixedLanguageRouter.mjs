import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import {
  ATLAS_OBSERVATION_ANALYZER_ID,
  ATLAS_OBSERVATION_LANGUAGE_POLICY,
  normalizeAtlasObservationLanguagePolicy,
} from './atlasObservationTypes.mjs';
import {
  ATLAS_LANGUAGE_TAG_SCHEMA_VERSION,
  ATLAS_LANGUAGE_TAGS_SURFACE_MANIFEST_VERSION,
  ATLAS_LANGUAGE_TAG_SCOPE_KIND,
  ATLAS_MIXED_LANGUAGE_ROUTE_SCHEMA_VERSION,
  ATLAS_MIXED_LANGUAGE_ROUTER_SCHEMA_VERSION,
  sortAtlasLanguageTags,
  sortAtlasMixedLanguageRoutes,
} from './atlasLanguageTagTypes.mjs';
import { buildAtlasTextAnchorPacket } from './atlasTextAnchorNormalization.mjs';
import { requireAtlasSceneOrder } from './atlasSceneOrder.mjs';

const VIEW_ID = 'derived.atlas.mixedLanguageRouter.v1';
const PROVIDER_ID = 'query.atlasMixedLanguageRouter';
const SURFACE_ID = 'surface.atlas.languageTags';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLanguageCode(value) {
  const normalized = normalizeString(value).toLowerCase().replace(/_/gu, '-');
  return normalized || 'und';
}

function normalizeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : 0;
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function isCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['atlas.mixedLanguageRouter'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['atlas.mixedLanguageRouter'] === false) return false;
  if (capabilities.atlasMixedLanguageRouter === false) return false;
  if (isPlainObject(capabilities.atlas) && capabilities.atlas.mixedLanguageRouter === false) return false;
  return true;
}

function buildSurfaceManifest() {
  return {
    schemaVersion: ATLAS_LANGUAGE_TAGS_SURFACE_MANIFEST_VERSION,
    surfaceId: SURFACE_ID,
    providerId: PROVIDER_ID,
    host: 'none',
    slotId: 'not-applicable-no-ui-surface',
    contributionKind: 'readOnlyProjectionWithCommandBoundary',
    allowedStateClasses: ['PROJECT_STATE', 'DERIVED_STATE'],
    commandAuthority: 'CommandKernel',
    commandIds: ['atlas.languageTag.set', 'atlas.languageTag.clear'],
    productMutation: false,
    storageAuthority: false,
    fallback: {
      empty: 'ATLAS_LANGUAGE_TAGS_EMPTY',
      degraded: 'ATLAS_MIXED_LANGUAGE_ROUTER_DEGRADED',
      unavailable: 'ATLAS_MIXED_LANGUAGE_ROUTER_UNAVAILABLE',
    },
  };
}

function buildAuthority() {
  return {
    sourceOfTruth: [
      'atlas.author.v1.languageTags',
      'project.languageCode',
      'project.scenes',
    ],
    readModelOnly: true,
    commandAuthority: 'CommandKernel',
    commandIds: ['atlas.languageTag.set', 'atlas.languageTag.clear'],
    projectTruthMutation: false,
    manuscriptMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
    automaticLanguageDetection: false,
    automaticManuscriptRewrite: false,
    hiddenMutation: false,
  };
}

function normalizeTag(input) {
  if (!isPlainObject(input)) return null;
  const id = normalizeString(input.id);
  const scopeKind = normalizeString(input.scopeKind);
  const languageCode = normalizeLanguageCode(input.languageCode);
  if (!id || !languageCode || !Object.values(ATLAS_LANGUAGE_TAG_SCOPE_KIND).includes(scopeKind)) return null;
  return {
    schemaVersion: normalizeString(input.schemaVersion) || ATLAS_LANGUAGE_TAG_SCHEMA_VERSION,
    id,
    projectId: normalizeString(input.projectId),
    scopeKind,
    sceneId: normalizeString(input.sceneId),
    blockId: normalizeString(input.blockId),
    startOffset: normalizeInteger(input.startOffset),
    endOffset: normalizeInteger(input.endOffset),
    languageCode,
    note: normalizeString(input.note),
    source: normalizeString(input.source) || 'author',
    manuscriptMutation: input.manuscriptMutation === true,
    sourceHash: normalizeString(input.sourceHash) || hashCanonicalValue(input),
    createdByCommandSeq: normalizeInteger(input.createdByCommandSeq),
    updatedByCommandSeq: normalizeInteger(input.updatedByCommandSeq),
  };
}

function collectTags(project, projectId) {
  const languageTags = isPlainObject(project?.atlas?.languageTags) ? project.atlas.languageTags : {};
  const tags = [];
  const projectTag = normalizeTag(languageTags.project);
  if (projectTag) tags.push(projectTag);
  for (const bucketName of ['scenes', 'blocks', 'ranges']) {
    const bucket = isPlainObject(languageTags[bucketName]) ? languageTags[bucketName] : {};
    for (const tag of Object.values(bucket)) {
      const normalized = normalizeTag(tag);
      if (normalized && (!normalized.projectId || normalized.projectId === projectId)) tags.push(normalized);
    }
  }
  return sortAtlasLanguageTags(tags);
}

function projectDefaultLanguage(project, tags) {
  const authorProjectTag = tags.find((tag) => tag.scopeKind === ATLAS_LANGUAGE_TAG_SCOPE_KIND.PROJECT);
  if (authorProjectTag) return authorProjectTag.languageCode;
  return normalizeLanguageCode(project?.languageCode);
}

function sceneDefaultLanguage(sceneId, defaultLanguage, tags) {
  const sceneTag = tags.find((tag) => tag.scopeKind === ATLAS_LANGUAGE_TAG_SCOPE_KIND.SCENE && tag.sceneId === sceneId);
  return sceneTag ? sceneTag.languageCode : defaultLanguage;
}

function rangeTagsForScene(scene, tags) {
  return sortAtlasLanguageTags(tags.filter((tag) => (
    tag.scopeKind === ATLAS_LANGUAGE_TAG_SCOPE_KIND.RANGE
    && tag.sceneId === scene.sceneId
    && tag.startOffset >= 0
    && tag.endOffset > tag.startOffset
    && tag.endOffset <= scene.text.length
  )));
}

function routePolicy(languageCode) {
  const policy = normalizeAtlasObservationLanguagePolicy(languageCode);
  const unsupportedExactOnly = policy.policy === ATLAS_OBSERVATION_LANGUAGE_POLICY.UNSUPPORTED_EXACT_ONLY;
  return {
    analyzerId: policy.analyzerId,
    languageCode: policy.languageCode,
    languagePolicy: policy.policy,
    analysisMode: unsupportedExactOnly ? 'GLOBAL_EXACT_ONLY' : 'BASIC_EXACT_TERM',
    exactOnly: true,
    fuzzyMatching: false,
    englishFallback: false,
    unsupportedRangeExactOnly: unsupportedExactOnly,
    deepSupported: false,
    runtimeDownload: false,
  };
}

function routeForSegment({ projectId, scene, segment, languageCode, sourceTagId, defaultLanguageCode }) {
  const anchorPacket = buildAtlasTextAnchorPacket({
    projectId,
    sceneId: scene.sceneId,
    entityId: '',
    termId: `language:${languageCode}`,
    startOffset: segment.startOffset,
    endOffset: segment.endOffset,
    sceneText: scene.text,
  });
  const policy = routePolicy(languageCode);
  return {
    schemaVersion: ATLAS_MIXED_LANGUAGE_ROUTE_SCHEMA_VERSION,
    routeId: `atlas-language-route:${hashCanonicalValue({
      projectId,
      sceneId: scene.sceneId,
      startOffset: segment.startOffset,
      endOffset: segment.endOffset,
      languageCode: policy.languageCode,
      sourceTagId,
    })}`,
    projectId,
    sceneId: scene.sceneId,
    sceneOrdinal: scene.sceneOrdinal,
    sceneTitle: scene.sceneTitle,
    startOffset: segment.startOffset,
    endOffset: segment.endOffset,
    length: segment.endOffset - segment.startOffset,
    languageCode: policy.languageCode,
    defaultLanguageCode,
    sourceTagId,
    sourceKind: sourceTagId ? 'author-range' : 'author-default',
    adapterOffsetDomain: anchorPacket.evidenceAnchor.adapterOffsetDomain,
    codePointRange: anchorPacket.evidenceAnchor.codePointRange,
    graphemeRange: anchorPacket.evidenceAnchor.graphemeRange,
    quoteHash: anchorPacket.evidenceAnchor.quoteHash,
    sceneTextHash: anchorPacket.evidenceAnchor.sceneTextHash,
    policy,
    manuscriptMutation: false,
  };
}

function buildSceneRoutes({ projectId, scene, defaultLanguageCode, tags }) {
  const ranges = rangeTagsForScene(scene, tags);
  if (scene.text.length === 0) {
    return [routeForSegment({
      projectId,
      scene,
      segment: { startOffset: 0, endOffset: 0 },
      languageCode: defaultLanguageCode,
      sourceTagId: '',
      defaultLanguageCode,
    })];
  }
  const breakpoints = new Set([0, scene.text.length]);
  for (const tag of ranges) {
    breakpoints.add(tag.startOffset);
    breakpoints.add(tag.endOffset);
  }
  const points = [...breakpoints].sort((left, right) => left - right);
  const routes = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const startOffset = points[index];
    const endOffset = points[index + 1];
    const rangeTag = ranges.find((tag) => tag.startOffset <= startOffset && tag.endOffset >= endOffset);
    routes.push(routeForSegment({
      projectId,
      scene,
      segment: { startOffset, endOffset },
      languageCode: rangeTag ? rangeTag.languageCode : defaultLanguageCode,
      sourceTagId: rangeTag ? rangeTag.id : '',
      defaultLanguageCode,
    }));
  }
  return routes;
}

function buildRouter({ project, projectId, meta }) {
  const tags = collectTags(project, projectId);
  const defaultLanguageCode = projectDefaultLanguage(project, tags);
  const scenes = requireAtlasSceneOrder(project, VIEW_ID, {
    includeText: true,
    trimSceneTitle: true,
  });
  const routes = sortAtlasMixedLanguageRoutes(scenes.flatMap((scene) => buildSceneRoutes({
    projectId,
    scene,
    defaultLanguageCode: sceneDefaultLanguage(scene.sceneId, defaultLanguageCode, tags),
    tags,
  })));
  const unsupportedRoutes = routes.filter((route) => route.policy.unsupportedRangeExactOnly === true);
  const routerHash = hashCanonicalValue({
    tags,
    routes,
    analyzerId: ATLAS_OBSERVATION_ANALYZER_ID,
  });
  return {
    schemaVersion: ATLAS_MIXED_LANGUAGE_ROUTER_SCHEMA_VERSION,
    state: routes.length === 0 ? 'empty' : unsupportedRoutes.length > 0 ? 'degraded' : 'ready',
    projectId,
    surfaceManifest: buildSurfaceManifest(),
    authority: buildAuthority(),
    summary: {
      sceneCount: scenes.length,
      languageTagCount: tags.length,
      routeCount: routes.length,
      unsupportedExactOnlyRouteCount: unsupportedRoutes.length,
      englishFallbackCount: routes.filter((route) => route.policy.englishFallback === true).length,
      deepRouteCount: routes.filter((route) => route.policy.deepSupported === true).length,
      routerHash,
      invalidationKey: meta.invalidationKey,
    },
    languageTags: tags,
    routes,
    degradedStates: unsupportedRoutes.map((route) => ({
      sceneId: route.sceneId,
      startOffset: route.startOffset,
      endOffset: route.endOffset,
      languageCode: route.languageCode,
      code: 'LANGUAGE_RANGE_UNSUPPORTED_EXACT_ONLY',
      reason: 'Language range has no certified BASIC or DEEP analyzer yet and is routed to GLOBAL exact-only.',
    })),
    evidence: {
      schemaVersion: 'derived.atlas.mixedLanguageRouter.evidence.v1',
      routerHash,
      guarantees: {
        authorCommandBoundary: ['atlas.languageTag.set', 'atlas.languageTag.clear'],
        noSilentEnglishFallback: true,
        unsupportedRangeExactOnly: true,
        originalManuscriptMutation: false,
        automaticLanguageDetection: false,
        externalLanguageService: false,
        deepAnalyzer: false,
        adapterOffsetDomain: 'UTF16_JS_CODE_UNIT',
      },
    },
  };
}

export function deriveAtlasMixedLanguageRouter(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  if (!projectId) {
    return {
      ok: false,
      error: {
        code: 'E_ATLAS_PROJECT_ID_REQUIRED',
        op: VIEW_ID,
        reason: 'PROJECT_ID_REQUIRED',
      },
    };
  }
  return deriveView({
    viewId: VIEW_ID,
    coreState: input.coreState,
    params: {
      ...input.params,
      projectId,
    },
    capabilitySnapshot: input.capabilitySnapshot,
    derive: ({ coreState, params, capabilitySnapshot, meta }) => {
      if (!isCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          VIEW_ID,
          'ATLAS_MIXED_LANGUAGE_ROUTER_DISABLED',
          { capabilityId: 'atlas.mixedLanguageRouter' },
        );
      }
      const project = getProject(coreState, params.projectId);
      if (!project) {
        throw createDerivedError(
          'E_ATLAS_PROJECT_NOT_FOUND',
          VIEW_ID,
          'PROJECT_NOT_FOUND',
          { projectId: params.projectId },
        );
      }
      return buildRouter({ project, projectId: params.projectId, meta });
    },
  });
}

export { VIEW_ID as ATLAS_MIXED_LANGUAGE_ROUTER_VIEW_ID };
