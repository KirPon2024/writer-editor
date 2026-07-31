import { parentPort, threadId, workerData } from 'node:worker_threads';
import {
  ATLAS_GRAPH_WORKER_ADAPTER_KIND,
  ATLAS_GRAPH_WORKER_RESULT_SCHEMA_VERSION,
  runAtlasGraphWorkerPayload,
} from './atlasGraphWorkerPayload.mjs';

function workerError(code, reason, details = {}) {
  return {
    schemaVersion: ATLAS_GRAPH_WORKER_RESULT_SCHEMA_VERSION,
    ok: false,
    adapterKind: ATLAS_GRAPH_WORKER_ADAPTER_KIND,
    executionMode: 'worker-thread',
    workerThreadId: threadId,
    error: {
      code,
      op: 'derived.atlas.graphLayoutWorker',
      reason,
      details,
    },
  };
}

try {
  const result = runAtlasGraphWorkerPayload(workerData, {
    adapterKind: ATLAS_GRAPH_WORKER_ADAPTER_KIND,
    executionMode: 'worker-thread',
    workerThreadId: threadId,
  });
  if (result.ok) {
    parentPort?.postMessage(result.value);
  } else {
    parentPort?.postMessage(workerError(result.error?.code || 'E_ATLAS_GRAPH_WORKER_FAILED', result.error?.reason || 'WORKER_FAILED', {
      workerError: result.error || null,
    }));
  }
} catch (error) {
  parentPort?.postMessage(workerError('E_ATLAS_GRAPH_WORKER_THROWN', 'WORKER_THROWN', {
    message: typeof error?.message === 'string' ? error.message : '',
  }));
}
