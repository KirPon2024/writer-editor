const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-p0-multi-round-ledger-reconciliation.mjs');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_MULTI_ROUND_LEDGER_RECONCILIATION_RECEIPT.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const MATRIX_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_NORMALIZED_CAPABILITY_MATRIX_V1.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function loadEvaluator() {
  return import(pathToFileURL(SCRIPT_PATH).href);
}

test('P0 multi-round ledger reconciliation binds E10 and product replay evidence without authority expansion', async () => {
  const { evaluateP0MultiRoundLedgerReconciliation } = await loadEvaluator();
  const receipt = readJson(RECEIPT_PATH);
  const profile = readJson(PROFILE_PATH);
  const program = readJson(PROGRAM_PATH);
  const ledger = readJson(LEDGER_PATH);
  const result = evaluateP0MultiRoundLedgerReconciliation({ receipt, profile, program, ledger });

  assert.equal(result.status, 'PASS', JSON.stringify(result.issues, null, 2));
  assert.equal(receipt.sourceEvidence.e10.guardsBound, true);
  assert.equal(receipt.sourceEvidence.e10.physicalGuardCases, 5);
  assert.equal(receipt.sourceEvidence.productReplay.productLoopsBound, true);
  assert.equal(receipt.implementedCapability.productReplayIdempotentPasses, 90);
  assert.equal(receipt.implementedCapability.productRuntimeWired, false);
  assert.equal(receipt.implementedCapability.automaticReplayApplyCertified, false);
  assert.equal(receipt.implementedCapability.divergentRoundAutoMergeCertified, false);
  assert.equal(receipt.implementedCapability.multiRoundLedgerReconciled, true);
  assert.deepEqual(Object.values(receipt.vetoMetrics).filter((value) => Number(value) !== 0), []);
  assert.equal(program.v4ExecutionState.nextStage, 'READY_FOR_FRESH_INDEPENDENT_EXACT_HEAD_AUDIT');
  assert.equal(program.v4ExecutionState.googleDocsOpened, false);
  assert.equal(ledger.coverageLedger.p0MultiRoundLedgerReconciliation.status, 'BOUND_MULTI_ROUND_REPLAY_GUARDS_RECONCILED');
});

test('P0 multi-round ledger reconciliation refuses replay false-green and stale blocker drift', async () => {
  const { evaluateP0MultiRoundLedgerReconciliation } = await loadEvaluator();
  const receipt = readJson(RECEIPT_PATH);
  const profile = readJson(PROFILE_PATH);
  const program = readJson(PROGRAM_PATH);
  const ledger = readJson(LEDGER_PATH);
  const mutatedReceipt = JSON.parse(JSON.stringify(receipt));
  const mutatedLedger = JSON.parse(JSON.stringify(ledger));

  mutatedReceipt.implementedCapability.automaticReplayApplyCertified = true;
  mutatedReceipt.implementedCapability.divergentRoundAutoMergeCertified = true;
  mutatedReceipt.implementedCapability.productRuntimeWired = true;
  mutatedReceipt.vetoMetrics.replayFailure = 1;
  mutatedLedger.notSaturatedReasons.push('RTK_NORM_MULTI_ROUND_LEDGER_RECONCILIATION_PENDING');

  const result = evaluateP0MultiRoundLedgerReconciliation({
    receipt: mutatedReceipt,
    profile,
    program,
    ledger: mutatedLedger,
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.issues.some((item) => item.code === 'RTK_P0_MULTI_ROUND_AUTHORITY_OVERCLAIM'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_P0_MULTI_ROUND_VETO_NONZERO'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_P0_MULTI_ROUND_LEDGER_INVALID'), true);
});

test('normalized matrix keeps multi-round closed after scale envelope terminal audit', () => {
  const matrix = readJson(MATRIX_PATH);
  const blockers = matrix.rows.filter((row) => row.blocksWordSaturation).map((row) => row.cellId);
  const multiRound = matrix.rows.find((row) => row.cellId === 'rtk.word.v4.multiRoundReplayStaleConflictGuards');
  const saturation = matrix.rows.find((row) => row.cellId === 'rtk.word.v4.saturationLedger');

  assert.deepEqual(blockers, []);
  assert.equal(matrix.counts.blocksWordSaturation, 0);
  assert.equal(multiRound.reasonCode, 'RTK_NORM_MULTI_ROUND_REPLAY_GUARDS_RECONCILED');
  assert.equal(multiRound.requiredNextContour, 'NONE_MULTI_ROUND_LEDGER_RECONCILED');
  assert.equal(multiRound.blocksWordSaturation, false);
  assert.equal(saturation.requiredNextContour, 'NONE_READY_FOR_INDEPENDENT_EXACT_HEAD_AUDIT');
  assert.deepEqual(matrix.nextEngineeringOrder.map((item) => item.contour), [
    'READY_FOR_FRESH_INDEPENDENT_EXACT_HEAD_AUDIT',
  ]);
});
