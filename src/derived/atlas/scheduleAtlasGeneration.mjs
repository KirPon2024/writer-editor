import { hashCoreState } from '../../core/runtime.mjs';
import { hashCanonicalValue } from '../deriveView.mjs';
import {
  ATLAS_GENERATION_MANIFEST_SCHEMA_VERSION,
  ATLAS_GENERATION_SCHEDULER_SCHEMA_VERSION,
  ATLAS_GENERATION_WORKER_RESULT_SCHEMA_VERSION,
} from './atlasMentionTypes.mjs';
import {
  canPublishAtlasGeneration,
  deriveAtlasGenerationManifest,
} from './rebuildAtlasGeneration.mjs';

const SCHEDULER_OP = 'derived.atlas.generationScheduler';
const WORKER_ADAPTER_KIND = 'local-pure-derived-worker';

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

function buildJobIdentity({ projectId, sourceRevision, capabilitySnapshot, sequence }) {
  const capabilityHash = hashCanonicalValue(capabilitySnapshot);
  const generation = normalizePositiveInteger(sequence);
  const requestHash = hashCanonicalValue({
    projectId,
    sourceRevision,
    capabilityHash,
    generation,
  });
  return {
    projectId,
    sourceRevision,
    capabilityHash,
    generation,
    requestId: `atlas-generation-request:${requestHash}`,
  };
}

export function createAtlasGenerationJob(input = {}) {
  const projectId = normalizeString(input.projectId || input?.params?.projectId);
  if (!projectId) return schedulerError('E_ATLAS_PROJECT_ID_REQUIRED', 'PROJECT_ID_REQUIRED');
  if (!isPlainObject(input.coreState)) return schedulerError('E_ATLAS_CORE_STATE_REQUIRED', 'CORE_STATE_REQUIRED');

  const capabilitySnapshot = normalizeCapabilitySnapshot(input.capabilitySnapshot);
  const sourceRevision = normalizeString(input.sourceRevision) || hashCoreState(input.coreState);
  const identity = buildJobIdentity({
    projectId,
    sourceRevision,
    capabilitySnapshot,
    sequence: input.sequence,
  });
  return {
    ok: true,
    value: {
      schemaVersion: ATLAS_GENERATION_SCHEDULER_SCHEMA_VERSION,
      ...identity,
      worker: {
        adapterKind: WORKER_ADAPTER_KIND,
        authority: {
          filesystem: false,
          network: false,
          writer: false,
          projectMutation: false,
          persistentDerivedTruth: false,
        },
        cancellation: 'discard-stale-generation-result',
      },
      workerInput: {
        coreState: cloneJson(input.coreState),
        params: {
          projectId,
          sourceRevision,
        },
        capabilitySnapshot,
      },
    },
  };
}

export function coalesceAtlasGenerationJobs(jobs, options = {}) {
  const maxQueueSize = normalizePositiveInteger(options.maxQueueSize, 8);
  const latestByProject = new Map();
  for (const job of Array.isArray(jobs) ? jobs : []) {
    if (!isPlainObject(job) || job.schemaVersion !== ATLAS_GENERATION_SCHEDULER_SCHEMA_VERSION) continue;
    const existing = latestByProject.get(job.projectId);
    if (!existing || Number(job.generation) >= Number(existing.generation)) {
      latestByProject.set(job.projectId, cloneJson(job));
    }
  }
  const queue = [...latestByProject.values()]
    .sort((a, b) => {
      if (Number(a.generation) !== Number(b.generation)) return Number(a.generation) - Number(b.generation);
      return String(a.projectId).localeCompare(String(b.projectId), 'en', { sensitivity: 'variant' });
    })
    .slice(-maxQueueSize);
  return {
    ok: true,
    value: {
      schemaVersion: ATLAS_GENERATION_SCHEDULER_SCHEMA_VERSION,
      queue,
      discardedCount: Math.max(0, latestByProject.size - queue.length),
      maxQueueSize,
    },
  };
}

