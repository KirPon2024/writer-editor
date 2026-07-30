const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildDiagnosticsFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'atlas-diagnostics-project';
  const sceneId = 'scene-a';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas diagnostics', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId, text: 'Anna met Mira. Anna found Sol. Mira returns.' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-anna', name: 'Anna', entityKind: 'character' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-mira', name: 'Mira', entityKind: 'character' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-sol', name: 'Sol', entityKind: 'character' },
    },
  ]);
  assert.equal(built.ok, true);
  return { derived, projectId, state: built.state };
}

function capabilitySnapshot(overrides = {}) {
  return {
    platformId: 'node',
    capabilities: {
      atlasDiagnosticsStageAcceptance: true,
      atlasOverview: true,
      atlasMatrices: true,
      atlasHeatmap: true,
      atlasReportsSavedQueries: true,
      atlasObservationAggregate: true,
      atlasTemporalContinuity: true,
      atlasLocalGraph: true,
      'cap.atlas.entity.create': true,
      'cap.atlas.alias.add': true,
      'cap.atlas.mention.confirm': true,
      'cap.atlas.observation.suppress': true,
      'cap.atlas.entity.merge': true,
      'cap.atlas.entity.splitRestore': true,
      'cap.atlas.observation.reassign': true,
      'cap.atlas.evidence.reattach': true,
      'cap.atlas.savedQuery.save': true,
      ...overrides,
    },
  };
}

test('E05 C07: diagnostics packet closes Stage 05 acceptance with honest local audit and heuristic receipts', async () => {
  const { derived, projectId, state } = await buildDiagnosticsFixture();
  const diagnostics = derived.deriveAtlasDiagnosticsStageAcceptance({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: capabilitySnapshot(),
  });
  assert.equal(diagnostics.ok, true);
  assert.equal(diagnostics.value.schemaVersion, derived.ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE_SCHEMA_VERSION);
  assert.equal(diagnostics.value.surfaceManifest.schemaVersion, derived.ATLAS_DIAGNOSTICS_SURFACE_MANIFEST_VERSION);
  assert.equal(diagnostics.value.surfaceManifest.providerId, 'query.atlasDiagnosticsStageAcceptance');
  assert.equal(diagnostics.value.surfaceManifest.slotId, 'rightRail.context.atlas.diagnosticsStageAcceptance');
  assert.equal(diagnostics.value.authority.projectTruthMutation, false);
  assert.equal(diagnostics.value.authority.storageMutation, false);
  assert.equal(diagnostics.value.authority.networkMutation, false);
  assert.equal(diagnostics.value.authority.hiddenMutation, false);
  assert.equal(diagnostics.value.surfaceFallbackInventory.schemaVersion, derived.ATLAS_SURFACE_FALLBACK_INVENTORY_SCHEMA_VERSION);
  assert.equal(diagnostics.value.degradedCapabilityReport.schemaVersion, derived.ATLAS_DEGRADED_CAPABILITY_REPORT_SCHEMA_VERSION);
  assert.equal(diagnostics.value.stageAcceptanceProof.schemaVersion, derived.ATLAS_STAGE_ACCEPTANCE_PROOF_SCHEMA_VERSION);
  assert.equal(diagnostics.value.finalUiAuditReceipt.schemaVersion, derived.ATLAS_FINAL_UI_AUDIT_RECEIPT_SCHEMA_VERSION);
  assert.equal(diagnostics.value.heuristicReviewReceipt.schemaVersion, derived.ATLAS_HEURISTIC_REVIEW_RECEIPT_SCHEMA_VERSION);
  assert.equal(diagnostics.value.summary.stageAcceptance, 'pass');
  assert.equal(diagnostics.value.stageAcceptanceProof.pass, true);
  assert.equal(diagnostics.value.summary.passedAcceptanceGateCount, diagnostics.value.summary.acceptanceGateCount);
  assert.ok(diagnostics.value.stageAcceptanceProof.gates.some((gate) => gate.id === 'quiet-write' && gate.status === 'PASS'));
  assert.ok(diagnostics.value.stageAcceptanceProof.gates.some((gate) => gate.id === 'explicit-heavy-surfaces' && gate.status === 'PASS'));
  assert.ok(diagnostics.value.stageAcceptanceProof.gates.some((gate) => gate.id === 'large-project-ui-guards' && gate.status === 'PASS'));
  assert.ok(diagnostics.value.heuristicReviewReceipt.usabilityScoreJudged >= 80);
  assert.match(diagnostics.value.summary.diagnosticsHash, /^[0-9a-f]{64}$/u);
});

