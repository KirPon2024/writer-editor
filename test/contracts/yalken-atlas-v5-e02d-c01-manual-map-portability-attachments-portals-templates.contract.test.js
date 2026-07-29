const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildPortableMapFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const projectId = 'manual-map-portability-project';
  const sceneId = 'scene-a';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Manual map portability', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId, text: 'Scene text remains manuscript truth.' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
      payload: { projectId, mapId: 'map-main', title: 'Main Map' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
      payload: { projectId, mapId: 'map-reference', title: 'Reference Map' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
      payload: {
        projectId,
        mapId: 'map-main',
        nodeId: 'node-root',
        label: 'Root',
        position: { x: 1, y: 2 },
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
      payload: {
        projectId,
        mapId: 'map-reference',
        nodeId: 'node-target',
        label: 'Target',
        position: { x: 3, y: 4 },
      },
    },
  ]);
  assert.equal(built.ok, true);
  return { runtime, projectId, sceneId, state: built.state };
}

test('E02D C01: attachments, portals, and templates persist without touching scene text', async () => {
  const { runtime, projectId, sceneId, state } = await buildPortableMapFixture();
  const result = runtime.applyCoreSequence(state, [
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_ATTACHMENT_ADD,
      payload: {
        projectId,
        mapId: 'map-main',
        nodeId: 'node-root',
        attachmentId: 'attachment-reference',
        label: 'Reference packet',
        attachmentKind: 'image-reference',
        source: {
          name: 'reference.png',
          mediaType: 'image/png',
          sourceHash: 'a'.repeat(64),
          byteLength: 128,
        },
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_PORTAL_ADD,
      payload: {
        projectId,
        mapId: 'map-main',
        portalId: 'portal-reference',
        fromNodeId: 'node-root',
        targetMapId: 'map-reference',
        targetNodeId: 'node-target',
        label: 'Open reference map',
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_TEMPLATE_APPLY,
      payload: {
        projectId,
        mapId: 'map-main',
        templateInstanceId: 'template-three-act-1',
        templateId: 'three-act',
        templateName: 'Three act starter',
        nodes: [
          { nodeId: 'node-act-1', label: 'Act I', position: { x: 10, y: 0 }, targetKind: 'scene', targetId: sceneId },
          { nodeId: 'node-act-2', label: 'Act II', position: { x: 20, y: 0 } },
        ],
        edges: [
          { edgeId: 'edge-act-flow', fromNodeId: 'node-act-1', toNodeId: 'node-act-2', label: 'sets up' },
        ],
      },
    },
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.state.data.projects[projectId].scenes[sceneId].text, 'Scene text remains manuscript truth.');

  const reopened = JSON.parse(JSON.stringify(result.state));
  const map = reopened.data.projects[projectId].manualMaps.maps['map-main'];
  assert.deepEqual(map.attachments['attachment-reference'], {
    id: 'attachment-reference',
    nodeId: 'node-root',
    label: 'Reference packet',
    attachmentKind: 'image-reference',
    source: {
      name: 'reference.png',
      mediaType: 'image/png',
      sourceHash: 'a'.repeat(64),
      byteLength: 128,
    },
    storedContent: false,
    createdByCommandSeq: 7,
  });
  assert.deepEqual(map.portals['portal-reference'].target, {
    mapId: 'map-reference',
    nodeId: 'node-target',
  });
  assert.deepEqual(map.templates['template-three-act-1'].appliedNodeIds, ['node-act-1', 'node-act-2']);
  assert.deepEqual(map.templates['template-three-act-1'].appliedEdgeIds, ['edge-act-flow']);
  assert.equal(map.nodes['node-act-1'].target.id, sceneId);
  assert.equal(map.nodes['node-act-1'].templateInstanceId, 'template-three-act-1');
  assert.equal(map.edges['edge-act-flow'].templateInstanceId, 'template-three-act-1');
});

test('E02D C01: derived graph and JSON export include pathless portability metadata', async () => {
  const { runtime, projectId, state } = await buildPortableMapFixture();
  const derived = await loadModule(path.join('src', 'derived', 'mindmap', 'deriveManualMapGraph.mjs'));
  const exporter = await loadModule(path.join('src', 'export', 'mindmap', 'v1', 'index.mjs'));
  const applied = runtime.applyCoreSequence(state, [
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_ATTACHMENT_ADD,
      payload: {
        projectId,
        mapId: 'map-main',
        nodeId: 'node-root',
        attachmentId: 'attachment-reference',
        label: 'Reference packet',
        source: { name: 'reference.png', mediaType: 'image/png', sourceHash: 'b'.repeat(64), byteLength: 256 },
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_PORTAL_ADD,
      payload: { projectId, mapId: 'map-main', portalId: 'portal-reference', fromNodeId: 'node-root', targetMapId: 'map-reference' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_TEMPLATE_APPLY,
      payload: {
        projectId,
        mapId: 'map-main',
        templateInstanceId: 'template-sequence-1',
        templateId: 'sequence',
        nodes: [{ nodeId: 'node-next', label: 'Next', position: { x: 10, y: 10 } }],
        edges: [{ edgeId: 'edge-next', fromNodeId: 'node-root', toNodeId: 'node-next' }],
      },
    },
  ]);
  assert.equal(applied.ok, true);

  const graph = derived.deriveManualMapGraph({
    coreState: applied.state,
    params: { projectId, mapId: 'map-main' },
    capabilitySnapshot: { platformId: 'node', capabilities: { manualMapView: true } },
  });
  assert.equal(graph.ok, true);
  assert.deepEqual(graph.value.attachments.map((item) => item.id), ['attachment-reference']);
  assert.equal(graph.value.attachments[0].storedContent, false);
  assert.deepEqual(graph.value.portals.map((item) => item.id), ['portal-reference']);
  assert.deepEqual(graph.value.templates.map((item) => item.id), ['template-sequence-1']);
  assert.match(graph.value.meta.graphHash, /^[0-9a-f]{64}$/u);

  const exported = exporter.serializeManualMapExportJsonV1WithLossReport(graph.value);
  assert.equal(exported.lossReport.count, 0);
  const payload = JSON.parse(exported.json);
  assert.equal(payload.attachments[0].source.sourceHash, 'b'.repeat(64));
  assert.equal(payload.attachments[0].storedContent, false);
  assert.deepEqual(payload.portals[0].target, { mapId: 'map-reference', nodeId: '' });
  assert.deepEqual(payload.templates[0].appliedNodeIds, ['node-next']);
  assert.equal(payload.recovery.portabilitySummary, '1 attachments, 1 portals, 1 templates');
});

test('E02D C01: portability commands fail closed before mutation', async () => {
  const { runtime, projectId, state } = await buildPortableMapFixture();
  const beforeHash = runtime.hashCoreState(state);
  const missingHash = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_ATTACHMENT_ADD,
    payload: { projectId, mapId: 'map-main', nodeId: 'node-root', attachmentId: 'attachment-bad', label: 'Bad' },
  });
  assert.equal(missingHash.ok, false);
  assert.equal(missingHash.error.code, 'E_MANUAL_MAP_ATTACHMENT_SOURCE_HASH_REQUIRED');
  assert.equal(missingHash.stateHash, beforeHash);

  const missingPortalTarget = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_PORTAL_ADD,
    payload: { projectId, mapId: 'map-main', portalId: 'portal-bad', fromNodeId: 'node-root', targetMapId: 'missing-map' },
  });
  assert.equal(missingPortalTarget.ok, false);
  assert.equal(missingPortalTarget.error.code, 'E_MANUAL_MAP_NOT_FOUND');
  assert.equal(missingPortalTarget.stateHash, beforeHash);

  const duplicateTemplateNode = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_TEMPLATE_APPLY,
    payload: {
      projectId,
      mapId: 'map-main',
      templateInstanceId: 'template-bad',
      templateId: 'duplicate',
      nodes: [{ nodeId: 'node-root', label: 'Duplicate' }],
    },
  });
  assert.equal(duplicateTemplateNode.ok, false);
  assert.equal(duplicateTemplateNode.error.code, 'E_MANUAL_MAP_TEMPLATE_NODE_INVALID');
  assert.equal(duplicateTemplateNode.stateHash, beforeHash);
});

