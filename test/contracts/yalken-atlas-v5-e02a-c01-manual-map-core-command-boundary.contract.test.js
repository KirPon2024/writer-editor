const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildProjectFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const projectId = 'manual-map-project';
  const sceneId = 'scene-a';
  const text = 'Chapter text must not change when manual maps change.';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Manual map draft', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId, text },
    },
  ]);
  assert.equal(built.ok, true);
  return { runtime, projectId, sceneId, text, state: built.state };
}

test('E02A C01: manual map, node, and edge commands persist without changing scene text', async () => {
  const { runtime, projectId, sceneId, text, state } = await buildProjectFixture();
  const result = runtime.applyCoreSequence(state, [
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
      payload: { projectId, mapId: 'map-main', title: 'Main Map' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
      payload: {
        projectId,
        mapId: 'map-main',
        nodeId: 'node-1',
        label: 'Opening idea',
        position: { x: 10, y: 20 },
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
      payload: {
        projectId,
        mapId: 'map-main',
        nodeId: 'node-scene',
        label: 'Scene reference',
        nodeKind: 'sceneRef',
        targetKind: 'scene',
        targetId: sceneId,
        position: { x: 30, y: 40 },
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_EDGE_ADD,
      payload: {
        projectId,
        mapId: 'map-main',
        edgeId: 'edge-1',
        fromNodeId: 'node-1',
        toNodeId: 'node-scene',
        label: 'points to',
      },
    },
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.state.data.projects[projectId].scenes[sceneId].text, text);
  assert.equal(result.state.data.lastCommandId, 6);

  const reopened = JSON.parse(JSON.stringify(result.state));
  const map = reopened.data.projects[projectId].manualMaps.maps['map-main'];
  assert.equal(reopened.data.projects[projectId].manualMaps.schemaVersion, 'manualMap.author.v1');
  assert.equal(map.title, 'Main Map');
  assert.deepEqual(map.nodes['node-1'], {
    id: 'node-1',
    label: 'Opening idea',
    nodeKind: 'note',
    position: { x: 10, y: 20 },
    target: { kind: '', id: '' },
    createdByCommandSeq: 4,
    updatedByCommandSeq: 4,
  });
  assert.deepEqual(map.nodes['node-scene'].target, { kind: 'scene', id: sceneId });
  assert.deepEqual(map.edges['edge-1'], {
    id: 'edge-1',
    fromNodeId: 'node-1',
    toNodeId: 'node-scene',
    edgeKind: 'link',
    label: 'points to',
    createdByCommandSeq: 6,
  });
  assert.equal(map.updatedByCommandSeq, 6);
});

test('E02A C01: manual map reducers fail closed for invalid payloads without mutation', async () => {
  const { runtime, projectId, state } = await buildProjectFixture();
  const beforeHash = runtime.hashCoreState(state);
  const missingMapId = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
    payload: { projectId, mapId: '   ' },
  });
  assert.equal(missingMapId.ok, false);
  assert.equal(missingMapId.error.code, 'E_MANUAL_MAP_ID_REQUIRED');
  assert.equal(missingMapId.stateHash, beforeHash);

  const created = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
    payload: { projectId, mapId: 'map-main' },
  });
  assert.equal(created.ok, true);
  const duplicate = runtime.reduceCoreState(created.state, {
    type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
    payload: { projectId, mapId: 'map-main' },
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error.code, 'E_MANUAL_MAP_ALREADY_EXISTS');
  assert.equal(duplicate.stateHash, runtime.hashCoreState(created.state));

  const missingSceneTarget = runtime.reduceCoreState(created.state, {
    type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
    payload: {
      projectId,
      mapId: 'map-main',
      nodeId: 'node-scene',
      label: 'Lost scene',
      targetKind: 'scene',
      targetId: 'missing-scene',
    },
  });
  assert.equal(missingSceneTarget.ok, false);
  assert.equal(missingSceneTarget.error.code, 'E_MANUAL_MAP_NODE_TARGET_SCENE_NOT_FOUND');
  assert.equal(missingSceneTarget.stateHash, runtime.hashCoreState(created.state));
});

test('E02A C01: manual map commands are admitted only through Command Kernel capability revalidation', async () => {
  const { runtime, projectId, state } = await buildProjectFixture();
  const registryModule = await loadModule(path.join('src', 'renderer', 'commands', 'registry.mjs'));
  const runnerModule = await loadModule(path.join('src', 'renderer', 'commands', 'runCommand.mjs'));
  const registry = registryModule.createCommandRegistry();
  registry.registerCommand(runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE, (input) => {
    return runtime.reduceCoreState(input.state, {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
      payload: input.payload,
    });
  });
  const payload = { projectId, mapId: 'map-main', title: 'Main Map' };

  const webRunner = runnerModule.createCommandRunner(registry, {
    capability: { defaultPlatformId: 'web' },
  });
  const denied = await webRunner(runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE, { state, payload });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');

  const nodeRunner = runnerModule.createCommandRunner(registry, {
    capability: { defaultPlatformId: 'node', entitlementTier: 'free' },
  });
  const admitted = await nodeRunner(runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE, { state, payload });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.state.data.projects[projectId].manualMaps.maps['map-main'].title, 'Main Map');
});

test('E02A C01: manual map boundary adds no private storage, network, or platform bypass', () => {
  const sources = [
    path.join(process.cwd(), 'src', 'core', 'runtime.mjs'),
    path.join(process.cwd(), 'src', 'renderer', 'commands', 'capabilityPolicy.mjs'),
  ];
  const forbidden = [
    /from\s+['"]node:fs['"]/u,
    /from\s+['"]node:child_process['"]/u,
    /from\s+['"]node:http['"]/u,
    /from\s+['"]node:https['"]/u,
    /from\s+['"]node:net['"]/u,
    /from\s+['"]electron['"]/u,
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
