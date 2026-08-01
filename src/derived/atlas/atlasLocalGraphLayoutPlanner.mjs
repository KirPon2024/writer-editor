import { hashCanonicalValue } from '../deriveView.mjs';
import {
  ATLAS_LOCAL_GRAPH_LAYOUT_JOB_SCHEMA_VERSION,
  ATLAS_LOCAL_GRAPH_LAYOUT_PLAN_SCHEMA_VERSION,
  ATLAS_LOCAL_GRAPH_LAYOUT_RESULT_SCHEMA_VERSION,
  ATLAS_LOCAL_GRAPH_RESOURCE_BUDGET_PROOF_SCHEMA_VERSION,
  ATLAS_LOCAL_GRAPH_SCHEMA_VERSION,
} from './atlasLocalGraphTypes.mjs';
import {
  buildDerivedGenerationPublishedEvent,
  buildDerivedGenerationRejectedAsStaleEvent,
  hashCoreDomainEvents,
} from '../../core/domainEvents.mjs';

const LAYOUT_OP = 'derived.atlas.localGraphLayoutPlanner';
const LAYOUT_ADAPTER_KIND = 'local-pure-derived-planner';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizePositiveInteger(value, fallback, max = 200_000) {
  const number = Math.floor(normalizeNumber(value, fallback));
  if (number < 1) return fallback;
  return Math.min(max, number);
}

function plannerError(code, reason, details = {}) {
  const error = {
    code,
    op: LAYOUT_OP,
    reason,
  };
  if (isPlainObject(details) && Object.keys(details).length > 0) error.details = cloneJson(details);
  return { ok: false, error };
}

function normalizeLimits(value = {}) {
  const input = isPlainObject(value) ? value : {};
  return {
    maxNodes: normalizePositiveInteger(input.maxNodes, 500, 100_000),
    maxEdges: normalizePositiveInteger(input.maxEdges, 750, 200_000),
    maxClusters: normalizePositiveInteger(input.maxClusters, 64, 10_000),
    clusterColumnSize: normalizePositiveInteger(input.clusterColumnSize, 24, 1_000),
    nodeGapPx: normalizePositiveInteger(input.nodeGapPx, 42, 1_000),
    clusterGapPx: normalizePositiveInteger(input.clusterGapPx, 280, 10_000),
  };
}

function graphSourceRevision(graph = {}) {
  const source = isPlainObject(graph) ? graph : {};
  const graphHash = normalizeText(source.summary?.graphHash);
  if (graphHash) return graphHash;
  return hashCanonicalValue({
    schemaVersion: normalizeText(source.schemaVersion),
    projectId: normalizeText(source.projectId),
    nodes: Array.isArray(source.nodes) ? source.nodes : [],
    edges: Array.isArray(source.edges) ? source.edges : [],
    clusters: Array.isArray(source.clusters) ? source.clusters : [],
  });
}

function buildJobIdentity({ graph, sourceRevision, sequence, layoutKind, limits }) {
  const projectId = normalizeText(graph.projectId);
  const generation = normalizePositiveInteger(sequence, 1, 1_000_000_000);
  const revision = normalizeText(sourceRevision) || graphSourceRevision(graph);
  const requestHash = hashCanonicalValue({
    projectId,
    sourceRevision: revision,
    generation,
    layoutKind,
    limits,
  });
  return {
    projectId,
    sourceRevision: revision,
    generation,
    requestId: `atlas-local-graph-layout-request:${requestHash}`,
  };
}

function compareByPriority(a, b) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  if (Number(b.degree) !== Number(a.degree)) return Number(b.degree) - Number(a.degree);
  if (Number(b.appearanceCount) !== Number(a.appearanceCount)) return Number(b.appearanceCount) - Number(a.appearanceCount);
  return normalizeText(a.nodeId).localeCompare(normalizeText(b.nodeId), 'en', { sensitivity: 'variant' });
}

function buildDegreeLookup(edges) {
  const degree = new Map();
  for (const edge of Array.isArray(edges) ? edges : []) {
    const left = normalizeText(edge.leftNodeId);
    const right = normalizeText(edge.rightNodeId);
    if (left) degree.set(left, (degree.get(left) || 0) + 1);
    if (right) degree.set(right, (degree.get(right) || 0) + 1);
  }
  return degree;
}

