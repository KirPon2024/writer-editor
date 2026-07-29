const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

function buildLargeGraphFixture(count = 10000) {
  const nodes = [];
  const edges = [];
  const columns = 100;
  for (let index = 0; index < count; index += 1) {
    const id = `node-${String(index).padStart(5, '0')}`;
    nodes.push({
      id,
      label: `Node ${index}`,
      kind: 'note',
      position: {
        x: (index % columns) * 24,
        y: Math.floor(index / columns) * 24,
      },
      target: { kind: '', id: '' },
    });
    if (index > 0) {
      edges.push({
        id: `edge-${String(index).padStart(5, '0')}`,
        from: `node-${String(index - 1).padStart(5, '0')}`,
        to: id,
        kind: 'link',
        label: '',
      });
    }
  }
  return {
    schemaVersion: 'derived.manualMap.graph.v1',
    projectId: 'large-layout-project',
    mapId: 'large-layout-map',
    title: 'Large Layout Map',
    nodes,
    edges,
  };
}

test('E02B C04: layout job carries source identity and no write authority', async () => {
  const scheduler = await loadModule(path.join('src', 'derived', 'mindmap', 'manualMapLayoutScheduler.mjs'));
  const graph = buildLargeGraphFixture(20);
  const job = scheduler.createManualMapLayoutJob({
    graph,
    viewState: { viewport: { x: 0, y: 0, width: 800, height: 600, zoom: 1 } },
    limits: { overscanPx: 0, maxNodes: 8, maxEdges: 6 },
    sequence: 7,
  });

  assert.equal(job.ok, true);
  assert.equal(job.value.schemaVersion, 'manualMap.layoutJob.v1');
  assert.equal(job.value.projectId, graph.projectId);
  assert.equal(job.value.mapId, graph.mapId);
  assert.equal(job.value.generation, 7);
  assert.match(job.value.requestId, /^manual-map-layout-request:/u);
  assert.match(job.value.sourceRevision, /^[0-9a-f]{64}$/u);
  assert.deepEqual(job.value.adapter.authority, {
    filesystem: false,
    network: false,
    writer: false,
    projectMutation: false,
    persistentDerivedTruth: false,
  });
  assert.notStrictEqual(job.value.input.graph, graph);
  assert.deepEqual(job.value.input.graph, graph);
});

test('E02B C04: layout execution proves 10k viewport resource budget without render-all', async () => {
  const scheduler = await loadModule(path.join('src', 'derived', 'mindmap', 'manualMapLayoutScheduler.mjs'));
  const graph = buildLargeGraphFixture();
  const before = JSON.stringify(graph);
  const job = scheduler.createManualMapLayoutJob({
    graph,
    viewState: {
      viewport: { x: 0, y: 0, width: 960, height: 640, zoom: 1 },
      selection: { nodeIds: ['node-09999'], focusedNodeId: 'node-09999' },
    },
    limits: { overscanPx: 48, maxNodes: 320, maxEdges: 240 },
    sequence: 1,
  }).value;
  const result = scheduler.runManualMapLayoutJob(job);
  const accepted = scheduler.acceptManualMapLayoutResult({
    activeJob: job,
    result: result.value,
    currentGraph: graph,
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.schemaVersion, 'manualMap.layoutResult.v1');
  assert.equal(result.value.viewportPlan.schemaVersion, 'manualMap.viewportPlan.v1');
  assert.equal(result.value.resourceBudgetProof.schemaVersion, 'manualMap.resourceBudgetProof.v1');
  assert.equal(result.value.resourceBudgetProof.input.nodes, 10000);
  assert.equal(result.value.resourceBudgetProof.input.edges, 9999);
  assert.equal(result.value.resourceBudgetProof.withinBudget.nodes, true);
  assert.equal(result.value.resourceBudgetProof.withinBudget.edges, true);
  assert.equal(result.value.resourceBudgetProof.renderAll.nodes, false);
  assert.equal(result.value.resourceBudgetProof.renderAll.edges, false);
  assert.equal(result.value.viewportPlan.nodes.length <= 320, true);
  assert.equal(result.value.viewportPlan.edges.length <= 240, true);
  assert.equal(result.value.viewportPlan.nodes.some((node) => node.id === 'node-09999' && node.pinned === true), true);
  assert.match(result.value.resultHash, /^[0-9a-f]{64}$/u);
  assert.match(result.value.resourceBudgetProof.meta.resourceBudgetProofHash, /^[0-9a-f]{64}$/u);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.value.published.persistentDerivedTruth, false);
  assert.equal(Object.hasOwn(accepted.value.published, 'viewportPlan'), false);
  assert.equal(JSON.stringify(graph), before);
});

