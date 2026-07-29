const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildGraphFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const manualMap = await loadModule(path.join('src', 'derived', 'mindmap', 'deriveManualMapGraph.mjs'));
  const projectId = 'manual-map-interaction-project';
  const sceneId = 'scene-a';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Manual map interaction', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
      payload: { projectId, mapId: 'map-main', title: 'Interaction Map' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
      payload: {
        projectId,
        mapId: 'map-main',
        nodeId: 'node-a',
        label: 'Scene node',
        nodeKind: 'sceneRef',
        targetKind: 'scene',
        targetId: sceneId,
        position: { x: 8, y: 9 },
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
      payload: {
        projectId,
        mapId: 'map-main',
        nodeId: 'node-b',
        label: 'Note node',
        position: { x: 20, y: 40 },
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_EDGE_ADD,
      payload: {
        projectId,
        mapId: 'map-main',
        edgeId: 'edge-main',
        fromNodeId: 'node-a',
        toNodeId: 'node-b',
      },
    },
  ]);
  assert.equal(built.ok, true);
  const projected = manualMap.deriveManualMapGraph({
    coreState: built.state,
    params: { projectId, mapId: 'map-main' },
  });
  assert.equal(projected.ok, true);
  return { runtime, state: built.state, graph: projected.value };
}

test('E02B C01: graph interaction model keeps ViewState outside manual map truth', async () => {
  const { runtime, state, graph } = await buildGraphFixture();
  const interaction = await loadModule(path.join('src', 'derived', 'mindmap', 'manualMapInteraction.mjs'));
  const beforeHash = runtime.hashCoreState(state);
  const beforeGraph = JSON.stringify(graph);
  const model = interaction.buildManualMapInteractionModel({
    graph,
    viewState: {
      viewport: { x: 12, y: 24, width: 640, height: 480, zoom: 1.5 },
      selection: {
        nodeIds: ['node-b', 'missing-node', 'node-a', 'node-a'],
        edgeIds: ['edge-main', 'missing-edge'],
        primaryNodeId: 'node-b',
        focusedNodeId: 'node-a',
      },
    },
  });

  assert.equal(model.schemaVersion, 'manualMap.interaction.v1');
  assert.equal(model.sourceSchemaVersion, 'derived.manualMap.graph.v1');
  assert.equal(model.mapId, 'map-main');
  assert.deepEqual(model.viewState.viewport, { x: 12, y: 24, width: 640, height: 480, zoom: 1.5 });
  assert.deepEqual(model.viewState.selection, {
    nodeIds: ['node-a', 'node-b'],
    edgeIds: ['edge-main'],
    primaryNodeId: 'node-b',
    focusedNodeId: 'node-a',
  });
  assert.equal(model.nodes.find((node) => node.id === 'node-a').selected, true);
  assert.equal(model.nodes.find((node) => node.id === 'node-a').focused, true);
  assert.equal(model.nodes.find((node) => node.id === 'node-b').selected, true);
  assert.deepEqual(model.counts, { nodes: 2, edges: 1, selectedNodes: 2, selectedEdges: 1 });
  assert.match(model.meta.interactionHash, /^[0-9a-f]{64}$/u);
  assert.equal(runtime.hashCoreState(state), beforeHash);
  assert.equal(JSON.stringify(graph), beforeGraph);
});

test('E02B C01: ViewState intents are deterministic, bounded, and graph-validated', async () => {
  const { graph } = await buildGraphFixture();
  const interaction = await loadModule(path.join('src', 'derived', 'mindmap', 'manualMapInteraction.mjs'));
  const start = interaction.normalizeManualMapViewState({
    viewport: { x: 'bad', y: 0, width: 500, height: 300, zoom: 1 },
  }, graph);
  const panned = interaction.reduceManualMapViewIntent(start, {
    type: interaction.MANUAL_MAP_VIEW_INTENT.PAN,
    payload: { dx: 10, dy: -5 },
  }, graph);
  const zoomed = interaction.reduceManualMapViewIntent(panned, {
    type: interaction.MANUAL_MAP_VIEW_INTENT.ZOOM,
    payload: { factor: 99 },
  }, graph);
  const selected = interaction.reduceManualMapViewIntent(zoomed, {
    type: interaction.MANUAL_MAP_VIEW_INTENT.SELECT_NODE,
    payload: { nodeId: 'node-a' },
  }, graph);
  const additive = interaction.reduceManualMapViewIntent(selected, {
    type: interaction.MANUAL_MAP_VIEW_INTENT.SELECT_EDGE,
    payload: { edgeId: 'edge-main', additive: true },
  }, graph);
  const unknown = interaction.reduceManualMapViewIntent(additive, {
    type: interaction.MANUAL_MAP_VIEW_INTENT.SELECT_NODE,
    payload: { nodeId: 'ghost' },
  }, graph);
  const focused = interaction.reduceManualMapViewIntent(unknown, {
    type: interaction.MANUAL_MAP_VIEW_INTENT.FOCUS_NODE,
    payload: { nodeId: 'node-b' },
  }, graph);
  const cleared = interaction.reduceManualMapViewIntent(focused, {
    type: interaction.MANUAL_MAP_VIEW_INTENT.CLEAR_SELECTION,
  }, graph);

  assert.deepEqual(start.viewport, { x: 0, y: 0, width: 500, height: 300, zoom: 1 });
  assert.deepEqual(panned.viewport, { x: 10, y: -5, width: 500, height: 300, zoom: 1 });
  assert.equal(zoomed.viewport.zoom, 4);
  assert.deepEqual(selected.selection, {
    nodeIds: ['node-a'],
    edgeIds: [],
    primaryNodeId: 'node-a',
    focusedNodeId: '',
  });
  assert.deepEqual(additive.selection, {
    nodeIds: ['node-a'],
    edgeIds: ['edge-main'],
    primaryNodeId: 'node-a',
    focusedNodeId: '',
  });
  assert.deepEqual(unknown, additive);
  assert.deepEqual(cleared.selection, {
    nodeIds: [],
    edgeIds: [],
    primaryNodeId: '',
    focusedNodeId: 'node-b',
  });
});

test('E02B C01: interaction contract is exported through derived barrels', async () => {
  const mindmap = await loadModule(path.join('src', 'derived', 'mindmap', 'index.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));

  assert.equal(mindmap.MANUAL_MAP_INTERACTION_SCHEMA_VERSION, 'manualMap.interaction.v1');
  assert.equal(derived.MANUAL_MAP_VIEW_STATE_SCHEMA_VERSION, 'manualMap.viewState.v1');
  assert.equal(typeof mindmap.buildManualMapInteractionModel, 'function');
  assert.equal(typeof derived.reduceManualMapViewIntent, 'function');
});

test('E02B C01: graph interaction boundary adds no storage, network, command, or UI bypass', () => {
  const sources = [
    path.join(process.cwd(), 'src', 'derived', 'mindmap', 'manualMapInteraction.mjs'),
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
