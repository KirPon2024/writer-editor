const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MATRIX_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_NORMALIZED_CAPABILITY_MATRIX_V1.json');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_NORMALIZED_CAPABILITY_MATRIX_RECEIPT.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-normalized-capability-matrix.mjs');
const NEXT_STAGE = 'P0_WORD_SCALE_ENGINEERING_AND_DECLARED_SUPPORT_ENVELOPE';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function loadEvaluator() {
  return import(pathToFileURL(SCRIPT_PATH).href);
}

test('normalized Word capability matrix binds exactly the 25 profile cells', async () => {
  const { evaluateNormalizedCapabilityMatrix } = await loadEvaluator();
  const matrix = readJson(MATRIX_PATH);
  const profile = readJson(PROFILE_PATH);
  const result = evaluateNormalizedCapabilityMatrix({ matrix, profile });

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.equal(matrix.rows.length, 25);
  assert.deepEqual(matrix.rows.map((row) => row.cellId), profile.cells.map((cell) => cell.capabilityId));
  assert.equal(matrix.counts.totalCells, 25);
  assert.equal(matrix.counts.physicalWordEvidence, 16);
  assert.equal(matrix.counts.productRuntimeWired, 11);
  assert.equal(matrix.counts.automaticApplyCertified, 0);
});

test('normalized Word capability matrix separates component diagnostic limitation and runtime authority', () => {
  const matrix = readJson(MATRIX_PATH);
  const byId = new Map(matrix.rows.map((row) => [row.cellId, row]));

  assert.equal(byId.get('rtk.word.v4.coreManifestYrtk2').productRuntimeWired, false);
  assert.equal(byId.get('rtk.word.v4.minimalSemanticKernel').productRuntimeWired, false);
  assert.equal(byId.get('rtk.word.v4.effectiveFormattingDiagnostics').currentTerminalClass, 'DIAGNOSTIC_ONLY');
  assert.equal(byId.get('rtk.word.v4.typedStructuralDiagnostics').currentTerminalClass, 'DIAGNOSTIC_ONLY');
  assert.equal(byId.get('rtk.word.v4.adjacentRangeNegativeOracle').currentTerminalClass, 'TYPED_LIMITATION');
  assert.equal(byId.get('rtk.word.v4.modernCommentStateReadbackGate').currentTerminalClass, 'TYPED_LIMITATION');
  assert.equal(byId.get('rtk.word.v4.nonOverlapTrackedReplacementProductPath').userFacingAuthority, 'EXPLICIT_USER_CONFIRMED_NON_OVERLAP_TRACKED_REPLACEMENT_APPLY');
  assert.equal(byId.get('rtk.word.v4.nonOverlapTrackedReplacementRuntimeApply').userFacingAuthority, 'NONE_STANDALONE_SUPERSEDED_BY_C05_PRODUCT_PATH');
});

