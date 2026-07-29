const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildSourceExportFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'mindmap', 'deriveManualMapGraph.mjs'));
  const exporter = await loadModule(path.join('src', 'export', 'mindmap', 'v1', 'index.mjs'));
  const projectId = 'json-repeat-source-project';
  const mapId = 'map-main';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'JSON repeat import source', sceneId: 'scene-a' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
      payload: { projectId, mapId, title: 'Portable JSON Map' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
      payload: { projectId, mapId: 'map-reference', title: 'Reference Map' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
      payload: {
        projectId,
        mapId,
        nodeId: 'node-root',
        label: 'Root',
        nodeKind: 'claim',
        position: { x: 1, y: 2 },
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
      payload: {
        projectId,
        mapId,
        nodeId: 'node-free',
        label: 'Free node',
        position: { x: 3, y: 4 },
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
      payload: {
        projectId,
        mapId: 'map-reference',
        nodeId: 'node-target',
        label: 'Target node',
        position: { x: 5, y: 6 },
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_TEMPLATE_APPLY,
      payload: {
        projectId,
        mapId,
        templateInstanceId: 'template-sequence-1',
        templateId: 'sequence',
        templateName: 'Sequence',
        nodes: [
          { nodeId: 'node-template', label: 'Template node', nodeKind: 'beat', position: { x: 10, y: 11 } },
        ],
        edges: [
          { edgeId: 'edge-template', fromNodeId: 'node-root', toNodeId: 'node-template', label: 'opens' },
        ],
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_EDGE_ADD,
      payload: {
        projectId,
        mapId,
        edgeId: 'edge-free',
        fromNodeId: 'node-template',
        toNodeId: 'node-free',
        edgeKind: 'support',
        label: 'supports',
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_ATTACHMENT_ADD,
      payload: {
        projectId,
        mapId,
        nodeId: 'node-root',
        attachmentId: 'attachment-reference',
        label: 'Reference image',
        attachmentKind: 'image-reference',
        source: {
          name: 'reference.png',
          mediaType: 'image/png',
          sourceHash: 'd'.repeat(64),
          byteLength: 512,
        },
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_PORTAL_ADD,
      payload: {
        projectId,
        mapId,
        portalId: 'portal-reference',
        fromNodeId: 'node-root',
        targetMapId: 'map-reference',
        targetNodeId: 'node-target',
        label: 'Open reference',
      },
    },
  ]);
  assert.equal(built.ok, true);
  const graph = derived.deriveManualMapGraph({
    coreState: built.state,
    params: { projectId, mapId },
    capabilitySnapshot: { platformId: 'node', capabilities: { manualMapView: true } },
  });
  assert.equal(graph.ok, true);
  const exported = exporter.serializeManualMapExportJsonV1WithLossReport(graph.value);
  assert.equal(exported.lossReport.count, 0);
  return { runtime, exportedJson: exported.json };
}

function commandExecutorFor(runtime) {
  return (command, context) => runtime.reduceCoreState(context.state, command);
}

test('E02D C02: manual map JSON import repeats through Command Kernel and re-export stays lossless', async () => {
  const { runtime, exportedJson } = await buildSourceExportFixture();
  const importer = await loadModule(path.join('src', 'import', 'mindmap', 'v1', 'index.mjs'));
  const targetProjectId = 'json-repeat-target-project';
  const target = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId: targetProjectId, title: 'JSON repeat target', sceneId: 'scene-target' },
    },
  ]);
  assert.equal(target.ok, true);

  const plan = importer.buildManualMapJsonRepeatImportPlan({
    exportJson: exportedJson,
    initialState: target.state,
    targetProjectId,
    targetMapId: 'map-imported',
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.value.commandAuthority, 'CommandKernel');
  assert.deepEqual(plan.value.commands.map((command) => command.type), [
    'manualMap.create',
    'manualMap.create',
    'manualMap.node.add',
    'manualMap.node.add',
    'manualMap.node.add',
    'manualMap.template.apply',
    'manualMap.edge.add',
    'manualMap.attachment.add',
    'manualMap.portal.add',
  ]);

  const imported = await importer.applyManualMapJsonRepeatImportViaCommandKernel({
    exportJson: exportedJson,
    initialState: target.state,
    targetProjectId,
    targetMapId: 'map-imported',
    commandExecutor: commandExecutorFor(runtime),
  });
  assert.equal(imported.ok, true);
  assert.equal(imported.value.schemaVersion, importer.MANUAL_MAP_JSON_REPEAT_IMPORT_RECEIPT_SCHEMA_VERSION);
  assert.equal(imported.value.commandAuthority, 'CommandKernel');
  assert.equal(imported.value.directCoreMutation, false);
  assert.equal(imported.value.storageMutation, false);
  assert.equal(imported.value.networkMutation, false);
  assert.equal(imported.value.expectedGraphHash, imported.value.actualGraphHash);
  assert.equal(imported.value.expectedGraphHash, imported.value.repeatExportGraphHash);
  assert.equal(imported.value.repeatExportLossCount, 0);

  const map = imported.value.state.data.projects[targetProjectId].manualMaps.maps['map-imported'];
  assert.equal(map.attachments['attachment-reference'].storedContent, false);
  assert.equal(map.portals['portal-reference'].target.mapId, 'map-reference');
  assert.equal(map.portals['portal-reference'].target.nodeId, 'node-target');
  assert.deepEqual(map.templates['template-sequence-1'].appliedNodeIds, ['node-template']);
  assert.deepEqual(map.templates['template-sequence-1'].appliedEdgeIds, ['edge-template']);

  const repeatProjectId = 'json-repeat-second-project';
  const repeatTarget = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId: repeatProjectId, title: 'JSON repeat second target', sceneId: 'scene-repeat' },
    },
  ]);
  assert.equal(repeatTarget.ok, true);
  const repeated = await importer.applyManualMapJsonRepeatImportViaCommandKernel({
    exportJson: imported.value.repeatExportJson,
    initialState: repeatTarget.state,
    targetProjectId: repeatProjectId,
    targetMapId: 'map-imported-again',
    commandExecutor: commandExecutorFor(runtime),
  });
  assert.equal(repeated.ok, true);
  assert.equal(repeated.value.expectedGraphHash, repeated.value.actualGraphHash);
  assert.equal(repeated.value.repeatExportLossCount, 0);
});

