#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import {
  ATLAS_GRAPH_WORKER_PERF_REPORT_SCHEMA_VERSION,
  acceptAtlasGraphWorkerResult,
  buildAtlasGraphWorkerPayload,
  runAtlasGraphWorkerJob,
} from '../../src/derived/atlas/index.mjs';

const DEFAULT_NODE_COUNT = 10_000;
const DEFAULT_ITERATIONS = 5;

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    json: false,
    nodeCount: DEFAULT_NODE_COUNT,
    iterations: DEFAULT_ITERATIONS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || '').trim();
    if (arg === '--json') {
      out.json = true;
      continue;
    }
    if (arg.startsWith('--nodes=')) {
      out.nodeCount = Number(arg.slice('--nodes='.length));
      continue;
    }
    if (arg === '--nodes' && index + 1 < argv.length) {
      out.nodeCount = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith('--iterations=')) {
      out.iterations = Number(arg.slice('--iterations='.length));
      continue;
    }
    if (arg === '--iterations' && index + 1 < argv.length) {
      out.iterations = Number(argv[index + 1]);
      index += 1;
      continue;
    }
  }
  if (!Number.isSafeInteger(out.nodeCount) || out.nodeCount < 1) out.nodeCount = DEFAULT_NODE_COUNT;
  if (!Number.isSafeInteger(out.iterations) || out.iterations < 1) out.iterations = DEFAULT_ITERATIONS;
  out.nodeCount = Math.min(out.nodeCount, 50_000);
  out.iterations = Math.min(out.iterations, 20);
  return out;
}

function percentile(values, p) {
  const sorted = [...values].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[index].toFixed(3));
}

function round(value) {
  return Number(Number(value || 0).toFixed(3));
}

export function buildAtlasGraphWorker10kCorpus(nodeCount = DEFAULT_NODE_COUNT) {
  const nodes = [];
  const edges = [];
  for (let index = 0; index < nodeCount; index += 1) {
    const id = `global:er-c05:${String(index).padStart(5, '0')}`;
    nodes.push({
      schemaVersion: 'derived.atlas.globalCompositeNode.v1',
      nodeId: id,
      nodeKind: index % 11 === 0 ? 'originRef' : (index % 3 === 0 ? 'manualMapNode' : 'atlasEntity'),
      sourceProjection: index % 3 === 0 ? 'manualMap' : 'atlas.localGraph',
      sourceId: id,
      label: `ER C05 Node ${index}`,
      trustState: index % 3 === 0 ? 'AUTHOR_CONFIRMED' : 'ALGORITHMIC_OBSERVATION',
      sourceRefIds: [`source:${index % 17}`, `scene:${Math.floor(index / 50)}`],
    });
    if (index > 0) {
      edges.push({
        schemaVersion: 'derived.atlas.globalCompositeEdge.v1',
        edgeId: `global:er-c05-edge:${String(index).padStart(5, '0')}`,
        edgeKind: index % 13 === 0 ? 'crossProjectionLink' : 'atlasCooccurrence',
        fromNodeId: `global:er-c05:${String(index - 1).padStart(5, '0')}`,
        toNodeId: id,
        sourceProjection: 'er-c05.synthetic',
        sourceId: `edge-${index}`,
        sourceRefIds: [`source:${index % 17}`],
      });
    }
    if (index >= 11 && index % 11 === 0) {
      edges.push({
        schemaVersion: 'derived.atlas.globalCompositeEdge.v1',
        edgeId: `global:er-c05-skip-edge:${String(index).padStart(5, '0')}`,
        edgeKind: 'crossProjectionLink',
        fromNodeId: `global:er-c05:${String(index - 11).padStart(5, '0')}`,
        toNodeId: id,
        sourceProjection: 'er-c05.synthetic',
        sourceId: `skip-edge-${index}`,
        sourceRefIds: [`source:${index % 17}`],
      });
    }
  }
  return {
    schemaVersion: 'derived.atlas.globalCompositeGraph.v1',
    projectId: 'er-c05-10k-worker-budget-project',
    sourceRefs: [],
    nodes,
    edges,
    summary: {
      sourceProjectionCount: 2,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      sourceProjectionHashes: {
        atlas: 'a'.repeat(64),
        manual: 'b'.repeat(64),
      },
      compositeHash: 'c'.repeat(64),
    },
    meta: {
      compositeHash: 'c'.repeat(64),
    },
  };
}

