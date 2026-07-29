const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

function buildGraphFixture() {
  return {
    schemaVersion: 'derived.manualMap.graph.v1',
    projectId: 'manual-map-list-project',
    mapId: 'manual-map-list',
    title: 'Manual Map List',
    nodes: [
      {
        id: 'node-a',
        label: 'Alpha',
        kind: 'sceneRef',
        position: { x: 0, y: 0 },
        target: { kind: 'scene', id: 'scene-a' },
      },
      {
        id: 'node-c',
        label: 'Gamma',
        kind: 'note',
        position: { x: 100, y: 100 },
        target: { kind: '', id: '' },
      },
      {
        id: 'node-b',
        label: 'Beta',
        kind: 'note',
        position: { x: 100, y: 0 },
        target: { kind: '', id: '' },
      },
    ],
    edges: [
      {
        id: 'edge-main',
        from: 'node-a',
        to: 'node-b',
        kind: 'link',
        label: 'Alpha to Beta',
      },
      {
        id: 'edge-corrupt',
        from: 'node-a',
        to: 'missing-node',
        kind: 'link',
        label: 'Broken',
      },
    ],
  };
}

test('E02B C03: list parity model exposes every reachable graph item as deterministic rows', async () => {
  const parity = await loadModule(path.join('src', 'derived', 'mindmap', 'manualMapListKeyboardParity.mjs'));
  const graph = buildGraphFixture();
  const before = JSON.stringify(graph);
  const first = parity.buildManualMapListParityModel({
    graph,
    viewState: {
      selection: {
        nodeIds: ['node-b', 'missing-node'],
        edgeIds: ['edge-main'],
        focusedNodeId: 'node-b',
      },
    },
  });
  const second = parity.buildManualMapListParityModel({
    graph,
    viewState: {
      selection: {
        nodeIds: ['node-b', 'missing-node'],
        edgeIds: ['edge-main'],
        focusedNodeId: 'node-b',
      },
    },
  });

  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, 'manualMap.listParity.v1');
  assert.equal(first.sourceSchemaVersion, 'derived.manualMap.graph.v1');
  assert.deepEqual(first.rows.map((row) => row.rowId), [
    'node:node-a',
    'node:node-b',
    'node:node-c',
    'edge:edge-main',
  ]);
  assert.equal(first.listState.activeRowId, 'node:node-b');
  assert.equal(first.rows.find((row) => row.rowId === 'node:node-b').selected, true);
  assert.equal(first.rows.find((row) => row.rowId === 'node:node-b').focused, true);
  assert.equal(first.rows.find((row) => row.rowId === 'edge:edge-main').selected, true);
  assert.deepEqual(first.rows.map((row) => row.accessibility.posInSet), [1, 2, 3, 4]);
  assert.equal(first.rows.every((row) => row.accessibility.role === 'option'), true);
  assert.deepEqual(first.counts, { rows: 4, nodes: 3, edges: 1, selectedRows: 2 });
  assert.match(first.meta.listParityHash, /^[0-9a-f]{64}$/u);
  assert.equal(JSON.stringify(graph), before);
});

