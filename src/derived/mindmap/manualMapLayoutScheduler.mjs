import { hashCanonicalValue } from '../deriveView.mjs';
import { buildManualMapViewportPlan } from './manualMapViewportPlanner.mjs';

export const MANUAL_MAP_LAYOUT_JOB_SCHEMA_VERSION = 'manualMap.layoutJob.v1';
export const MANUAL_MAP_LAYOUT_RESULT_SCHEMA_VERSION = 'manualMap.layoutResult.v1';
export const MANUAL_MAP_RESOURCE_BUDGET_PROOF_SCHEMA_VERSION = 'manualMap.resourceBudgetProof.v1';

const LAYOUT_OP = 'derived.manualMap.layoutScheduler';
const LAYOUT_ADAPTER_KIND = 'local-pure-derived-layout-scheduler';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePositiveInteger(value, fallback = 1) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) return fallback;
  return number;
}

function normalizeMapIdentity(graph = {}) {
  return {
    projectId: normalizeText(graph.projectId),
    mapId: normalizeText(graph.mapId),
  };
}

function normalizeLimits(value = {}) {
  const input = isPlainObject(value) ? value : {};
  return {
    overscanPx: normalizePositiveInteger(input.overscanPx, 160),
    maxNodes: normalizePositiveInteger(input.maxNodes, 500),
    maxEdges: normalizePositiveInteger(input.maxEdges, 750),
    labelZoomThreshold: Math.max(0, Number.isFinite(Number(input.labelZoomThreshold)) ? Number(input.labelZoomThreshold) : 0.65),
  };
}

function schedulerError(code, reason, details = {}) {
  const error = {
    code,
    op: LAYOUT_OP,
    reason,
  };
  if (isPlainObject(details) && Object.keys(details).length > 0) error.details = cloneJson(details);
  return { ok: false, error };
}

function graphSourceRevision(graph = {}) {
  const source = isPlainObject(graph) ? graph : {};
  const graphHash = normalizeText(source.meta?.graphHash);
  if (graphHash) return graphHash;
  return hashCanonicalValue({
    schemaVersion: normalizeText(source.schemaVersion),
    projectId: normalizeText(source.projectId),
    mapId: normalizeText(source.mapId),
    title: normalizeText(source.title),
    nodes: Array.isArray(source.nodes) ? source.nodes : [],
    edges: Array.isArray(source.edges) ? source.edges : [],
  });
}

function buildJobIdentity({ graph, sourceRevision, sequence, layoutKind, limits }) {
  const identity = normalizeMapIdentity(graph);
  const generation = normalizePositiveInteger(sequence);
  const revision = normalizeText(sourceRevision) || graphSourceRevision(graph);
  const requestHash = hashCanonicalValue({
    ...identity,
    sourceRevision: revision,
    generation,
    layoutKind,
    limits,
  });
  return {
    ...identity,
    sourceRevision: revision,
    generation,
    requestId: `manual-map-layout-request:${requestHash}`,
  };
}

export function buildManualMapResourceBudgetProof(input = {}) {
  const graph = isPlainObject(input.graph) ? input.graph : {};
  const viewportPlan = isPlainObject(input.viewportPlan) ? input.viewportPlan : {};
  const limits = normalizeLimits(input.limits || viewportPlan.limits);
  const inputNodes = Array.isArray(graph.nodes) ? graph.nodes.length : 0;
  const inputEdges = Array.isArray(graph.edges) ? graph.edges.length : 0;
  const plannedNodes = Array.isArray(viewportPlan.nodes) ? viewportPlan.nodes.length : 0;
  const plannedEdges = Array.isArray(viewportPlan.edges) ? viewportPlan.edges.length : 0;
  const proof = {
    schemaVersion: MANUAL_MAP_RESOURCE_BUDGET_PROOF_SCHEMA_VERSION,
    projectId: normalizeText(graph.projectId),
    mapId: normalizeText(graph.mapId),
    sourceRevision: normalizeText(input.sourceRevision) || graphSourceRevision(graph),
    limits,
    input: {
      nodes: inputNodes,
      edges: inputEdges,
    },
    planned: {
      nodes: plannedNodes,
      edges: plannedEdges,
    },
    withinBudget: {
      nodes: plannedNodes <= limits.maxNodes,
      edges: plannedEdges <= limits.maxEdges,
    },
    renderAll: {
      nodes: inputNodes > 0 && plannedNodes >= inputNodes,
      edges: inputEdges > 0 && plannedEdges >= inputEdges,
    },
  };
  return {
    ...proof,
    meta: {
      resourceBudgetProofHash: hashCanonicalValue(proof),
    },
  };
}