function normalizeFocusSet(value) {
  return new Set((Array.isArray(value) ? value : [])
    .map((item) => normalizeText(item))
    .filter(Boolean));
}

function positionNode({ node, index, clusterOrdinal, clusterNodeIndex, limits }) {
  const column = clusterNodeIndex % limits.clusterColumnSize;
  const row = Math.floor(clusterNodeIndex / limits.clusterColumnSize);
  return {
    nodeId: node.nodeId,
    entityId: node.entityId,
    clusterOrdinal,
    x: (clusterOrdinal * limits.clusterGapPx) + (column * limits.nodeGapPx),
    y: row * limits.nodeGapPx,
    rank: index,
    pinned: node.pinned,
    degree: node.degree,
  };
}

function buildClusterLookup(clusters) {
  const byNodeId = new Map();
  const normalizedClusters = (Array.isArray(clusters) ? clusters : [])
    .map((cluster, index) => ({
      clusterId: normalizeText(cluster.clusterId) || `atlas-local-cluster:${index}`,
      ordinal: Number.isSafeInteger(Number(cluster.ordinal)) ? Number(cluster.ordinal) : index,
      nodeIds: Array.isArray(cluster.nodeIds) ? cluster.nodeIds.map((nodeId) => normalizeText(nodeId)).filter(Boolean) : [],
      edgeIds: Array.isArray(cluster.edgeIds) ? cluster.edgeIds.map((edgeId) => normalizeText(edgeId)).filter(Boolean) : [],
    }))
    .sort((a, b) => {
      if (a.ordinal !== b.ordinal) return a.ordinal - b.ordinal;
      return a.clusterId.localeCompare(b.clusterId, 'en', { sensitivity: 'variant' });
    });
  for (const cluster of normalizedClusters) {
    for (const nodeId of cluster.nodeIds) byNodeId.set(nodeId, cluster);
  }
  return { clusters: normalizedClusters, byNodeId };
}

export function buildAtlasLocalGraphResourceBudgetProof(input = {}) {
  const graph = isPlainObject(input.graph) ? input.graph : {};
  const layoutPlan = isPlainObject(input.layoutPlan) ? input.layoutPlan : {};
  const limits = normalizeLimits(input.limits || layoutPlan.limits);
  const inputNodes = Array.isArray(graph.nodes) ? graph.nodes.length : 0;
  const inputEdges = Array.isArray(graph.edges) ? graph.edges.length : 0;
  const inputClusters = Array.isArray(graph.clusters) ? graph.clusters.length : 0;
  const plannedNodes = Array.isArray(layoutPlan.nodes) ? layoutPlan.nodes.length : 0;
  const plannedEdges = Array.isArray(layoutPlan.edges) ? layoutPlan.edges.length : 0;
  const plannedClusters = Array.isArray(layoutPlan.clusters) ? layoutPlan.clusters.length : 0;
  const proof = {
    schemaVersion: ATLAS_LOCAL_GRAPH_RESOURCE_BUDGET_PROOF_SCHEMA_VERSION,
    projectId: normalizeText(graph.projectId),
    sourceRevision: normalizeText(input.sourceRevision) || graphSourceRevision(graph),
    limits,
    input: {
      nodes: inputNodes,
      edges: inputEdges,
      clusters: inputClusters,
    },
    planned: {
      nodes: plannedNodes,
      edges: plannedEdges,
      clusters: plannedClusters,
    },
    withinBudget: {
      nodes: plannedNodes <= limits.maxNodes,
      edges: plannedEdges <= limits.maxEdges,
      clusters: plannedClusters <= limits.maxClusters,
    },
    renderAll: {
      nodes: inputNodes > 0 && plannedNodes >= inputNodes,
      edges: inputEdges > 0 && plannedEdges >= inputEdges,
      clusters: inputClusters > 0 && plannedClusters >= inputClusters,
    },
    largeProject: {
      nodeThresholdMet: inputNodes >= 10_000,
      edgeThresholdMet: inputEdges >= 9_999,
    },
  };
  return {
    ...proof,
    meta: {
      resourceBudgetProofHash: hashCanonicalValue(proof),
    },
  };
}

