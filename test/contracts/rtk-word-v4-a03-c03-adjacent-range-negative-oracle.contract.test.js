const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-v4-a03-c03-adjacent-range-negative-oracle.mjs');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_C03_ADJACENT_RANGE_NEGATIVE_ORACLE_RECEIPT.json');
const PROMOTION_LIST_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_PROMOTION_LIST.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function loadVerifier() {
  return import(pathToFileURL(SCRIPT_PATH).href);
}

test('A03 C03 binds adjacent range negative oracle without product apply promotion', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const promotionList = readJson(PROMOTION_LIST_PATH);
  const profile = readJson(PROFILE_PATH);
  const program = readJson(PROGRAM_PATH);
  const ledger = readJson(LEDGER_PATH);
  const result = verifier.evaluateWordV4A03C03AdjacentRangeNegativeOracle({
    receipt,
    promotionList,
    profile,
    program,
    ledger,
  });
  const row = promotionList.rows.find((item) => item.capability === 'adjacentTrackedReplacementExactCandidate');

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.issues, []);
  assert.equal(receipt.oracle.twoAdjacentPass, true);
  assert.equal(receipt.oracle.tripleIdentityLoss, true);
  assert.equal(receipt.oracle.a02TripleBlocked, true);
  assert.equal(receipt.oracle.c02NoProductAuthority, true);
  assert.equal(receipt.implementedCapability.negativeOracleBound, true);
  assert.equal(receipt.implementedCapability.productRuntimeWired, false);
  assert.equal(receipt.implementedCapability.automaticApplyCertified, false);
  assert.equal(row.authorityLevel.negativeOracleBound, true);
  assert.equal(row.authorityLevel.productRuntimeWired, false);
  assert.equal(row.authorityLevel.automaticApplyCertified, false);
  assert.equal(ledger.runtimeClaims.writerAuthorityAdded, false);
  assert.equal(ledger.runtimeClaims.automaticApplyExpanded, false);
  assert.equal(program.v4ExecutionState.nextStage, 'EXECUTION_03_A03_C04_MODERN_COMMENT_STATE_ONLY_IF_PHYSICAL_PASS');
});

test('A03 C03 rejects automatic apply overclaim and missing triple-adjacent identity loss', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const promotionList = readJson(PROMOTION_LIST_PATH);
  const profile = readJson(PROFILE_PATH);
  const program = readJson(PROGRAM_PATH);
  const ledger = readJson(LEDGER_PATH);
  const overclaimReceipt = JSON.parse(JSON.stringify(receipt));
  const overclaimPromotion = JSON.parse(JSON.stringify(promotionList));
  const incompleteOracle = JSON.parse(JSON.stringify(receipt));

  overclaimReceipt.implementedCapability.automaticApplyCertified = true;
  overclaimReceipt.implementedCapability.productRuntimeWired = true;
  overclaimPromotion.rows.find((item) => item.capability === 'adjacentTrackedReplacementExactCandidate').authorityLevel.automaticApplyCertified = true;
  incompleteOracle.oracle.tripleIdentityLoss = false;

  const overclaimResult = verifier.evaluateWordV4A03C03AdjacentRangeNegativeOracle({
    receipt: overclaimReceipt,
    promotionList: overclaimPromotion,
    profile,
    program,
    ledger,
  });
  const incompleteResult = verifier.evaluateWordV4A03C03AdjacentRangeNegativeOracle({
    receipt: incompleteOracle,
    promotionList,
    profile,
    program,
    ledger,
  });

  assert.equal(overclaimResult.status, 'FAIL');
  assert.equal(overclaimResult.issues.some((item) => item.code === 'RTK_A03_C03_AUTHORITY_OVERCLAIM'), true);
  assert.equal(overclaimResult.issues.some((item) => item.code === 'RTK_A03_C03_PROMOTION_ROW_INVALID'), true);
  assert.equal(incompleteResult.status, 'FAIL');
  assert.equal(incompleteResult.issues.some((item) => item.code === 'RTK_A03_C03_ORACLE_INVALID'), true);
});
