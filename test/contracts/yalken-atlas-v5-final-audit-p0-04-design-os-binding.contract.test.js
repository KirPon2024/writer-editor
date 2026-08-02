const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

async function loadManifestModule() {
  return import(pathToFileURL(path.join(
    ROOT,
    'src',
    'renderer',
    'design-os',
    'atlasFeatureIntegrationManifest.mjs',
  )).href);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('P0 04: Atlas feature integration manifest binds product, command, projection and Design OS planes', async () => {
  const workspaceQueryRegistry = require('../../src/shared/workspaceQueryRegistry.cjs');
  const commandCatalog = await import(pathToFileURL(path.join(ROOT, 'src', 'renderer', 'commands', 'command-catalog.v1.mjs')).href);
  const slotCatalog = await import(pathToFileURL(path.join(ROOT, 'src', 'renderer', 'design-os', 'atlasSlotCatalog.v1.mjs')).href);
  const {
    ATLAS_DESIGN_OS_BINDING_SOURCE,
    ATLAS_DESIGN_OS_SLOT_RESOLVER_ID,
    ATLAS_FEATURE_INTEGRATION_MANIFEST_SCHEMA_VERSION,
    YALKEN_ATLAS_FEATURE_INTEGRATION_MANIFEST_V1,
    getAtlasFeatureSurfaceBinding,
    resolveAtlasFeatureDesignOsSlots,
  } = await loadManifestModule();

  assert.equal(ATLAS_FEATURE_INTEGRATION_MANIFEST_SCHEMA_VERSION, 'FEATURE_INTEGRATION_MANIFEST_V1');
  assert.equal(YALKEN_ATLAS_FEATURE_INTEGRATION_MANIFEST_V1.schemaVersion, 'FEATURE_INTEGRATION_MANIFEST_V1');
  assert.equal(YALKEN_ATLAS_FEATURE_INTEGRATION_MANIFEST_V1.featureId, 'yalken.atlasAndManualMap.v5');
  assert.equal(YALKEN_ATLAS_FEATURE_INTEGRATION_MANIFEST_V1.authorityMap.productTruth.includes('Product Core'), true);
  assert.equal(YALKEN_ATLAS_FEATURE_INTEGRATION_MANIFEST_V1.authorityMap.commandAuthority.includes('Command Kernel'), true);
  assert.equal(YALKEN_ATLAS_FEATURE_INTEGRATION_MANIFEST_V1.authorityMap.designAuthority.includes('Design OS slot resolver'), true);
  assert.equal(YALKEN_ATLAS_FEATURE_INTEGRATION_MANIFEST_V1.requiredDesignOsPorts.includes('ShellProjectionPort'), true);
  assert.equal(YALKEN_ATLAS_FEATURE_INTEGRATION_MANIFEST_V1.surfaceManifests.length, 13);
  assert.deepEqual(
    YALKEN_ATLAS_FEATURE_INTEGRATION_MANIFEST_V1.negativeBypassChecks,
    [
      'html-data-attributes-alone-are-not-readiness-proof',
      'unknown-query-provider-fails-closed',
      'unknown-command-id-fails-closed',
      'missing-slot-id-fails-closed',
      'arbitrary-atlas-prefixed-slot-fails-closed',
      'renderer-host-uses-resolved-slot-binding',
    ],
  );

  const result = resolveAtlasFeatureDesignOsSlots({
    manifest: YALKEN_ATLAS_FEATURE_INTEGRATION_MANIFEST_V1,
    commandCatalog: commandCatalog.listCommandCatalog(),
    providerCatalog: workspaceQueryRegistry.WORKSPACE_QUERY_RECORDS,
    slotCatalog: slotCatalog.ATLAS_DESIGN_OS_SLOT_CATALOG_V1,
  });

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.resolverId, ATLAS_DESIGN_OS_SLOT_RESOLVER_ID);
  assert.equal(result.source, ATLAS_DESIGN_OS_BINDING_SOURCE);
  assert.equal(result.bindingCount, 13);
  assert.equal(result.bindings.every((binding) => binding.source === 'DESIGN_OS_SLOT_RESOLVER'), true);
  assert.equal(result.bindings.every((binding) => binding.productMutation === false), true);
  assert.equal(result.bindings.every((binding) => binding.storageAuthority === false), true);
  assert.equal(result.bindings.every((binding) => binding.networkAuthority === false), true);

  const relation = getAtlasFeatureSurfaceBinding(result, 'relation');
  assert.equal(relation.providerId, 'query.atlasRelationDossier');
  assert.equal(relation.slotId, 'rightRail.context.atlas.relationDossier');
  assert.equal(relation.dispatchAuthority, 'CommandKernel');
  assert.deepEqual(relation.commandIds, ['atlas.observation.suppress', 'atlas.observation.reassign', 'atlas.evidence.reattach']);

  const manualMap = getAtlasFeatureSurfaceBinding(result, 'manualMap');
  assert.equal(manualMap.providerId, 'query.manualMapWorkbench');
  assert.equal(manualMap.slotId, 'workspace.plan.manualMapWorkbench');
  assert.equal(manualMap.hostKind, 'planWorkspace');
});

