const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  return import(pathToFileURL(path.join(process.cwd(), relativePath)).href);
}

function readSource(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readSource(relativePath));
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

async function buildDiagnosticsFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'atlas-er-c00-readiness-project';
  const sceneId = 'scene-er-c00';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'ER C00 readiness', sceneId },
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
  ]);
  assert.equal(built.ok, true);
  return { derived, projectId, state: built.state };
}

test('ER C00: Stage 10 readiness is not derived by runtime self-attestation', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const commentsHistory = await loadModule(path.join('src', 'derived', 'commentsHistory', 'index.mjs'));
  assert.equal(Object.prototype.hasOwnProperty.call(derived, 'deriveStage10Acceptance'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(commentsHistory, 'deriveStage10Acceptance'), false);

  const sources = [
    'src/derived/commentsHistory/deriveHistory.mjs',
    'src/derived/commentsHistory/index.mjs',
    'src/derived/index.mjs',
  ];
  for (const relativePath of sources) {
    const source = readSource(relativePath);
    assert.doesNotMatch(source, /\bderiveStage10Acceptance\b/u);
    assert.doesNotMatch(source, /\bSTAGE_10_ACCEPTANCE_SCHEMA_VERSION\b/u);
    assert.doesNotMatch(source, /\breadyForNextStage\s*:/u);
    assert.doesNotMatch(source, /\breleaseReadinessClaim\s*:\s*true\b/u);
    assert.doesNotMatch(source, /\bplatformCertificationClaim\s*:\s*true\b/u);
  }
});

test('ER C00: Atlas diagnostics default to NOT_READY without external machine evidence', async () => {
  const { derived, projectId, state } = await buildDiagnosticsFixture();
  const diagnostics = derived.deriveAtlasDiagnosticsStageAcceptance({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: capabilitySnapshot(),
  });

  assert.equal(diagnostics.ok, true);
  assert.equal(diagnostics.value.summary.stageAcceptance, 'not_ready');
  assert.equal(diagnostics.value.stageAcceptanceProof.pass, false);
  assert.equal(diagnostics.value.finalUiAuditReceipt.finalBar.status, 'NOT_READY');
  assert.equal(diagnostics.value.finalUiAuditReceipt.visualCapture, 'NOT_READY_MISSING_EXTERNAL_VISUAL_CAPTURE');
  assert.equal(diagnostics.value.finalUiAuditReceipt.accessibility.status, 'NOT_READY');
  assert.equal(diagnostics.value.finalUiAuditReceipt.responsive.status, 'NOT_READY');
  assert.equal(diagnostics.value.finalUiAuditReceipt.performance.status, 'NOT_READY');
  assert.equal(diagnostics.value.finalUiAuditReceipt.externalEvidence.allRequiredArtifactsPresent, false);
  assert.deepEqual(diagnostics.value.finalUiAuditReceipt.externalEvidence.missingArtifacts, [
    'visualCaptureArtifact',
    'accessibilityAuditArtifact',
    'responsiveAuditArtifact',
    'performanceMeasurementArtifact',
    'packagedRunArtifact',
  ]);
  assert.ok(diagnostics.value.stageAcceptanceProof.gates.some((gate) => gate.id === 'quiet-write' && gate.status === 'PASS'));
  assert.ok(diagnostics.value.stageAcceptanceProof.gates.some((gate) => gate.id === 'external-machine-evidence' && gate.status === 'NOT_READY'));
  assert.equal(diagnostics.value.evidence.designAdvisory.advisoryOnly, true);
  assert.equal(diagnostics.value.evidence.designAdvisory.runtimeMetadataIncluded, false);
  assert.equal(diagnostics.value.evidence.designAdvisory.readinessToken, false);
  assert.equal(diagnostics.value.heuristicReviewReceipt.readinessToken, false);
});

test('ER C00: diagnostics source rejects PASS/PASS quiet-write and static readiness tokens', () => {
  const source = readSource('src/derived/atlas/deriveAtlasDiagnosticsStageAcceptance.mjs');
  assert.doesNotMatch(source, /\?\s*'PASS'\s*:\s*'PASS'/u);
  assert.doesNotMatch(source, /visualCapture:\s*'notCapturedInThisDerivedPacket'/u);
  assert.doesNotMatch(source, /accessibility:\s*\{[\s\S]{0,120}status:\s*'PASS'/u);
  assert.doesNotMatch(source, /responsive:\s*\{[\s\S]{0,120}status:\s*'PASS'/u);
  assert.match(source, /\bexternalMachineEvidenceReady\b/u);
  assert.match(source, /designAdvisoryOnly:\s*true/u);
  assert.match(source, /readinessToken:\s*false/u);
});

test('ER C00: repair receipt, when present, binds state reconciliation and forbids pending PASS rows', () => {
  const relativePath = path.join(
    'docs',
    'OPS',
    'STATUS',
    'YALKEN_ATLAS_V5_ER_C00_ACCEPTANCE_TRUTH_STATE_RECONCILIATION_RECEIPT.json',
  );
  if (!fs.existsSync(path.join(process.cwd(), relativePath))) {
    assert.ok(true);
    return;
  }

  const receipt = readJson(relativePath);
  assert.equal(receipt.contourId, 'ER_C00_ACCEPTANCE_TRUTH_AND_STATE_RECONCILIATION');
  assert.equal(receipt.programStage, 'ER_AUDIT_REPAIR_2026_07_31');
  assert.equal(receipt.designToolRouter, 'NOT_APPLICABLE');
  assert.equal(receipt.readinessDefault, 'NOT_READY');
  assert.equal(receipt.runtimeFacts.stage10RuntimeSelfAttestationRemoved, true);
  assert.equal(receipt.runtimeFacts.missingExternalEvidenceDefaultsNotReady, true);
  assert.equal(receipt.runtimeFacts.stage11Started, false);
  assert.equal(receipt.runtimeFacts.lazywebReadinessToken, false);
  assert.equal(receipt.targetBinding.sha, receipt.git.baseSha);
  assert.match(receipt.targetBinding.artifactDigest, /^[a-f0-9]{64}$/u);
  assert.ok(receipt.invalidatedAcceptanceEvidence.includes('YALKEN_ATLAS_V5_E05_C07_ATLAS_DIAGNOSTICS_DEGRADED_CAPABILITY_STAGE_ACCEPTANCE_RECEIPT'));
  assert.ok(receipt.invalidatedAcceptanceEvidence.includes('YALKEN_ATLAS_V5_E06_C08_ATLAS_STAGE_06_ACCEPTANCE_DIAGNOSTICS_HANDOFF_RECEIPT'));
  assert.ok(receipt.unsatisfiedStageOutcomes.includes('E01_STAGE_01_EXACT_ATLAS_USER_OUTCOME'));
  assert.ok(receipt.unsatisfiedStageOutcomes.includes('E02_STAGE_02_MANUAL_MAP_GRAPH_WORKBENCH_USER_OUTCOME'));
  assert.ok(receipt.unsatisfiedStageOutcomes.includes('E03_STAGE_03_PLOT_IDEA_MEANING_USER_OUTCOME'));
  assert.ok(receipt.unsatisfiedStageOutcomes.includes('E05_STAGE_05_FULL_ATLAS_READ_SURFACES_USER_OUTCOME'));
  for (const row of receipt.validation) {
    if (row.result !== 'PASS') continue;
    assert.doesNotMatch(row.summary, /pending|not_run|not run/i);
    assert.equal(Number.isInteger(row.exitCode), true);
    assert.equal(row.exitCode, 0);
    assert.match(row.artifactDigest, /^[a-f0-9]{64}$/u);
  }
});
