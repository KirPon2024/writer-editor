import { hashCoreState } from '../../core/runtime.mjs';
import { hashCanonicalValue } from '../deriveView.mjs';
import { deriveAtlasGlobalCompositeGraph } from './deriveAtlasGlobalCompositeGraph.mjs';
import {
  ATLAS_GLOBAL_COMPOSITE_GRAPH_JOB_SCHEMA_VERSION,
  ATLAS_GLOBAL_COMPOSITE_GRAPH_QUEUE_SCHEMA_VERSION,
  ATLAS_GLOBAL_COMPOSITE_GRAPH_RESULT_SCHEMA_VERSION,
  ATLAS_GLOBAL_COMPOSITE_GRAPH_SCHEMA_VERSION,
  ATLAS_GLOBAL_COMPOSITE_GRAPH_TRIGGER,
} from './atlasGlobalCompositeGraphTypes.mjs';

const SCHEDULER_OP = 'derived.atlas.globalCompositeGraphScheduler';
const ADAPTER_KIND = 'local-pure-derived-on-demand-idle-worker';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePositiveInteger(value, fallback = 1) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) return fallback;
  return number;
}

function schedulerError(code, reason, details = {}) {
  const error = {
    code,
    op: SCHEDULER_OP,
    reason,
  };
  if (isPlainObject(details) && Object.keys(details).length > 0) error.details = cloneJson(details);
  return { ok: false, error };
}

function normalizeCapabilitySnapshot(value) {
  return isPlainObject(value) ? cloneJson(value) : {};
}

function normalizeTrigger(input = {}) {
  const trigger = isPlainObject(input.trigger) ? input.trigger : {};
  const mode = normalizeString(input.triggerMode || trigger.mode || input.mode);
  if (mode === ATLAS_GLOBAL_COMPOSITE_GRAPH_TRIGGER.EXPLICIT_OPEN) {
    return {
      ok: true,
      value: {
        mode,
        eligible: true,
        reason: 'AUTHOR_EXPLICIT_OPEN',
        idleBudgetMs: 0,
      },
    };
  }
  if (mode === ATLAS_GLOBAL_COMPOSITE_GRAPH_TRIGGER.IDLE_BUDGET) {
    const idleBudgetMs = normalizePositiveInteger(input.idleBudgetMs || trigger.idleBudgetMs, 0);
    if (idleBudgetMs < 1) {
      return schedulerError('E_ATLAS_GLOBAL_COMPOSITE_IDLE_BUDGET_REQUIRED', 'IDLE_BUDGET_REQUIRED');
    }
    return {
      ok: true,
      value: {
        mode,
        eligible: true,
        reason: 'IDLE_BUDGET_GRANTED',
        idleBudgetMs,
      },
    };
  }
  return schedulerError('E_ATLAS_GLOBAL_COMPOSITE_TRIGGER_REQUIRED', 'EXPLICIT_OPEN_OR_IDLE_BUDGET_REQUIRED', {
    acceptedModes: [
      ATLAS_GLOBAL_COMPOSITE_GRAPH_TRIGGER.EXPLICIT_OPEN,
      ATLAS_GLOBAL_COMPOSITE_GRAPH_TRIGGER.IDLE_BUDGET,
    ],
  });
}

function buildJobIdentity({ projectId, sourceRevision, capabilitySnapshot, sequence, trigger }) {
  const generation = normalizePositiveInteger(sequence);
  const capabilityHash = hashCanonicalValue(capabilitySnapshot);
  const requestHash = hashCanonicalValue({
    projectId,
    sourceRevision,
    capabilityHash,
    generation,
    trigger,
  });
  return {
    projectId,
    sourceRevision,
    capabilityHash,
    generation,
    requestId: `atlas-global-composite-request:${requestHash}`,
  };
}

