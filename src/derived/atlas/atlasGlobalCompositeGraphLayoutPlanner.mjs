import { hashCanonicalValue } from '../deriveView.mjs';
import {
  ATLAS_GLOBAL_COMPOSITE_LOD_PLAN_SCHEMA_VERSION,
  ATLAS_GLOBAL_COMPOSITE_RESOURCE_BUDGET_PROOF_SCHEMA_VERSION,
  ATLAS_GLOBAL_COMPOSITE_STABLE_POSITION_SCHEMA_VERSION,
  sortAtlasGlobalCompositeEdges,
  sortAtlasGlobalCompositeNodes,
} from './atlasGlobalCompositeGraphTypes.mjs';

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

function normalizeLimits(value = {}) {
  const input = isPlainObject(value) ? value : {};
  return {
    maxNodes: normalizePositiveInteger(input.maxNodes, 600, 50_000),
    maxEdges: normalizePositiveInteger(input.maxEdges, 900, 100_000),
    labelNodeBudget: normalizePositiveInteger(input.labelNodeBudget, 120, 10_000),
  };
}

function compositeSourceRevision(graph = {}) {
  const source = isPlainObject(graph) ? graph : {};
  const compositeHash = normalizeString(source.meta?.compositeHash || source.summary?.compositeHash);
  if (compositeHash) return compositeHash;
  return hashCanonicalValue({
    schemaVersion: normalizeString(source.schemaVersion),
    projectId: normalizeString(source.projectId),
    sourceRefs: Array.isArray(source.sourceRefs) ? source.sourceRefs : [],
    nodes: Array.isArray(source.nodes) ? source.nodes : [],
    edges: Array.isArray(source.edges) ? source.edges : [],
  });
}

function stableSeed(graph = {}) {
  return hashCanonicalValue({
    sourceRevision: compositeSourceRevision(graph),
    sourceProjectionHashes: isPlainObject(graph.summary?.sourceProjectionHashes)
      ? graph.summary.sourceProjectionHashes
      : {},
  });
}

function hexSliceToUnit(hash, start) {
  const segment = hash.slice(start, start + 8) || '0';
  return Number.parseInt(segment, 16) / 0xffffffff;
}

function stablePositionForNode(node, seed, ordinal) {
  const positionHash = hashCanonicalValue({
    seed,
    nodeId: normalizeString(node.nodeId),
    nodeKind: normalizeString(node.nodeKind),
  });
  const ring = Math.floor(ordinal / 64);
  const radius = 160 + ring * 52 + Math.floor(hexSliceToUnit(positionHash, 0) * 24);
  const angle = hexSliceToUnit(positionHash, 8) * Math.PI * 2;
  return {
    schemaVersion: ATLAS_GLOBAL_COMPOSITE_STABLE_POSITION_SCHEMA_VERSION,
    nodeId: normalizeString(node.nodeId),
    x: Math.round(Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius),
    positionHash,
  };
}

function scoreNode(node) {
  const sourceRefCount = Array.isArray(node.sourceRefIds) ? node.sourceRefIds.length : 0;
  const kindWeight = node.nodeKind === 'originRef' ? 1 : 0;
  return sourceRefCount * 10 + kindWeight;
}