async function measureInputLatencyDuring(promiseFactory) {
  const samples = [];
  let running = true;
  let pumpCount = 0;
  function pump() {
    const scheduledAt = performance.now();
    setImmediate(() => {
      samples.push(performance.now() - scheduledAt);
      pumpCount += 1;
      if (running && pumpCount < 10_000) pump();
    });
  }
  pump();
  const result = await promiseFactory();
  running = false;
  await new Promise((resolve) => setImmediate(resolve));
  return { result, samples };
}

async function runMeasuredIteration({ graph, iteration }) {
  const payloadResult = buildAtlasGraphWorkerPayload({
    graph,
    generation: iteration + 1,
    limits: {
      maxNodes: 640,
      maxEdges: 960,
      labelNodeBudget: 160,
      spatialCellSize: 96,
    },
  });
  if (!payloadResult.ok) throw new Error(payloadResult.error?.reason || 'PAYLOAD_FAILED');
  const activePayload = payloadResult.value;
  const heapBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  const { result: workerResult, samples } = await measureInputLatencyDuring(() => runAtlasGraphWorkerJob({
    payload: activePayload,
    timeoutMs: 15_000,
  }));
  const wallTimeMs = performance.now() - startedAt;
  const heapAfter = process.memoryUsage().heapUsed;
  if (!workerResult.ok) throw new Error(workerResult.error?.reason || 'WORKER_FAILED');
  const accepted = acceptAtlasGraphWorkerResult({
    activePayload,
    result: workerResult.value,
    currentSourceRevision: activePayload.sourceRevision,
  });
  if (!accepted.ok) throw new Error(accepted.error?.reason || 'ACCEPT_FAILED');
  return {
    wallTimeMs: round(wallTimeMs),
    inputLatencyP95Ms: percentile(samples, 95),
    frameDelayP95Ms: percentile(samples, 95),
    frameOverrunCount: samples.filter((sample) => sample > 16.7).length,
    sampleCount: samples.length,
    heapDeltaBytes: Math.max(0, heapAfter - heapBefore),
    workerThreadId: workerResult.value.workerThreadId,
    executionMode: workerResult.value.executionMode,
    plannedNodes: workerResult.value.metrics?.plannedNodes || 0,
    plannedEdges: workerResult.value.metrics?.plannedEdges || 0,
    spatialIndexCells: workerResult.value.metrics?.spatialIndexCells || 0,
    transferableByteLength: workerResult.value.transfer?.transferableByteLength || 0,
    workerComputeMs: round(workerResult.value.metrics?.workerComputeMs || 0),
  };
}