test('normalized Word capability matrix keeps remaining Word blockers explicit and ordered', () => {
  const matrix = readJson(MATRIX_PATH);
  const blockers = new Set(matrix.rows.filter((row) => row.blocksWordSaturation).map((row) => row.cellId));

  assert.deepEqual([...blockers].sort(), [
    'rtk.word.v4.saturationLedger',
  ].sort());
  assert.equal(matrix.counts.blocksWordSaturation, 1);
  assert.equal(matrix.rows.find((row) => row.cellId === 'rtk.word.v4.commentsShadowAnalysis').reasonCode, 'RTK_NORM_MODERN_REPLY_TYPED_LIMITATION_BOUND');
  assert.equal(matrix.rows.find((row) => row.cellId === 'rtk.word.v4.commentsShadowAnalysis').requiredNextContour, 'NONE_REPLY_TYPED_LIMITATION_BOUND');
  assert.equal(matrix.rows.find((row) => row.cellId === 'rtk.word.v4.modernCommentStateReadbackGate').reasonCode, 'RTK_NORM_RESOLVE_REOPEN_TYPED_LIMITATION_BOUND');
  assert.equal(matrix.rows.find((row) => row.cellId === 'rtk.word.v4.modernCommentStateReadbackGate').requiredNextContour, 'NONE_RESOLVE_REOPEN_TYPED_LIMITATION_BOUND');
  assert.equal(matrix.rows.find((row) => row.cellId === 'rtk.word.v4.modernCommentStateReadbackGate').blocksWordSaturation, false);
  assert.equal(matrix.rows.find((row) => row.cellId === 'rtk.word.v4.effectiveFormattingDiagnostics').reasonCode, 'RTK_NORM_FORMATTING_APPLY_TYPED_LIMITATION_BOUND');
  assert.equal(matrix.rows.find((row) => row.cellId === 'rtk.word.v4.effectiveFormattingDiagnostics').requiredNextContour, 'NONE_FORMATTING_TYPED_LIMITATION_BOUND');
  assert.equal(matrix.rows.find((row) => row.cellId === 'rtk.word.v4.effectiveFormattingDiagnostics').blocksWordSaturation, false);
  assert.equal(matrix.rows.find((row) => row.cellId === 'rtk.word.v4.typedStructuralDiagnostics').reasonCode, 'RTK_NORM_STRUCTURAL_APPLY_TYPED_LIMITATION_BOUND');
  assert.equal(matrix.rows.find((row) => row.cellId === 'rtk.word.v4.typedStructuralDiagnostics').requiredNextContour, 'NONE_STRUCTURAL_TYPED_LIMITATION_BOUND');
  assert.equal(matrix.rows.find((row) => row.cellId === 'rtk.word.v4.typedStructuralDiagnostics').blocksWordSaturation, false);
  assert.equal(matrix.rows.find((row) => row.cellId === 'rtk.word.v4.multiRoundReplayStaleConflictGuards').reasonCode, 'RTK_NORM_MULTI_ROUND_REPLAY_GUARDS_RECONCILED');
  assert.equal(matrix.rows.find((row) => row.cellId === 'rtk.word.v4.multiRoundReplayStaleConflictGuards').requiredNextContour, 'NONE_MULTI_ROUND_LEDGER_RECONCILED');
  assert.equal(matrix.rows.find((row) => row.cellId === 'rtk.word.v4.multiRoundReplayStaleConflictGuards').blocksWordSaturation, false);
  assert.deepEqual(matrix.nextEngineeringOrder.map((item) => item.contour), [
    'P0_WORD_SCALE_ENGINEERING_AND_DECLARED_SUPPORT_ENVELOPE',
  ]);
});

test('normalized Word capability matrix refuses overclaim and premature Google stage', async () => {
  const { evaluateNormalizedCapabilityMatrix } = await loadEvaluator();
  const profile = readJson(PROFILE_PATH);
  const base = readJson(MATRIX_PATH);

  const badCounts = clone(base);
  badCounts.counts.productRuntimeWired = 25;
  assert.equal(evaluateNormalizedCapabilityMatrix({ matrix: badCounts, profile }).ok, false);

  const badAuto = clone(base);
  badAuto.counts.automaticApplyCertified = 1;
  assert.equal(evaluateNormalizedCapabilityMatrix({ matrix: badAuto, profile }).ok, false);

  const badRuntime = clone(base);
  badRuntime.rows.find((row) => row.cellId === 'rtk.word.v4.coreManifestYrtk2').productRuntimeWired = true;
  assert.equal(evaluateNormalizedCapabilityMatrix({ matrix: badRuntime, profile }).ok, false);

  const google = clone(base);
  google.googleDocsOpened = true;
  assert.equal(evaluateNormalizedCapabilityMatrix({ matrix: google, profile }).ok, false);
});

test('normalized Word capability matrix state bindings are non-terminal', () => {
  const matrix = readJson(MATRIX_PATH);
  const receipt = readJson(RECEIPT_PATH);
  const program = readJson(PROGRAM_PATH);
  const profile = readJson(PROFILE_PATH);
  const ledger = readJson(LEDGER_PATH);

  assert.equal(receipt.matrixBinding.path, 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_NORMALIZED_CAPABILITY_MATRIX_V1.json');
  assert.equal(receipt.counts.totalCells, 25);
  assert.equal(program.releaseAuditNight01.normalizedCapabilityMatrixPath, receipt.matrixBinding.path);
  assert.equal(program.releaseAuditNight01.nextStage, NEXT_STAGE);
  assert.equal(program.releaseAuditNight01.wordSaturated, false);
  assert.equal(profile.normalizedCapabilityMatrix.matrixPath, receipt.matrixBinding.path);
  assert.equal(profile.normalizedCapabilityMatrix.counts.productRuntimeWired, matrix.counts.productRuntimeWired);
  assert.equal(ledger.coverageLedger.releaseAuditNight01NormalizedCapabilityMatrix.counts.physicalWordEvidence, 16);
  assert.equal(ledger.runtimeClaims.wordSaturated, false);
  assert.equal(ledger.runtimeClaims.googleDocsOpened, false);
});
