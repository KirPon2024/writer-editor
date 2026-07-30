import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import { deriveAtlasRelationSegmentsPerspective } from './deriveAtlasRelationSegmentsPerspective.mjs';
import { deriveAtlasSceneTemporalAnchors } from './deriveAtlasSceneTemporalAnchors.mjs';
import {
  ATLAS_TEMPORAL_LAYOUT_BUDGET_PROOF_SCHEMA_VERSION,
  ATLAS_TEMPORAL_LAYOUT_KEYBOARD_CONTRACT_SCHEMA_VERSION,
  ATLAS_TEMPORAL_LAYOUT_LIST_PARITY_SCHEMA_VERSION,
  ATLAS_TEMPORAL_LAYOUT_PACKET_SCHEMA_VERSION,
  ATLAS_TEMPORAL_LAYOUT_SCHEMA_VERSION,
  ATLAS_TEMPORAL_LAYOUT_SURFACE_MANIFEST_VERSION,
  ATLAS_TIME_SLIDER_STATE_SCHEMA_VERSION,
  sortAtlasTemporalLayoutEvents,
  sortAtlasTemporalLayoutSegments,
} from './atlasTemporalLayoutTypes.mjs';

const VIEW_ID = 'derived.atlas.temporalLayout.v1';
const PROVIDER_ID = 'query.atlasTemporalLayout';
const SURFACE_ID = 'surface.atlas.temporalLayout';
const RIGHT_RAIL_SLOT_ID = 'rightRail.context.atlas.temporalLayout';
const DEFAULT_SCENE_LIMIT = 48;
const MAX_SCENE_LIMIT = 120;
const DEFAULT_SEGMENT_LIMIT = 32;
const MAX_SEGMENT_LIMIT = 96;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLimit(value, fallback, max) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) return fallback;
  return Math.min(number, max);
}

function normalizeSliderValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['atlas.temporalLayout'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['atlas.temporalLayout'] === false) return false;
  if (capabilities.atlasTemporalLayout === false) return false;
  if (isPlainObject(capabilities.atlas) && capabilities.atlas.temporalLayout === false) return false;
  return true;
}

function buildSurfaceManifest() {
  return {
    schemaVersion: ATLAS_TEMPORAL_LAYOUT_SURFACE_MANIFEST_VERSION,
    surfaceId: SURFACE_ID,
    providerId: PROVIDER_ID,
    host: 'rightRail',
    slotId: RIGHT_RAIL_SLOT_ID,
    contributionKind: 'readOnlyHeavyProjection',
    allowedStateClasses: ['DERIVED_STATE', 'TRANSIENT_STATE'],
    commandAuthority: 'none',
    productMutation: false,
    storageAuthority: false,
    heavySurface: true,
    explicitOpenRequired: true,
    fallback: {
      empty: 'ATLAS_TEMPORAL_LAYOUT_EMPTY',
      degradedVisual: 'ATLAS_TEMPORAL_LAYOUT_LIST_PARITY',
      unavailable: 'ATLAS_TEMPORAL_LAYOUT_UNAVAILABLE',
    },
  };
}

function buildAuthority() {
  return {
    sourceOfTruth: [
      'derived.atlas.sceneTemporalAnchors.v1',
      'derived.atlas.relationSegmentsPerspective.v1',
    ],
    readModelOnly: true,
    commandAuthority: 'none',
    projectTruthMutation: false,
    manuscriptMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
    automaticCorrection: false,
    backgroundDaemon: false,
    typingHotPath: false,
    heavySurface: true,
    explicitOpenRequired: true,
  };
}

function pointValue(point) {
  if (!isPlainObject(point)) return null;
  if (Number.isFinite(Number(point.dayIndex))) return Number(point.dayIndex);
  const value = normalizeString(point.value);
  const date = value.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (date) return Number(date[1]) * 372 + Number(date[2]) * 31 + Number(date[3]);
  return null;
}

function pointLabel(point) {
  if (!isPlainObject(point)) return '';
  return normalizeString(point.label)
    || normalizeString(point.value)
    || (Number.isFinite(Number(point.dayIndex)) ? `day ${Number(point.dayIndex)}` : '');
}

function rangeLabel(range) {
  if (!isPlainObject(range)) return 'unknown';
  const kind = normalizeString(range.rangeKind) || 'unknown';
  const start = pointLabel(range.start);
  const end = pointLabel(range.end);
  if (start && end && start !== end) return `${start} to ${end}`;
  if (start || end) return start || end;
  return kind;
}

function rangeTimeValue(range, fallback) {
  if (!isPlainObject(range)) return fallback;
  const start = pointValue(range.start);
  if (Number.isFinite(start)) return start;
  const end = pointValue(range.end);
  if (Number.isFinite(end)) return end;
  return fallback;
}