test('P0 04: Design OS slot resolver fails closed for bypass and drift cases', async () => {
  const workspaceQueryRegistry = require('../../src/shared/workspaceQueryRegistry.cjs');
  const commandCatalog = await import(pathToFileURL(path.join(ROOT, 'src', 'renderer', 'commands', 'command-catalog.v1.mjs')).href);
  const slotCatalog = await import(pathToFileURL(path.join(ROOT, 'src', 'renderer', 'design-os', 'atlasSlotCatalog.v1.mjs')).href);
  const {
    YALKEN_ATLAS_FEATURE_INTEGRATION_MANIFEST_V1,
    resolveAtlasFeatureDesignOsSlots,
  } = await loadManifestModule();
  const catalogs = {
    commandCatalog: commandCatalog.listCommandCatalog(),
    providerCatalog: workspaceQueryRegistry.WORKSPACE_QUERY_RECORDS,
    slotCatalog: slotCatalog.ATLAS_DESIGN_OS_SLOT_CATALOG_V1,
  };

  assert.equal(resolveAtlasFeatureDesignOsSlots({}).reason, 'E_ATLAS_COMMAND_KERNEL_CATALOG_REQUIRED');

  const badProvider = clone(YALKEN_ATLAS_FEATURE_INTEGRATION_MANIFEST_V1);
  badProvider.surfaceManifests[0].providerId = 'query.atlasHardcodedBypass';
  assert.equal(
    resolveAtlasFeatureDesignOsSlots({
      manifest: badProvider,
      ...catalogs,
    }).reason,
    'E_ATLAS_SURFACE_PROVIDER_NOT_IN_QUERY_REGISTRY',
  );

  const badSlot = clone(YALKEN_ATLAS_FEATURE_INTEGRATION_MANIFEST_V1);
  badSlot.surfaceManifests[1].slotId = 'random.dom.container';
  assert.equal(
    resolveAtlasFeatureDesignOsSlots({
      manifest: badSlot,
      ...catalogs,
    }).reason,
    'E_ATLAS_SURFACE_SLOT_BINDING_UNRESOLVED',
  );

  const arbitraryAtlasPrefixedSlot = clone(YALKEN_ATLAS_FEATURE_INTEGRATION_MANIFEST_V1);
  arbitraryAtlasPrefixedSlot.surfaceManifests[1].slotId = 'rightRail.context.atlas.shadowBypass';
  assert.equal(
    resolveAtlasFeatureDesignOsSlots({
      manifest: arbitraryAtlasPrefixedSlot,
      ...catalogs,
    }).reason,
    'E_ATLAS_SURFACE_SLOT_BINDING_UNRESOLVED',
  );

  const badCommand = clone(YALKEN_ATLAS_FEATURE_INTEGRATION_MANIFEST_V1);
  badCommand.surfaceManifests[2].commandIds.push('atlas.private.rewriteProject');
  assert.equal(
    resolveAtlasFeatureDesignOsSlots({
      manifest: badCommand,
      ...catalogs,
    }).reason,
    'E_ATLAS_SURFACE_COMMAND_NOT_IN_COMMAND_KERNEL',
  );
});