export function createAtlasLocalGraphLayoutJob(input = {}) {
  const graph = isPlainObject(input.graph) ? input.graph : {};
  const projectId = normalizeText(graph.projectId);
  if (!projectId) return plannerError('E_ATLAS_LOCAL_GRAPH_LAYOUT_PROJECT_ID_REQUIRED', 'PROJECT_ID_REQUIRED');
  if (graph.schemaVersion !== ATLAS_LOCAL_GRAPH_SCHEMA_VERSION) {
    return plannerError('E_ATLAS_LOCAL_GRAPH_INVALID', 'LOCAL_GRAPH_SCHEMA_INVALID', { projectId });
  }
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !Array.isArray(graph.clusters)) {
    return plannerError('E_ATLAS_LOCAL_GRAPH_INVALID', 'LOCAL_GRAPH_PACKET_INVALID', { projectId });
  }
  const limits = normalizeLimits(input.limits);
  const layoutKind = normalizeText(input.layoutKind) || 'cluster-grid';
  const identity = buildJobIdentity({
    graph,
    sourceRevision: input.sourceRevision,
    sequence: input.sequence,
    layoutKind,
    limits,
  });
  return {
    ok: true,
    value: {
      schemaVersion: ATLAS_LOCAL_GRAPH_LAYOUT_JOB_SCHEMA_VERSION,
      ...identity,
      layoutKind,
      limits,
      adapter: {
        kind: LAYOUT_ADAPTER_KIND,
        authority: {
          filesystem: false,
          network: false,
          writer: false,
          projectMutation: false,
          persistentDerivedTruth: false,
          workerScheduling: false,
        },
        cancellation: 'discard-stale-layout-result',
      },
      input: {
        graph: cloneJson(graph),
        focusNodeIds: [...normalizeFocusSet(input.focusNodeIds)].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' })),
      },
    },
  };
}

export function buildAtlasLocalGraphLayoutPlan(input = {}) {
  const graph = isPlainObject(input.graph) ? input.graph : {};
  const limits = normalizeLimits(input.limits);
  const focusNodeIds = normalizeFocusSet(input.focusNodeIds);
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const degree = buildDegreeLookup(edges);
  const { clusters: sourceClusters, byNodeId } = buildClusterLookup(graph.clusters);
  const rankedNodes = (Array.isArray(graph.nodes) ? graph.nodes : [])
    .map((node) => ({
      nodeId: normalizeText(node.nodeId),
      entityId: normalizeText(node.entityId),
      appearanceCount: Number(node.appearanceCount || 0),
      degree: degree.get(normalizeText(node.nodeId)) || 0,
      pinned: focusNodeIds.has(normalizeText(node.nodeId)) || focusNodeIds.has(normalizeText(node.entityId)),
    }))
    .filter((node) => node.nodeId)
    .sort(compareByPriority);
  const plannedNodes = [];
  const clusterNodeCounts = new Map();
  for (const node of rankedNodes.slice(0, limits.maxNodes)) {
    const cluster = byNodeId.get(node.nodeId) || { ordinal: sourceClusters.length, clusterId: 'atlas-local-cluster:unclustered' };
    const clusterOrdinal = Math.min(cluster.ordinal, limits.maxClusters - 1);
    const clusterNodeIndex = clusterNodeCounts.get(clusterOrdinal) || 0;
    clusterNodeCounts.set(clusterOrdinal, clusterNodeIndex + 1);
    plannedNodes.push(positionNode({
      node,
      index: plannedNodes.length,
      clusterOrdinal,
      clusterNodeIndex,
      limits,
    }));
  }
  const plannedNodeIds = new Set(plannedNodes.map((node) => node.nodeId));
  const plannedEdges = edges
    .filter((edge) => plannedNodeIds.has(normalizeText(edge.leftNodeId)) && plannedNodeIds.has(normalizeText(edge.rightNodeId)))
    .sort((a, b) => {
      const weight = Number(b.weight || 0) - Number(a.weight || 0);
      if (weight !== 0) return weight;
      return normalizeText(a.edgeId).localeCompare(normalizeText(b.edgeId), 'en', { sensitivity: 'variant' });
    })
    .slice(0, limits.maxEdges)
    .map((edge) => ({
      edgeId: edge.edgeId,
      leftNodeId: edge.leftNodeId,
      rightNodeId: edge.rightNodeId,
      edgeKind: edge.edgeKind,
      weight: Number(edge.weight || 0),
    }));
  const plannedEdgeIds = new Set(plannedEdges.map((edge) => edge.edgeId));
  const plannedClusters = sourceClusters
    .slice(0, limits.maxClusters)
    .map((cluster) => ({
      clusterId: cluster.clusterId,
      ordinal: cluster.ordinal,
      plannedNodeCount: cluster.nodeIds.filter((nodeId) => plannedNodeIds.has(nodeId)).length,
      plannedEdgeCount: cluster.edgeIds.filter((edgeId) => plannedEdgeIds.has(edgeId)).length,
      x: cluster.ordinal * limits.clusterGapPx,
      y: 0,
    }))
    .filter((cluster) => cluster.plannedNodeCount > 0);
  const plan = {
    schemaVersion: ATLAS_LOCAL_GRAPH_LAYOUT_PLAN_SCHEMA_VERSION,
    sourceSchemaVersion: normalizeText(graph.schemaVersion),
    projectId: normalizeText(graph.projectId),
    sourceRevision: normalizeText(input.sourceRevision) || graphSourceRevision(graph),
    layoutKind: normalizeText(input.layoutKind) || 'cluster-grid',
    limits,
    nodes: plannedNodes,
    edges: plannedEdges,
    clusters: plannedClusters,
    omitted: {
      nodes: Math.max(0, rankedNodes.length - plannedNodes.length),
      edges: Math.max(0, edges.length - plannedEdges.length),
      clusters: Math.max(0, sourceClusters.length - plannedClusters.length),
    },
  };
  return {
    ...plan,
    meta: {
      layoutPlanHash: hashCanonicalValue(plan),
    },
  };
}