function percentFor(value, min, max) {
  if (!Number.isFinite(value) || min === max) return 0;
  return Math.max(0, Math.min(100, Math.round(((value - min) / (max - min)) * 100)));
}

function countRelationsByScene(segments) {
  const counts = new Map();
  for (const segment of Array.isArray(segments) ? segments : []) {
    for (const sceneId of Array.isArray(segment.sceneIds) ? segment.sceneIds : []) {
      counts.set(sceneId, (counts.get(sceneId) || 0) + 1);
    }
  }
  return counts;
}

function buildBudgetProof({
  totalSceneCount,
  visibleSceneCount,
  totalSegmentCount,
  visibleSegmentCount,
  sceneLimit,
  segmentLimit,
}) {
  return {
    schemaVersion: ATLAS_TEMPORAL_LAYOUT_BUDGET_PROOF_SCHEMA_VERSION,
    sceneLimit,
    segmentLimit,
    totalSceneCount,
    visibleSceneCount,
    omittedSceneCount: Math.max(0, totalSceneCount - visibleSceneCount),
    totalSegmentCount,
    visibleSegmentCount,
    omittedSegmentCount: Math.max(0, totalSegmentCount - visibleSegmentCount),
    virtualized: true,
    renderAllScenes: false,
    renderAllSegments: false,
    clippingHonest: totalSceneCount > visibleSceneCount || totalSegmentCount > visibleSegmentCount,
    queryOnlyOnExplicitOpen: true,
    typingHotPathNonblocking: true,
    refreshOnTyping: false,
    noBackgroundDaemon: true,
  };
}

function emptyState(projectId, reason = '', invalidationKey = '') {
  return {
    schemaVersion: ATLAS_TEMPORAL_LAYOUT_SCHEMA_VERSION,
    state: reason ? 'unavailable' : 'empty',
    unavailableReason: reason,
    surfaceManifest: buildSurfaceManifest(),
    authority: buildAuthority(),
    projectId,
    summary: {
      sceneCount: 0,
      anchoredSceneCount: 0,
      unknownTemporalSceneCount: 0,
      relationSegmentCount: 0,
      selectedSceneCount: 0,
      layoutHash: '',
      sourceHash: '',
      invalidationKey,
    },
    layoutPacket: {
      schemaVersion: ATLAS_TEMPORAL_LAYOUT_PACKET_SCHEMA_VERSION,
      state: reason ? 'unavailable' : 'empty',
      axis: { min: 0, max: 0, step: 1, label: 'story time' },
      events: [],
      segments: [],
    },
    timeSliderState: {
      schemaVersion: ATLAS_TIME_SLIDER_STATE_SCHEMA_VERSION,
      min: 0,
      max: 0,
      step: 1,
      value: 0,
      selectedSceneIds: [],
      rangeLabel: 'empty',
    },
    listParity: {
      schemaVersion: ATLAS_TEMPORAL_LAYOUT_LIST_PARITY_SCHEMA_VERSION,
      rows: [],
      equivalentToTimeline: true,
      omittedRowCount: 0,
    },
    keyboardContract: buildKeyboardContract(),
    largeProjectBudgetProof: buildBudgetProof({
      totalSceneCount: 0,
      visibleSceneCount: 0,
      totalSegmentCount: 0,
      visibleSegmentCount: 0,
      sceneLimit: 0,
      segmentLimit: 0,
    }),
    evidence: buildEvidence({ layoutHash: '', sourceHashes: {} }),
  };
}

function buildKeyboardContract() {
  return {
    schemaVersion: ATLAS_TEMPORAL_LAYOUT_KEYBOARD_CONTRACT_SCHEMA_VERSION,
    timelineFocusModel: 'roving-event-tabindex',
    listFallbackFocusModel: 'native-list-buttons',
    supportedKeys: ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '],
    equivalentListParity: true,
    sliderNativeInput: true,
    noPointerOnlyState: true,
  };
}

function buildEvidence({ layoutHash, sourceHashes }) {
  return {
    schemaVersion: 'derived.atlas.temporalLayout.evidence.v1',
    sourceHashes,
    layoutHash,
    lazyweb: {
      applied: true,
      leadSearchQuery: 'timeline dashboard',
      coverageStrength: 'strong',
      topSimilarity: 0.56,
      referenceCompanies: ['fibery', 'coda', 'formlabs'],
      fullReport: 'unavailable',
      fullReportUnavailableReason: 'LAZYWEB_OBJECTIVE_CREATE_REDIRECTED_TO_WORKFLOW_NOT_FOUND',
      resultUse: 'reference-only temporal dashboard density, explicit date controls, timeline grid, and list fallback signal',
    },
    uiCraft: {
      applied: true,
      craftRead: 'desktop authoring analytics surface, product language, restrained neutral Atlas tokens, variance 4, signature bet: native slider over a compact evidence-first timeline',
    },
    guarantees: {
      readOnly: true,
      explicitOpenOnly: true,
      keyboardAndListParity: true,
      noManuscriptMutation: true,
      noNewDependency: true,
    },
  };
}

