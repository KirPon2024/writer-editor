const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildCommandKernelExecutor(runtime, platformId = 'node') {
  const registryModule = await loadModule(path.join('src', 'renderer', 'commands', 'registry.mjs'));
  const runnerModule = await loadModule(path.join('src', 'renderer', 'commands', 'runCommand.mjs'));
  const registry = registryModule.createCommandRegistry();
  for (const commandId of [
    runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
    runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
    runtime.CORE_COMMAND_IDS.MANUAL_MAP_EDGE_ADD,
  ]) {
    registry.registerCommand(commandId, (input) => {
      return runtime.reduceCoreState(input.state, {
        type: commandId,
        payload: input.payload,
      });
    });
  }
  const runner = runnerModule.createCommandRunner(registry, {
    capability: { defaultPlatformId: platformId, entitlementTier: 'free' },
  });
  return async function commandExecutor(command, context) {
    return runner(command.type, {
      state: context.state,
      payload: command.payload,
    });
  };
}

async function buildCompletedLegacyMigration() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const migration = await loadModule(path.join('src', 'import', 'mindmap', 'v1', 'index.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'mindmap', 'deriveManualMapGraph.mjs'));
  const exporter = await loadModule(path.join('src', 'export', 'mindmap', 'v1', 'index.mjs'));
  const projectId = 'legacy-roundtrip-project';
  const initial = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Legacy roundtrip project', sceneId: 'scene-a' },
    },
  ]);
  assert.equal(initial.ok, true);
  const preview = migration.buildLegacyMindMapTxtMigrationPreview({
    projectId,
    mapId: 'legacy-roundtrip-map',
    source: {
      name: 'legacy-roundtrip.txt',
      content: '# Roundtrip Map\n- Root idea\n  - Middle idea\nMiddle idea -> Final idea\n',
    },
  });
  assert.equal(preview.ok, true);
  const shadow = migration.createLegacyMindMapShadowMigration({
    preview: preview.value,
    existingMapIds: [],
  });
  assert.equal(shadow.ok, true);
  const commandExecutor = await buildCommandKernelExecutor(runtime);
  const applied = await migration.applyLegacyMindMapShadowMigrationViaCommandKernel({
    shadow: shadow.value,
    initialState: initial.state,
    commandExecutor,
  });
  assert.equal(applied.ok, true);
  const reopenedCoreState = JSON.parse(JSON.stringify(applied.value.state));
  const reopen = migration.validateLegacyMindMapReopenGraph({
    preview: preview.value,
    reopenedCoreState,
  });
  assert.equal(reopen.ok, true);
  const graph = derived.deriveManualMapGraph({
    coreState: reopenedCoreState,
    params: { projectId, mapId: preview.value.mapId },
    capabilitySnapshot: { platformId: 'node', capabilities: { manualMapView: true } },
  });
  assert.equal(graph.ok, true);
  const exported = exporter.serializeManualMapExportJsonV1WithLossReport(graph.value);
  assert.equal(exported.lossReport.count, 0);
  return { migration, preview: preview.value, applyReceipt: applied.value, reopenValidation: reopen.value, exportJson: exported.json };
}