test('E02D C01: portability commands are admitted only through Command Kernel capability revalidation', async () => {
  const { runtime, projectId, state } = await buildPortableMapFixture();
  const registryModule = await loadModule(path.join('src', 'renderer', 'commands', 'registry.mjs'));
  const runnerModule = await loadModule(path.join('src', 'renderer', 'commands', 'runCommand.mjs'));
  const registry = registryModule.createCommandRegistry();
  for (const commandId of [
    runtime.CORE_COMMAND_IDS.MANUAL_MAP_ATTACHMENT_ADD,
    runtime.CORE_COMMAND_IDS.MANUAL_MAP_PORTAL_ADD,
    runtime.CORE_COMMAND_IDS.MANUAL_MAP_TEMPLATE_APPLY,
  ]) {
    registry.registerCommand(commandId, (input) => runtime.reduceCoreState(input.state, {
      type: commandId,
      payload: input.payload,
    }));
  }
  const payload = {
    projectId,
    mapId: 'map-main',
    nodeId: 'node-root',
    attachmentId: 'attachment-kernel',
    label: 'Kernel gated',
    source: { sourceHash: 'c'.repeat(64) },
  };

  const webRunner = runnerModule.createCommandRunner(registry, { capability: { defaultPlatformId: 'web' } });
  const denied = await webRunner(runtime.CORE_COMMAND_IDS.MANUAL_MAP_ATTACHMENT_ADD, { state, payload });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');

  const nodeRunner = runnerModule.createCommandRunner(registry, { capability: { defaultPlatformId: 'node', entitlementTier: 'free' } });
  const admitted = await nodeRunner(runtime.CORE_COMMAND_IDS.MANUAL_MAP_ATTACHMENT_ADD, { state, payload });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.state.data.projects[projectId].manualMaps.maps['map-main'].attachments['attachment-kernel'].storedContent, false);
});

test('E02D C01: portability core adds no storage, network, renderer, or UI bypass', () => {
  const sources = [
    path.join(process.cwd(), 'src', 'core', 'runtime.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'mindmap', 'deriveManualMapGraph.mjs'),
    path.join(process.cwd(), 'src', 'export', 'mindmap', 'v1', 'serializeManualMapV1.mjs'),
    path.join(process.cwd(), 'src', 'renderer', 'commands', 'capabilityPolicy.mjs'),
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