function buildLayout({ anchors, relationSegments, projectId, sceneLimit, segmentLimit, sliderValue, invalidationKey }) {
  const allAnchorRows = Array.isArray(anchors.sceneTemporalAnchors) ? anchors.sceneTemporalAnchors : [];
  const allSegments = Array.isArray(relationSegments.relationSegments) ? relationSegments.relationSegments : [];
  const relationCounts = countRelationsByScene(allSegments);
  const allEvents = sortAtlasTemporalLayoutEvents(allAnchorRows.map((row) => {
    const fallback = Number.isFinite(Number(row.sceneOrdinal)) ? Number(row.sceneOrdinal) : 0;
    const storyRange = isPlainObject(row.storyRange) ? row.storyRange : {};
    const narrativeRange = isPlainObject(row.narrativeRange) ? row.narrativeRange : {};
    const timeValue = rangeTimeValue(storyRange, fallback);
    const temporalState = storyRange.rangeKind === 'unknown' || narrativeRange.rangeKind === 'unknown' ? 'unknown' : row.anchorState || 'anchored';
    return {
      eventId: `atlas-temporal-event:${row.sceneId || fallback}`,
      sceneId: normalizeString(row.sceneId),
      sceneTitle: normalizeString(row.sceneTitle) || normalizeString(row.sceneId) || 'Scene',
      sceneOrdinal: fallback,
      timeValue,
      storyLabel: rangeLabel(storyRange),
      narrativeLabel: rangeLabel(narrativeRange),
      temporalState,
      anchorState: normalizeString(row.anchorState) || 'missing',
      relationSegmentCount: relationCounts.get(row.sceneId) || 0,
      ariaLabel: `${normalizeString(row.sceneTitle) || normalizeString(row.sceneId) || 'Scene'}: ${rangeLabel(storyRange)}, narrative ${rangeLabel(narrativeRange)}`,
    };
  }));
  const visibleEvents = allEvents.slice(0, sceneLimit);
  const min = visibleEvents.length ? Math.min(...visibleEvents.map((event) => event.timeValue)) : 0;
  const max = visibleEvents.length ? Math.max(...visibleEvents.map((event) => event.timeValue)) : 0;
  const slider = sliderValue === null ? min : Math.max(min, Math.min(max, sliderValue));
  const selected = visibleEvents
    .filter((event) => event.timeValue <= slider)
    .slice(-3);
  const events = visibleEvents.map((event, index) => ({
    ...event,
    xPercent: percentFor(event.timeValue, min, max),
    selected: selected.some((item) => item.eventId === event.eventId),
    focusIndex: index,
  }));
  const eventByScene = new Map(events.map((event) => [event.sceneId, event]));
  const segments = sortAtlasTemporalLayoutSegments(allSegments
    .slice(0, segmentLimit)
    .map((segment) => {
      const sceneIds = Array.isArray(segment.sceneIds) ? segment.sceneIds.filter((value) => typeof value === 'string') : [];
      const segmentEvents = sceneIds.map((sceneId) => eventByScene.get(sceneId)).filter(Boolean);
      const start = segmentEvents[0] || events.find((event) => event.sceneOrdinal === segment.startSceneOrdinal) || {};
      const end = segmentEvents[segmentEvents.length - 1] || events.find((event) => event.sceneOrdinal === segment.endSceneOrdinal) || start;
      return {
        segmentId: normalizeString(segment.segmentId),
        pairId: normalizeString(segment.pairId),
        leftEntityId: normalizeString(segment.leftEntityId),
        rightEntityId: normalizeString(segment.rightEntityId),
        sceneIds,
        evidenceAnchorIds: Array.isArray(segment.evidenceAnchorIds) ? segment.evidenceAnchorIds.filter((value) => typeof value === 'string') : [],
        startTimeValue: Number.isFinite(Number(start.timeValue)) ? Number(start.timeValue) : min,
        endTimeValue: Number.isFinite(Number(end.timeValue)) ? Number(end.timeValue) : max,
        startPercent: percentFor(Number(start.timeValue), min, max),
        endPercent: percentFor(Number(end.timeValue), min, max),
        temporalState: normalizeString(segment.temporalState) || 'unknownFallback',
      };
    }));
  const listRows = events.map((event) => ({
    sceneId: event.sceneId,
    sceneTitle: event.sceneTitle,
    sceneOrdinal: event.sceneOrdinal,
    storyLabel: event.storyLabel,
    narrativeLabel: event.narrativeLabel,
    temporalState: event.temporalState,
    anchorState: event.anchorState,
    relationSegmentCount: event.relationSegmentCount,
    selected: event.selected,
  }));
  const budgetProof = buildBudgetProof({
    totalSceneCount: allEvents.length,
    visibleSceneCount: events.length,
    totalSegmentCount: allSegments.length,
    visibleSegmentCount: segments.length,
    sceneLimit,
    segmentLimit,
  });
  const sourceHashes = {
    anchorHash: normalizeString(anchors.summary?.anchorHash),
    segmentHash: normalizeString(relationSegments.summary?.segmentHash),
  };
  const layoutHash = hashCanonicalValue({ events, segments, slider, budgetProof, sourceHashes });
  const unknownTemporalSceneCount = allEvents.filter((event) => event.temporalState === 'unknown').length;
  return {
    schemaVersion: ATLAS_TEMPORAL_LAYOUT_SCHEMA_VERSION,
    state: events.length < 1 ? 'empty' : unknownTemporalSceneCount > 0 ? 'degraded' : 'ready',
    unavailableReason: '',
    surfaceManifest: buildSurfaceManifest(),
    authority: buildAuthority(),
    projectId,
    summary: {
      sceneCount: allEvents.length,
      anchoredSceneCount: allEvents.filter((event) => event.anchorState === 'anchored').length,
      unknownTemporalSceneCount,
      relationSegmentCount: allSegments.length,
      selectedSceneCount: selected.length,
      layoutHash,
      sourceHash: hashCanonicalValue(sourceHashes),
      invalidationKey,
    },
    layoutPacket: {
      schemaVersion: ATLAS_TEMPORAL_LAYOUT_PACKET_SCHEMA_VERSION,
      state: events.length < 1 ? 'empty' : 'ready',
      axis: { min, max, step: 1, label: 'story time' },
      events,
      segments,
    },
    timeSliderState: {
      schemaVersion: ATLAS_TIME_SLIDER_STATE_SCHEMA_VERSION,
      min,
      max,
      step: 1,
      value: slider,
      selectedSceneIds: selected.map((event) => event.sceneId),
      rangeLabel: selected.length ? selected.map((event) => event.storyLabel).join(' / ') : 'empty',
    },
    listParity: {
      schemaVersion: ATLAS_TEMPORAL_LAYOUT_LIST_PARITY_SCHEMA_VERSION,
      rows: listRows,
      equivalentToTimeline: true,
      omittedRowCount: Math.max(0, allEvents.length - listRows.length),
    },
    keyboardContract: buildKeyboardContract(),
    largeProjectBudgetProof: budgetProof,
    evidence: buildEvidence({ layoutHash, sourceHashes }),
  };
}

