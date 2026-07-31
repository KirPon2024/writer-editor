const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

async function loadOpsModule() {
  return import(pathToFileURL(path.join(ROOT, 'scripts', 'ops', 'yalken-atlas-v5-er-c07-stage-revalidation-handoff.mjs')).href);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function passingReceipt(overrides = {}) {
  return {
    readinessDefault: 'NOT_READY',
    runtimeFacts: {
      stage10RuntimeSelfAttestationRemoved: true,
      missingExternalEvidenceDefaultsNotReady: true,
      unicodeAnchorFieldsPreservedByCoreCommands: true,
      unknownFutureAnchorFieldsPreserved: true,
      commentsHistoryAnchorIntegrityFailuresRemaining: 0,
      singleWorkspaceQueryRegistry: true,
      rendererUnknownQueryFailClosed: true,
      mainUnknownQueryFailClosed: true,
      sharedProductCommandRegistry: true,
      mainBridgeAllowlistProjectsProductRegistry: true,
      productCommandBridgeAuthority: 'CommandKernel',
      realWorkerThreadAdapter: true,
      activeShellCountDesktop: 1,
      activeShellCountTablet: 1,
      keyboardNavigationPass: true,
    },
    negativeAssertions: {
      zeroUnicodeAnchorFieldLoss: true,
      noManualDivergentQueryAllowlist: true,
      noCommandKernelBypass: true,
    },
    measured10kBudget: { status: 'PASS' },
    validations: [
      { id: 'focused-er-c04', status: 'PASS', summary: 'journey workbench inspector proof' },
    ],
    ...overrides,
  };
}

function fullEvidence(overrides = {}) {
  return {
    receipts: {
      erC00: passingReceipt(),
      erC01: passingReceipt(),
      erC02: passingReceipt(),
      erC03: passingReceipt(),
      erC04: passingReceipt(),
      erC05: passingReceipt(),
      erC06: passingReceipt(),
    },
    liveRendererProof: {
      pass: true,
      proofHash: 'a'.repeat(64),
      assertions: {
        stage01ExactAtlasJourney: true,
        stage02ManualMapGraphWorkbench: true,
        stage03PlotIdeaMeaningSurfaces: true,
        stage05AllAtlasReadSurfacesReachable: true,
        noNetwork: true,
        reopenProof: true,
        recoveryProof: true,
        commandKernelReceipts: true,
      },
    },
    invalidatedReceiptIds: [
      'YALKEN_ATLAS_V5_E05_C07_ATLAS_DIAGNOSTICS_DEGRADED_CAPABILITY_STAGE_ACCEPTANCE_RECEIPT',
      'YALKEN_ATLAS_V5_E06_C08_ATLAS_STAGE_06_ACCEPTANCE_DIAGNOSTICS_HANDOFF_RECEIPT',
    ],
    validation: {
      rendererBuild: 'PASS',
      focusedContracts: 'PASS',
      testOps: 'PASS',
      doctrine: 'PASS',
      ossPolicy: 'PASS',
      fullRunner: 'PASS',
      genericSast: 'NOT_READY',
    },
    ...overrides,
  };
}

test('ER C07: evaluator certifies Stage 01/02/03/05 only from real receipts, live renderer proof, and full validation', async () => {
  const { evaluateStageRevalidationEvidence } = await loadOpsModule();
  const result = evaluateStageRevalidationEvidence(fullEvidence());

  assert.equal(result.status, 'READY_FOR_E11_COMPILATION_AFTER_DELIVERY_CHAIN');
  assert.deepEqual(result.certifiedStageOutcomes, [
    'E01_STAGE_01_EXACT_ATLAS_USER_OUTCOME',
    'E02_STAGE_02_MANUAL_MAP_GRAPH_WORKBENCH_USER_OUTCOME',
    'E03_STAGE_03_PLOT_IDEA_MEANING_USER_OUTCOME',
    'E05_STAGE_05_FULL_ATLAS_READ_SURFACES_USER_OUTCOME',
  ]);
  assert.ok(result.unsatisfiedStageOutcomes.includes('E11_ACTIVE_PLATFORM_CERTIFICATION_NOT_STARTED'));
  assert.ok(result.unsatisfiedStageOutcomes.includes('EFINAL_PROGRAM_DOD_NOT_STARTED'));
  assert.equal(result.negativeAssertions.stage11Started, false);
});

test('ER C07: completed contour count and invalidated E05/E06 receipts cannot produce readiness', async () => {
  const { evaluateStageRevalidationEvidence } = await loadOpsModule();
  const result = evaluateStageRevalidationEvidence(fullEvidence({
    liveRendererProof: { pass: false, assertions: {} },
    invalidatedReceiptIds: [],
    validation: {
      rendererBuild: 'PASS',
      focusedContracts: 'PASS',
      testOps: 'PASS',
      doctrine: 'PASS',
      ossPolicy: 'PASS',
      fullRunner: 'PASS',
      genericSast: 'PASS',
      completedContourCount: 99,
    },
  }));

  assert.equal(result.status, 'NOT_READY');
  assert.deepEqual(result.certifiedStageOutcomes, []);
  assert.equal(result.invalidatedEvidence.rejectedAsReadinessEvidence, false);
  assert.equal(result.negativeAssertions.noCompletedContourCountReadiness, true);
});

test('ER C07: SAST gaps are classified as NOT_READY, not PASS, while production exposure stays separate', async () => {
  const { evaluateStageRevalidationEvidence } = await loadOpsModule();
  const result = evaluateStageRevalidationEvidence(fullEvidence());

  assert.equal(result.validation.genericSast, 'NOT_READY');
  assert.equal(result.validation.genericSastProductionExposure, 'DEV_AUDIT_GAP_NOT_SHIPPED_AS_STAGE_CERTIFICATION');
  assert.ok(result.unsatisfiedStageOutcomes.includes('GENERIC_SAST_SECURITY_CERTIFICATION_NOT_READY'));
});

test('ER C07: source keeps revalidation outside product runtime and requires renderer/live artifact path', () => {
  const source = read('scripts/ops/yalken-atlas-v5-er-c07-stage-revalidation-handoff.mjs');
  const diagnosticsSource = read('src/derived/atlas/deriveAtlasDiagnosticsStageAcceptance.mjs');

  assert.match(source, /runLiveRendererJourney/u);
  assert.match(source, /INVALIDATED_RECEIPTS/u);
  assert.match(source, /liveRendererProof/u);
  assert.doesNotMatch(source, /completedContourCount.*READY/u);
  assert.doesNotMatch(diagnosticsSource, /READY_FOR_E11_COMPILATION/u);
  assert.doesNotMatch(diagnosticsSource, /CERTIFIED_STAGE_OUTCOMES/u);
});

test('ER C07: committed receipt, when present, records honest handoff boundaries', () => {
  const relativePath = path.join('docs', 'OPS', 'STATUS', 'YALKEN_ATLAS_V5_ER_C07_STAGE_REVALIDATION_HANDOFF_RECEIPT.json');
  if (!fs.existsSync(path.join(ROOT, relativePath))) {
    assert.ok(true);
    return;
  }
  const receipt = readJson(relativePath);
  assert.equal(receipt.contourId, 'ER_C07_STAGE_REVALIDATION_AND_HANDOFF');
  assert.equal(receipt.programStage, 'ER_AUDIT_REPAIR_2026_07_31');
  assert.equal(receipt.stage11Started, false);
  assert.equal(receipt.invalidatedEvidence.rejectedAsReadinessEvidence, true);
  assert.ok(receipt.certifiedStageOutcomes.includes('E01_STAGE_01_EXACT_ATLAS_USER_OUTCOME'));
  assert.ok(receipt.unsatisfiedStageOutcomes.includes('E11_ACTIVE_PLATFORM_CERTIFICATION_NOT_STARTED'));
  assert.notEqual(receipt.validation.genericSast.status, 'PASS_WITH_GAPS');
  assert.match(receipt.evidence.stageRevalidationReportSha256, /^[a-f0-9]{64}$/u);
});
