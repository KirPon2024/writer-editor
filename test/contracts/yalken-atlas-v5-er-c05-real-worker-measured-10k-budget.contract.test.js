const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

function buildCompositeGraph(count = 1200) {
  const nodes = [];
  const edges = [];
  for (let index = 0; index < count; index += 1) {
    const id = `global:er-c05-test:${String(index).padStart(5, '0')}`;
    nodes.push({
      schemaVersion: 'derived.atlas.globalCompositeNode.v1',
      nodeId: id,
      nodeKind: index % 11 === 0 ? 'originRef' : 'atlasEntity',
      sourceProjection: 'er-c05.test',
      sourceId: id,
      label: `Worker Node ${index}`,
      sourceRefIds: [`source:${index % 7}`],
    });
    if (index > 0) {
      edges.push({
        schemaVersion: 'derived.atlas.globalCompositeEdge.v1',
        edgeId: `global:er-c05-test-edge:${String(index).padStart(5, '0')}`,
        edgeKind: index % 13 === 0 ? 'crossProjectionLink' : 'atlasCooccurrence',
        fromNodeId: `global:er-c05-test:${String(index - 1).padStart(5, '0')}`,
        toNodeId: id,
        sourceProjection: 'er-c05.test',
        sourceId: `edge-${index}`,
        sourceRefIds: [`source:${index % 7}`],
      });
    }
    if (index >= 11 && index % 11 === 0) {
      edges.push({
        schemaVersion: 'derived.atlas.globalCompositeEdge.v1',
        edgeId: `global:er-c05-test-skip-edge:${String(index).padStart(5, '0')}`,
        edgeKind: 'crossProjectionLink',
        fromNodeId: `global:er-c05-test:${String(index - 11).padStart(5, '0')}`,
        toNodeId: id,
        sourceProjection: 'er-c05.test',
        sourceId: `skip-edge-${index}`,
        sourceRefIds: [`source:${index % 7}`],
      });
    }
  }
  return {
    schemaVersion: 'derived.atlas.globalCompositeGraph.v1',
    projectId: 'er-c05-worker-contract-project',
    sourceRefs: [],
    nodes,
    edges,
    summary: {
      sourceProjectionCount: 1,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      sourceProjectionHashes: { test: 'a'.repeat(64) },
      compositeHash: 'd'.repeat(64),
    },
    meta: { compositeHash: 'd'.repeat(64) },
  };
}

test('ER C05: worker payload is minimal, transferable, and does not clone Core or full graph truth', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const graph = buildCompositeGraph(32);
  const payloadResult = derived.buildAtlasGraphWorkerPayload({
    graph,
    generation: 7,
    limits: { maxNodes: 12, maxEdges: 10, labelNodeBudget: 4 },
  });

  assert.equal(payloadResult.ok, true);
  const payload = payloadResult.value;
  assert.equal(payload.schemaVersion, derived.ATLAS_GRAPH_WORKER_PAYLOAD_SCHEMA_VERSION);
  assert.equal(payload.portSchemaVersion, derived.ATLAS_GRAPH_WORKER_PORT_SCHEMA_VERSION);
  assert.equal(payload.adapterKind, derived.ATLAS_GRAPH_WORKER_ADAPTER_KIND);
  assert.equal(payload.inputSummary.coreStateIncluded, false);
  assert.equal(payload.inputSummary.fullGraphIncluded, false);
  assert.equal(payload.inputSummary.nodeObjectCloneIncluded, false);
  assert.equal(payload.inputSummary.edgeObjectCloneIncluded, false);
  assert.equal(Object.hasOwn(payload, 'coreState'), false);
  assert.equal(Object.hasOwn(payload, 'graph'), false);
  assert.equal(Object.hasOwn(payload, 'nodes'), false);
  assert.equal(Object.hasOwn(payload, 'edges'), false);
  assert.equal(payload.sourceRefCounts instanceof Uint16Array, true);
  assert.equal(payload.scoreHints instanceof Uint32Array, true);
  assert.equal(payload.edgeFromIndexes instanceof Uint32Array, true);
  assert.equal(payload.edgeToIndexes instanceof Uint32Array, true);
  assert.equal(payload.transfer.usesTransferableArrayBuffers, true);
  assert.equal(payload.transfer.transferableByteLength > 0, true);
  assert.equal(derived.getAtlasGraphWorkerTransferList(payload).length, 4);
});