test('E02C C03: completed legacy migration proves export roundtrip and sunset readiness', async () => {
  const { migration, preview, applyReceipt, reopenValidation, exportJson } = await buildCompletedLegacyMigration();

  const roundtrip = migration.buildLegacyMindMapRoundtripEvidence({
    preview,
    applyReceipt,
    reopenValidation,
    exportJson,
  });
  assert.equal(roundtrip.ok, true);
  assert.equal(roundtrip.value.schemaVersion, migration.LEGACY_MINDMAP_ROUNDTRIP_EVIDENCE_SCHEMA_VERSION);
  assert.equal(roundtrip.value.source.originalContentRetainedByReferenceOnly, true);
  assert.equal(roundtrip.value.source.sourceHash, preview.source.sourceHash);
  assert.equal(roundtrip.value.apply.commandAuthority, 'CommandKernel');
  assert.equal(roundtrip.value.reopen.reopenedGraphMatchesPreview, true);
  assert.equal(roundtrip.value.export.expectedGraphHash, roundtrip.value.export.exportedGraphHash);
  assert.equal(roundtrip.value.export.nodeCount, preview.graph.nodes.length);
  assert.equal(roundtrip.value.export.edgeCount, preview.graph.edges.length);
  assert.equal(roundtrip.value.projectTruthMutation, false);

  const sunset = migration.buildLegacyMindMapSunsetEvidence({
    roundtripEvidence: roundtrip.value,
    legacyEntrypoints: [
      { id: 'legacy-txt-importer-v1', mode: 'adapter-only' },
      { id: 'legacy-original-document', mode: 'read-only-reference' },
    ],
  });
  assert.equal(sunset.ok, true);
  assert.equal(sunset.value.schemaVersion, migration.LEGACY_MINDMAP_SUNSET_EVIDENCE_SCHEMA_VERSION);
  assert.equal(sunset.value.legacyOriginalPreserved, true);
  assert.equal(sunset.value.activeLegacyTruthStore, false);
  assert.equal(sunset.value.activeLegacyWritePath, false);
  assert.equal(sunset.value.futureMutationPath, 'manualMap.* commands through Command Kernel');
  assert.equal(sunset.value.sunsetReady, true);
  assert.equal(sunset.value.projectTruthMutation, false);
});

test('E02C C03: roundtrip evidence fails closed when export graph diverges', async () => {
  const { migration, preview, applyReceipt, reopenValidation, exportJson } = await buildCompletedLegacyMigration();
  const exportPayload = JSON.parse(exportJson);
  exportPayload.nodes[0].label = 'Drifted label';

  const result = migration.buildLegacyMindMapRoundtripEvidence({
    preview,
    applyReceipt,
    reopenValidation,
    exportPayload,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_LEGACY_MINDMAP_ROUNDTRIP_GRAPH_MISMATCH');
  assert.match(result.error.details.expectedGraphHash, /^[0-9a-f]{64}$/u);
  assert.match(result.error.details.exportedGraphHash, /^[0-9a-f]{64}$/u);
});

test('E02C C03: sunset evidence rejects active legacy write entrypoints', async () => {
  const { migration, preview, applyReceipt, reopenValidation, exportJson } = await buildCompletedLegacyMigration();
  const roundtrip = migration.buildLegacyMindMapRoundtripEvidence({
    preview,
    applyReceipt,
    reopenValidation,
    exportJson,
  });
  assert.equal(roundtrip.ok, true);

  const sunset = migration.buildLegacyMindMapSunsetEvidence({
    roundtripEvidence: roundtrip.value,
    legacyEntrypoints: [{ id: 'legacy-writer', mode: 'active-writer' }],
  });

  assert.equal(sunset.ok, false);
  assert.equal(sunset.error.code, 'E_LEGACY_MINDMAP_UNSAFE_LEGACY_ENTRYPOINT');
  assert.deepEqual(sunset.error.details.unsafeEntrypoints, [{
    index: 0,
    id: 'legacy-writer',
    mode: 'active-writer',
  }]);
});

test('E02C C03: roundtrip and sunset evidence contracts are exported and add no bypasses', async () => {
  const migration = await loadModule(path.join('src', 'import', 'mindmap', 'v1', 'index.mjs'));
  assert.equal(typeof migration.buildLegacyMindMapRoundtripEvidence, 'function');
  assert.equal(typeof migration.buildLegacyMindMapSunsetEvidence, 'function');

  const sourcePath = path.join(process.cwd(), 'src', 'import', 'mindmap', 'v1', 'legacyMindMapRoundtripSunsetEvidence.mjs');
  const source = fs.readFileSync(sourcePath, 'utf8');
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
    /reduceCoreState/u,
    /applyCoreSequence/u,
  ];

  for (const pattern of forbidden) {
    assert.doesNotMatch(source, pattern, `legacyMindMapRoundtripSunsetEvidence.mjs matched ${pattern.source}`);
  }
});
