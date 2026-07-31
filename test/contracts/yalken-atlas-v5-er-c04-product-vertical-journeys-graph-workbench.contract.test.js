const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  return import(pathToFileURL(path.join(process.cwd(), relativePath)).href);
}

async function buildFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const projectId = 'er-c04-project';
  const sceneId = 'scene-a';
  const initial = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    { type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE, payload: { projectId, title: 'ER C04', sceneId } },
    { type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT, payload: { projectId, sceneId, text: 'Ada met Bruno in chapter one.' } },
    { type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE, payload: { projectId, entityId: 'entity-ada', name: 'Ada', entityKind: 'character' } },
    { type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE, payload: { projectId, entityId: 'entity-bruno', name: 'Bruno', entityKind: 'character' } },
    { type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE, payload: { projectId, mapId: 'map-main', title: 'Graph workbench' } },
  ]);
  assert.equal(initial.ok, true);
  return { runtime, projectId, sceneId, state: initial.state };
}

test('ER C04: Manual Map workbench commands create, edit, delete, group and preserve scene text', async () => {
  const { runtime, projectId, sceneId, state } = await buildFixture();
  const textBefore = state.data.projects[projectId].scenes[sceneId].text;
  const result = runtime.applyCoreSequence(state, [
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
      payload: {
        projectId,
        mapId: 'map-main',
        nodeId: 'node-scene',
        label: 'Scene link',
        nodeKind: 'scene',
        targetKind: 'scene',
        targetId: sceneId,
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
      payload: {
        projectId,
        mapId: 'map-main',
        nodeId: 'node-entity',
        label: 'Ada',
        nodeKind: 'entity',
        targetKind: 'entity',
        targetId: 'entity-ada',
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_EDGE_ADD,
      payload: {
        projectId,
        mapId: 'map-main',
        edgeId: 'edge-a',
        fromNodeId: 'node-scene',
        toNodeId: 'node-entity',
        label: 'mentions',
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_GROUP_CREATE,
      payload: {
        projectId,
        mapId: 'map-main',
        groupId: 'group-a',
        label: 'Scene evidence',
        nodeIds: ['node-entity', 'node-scene'],
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_UPDATE,
      payload: {
        projectId,
        mapId: 'map-main',
        nodeId: 'node-entity',
        label: 'Ada Lovelace',
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_EDGE_UPDATE,
      payload: {
        projectId,
        mapId: 'map-main',
        edgeId: 'edge-a',
        label: 'confirmed evidence',
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_GROUP_UPDATE,
      payload: {
        projectId,
        mapId: 'map-main',
        groupId: 'group-a',
        colorTag: 'neutral',
        nodeIds: ['node-scene', 'node-entity'],
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_EDGE_DELETE,
      payload: { projectId, mapId: 'map-main', edgeId: 'edge-a' },
    },
  ]);

  assert.equal(result.ok, true);
  const project = result.state.data.projects[projectId];
  assert.equal(project.scenes[sceneId].text, textBefore);
  const map = project.manualMaps.maps['map-main'];
  assert.equal(map.nodes['node-entity'].label, 'Ada Lovelace');
  assert.equal(map.nodes['node-entity'].target.kind, 'entity');
  assert.equal(map.groups['group-a'].colorTag, 'neutral');
  assert.deepEqual(map.groups['group-a'].nodeIds, ['node-entity', 'node-scene']);
  assert.equal(map.edges['edge-a'], undefined);
});

test('ER C04: Manual Map target and group validation fail closed before mutation', async () => {
  const { runtime, projectId, state } = await buildFixture();
  const beforeHash = runtime.hashCoreState(state);
  const missingEntity = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
    payload: {
      projectId,
      mapId: 'map-main',
      nodeId: 'node-missing-entity',
      label: 'Missing',
      targetKind: 'entity',
      targetId: 'entity-missing',
    },
  });
  assert.equal(missingEntity.ok, false);
  assert.equal(missingEntity.error.code, 'E_MANUAL_MAP_NODE_TARGET_ENTITY_NOT_FOUND');
  assert.equal(missingEntity.stateHash, beforeHash);

  const node = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
    payload: { projectId, mapId: 'map-main', nodeId: 'node-a', label: 'A' },
  });
  assert.equal(node.ok, true);
  const invalidGroup = runtime.reduceCoreState(node.state, {
    type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_GROUP_CREATE,
    payload: {
      projectId,
      mapId: 'map-main',
      groupId: 'group-invalid',
      label: 'Invalid',
      nodeIds: ['node-a', 'node-missing'],
    },
  });
  assert.equal(invalidGroup.ok, false);
  assert.equal(invalidGroup.error.code, 'E_MANUAL_MAP_GROUP_NODE_IDS_INVALID');
  assert.equal(invalidGroup.stateHash, runtime.hashCoreState(node.state));
});

test('ER C04: derived graph and list fallback expose groups with keyboard-list parity', async () => {
  const { runtime, projectId, sceneId, state } = await buildFixture();
  const graphModule = await loadModule(path.join('src', 'derived', 'mindmap', 'deriveManualMapGraph.mjs'));
  const listModule = await loadModule(path.join('src', 'derived', 'mindmap', 'manualMapListKeyboardParity.mjs'));
  const result = runtime.applyCoreSequence(state, [
    { type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD, payload: { projectId, mapId: 'map-main', nodeId: 'node-a', label: 'A', targetKind: 'scene', targetId: sceneId } },
    { type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD, payload: { projectId, mapId: 'map-main', nodeId: 'node-b', label: 'B' } },
    { type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_EDGE_ADD, payload: { projectId, mapId: 'map-main', edgeId: 'edge-a', fromNodeId: 'node-a', toNodeId: 'node-b' } },
    { type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_GROUP_CREATE, payload: { projectId, mapId: 'map-main', groupId: 'group-a', label: 'Group A', nodeIds: ['node-a', 'node-b'] } },
  ]);
  assert.equal(result.ok, true);

  const graph = graphModule.deriveManualMapGraph({
    coreState: result.state,
    params: { projectId, mapId: 'map-main' },
    capabilitySnapshot: { platformId: 'node', capabilities: { 'manualMap.view': true } },
  });
  assert.equal(graph.ok, true);
  assert.equal(graph.value.groups.length, 1);
  assert.equal(graph.value.groups[0].id, 'group-a');
  const list = listModule.buildManualMapListParityModel({ graph: graph.value });
  assert.equal(list.counts.groups, 1);
  assert.equal(list.rows.some((row) => row.rowKind === 'group' && row.accessibility.role === 'option'), true);
});

test('ER C04: query and command registries expose workbench/inspector through shared authority', async () => {
  const queryRegistry = require(path.join(process.cwd(), 'src', 'shared', 'workspaceQueryRegistry.cjs'));
  const commandRegistry = require(path.join(process.cwd(), 'src', 'shared', 'productCommandRegistry.cjs'));
  assert.equal(queryRegistry.WORKSPACE_QUERY_ID_SET.has(queryRegistry.WORKSPACE_QUERY_IDS.MANUAL_MAP_WORKBENCH), true);
  assert.equal(queryRegistry.WORKSPACE_QUERY_ID_SET.has(queryRegistry.WORKSPACE_QUERY_IDS.PROJECTION_INSPECTOR), true);
  for (const commandId of [
    'manualMap.node.update',
    'manualMap.node.delete',
    'manualMap.edge.update',
    'manualMap.edge.delete',
    'manualMap.group.create',
    'manualMap.group.update',
    'manualMap.group.delete',
  ]) {
    assert.equal(commandRegistry.PRODUCT_COMMAND_ID_SET.has(commandId), true, commandId);
    assert.equal(commandRegistry.getProductCommandRecord(commandId).commandAuthority, 'CommandKernel');
  }

  const mainSource = fs.readFileSync(path.join(process.cwd(), 'src', 'main.js'), 'utf8');
  assert.match(mainSource, /async function dispatchProductCommandBridge/u);
  assert.match(mainSource, /reduceCoreState\(binding\.coreState/u);
  assert.match(mainSource, /persistProjectManifestAtPath\(binding\.manifestPath/u);
  assert.doesNotMatch(mainSource, /PRODUCT_COMMAND_REQUIRES_PROJECT_KERNEL_ADAPTER/u);
});

test('ER C04: renderer surfaces dispatch product mutations only through UI command bridge path', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'index.html'), 'utf8');
  assert.match(html, /data-atlas-journey-host/u);
  assert.match(html, /data-manual-map-workbench-host/u);
  assert.match(html, /data-projection-inspector-host/u);

  const source = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'editor.js'), 'utf8');
  assert.match(source, /runProductJourneyCommand/u);
  assert.match(source, /dispatchUiCommand\(commandId/u);
  assert.match(source, /manualMap\.group\.create/u);
  assert.match(source, /meaning\.promote via CommandKernel only/u);
  assert.doesNotMatch(source, /manualMaps\s*=\s*\{/u);
  assert.doesNotMatch(source, /writeFileAtomic/u);
  assert.doesNotMatch(source, /ipcRenderer\.send\(.*manualMap/u);
});
