const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = process.cwd();
const PORTABILITY_COMMAND_IDS = Object.freeze([
  'manualMap.export.json',
  'manualMap.export.imagePdf',
  'manualMap.import.jsonRepeat',
]);

function readText(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

async function importModule(relativePath) {
  return import(pathToFileURL(path.join(REPO_ROOT, relativePath)).href);
}

test('P0 05: Manual Map portability commands are registry, Core and Design OS bound', async () => {
  const product = require(path.join(REPO_ROOT, 'src', 'shared', 'productCommandRegistry.cjs'));
  const workspaceQueryRegistry = require(path.join(REPO_ROOT, 'src', 'shared', 'workspaceQueryRegistry.cjs'));
  const runtime = await importModule('src/core/runtime.mjs');
  const designOs = await importModule('src/renderer/design-os/atlasFeatureIntegrationManifest.mjs');
  const commandCatalog = await importModule('src/renderer/commands/command-catalog.v1.mjs');
  const slotCatalog = await importModule('src/renderer/design-os/atlasSlotCatalog.v1.mjs');
  const typedRegistrySource = readText('src/core/registry.ts');
  const binding = JSON.parse(readText('docs/OPS/STATUS/COMMAND_CAPABILITY_BINDING.json'));
  const bindingMap = new Map(binding.items.map((row) => [row.commandId, row.capabilityId]));
  const resolved = designOs.resolveAtlasFeatureDesignOsSlots({
    commandCatalog: commandCatalog.listCommandCatalog(),
    providerCatalog: workspaceQueryRegistry.WORKSPACE_QUERY_RECORDS,
    slotCatalog: slotCatalog.ATLAS_DESIGN_OS_SLOT_CATALOG_V1,
  });
  const manualMap = resolved.bindings.find((item) => item.surfaceKey === 'manualMap');

  assert.equal(product.PRODUCT_COMMAND_SCHEMA_VERSION, 'product-command-registry.v1');
  assert.equal(resolved.ok, true);
  assert.ok(manualMap);
  for (const commandId of PORTABILITY_COMMAND_IDS) {
    assert.equal(product.PRODUCT_COMMAND_ID_SET.has(commandId), true, `${commandId} missing from product command registry`);
    assert.equal(product.getProductCommandRecord(commandId).commandAuthority, 'CommandKernel');
    assert.equal(product.getProductCommandRecord(commandId).capabilityId, 'cap.manualMap.edit');
    assert.equal(Object.values(runtime.CORE_COMMAND_IDS).includes(commandId), true, `${commandId} missing from Core command constants`);
    assert.match(typedRegistrySource, new RegExp(`'${commandId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
    assert.equal(bindingMap.get(commandId), 'cap.manualMap.edit', `${commandId} missing from canonical binding doc`);
    assert.equal(manualMap.commandIds.includes(commandId), true, `${commandId} missing from Design OS Manual Map contribution`);
  }
});

test('P0 05: main bridge routes real local-file portability through Stage10 transaction authority', () => {
  const mainSource = readText('src/main.js');
  const bridgeStart = mainSource.indexOf('async function dispatchProductCommandBridge');
  const bridgeEnd = mainSource.indexOf('function buildFontSubmenu', bridgeStart);
  assert.notEqual(bridgeStart, -1);
  assert.notEqual(bridgeEnd, -1);
  const bridgeSource = mainSource.slice(bridgeStart, bridgeEnd);

  assert.match(mainSource, /function loadManualMapExportModule/u);
  assert.match(mainSource, /function loadManualMapImportModule/u);
  assert.match(mainSource, /function loadManualMapLayoutSchedulerModule/u);
  assert.match(mainSource, /createManualMapLayoutJob/u);
  assert.match(mainSource, /acceptManualMapLayoutResult/u);
  assert.match(mainSource, /manualMap\.productQueryLayoutSchedulerProof\.v1/u);
  assert.match(mainSource, /staleResultDiscard:\s*true/u);
  assert.match(mainSource, /resourceBudgetProof/u);
  assert.match(mainSource, /prepareManualMapPortabilityCommand/u);
  assert.match(mainSource, /showOpenDialogWithAutonomousPath/u);
  assert.match(mainSource, /showSaveDialogWithAutonomousPath/u);
  assert.match(mainSource, /readExternalFileBounded/u);
  assert.match(mainSource, /new TextDecoder\('utf-8', \{ fatal: true \}\)/u);
  assert.match(mainSource, /E_MANUAL_MAP_IMPORT_UTF8_INVALID/u);
  assert.match(mainSource, /validateExternalWriteTarget/u);
  assert.match(mainSource, /serializeManualMapExportJsonV1WithLossReport/u);
  assert.match(mainSource, /buildManualMapImagePdfExportEvidence/u);
  assert.match(mainSource, /E_MANUAL_MAP_PDF_BINARY_ADAPTER_UNAVAILABLE/u);
  assert.match(mainSource, /buildManualMapJsonRepeatImportPlan/u);
  assert.match(mainSource, /yalken\.stage10\.externalArtifactMutation\.v1/u);
  assert.match(mainSource, /externalArtifactMutation:\s*portability\?\.externalArtifactMutation/u);
  assert.match(bridgeSource, /evaluateCommandCapabilityAuthority/u);
  assert.match(bridgeSource, /activeStage10ApplicationCommandRoute\.dispatch/u);
  assert.doesNotMatch(bridgeSource, /async function dispatchProductCommandBridgeTransaction/u);
  assert.doesNotMatch(mainSource, /handleManualMapExportJsonProductCommand/u);
  assert.doesNotMatch(mainSource, /handleManualMapExportImagePdfProductCommand/u);
  assert.doesNotMatch(mainSource, /handleManualMapImportJsonRepeatProductCommand/u);
  assert.doesNotMatch(mainSource, /dispatchManualMapPortabilityProductCommand/u);
  assert.doesNotMatch(mainSource, /applyManualMapJsonRepeatImportViaCommandKernel/u);
  assert.doesNotMatch(mainSource, /ipcMain\.handle\(['"]manualMap\./u);
});

test('P0 05: renderer exposes visible portability controls without importing serializers', () => {
  const rendererSource = readText('src/renderer/editor.js');

  for (const commandId of PORTABILITY_COMMAND_IDS) {
    assert.match(rendererSource, new RegExp(commandId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(rendererSource, /dataset\.manualMapPortabilityAction = 'export-json'/u);
  assert.match(rendererSource, /dataset\.manualMapPortabilityAction = 'export-image-pdf'/u);
  assert.match(rendererSource, /Import JSON file/u);
  assert.match(rendererSource, /Export SVG/u);
  assert.match(rendererSource, /manualMapPortabilityCommandState\.exportJsonSha256/u);
  assert.match(rendererSource, /risk:\s*'structural'/u);
  assert.match(rendererSource, /dataset\.manualMapPortabilityCommandState/u);
  assert.doesNotMatch(rendererSource, /manualMapPortabilityCommandState\.exportJson\b/u);
  assert.doesNotMatch(rendererSource, /serializeManualMapExportJsonV1/u);
  assert.doesNotMatch(rendererSource, /applyManualMapJsonRepeatImportViaCommandKernel/u);
});

test('P0 05: physical runner requires visible export/import and honest typed PDF loss', () => {
  const runnerSource = readText('scripts/ops/yalken-atlas-v5-r3-c03-manual-map-attachments-portals-templates.mjs');

  assert.match(runnerSource, /Export SVG/u);
  assert.match(runnerSource, /Export JSON/u);
  assert.match(runnerSource, /Import JSON file/u);
  assert.match(runnerSource, /YALKEN_AUTONOMOUS_FILE_DIALOG_OPEN_MANUAL_MAP_JSON/u);
  assert.match(runnerSource, /data-manual-map-portability-command-state/u);
  assert.match(runnerSource, /visiblePortabilityCommands/u);
  assert.match(runnerSource, /visibleCommandPathExportImport/u);
  assert.match(runnerSource, /importedCopyPersistedTruth/u);
  assert.match(runnerSource, /pdfClaimHonestTypedLoss/u);
  assert.match(runnerSource, /binaryPdfClaimWithoutAdapter/u);
  assert.doesNotMatch(runnerSource, /executeJavaScript\([^)]*invokeUiCommandBridge/u);
});

test('P0 05: serializers and repeat import preserve portability records and reject private attachment data', async () => {
  const runtime = await importModule('src/core/runtime.mjs');
  const graphModule = await importModule('src/derived/mindmap/deriveManualMapGraph.mjs');
  const exportModule = await importModule('src/export/mindmap/v1/index.mjs');
  const manualMapImportModule = await importModule('src/import/mindmap/v1/index.mjs');
  const initial = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    { type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE, payload: { projectId: 'p0-05', title: 'P0 05', sceneId: 'scene-1' } },
    { type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE, payload: { projectId: 'p0-05', mapId: 'source-map', title: 'Source map' } },
    { type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD, payload: { projectId: 'p0-05', mapId: 'source-map', nodeId: 'a', label: 'Alpha', position: { x: 0, y: 0 } } },
    { type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD, payload: { projectId: 'p0-05', mapId: 'source-map', nodeId: 'b', label: 'Beta', position: { x: 160, y: 0 } } },
    { type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_EDGE_ADD, payload: { projectId: 'p0-05', mapId: 'source-map', edgeId: 'e1', fromNodeId: 'a', toNodeId: 'b', label: 'Link' } },
    { type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_ATTACHMENT_ADD, payload: { projectId: 'p0-05', mapId: 'source-map', nodeId: 'a', attachmentId: 'att1', label: 'Reference', source: { name: 'ref.txt', mediaType: 'text/plain', sourceHash: 'a'.repeat(64), byteLength: 42 } } },
    { type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_PORTAL_ADD, payload: { projectId: 'p0-05', mapId: 'source-map', portalId: 'portal1', fromNodeId: 'a', targetMapId: 'source-map', targetNodeId: 'b', label: 'Portal' } },
    { type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_TEMPLATE_APPLY, payload: { projectId: 'p0-05', mapId: 'source-map', templateInstanceId: 'template1', templateId: 'starter', templateName: 'Starter', nodes: [{ nodeId: 'c', label: 'Gamma', position: { x: 80, y: 120 } }], edges: [] } },
  ]);
  assert.equal(initial.ok, true);
  const derived = graphModule.deriveManualMapGraph({ coreState: initial.state, params: { projectId: 'p0-05', mapId: 'source-map' }, capabilitySnapshot: { platformId: 'node', capabilities: { manualMapView: true } } });
  assert.equal(derived.ok, true);
  const exported = exportModule.serializeManualMapExportJsonV1WithLossReport(derived.value);
  assert.equal(exported.lossReport.count, 0);
  const imagePdf = exportModule.buildManualMapImagePdfExportEvidence(derived.value);
  assert.equal(imagePdf.ok, true);
  assert.equal(imagePdf.value.summary.attachmentCount, 1);
  assert.equal(imagePdf.value.summary.portalCount, 1);
  assert.equal(imagePdf.value.summary.templateCount, 1);
  assert.equal(imagePdf.value.pdf.binaryGenerated, false);
  assert.equal(imagePdf.value.pdf.adapterRequired, 'local-print-to-pdf-port');

  const imported = await manualMapImportModule.applyManualMapJsonRepeatImportViaCommandKernel({
    exportJson: exported.json,
    initialState: initial.state,
    targetProjectId: 'p0-05',
    targetMapId: 'imported-map',
    commandExecutor: (command, context) => runtime.reduceCoreState(context.state, command),
  });
  assert.equal(imported.ok, true);
  assert.equal(imported.value.commandAuthority, 'CommandKernel');
  assert.equal(imported.value.repeatExportLossCount, 0);
  assert.equal(imported.value.expectedGraphHash, imported.value.actualGraphHash);

  const privatePayload = JSON.parse(exported.json);
  privatePayload.attachments[0].source.path = '/private/source.txt';
  const denied = await manualMapImportModule.applyManualMapJsonRepeatImportViaCommandKernel({
    exportJson: JSON.stringify(privatePayload),
    initialState: initial.state,
    targetProjectId: 'p0-05',
    targetMapId: 'denied-map',
    commandExecutor: (command, context) => runtime.reduceCoreState(context.state, command),
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'E_MANUAL_MAP_JSON_IMPORT_PRIVATE_DATA_REJECTED');
});