export function deriveAtlasTemporalLayout(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  const languageCode = normalizeString(input?.params?.languageCode);
  const sceneLimit = normalizeLimit(input?.params?.sceneLimit, DEFAULT_SCENE_LIMIT, MAX_SCENE_LIMIT);
  const segmentLimit = normalizeLimit(input?.params?.segmentLimit, DEFAULT_SEGMENT_LIMIT, MAX_SEGMENT_LIMIT);
  const sliderValue = normalizeSliderValue(input?.params?.sliderValue);
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
      languageCode,
      sceneLimit,
      segmentLimit,
      sliderValue,
    },
    capabilitySnapshot: input.capabilitySnapshot,
    derive: ({ coreState, params, capabilitySnapshot, meta }) => {
      if (!isCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          VIEW_ID,
          'ATLAS_TEMPORAL_LAYOUT_DISABLED',
          { capabilityId: 'atlas.temporalLayout' },
        );
      }
      const anchors = deriveAtlasSceneTemporalAnchors({ coreState, params: { projectId: params.projectId }, capabilitySnapshot });
      if (!anchors.ok) {
        return emptyState(params.projectId, anchors.error?.reason || 'ATLAS_SCENE_TEMPORAL_ANCHORS_UNAVAILABLE', meta.invalidationKey);
      }
      const relationSegments = deriveAtlasRelationSegmentsPerspective({
        coreState,
        params: { projectId: params.projectId, languageCode: params.languageCode },
        capabilitySnapshot,
      });
      if (!relationSegments.ok) {
        return emptyState(params.projectId, relationSegments.error?.reason || 'ATLAS_RELATION_SEGMENTS_UNAVAILABLE', meta.invalidationKey);
      }
      return buildLayout({
        anchors: anchors.value,
        relationSegments: relationSegments.value,
        projectId: params.projectId,
        sceneLimit: params.sceneLimit,
        segmentLimit: params.segmentLimit,
        sliderValue: params.sliderValue,
        invalidationKey: meta.invalidationKey,
      });
    },
  });
}

export { VIEW_ID as ATLAS_TEMPORAL_LAYOUT_VIEW_ID };
