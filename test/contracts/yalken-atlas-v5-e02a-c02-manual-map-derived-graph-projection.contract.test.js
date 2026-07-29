const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildManualMapFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const projectId = 'manual-map-derived-project';
  const sceneId = 'scene-a';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Manual map projection', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
      payload: { projectId, mapId: 'map-main', title: 'Main Map' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
      payload: {
        projectId,
        mapId: 'map-main',
        nodeId: 'node-b',
        label: 'Second',
        position: { x: 20, y: 10 },
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
      payload: {
        projectId,
        mapId: 'map-main',
        nodeId: 'node-a',
        label: 'First scene',
        nodeKind: 'sceneRef',
        targetKind: 'scene',
        targetId: sceneId,
        position: { x: 5, y: 7 },
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
        edgeKind: 'causes',
        label: 'leads to',
      },
    },
  ]);
  assert.equal(built.ok, true);
  return { runtime, projectId, sceneId, state: built.state };
}

test('E02A C02: manual map graph projection is read-only and deterministic', async () => {
  const { projectId, sceneId, state } = await buildManualMapFixture();
  const manualMap = await loadModule(path.join('src', 'derived', 'mindmap', 'deriveManualMapGraph.mjs'));
  const input = {
    coreState: state,
    params: { projectId, mapId: 'map-main' },
    capabilitySnapshot: { platformId: 'node', capabilities: { manualMapView: true } },
  };
  const first = manualMap.deriveManualMapGraph(input);
  const second = manualMap.deriveManualMapGraph(input);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(first, second);
  assert.equal(first.value.schemaVersion, 'derived.manualMap.graph.v1');
  assert.equal(first.value.projectId, projectId);
  assert.equal(first.value.mapId, 'map-main');
  assert.equal(first.value.title, 'Main Map');
  assert.equal(first.value.nodes.length, 2);
  assert.deepEqual(first.value.nodes.map((node) => node.id), ['node-b', 'node-a']);
  assert.deepEqual(first.value.nodes.find((node) => node.id === 'node-a').target, { kind: 'scene', id: sceneId });
  assert.deepEqual(first.value.edges, [{
    id: 'edge-main',
    from: 'node-a',
    to: 'node-b',
    kind: 'causes',
    label: 'leads to',
  }]);
  assert.match(first.value.meta.graphHash, /^[0-9a-f]{64}$/u);
  assert.match(first.meta.invalidationKey, /^[0-9a-f]{64}$/u);
  assert.deepEqual(state, input.coreState);
});

test('E02A C02: graph invalidation key changes when manual map truth changes', async () => {
  const { runtime, projectId, state } = await buildManualMapFixture();
  const manualMap = await loadModule(path.join('src', 'derived', 'mindmap', 'deriveManualMapGraph.mjs'));
  const before = manualMap.deriveManualMapGraph({
    coreState: state,
    params: { projectId, mapId: 'map-main' },
    capabilitySnapshot: { platformId: 'node', capabilities: { manualMapView: true } },
  });
  assert.equal(before.ok, true);

  const changed = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
    payload: {
      projectId,
      mapId: 'map-main',
      nodeId: 'node-c',
      label: 'Third',
    },
  });
  assert.equal(changed.ok, true);
  const after = manualMap.deriveManualMapGraph({
    coreState: changed.state,
    params: { projectId, mapId: 'map-main' },
    capabilitySnapshot: { platformId: 'node', capabilities: { manualMapView: true } },
  });

  assert.equal(after.ok, true);
  assert.notEqual(after.meta.invalidationKey, before.meta.invalidationKey);
  assert.notEqual(after.value.meta.graphHash, before.value.meta.graphHash);
  assert.equal(after.value.nodes.length, 3);
});

test('E02A C02: manual map graph fails closed for missing map and disabled capability', async () => {
  const { projectId, state } = await buildManualMapFixture();
  const manualMap = await loadModule(path.join('src', 'derived', 'mindmap', 'deriveManualMapGraph.mjs'));
  const missing = manualMap.deriveManualMapGraph({
    coreState: state,
    params: { projectId, mapId: 'missing-map' },
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, 'E_MANUAL_MAP_NOT_FOUND');
  assert.equal(missing.error.reason, 'MAP_NOT_FOUND');

  const disabled = manualMap.deriveManualMapGraph({
    coreState: state,
    params: { projectId, mapId: 'map-main' },
    capabilitySnapshot: { platformId: 'node', capabilities: { manualMapView: false } },
  });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
});

test('E02A C02: manual map graph ignores corrupt edges instead of inventing nodes', async () => {
  const { projectId, state } = await buildManualMapFixture();
  const manualMap = await loadModule(path.join('src', 'derived', 'mindmap', 'deriveManualMapGraph.mjs'));
  const corrupted = JSON.parse(JSON.stringify(state));
  corrupted.data.projects[projectId].manualMaps.maps['map-main'].edges['edge-corrupt'] = {
    id: 'edge-corrupt',
    fromNodeId: 'missing',
    toNodeId: 'node-a',
    edgeKind: 'ghost',
  };

  const projected = manualMap.deriveManualMapGraph({
    coreState: corrupted,
    params: { projectId, mapId: 'map-main' },
  });

  assert.equal(projected.ok, true);
  assert.equal(projected.value.nodes.some((node) => node.id === 'missing'), false);
  assert.equal(projected.value.edges.some((edge) => edge.id === 'edge-corrupt'), false);
  assert.equal(projected.value.edges.length, 1);
});

test('E02A C02: manual map graph projection adds no storage, network, platform, or hot-path bypass', () => {
  const sources = [
    path.join(process.cwd(), 'src', 'derived', 'mindmap', 'deriveManualMapGraph.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'mindmap', 'mindMapGraphTypes.mjs'),
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
    /addEventListener\s*\(\s*['"](?:beforeinput|input|keydown)['"]/u,
    /dispatchUiCommand/u,
  ];

  for (const sourcePath of sources) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${path.basename(sourcePath)} matched ${pattern.source}`);
    }
  }
});