export function runAtlasLocalGraphLayoutJob(job = {}) {
  if (!isPlainObject(job) || job.schemaVersion !== ATLAS_LOCAL_GRAPH_LAYOUT_JOB_SCHEMA_VERSION) {
    return plannerError('E_ATLAS_LOCAL_GRAPH_LAYOUT_JOB_INVALID', 'JOB_INVALID');
  }
  const graph = isPlainObject(job.input?.graph) ? job.input.graph : {};
  const layoutPlan = buildAtlasLocalGraphLayoutPlan({
    graph,
    limits: job.limits,
    focusNodeIds: job.input?.focusNodeIds,
    sourceRevision: job.sourceRevision,
    layoutKind: job.layoutKind,
  });
  const proof = buildAtlasLocalGraphResourceBudgetProof({
    graph,
    layoutPlan,
    limits: job.limits,
    sourceRevision: job.sourceRevision,
  });
  const result = {
    schemaVersion: ATLAS_LOCAL_GRAPH_LAYOUT_RESULT_SCHEMA_VERSION,
    requestId: normalizeText(job.requestId),
    projectId: normalizeText(job.projectId),
    sourceRevision: normalizeText(job.sourceRevision),
    generation: normalizePositiveInteger(job.generation, 1, 1_000_000_000),
    ok: true,
    layoutPlan,
    resourceBudgetProof: proof,
  };
  return {
    ok: true,
    value: {
      ...result,
      resultHash: hashCanonicalValue(result),
    },
  };
}