export function runAtlasGenerationWorkerJob(job = {}) {
  if (!isPlainObject(job) || job.schemaVersion !== ATLAS_GENERATION_SCHEDULER_SCHEMA_VERSION) {
    return schedulerError('E_ATLAS_GENERATION_JOB_INVALID', 'JOB_INVALID');
  }
  const result = deriveAtlasGenerationManifest(job.workerInput);
  const base = {
    schemaVersion: ATLAS_GENERATION_WORKER_RESULT_SCHEMA_VERSION,
    requestId: normalizeString(job.requestId),
    projectId: normalizeString(job.projectId),
    sourceRevision: normalizeString(job.sourceRevision),
    generation: normalizePositiveInteger(job.generation),
  };
  if (!result.ok) {
    return {
      ok: true,
      value: {
        ...base,
        ok: false,
        error: result.error || null,
      },
    };
  }
  return {
    ok: true,
    value: {
      ...base,
      ok: true,
      manifest: result.value,
      resultHash: result.meta?.outputHash || hashCanonicalValue(result.value),
    },
  };
}

export function acceptAtlasGenerationWorkerResult(input = {}) {
  const activeJob = isPlainObject(input.activeJob) ? input.activeJob : {};
  const result = isPlainObject(input.result) ? input.result : {};
  if (activeJob.schemaVersion !== ATLAS_GENERATION_SCHEDULER_SCHEMA_VERSION) {
    return schedulerError('E_ATLAS_ACTIVE_JOB_INVALID', 'ACTIVE_JOB_INVALID');
  }
  if (result.schemaVersion !== ATLAS_GENERATION_WORKER_RESULT_SCHEMA_VERSION) {
    return schedulerError('E_ATLAS_WORKER_RESULT_INVALID', 'WORKER_RESULT_INVALID');
  }
  if (result.ok !== true) {
    return schedulerError('E_ATLAS_WORKER_RESULT_FAILED', 'WORKER_RESULT_FAILED', { workerError: result.error || null });
  }
  const mismatches = [];
  for (const key of ['requestId', 'projectId', 'sourceRevision']) {
    if (normalizeString(result[key]) !== normalizeString(activeJob[key])) mismatches.push(key);
  }
  if (normalizePositiveInteger(result.generation) !== normalizePositiveInteger(activeJob.generation)) {
    mismatches.push('generation');
  }
  if (mismatches.length > 0) {
    return schedulerError('E_ATLAS_STALE_WORKER_RESULT', 'STALE_WORKER_RESULT_IDENTITY_MISMATCH', { mismatches });
  }
  if (!isPlainObject(input.currentCoreState)) return schedulerError('E_ATLAS_CORE_STATE_REQUIRED', 'CORE_STATE_REQUIRED');
  const currentSourceRevision = hashCoreState(input.currentCoreState);
  if (currentSourceRevision !== normalizeString(activeJob.sourceRevision)) {
    return schedulerError('E_ATLAS_STALE_WORKER_RESULT', 'STALE_WORKER_RESULT_SOURCE_REVISION', {
      expected: activeJob.sourceRevision,
      actual: currentSourceRevision,
    });
  }
  if (!isPlainObject(result.manifest) || result.manifest.schemaVersion !== ATLAS_GENERATION_MANIFEST_SCHEMA_VERSION) {
    return schedulerError('E_ATLAS_WORKER_MANIFEST_INVALID', 'WORKER_MANIFEST_INVALID');
  }
  const publish = canPublishAtlasGeneration(result.manifest, currentSourceRevision);
  if (!publish.ok) {
    return schedulerError('E_ATLAS_STALE_WORKER_RESULT', publish.reason || 'STALE_WORKER_RESULT');
  }
  return {
    ok: true,
    value: {
      accepted: true,
      requestId: result.requestId,
      projectId: result.projectId,
      sourceRevision: result.sourceRevision,
      generation: result.generation,
      published: {
        schemaVersion: result.manifest.schemaVersion,
        generationId: result.manifest.generationId,
        sourceRevision: result.manifest.sourceRevision,
        manifestHash: hashCanonicalValue(result.manifest),
        persistentDerivedTruth: false,
      },
    },
  };
}
