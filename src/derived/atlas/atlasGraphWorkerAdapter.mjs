import { Worker } from 'node:worker_threads';
import {
  ATLAS_GRAPH_WORKER_ADAPTER_KIND,
  ATLAS_GRAPH_WORKER_RESULT_SCHEMA_VERSION,
  ATLAS_GRAPH_WORKER_SYNC_FALLBACK_KIND,
  cloneAtlasGraphWorkerPayloadForFallback,
  getAtlasGraphWorkerTransferList,
  runAtlasGraphWorkerPayload,
} from './atlasGraphWorkerPayload.mjs';

const WORKER_OP = 'derived.atlas.graphWorkerExecutionPort';
const WORKER_URL = new URL('./atlasGraphLayoutWorker.mjs', import.meta.url);

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

function typedWorkerFailure(code, reason, details = {}) {
  return {
    code,
    op: WORKER_OP,
    reason,
    details: isPlainObject(details) ? JSON.parse(JSON.stringify(details)) : {},
  };
}

function monotonicNow() {
  const now = globalThis.performance?.now?.();
  return Number.isFinite(now) ? now : 0;
}

function fallbackResult(payload, workerFailure) {
  const startedAt = monotonicNow();
  const computed = runAtlasGraphWorkerPayload(cloneAtlasGraphWorkerPayloadForFallback(payload), {
    adapterKind: ATLAS_GRAPH_WORKER_SYNC_FALLBACK_KIND,
    executionMode: 'sync-fallback',
    workerThreadId: 0,
  });
  if (!computed.ok) return computed;
  return {
    ok: true,
    value: {
      ...computed.value,
      workerFailure,
      fallback: {
        used: true,
        reason: workerFailure.reason,
        adapterKind: ATLAS_GRAPH_WORKER_SYNC_FALLBACK_KIND,
        fallbackWallTimeMs: Math.max(0, monotonicNow() - startedAt),
      },
    },
  };
}

export function buildAtlasGraphWorkerExecutionPort(options = {}) {
  return {
    schemaVersion: 'atlas.graphWorker.executionPort.v1',
    adapterKind: ATLAS_GRAPH_WORKER_ADAPTER_KIND,
    transport: 'node:worker_threads',
    workerUrl: 'atlasGraphLayoutWorker.mjs',
    authority: {
      filesystem: false,
      network: false,
      writer: false,
      projectMutation: false,
      manuscriptMutation: false,
      storageMutation: false,
      rendererMutation: false,
      persistentDerivedTruth: false,
    },
    scheduling: {
      cancellable: true,
      coalescedBy: ['projectId', 'generation'],
      staleResultPolicy: 'discard-before-publication',
      timeoutMs: normalizePositiveInteger(options.timeoutMs, 5000, 60_000),
    },
    payloadPolicy: {
      fullCoreState: false,
      fullGraphClone: false,
      transferableArrayBuffers: true,
      stringIdentityTables: true,
    },
  };
}

export async function runAtlasGraphWorkerJob(input = {}) {
  const payload = isPlainObject(input.payload) ? input.payload : {};
  if (!payload.schemaVersion) return typedError('E_ATLAS_GRAPH_WORKER_PAYLOAD_REQUIRED', 'PAYLOAD_REQUIRED');
  const signal = input.signal;
  if (signal?.aborted === true) {
    return typedError('E_ATLAS_GRAPH_WORKER_ABORTED', 'ABORTED_BEFORE_START');
  }
  if (input.forceFallback === true) {
    return fallbackResult(payload, typedWorkerFailure('E_ATLAS_GRAPH_WORKER_FORCED_FALLBACK', normalizeString(input.fallbackReason) || 'FORCED_FALLBACK'));
  }

  const fallbackPayload = cloneAtlasGraphWorkerPayloadForFallback(payload);
  const timeoutMs = normalizePositiveInteger(input.timeoutMs, 5000, 60_000);
  const startedAt = monotonicNow();

  return new Promise((resolve) => {
    let settled = false;
    let timeoutId = null;
    let worker = null;

    const settle = (result) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (signal && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', onAbort);
      }
      if (worker) {
        worker.removeAllListeners('message');
        worker.removeAllListeners('error');
        worker.removeAllListeners('exit');
        worker.terminate().catch(() => {});
      }
      resolve(result);
    };

    const onAbort = () => {
      settle(typedError('E_ATLAS_GRAPH_WORKER_ABORTED', 'ABORTED_DURING_WORKER_RUN'));
    };

    try {
      worker = new Worker(WORKER_URL, {
        type: 'module',
        workerData: payload,
        transferList: getAtlasGraphWorkerTransferList(payload),
      });
    } catch (error) {
      settle(fallbackResult(fallbackPayload, typedWorkerFailure('E_ATLAS_GRAPH_WORKER_START_FAILED', 'WORKER_START_FAILED', {
        message: normalizeString(error?.message),
      })));
      return;
    }

    if (signal && typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    timeoutId = setTimeout(() => {
      settle(typedError('E_ATLAS_GRAPH_WORKER_TIMEOUT', 'WORKER_TIMEOUT', { timeoutMs }));
    }, timeoutMs);

    worker.once('message', (message) => {
      if (!isPlainObject(message) || message.schemaVersion !== ATLAS_GRAPH_WORKER_RESULT_SCHEMA_VERSION) {
        settle(fallbackResult(fallbackPayload, typedWorkerFailure('E_ATLAS_GRAPH_WORKER_MESSAGE_INVALID', 'WORKER_MESSAGE_INVALID')));
        return;
      }
      if (message.ok !== true) {
        settle(fallbackResult(fallbackPayload, typedWorkerFailure('E_ATLAS_GRAPH_WORKER_RETURNED_ERROR', 'WORKER_RETURNED_ERROR', {
          workerError: message.error || null,
        })));
        return;
      }
      settle({
        ok: true,
        value: {
          ...message,
          executionMode: 'worker-thread',
          adapterKind: ATLAS_GRAPH_WORKER_ADAPTER_KIND,
          portWallTimeMs: Math.max(0, monotonicNow() - startedAt),
          fallback: {
            used: false,
          },
        },
      });
    });

    worker.once('error', (error) => {
      settle(fallbackResult(fallbackPayload, typedWorkerFailure('E_ATLAS_GRAPH_WORKER_ERROR', 'WORKER_ERROR', {
        message: normalizeString(error?.message),
      })));
    });

    worker.once('exit', (code) => {
      if (!settled && code !== 0) {
        settle(fallbackResult(fallbackPayload, typedWorkerFailure('E_ATLAS_GRAPH_WORKER_EXITED', 'WORKER_EXITED', { code })));
      }
    });
  });
}