test('E02B C03: keyboard activation reaches the same selection state as pointer intents', async () => {
  const parity = await loadModule(path.join('src', 'derived', 'mindmap', 'manualMapListKeyboardParity.mjs'));
  const interaction = await loadModule(path.join('src', 'derived', 'mindmap', 'manualMapInteraction.mjs'));
  const graph = buildGraphFixture();
  const start = {
    viewport: { x: 0, y: 0, width: 800, height: 600, zoom: 1 },
    selection: {},
  };
  const moved = parity.reduceManualMapListKeyboardIntent({
    graph,
    viewState: start,
    listState: { activeRowId: 'node:node-a' },
    key: 'ArrowDown',
  });
  const activatedNode = parity.reduceManualMapListKeyboardIntent({
    graph,
    viewState: moved.viewState,
    listState: moved.listState,
    key: 'Enter',
  });
  const pointerNode = interaction.reduceManualMapViewIntent(start, {
    type: interaction.MANUAL_MAP_VIEW_INTENT.SELECT_NODE,
    payload: { nodeId: 'node-b' },
  }, graph);

  assert.equal(moved.reason, 'NAVIGATED_LIST');
  assert.equal(moved.listState.activeRowId, 'node:node-b');
  assert.deepEqual(moved.viewState, interaction.normalizeManualMapViewState(start, graph));
  assert.equal(activatedNode.reason, 'ACTIVATED_ROW');
  assert.deepEqual(activatedNode.viewState.selection, pointerNode.selection);

  const movedToEdge = parity.reduceManualMapListKeyboardIntent({
    graph,
    viewState: activatedNode.viewState,
    listState: activatedNode.listState,
    key: 'End',
  });
  const activatedEdge = parity.reduceManualMapListKeyboardIntent({
    graph,
    viewState: movedToEdge.viewState,
    listState: movedToEdge.listState,
    key: ' ',
    additive: true,
  });
  const pointerEdge = interaction.reduceManualMapViewIntent(pointerNode, {
    type: interaction.MANUAL_MAP_VIEW_INTENT.SELECT_EDGE,
    payload: { edgeId: 'edge-main', additive: true },
  }, graph);

  assert.equal(movedToEdge.listState.activeRowId, 'edge:edge-main');
  assert.deepEqual(activatedEdge.selectionIntent, {
    type: interaction.MANUAL_MAP_VIEW_INTENT.SELECT_EDGE,
    payload: { edgeId: 'edge-main', additive: true },
  });
  assert.deepEqual(activatedEdge.viewState.selection, pointerEdge.selection);
});

test('E02B C03: keyboard clear is bounded and list state remains transient', async () => {
  const parity = await loadModule(path.join('src', 'derived', 'mindmap', 'manualMapListKeyboardParity.mjs'));
  const graph = buildGraphFixture();
  const cleared = parity.reduceManualMapListKeyboardIntent({
    graph,
    viewState: {
      selection: {
        nodeIds: ['node-a'],
        edgeIds: ['edge-main'],
        focusedNodeId: 'node-c',
      },
    },
    listState: { activeRowId: 'edge:edge-main' },
    key: 'Escape',
  });
  const unknown = parity.reduceManualMapListKeyboardIntent({
    graph,
    viewState: cleared.viewState,
    listState: cleared.listState,
    key: 'PageDown',
  });

  assert.equal(cleared.reason, 'CLEARED_SELECTION');
  assert.deepEqual(cleared.viewState.selection, {
    nodeIds: [],
    edgeIds: [],
    primaryNodeId: '',
    focusedNodeId: 'node-c',
  });
  assert.equal(cleared.listState.activeRowId, 'edge:edge-main');
  assert.equal(unknown.reason, 'NO_MATCHING_KEY');
  assert.deepEqual(unknown.viewState, cleared.viewState);
  assert.deepEqual(unknown.listState, cleared.listState);
});

test('E02B C03: list keyboard parity contract is exported through derived barrels', async () => {
  const mindmap = await loadModule(path.join('src', 'derived', 'mindmap', 'index.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));

  assert.equal(mindmap.MANUAL_MAP_LIST_PARITY_SCHEMA_VERSION, 'manualMap.listParity.v1');
  assert.equal(mindmap.MANUAL_MAP_LIST_STATE_SCHEMA_VERSION, 'manualMap.listState.v1');
  assert.equal(derived.MANUAL_MAP_KEYBOARD_INTENT_SCHEMA_VERSION, 'manualMap.keyboardIntent.v1');
  assert.equal(derived.MANUAL_MAP_LIST_ROW_KIND.NODE, 'node');
  assert.equal(derived.MANUAL_MAP_LIST_KEY_ACTION.ACTIVATE, 'activate');
  assert.equal(typeof mindmap.buildManualMapListParityModel, 'function');
  assert.equal(typeof derived.reduceManualMapListKeyboardIntent, 'function');
});

test('E02B C03: list keyboard parity adds no storage, network, worker, command, or UI bypass', () => {
  const sources = [
    path.join(process.cwd(), 'src', 'derived', 'mindmap', 'manualMapListKeyboardParity.mjs'),
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
