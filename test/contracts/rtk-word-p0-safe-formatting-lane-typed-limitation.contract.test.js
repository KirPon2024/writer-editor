const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-p0-safe-formatting-lane-typed-limitation.mjs');
const MATRIX_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-normalized-capability-matrix.mjs');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_SAFE_FORMATTING_LANE_TYPED_LIMITATION_RECEIPT.json');
const MATRIX_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_NORMALIZED_CAPABILITY_MATRIX_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const CLASSIFIER_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportClassifierV2.mjs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function loadEvaluator() {
  return import(pathToFileURL(SCRIPT_PATH).href);
}

async function loadMatrixEvaluator() {
  return import(pathToFileURL(MATRIX_SCRIPT_PATH).href);
}

test('P0 safe formatting lane receipt binds diagnostic typed limitation without apply authority', async () => {
  const { evaluateP0SafeFormattingLaneTypedLimitation } = await loadEvaluator();
  const receipt = readJson(RECEIPT_PATH);
  const result = evaluateP0SafeFormattingLaneTypedLimitation();

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.equal(receipt.result, 'PASS');
  assert.equal(receipt.implementedCapability.physicalWordProven, true);
  assert.equal(receipt.implementedCapability.componentProven, true);
  assert.equal(receipt.implementedCapability.productDiagnosticPathProven, true);
  assert.equal(receipt.implementedCapability.productRuntimeApplyWired, false);
  assert.equal(receipt.implementedCapability.productRuntimeWired, false);
  assert.equal(receipt.implementedCapability.automaticFormattingApplyCertified, false);
  assert.equal(receipt.implementedCapability.automaticApplyCertified, false);
  assert.equal(receipt.implementedCapability.formattingApplyTypedLimitationBound, true);
  assert.equal(receipt.implementedCapability.userFacingAuthority, 'FORMAT_PREVIEW_AND_LOSS_REPORT_ONLY');
  assert.deepEqual(Object.values(receipt.vetoMetrics).map(Number), new Array(Object.keys(receipt.vetoMetrics).length).fill(0));
});

test('P0 safe formatting lane binds E08 physical evidence and product diagnostic cases', () => {
  const receipt = readJson(RECEIPT_PATH);
  const e08 = receipt.sourceEvidence.physicalFormatting;
  const product = receipt.sourceEvidence.productFormattingDiagnostics;

  assert.equal(e08.diagnosticLaneBound, true);
  assert.equal(e08.physicalFormattingCases, 17);
  assert.equal(e08.totalFormattingDeltas, 117);
  assert.equal(e08.automaticFormattingApplyCertified, 0);
  assert.equal(e08.destructiveFormattingApplyAdded, 0);
  assert.equal(product.productDiagnosticPathBound, true);
  assert.equal(product.totalCases, 36);
  assert.equal(product.formattingDiagnosticPass, 12);
  assert.equal(product.formattingCaseCount, 12);
  assert.equal(product.formattingWriterCalls, 0);
  assert.equal(product.formattingExplicitApplies, 0);
});

test('formatting classifier lane remains manual and cannot become writer authority', () => {
  const source = fs.readFileSync(CLASSIFIER_PATH, 'utf8');
  assert.match(source, /formatting:\s*classifyManualLane\(reviewIr\.formattingDeltas,\s*'formatting',\s*'RTK_MANUAL_DEGRADED_LOCATOR'\)/u);
  assert.doesNotMatch(source, /formatting:\s*classifyExact|automaticFormattingApply|formattingWriterAuthority:\s*true/u);
});

test('normalized matrix keeps formatting typed limitation closed through later structural successor', async () => {
  const { evaluateNormalizedCapabilityMatrix } = await loadMatrixEvaluator();
  const matrix = readJson(MATRIX_PATH);
  const profile = readJson(PROFILE_PATH);
  const result = evaluateNormalizedCapabilityMatrix({ matrix, profile });
  const byId = new Map(matrix.rows.map((row) => [row.cellId, row]));
  const formatting = byId.get('rtk.word.v4.effectiveFormattingDiagnostics');
  const structural = byId.get('rtk.word.v4.typedStructuralDiagnostics');

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.equal(formatting.blocksWordSaturation, false);
  assert.equal(formatting.reasonCode, 'RTK_NORM_FORMATTING_APPLY_TYPED_LIMITATION_BOUND');
  assert.equal(formatting.requiredNextContour, 'NONE_FORMATTING_TYPED_LIMITATION_BOUND');
  assert.equal(structural.blocksWordSaturation, false);
  assert.equal(structural.reasonCode, 'RTK_NORM_STRUCTURAL_APPLY_TYPED_LIMITATION_BOUND');
  assert.equal(byId.get('rtk.word.v4.multiRoundReplayStaleConflictGuards').blocksWordSaturation, false);
  assert.equal(byId.get('rtk.word.v4.multiRoundReplayStaleConflictGuards').reasonCode, 'RTK_NORM_MULTI_ROUND_REPLAY_GUARDS_RECONCILED');
  assert.equal(matrix.counts.blocksWordSaturation, 0);
  assert.equal(matrix.nextEngineeringOrder[0].contour, 'READY_FOR_FRESH_INDEPENDENT_EXACT_HEAD_AUDIT');
});