export function createManualMapLayoutJob(input = {}) {
  const graph = isPlainObject(input.graph) ? input.graph : {};
  const { projectId, mapId } = normalizeMapIdentity(graph);
  if (!projectId) return schedulerError('E_MANUAL_MAP_LAYOUT_PROJECT_ID_REQUIRED', 'PROJECT_ID_REQUIRED');
  if (!mapId) return schedulerError('E_MANUAL_MAP_LAYOUT_MAP_ID_REQUIRED', 'MAP_ID_REQUIRED');
  if (!Array.isArray(graph.nodes)) return schedulerError('E_MANUAL_MAP_LAYOUT_GRAPH_INVALID', 'GRAPH_NODES_REQUIRED', { projectId, mapId });
  const limits = normalizeLimits(input.limits);
  const layoutKind = normalizeText(input.layoutKind) || 'manual-fixed-position';
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
      schemaVersion: MANUAL_MAP_LAYOUT_JOB_SCHEMA_VERSION,
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
        },
        cancellation: 'discard-stale-layout-result',
      },
      input: {
        graph: cloneJson(graph),
        viewState: cloneJson(isPlainObject(input.viewState) ? input.viewState : {}),
        limits,
      },
    },
  };
}

export function coalesceManualMapLayoutJobs(jobs, options = {}) {
  const maxQueueSize = normalizePositiveInteger(options.maxQueueSize, 8);
  const latestByMap = new Map();
  for (const job of Array.isArray(jobs) ? jobs : []) {
    if (!isPlainObject(job) || job.schemaVersion !== MANUAL_MAP_LAYOUT_JOB_SCHEMA_VERSION) continue;
    const key = `${normalizeText(job.projectId)}:${normalizeText(job.mapId)}`;
    const existing = latestByMap.get(key);
    if (!existing || normalizePositiveInteger(job.generation) >= normalizePositiveInteger(existing.generation)) {
      latestByMap.set(key, cloneJson(job));
    }
  }
  const queue = [...latestByMap.values()]
    .sort((a, b) => {
      if (normalizePositiveInteger(a.generation) !== normalizePositiveInteger(b.generation)) {
        return normalizePositiveInteger(a.generation) - normalizePositiveInteger(b.generation);
      }
      const project = normalizeText(a.projectId).localeCompare(normalizeText(b.projectId), 'en', { sensitivity: 'variant' });
      if (project !== 0) return project;
      return normalizeText(a.mapId).localeCompare(normalizeText(b.mapId), 'en', { sensitivity: 'variant' });
    })
    .slice(-maxQueueSize);
  return {
    ok: true,
    value: {
      schemaVersion: MANUAL_MAP_LAYOUT_JOB_SCHEMA_VERSION,
      queue,
      maxQueueSize,
      discardedCount: Math.max(0, latestByMap.size - queue.length),
    },
  };
}