export function createAtlasGlobalCompositeGraphJob(input = {}) {
  const projectId = normalizeString(input.projectId || input?.params?.projectId);
  if (!projectId) return schedulerError('E_ATLAS_GLOBAL_COMPOSITE_PROJECT_ID_REQUIRED', 'PROJECT_ID_REQUIRED');
  if (!isPlainObject(input.coreState)) return schedulerError('E_ATLAS_GLOBAL_COMPOSITE_CORE_STATE_REQUIRED', 'CORE_STATE_REQUIRED');
  const trigger = normalizeTrigger(input);
  if (!trigger.ok) return trigger;

  const capabilitySnapshot = normalizeCapabilitySnapshot(input.capabilitySnapshot);
  const sourceRevision = normalizeString(input.sourceRevision) || hashCoreState(input.coreState);
  const identity = buildJobIdentity({
    projectId,
    sourceRevision,
    capabilitySnapshot,
    sequence: input.sequence,
    trigger: trigger.value,
  });
  return {
    ok: true,
    value: {
      schemaVersion: ATLAS_GLOBAL_COMPOSITE_GRAPH_JOB_SCHEMA_VERSION,
      ...identity,
      trigger: trigger.value,
      adapter: {
        kind: ADAPTER_KIND,
        authority: {
          filesystem: false,
          network: false,
          writer: false,
          projectMutation: false,
          manuscriptMutation: false,
          rendererMutation: false,
          persistentDerivedTruth: false,
        },
        scheduling: 'on-demand-or-idle-only',
        cancellation: 'discard-stale-global-composite-result',
      },
      input: {
        coreState: cloneJson(input.coreState),
        params: {
          ...(isPlainObject(input.params) ? cloneJson(input.params) : {}),
          projectId,
        },
        capabilitySnapshot,
      },
    },
  };
}

export function coalesceAtlasGlobalCompositeGraphJobs(jobs, options = {}) {
  const maxQueueSize = normalizePositiveInteger(options.maxQueueSize, 4);
  const latestByProject = new Map();
  for (const job of Array.isArray(jobs) ? jobs : []) {
    if (!isPlainObject(job) || job.schemaVersion !== ATLAS_GLOBAL_COMPOSITE_GRAPH_JOB_SCHEMA_VERSION) continue;
    const existing = latestByProject.get(job.projectId);
    if (!existing || normalizePositiveInteger(job.generation) >= normalizePositiveInteger(existing.generation)) {
      latestByProject.set(job.projectId, cloneJson(job));
    }
  }
  const queue = [...latestByProject.values()]
    .sort((a, b) => {
      if (normalizePositiveInteger(a.generation) !== normalizePositiveInteger(b.generation)) {
        return normalizePositiveInteger(a.generation) - normalizePositiveInteger(b.generation);
      }
      return normalizeString(a.projectId).localeCompare(normalizeString(b.projectId), 'en', { sensitivity: 'variant' });
    })
    .slice(-maxQueueSize);
  return {
    ok: true,
    value: {
      schemaVersion: ATLAS_GLOBAL_COMPOSITE_GRAPH_QUEUE_SCHEMA_VERSION,
      queue,
      maxQueueSize,
      discardedCount: Math.max(0, latestByProject.size - queue.length),
    },
  };
}

export function runAtlasGlobalCompositeGraphJob(job = {}) {
  if (!isPlainObject(job) || job.schemaVersion !== ATLAS_GLOBAL_COMPOSITE_GRAPH_JOB_SCHEMA_VERSION) {
    return schedulerError('E_ATLAS_GLOBAL_COMPOSITE_JOB_INVALID', 'JOB_INVALID');
  }
  const graph = deriveAtlasGlobalCompositeGraph({
    coreState: job.input?.coreState,
    params: job.input?.params,
    capabilitySnapshot: job.input?.capabilitySnapshot,
  });
  const base = {
    schemaVersion: ATLAS_GLOBAL_COMPOSITE_GRAPH_RESULT_SCHEMA_VERSION,
    requestId: normalizeString(job.requestId),
    projectId: normalizeString(job.projectId),
    sourceRevision: normalizeString(job.sourceRevision),
    generation: normalizePositiveInteger(job.generation),
  };
  if (!graph.ok) {
    return {
      ok: true,
      value: {
        ...base,
        ok: false,
        error: graph.error || null,
      },
    };
  }
  return {
    ok: true,
    value: {
      ...base,
      ok: true,
      compositeGraph: graph.value,
      compositeHash: graph.value.meta?.compositeHash || hashCanonicalValue(graph.value),
      resultHash: hashCanonicalValue({
        ...base,
        compositeGraph: graph.value,
      }),
    },
  };
}