test('ER C05: real worker-thread adapter returns LOD, spatial index, and publishes only derived pointers', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const graph = buildCompositeGraph();
  const activePayload = derived.buildAtlasGraphWorkerPayload({
    graph,
    generation: 1,
    limits: { maxNodes: 96, maxEdges: 80, labelNodeBudget: 24, spatialCellSize: 80 },
  }).value;
  const result = await derived.runAtlasGraphWorkerJob({ payload: activePayload, timeoutMs: 10_000 });
  assert.equal(result.ok, true);
  assert.equal(result.value.schemaVersion, derived.ATLAS_GRAPH_WORKER_RESULT_SCHEMA_VERSION);
  assert.equal(result.value.executionMode, 'worker-thread');
  assert.equal(result.value.adapterKind, derived.ATLAS_GRAPH_WORKER_ADAPTER_KIND);
  assert.equal(result.value.workerThreadId > 0, true);
  assert.equal(result.value.lodPlan.schemaVersion, derived.ATLAS_GLOBAL_COMPOSITE_LOD_PLAN_SCHEMA_VERSION);
  assert.equal(result.value.lodPlan.nodes.length <= 96, true);
  assert.equal(result.value.lodPlan.edges.length <= 80, true);
  assert.equal(result.value.lodPlan.edges.length > 0, true);
  assert.equal(result.value.spatialIndex.schemaVersion, derived.ATLAS_GRAPH_WORKER_SPATIAL_INDEX_SCHEMA_VERSION);
  assert.equal(result.value.spatialIndex.cellCount > 0, true);
  assert.equal(result.value.lodPlan.resourceBudgetProof.renderAll.nodes, false);
  assert.equal(result.value.transfer.coreStateIncluded, false);
  assert.equal(result.value.transfer.fullGraphIncluded, false);
  assert.equal(result.value.metrics.elementCountOnlyProof, false);

  const accepted = derived.acceptAtlasGraphWorkerResult({
    activePayload,
    result: result.value,
    currentSourceRevision: activePayload.sourceRevision,
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.value.published.persistentDerivedTruth, false);
  assert.equal(accepted.value.published.projectTruthMutation, false);
  assert.equal(accepted.value.published.storageMutation, false);
  assert.equal(accepted.value.published.rendererMutation, false);
  assert.equal(Object.hasOwn(accepted.value.published, 'lodPlan'), false);
});

test('ER C05: coalescing, cancellation, stale discard, and typed fallback are explicit', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const graph = buildCompositeGraph(128);
  const first = derived.buildAtlasGraphWorkerPayload({ graph, generation: 1 }).value;
  const second = derived.buildAtlasGraphWorkerPayload({ graph, generation: 2 }).value;
  const queue = derived.coalesceAtlasGraphWorkerPayloads([first, second], { maxQueueSize: 4 });
  assert.equal(queue.ok, true);
  assert.equal(queue.value.queue.length, 1);
  assert.equal(queue.value.queue[0].generation, 2);

  const controller = new AbortController();
  controller.abort();
  const aborted = await derived.runAtlasGraphWorkerJob({ payload: first, signal: controller.signal });
  assert.equal(aborted.ok, false);
  assert.equal(aborted.error.code, 'E_ATLAS_GRAPH_WORKER_ABORTED');

  const firstResult = await derived.runAtlasGraphWorkerJob({ payload: first, timeoutMs: 10_000 });
  assert.equal(firstResult.ok, true);
  const staleIdentity = derived.acceptAtlasGraphWorkerResult({
    activePayload: second,
    result: firstResult.value,
    currentSourceRevision: first.sourceRevision,
  });
  const staleSource = derived.acceptAtlasGraphWorkerResult({
    activePayload: first,
    result: firstResult.value,
    currentSourceRevision: 'e'.repeat(64),
  });
  assert.equal(staleIdentity.ok, false);
  assert.equal(staleIdentity.error.code, 'E_ATLAS_GRAPH_WORKER_STALE_RESULT');
  assert.deepEqual(staleIdentity.error.details.mismatches, ['requestId', 'generation']);
  assert.equal(staleSource.ok, false);
  assert.equal(staleSource.error.reason, 'STALE_RESULT_SOURCE_REVISION');

  const fallbackPayload = derived.buildAtlasGraphWorkerPayload({ graph, generation: 3 }).value;
  const fallback = await derived.runAtlasGraphWorkerJob({
    payload: derived.cloneAtlasGraphWorkerPayloadForFallback(fallbackPayload),
    forceFallback: true,
    fallbackReason: 'CONTRACT_FORCED_FALLBACK',
  });
  assert.equal(fallback.ok, true);
  assert.equal(fallback.value.executionMode, 'sync-fallback');
  assert.equal(fallback.value.adapterKind, derived.ATLAS_GRAPH_WORKER_SYNC_FALLBACK_KIND);
  assert.equal(fallback.value.workerFailure.code, 'E_ATLAS_GRAPH_WORKER_FORCED_FALLBACK');
  assert.equal(fallback.value.fallback.used, true);
});