export function runManualMapLayoutJob(job = {}) {
  if (!isPlainObject(job) || job.schemaVersion !== MANUAL_MAP_LAYOUT_JOB_SCHEMA_VERSION) {
    return schedulerError('E_MANUAL_MAP_LAYOUT_JOB_INVALID', 'JOB_INVALID');
  }
  const graph = isPlainObject(job.input?.graph) ? job.input.graph : {};
  const viewportPlan = buildManualMapViewportPlan({
    graph,
    viewState: job.input?.viewState,
    limits: job.limits,
  });
  const proof = buildManualMapResourceBudgetProof({
    graph,
    viewportPlan,
    limits: job.limits,
    sourceRevision: job.sourceRevision,
  });
  const result = {
    schemaVersion: MANUAL_MAP_LAYOUT_RESULT_SCHEMA_VERSION,
    requestId: normalizeText(job.requestId),
    projectId: normalizeText(job.projectId),
    mapId: normalizeText(job.mapId),
    sourceRevision: normalizeText(job.sourceRevision),
    generation: normalizePositiveInteger(job.generation),
    ok: true,
    viewportPlan,
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

export function acceptManualMapLayoutResult(input = {}) {
  const activeJob = isPlainObject(input.activeJob) ? input.activeJob : {};
  const result = isPlainObject(input.result) ? input.result : {};
  if (activeJob.schemaVersion !== MANUAL_MAP_LAYOUT_JOB_SCHEMA_VERSION) {
    return schedulerError('E_MANUAL_MAP_LAYOUT_ACTIVE_JOB_INVALID', 'ACTIVE_JOB_INVALID');
  }
  if (result.schemaVersion !== MANUAL_MAP_LAYOUT_RESULT_SCHEMA_VERSION) {
    return schedulerError('E_MANUAL_MAP_LAYOUT_RESULT_INVALID', 'RESULT_INVALID');
  }
  if (result.ok !== true) return schedulerError('E_MANUAL_MAP_LAYOUT_RESULT_FAILED', 'RESULT_FAILED');
  const mismatches = [];
  for (const key of ['requestId', 'projectId', 'mapId', 'sourceRevision']) {
    if (normalizeText(result[key]) !== normalizeText(activeJob[key])) mismatches.push(key);
  }
  if (normalizePositiveInteger(result.generation) !== normalizePositiveInteger(activeJob.generation)) {
    mismatches.push('generation');
  }
  if (mismatches.length > 0) {
    return schedulerError('E_MANUAL_MAP_STALE_LAYOUT_RESULT', 'STALE_LAYOUT_RESULT_IDENTITY_MISMATCH', { mismatches });
  }
  const currentGraph = isPlainObject(input.currentGraph) ? input.currentGraph : {};
  const currentSourceRevision = graphSourceRevision(currentGraph);
  if (currentSourceRevision !== normalizeText(activeJob.sourceRevision)) {
    return schedulerError('E_MANUAL_MAP_STALE_LAYOUT_RESULT', 'STALE_LAYOUT_RESULT_SOURCE_REVISION', {
      expected: activeJob.sourceRevision,
      actual: currentSourceRevision,
    });
  }
  if (!isPlainObject(result.resourceBudgetProof) || result.resourceBudgetProof.schemaVersion !== MANUAL_MAP_RESOURCE_BUDGET_PROOF_SCHEMA_VERSION) {
    return schedulerError('E_MANUAL_MAP_RESOURCE_BUDGET_PROOF_INVALID', 'RESOURCE_BUDGET_PROOF_INVALID');
  }
  if (result.resourceBudgetProof.withinBudget?.nodes !== true || result.resourceBudgetProof.withinBudget?.edges !== true) {
    return schedulerError('E_MANUAL_MAP_RESOURCE_BUDGET_EXCEEDED', 'RESOURCE_BUDGET_EXCEEDED');
  }
  return {
    ok: true,
    value: {
      accepted: true,
      requestId: result.requestId,
      projectId: result.projectId,
      mapId: result.mapId,
      sourceRevision: result.sourceRevision,
      generation: result.generation,
      published: {
        schemaVersion: result.viewportPlan?.schemaVersion || '',
        viewportPlanHash: result.viewportPlan?.meta?.viewportPlanHash || hashCanonicalValue(result.viewportPlan || {}),
        resourceBudgetProofHash: result.resourceBudgetProof.meta?.resourceBudgetProofHash || hashCanonicalValue(result.resourceBudgetProof),
        persistentDerivedTruth: false,
      },
    },
  };
}
