import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import {
  ATLAS_SCENE_TEMPORAL_ANCHORS_SCHEMA_VERSION,
  ATLAS_SCENE_TEMPORAL_ANCHORS_SURFACE_MANIFEST_VERSION,
  sortAtlasSceneTemporalAnchors,
} from './atlasTemporalRangeTypes.mjs';

const VIEW_ID = 'derived.atlas.sceneTemporalAnchors.v1';
const PROVIDER_ID = 'query.atlasSceneTemporalAnchors';
const SURFACE_ID = 'surface.atlas.sceneTemporalAnchors';
const RIGHT_RAIL_SLOT_ID = 'rightRail.context.atlas.sceneTemporalAnchors';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function sceneOrderFromProject(project) {
  const scenes = isPlainObject(project?.scenes) ? project.scenes : {};
  return Object.keys(scenes)
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }))
    .map((sceneId, sceneOrdinal) => ({
      sceneId,
      sceneOrdinal,
      sceneTitle: normalizeString(scenes[sceneId]?.title) || sceneId,
    }));
}

function isAtlasSceneTemporalAnchorsCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['atlas.sceneTemporalAnchors'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['atlas.sceneTemporalAnchors'] === false) return false;
  if (capabilities.atlasSceneTemporalAnchors === false) return false;
  if (isPlainObject(capabilities.atlas) && capabilities.atlas.sceneTemporalAnchors === false) return false;
  return true;
}

function buildSurfaceManifest() {
  return {
    schemaVersion: ATLAS_SCENE_TEMPORAL_ANCHORS_SURFACE_MANIFEST_VERSION,
    surfaceId: SURFACE_ID,
    providerId: PROVIDER_ID,
    host: 'rightRail',
    slotId: RIGHT_RAIL_SLOT_ID,
    contributionKind: 'readOnlyProjectionWithCommandBoundary',
    allowedStateClasses: ['PROJECT_STATE', 'DERIVED_STATE'],
    commandAuthority: 'CommandKernel',
    commandIds: ['atlas.sceneTemporalAnchor.set'],
    productMutation: false,
    storageAuthority: false,
    fallback: {
      empty: 'ATLAS_SCENE_TEMPORAL_ANCHORS_EMPTY',
      degraded: 'ATLAS_SCENE_TEMPORAL_ANCHORS_DEGRADED',
      unavailable: 'ATLAS_SCENE_TEMPORAL_ANCHORS_UNAVAILABLE',
    },
  };
}

function buildAuthority() {
  return {
    sourceOfTruth: [
      'atlas.author.v1.sceneTemporalAnchors',
      'project.scenes',
    ],
    readModelOnly: true,
    commandAuthority: 'CommandKernel',
    commandIds: ['atlas.sceneTemporalAnchor.set'],
    projectTruthMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
    cloudSync: false,
    accountSync: false,
    hiddenMutation: false,
  };
}

function normalizePoint(point) {
  if (!isPlainObject(point)) return null;
  return {
    schemaVersion: 'atlas.temporalPoint.v1',
    pointKind: normalizeString(point.pointKind),
    calendarId: normalizeString(point.calendarId),
    dayIndex: Number.isSafeInteger(Number(point.dayIndex)) ? Number(point.dayIndex) : 0,
    value: normalizeString(point.value),
    label: normalizeString(point.label),
  };
}

function normalizeRange(range) {
  if (!isPlainObject(range)) {
    return {
      schemaVersion: 'atlas.temporalRange.v1',
      rangeKind: 'unknown',
      start: null,
      end: null,
      precisionNote: 'Temporal range is not recorded.',
      explicitUnknown: true,
    };
  }
  const rangeKind = normalizeString(range.rangeKind) || 'unknown';
  return {
    schemaVersion: 'atlas.temporalRange.v1',
    rangeKind,
    start: normalizePoint(range.start),
    end: normalizePoint(range.end),
    precisionNote: normalizeString(range.precisionNote),
    explicitUnknown: range.explicitUnknown === true || rangeKind === 'unknown',
  };
}

function emptySceneTemporalAnchorsState(projectId, reason = '') {
  return {
    schemaVersion: ATLAS_SCENE_TEMPORAL_ANCHORS_SCHEMA_VERSION,
    state: reason ? 'unavailable' : 'empty',
    unavailableReason: reason,
    surfaceManifest: buildSurfaceManifest(),
    authority: buildAuthority(),
    projectId,
    summary: {
      sceneCount: 0,
      anchoredSceneCount: 0,
      missingAnchorSceneCount: 0,
      storyExactCount: 0,
      storyApproximateCount: 0,
      storyOpenCount: 0,
      storyUnknownCount: 0,
      narrativeExactCount: 0,
      narrativeApproximateCount: 0,
      narrativeOpenCount: 0,
      narrativeUnknownCount: 0,
      anchorHash: '',
      invalidationKey: '',
    },
    sceneTemporalAnchors: [],
    degradedStates: [],
    evidence: buildEvidence({ anchorHash: '' }),
  };
}