function selectNodes(nodes, maxNodes) {
  return sortAtlasGlobalCompositeNodes(nodes)
    .map((node, ordinal) => ({ node, ordinal, score: scoreNode(node) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.ordinal - b.ordinal;
    })
    .slice(0, maxNodes)
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((item) => item.node);
}

function selectEdges(edges, nodeIdSet, maxEdges) {
  return sortAtlasGlobalCompositeEdges(edges)
    .filter((edge) => nodeIdSet.has(edge.fromNodeId) && nodeIdSet.has(edge.toNodeId))
    .slice(0, maxEdges);
}

export function buildAtlasGlobalCompositeGraphResourceBudgetProof(input = {}) {
  const graph = isPlainObject(input.graph) ? input.graph : {};
  const lodPlan = isPlainObject(input.lodPlan) ? input.lodPlan : {};
  const limits = normalizeLimits(input.limits || lodPlan.limits);
  const inputNodeCount = Array.isArray(graph.nodes) ? graph.nodes.length : 0;
  const inputEdgeCount = Array.isArray(graph.edges) ? graph.edges.length : 0;
  const plannedNodeCount = Array.isArray(lodPlan.nodes) ? lodPlan.nodes.length : 0;
  const plannedEdgeCount = Array.isArray(lodPlan.edges) ? lodPlan.edges.length : 0;
  const proof = {
    schemaVersion: ATLAS_GLOBAL_COMPOSITE_RESOURCE_BUDGET_PROOF_SCHEMA_VERSION,
    projectId: normalizeString(graph.projectId),
    sourceRevision: normalizeString(input.sourceRevision) || compositeSourceRevision(graph),
    limits,
    input: {
      nodes: inputNodeCount,
      edges: inputEdgeCount,
    },
    planned: {
      nodes: plannedNodeCount,
      edges: plannedEdgeCount,
    },
    omitted: {
      nodes: Math.max(0, inputNodeCount - plannedNodeCount),
      edges: Math.max(0, inputEdgeCount - plannedEdgeCount),
    },
    withinBudget: {
      nodes: plannedNodeCount <= limits.maxNodes,
      edges: plannedEdgeCount <= limits.maxEdges,
    },
    renderAll: {
      nodes: inputNodeCount > 0 && plannedNodeCount >= inputNodeCount,
      edges: inputEdgeCount > 0 && plannedEdgeCount >= inputEdgeCount,
    },
  };
  return {
    ...proof,
    meta: {
      resourceBudgetProofHash: hashCanonicalValue(proof),
    },
  };
}

export function buildAtlasGlobalCompositeGraphLodPlan(input = {}) {
  const graph = isPlainObject(input.graph) ? input.graph : {};
  const limits = normalizeLimits(input.limits);
  const allNodes = sortAtlasGlobalCompositeNodes(Array.isArray(graph.nodes) ? graph.nodes : []);
  const allEdges = sortAtlasGlobalCompositeEdges(Array.isArray(graph.edges) ? graph.edges : []);
  const nodes = selectNodes(allNodes, limits.maxNodes);
  const nodeIdSet = new Set(nodes.map((node) => node.nodeId));
  const edges = selectEdges(allEdges, nodeIdSet, limits.maxEdges);
  const seed = stableSeed(graph);
  const positions = nodes.map((node, ordinal) => stablePositionForNode(node, seed, ordinal));
  const positionByNode = new Map(positions.map((position) => [position.nodeId, position]));
  const planNodes = nodes.map((node, ordinal) => ({
    nodeId: node.nodeId,
    nodeKind: node.nodeKind,
    label: node.label,
    lodTier: ordinal < limits.labelNodeBudget ? 'label' : 'point',
    labelVisible: ordinal < limits.labelNodeBudget,
    position: positionByNode.get(node.nodeId),
  }));
  const sourceRevision = compositeSourceRevision(graph);
  const planBase = {
    schemaVersion: ATLAS_GLOBAL_COMPOSITE_LOD_PLAN_SCHEMA_VERSION,
    projectId: normalizeString(graph.projectId),
    sourceRevision,
    stableSeed: seed,
    limits,
    nodes: planNodes,
    edges,
    summary: {
      sourceNodeCount: allNodes.length,
      sourceEdgeCount: allEdges.length,
      plannedNodeCount: planNodes.length,
      plannedEdgeCount: edges.length,
      omittedNodeCount: Math.max(0, allNodes.length - planNodes.length),
      omittedEdgeCount: Math.max(0, allEdges.length - edges.length),
      stablePositionCount: positions.length,
      renderAllNodes: allNodes.length > 0 && planNodes.length >= allNodes.length,
      renderAllEdges: allEdges.length > 0 && edges.length >= allEdges.length,
    },
    authority: {
      sourceOfTruth: 'derived.atlas.globalCompositeGraph.v1',
      layoutTruth: 'computed',
      persistentLayoutTruth: false,
      projectTruthMutation: false,
      storageMutation: false,
      networkMutation: false,
      rendererMutation: false,
    },
  };
  const resourceBudgetProof = buildAtlasGlobalCompositeGraphResourceBudgetProof({
    graph,
    lodPlan: planBase,
    limits,
    sourceRevision,
  });
  return {
    ...planBase,
    resourceBudgetProof,
    meta: {
      lodPlanHash: hashCanonicalValue({
        ...planBase,
        resourceBudgetProofHash: resourceBudgetProof.meta.resourceBudgetProofHash,
      }),
    },
  };
}
