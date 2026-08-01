const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-v4-a03-c04-modern-comment-state.mjs');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_C04_MODERN_COMMENT_STATE_RECEIPT.json');
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

test('A03 C04 binds modern comment state readback without reply or resolve-reopen promotion', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const promotionList = readJson(PROMOTION_LIST_PATH);
  const profile = readJson(PROFILE_PATH);
  const program = readJson(PROGRAM_PATH);
  const ledger = readJson(LEDGER_PATH);
  const result = verifier.evaluateWordV4A03C04ModernCommentState({
    receipt,
    promotionList,
    profile,
    program,
    ledger,
  });
  const row = promotionList.rows.find((item) => item.capability === 'modernCommentResolveReopenState');

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.issues, []);
  assert.equal(receipt.oracle.activeRootCommentReadbackPass, true);
  assert.equal(receipt.oracle.commentDeletePhysicalPass, true);
  assert.equal(receipt.oracle.replyRemainsTypedLimitation, true);
  assert.equal(receipt.oracle.resolveDoneTrueReadbackOnly, true);
  assert.equal(receipt.oracle.resolveReopenFullPass, false);
  assert.equal(receipt.implementedCapability.stateReadbackOnlyPhysicalWordProven, true);
  assert.equal(receipt.implementedCapability.commentDeletePhysicalWordProven, true);
  assert.equal(receipt.implementedCapability.replyPhysicalWordProven, false);
  assert.equal(receipt.implementedCapability.resolveReopenPhysicalWordProven, false);
  assert.equal(receipt.implementedCapability.productRuntimeWired, false);
  assert.equal(receipt.implementedCapability.automaticApplyCertified, false);
  assert.equal(row.authorityLevel.stateReadbackOnlyPhysicalWordProven, true);
  assert.equal(row.authorityLevel.resolveReopenPhysicalWordProven, false);
  assert.equal(ledger.runtimeClaims.automaticApplyExpanded, false);
  assert.equal(ledger.runtimeClaims.googleDocsOpened, false);
  assert.equal(ledger.coverageLedger.a03C04ModernCommentState.status, 'BOUND_STATE_READBACK_ONLY');
  assert.equal(program.v4ExecutionState.modernResolveReopenCertified, false);
  assert.ok([
    'P0_MODERN_COMMENT_RESOLVE_REOPEN_PRODUCT_PATH_OR_TYPED_LIMITATION',
    'P0_SAFE_FORMATTING_APPLY_LANE_OR_TYPED_LIMITATION',
    'P0_SAFE_STRUCTURAL_APPLY_LANE_OR_TYPED_LIMITATION',
    'P0_MULTI_ROUND_STALE_CONFLICT_AND_LEDGER_RECONCILIATION',
    'P0_WORD_SCALE_ENGINEERING_AND_DECLARED_SUPPORT_ENVELOPE',
  ].includes(program.v4ExecutionState.nextStage));
});

test('A03 C04 rejects full modern comment state overclaim and missing done true evidence', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const promotionList = readJson(PROMOTION_LIST_PATH);
  const profile = readJson(PROFILE_PATH);
  const program = readJson(PROGRAM_PATH);
  const ledger = readJson(LEDGER_PATH);
  const overclaimReceipt = JSON.parse(JSON.stringify(receipt));
  const overclaimPromotion = JSON.parse(JSON.stringify(promotionList));
  const missingDoneTrue = JSON.parse(JSON.stringify(receipt));

  overclaimReceipt.implementedCapability.physicalWordProven = true;
  overclaimReceipt.implementedCapability.productRuntimeWired = true;
  overclaimReceipt.implementedCapability.automaticApplyCertified = true;
  overclaimReceipt.implementedCapability.replyPhysicalWordProven = true;
  overclaimReceipt.implementedCapability.resolveReopenPhysicalWordProven = true;
  overclaimPromotion.rows.find((item) => item.capability === 'modernCommentResolveReopenState').authorityLevel.productRuntimeWired = true;
  missingDoneTrue.oracle.resolveDoneTrueReadbackOnly = false;

  const overclaimResult = verifier.evaluateWordV4A03C04ModernCommentState({
    receipt: overclaimReceipt,
    promotionList: overclaimPromotion,
    profile,
    program,
    ledger,
  });
  const missingDoneTrueResult = verifier.evaluateWordV4A03C04ModernCommentState({
    receipt: missingDoneTrue,
    promotionList,
    profile,
    program,
    ledger,
  });

  assert.equal(overclaimResult.status, 'FAIL');
  assert.equal(overclaimResult.issues.some((item) => item.code === 'RTK_A03_C04_AUTHORITY_OVERCLAIM'), true);
  assert.equal(overclaimResult.issues.some((item) => item.code === 'RTK_A03_C04_PROMOTION_ROW_INVALID'), true);
  assert.equal(missingDoneTrueResult.status, 'FAIL');
  assert.equal(missingDoneTrueResult.issues.some((item) => item.code === 'RTK_A03_C04_ORACLE_INVALID'), true);
});
