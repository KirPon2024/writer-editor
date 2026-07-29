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
    const x = (index % columns) * 24;
    const y = Math.floor(index / columns) * 24;
    nodes.push({
      id: `node-${String(index).padStart(5, '0')}`,
      label: `Node ${index}`,
      kind: 'note',
      position: { x, y },
      target: { kind: '', id: '' },
    });
    if (index > 0) {
      edges.push({
        id: `edge-${String(index).padStart(5, '0')}`,
        from: `node-${String(index - 1).padStart(5, '0')}`,
        to: `node-${String(index).padStart(5, '0')}`,
        kind: 'link',
        label: '',
      });
    }
  }
  return {
    schemaVersion: 'derived.manualMap.graph.v1',
    projectId: 'large-map-project',
    mapId: 'large-map',
    title: 'Large Map',
    nodes,
    edges,
  };
}

test('E02B C02: viewport planner virtualizes a 10k-node graph within explicit budgets', async () => {
  const viewport = await loadModule(path.join('src', 'derived', 'mindmap', 'manualMapViewportPlanner.mjs'));
  const graph = buildLargeGraphFixture();
  const before = JSON.stringify(graph);
  const first = viewport.buildManualMapViewportPlan({
    graph,
    viewState: {
      viewport: { x: 0, y: 0, width: 800, height: 600, zoom: 1 },
      selection: { nodeIds: ['node-09999'], focusedNodeId: 'node-09999' },
    },
    limits: { overscanPx: 48, maxNodes: 300, maxEdges: 200 },
  });
  const second = viewport.buildManualMapViewportPlan({
    graph,
    viewState: {
      viewport: { x: 0, y: 0, width: 800, height: 600, zoom: 1 },
      selection: { nodeIds: ['node-09999'], focusedNodeId: 'node-09999' },
    },
    limits: { overscanPx: 48, maxNodes: 300, maxEdges: 200 },
  });

  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, 'manualMap.viewportPlan.v1');
  assert.equal(first.sourceSchemaVersion, 'derived.manualMap.graph.v1');
  assert.equal(first.resourceBudget.inputNodes, 10000);
  assert.equal(first.resourceBudget.inputEdges, 9999);
  assert.equal(first.nodes.length <= 300, true);
  assert.equal(first.edges.length <= 200, true);
  assert.equal(first.resourceBudget.withinNodeBudget, true);
  assert.equal(first.resourceBudget.withinEdgeBudget, true);
  assert.equal(first.omitted.offscreenNodes > 0, true);
  assert.equal(first.omitted.nodes > 0, true);
  assert.equal(first.nodes.some((node) => node.id === 'node-09999' && node.pinned === true), true);
  assert.equal(first.nodes.find((node) => node.id === 'node-09999').renderMode, 'label');
  assert.match(first.meta.viewportPlanHash, /^[0-9a-f]{64}$/u);
  assert.equal(JSON.stringify(graph), before);
});

test('E02B C02: viewport LOD switches low-zoom nodes to dots while selected nodes stay readable', async () => {
  const viewport = await loadModule(path.join('src', 'derived', 'mindmap', 'manualMapViewportPlanner.mjs'));
  const graph = buildLargeGraphFixture(200);
  const plan = viewport.buildManualMapViewportPlan({
    graph,
    viewState: {
      viewport: { x: 0, y: 0, width: 1000, height: 700, zoom: 0.3 },
      selection: { nodeIds: ['node-00003'], primaryNodeId: 'node-00003' },
    },
    limits: { overscanPx: 0, maxNodes: 120, maxEdges: 80, labelZoomThreshold: 0.65 },
  });

  assert.equal(plan.nodes.find((node) => node.id === 'node-00003').renderMode, 'label');
  assert.equal(plan.nodes.some((node) => node.id !== 'node-00003' && node.renderMode === 'dot'), true);
  assert.equal(plan.visibleWorldRect.maxX, 1000 / 0.3);
  assert.equal(plan.visibleWorldRect.maxY, 700 / 0.3);
});

test('E02B C02: pinned edges can be carried without inventing missing endpoint nodes', async () => {
  const viewport = await loadModule(path.join('src', 'derived', 'mindmap', 'manualMapViewportPlanner.mjs'));
  const graph = buildLargeGraphFixture(1000);
  const plan = viewport.buildManualMapViewportPlan({
    graph,
    viewState: {
      viewport: { x: 0, y: 0, width: 240, height: 160, zoom: 1 },
      selection: { edgeIds: ['edge-00999'] },
    },
    limits: { overscanPx: 0, maxNodes: 20, maxEdges: 20 },
  });
  const pinned = plan.edges.find((edge) => edge.id === 'edge-00999');

  assert.equal(Boolean(pinned), true);
  assert.equal(pinned.pinned, true);
  assert.equal(pinned.complete, false);
  assert.equal(plan.nodes.some((node) => node.id === 'node-00998'), false);
  assert.equal(plan.nodes.some((node) => node.id === 'node-00999'), false);
});

test('E02B C02: viewport planner contract is exported through derived barrels', async () => {
  const mindmap = await loadModule(path.join('src', 'derived', 'mindmap', 'index.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));

  assert.equal(mindmap.MANUAL_MAP_VIEWPORT_PLAN_SCHEMA_VERSION, 'manualMap.viewportPlan.v1');
  assert.equal(derived.MANUAL_MAP_VIEWPORT_PLAN_SCHEMA_VERSION, 'manualMap.viewportPlan.v1');
  assert.equal(typeof mindmap.buildManualMapViewportPlan, 'function');
  assert.equal(typeof derived.buildManualMapViewportPlan, 'function');
});

test('E02B C02: viewport planner adds no storage, network, command, worker, or UI bypass', () => {
  const sources = [
    path.join(process.cwd(), 'src', 'derived', 'mindmap', 'manualMapViewportPlanner.mjs'),
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
    /\bWorker\b/u,
    /\bsetTimeout\b/u,
    /\brequestAnimationFrame\b/u,
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
