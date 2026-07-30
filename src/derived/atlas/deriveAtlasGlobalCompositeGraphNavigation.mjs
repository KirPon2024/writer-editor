import { hashCanonicalValue } from '../deriveView.mjs';
import { ATLAS_TRUST_STATES } from './atlasMentionTypes.mjs';
import {
  ATLAS_GLOBAL_COMPOSITE_ACCESSIBILITY_PARITY_SCHEMA_VERSION,
  ATLAS_GLOBAL_COMPOSITE_BATCH_NAVIGATION_INTENT_SCHEMA_VERSION,
  ATLAS_GLOBAL_COMPOSITE_TRUST_FILTER_SCHEMA_VERSION,
  sortAtlasGlobalCompositeEdges,
  sortAtlasGlobalCompositeNodes,
} from './atlasGlobalCompositeGraphTypes.mjs';

const NAVIGATION_PACKET_SCHEMA_VERSION = 'atlas.globalCompositeGraph.navigationPacket.v1';
const TRUST_AUTHOR_CONFIRMED = ATLAS_TRUST_STATES.AUTHOR_CONFIRMED;
const TRUST_ALGORITHMIC_OBSERVATION = ATLAS_TRUST_STATES.ALGORITHMIC_OBSERVATION;
const TRUST_UNKNOWN = 'UNKNOWN';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePositiveInteger(value, fallback, max) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) return fallback;
  return Math.min(number, max);
}

function uniqueSortedStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizeString).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }));
}

function compositeSourceRevision(graph = {}) {
  const source = isPlainObject(graph) ? graph : {};
  const compositeHash = normalizeString(source.meta?.compositeHash || source.summary?.compositeHash);
  if (compositeHash) return compositeHash;
  return hashCanonicalValue({
    schemaVersion: normalizeString(source.schemaVersion),
    projectId: normalizeString(source.projectId),
    nodes: Array.isArray(source.nodes) ? source.nodes : [],
    edges: Array.isArray(source.edges) ? source.edges : [],
  });
}

function normalizeTrustState(value) {
  const trustState = normalizeString(value);
  if (trustState === TRUST_AUTHOR_CONFIRMED) return TRUST_AUTHOR_CONFIRMED;
  if (trustState === TRUST_ALGORITHMIC_OBSERVATION) return TRUST_ALGORITHMIC_OBSERVATION;
  if (trustState === 'AUTHOR') return TRUST_AUTHOR_CONFIRMED;
  if (trustState === 'ALGORITHMIC') return TRUST_ALGORITHMIC_OBSERVATION;
  return TRUST_UNKNOWN;
}

function inferNodeTrustState(node = {}) {
  const explicit = normalizeTrustState(node.trustState || node.evidenceTrustState || node.authorTrustState);
  if (explicit !== TRUST_UNKNOWN) return explicit;
  const sourceProjection = normalizeString(node.sourceProjection);
  if (sourceProjection === 'manualMap') return TRUST_AUTHOR_CONFIRMED;
  return TRUST_ALGORITHMIC_OBSERVATION;
}

function inferEdgeTrustState(edge = {}, nodeTrustById = new Map()) {
  const explicit = normalizeTrustState(edge.trustState || edge.evidenceTrustState || edge.authorTrustState);
  if (explicit !== TRUST_UNKNOWN) return explicit;
  const fromTrust = nodeTrustById.get(edge.fromNodeId) || TRUST_UNKNOWN;
  const toTrust = nodeTrustById.get(edge.toNodeId) || TRUST_UNKNOWN;
  if (fromTrust === TRUST_AUTHOR_CONFIRMED && toTrust === TRUST_AUTHOR_CONFIRMED) return TRUST_AUTHOR_CONFIRMED;
  if (fromTrust === TRUST_UNKNOWN || toTrust === TRUST_UNKNOWN) return TRUST_UNKNOWN;
  return TRUST_ALGORITHMIC_OBSERVATION;
}

