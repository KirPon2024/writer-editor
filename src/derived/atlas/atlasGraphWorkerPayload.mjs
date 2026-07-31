import { hashCanonicalValue } from '../deriveView.mjs';
import {
  ATLAS_GLOBAL_COMPOSITE_LOD_PLAN_SCHEMA_VERSION,
  ATLAS_GLOBAL_COMPOSITE_RESOURCE_BUDGET_PROOF_SCHEMA_VERSION,
  ATLAS_GLOBAL_COMPOSITE_STABLE_POSITION_SCHEMA_VERSION,
  sortAtlasGlobalCompositeEdges,
  sortAtlasGlobalCompositeNodes,
} from './atlasGlobalCompositeGraphTypes.mjs';

export const ATLAS_GRAPH_WORKER_PORT_SCHEMA_VERSION = 'atlas.graphWorker.executionPort.v1';
export const ATLAS_GRAPH_WORKER_PAYLOAD_SCHEMA_VERSION = 'atlas.graphWorker.payload.v1';
export const ATLAS_GRAPH_WORKER_RESULT_SCHEMA_VERSION = 'atlas.graphWorker.result.v1';
export const ATLAS_GRAPH_WORKER_SPATIAL_INDEX_SCHEMA_VERSION = 'atlas.graphWorker.spatialIndex.v1';
export const ATLAS_GRAPH_WORKER_PERF_REPORT_SCHEMA_VERSION = 'atlas.graphWorker.perfReport.v1';
export const ATLAS_GRAPH_WORKER_ADAPTER_KIND = 'node-worker-thread-atlas-graph-layout-v1';
export const ATLAS_GRAPH_WORKER_SYNC_FALLBACK_KIND = 'sync-fallback-after-worker-failure';

const WORKER_OP = 'derived.atlas.graphWorker';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePositiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) return fallback;
  return Math.min(number, max);
}

function normalizeLimits(value = {}) {
  const input = isPlainObject(value) ? value : {};
  return {
    maxNodes: normalizePositiveInteger(input.maxNodes, 640, 50_000),
    maxEdges: normalizePositiveInteger(input.maxEdges, 960, 100_000),
    labelNodeBudget: normalizePositiveInteger(input.labelNodeBudget, 160, 20_000),
    spatialCellSize: normalizePositiveInteger(input.spatialCellSize, 96, 4096),
  };
}

function typedError(code, reason, details = {}) {
  const error = {
    code,
    op: WORKER_OP,
    reason,
  };
  if (isPlainObject(details) && Object.keys(details).length > 0) {
    error.details = JSON.parse(JSON.stringify(details));
  }
  return { ok: false, error };
}

function cloneStringArray(values) {
  return (Array.isArray(values) ? values : []).map((value) => normalizeString(value));
}

function isTypedArray(value, Type) {
  return value instanceof Type && value.buffer instanceof ArrayBuffer;
}

function cloneTypedArray(value, Type) {
  if (!isTypedArray(value, Type)) return new Type();
  try {
    return new Type(value);
  } catch {
    return new Type();
  }
}

function monotonicNow() {
  const now = globalThis.performance?.now?.();
  return Number.isFinite(now) ? now : 0;
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
    sourceRefs: Array.isArray(source.sourceRefs) ? source.sourceRefs : [],
  });
}

function sourceRefCount(item = {}) {
  return Array.isArray(item.sourceRefIds) ? Math.min(item.sourceRefIds.length, 65_535) : 0;
}

function nodeScore(nodeKind, refCount) {
  return Number(refCount || 0) * 10 + (normalizeString(nodeKind) === 'originRef' ? 1 : 0);
}

function truncateLabel(value) {
  const text = normalizeString(value);
  return text.length > 96 ? text.slice(0, 96) : text;
}

function hexSliceToUnit(hash, start) {
  const segment = hash.slice(start, start + 8) || '0';
  return Number.parseInt(segment, 16) / 0xffffffff;
}

