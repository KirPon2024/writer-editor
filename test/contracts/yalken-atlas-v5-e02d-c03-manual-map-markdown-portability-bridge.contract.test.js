const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildPortableMarkdownFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'mindmap', 'deriveManualMapGraph.mjs'));
  const exporter = await loadModule(path.join('src', 'export', 'mindmap', 'v1', 'index.mjs'));
  const projectId = 'markdown-bridge-source-project';
  const mapId = 'map-main';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Markdown bridge source', sceneId: 'scene-a' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
      payload: { projectId, mapId, title: 'Markdown Portable Map' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
      payload: { projectId, mapId: 'map-reference', title: 'Reference Map' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
      payload: { projectId, mapId, nodeId: 'node-root', label: 'Root', position: { x: 1, y: 2 } },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
      payload: { projectId, mapId: 'map-reference', nodeId: 'node-target', label: 'Target', position: { x: 3, y: 4 } },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_TEMPLATE_APPLY,
      payload: {
        projectId,
        mapId,
        templateInstanceId: 'template-one',
        templateId: 'one-node',
        templateName: 'One node',
        nodes: [{ nodeId: 'node-child', label: 'Child', nodeKind: 'beat', position: { x: 10, y: 20 } }],
        edges: [{ edgeId: 'edge-child', fromNodeId: 'node-root', toNodeId: 'node-child', label: 'links' }],
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_ATTACHMENT_ADD,
      payload: {
        projectId,
        mapId,
        nodeId: 'node-root',
        attachmentId: 'attachment-one',
        label: 'Packet',
        source: { name: 'packet.json', mediaType: 'application/json', sourceHash: 'e'.repeat(64), byteLength: 64 },
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
  return { runtime, exportPayload: JSON.parse(exported.json) };
}

function commandExecutorFor(runtime) {
  return (command, context) => runtime.reduceCoreState(context.state, command);
}

test('E02D C03: Markdown portability bridge imports through JSON repeat adapter and Command Kernel', async () => {
  const { runtime, exportPayload } = await buildPortableMarkdownFixture();
  const importer = await loadModule(path.join('src', 'import', 'mindmap', 'v1', 'index.mjs'));
  const markdownPacket = importer.buildManualMapMarkdownPortabilityBridge({ payload: exportPayload });
  assert.equal(markdownPacket.ok, true);
  assert.match(markdownPacket.value.markdown, /```json yalken-manual-map-portability-v1/u);
  assert.equal(markdownPacket.value.storageMutation, false);
  assert.equal(markdownPacket.value.networkMutation, false);

  const parsed = importer.parseManualMapMarkdownPortabilityBridge({ markdown: markdownPacket.value.markdown });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.payloadHash, markdownPacket.value.payloadHash);
  assert.deepEqual(parsed.value.payload.attachments.map((item) => item.id), ['attachment-one']);

  const targetProjectId = 'markdown-bridge-target-project';
  const target = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId: targetProjectId, title: 'Markdown bridge target', sceneId: 'scene-target' },
    },
  ]);
  assert.equal(target.ok, true);
  const plan = importer.buildManualMapMarkdownPortabilityImportPlan({
    markdown: markdownPacket.value.markdown,
    initialState: target.state,
    targetProjectId,
    targetMapId: 'map-from-markdown',
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.value.commandAuthority, 'CommandKernel');
  assert.equal(plan.value.directCoreMutation, false);
  assert.deepEqual(plan.value.commands.map((command) => command.type), [
    'manualMap.create',
    'manualMap.create',
    'manualMap.node.add',
    'manualMap.node.add',
    'manualMap.template.apply',
    'manualMap.attachment.add',
    'manualMap.portal.add',
  ]);

  const imported = await importer.applyManualMapMarkdownPortabilityBridgeViaCommandKernel({
    markdown: markdownPacket.value.markdown,
    initialState: target.state,
    targetProjectId,
    targetMapId: 'map-from-markdown',
    commandExecutor: commandExecutorFor(runtime),
  });
  assert.equal(imported.ok, true);
  assert.equal(imported.value.schemaVersion, importer.MANUAL_MAP_MARKDOWN_PORTABILITY_BRIDGE_RECEIPT_SCHEMA_VERSION);
  assert.equal(imported.value.commandAuthority, 'CommandKernel');
  assert.equal(imported.value.expectedGraphHash, imported.value.actualGraphHash);
  assert.equal(imported.value.expectedGraphHash, imported.value.repeatExportGraphHash);
  assert.equal(imported.value.directCoreMutation, false);
  assert.equal(imported.value.storageMutation, false);
  assert.equal(imported.value.networkMutation, false);
  const map = imported.value.state.data.projects[targetProjectId].manualMaps.maps['map-from-markdown'];
  assert.equal(map.attachments['attachment-one'].storedContent, false);
  assert.equal(map.portals['portal-reference'].target.mapId, 'map-reference');
  assert.deepEqual(map.templates['template-one'].appliedNodeIds, ['node-child']);
});

test('E02D C03: Markdown bridge fails closed on tampered hash and duplicate payload fences', async () => {
  const { exportPayload } = await buildPortableMarkdownFixture();
  const importer = await loadModule(path.join('src', 'import', 'mindmap', 'v1', 'index.mjs'));
  const markdownPacket = importer.buildManualMapMarkdownPortabilityBridge({ payload: exportPayload });
  assert.equal(markdownPacket.ok, true);

  const tampered = markdownPacket.value.markdown.replace(/payload-sha256:[a-f0-9]{64}/u, `payload-sha256:${'0'.repeat(64)}`);
  const tamperedResult = importer.parseManualMapMarkdownPortabilityBridge({ markdown: tampered });
  assert.equal(tamperedResult.ok, false);
  assert.equal(tamperedResult.error.code, 'E_MANUAL_MAP_MD_BRIDGE_PAYLOAD_HASH_MISMATCH');

  const duplicateFence = `${markdownPacket.value.markdown}\n${markdownPacket.value.markdown}`;
  const duplicateResult = importer.parseManualMapMarkdownPortabilityBridge({ markdown: duplicateFence });
  assert.equal(duplicateResult.ok, false);
  assert.equal(duplicateResult.error.code, 'E_MANUAL_MAP_MD_BRIDGE_FENCE_COUNT_INVALID');
});

test('E02D C03: Markdown bridge rejects private payload fields before command execution', async () => {
  const { runtime, exportPayload } = await buildPortableMarkdownFixture();
  const importer = await loadModule(path.join('src', 'import', 'mindmap', 'v1', 'index.mjs'));
  exportPayload.attachments[0].source.url = 'file:///private/packet.json';
  const markdownPacket = importer.buildManualMapMarkdownPortabilityBridge({ payload: exportPayload });
  assert.equal(markdownPacket.ok, true);
  const targetProjectId = 'markdown-private-target-project';
  const target = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId: targetProjectId, title: 'Markdown private target', sceneId: 'scene-a' },
    },
  ]);
  assert.equal(target.ok, true);
  let commandCalls = 0;
  const result = await importer.applyManualMapMarkdownPortabilityBridgeViaCommandKernel({
    markdown: markdownPacket.value.markdown,
    initialState: target.state,
    targetProjectId,
    targetMapId: 'map-from-markdown',
    commandExecutor: (command, context) => {
      commandCalls += 1;
      return runtime.reduceCoreState(context.state, command);
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_MANUAL_MAP_JSON_IMPORT_PRIVATE_DATA_REJECTED');
  assert.equal(commandCalls, 0);
});

test('E02D C03: manual map Markdown bridge adds no storage, network, renderer, or UI bypass', () => {
  const sources = [
    path.join(process.cwd(), 'src', 'import', 'mindmap', 'v1', 'manualMapMarkdownPortabilityBridge.mjs'),
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