export function buildAtlasGlobalCompositeTrustFilter(input = {}) {
  const allowedTrustStates = uniqueSortedStrings(input.allowedTrustStates || [
    TRUST_AUTHOR_CONFIRMED,
    TRUST_ALGORITHMIC_OBSERVATION,
  ]).filter((state) => [TRUST_AUTHOR_CONFIRMED, TRUST_ALGORITHMIC_OBSERVATION, TRUST_UNKNOWN].includes(state));
  const filter = {
    schemaVersion: ATLAS_GLOBAL_COMPOSITE_TRUST_FILTER_SCHEMA_VERSION,
    allowedTrustStates,
    includeUnknown: input.includeUnknown === true || allowedTrustStates.includes(TRUST_UNKNOWN),
    evidenceJumpOnly: input.evidenceJumpOnly === true,
    automaticApply: false,
    commandDispatch: false,
  };
  return {
    ...filter,
    filterHash: hashCanonicalValue(filter),
  };
}

function filterNodes(nodes, trustFilter) {
  const allowed = new Set(trustFilter.allowedTrustStates);
  return sortAtlasGlobalCompositeNodes(nodes)
    .map((node) => ({ ...node, trustState: inferNodeTrustState(node) }))
    .filter((node) => allowed.has(node.trustState) || (node.trustState === TRUST_UNKNOWN && trustFilter.includeUnknown));
}

function filterEdges(edges, nodeIdSet, nodeTrustById, trustFilter) {
  const allowed = new Set(trustFilter.allowedTrustStates);
  return sortAtlasGlobalCompositeEdges(edges)
    .map((edge) => ({ ...edge, trustState: inferEdgeTrustState(edge, nodeTrustById) }))
    .filter((edge) => nodeIdSet.has(edge.fromNodeId) && nodeIdSet.has(edge.toNodeId))
    .filter((edge) => allowed.has(edge.trustState) || (edge.trustState === TRUST_UNKNOWN && trustFilter.includeUnknown));
}

function navigationTargetForNode(node = {}, sourceRefsById = new Map()) {
  const sourceRefIds = uniqueSortedStrings(node.sourceRefIds);
  const sourceRefs = sourceRefIds
    .map((sourceRefId) => sourceRefsById.get(sourceRefId))
    .filter(Boolean);
  const firstRef = sourceRefs[0] || null;
  return {
    routeKind: 'evidenceJump',
    routeAuthority: 'intent-only',
    commandDispatch: false,
    automaticApply: false,
    sourceProjection: firstRef?.sourceProjection || normalizeString(node.sourceProjection),
    sourceId: firstRef?.sourceId || normalizeString(node.sourceId),
    sourceRefIds,
    nodeId: normalizeString(node.nodeId),
  };
}

export function buildAtlasGlobalCompositeBatchNavigationIntents(input = {}) {
  const graph = isPlainObject(input.graph) ? input.graph : {};
  const nodes = sortAtlasGlobalCompositeNodes(Array.isArray(input.nodes) ? input.nodes : graph.nodes);
  const selectedNodeIds = new Set(uniqueSortedStrings(input.selectedNodeIds));
  const batchLimit = normalizePositiveInteger(input.batchLimit, 50, 500);
  const sourceRefsById = new Map((Array.isArray(graph.sourceRefs) ? graph.sourceRefs : [])
    .map((ref) => [ref.sourceRefId, ref]));
  const candidateNodes = nodes
    .filter((node) => selectedNodeIds.size === 0 || selectedNodeIds.has(node.nodeId))
    .slice(0, batchLimit);
  const intents = candidateNodes.map((node, index) => {
    const base = {
      schemaVersion: ATLAS_GLOBAL_COMPOSITE_BATCH_NAVIGATION_INTENT_SCHEMA_VERSION,
      intentKind: 'atlas.globalCompositeGraph.evidenceJump',
      ordinal: index,
      projectId: normalizeString(graph.projectId),
      sourceRevision: normalizeString(input.sourceRevision) || compositeSourceRevision(graph),
      nodeId: normalizeString(node.nodeId),
      nodeKind: normalizeString(node.nodeKind),
      label: normalizeString(node.label),
      trustState: inferNodeTrustState(node),
      target: navigationTargetForNode(node, sourceRefsById),
      selected: selectedNodeIds.size === 0 || selectedNodeIds.has(node.nodeId),
      manualReviewRequired: true,
      automaticApply: false,
      commandDispatch: false,
      rendererMutation: false,
    };
    return {
      ...base,
      intentId: `atlas-global-navigation:${hashCanonicalValue(base)}`,
    };
  });
  return {
    schemaVersion: ATLAS_GLOBAL_COMPOSITE_BATCH_NAVIGATION_INTENT_SCHEMA_VERSION,
    projectId: normalizeString(graph.projectId),
    sourceRevision: normalizeString(input.sourceRevision) || compositeSourceRevision(graph),
    batchLimit,
    selectedNodeIds: [...selectedNodeIds],
    omittedIntentCount: Math.max(0, nodes.length - intents.length),
    intents,
    authority: {
      routeAuthority: 'intent-only',
      automaticApply: false,
      commandDispatch: false,
      projectTruthMutation: false,
      storageMutation: false,
      rendererMutation: false,
    },
  };
}

