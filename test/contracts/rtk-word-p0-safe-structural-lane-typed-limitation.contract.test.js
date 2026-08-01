const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-p0-safe-structural-lane-typed-limitation.mjs');
const MATRIX_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-normalized-capability-matrix.mjs');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_SAFE_STRUCTURAL_LANE_TYPED_LIMITATION_RECEIPT.json');
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

test('P0 safe structural lane receipt binds diagnostic typed limitation without apply authority', async () => {
  const { evaluateP0SafeStructuralLaneTypedLimitation } = await loadEvaluator();
  const receipt = readJson(RECEIPT_PATH);
  const result = evaluateP0SafeStructuralLaneTypedLimitation();

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.equal(receipt.result, 'PASS');
  assert.equal(receipt.implementedCapability.physicalWordProven, true);
  assert.equal(receipt.implementedCapability.componentProven, true);
  assert.equal(receipt.implementedCapability.productDiagnosticPathProven, true);
  assert.equal(receipt.implementedCapability.productRuntimeApplyWired, false);
  assert.equal(receipt.implementedCapability.productRuntimeWired, false);
  assert.equal(receipt.implementedCapability.automaticStructuralApplyCertified, false);
  assert.equal(receipt.implementedCapability.automaticApplyCertified, false);
  assert.equal(receipt.implementedCapability.structuralApplyTypedLimitationBound, true);
  assert.equal(receipt.implementedCapability.userFacingAuthority, 'STRUCTURE_PREVIEW_MANUAL_OR_BLOCKED_ONLY');
  assert.deepEqual(Object.values(receipt.vetoMetrics).map(Number), new Array(Object.keys(receipt.vetoMetrics).length).fill(0));
});

test('P0 safe structural lane binds E09 physical evidence and product diagnostic cases', () => {
  const receipt = readJson(RECEIPT_PATH);
  const e09 = receipt.sourceEvidence.physicalStructure;
  const product = receipt.sourceEvidence.productStructuralDiagnostics;

  assert.equal(e09.diagnosticLaneBound, true);
  assert.equal(e09.physicalStructuralCases, 30);
  assert.equal(e09.totalStructureChanges, 31);
  assert.equal(e09.nativeMoveRevisions, 0);
  assert.equal(e09.automaticStructuralApplyCertified, 0);
  assert.equal(e09.destructiveStructuralApplyAdded, 0);
  assert.equal(product.productDiagnosticPathBound, true);
  assert.equal(product.totalCases, 36);
  assert.equal(product.structuralDiagnosticPass, 12);
  assert.equal(product.structuralCaseCount, 12);
  assert.equal(product.structuralWriterCalls, 0);
  assert.equal(product.structuralExplicitApplies, 0);
});

test('structural classifier lanes remain blocked and cannot become writer authority', () => {
  const source = fs.readFileSync(CLASSIFIER_PATH, 'utf8');
  assert.match(source, /structure:\s*classifyBlockedLane\(reviewIr\.structureChanges,\s*'structure',\s*'RTK_BLOCKED_STRUCTURAL'\)/u);
  assert.match(source, /moves:\s*classifyBlockedLane\(reviewIr\.moveRevisions,\s*'move-revisions',\s*'RTK_BLOCKED_MOVE_REVISION'\)/u);
  assert.doesNotMatch(source, /structure:\s*classifyExact|automaticStructuralApply|structuralWriterAuthority:\s*true/u);
});

test('normalized matrix keeps structural typed limitation closed through multi-round reconciliation', async () => {
  const { evaluateNormalizedCapabilityMatrix } = await loadMatrixEvaluator();
  const matrix = readJson(MATRIX_PATH);
  const profile = readJson(PROFILE_PATH);
  const result = evaluateNormalizedCapabilityMatrix({ matrix, profile });
  const byId = new Map(matrix.rows.map((row) => [row.cellId, row]));
  const structural = byId.get('rtk.word.v4.typedStructuralDiagnostics');
  const multiRound = byId.get('rtk.word.v4.multiRoundReplayStaleConflictGuards');
  const ledger = byId.get('rtk.word.v4.saturationLedger');

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.equal(structural.blocksWordSaturation, false);
  assert.equal(structural.reasonCode, 'RTK_NORM_STRUCTURAL_APPLY_TYPED_LIMITATION_BOUND');
  assert.equal(structural.requiredNextContour, 'NONE_STRUCTURAL_TYPED_LIMITATION_BOUND');
  assert.equal(multiRound.blocksWordSaturation, false);
  assert.equal(multiRound.reasonCode, 'RTK_NORM_MULTI_ROUND_REPLAY_GUARDS_RECONCILED');
  assert.equal(multiRound.requiredNextContour, 'NONE_MULTI_ROUND_LEDGER_RECONCILED');
  assert.equal(ledger.blocksWordSaturation, true);
  assert.equal(matrix.counts.blocksWordSaturation, 1);
  assert.equal(matrix.nextEngineeringOrder[0].contour, 'P0_WORD_SCALE_ENGINEERING_AND_DECLARED_SUPPORT_ENVELOPE');
});