function stablePositionForNode(nodeId, nodeKind, seed, ordinal) {
  const positionHash = hashCanonicalValue({
    seed,
    nodeId: normalizeString(nodeId),
    nodeKind: normalizeString(nodeKind),
  });
  const ring = Math.floor(ordinal / 64);
  const radius = 160 + ring * 52 + Math.floor(hexSliceToUnit(positionHash, 0) * 24);
  const angle = hexSliceToUnit(positionHash, 8) * Math.PI * 2;
  return {
    schemaVersion: ATLAS_GLOBAL_COMPOSITE_STABLE_POSITION_SCHEMA_VERSION,
    nodeId: normalizeString(nodeId),
    x: Math.round(Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius),
    positionHash,
  };
}

function buildSpatialIndex(nodes, cellSize, sourceRevision) {
  const buckets = new Map();
  for (const node of nodes) {
    const x = Number(node.position?.x || 0);
    const y = Number(node.position?.y || 0);
    const cellX = Math.floor(x / cellSize);
    const cellY = Math.floor(y / cellSize);
    const key = `${cellX}:${cellY}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const cells = [...buckets.entries()]
    .map(([cellId, count]) => ({ cellId, count }))
    .sort((a, b) => a.cellId.localeCompare(b.cellId, 'en', { sensitivity: 'variant' }));
  return {
    schemaVersion: ATLAS_GRAPH_WORKER_SPATIAL_INDEX_SCHEMA_VERSION,
    sourceRevision,
    cellSize,
    nodeCount: nodes.length,
    cellCount: cells.length,
    maxBucketSize: cells.reduce((max, cell) => Math.max(max, cell.count), 0),
    indexHash: hashCanonicalValue({ sourceRevision, cellSize, cells }),
  };
}

function makeRequestId({ projectId, sourceRevision, generation, limits, sourceNodeCount, sourceEdgeCount }) {
  return `atlas-graph-worker:${hashCanonicalValue({
    projectId,
    sourceRevision,
    generation,
    limits,
    sourceNodeCount,
    sourceEdgeCount,
  })}`;
}

export function buildAtlasGraphWorkerPayload(input = {}) {
  const graph = isPlainObject(input.graph) ? input.graph : {};
  const projectId = normalizeString(input.projectId || graph.projectId);
  if (!projectId) return typedError('E_ATLAS_GRAPH_WORKER_PROJECT_ID_REQUIRED', 'PROJECT_ID_REQUIRED');
  if (!Array.isArray(graph.nodes)) return typedError('E_ATLAS_GRAPH_WORKER_NODES_REQUIRED', 'GRAPH_NODES_REQUIRED');
  if (!Array.isArray(graph.edges)) return typedError('E_ATLAS_GRAPH_WORKER_EDGES_REQUIRED', 'GRAPH_EDGES_REQUIRED');

  const limits = normalizeLimits(input.limits);
  const sourceRevision = normalizeString(input.sourceRevision) || compositeSourceRevision(graph);
  const generation = normalizePositiveInteger(input.generation || input.sequence, 1);
  const sortedNodes = sortAtlasGlobalCompositeNodes(graph.nodes);
  const sortedEdges = sortAtlasGlobalCompositeEdges(graph.edges);
  const nodeIds = sortedNodes.map((node) => normalizeString(node.nodeId));
  const nodeKinds = sortedNodes.map((node) => normalizeString(node.nodeKind));
  const labels = sortedNodes.map((node) => truncateLabel(node.label));
  const sourceRefCounts = new Uint16Array(sortedNodes.length);
  const scoreHints = new Uint32Array(sortedNodes.length);
  const nodeIndexById = new Map();
  for (let index = 0; index < sortedNodes.length; index += 1) {
    const refs = sourceRefCount(sortedNodes[index]);
    sourceRefCounts[index] = refs;
    scoreHints[index] = nodeScore(nodeKinds[index], refs);
    nodeIndexById.set(nodeIds[index], index);
  }

  const encodedEdges = [];
  for (const edge of sortedEdges) {
    const fromIndex = nodeIndexById.get(normalizeString(edge.fromNodeId));
    const toIndex = nodeIndexById.get(normalizeString(edge.toNodeId));
    if (!Number.isSafeInteger(fromIndex) || !Number.isSafeInteger(toIndex)) continue;
    encodedEdges.push({ edge, fromIndex, toIndex });
  }
  const edgeIds = encodedEdges.map((item) => normalizeString(item.edge.edgeId));
  const edgeKinds = encodedEdges.map((item) => normalizeString(item.edge.edgeKind));
  const edgeFromIndexes = new Uint32Array(encodedEdges.map((item) => item.fromIndex));
  const edgeToIndexes = new Uint32Array(encodedEdges.map((item) => item.toIndex));
  const transferableByteLength = sourceRefCounts.byteLength
    + scoreHints.byteLength
    + edgeFromIndexes.byteLength
    + edgeToIndexes.byteLength;
  const requestId = makeRequestId({
    projectId,
    sourceRevision,
    generation,
    limits,
    sourceNodeCount: sortedNodes.length,
    sourceEdgeCount: sortedEdges.length,
  });

  return {
    ok: true,
    value: {
      schemaVersion: ATLAS_GRAPH_WORKER_PAYLOAD_SCHEMA_VERSION,
      portSchemaVersion: ATLAS_GRAPH_WORKER_PORT_SCHEMA_VERSION,
      adapterKind: ATLAS_GRAPH_WORKER_ADAPTER_KIND,
      requestId,
      projectId,
      sourceRevision,
      generation,
      limits,
      nodeIds,
      nodeKinds,
      labels,
      sourceRefCounts,
      scoreHints,
      edgeIds,
      edgeKinds,
      edgeFromIndexes,
      edgeToIndexes,
      inputSummary: {
        sourceNodeCount: sortedNodes.length,
        sourceEdgeCount: sortedEdges.length,
        encodedEdgeCount: encodedEdges.length,
        coreStateIncluded: false,
        fullGraphIncluded: false,
        nodeObjectCloneIncluded: false,
        edgeObjectCloneIncluded: false,
      },
      transfer: {
        usesTransferableArrayBuffers: true,
        transferableBufferCount: 4,
        transferableByteLength,
      },
    },
  };
}

export function getAtlasGraphWorkerTransferList(payload = {}) {
  if (!isPlainObject(payload) || payload.schemaVersion !== ATLAS_GRAPH_WORKER_PAYLOAD_SCHEMA_VERSION) return [];
  return [
    payload.sourceRefCounts?.buffer,
    payload.scoreHints?.buffer,
    payload.edgeFromIndexes?.buffer,
    payload.edgeToIndexes?.buffer,
  ].filter((buffer) => buffer instanceof ArrayBuffer && buffer.byteLength > 0);
}

export function cloneAtlasGraphWorkerPayloadForFallback(payload = {}) {
  if (!isPlainObject(payload)) return {};
  return {
    ...payload,
    limits: isPlainObject(payload.limits) ? { ...payload.limits } : {},
    nodeIds: cloneStringArray(payload.nodeIds),
    nodeKinds: cloneStringArray(payload.nodeKinds),
    labels: cloneStringArray(payload.labels),
    edgeIds: cloneStringArray(payload.edgeIds),
    edgeKinds: cloneStringArray(payload.edgeKinds),
    sourceRefCounts: cloneTypedArray(payload.sourceRefCounts, Uint16Array),
    scoreHints: cloneTypedArray(payload.scoreHints, Uint32Array),
    edgeFromIndexes: cloneTypedArray(payload.edgeFromIndexes, Uint32Array),
    edgeToIndexes: cloneTypedArray(payload.edgeToIndexes, Uint32Array),
    inputSummary: isPlainObject(payload.inputSummary) ? { ...payload.inputSummary } : {},
    transfer: isPlainObject(payload.transfer) ? { ...payload.transfer } : {},
  };
}

export function coalesceAtlasGraphWorkerPayloads(payloads, options = {}) {
  const maxQueueSize = normalizePositiveInteger(options.maxQueueSize, 4);
  const latestByProject = new Map();
  for (const payload of Array.isArray(payloads) ? payloads : []) {
    if (!isPlainObject(payload) || payload.schemaVersion !== ATLAS_GRAPH_WORKER_PAYLOAD_SCHEMA_VERSION) continue;
    const existing = latestByProject.get(payload.projectId);
    if (!existing || normalizePositiveInteger(payload.generation, 1) >= normalizePositiveInteger(existing.generation, 1)) {
      latestByProject.set(payload.projectId, cloneAtlasGraphWorkerPayloadForFallback(payload));
    }
  }
  const queue = [...latestByProject.values()]
    .sort((a, b) => {
      if (normalizePositiveInteger(a.generation, 1) !== normalizePositiveInteger(b.generation, 1)) {
        return normalizePositiveInteger(a.generation, 1) - normalizePositiveInteger(b.generation, 1);
      }
      return normalizeString(a.projectId).localeCompare(normalizeString(b.projectId), 'en', { sensitivity: 'variant' });
    })
    .slice(-maxQueueSize);
  return {
    ok: true,
    value: {
      schemaVersion: ATLAS_GRAPH_WORKER_PORT_SCHEMA_VERSION,
      queue,
      maxQueueSize,
      discardedCount: Math.max(0, latestByProject.size - queue.length),
    },
  };
}

export function runAtlasGraphWorkerPayload(payload = {}, runtime = {}) {
  if (!isPlainObject(payload) || payload.schemaVersion !== ATLAS_GRAPH_WORKER_PAYLOAD_SCHEMA_VERSION) {
    return typedError('E_ATLAS_GRAPH_WORKER_PAYLOAD_INVALID', 'PAYLOAD_INVALID');
  }
  const nodeIds = cloneStringArray(payload.nodeIds);
  const nodeKinds = cloneStringArray(payload.nodeKinds);
  const labels = cloneStringArray(payload.labels);
  const edgeIds = cloneStringArray(payload.edgeIds);
  const edgeKinds = cloneStringArray(payload.edgeKinds);
  const sourceRefCounts = payload.sourceRefCounts;
  const scoreHints = payload.scoreHints;
  const edgeFromIndexes = payload.edgeFromIndexes;
  const edgeToIndexes = payload.edgeToIndexes;
  if (!isTypedArray(sourceRefCounts, Uint16Array) || !isTypedArray(scoreHints, Uint32Array)) {
    return typedError('E_ATLAS_GRAPH_WORKER_PAYLOAD_INVALID', 'NODE_TYPED_ARRAYS_REQUIRED');
  }
  if (!isTypedArray(edgeFromIndexes, Uint32Array) || !isTypedArray(edgeToIndexes, Uint32Array)) {
    return typedError('E_ATLAS_GRAPH_WORKER_PAYLOAD_INVALID', 'EDGE_TYPED_ARRAYS_REQUIRED');
  }
  if (nodeIds.length !== sourceRefCounts.length || nodeIds.length !== scoreHints.length || nodeIds.length !== nodeKinds.length) {
    return typedError('E_ATLAS_GRAPH_WORKER_PAYLOAD_INVALID', 'NODE_ARRAY_LENGTH_MISMATCH');
  }
  if (edgeIds.length !== edgeFromIndexes.length || edgeIds.length !== edgeToIndexes.length || edgeIds.length !== edgeKinds.length) {
    return typedError('E_ATLAS_GRAPH_WORKER_PAYLOAD_INVALID', 'EDGE_ARRAY_LENGTH_MISMATCH');
  }

  const startedAt = monotonicNow();
  const limits = normalizeLimits(payload.limits);
  const sourceRevision = normalizeString(payload.sourceRevision);
  const stableSeed = hashCanonicalValue({
    sourceRevision,
    sourceNodeCount: nodeIds.length,
    sourceEdgeCount: Number(payload.inputSummary?.sourceEdgeCount || edgeIds.length),
  });
  const selectedIndexes = nodeIds
    .map((nodeId, index) => ({
      nodeId,
      index,
      score: Number(scoreHints[index] || 0),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .slice(0, limits.maxNodes)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.index);
  const selected = new Set(selectedIndexes);
  const nodes = selectedIndexes.map((index, ordinal) => {
    const nodeId = nodeIds[index];
    const nodeKind = nodeKinds[index];
    return {
      nodeId,
      nodeKind,
      label: labels[index] || nodeId,
      lodTier: ordinal < limits.labelNodeBudget ? 'label' : 'point',
      labelVisible: ordinal < limits.labelNodeBudget,
      sourceRefCount: Number(sourceRefCounts[index] || 0),
      position: stablePositionForNode(nodeId, nodeKind, stableSeed, ordinal),
    };
  });
  const edges = [];
  for (let index = 0; index < edgeIds.length && edges.length < limits.maxEdges; index += 1) {
    const fromIndex = Number(edgeFromIndexes[index]);
    const toIndex = Number(edgeToIndexes[index]);
    if (!selected.has(fromIndex) || !selected.has(toIndex)) continue;
    edges.push({
      edgeId: edgeIds[index],
      edgeKind: edgeKinds[index],
      fromNodeId: nodeIds[fromIndex],
      toNodeId: nodeIds[toIndex],
    });
  }
  const sourceNodeCount = Number(payload.inputSummary?.sourceNodeCount || nodeIds.length);
  const sourceEdgeCount = Number(payload.inputSummary?.sourceEdgeCount || edgeIds.length);
  const resourceBudgetProof = {
    schemaVersion: ATLAS_GLOBAL_COMPOSITE_RESOURCE_BUDGET_PROOF_SCHEMA_VERSION,
    projectId: normalizeString(payload.projectId),
    sourceRevision,
    limits,
    input: {
      nodes: sourceNodeCount,
      edges: sourceEdgeCount,
    },
    planned: {
      nodes: nodes.length,
      edges: edges.length,
    },
    omitted: {
      nodes: Math.max(0, sourceNodeCount - nodes.length),
      edges: Math.max(0, sourceEdgeCount - edges.length),
    },
    withinBudget: {
      nodes: nodes.length <= limits.maxNodes,
      edges: edges.length <= limits.maxEdges,
    },
    renderAll: {
      nodes: sourceNodeCount > 0 && nodes.length >= sourceNodeCount,
      edges: sourceEdgeCount > 0 && edges.length >= sourceEdgeCount,
    },
  };
  resourceBudgetProof.meta = {
    resourceBudgetProofHash: hashCanonicalValue(resourceBudgetProof),
  };
  const spatialIndex = buildSpatialIndex(nodes, limits.spatialCellSize, sourceRevision);
  const lodPlan = {
    schemaVersion: ATLAS_GLOBAL_COMPOSITE_LOD_PLAN_SCHEMA_VERSION,
    projectId: normalizeString(payload.projectId),
    sourceRevision,
    stableSeed,
    limits,
    nodes,
    edges,
    spatialIndex,
    summary: {
      sourceNodeCount,
      sourceEdgeCount,
      plannedNodeCount: nodes.length,
      plannedEdgeCount: edges.length,
      omittedNodeCount: Math.max(0, sourceNodeCount - nodes.length),
      omittedEdgeCount: Math.max(0, sourceEdgeCount - edges.length),
      stablePositionCount: nodes.length,
      spatialIndexCellCount: spatialIndex.cellCount,
      renderAllNodes: sourceNodeCount > 0 && nodes.length >= sourceNodeCount,
      renderAllEdges: sourceEdgeCount > 0 && edges.length >= sourceEdgeCount,
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
    resourceBudgetProof,
  };
  lodPlan.meta = {
    lodPlanHash: hashCanonicalValue({
      schemaVersion: lodPlan.schemaVersion,
      projectId: lodPlan.projectId,
      sourceRevision: lodPlan.sourceRevision,
      stableSeed: lodPlan.stableSeed,
      limits: lodPlan.limits,
      nodes: lodPlan.nodes,
      edges: lodPlan.edges,
      spatialIndexHash: spatialIndex.indexHash,
      resourceBudgetProofHash: resourceBudgetProof.meta.resourceBudgetProofHash,
    }),
  };
  const workerComputeMs = Math.max(0, monotonicNow() - startedAt);
  const result = {
    schemaVersion: ATLAS_GRAPH_WORKER_RESULT_SCHEMA_VERSION,
    ok: true,
    requestId: normalizeString(payload.requestId),
    projectId: normalizeString(payload.projectId),
    sourceRevision,
    generation: normalizePositiveInteger(payload.generation, 1),
    adapterKind: normalizeString(runtime.adapterKind) || ATLAS_GRAPH_WORKER_ADAPTER_KIND,
    executionMode: normalizeString(runtime.executionMode) || 'worker-payload',
    workerThreadId: Number.isSafeInteger(Number(runtime.workerThreadId)) ? Number(runtime.workerThreadId) : 0,
    lodPlan,
    spatialIndex,
    transfer: {
      usesTransferableArrayBuffers: payload.transfer?.usesTransferableArrayBuffers === true,
      transferableByteLength: Number(payload.transfer?.transferableByteLength || 0),
      fullGraphIncluded: payload.inputSummary?.fullGraphIncluded === true,
      coreStateIncluded: payload.inputSummary?.coreStateIncluded === true,
    },
    metrics: {
      workerComputeMs,
      inputNodes: sourceNodeCount,
      inputEdges: sourceEdgeCount,
      plannedNodes: nodes.length,
      plannedEdges: edges.length,
      spatialIndexCells: spatialIndex.cellCount,
      elementCountOnlyProof: false,
    },
  };
  return {
    ok: true,
    value: {
      ...result,
      resultHash: hashCanonicalValue(result),
    },
  };
}

export function acceptAtlasGraphWorkerResult(input = {}) {
  const activePayload = isPlainObject(input.activePayload) ? input.activePayload : {};
  const result = isPlainObject(input.result) ? input.result : {};
  if (activePayload.schemaVersion !== ATLAS_GRAPH_WORKER_PAYLOAD_SCHEMA_VERSION) {
    return typedError('E_ATLAS_GRAPH_WORKER_ACTIVE_PAYLOAD_INVALID', 'ACTIVE_PAYLOAD_INVALID');
  }
  if (result.schemaVersion !== ATLAS_GRAPH_WORKER_RESULT_SCHEMA_VERSION) {
    return typedError('E_ATLAS_GRAPH_WORKER_RESULT_INVALID', 'RESULT_INVALID');
  }
  if (result.ok !== true) {
    return typedError('E_ATLAS_GRAPH_WORKER_RESULT_FAILED', 'RESULT_FAILED', { workerError: result.error || null });
  }
  const mismatches = [];
  for (const key of ['requestId', 'projectId', 'sourceRevision']) {
    if (normalizeString(result[key]) !== normalizeString(activePayload[key])) mismatches.push(key);
  }
  if (normalizePositiveInteger(result.generation, 1) !== normalizePositiveInteger(activePayload.generation, 1)) {
    mismatches.push('generation');
  }
  if (mismatches.length > 0) {
    return typedError('E_ATLAS_GRAPH_WORKER_STALE_RESULT', 'STALE_RESULT_IDENTITY_MISMATCH', { mismatches });
  }
  const currentSourceRevision = normalizeString(input.currentSourceRevision);
  if (!currentSourceRevision) return typedError('E_ATLAS_GRAPH_WORKER_CURRENT_REVISION_REQUIRED', 'CURRENT_SOURCE_REVISION_REQUIRED');
  if (currentSourceRevision !== normalizeString(activePayload.sourceRevision)) {
    return typedError('E_ATLAS_GRAPH_WORKER_STALE_RESULT', 'STALE_RESULT_SOURCE_REVISION', {
      expected: activePayload.sourceRevision,
      actual: currentSourceRevision,
    });
  }
  if (!isPlainObject(result.spatialIndex) || result.spatialIndex.schemaVersion !== ATLAS_GRAPH_WORKER_SPATIAL_INDEX_SCHEMA_VERSION) {
    return typedError('E_ATLAS_GRAPH_WORKER_SPATIAL_INDEX_INVALID', 'SPATIAL_INDEX_INVALID');
  }
  const proof = result.lodPlan?.resourceBudgetProof;
  if (!isPlainObject(proof) || proof.schemaVersion !== ATLAS_GLOBAL_COMPOSITE_RESOURCE_BUDGET_PROOF_SCHEMA_VERSION) {
    return typedError('E_ATLAS_GRAPH_WORKER_BUDGET_PROOF_INVALID', 'BUDGET_PROOF_INVALID');
  }
  if (proof.withinBudget?.nodes !== true || proof.withinBudget?.edges !== true) {
    return typedError('E_ATLAS_GRAPH_WORKER_BUDGET_EXCEEDED', 'BUDGET_EXCEEDED');
  }
  return {
    ok: true,
    value: {
      accepted: true,
      requestId: result.requestId,
      projectId: result.projectId,
      sourceRevision: result.sourceRevision,
      generation: result.generation,
      adapterKind: result.adapterKind,
      executionMode: result.executionMode,
      published: {
        schemaVersion: result.lodPlan?.schemaVersion || '',
        lodPlanHash: result.lodPlan?.meta?.lodPlanHash || '',
        spatialIndexHash: result.spatialIndex.indexHash,
        resourceBudgetProofHash: proof.meta?.resourceBudgetProofHash || '',
        persistentDerivedTruth: false,
        projectTruthMutation: false,
        storageMutation: false,
        rendererMutation: false,
      },
    },
  };
}