function buildAccessibilityParity({ nodes, edges, intents }) {
  return {
    schemaVersion: ATLAS_GLOBAL_COMPOSITE_ACCESSIBILITY_PARITY_SCHEMA_VERSION,
    graphEquivalentList: true,
    pointerOnlyGraphAction: false,
    batchNavigationListRows: intents.length,
    keyboardNavigation: {
      focusModel: 'roving-listbox-option',
      supportedKeys: ['ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', 'Space'],
      batchSelectionKeys: ['Shift+ArrowUp', 'Shift+ArrowDown'],
      wrap: false,
    },
    semantics: {
      graphRole: 'application',
      listRole: 'listbox',
      rowRole: 'option',
      evidenceJumpButtonRole: 'button',
    },
    counts: {
      filteredNodes: nodes.length,
      filteredEdges: edges.length,
      navigationIntents: intents.length,
    },
  };
}

export function deriveAtlasGlobalCompositeGraphNavigationPacket(input = {}) {
  const graph = isPlainObject(input.graph) ? input.graph : {};
  const trustFilter = buildAtlasGlobalCompositeTrustFilter(input.trustFilter);
  const allNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const allEdges = Array.isArray(graph.edges) ? graph.edges : [];
  const nodes = filterNodes(allNodes, trustFilter);
  const nodeIdSet = new Set(nodes.map((node) => node.nodeId));
  const nodeTrustById = new Map(nodes.map((node) => [node.nodeId, node.trustState]));
  const edges = filterEdges(allEdges, nodeIdSet, nodeTrustById, trustFilter);
  const sourceRevision = compositeSourceRevision(graph);
  const batch = buildAtlasGlobalCompositeBatchNavigationIntents({
    graph,
    nodes,
    sourceRevision,
    selectedNodeIds: input.selectedNodeIds,
    batchLimit: input.batchLimit,
  });
  const accessibilityParity = buildAccessibilityParity({
    nodes,
    edges,
    intents: batch.intents,
  });
  const packet = {
    schemaVersion: NAVIGATION_PACKET_SCHEMA_VERSION,
    projectId: normalizeString(graph.projectId),
    sourceRevision,
    trustFilter,
    nodes,
    edges,
    batchNavigation: batch,
    accessibilityParity,
    summary: {
      sourceNodeCount: allNodes.length,
      sourceEdgeCount: allEdges.length,
      filteredNodeCount: nodes.length,
      filteredEdgeCount: edges.length,
      omittedNodeCount: Math.max(0, allNodes.length - nodes.length),
      omittedEdgeCount: Math.max(0, allEdges.length - edges.length),
      navigationIntentCount: batch.intents.length,
      automaticApply: false,
      pointerOnlyGraphAction: false,
    },
    authority: {
      sourceOfTruth: 'derived.atlas.globalCompositeGraph.v1',
      trustFilterTruth: 'computed',
      navigationAuthority: 'intent-only',
      automaticApply: false,
      commandDispatch: false,
      projectTruthMutation: false,
      storageMutation: false,
      networkMutation: false,
      rendererMutation: false,
    },
  };
  return {
    ...packet,
    meta: {
      navigationPacketHash: hashCanonicalValue(packet),
    },
  };
}