export function acceptAtlasLocalGraphLayoutResult(input = {}) {
  const activeJob = isPlainObject(input.activeJob) ? input.activeJob : {};
  const result = isPlainObject(input.result) ? input.result : {};
  if (activeJob.schemaVersion !== ATLAS_LOCAL_GRAPH_LAYOUT_JOB_SCHEMA_VERSION) {
    return plannerError('E_ATLAS_LOCAL_GRAPH_LAYOUT_ACTIVE_JOB_INVALID', 'ACTIVE_JOB_INVALID');
  }
  if (result.schemaVersion !== ATLAS_LOCAL_GRAPH_LAYOUT_RESULT_SCHEMA_VERSION) {
    return plannerError('E_ATLAS_LOCAL_GRAPH_LAYOUT_RESULT_INVALID', 'RESULT_INVALID');
  }
  if (result.ok !== true) return plannerError('E_ATLAS_LOCAL_GRAPH_LAYOUT_RESULT_FAILED', 'RESULT_FAILED');
  const mismatches = [];
  for (const key of ['requestId', 'projectId', 'sourceRevision']) {
    if (normalizeText(result[key]) !== normalizeText(activeJob[key])) mismatches.push(key);
  }
  if (normalizePositiveInteger(result.generation, 1, 1_000_000_000) !== normalizePositiveInteger(activeJob.generation, 1, 1_000_000_000)) {
    mismatches.push('generation');
  }
  if (mismatches.length > 0) {
    const events = [
      buildDerivedGenerationRejectedAsStaleEvent({
        projectId: normalizeText(activeJob.projectId),
        generationId: normalizeText(result.requestId) || normalizeText(activeJob.requestId),
        projectionKind: 'atlas.localGraphLayout',
        sourceRevision: normalizePositiveInteger(activeJob.generation, 0, 1_000_000_000),
        currentRevision: normalizePositiveInteger(result.generation, normalizePositiveInteger(activeJob.generation, 0, 1_000_000_000), 1_000_000_000),
        commandSeq: normalizePositiveInteger(activeJob.generation, 0, 1_000_000_000),
        previousStateHash: normalizeText(activeJob.sourceRevision),
        nextStateHash: normalizeText(result.sourceRevision),
      }),
    ];
    return {
      ...plannerError('E_ATLAS_LOCAL_GRAPH_STALE_LAYOUT_RESULT', 'STALE_LAYOUT_RESULT_IDENTITY_MISMATCH', { mismatches }),
      events,
      domainEventDigest: hashCoreDomainEvents(events),
    };
  }
  const currentGraph = isPlainObject(input.currentGraph) ? input.currentGraph : {};
  const currentSourceRevision = graphSourceRevision(currentGraph);
  if (currentSourceRevision !== normalizeText(activeJob.sourceRevision)) {
    const events = [
      buildDerivedGenerationRejectedAsStaleEvent({
        projectId: normalizeText(activeJob.projectId),
        generationId: normalizeText(result.requestId) || normalizeText(activeJob.requestId),
        projectionKind: 'atlas.localGraphLayout',
        sourceRevision: normalizePositiveInteger(activeJob.generation, 0, 1_000_000_000),
        currentRevision: normalizePositiveInteger(activeJob.generation, 0, 1_000_000_000) + 1,
        commandSeq: normalizePositiveInteger(activeJob.generation, 0, 1_000_000_000),
        previousStateHash: normalizeText(activeJob.sourceRevision),
        nextStateHash: currentSourceRevision,
      }),
    ];
    return {
      ...plannerError('E_ATLAS_LOCAL_GRAPH_STALE_LAYOUT_RESULT', 'STALE_LAYOUT_RESULT_SOURCE_REVISION', {
        expected: activeJob.sourceRevision,
        actual: currentSourceRevision,
      }),
      events,
      domainEventDigest: hashCoreDomainEvents(events),
    };
  }
  if (
    !isPlainObject(result.resourceBudgetProof)
    || result.resourceBudgetProof.schemaVersion !== ATLAS_LOCAL_GRAPH_RESOURCE_BUDGET_PROOF_SCHEMA_VERSION
  ) {
    return plannerError('E_ATLAS_LOCAL_GRAPH_RESOURCE_BUDGET_PROOF_INVALID', 'RESOURCE_BUDGET_PROOF_INVALID');
  }
  if (
    result.resourceBudgetProof.withinBudget?.nodes !== true
    || result.resourceBudgetProof.withinBudget?.edges !== true
    || result.resourceBudgetProof.withinBudget?.clusters !== true
  ) {
    return plannerError('E_ATLAS_LOCAL_GRAPH_RESOURCE_BUDGET_EXCEEDED', 'RESOURCE_BUDGET_EXCEEDED');
  }
  const events = [
    buildDerivedGenerationPublishedEvent({
      projectId: result.projectId,
      generationId: result.requestId,
      projectionKind: 'atlas.localGraphLayout',
      sourceRevision: result.generation,
      commandSeq: result.generation,
      previousStateHash: activeJob.sourceRevision,
      nextStateHash: result.sourceRevision,
    }),
  ];
  return {
    ok: true,
    value: {
      accepted: true,
      requestId: result.requestId,
      projectId: result.projectId,
      sourceRevision: result.sourceRevision,
      generation: result.generation,
      published: {
        schemaVersion: result.layoutPlan?.schemaVersion || '',
        layoutPlanHash: result.layoutPlan?.meta?.layoutPlanHash || hashCanonicalValue(result.layoutPlan || {}),
        resourceBudgetProofHash: result.resourceBudgetProof.meta?.resourceBudgetProofHash || hashCanonicalValue(result.resourceBudgetProof),
        persistentDerivedTruth: false,
      },
    },
    events,
    domainEventDigest: hashCoreDomainEvents(events),
  };
}