export function acceptAtlasGlobalCompositeGraphResult(input = {}) {
  const activeJob = isPlainObject(input.activeJob) ? input.activeJob : {};
  const result = isPlainObject(input.result) ? input.result : {};
  if (activeJob.schemaVersion !== ATLAS_GLOBAL_COMPOSITE_GRAPH_JOB_SCHEMA_VERSION) {
    return schedulerError('E_ATLAS_GLOBAL_COMPOSITE_ACTIVE_JOB_INVALID', 'ACTIVE_JOB_INVALID');
  }
  if (result.schemaVersion !== ATLAS_GLOBAL_COMPOSITE_GRAPH_RESULT_SCHEMA_VERSION) {
    return schedulerError('E_ATLAS_GLOBAL_COMPOSITE_RESULT_INVALID', 'RESULT_INVALID');
  }
  if (result.ok !== true) {
    return schedulerError('E_ATLAS_GLOBAL_COMPOSITE_RESULT_FAILED', 'RESULT_FAILED', { workerError: result.error || null });
  }
  const mismatches = [];
  for (const key of ['requestId', 'projectId', 'sourceRevision']) {
    if (normalizeString(result[key]) !== normalizeString(activeJob[key])) mismatches.push(key);
  }
  if (normalizePositiveInteger(result.generation) !== normalizePositiveInteger(activeJob.generation)) {
    mismatches.push('generation');
  }
  if (mismatches.length > 0) {
    return schedulerError('E_ATLAS_GLOBAL_COMPOSITE_STALE_RESULT', 'STALE_RESULT_IDENTITY_MISMATCH', { mismatches });
  }
  if (!isPlainObject(input.currentCoreState)) return schedulerError('E_ATLAS_GLOBAL_COMPOSITE_CORE_STATE_REQUIRED', 'CORE_STATE_REQUIRED');
  const currentSourceRevision = hashCoreState(input.currentCoreState);
  if (currentSourceRevision !== normalizeString(activeJob.sourceRevision)) {
    return schedulerError('E_ATLAS_GLOBAL_COMPOSITE_STALE_RESULT', 'STALE_RESULT_SOURCE_REVISION', {
      expected: activeJob.sourceRevision,
      actual: currentSourceRevision,
    });
  }
  if (!isPlainObject(result.compositeGraph) || result.compositeGraph.schemaVersion !== ATLAS_GLOBAL_COMPOSITE_GRAPH_SCHEMA_VERSION) {
    return schedulerError('E_ATLAS_GLOBAL_COMPOSITE_GRAPH_INVALID', 'COMPOSITE_GRAPH_INVALID');
  }
  const compositeHash = normalizeString(result.compositeHash || result.compositeGraph.meta?.compositeHash);
  if (!compositeHash || compositeHash !== normalizeString(result.compositeGraph.meta?.compositeHash)) {
    return schedulerError('E_ATLAS_GLOBAL_COMPOSITE_HASH_MISMATCH', 'COMPOSITE_HASH_MISMATCH');
  }
  return {
    ok: true,
    value: {
      accepted: true,
      requestId: result.requestId,
      projectId: result.projectId,
      sourceRevision: result.sourceRevision,
      generation: result.generation,
      trigger: cloneJson(activeJob.trigger || {}),
      published: {
        schemaVersion: result.compositeGraph.schemaVersion,
        compositeHash,
        sourceProjectionCount: Number(result.compositeGraph.summary?.sourceProjectionCount || 0),
        nodeCount: Number(result.compositeGraph.summary?.nodeCount || 0),
        edgeCount: Number(result.compositeGraph.summary?.edgeCount || 0),
        persistentDerivedTruth: false,
      },
    },
  };
}