export async function runAtlasGraphWorker10kBudget(input = {}) {
  const nodeCount = Number.isSafeInteger(input.nodeCount) ? input.nodeCount : DEFAULT_NODE_COUNT;
  const iterations = Number.isSafeInteger(input.iterations) ? input.iterations : DEFAULT_ITERATIONS;
  const graph = buildAtlasGraphWorker10kCorpus(nodeCount);
  const runs = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    runs.push(await runMeasuredIteration({ graph, iteration }));
  }
  const wall = runs.map((run) => run.wallTimeMs);
  const inputLatency = runs.map((run) => run.inputLatencyP95Ms);
  const frameDelay = runs.map((run) => run.frameDelayP95Ms);
  const heap = runs.map((run) => run.heapDeltaBytes);
  const budgets = {
    nodeCount,
    p95WallTimeMs: 5000,
    p95InputLatencyMs: 32,
    p95FrameDelayMs: 32,
    maxHeapDeltaBytes: 160 * 1024 * 1024,
    maxPlannedNodes: 640,
    maxPlannedEdges: 960,
  };
  const metrics = {
    p50WallTimeMs: percentile(wall, 50),
    p95WallTimeMs: percentile(wall, 95),
    p50InputLatencyMs: percentile(inputLatency, 50),
    p95InputLatencyMs: percentile(inputLatency, 95),
    p50FrameDelayMs: percentile(frameDelay, 50),
    p95FrameDelayMs: percentile(frameDelay, 95),
    maxHeapDeltaBytes: Math.max(...heap),
    maxFrameOverrunCount: Math.max(...runs.map((run) => run.frameOverrunCount)),
    minInputSampleCount: Math.min(...runs.map((run) => run.sampleCount)),
    maxPlannedNodes: Math.max(...runs.map((run) => run.plannedNodes)),
    maxPlannedEdges: Math.max(...runs.map((run) => run.plannedEdges)),
    minSpatialIndexCells: Math.min(...runs.map((run) => run.spatialIndexCells)),
    minTransferableByteLength: Math.min(...runs.map((run) => run.transferableByteLength)),
    workerThreadIds: [...new Set(runs.map((run) => run.workerThreadId))],
    executionModes: [...new Set(runs.map((run) => run.executionMode))],
  };
  const failures = [];
  if (metrics.p95WallTimeMs > budgets.p95WallTimeMs) failures.push('P95_WALL_TIME_EXCEEDED');
  if (metrics.p95InputLatencyMs > budgets.p95InputLatencyMs) failures.push('P95_INPUT_LATENCY_EXCEEDED');
  if (metrics.p95FrameDelayMs > budgets.p95FrameDelayMs) failures.push('P95_FRAME_DELAY_EXCEEDED');
  if (metrics.maxHeapDeltaBytes > budgets.maxHeapDeltaBytes) failures.push('HEAP_DELTA_EXCEEDED');
  if (metrics.maxPlannedNodes > budgets.maxPlannedNodes) failures.push('PLANNED_NODES_EXCEEDED');
  if (metrics.maxPlannedEdges > budgets.maxPlannedEdges) failures.push('PLANNED_EDGES_EXCEEDED');
  if (metrics.maxPlannedEdges < 1) failures.push('PLANNED_EDGES_MISSING');
  if (metrics.minSpatialIndexCells < 1) failures.push('SPATIAL_INDEX_MISSING');
  if (metrics.minTransferableByteLength < 1) failures.push('TRANSFERABLE_PAYLOAD_MISSING');
  if (!metrics.executionModes.includes('worker-thread')) failures.push('REAL_WORKER_THREAD_NOT_OBSERVED');
  const report = {
    schemaVersion: ATLAS_GRAPH_WORKER_PERF_REPORT_SCHEMA_VERSION,
    contourId: 'ER_C05_REAL_WORKER_AND_MEASURED_10K_BUDGET',
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    performanceProofKind: 'measured-worker-runtime-not-element-count',
    corpus: {
      nodeCount,
      edgeCount: graph.edges.length,
      approvedCorpusId: 'er-c05-synthetic-global-composite-10k-v1',
    },
    iterations,
    budgets,
    metrics,
    runs,
    failures,
    authority: {
      workerThread: true,
      syncSchedulerLabeledWorker: false,
      projectTruthMutation: false,
      storageMutation: false,
      networkMutation: false,
      rendererMutation: false,
      persistentDerivedTruth: false,
    },
  };
  return report;
}

async function main() {
  const args = parseArgs();
  const report = await runAtlasGraphWorker10kBudget({
    nodeCount: args.nodeCount,
    iterations: args.iterations,
  });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`ER_C05_WORKER_10K_STATUS=${report.status}\n`);
    process.stdout.write(`ER_C05_WORKER_10K_P95_WALL_MS=${report.metrics.p95WallTimeMs}\n`);
    process.stdout.write(`ER_C05_WORKER_10K_P95_INPUT_LATENCY_MS=${report.metrics.p95InputLatencyMs}\n`);
    process.stdout.write(`ER_C05_WORKER_10K_P95_FRAME_DELAY_MS=${report.metrics.p95FrameDelayMs}\n`);
    process.stdout.write(`ER_C05_WORKER_10K_MAX_HEAP_DELTA_BYTES=${report.metrics.maxHeapDeltaBytes}\n`);
  }
  if (report.status !== 'PASS') process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
