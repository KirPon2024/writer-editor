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
  const derived = await loadModule(path.join('src', 'derived', 'mindmap', 'deriveManualMapGraph.mjs'));
  const projectId = 'image-pdf-evidence-project';
  const mapId = 'map-main';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Image PDF evidence source', sceneId: 'scene-a' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
      payload: { projectId, mapId, title: 'Visual Evidence Map' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
      payload: { projectId, mapId: 'map-reference', title: 'Reference Map' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
      payload: { projectId, mapId, nodeId: 'node-root', label: 'Root Beat', position: { x: 1, y: 2 } },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
      payload: { projectId, mapId: 'map-reference', nodeId: 'node-target', label: 'Target Beat', position: { x: 3, y: 4 } },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_TEMPLATE_APPLY,
      payload: {
        projectId,
        mapId,
        templateInstanceId: 'template-evidence',
        templateId: 'two-step',
        templateName: 'Two step',
        nodes: [{ nodeId: 'node-next', label: 'Next Beat', position: { x: 220, y: 120 } }],
        edges: [{ edgeId: 'edge-next', fromNodeId: 'node-root', toNodeId: 'node-next', label: 'leads to' }],
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_ATTACHMENT_ADD,
      payload: {
        projectId,
        mapId,
        nodeId: 'node-root',
        attachmentId: 'attachment-evidence',
        label: 'Evidence reference',
        source: { name: 'reference.png', mediaType: 'image/png', sourceHash: 'f'.repeat(64), byteLength: 512 },
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
  return { graph: graph.value };
}

test('E02D C04: manual map image and PDF evidence is deterministic and pathless', async () => {
  const { graph } = await buildManualMapGraphFixture();
  const exporter = await loadModule(path.join('src', 'export', 'mindmap', 'v1', 'index.mjs'));
  const first = exporter.buildManualMapImagePdfExportEvidence(graph);
  const second = exporter.buildManualMapImagePdfExportEvidence(JSON.parse(JSON.stringify(graph)));

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.value.schemaVersion, exporter.MANUAL_MAP_IMAGE_PDF_EXPORT_EVIDENCE_SCHEMA_VERSION);
  assert.equal(first.value.meta.evidenceHash, second.value.meta.evidenceHash);
  assert.equal(first.value.graphHash, second.value.graphHash);
  assert.match(first.value.meta.evidenceHash, /^[0-9a-f]{64}$/u);
  assert.equal(first.value.image.format, 'svg');
  assert.equal(first.value.image.mediaType, 'image/svg+xml');
  assert.match(first.value.image.content, /^<svg /u);
  assert.match(first.value.image.content, /Visual Evidence Map/u);
  assert.match(first.value.image.content, /Root Beat/u);
  assert.equal(first.value.pdf.format, 'pdf');
  assert.equal(first.value.pdf.sourceFormat, 'html-print-packet');
  assert.equal(first.value.pdf.adapterRequired, 'local-print-to-pdf-port');
  assert.equal(first.value.pdf.binaryGenerated, false);
  assert.match(first.value.pdf.content, /^<!doctype html>/u);
  assert.match(first.value.pdf.content, /&quot;attachments&quot;: 1/u);
  assert.deepEqual(first.value.summary, {
    nodeCount: 2,
    edgeCount: 1,
    attachmentCount: 1,
    portalCount: 1,
    templateCount: 1,
  });
  assert.equal(first.value.directCoreMutation, false);
  assert.equal(first.value.storageMutation, false);
  assert.equal(first.value.networkMutation, false);
  assert.equal(first.value.rendererMutation, false);
  assert.equal(first.value.projectTruthMutation, false);
});

test('E02D C04: private path or content fields fail closed before evidence generation', async () => {
  const { graph } = await buildManualMapGraphFixture();
  const exporter = await loadModule(path.join('src', 'export', 'mindmap', 'v1', 'index.mjs'));
  const privatePathGraph = JSON.parse(JSON.stringify(graph));
  privatePathGraph.attachments[0].source.path = '/private/reference.png';
  const pathResult = exporter.buildManualMapImagePdfExportEvidence(privatePathGraph);
  assert.equal(pathResult.ok, false);
  assert.equal(pathResult.error.code, 'E_MANUAL_MAP_IMAGE_PDF_PRIVATE_DATA_REJECTED');
  assert.equal(pathResult.error.details.key, 'path');

  const privateContentGraph = JSON.parse(JSON.stringify(graph));
  privateContentGraph.attachments[0].source.content = 'raw image bytes are not portable evidence';
  const contentResult = exporter.buildManualMapImagePdfExportEvidence(privateContentGraph);
  assert.equal(contentResult.ok, false);
  assert.equal(contentResult.error.code, 'E_MANUAL_MAP_IMAGE_PDF_PRIVATE_DATA_REJECTED');
  assert.equal(contentResult.error.details.key, 'content');
});

test('E02D C04: invalid graph identity and empty nodes fail closed', async () => {
  const exporter = await loadModule(path.join('src', 'export', 'mindmap', 'v1', 'index.mjs'));
  const missingIdentity = exporter.buildManualMapImagePdfExportEvidence({ projectId: 'p', nodes: [] });
  assert.equal(missingIdentity.ok, false);
  assert.equal(missingIdentity.error.code, 'E_MANUAL_MAP_IMAGE_PDF_IDENTITY_REQUIRED');

  const emptyNodes = exporter.buildManualMapImagePdfExportEvidence({ projectId: 'p', mapId: 'm', nodes: [] });
  assert.equal(emptyNodes.ok, false);
  assert.equal(emptyNodes.error.code, 'E_MANUAL_MAP_IMAGE_PDF_NODES_INVALID');
});

test('E02D C04: manual map image/PDF evidence adds no storage, network, renderer, or UI bypass', () => {
  const sources = [
    path.join(process.cwd(), 'src', 'export', 'mindmap', 'v1', 'manualMapImagePdfExportEvidence.mjs'),
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
    /dispatchUiCommand/u,
  ];

  for (const sourcePath of sources) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${path.basename(sourcePath)} matched ${pattern.source}`);
    }
  }
});
