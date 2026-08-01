const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const CLOSURE_RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_MULTI_SCENE_ATOMIC_COMMENT_STATE_CLOSURE_RECEIPT.json');
const REBIND_RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_POSTMERGE_TRUTH_REBIND_RECEIPT.json');

const CLOSURE_STATUS = 'WORD_RELEASE_AUDIT_P0_MULTI_SCENE_ATOMIC_COMMENT_STATE_CLOSURE_COMPLETE_NOT_SATURATED';
const WAVE64_STATUS = 'WORD_RELEASE_AUDIT_P0_VARIED_WAVE64_PRODUCT_LOOP_COMPLETE_NOT_SATURATED';
const C4_STATUS = 'WORD_SAFETY_REMEDIATION_V1_C4_TEST_GRAPH_CI_TRUTH_LOCAL_VERIFIED';
const NEXT_STAGE = 'P0_PRODUCT_VERTICAL_BOUNDED_VARIED_WAVE_64_AFTER_MULTI_SCENE_AND_COMMENT_STATE_CLOSURE';
const C5_NEXT_STAGE = 'WORD_SAFETY_REMEDIATION_V1_C5_FULL_PHYSICAL_WORD_RECERTIFICATION';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('P0 postmerge truth rebind promotes closure as latest aggregate Word state without saturation', () => {
  const program = readJson(PROGRAM_PATH);
  const profile = readJson(PROFILE_PATH);
  const ledger = readJson(LEDGER_PATH);
  const closure = readJson(CLOSURE_RECEIPT_PATH);
  const rebind = readJson(REBIND_RECEIPT_PATH);

  assert.equal(rebind.status, 'PASS');
  assert.equal(rebind.base.headSha, 'e59d1a0ead480176cb364c803bcfef93c129c4bb');
  assert.equal(rebind.correction.staleStatusRebound, true);

  assert.equal([CLOSURE_STATUS, WAVE64_STATUS, C4_STATUS].includes(program.status), true);
  assert.equal(program.status.includes('A03_C05_NON_OVERLAP'), false);
  assert.equal([NEXT_STAGE, 'P0_PRODUCT_VERTICAL_FORMAT_UNICODE_STRUCTURE_STRESS_AFTER_WAVE64', C5_NEXT_STAGE].includes(program.nextStep), true);
  assert.equal(['P0-MULTI-SCENE-ATOMIC-COMMENT-STATE-CLOSURE', 'P0-PRODUCT-VERTICAL-BOUNDED-VARIED-WAVE64', 'WORD_SAFETY_REMEDIATION_V1_C4_TEST_GRAPH_AND_CI_TRUTH'].includes(program.v4ExecutionState.currentStage), true);
  assert.equal(
    [
      'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_MULTI_SCENE_ATOMIC_COMMENT_STATE_CLOSURE_RECEIPT.json',
      'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_VARIED_WAVE64_PRODUCT_LOOP_RECEIPT.json',
      'docs/OPS/RTK/WORD_SAFETY_REMEDIATION_V1_C4_TEST_GRAPH_CI_TRUTH_RECEIPT.json',
    ].includes(program.v4ExecutionState.latestReceiptPath),
    true,
  );
  assert.equal([
    'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_MULTI_SCENE_ATOMIC_COMMENT_STATE_CLOSURE_RECEIPT.json',
    'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_MULTI_ROUND_LEDGER_RECONCILIATION_RECEIPT.json',
  ].includes(program.releaseAuditNight01.latestReceiptPath), true);
  assert.equal(program.v4ExecutionState.multiSceneAtomicApplyCertified, true);
  assert.equal(program.v4ExecutionState.productCommentStateMutationWired, true);
  assert.equal([0, false].includes(program.v4ExecutionState.automaticApplyCertified), true);
  assert.equal(program.v4ExecutionState.wordSaturated, false);
  assert.equal(program.v4ExecutionState.googleDocsOpened, false);

  assert.equal(
    [
      'WORD_16_111_2_PRODUCT_MULTI_SCENE_ATOMIC_COMMENT_STATE_CLOSURE_WIRED_NOT_SATURATED',
      'WORD_16_111_2_P0_VARIED_WAVE64_PRODUCT_LOOP_COMPLETE_NOT_SATURATED',
      C4_STATUS,
    ].includes(profile.status),
    true,
  );
  assert.equal(profile.status.includes('A03_C05_NON_OVERLAP'), false);
  assert.equal(profile.latestProductMultiSceneAtomicCommentStateClosure.productRuntimeWired, true);
  assert.equal(profile.latestProductMultiSceneAtomicCommentStateClosure.multiSceneAtomicApplyCertified, true);
  assert.equal(profile.latestProductMultiSceneAtomicCommentStateClosure.commentDeleteProductRuntimeWired, true);
  assert.equal(profile.latestProductMultiSceneAtomicCommentStateClosure.automaticApplyCertified, false);
  assert.equal(profile.latestProductMultiSceneAtomicCommentStateClosure.wordSaturated, false);

  assert.equal(
    [
      'WORD_SATURATION_PRODUCT_MULTI_SCENE_ATOMIC_COMMENT_STATE_CLOSURE_WIRED_NOT_SATURATED',
      'WORD_SATURATION_P0_VARIED_WAVE64_PRODUCT_LOOP_COMPLETE_NOT_SATURATED',
      C4_STATUS,
    ].includes(ledger.status),
    true,
  );
  assert.equal(ledger.status.includes('A03_C05_NON_OVERLAP'), false);
  assert.equal([NEXT_STAGE, 'P0_PRODUCT_VERTICAL_FORMAT_UNICODE_STRUCTURE_STRESS_AFTER_WAVE64', C5_NEXT_STAGE].includes(ledger.nextStage), true);
  assert.equal(ledger.aggregateTotals.productMultiSceneAtomicCommentStateClosurePass, closure.totals.pass);
  assert.equal(ledger.aggregateTotals.productMultiSceneAtomicApplyCertified, 1);
  assert.equal(ledger.aggregateTotals.productCommentDeleteRuntimeWired, 1);
  assert.equal(ledger.runtimeClaims.automaticApplyExpanded, false);
  assert.equal(ledger.runtimeClaims.wordSaturated, false);
  assert.equal(ledger.runtimeClaims.modernReplyProductRuntimeWired, false);
  assert.equal(ledger.runtimeClaims.modernResolveReopenProductRuntimeWired, false);
  assert.equal([
    'BOUNDED_VARIED_WAVE_64_NOT_RUN_AFTER_MULTI_SCENE_COMMENT_STATE_CLOSURE',
    'WORD_ACCEPTANCE_REVOKED_BY_SOURCE_BOUND_EVIDENCE',
  ].some((reason) => ledger.notSaturatedReasons.includes(reason)), true);
});