test('E02B C04: stale layout results fail closed on graph revision or request mismatch', async () => {
  const scheduler = await loadModule(path.join('src', 'derived', 'mindmap', 'manualMapLayoutScheduler.mjs'));
  const graph = buildLargeGraphFixture(60);
  const job = scheduler.createManualMapLayoutJob({
    graph,
    limits: { maxNodes: 16, maxEdges: 12 },
    sequence: 1,
  }).value;
  const result = scheduler.runManualMapLayoutJob(job).value;
  const changedGraph = {
    ...graph,
    nodes: graph.nodes.map((node) => (node.id === 'node-00003' ? { ...node, label: 'Changed' } : node)),
  };
  const staleSource = scheduler.acceptManualMapLayoutResult({
    activeJob: job,
    result,
    currentGraph: changedGraph,
  });
  const nextJob = scheduler.createManualMapLayoutJob({
    graph,
    limits: { maxNodes: 16, maxEdges: 12 },
    sequence: 2,
  }).value;
  const staleIdentity = scheduler.acceptManualMapLayoutResult({
    activeJob: nextJob,
    result,
    currentGraph: graph,
  });

  assert.equal(staleSource.ok, false);
  assert.equal(staleSource.error.code, 'E_MANUAL_MAP_STALE_LAYOUT_RESULT');
  assert.equal(staleSource.error.reason, 'STALE_LAYOUT_RESULT_SOURCE_REVISION');
  assert.equal(staleIdentity.ok, false);
  assert.equal(staleIdentity.error.code, 'E_MANUAL_MAP_STALE_LAYOUT_RESULT');
  assert.equal(staleIdentity.error.reason, 'STALE_LAYOUT_RESULT_IDENTITY_MISMATCH');
  assert.deepEqual(staleIdentity.error.details.mismatches, ['requestId', 'generation']);
});

test('E02B C04: layout queue coalesces to the latest generation per map and remains bounded', async () => {
  const scheduler = await loadModule(path.join('src', 'derived', 'mindmap', 'manualMapLayoutScheduler.mjs'));
  const graph = buildLargeGraphFixture(10);
  const jobs = [1, 2, 3].map((sequence) => scheduler.createManualMapLayoutJob({ graph, sequence }).value);
  const other = scheduler.createManualMapLayoutJob({
    graph: { ...graph, mapId: 'other-map' },
    sequence: 4,
  }).value;
  const queue = scheduler.coalesceManualMapLayoutJobs([...jobs, other], { maxQueueSize: 1 });
  const projectQueue = scheduler.coalesceManualMapLayoutJobs(jobs, { maxQueueSize: 4 });

  assert.equal(queue.ok, true);
  assert.equal(queue.value.queue.length, 1);
  assert.equal(queue.value.queue[0].mapId, 'other-map');
  assert.equal(queue.value.discardedCount, 1);
  assert.equal(projectQueue.value.queue.length, 1);
  assert.equal(projectQueue.value.queue[0].generation, 3);
});

test('E02B C04: layout resource budget contract is exported through derived barrels', async () => {
  const mindmap = await loadModule(path.join('src', 'derived', 'mindmap', 'index.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));

  assert.equal(mindmap.MANUAL_MAP_LAYOUT_JOB_SCHEMA_VERSION, 'manualMap.layoutJob.v1');
  assert.equal(mindmap.MANUAL_MAP_LAYOUT_RESULT_SCHEMA_VERSION, 'manualMap.layoutResult.v1');
  assert.equal(derived.MANUAL_MAP_RESOURCE_BUDGET_PROOF_SCHEMA_VERSION, 'manualMap.resourceBudgetProof.v1');
  assert.equal(typeof mindmap.createManualMapLayoutJob, 'function');
  assert.equal(typeof derived.acceptManualMapLayoutResult, 'function');
});

test('E02B C04: layout scheduler adds no storage, network, platform, timer, or command bypass', () => {
  const sources = [
    path.join(process.cwd(), 'src', 'derived', 'mindmap', 'manualMapLayoutScheduler.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'mindmap', 'index.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'index.mjs'),
  ];
  const forbidden = [
    /from\s+['"]node:fs['"]/u,
    /from\s+['"]node:child_process['"]/u,
    /from\s+['"]node:http['"]/u,
    /from\s+['"]node:https['"]/u,
    /from\s+['"]node:net['"]/u,
    /from\s+['"]electron['"]/u,
    /new\s+Worker\b/u,
    /\bsetTimeout\b/u,
    /\bsetInterval\b/u,
    /\bDate\.now\b/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
    /dispatchUiCommand/u,
    /addEventListener\s*\(\s*['"](?:beforeinput|input|keydown|pointermove|wheel)['"]/u,
  ];

  for (const sourcePath of sources) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${path.basename(sourcePath)} matched ${pattern.source}`);
    }
  }
});