test('P0 04: renderer binds Atlas surfaces through resolver, not HTML attrs or direct provider writes', () => {
  const editorSource = readText('src/renderer/editor.js');
  const htmlSource = readText('src/renderer/index.html');
  const indexSource = readText('src/renderer/design-os/index.mjs');

  assert.match(editorSource, /resolveAtlasFeatureDesignOsSlots/u);
  assert.match(editorSource, /ATLAS_DESIGN_OS_SLOT_RESOLUTION/u);
  assert.match(editorSource, /applyAtlasResolvedSurfaceBinding/u);
  assert.match(editorSource, /applyAtlasFeatureSurfaceBinding\(host,\s*binding/u);
  assert.match(indexSource, /atlasFeatureIntegrationManifest\.mjs/u);

  const forbiddenDirectProviderWrites = [
    /dataset\.atlasJourneyProvider\s*=\s*ATLAS_CURRENT_SCENE_QUERY_ID/u,
    /dataset\.atlasOverviewProvider\s*=\s*ATLAS_OVERVIEW_QUERY_ID/u,
    /dataset\.atlasEntityDossierProvider\s*=\s*ATLAS_ENTITY_DOSSIER_QUERY_ID/u,
    /dataset\.atlasRelationDossierProvider\s*=\s*ATLAS_RELATION_DOSSIER_QUERY_ID/u,
    /dataset\.atlasMatricesProvider\s*=\s*ATLAS_MATRICES_QUERY_ID/u,
    /dataset\.atlasHeatmapProvider\s*=\s*ATLAS_HEATMAP_QUERY_ID/u,
    /dataset\.atlasTemporalLayoutProvider\s*=\s*ATLAS_TEMPORAL_LAYOUT_QUERY_ID/u,
    /dataset\.atlasContinuityLedgerProvider\s*=\s*ATLAS_CONTINUITY_LEDGER_SURFACE_QUERY_ID/u,
    /dataset\.atlasReportsProvider\s*=\s*ATLAS_REPORTS_SAVED_QUERIES_QUERY_ID/u,
    /dataset\.atlasDiagnosticsProvider\s*=\s*ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE_QUERY_ID/u,
    /dataset\.atlasCurrentSceneProvider\s*=\s*ATLAS_CURRENT_SCENE_QUERY_ID/u,
    /dataset\.manualMapWorkbenchProvider\s*=\s*MANUAL_MAP_WORKBENCH_QUERY_ID/u,
    /dataset\.projectionInspectorProvider\s*=\s*PROJECTION_INSPECTOR_QUERY_ID/u,
  ];
  for (const pattern of forbiddenDirectProviderWrites) {
    assert.doesNotMatch(editorSource, pattern, pattern.source);
  }

  assert.match(htmlSource, /data-atlas-overview-host/u);
  assert.match(htmlSource, /data-atlas-relation-dossier-host/u);
  assert.match(htmlSource, /data-manual-map-workbench-host/u);
});

test('P0 04: final Program DoD gate requires the Design OS binding receipt and exact acceptance keys', () => {
  const source = readText('scripts/ops/yalken-atlas-v5-efinal-final-audit-program-dod.mjs');
  assert.match(source, /P0_04_DESIGN_OS_BINDING/u);
  assert.match(source, /YALKEN_ATLAS_V5_FINAL_AUDIT_P0_04_DESIGN_OS_BINDING_RECEIPT\.json/u);
  assert.match(source, /featureIntegrationManifestBound/u);
  assert.match(source, /slotResolverBound/u);
  assert.match(source, /negativeBypassTested/u);
  assert.doesNotMatch(source, /html-data-attributes-alone.*finalProgramDoDClaim:\s*true/u);
});