test('E05 C07: disabled Atlas capability becomes degraded report row without failing the diagnostics surface', async () => {
  const { derived, projectId, state } = await buildDiagnosticsFixture();
  const diagnostics = derived.deriveAtlasDiagnosticsStageAcceptance({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: capabilitySnapshot({
      atlasHeatmap: false,
      'cap.atlas.savedQuery.save': false,
    }),
  });
  assert.equal(diagnostics.ok, true);
  assert.equal(diagnostics.value.state, 'degraded');
  assert.equal(diagnostics.value.stageAcceptanceProof.pass, false);
  assert.ok(diagnostics.value.summary.degradedCapabilityCount > 0);
  assert.ok(diagnostics.value.degradedCapabilityReport.rows.some((row) => row.code === 'CAPABILITY_DEGRADED' && row.label === 'atlas.savedQuery.save'));
  assert.ok(diagnostics.value.degradedCapabilityReport.rows.some((row) => row.surfaceId === 'surface.atlas.heatmap'));
  assert.ok(diagnostics.value.surfaceFallbackInventory.rows.some((row) => row.surfaceId === 'surface.atlas.heatmap' && row.state === 'unavailable'));
});

test('E05 C07: diagnostics derived sources keep side-effect boundaries closed', () => {
  const sources = [
    'src/derived/atlas/deriveAtlasDiagnosticsStageAcceptance.mjs',
    'src/derived/atlas/atlasDiagnosticsTypes.mjs',
  ].map((relativePath) => [path.basename(relativePath), fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')]);
  const forbiddenPatterns = [
    /from\s+['"]node:fs['"]/u,
    /from\s+['"]node:child_process['"]/u,
    /from\s+['"]node:http['"]/u,
    /from\s+['"]node:https['"]/u,
    /from\s+['"]electron['"]/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
    /\bquerySelector\b/u,
    /\bdispatchEvent\b/u,
  ];
  for (const [basename, source] of sources) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${basename} matched ${pattern.source}`);
    }
  }
});

test('E05 C07: renderer and main wire diagnostics through typed read-only surface', () => {
  const mainSource = fs.readFileSync(path.join(process.cwd(), 'src', 'main.js'), 'utf8');
  const editorSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'editor.js'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'index.html'), 'utf8');
  const cssSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'styles.css'), 'utf8');

  assert.match(mainSource, /const ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE_QUERY_ID = 'query\.atlasDiagnosticsStageAcceptance'/u);
  assert.match(mainSource, /loadAtlasDiagnosticsStageAcceptanceModule/u);
  assert.match(mainSource, /handleWorkspaceAtlasDiagnosticsStageAcceptanceQuery/u);
  assert.match(mainSource, /WORKSPACE_QUERY_BRIDGE_ALLOWED_QUERY_IDS[\s\S]*ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE_QUERY_ID/u);
  assert.doesNotMatch(mainSource, /handleWorkspaceAtlasDiagnosticsStageAcceptanceQuery[\s\S]{0,3600}writeFileAtomic/u);

  assert.match(htmlSource, /data-atlas-diagnostics-host/u);
  assert.match(htmlSource, /data-atlas-diagnostics-provider="query\.atlasDiagnosticsStageAcceptance"/u);
  assert.match(editorSource, /const ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE_QUERY_ID = 'query\.atlasDiagnosticsStageAcceptance'/u);
  assert.match(editorSource, /refreshAtlasDiagnosticsStageAcceptance/u);
  assert.match(editorSource, /Stage 05 acceptance/u);
  assert.doesNotMatch(editorSource, /ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE_QUERY_ID[\s\S]{0,1000}dispatchUiCommand/u);
  assert.doesNotMatch(editorSource, /atlasDiagnosticsStageAcceptance[\s\S]{0,1000}invokePreloadUiCommandBridge/u);
  assert.match(cssSource, /\.right-rail-surface--atlas-diagnostics/u);
});