test('E02D C02: duplicate target map fails before command execution', async () => {
  const { runtime, exportedJson } = await buildSourceExportFixture();
  const importer = await loadModule(path.join('src', 'import', 'mindmap', 'v1', 'index.mjs'));
  const projectId = 'json-repeat-duplicate-project';
  const state = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Duplicate target', sceneId: 'scene-a' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
      payload: { projectId, mapId: 'map-imported', title: 'Already here' },
    },
  ]);
  assert.equal(state.ok, true);
  let commandCalls = 0;
  const result = await importer.applyManualMapJsonRepeatImportViaCommandKernel({
    exportJson: exportedJson,
    initialState: state.state,
    targetProjectId: projectId,
    targetMapId: 'map-imported',
    commandExecutor: (command, context) => {
      commandCalls += 1;
      return runtime.reduceCoreState(context.state, command);
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_MANUAL_MAP_JSON_IMPORT_TARGET_MAP_EXISTS');
  assert.equal(commandCalls, 0);
});

test('E02D C02: JSON import rejects private path or content payloads', async () => {
  const { runtime, exportedJson } = await buildSourceExportFixture();
  const importer = await loadModule(path.join('src', 'import', 'mindmap', 'v1', 'index.mjs'));
  const payload = JSON.parse(exportedJson);
  payload.attachments[0].source.path = '/private/reference.png';
  const projectId = 'json-repeat-private-data-project';
  const state = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Private data target', sceneId: 'scene-a' },
    },
  ]);
  assert.equal(state.ok, true);
  const result = await importer.applyManualMapJsonRepeatImportViaCommandKernel({
    payload,
    initialState: state.state,
    targetProjectId: projectId,
    targetMapId: 'map-imported',
    commandExecutor: commandExecutorFor(runtime),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_MANUAL_MAP_JSON_IMPORT_PRIVATE_DATA_REJECTED');
});

test('E02D C02: manual map JSON import adds no storage, network, renderer, or UI bypass', () => {
  const sources = [
    path.join(process.cwd(), 'src', 'import', 'mindmap', 'v1', 'manualMapJsonRepeatImport.mjs'),
    path.join(process.cwd(), 'src', 'import', 'mindmap', 'v1', 'index.mjs'),
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
  ];

  for (const sourcePath of sources) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${path.basename(sourcePath)} matched ${pattern.source}`);
    }
  }
});