test('ER C05: 10k budget proof is measured worker runtime, not element count', () => {
  const run = spawnSync(process.execPath, [
    'scripts/ops/yalken-atlas-v5-er-c05-10k-worker-budget.mjs',
    '--json',
    '--iterations=2',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(run.status, 0, `10k worker budget failed:\n${run.stdout}\n${run.stderr}`);
  const report = JSON.parse(run.stdout);
  assert.equal(report.schemaVersion, 'atlas.graphWorker.perfReport.v1');
  assert.equal(report.status, 'PASS');
  assert.equal(report.performanceProofKind, 'measured-worker-runtime-not-element-count');
  assert.equal(report.corpus.nodeCount, 10000);
  assert.equal(report.metrics.p50WallTimeMs > 0, true);
  assert.equal(report.metrics.p95WallTimeMs > 0, true);
  assert.equal(report.metrics.p95InputLatencyMs >= 0, true);
  assert.equal(report.metrics.p95FrameDelayMs >= 0, true);
  assert.equal(report.metrics.maxHeapDeltaBytes >= 0, true);
  assert.equal(report.metrics.maxPlannedNodes <= report.budgets.maxPlannedNodes, true);
  assert.equal(report.metrics.maxPlannedEdges <= report.budgets.maxPlannedEdges, true);
  assert.equal(report.metrics.maxPlannedEdges > 0, true);
  assert.equal(report.metrics.minSpatialIndexCells > 0, true);
  assert.equal(report.metrics.minTransferableByteLength > 0, true);
  assert.equal(report.metrics.executionModes.includes('worker-thread'), true);
  assert.equal(report.authority.syncSchedulerLabeledWorker, false);
});

test('ER C05: worker sources are Node-local and old sync schedulers are not labeled workers', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));
  assert.equal(derived.runAtlasGraphWorkerJob, atlas.runAtlasGraphWorkerJob);
  assert.equal(derived.buildAtlasGraphWorkerPayload, atlas.buildAtlasGraphWorkerPayload);
  assert.equal(typeof derived.buildAtlasGraphWorkerExecutionPort, 'function');

  const noFalseWorkerSources = [
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'scheduleAtlasGeneration.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'scheduleAtlasGlobalCompositeGraph.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'mindmap', 'manualMapLayoutScheduler.mjs'),
  ];
  for (const sourcePath of noFalseWorkerSources) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    assert.doesNotMatch(source, /local-pure-derived(?:-on-demand-idle)?-worker/u, path.basename(sourcePath));
  }

  const workerSources = [
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'atlasGraphWorkerPayload.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'atlasGraphWorkerAdapter.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'atlasGraphLayoutWorker.mjs'),
  ];
  const forbidden = [
    /from\s+['"]node:fs['"]/u,
    /from\s+['"]node:child_process['"]/u,
    /from\s+['"]node:http['"]/u,
    /from\s+['"]node:https['"]/u,
    /from\s+['"]node:net['"]/u,
    /from\s+['"]electron['"]/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
    /dispatchUiCommand/u,
    /projectTruthMutation:\s*true/u,
    /storageMutation:\s*true/u,
    /networkMutation:\s*true/u,
    /rendererMutation:\s*true/u,
    /persistentDerivedTruth:\s*true/u,
  ];
  for (const sourcePath of workerSources) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${path.basename(sourcePath)} matched ${pattern.source}`);
    }
  }
  assert.match(fs.readFileSync(path.join(process.cwd(), 'src', 'derived', 'atlas', 'atlasGraphWorkerAdapter.mjs'), 'utf8'), /node:worker_threads/u);
});