function buildEvidence({ anchorHash = '' } = {}) {
  return {
    schemaVersion: 'derived.atlas.sceneTemporalAnchors.evidence.v1',
    anchorHash,
    guarantees: {
      localOnly: true,
      externalCalendarService: false,
      storyNarrativeSeparated: true,
      unknownTimeExplicit: true,
      authorCommandBoundary: 'atlas.sceneTemporalAnchor.set',
    },
  };
}

function countRange(items, axis, kind) {
  return items.filter((item) => item[axis]?.rangeKind === kind).length;
}

function buildSceneTemporalAnchorsState({ project, projectId, invalidationKey }) {
  const sceneOrder = sceneOrderFromProject(project);
  const anchors = isPlainObject(project.atlas?.sceneTemporalAnchors) ? project.atlas.sceneTemporalAnchors : {};
  const rows = sortAtlasSceneTemporalAnchors(sceneOrder.map((scene) => {
    const anchor = isPlainObject(anchors[scene.sceneId]) ? anchors[scene.sceneId] : null;
    return {
      schemaVersion: 'atlas.sceneTemporalAnchor.v1',
      id: normalizeString(anchor?.id),
      projectId,
      sceneId: scene.sceneId,
      sceneOrdinal: scene.sceneOrdinal,
      sceneTitle: scene.sceneTitle,
      anchorState: anchor ? 'anchored' : 'missing',
      storyRange: normalizeRange(anchor?.storyRange),
      narrativeRange: normalizeRange(anchor?.narrativeRange),
      note: normalizeString(anchor?.note),
      source: normalizeString(anchor?.source) || (anchor ? 'author' : 'none'),
      sourceHash: normalizeString(anchor?.sourceHash) || '',
      createdByCommandSeq: Number.isSafeInteger(Number(anchor?.createdByCommandSeq)) ? Number(anchor.createdByCommandSeq) : 0,
      updatedByCommandSeq: Number.isSafeInteger(Number(anchor?.updatedByCommandSeq)) ? Number(anchor.updatedByCommandSeq) : 0,
    };
  }));
  const missing = rows.filter((row) => row.anchorState === 'missing');
  const unknowns = rows.filter((row) => row.storyRange.rangeKind === 'unknown' || row.narrativeRange.rangeKind === 'unknown');
  const degradedStates = [
    ...missing.map((row) => ({
      sceneId: row.sceneId,
      code: 'SCENE_TEMPORAL_ANCHOR_MISSING',
      reason: 'Scene has no author temporal anchor yet.',
    })),
    ...unknowns
      .filter((row) => row.anchorState === 'anchored')
      .map((row) => ({
        sceneId: row.sceneId,
        code: 'SCENE_TEMPORAL_RANGE_UNKNOWN',
        reason: 'Scene has an explicit unknown story or narrative range.',
      })),
  ];
  const anchorHash = hashCanonicalValue(rows);
  return {
    schemaVersion: ATLAS_SCENE_TEMPORAL_ANCHORS_SCHEMA_VERSION,
    state: rows.length === 0 ? 'empty' : degradedStates.length > 0 ? 'degraded' : 'ready',
    unavailableReason: '',
    surfaceManifest: buildSurfaceManifest(),
    authority: buildAuthority(),
    projectId,
    summary: {
      sceneCount: rows.length,
      anchoredSceneCount: rows.filter((row) => row.anchorState === 'anchored').length,
      missingAnchorSceneCount: missing.length,
      storyExactCount: countRange(rows, 'storyRange', 'exact'),
      storyApproximateCount: countRange(rows, 'storyRange', 'approximate'),
      storyOpenCount: countRange(rows, 'storyRange', 'open'),
      storyUnknownCount: countRange(rows, 'storyRange', 'unknown'),
      narrativeExactCount: countRange(rows, 'narrativeRange', 'exact'),
      narrativeApproximateCount: countRange(rows, 'narrativeRange', 'approximate'),
      narrativeOpenCount: countRange(rows, 'narrativeRange', 'open'),
      narrativeUnknownCount: countRange(rows, 'narrativeRange', 'unknown'),
      anchorHash,
      invalidationKey,
    },
    sceneTemporalAnchors: rows,
    degradedStates,
    evidence: buildEvidence({ anchorHash }),
  };
}

export function deriveAtlasSceneTemporalAnchors(input = {}) {
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
      if (!isAtlasSceneTemporalAnchorsCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          VIEW_ID,
          'ATLAS_SCENE_TEMPORAL_ANCHORS_DISABLED',
          { capabilityId: 'atlas.sceneTemporalAnchors' },
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
      if (!isPlainObject(project.scenes) || Object.keys(project.scenes).length === 0) {
        return {
          ...emptySceneTemporalAnchorsState(params.projectId),
          summary: {
            ...emptySceneTemporalAnchorsState(params.projectId).summary,
            invalidationKey: meta.invalidationKey,
          },
        };
      }
      return buildSceneTemporalAnchorsState({
        project,
        projectId: params.projectId,
        invalidationKey: meta.invalidationKey,
      });
    },
  });
}

export { VIEW_ID as ATLAS_SCENE_TEMPORAL_ANCHORS_VIEW_ID };
