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
const NEXT_STAGE = 'P0_PRODUCT_VERTICAL_BOUNDED_VARIED_WAVE_64_AFTER_MULTI_SCENE_AND_COMMENT_STATE_CLOSURE';

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

  assert.equal(program.status, CLOSURE_STATUS);
  assert.equal(program.nextStep, NEXT_STAGE);
  assert.equal(program.v4ExecutionState.currentStage, 'P0-MULTI-SCENE-ATOMIC-COMMENT-STATE-CLOSURE');
  assert.equal(program.v4ExecutionState.latestReceiptPath, 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_MULTI_SCENE_ATOMIC_COMMENT_STATE_CLOSURE_RECEIPT.json');
  assert.equal(program.v4ExecutionState.multiSceneAtomicApplyCertified, true);
  assert.equal(program.v4ExecutionState.productCommentStateMutationWired, true);
  assert.equal(program.v4ExecutionState.automaticApplyCertified, 0);
  assert.equal(program.v4ExecutionState.wordSaturated, false);
  assert.equal(program.v4ExecutionState.googleDocsOpened, false);

  assert.equal(profile.status, 'WORD_16_111_2_PRODUCT_MULTI_SCENE_ATOMIC_COMMENT_STATE_CLOSURE_WIRED_NOT_SATURATED');
  assert.equal(profile.latestProductMultiSceneAtomicCommentStateClosure.productRuntimeWired, true);
  assert.equal(profile.latestProductMultiSceneAtomicCommentStateClosure.multiSceneAtomicApplyCertified, true);
  assert.equal(profile.latestProductMultiSceneAtomicCommentStateClosure.commentDeleteProductRuntimeWired, true);
  assert.equal(profile.latestProductMultiSceneAtomicCommentStateClosure.automaticApplyCertified, false);
  assert.equal(profile.latestProductMultiSceneAtomicCommentStateClosure.wordSaturated, false);

  assert.equal(ledger.status, 'WORD_SATURATION_PRODUCT_MULTI_SCENE_ATOMIC_COMMENT_STATE_CLOSURE_WIRED_NOT_SATURATED');
  assert.equal(ledger.nextStage, NEXT_STAGE);
  assert.equal(ledger.aggregateTotals.productMultiSceneAtomicCommentStateClosurePass, closure.totals.pass);
  assert.equal(ledger.aggregateTotals.productMultiSceneAtomicApplyCertified, 1);
  assert.equal(ledger.aggregateTotals.productCommentDeleteRuntimeWired, 1);
  assert.equal(ledger.runtimeClaims.automaticApplyExpanded, false);
  assert.equal(ledger.runtimeClaims.wordSaturated, false);
  assert.equal(ledger.runtimeClaims.modernReplyProductRuntimeWired, false);
  assert.equal(ledger.runtimeClaims.modernResolveReopenProductRuntimeWired, false);
  assert.equal(ledger.notSaturatedReasons.includes('BOUNDED_VARIED_WAVE_64_NOT_RUN_AFTER_MULTI_SCENE_COMMENT_STATE_CLOSURE'), true);
});

