const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildManualMapGraphFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const manualMap = await loadModule(path.join('src', 'derived', 'mindmap', 'deriveManualMapGraph.mjs'));
  const projectId = 'manual-map-export-project';
  const sceneId = 'scene-a';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Manual map export', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId, text: 'Manual map fixture source text.' },
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
        label: 'Second note',
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

  const projected = manualMap.deriveManualMapGraph({
    coreState: built.state,
    params: { projectId, mapId: 'map-main' },
    capabilitySnapshot: { platformId: 'node', capabilities: { manualMapView: true } },
  });
  assert.equal(projected.ok, true);
  return { projectId, sceneId, graph: projected.value };
}

test('E02A C03: manual map export fixture is deterministic and recovery-readable', async () => {
  const { projectId, sceneId, graph } = await buildManualMapGraphFixture();
  const exporter = await loadModule(path.join('src', 'export', 'mindmap', 'v1', 'index.mjs'));
  const first = exporter.serializeManualMapExportJsonV1WithLossReport(graph);
  const second = exporter.serializeManualMapExportJsonV1WithLossReport(graph);

  assert.deepEqual(first, second);
  assert.equal(first.json.endsWith('\n'), true);
  assert.equal(exporter.serializeManualMapExportJsonV1(graph), first.json);
  assert.equal(first.lossReport.count, 0);

  const payload = JSON.parse(first.json);
  assert.equal(payload.schemaVersion, 'manualMap.export.json.v1');
  assert.equal(payload.format, 'manual-map-json');
  assert.equal(payload.sourceSchemaVersion, 'derived.manualMap.graph.v1');
  assert.equal(payload.projectId, projectId);
  assert.equal(payload.mapId, 'map-main');
  assert.equal(payload.title, 'Main Map');
  assert.deepEqual(payload.nodes.map((node) => node.id), ['node-a', 'node-b']);
  assert.deepEqual(payload.nodes.find((node) => node.id === 'node-a'), {
    id: 'node-a',
    label: 'First scene',
    kind: 'sceneRef',
    position: { x: 5, y: 7 },
    target: { kind: 'scene', id: sceneId },
  });
  assert.deepEqual(payload.nodes.find((node) => node.id === 'node-b').position, { x: 20, y: 10 });
  assert.deepEqual(payload.edges, [{
    id: 'edge-main',
    from: 'node-a',
    to: 'node-b',
    kind: 'causes',
    label: 'leads to',
  }]);
  assert.deepEqual(payload.recovery.humanReadable, true);
  assert.match(payload.recovery.summary, /Main Map: 2 nodes, 1 edges/u);
  assert.match(payload.recovery.graphHash, /^[0-9a-f]{64}$/u);
});

test('E02A C03: manual map export fixture keeps recovery explicit for invalid source graph', async () => {
  const exporter = await loadModule(path.join('src', 'export', 'mindmap', 'v1', 'index.mjs'));
  const { json, lossReport } = exporter.serializeManualMapExportJsonV1WithLossReport({
    schemaVersion: 'derived.manualMap.graph.v1',
    projectId: 'project-a',
    mapId: 'map-a',
    title: '',
    nodes: [
      null,
      { id: 'node-a', label: '', position: { x: 'bad', y: 4 } },
      { id: 'node-a', label: 'Duplicate', position: { x: 8, y: 9 } },
    ],
    edges: [
      { id: 'edge-missing', from: '', to: 'node-a' },
      { id: 'edge-unknown', from: 'node-a', to: 'ghost' },
      { id: 'edge-kept', from: 'node-a', to: 'node-a#3', label: 'restored' },
    ],
  });

  const payload = JSON.parse(json);
  assert.equal(payload.recovery.humanReadable, true);
  assert.equal(payload.recovery.summary, 'map-a: 2 nodes, 1 edges');
  assert.deepEqual(payload.nodes.map((node) => node.id), ['node-a', 'node-a#3']);
  assert.deepEqual(payload.nodes[0].position, { x: 0, y: 4 });
  assert.deepEqual(payload.edges, [{
    id: 'edge-kept',
    from: 'node-a',
    to: 'node-a#3',
    kind: 'link',
    label: 'restored',
  }]);
  assert.equal(lossReport.count, 6);
  assert.deepEqual(lossReport.items.map((item) => item.reasonCode), [
    'MMANV1_DUPLICATE_NODE_ID_REWRITTEN',
    'MMANV1_NODE_LABEL_NORMALIZED',
    'MMANV1_NODE_POSITION_NORMALIZED',
    'MMANV1_EDGE_ENDPOINT_MISSING_DROPPED',
    'MMANV1_EDGE_ENDPOINT_UNKNOWN_DROPPED',
    'MMANV1_INVALID_NODE_SHAPE_DROPPED',
  ]);

  const downgraded = exporter.serializeManualMapExportJsonV1WithLossReport(null);
  assert.equal(JSON.parse(downgraded.json).recovery.summary, 'Untitled manual map: 0 nodes, 0 edges');
  assert.equal(downgraded.lossReport.items[0].reasonCode, 'MMANV1_INVALID_GRAPH_SHAPE_DOWNGRADED');
});

test('E02A C03: manual map export fixture does not mutate source graph', async () => {
  const { graph } = await buildManualMapGraphFixture();
  const exporter = await loadModule(path.join('src', 'export', 'mindmap', 'v1', 'index.mjs'));
  const before = JSON.stringify(graph);

  exporter.serializeManualMapExportJsonV1WithLossReport(graph);

  assert.equal(JSON.stringify(graph), before);
});

test('E02A C03: manual map durable fixture does not claim a user-facing export command', () => {
  const commandSources = [
    path.join(process.cwd(), 'src', 'renderer', 'commands', 'projectCommands.mjs'),
    path.join(process.cwd(), 'src', 'renderer', 'commands', 'commandNamespaceCanon.mjs'),
    path.join(process.cwd(), 'src', 'renderer', 'commands', 'capabilityPolicy.mjs'),
  ];
  const forbiddenCommandClaims = [
    /\bmanualMap\.export\b/u,
    /\bcmd\.project\.exportManualMap\b/u,
    /\bcmd\.project\.export\.manualMapV1\b/u,
    /\bEXPORT_MANUAL_MAP\b/u,
  ];

  for (const sourcePath of commandSources) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    for (const pattern of forbiddenCommandClaims) {
      assert.doesNotMatch(source, pattern, `${path.basename(sourcePath)} matched ${pattern.source}`);
    }
  }
});

test('E02A C03: manual map durable fixture adds no private storage, network, or platform bypass', () => {
  const sources = [
    path.join(process.cwd(), 'src', 'export', 'mindmap', 'v1', 'serializeManualMapV1.mjs'),
    path.join(process.cwd(), 'src', 'export', 'mindmap', 'v1', 'index.mjs'),
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
  ];

  for (const sourcePath of sources) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${path.basename(sourcePath)} matched ${pattern.source}`);
    }
  }
});
