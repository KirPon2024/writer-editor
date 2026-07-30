import { hashCanonicalValue } from '../deriveView.mjs';
import {
  ATLAS_GLOBAL_COMPOSITE_ACCESSIBILITY_PARITY_SCHEMA_VERSION,
  ATLAS_GLOBAL_COMPOSITE_GRAPH_SCHEMA_VERSION,
  ATLAS_GLOBAL_COMPOSITE_LOD_PLAN_SCHEMA_VERSION,
  ATLAS_GLOBAL_COMPOSITE_RENDERER_ADAPTER_PROFILE_SCHEMA_VERSION,
  ATLAS_GLOBAL_COMPOSITE_STAGE_08_ACCEPTANCE_SCHEMA_VERSION,
  ATLAS_GLOBAL_COMPOSITE_TRUST_FILTER_SCHEMA_VERSION,
} from './atlasGlobalCompositeGraphTypes.mjs';

const STAGE_ID = 'E08_STAGE_08_ADVANCED_GRAPH_CROSS_PROJECTION_CONTOURS';
const NEXT_STAGE_CONTOUR = 'E09_C00_STAGE_09_SERIES_AND_PORTABILITY_CONTOUR_COMPILATION';
const GATE_STATUS = Object.freeze({
  PASS: 'PASS',
  DEGRADED: 'DEGRADED',
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNonNegativeNumber(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return number;
}

function compositeHash(graph = {}) {
  return normalizeString(graph.meta?.compositeHash || graph.summary?.compositeHash);
}

function packetHash(value) {
  return hashCanonicalValue(value || {});
}

function gate(id, label, passed, evidence, details = {}) {
  return {
    id,
    label,
    status: passed ? GATE_STATUS.PASS : GATE_STATUS.DEGRADED,
    evidence,
    details,
  };
}

export function buildAtlasGlobalCompositeRendererAdapterProfilingPacket(input = {}) {
  const graph = isPlainObject(input.graph) ? input.graph : {};
  const lodPlan = isPlainObject(input.lodPlan) ? input.lodPlan : {};
  const navigationPacket = isPlainObject(input.navigationPacket) ? input.navigationPacket : {};
  const metrics = isPlainObject(input.metrics) ? input.metrics : {};
  const typingHotPathBudgetMs = normalizeNonNegativeNumber(metrics.typingHotPathBudgetMs, 4);
  const graphOpenBudgetMs = normalizeNonNegativeNumber(metrics.graphOpenBudgetMs, 32);
  const graphProjectionMs = normalizeNonNegativeNumber(metrics.graphProjectionMs, 0);
  const adapterProjectionMs = normalizeNonNegativeNumber(metrics.adapterProjectionMs, 0);
  const typingHotPathMs = normalizeNonNegativeNumber(metrics.typingHotPathMs, 0);
  const graphWorkOnTypingHotPath = input.graphWorkOnTypingHotPath === true;
  const renderAllNodes = lodPlan.summary?.renderAllNodes === true && Number(lodPlan.summary?.sourceNodeCount || 0) > Number(lodPlan.limits?.maxNodes || 0);
  const renderAllEdges = lodPlan.summary?.renderAllEdges === true && Number(lodPlan.summary?.sourceEdgeCount || 0) > Number(lodPlan.limits?.maxEdges || 0);
  const packet = {
    schemaVersion: ATLAS_GLOBAL_COMPOSITE_RENDERER_ADAPTER_PROFILE_SCHEMA_VERSION,
    projectId: normalizeString(graph.projectId || lodPlan.projectId || navigationPacket.projectId),
    sourceRevision: compositeHash(graph) || normalizeString(lodPlan.sourceRevision || navigationPacket.sourceRevision),
    profileMode: 'repo-native-derived-adapter-budget',
    rendererAdapterRuntimeChanged: false,
    graphWorkOnTypingHotPath,
    renderAll: {
      nodes: renderAllNodes,
      edges: renderAllEdges,
    },
    metrics: {
      typingHotPathBudgetMs,
      graphOpenBudgetMs,
      graphProjectionMs,
      adapterProjectionMs,
      typingHotPathMs,
    },
    withinBudget: {
      typingHotPath: !graphWorkOnTypingHotPath && typingHotPathMs <= typingHotPathBudgetMs,
      graphOpen: graphProjectionMs + adapterProjectionMs <= graphOpenBudgetMs,
      lodRenderAll: renderAllNodes === false && renderAllEdges === false,
      accessibilityParity: navigationPacket.accessibilityParity?.schemaVersion === ATLAS_GLOBAL_COMPOSITE_ACCESSIBILITY_PARITY_SCHEMA_VERSION
        && navigationPacket.accessibilityParity?.pointerOnlyGraphAction === false,
    },
    authority: {
      profilingTruth: 'derived',
      persistentRuntimeProfile: false,
      projectTruthMutation: false,
      manuscriptMutation: false,
      storageMutation: false,
      networkMutation: false,
      rendererMutation: false,
      commandDispatch: false,
    },
  };
  return {
    ...packet,
    meta: {
      rendererAdapterProfileHash: packetHash(packet),
    },
  };
}

function buildAcceptanceProof({ graph, lodPlan, navigationPacket, schedulerAcceptance, rendererAdapterProfile }) {
  const sourceRefs = Array.isArray(graph.sourceRefs) ? graph.sourceRefs : [];
  const gates = [
    gate(
      'stage08-c01-global-composite-source-isolation',
      'Global composite source isolation',
      graph.schemaVersion === ATLAS_GLOBAL_COMPOSITE_GRAPH_SCHEMA_VERSION
        && graph.authority?.readModelOnly === true
        && graph.authority?.sourceProjectionWriteBack === false
        && graph.authority?.projectTruthMutation === false
        && graph.authority?.storageMutation === false
        && graph.authority?.networkMutation === false
        && sourceRefs.every((ref) => ref.readOnly === true && ref.sourceWriteBack === false),
      'Composite graph is read-only relative to source projections and source refs.',
      { sourceRefCount: sourceRefs.length, compositeHash: compositeHash(graph) },
    ),
    gate(
      'stage08-c02-on-demand-idle-scheduler-stale-discard',
      'On-demand idle scheduler and stale discard',
      schedulerAcceptance?.accepted === true
        && schedulerAcceptance?.published?.persistentDerivedTruth === false,
      'Scheduler acceptance publishes a pointer-only composite hash and no persistent derived truth.',
      {
        requestId: normalizeString(schedulerAcceptance?.requestId),
        sourceRevision: normalizeString(schedulerAcceptance?.sourceRevision),
      },
    ),
    gate(
      'stage08-c03-lod-stable-position-budget',
      'LOD stable position budget',
      lodPlan.schemaVersion === ATLAS_GLOBAL_COMPOSITE_LOD_PLAN_SCHEMA_VERSION
        && lodPlan.resourceBudgetProof?.withinBudget?.nodes === true
        && lodPlan.resourceBudgetProof?.withinBudget?.edges === true
        && lodPlan.authority?.persistentLayoutTruth === false
        && lodPlan.authority?.projectTruthMutation === false,
      'LOD plan stays within node and edge budgets and does not persist layout truth.',
      {
        plannedNodeCount: Number(lodPlan.summary?.plannedNodeCount || 0),
        plannedEdgeCount: Number(lodPlan.summary?.plannedEdgeCount || 0),
      },
    ),
    gate(
      'stage08-c04-trust-navigation-accessibility-parity',
      'Trust filters, batch navigation, and accessibility parity',
      navigationPacket.trustFilter?.schemaVersion === ATLAS_GLOBAL_COMPOSITE_TRUST_FILTER_SCHEMA_VERSION
        && navigationPacket.batchNavigation?.authority?.routeAuthority === 'intent-only'
        && navigationPacket.batchNavigation?.authority?.automaticApply === false
        && navigationPacket.batchNavigation?.authority?.commandDispatch === false
        && navigationPacket.accessibilityParity?.schemaVersion === ATLAS_GLOBAL_COMPOSITE_ACCESSIBILITY_PARITY_SCHEMA_VERSION
        && navigationPacket.accessibilityParity?.graphEquivalentList === true
        && navigationPacket.accessibilityParity?.pointerOnlyGraphAction === false,
      'Navigation packet exposes list and keyboard equivalents for intent-only evidence jumps.',
      {
        navigationIntentCount: Number(navigationPacket.summary?.navigationIntentCount || 0),
        filteredNodeCount: Number(navigationPacket.summary?.filteredNodeCount || 0),
      },
    ),
    gate(
      'stage08-c05-renderer-adapter-profile-budget',
      'Renderer adapter profile budget',
      rendererAdapterProfile.schemaVersion === ATLAS_GLOBAL_COMPOSITE_RENDERER_ADAPTER_PROFILE_SCHEMA_VERSION
        && rendererAdapterProfile.withinBudget?.typingHotPath === true
        && rendererAdapterProfile.withinBudget?.graphOpen === true
        && rendererAdapterProfile.withinBudget?.lodRenderAll === true
        && rendererAdapterProfile.withinBudget?.accessibilityParity === true
        && rendererAdapterProfile.authority?.rendererMutation === false,
      'Renderer adapter profile proves graph work stays off typing hot path and within explicit budgets.',
      rendererAdapterProfile.metrics || {},
    ),
    gate(
      'stage08-handoff-stage09-boundary',
      'Stage 09 handoff boundary',
      true,
      'Stage 08 closes to Stage 09 series and portability compilation, not final Program DoD.',
      { nextContour: NEXT_STAGE_CONTOUR, readyForFinalProgramDoD: false },
    ),
  ];
  const acceptanceProof = {
    schemaVersion: ATLAS_GLOBAL_COMPOSITE_STAGE_08_ACCEPTANCE_SCHEMA_VERSION,
    stageId: STAGE_ID,
    gates,
    pass: gates.every((item) => item.status === GATE_STATUS.PASS),
  };
  return {
    ...acceptanceProof,
    proofHash: packetHash(acceptanceProof),
  };
}

function buildHandoff(acceptanceProof) {
  return {
    schemaVersion: 'atlas.globalCompositeGraph.stage08Handoff.v1',
    fromStage: STAGE_ID,
    nextContour: NEXT_STAGE_CONTOUR,
    readyForNextStage: acceptanceProof.pass,
    readyForFinalProgramDoD: false,
    releaseReadinessClaim: false,
    remainingScopeOut: [
      'series atlas packaging',
      'cross-book identity portability',
      'comments history collaboration transport',
      'platform certification',
      'final Program DoD',
    ],
    handoffGuards: {
      noNewDependency: true,
      noUiRuntimeChange: true,
      noProjectTruthMutation: true,
      noManuscriptMutation: true,
      noStorageMutation: true,
      noNetworkMutation: true,
      noRendererMutation: true,
      releaseClaimBlocked: true,
    },
  };
}

export function deriveAtlasGlobalCompositeStageAcceptance(input = {}) {
  const graph = isPlainObject(input.graph) ? input.graph : {};
  const lodPlan = isPlainObject(input.lodPlan) ? input.lodPlan : {};
  const navigationPacket = isPlainObject(input.navigationPacket) ? input.navigationPacket : {};
  const schedulerAcceptance = isPlainObject(input.schedulerAcceptance) ? input.schedulerAcceptance : {};
  const rendererAdapterProfile = isPlainObject(input.rendererAdapterProfile)
    ? input.rendererAdapterProfile
    : buildAtlasGlobalCompositeRendererAdapterProfilingPacket({
      graph,
      lodPlan,
      navigationPacket,
      metrics: input.metrics,
      graphWorkOnTypingHotPath: input.graphWorkOnTypingHotPath,
    });
  const acceptanceProof = buildAcceptanceProof({
    graph,
    lodPlan,
    navigationPacket,
    schedulerAcceptance,
    rendererAdapterProfile,
  });
  const handoff = buildHandoff(acceptanceProof);
  const acceptance = {
    schemaVersion: ATLAS_GLOBAL_COMPOSITE_STAGE_08_ACCEPTANCE_SCHEMA_VERSION,
    stageId: STAGE_ID,
    state: acceptanceProof.pass ? 'ready' : 'degraded',
    designToolRouter: 'NOT_APPLICABLE',
    graph,
    rendererAdapterProfile,
    acceptanceProof,
    handoff,
    summary: {
      gateCount: acceptanceProof.gates.length,
      passedGateCount: acceptanceProof.gates.filter((item) => item.status === GATE_STATUS.PASS).length,
      stageAcceptance: acceptanceProof.pass ? 'pass' : 'degraded',
      compositeHash: compositeHash(graph),
      lodPlanHash: normalizeString(lodPlan.meta?.lodPlanHash),
      navigationPacketHash: normalizeString(navigationPacket.meta?.navigationPacketHash),
      rendererAdapterProfileHash: normalizeString(rendererAdapterProfile.meta?.rendererAdapterProfileHash),
      readyForFinalProgramDoD: false,
      releaseReadinessClaim: false,
    },
    authority: {
      sourceOfTruth: [
        'derived.atlas.globalCompositeGraph.v1',
        'atlas.globalCompositeGraph.job.v1',
        'atlas.globalCompositeGraph.lodPlan.v1',
        'atlas.globalCompositeGraph.navigationPacket.v1',
      ],
      readModelOnly: true,
      commandAuthority: 'none',
      projectTruthMutation: false,
      manuscriptMutation: false,
      storageMutation: false,
      networkMutation: false,
      rendererMutation: false,
      releaseReadinessClaim: false,
    },
  };
  return {
    ...acceptance,
    meta: {
      acceptanceHash: packetHash({
        acceptanceProof,
        handoff,
        summary: acceptance.summary,
      }),
    },
  };
}

export { STAGE_ID as ATLAS_GLOBAL_COMPOSITE_STAGE_08_ID, NEXT_STAGE_CONTOUR as ATLAS_GLOBAL_COMPOSITE_STAGE_08_NEXT_CONTOUR };
