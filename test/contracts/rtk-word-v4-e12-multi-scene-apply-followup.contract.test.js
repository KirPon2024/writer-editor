const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = 'scripts/ops/rtk-word-v4-e12-multi-scene-apply-followup.mjs';
const LEDGER_SCRIPT_PATH = 'scripts/ops/rtk-word-v4-e12-saturation-ledger.mjs';
const RECEIPT_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_MULTI_SCENE_APPLY_FOLLOWUP_RECEIPT.json';
const LEDGER_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json';
const PROFILE_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json';
const PROGRAM_PATH = 'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
}

async function loadVerifier() {
  return import(pathToFileURL(path.join(REPO_ROOT, SCRIPT_PATH)).href);
}

test('E12 multi-scene apply follow-up certifies only a shadow-only typed limitation', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const result = await verifier.evaluateWordV4E12MultiSceneApplyFollowup({ receipt, requireFiles: true });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.issues, []);
  assert.equal(receipt.certificationDecision.automaticMultiSceneApplyCertified, false);
  assert.equal(receipt.certificationDecision.runtimeApplyAuthorityGranted, false);
  assert.equal(receipt.certificationDecision.productWriterAuthorityAdded, false);
  assert.equal(receipt.certificationDecision.shadowCoordinatorAcceptedAsRuntimeApply, false);
  assert.equal(receipt.certificationDecision.typedLimitationAccepted, true);
  assert.equal(receipt.resolvedLimitations.includes('AUTOMATIC_MULTI_SCENE_APPLY_NOT_PHYSICAL_WORD_CERTIFIED'), true);
  assert.equal(receipt.remainingWordLimitations.includes('AUTOMATIC_MULTI_SCENE_APPLY_NOT_PHYSICAL_WORD_CERTIFIED'), false);
  assert.equal(result.coordinatorProof.canWrite, false);
  assert.equal(result.coordinatorProof.runtimeApplyAuthorityGranted, false);
  assert.equal(receipt.saturated, false);
});

test('E12 multi-scene apply follow-up rejects runtime writer authority overclaims', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const mutated = JSON.parse(JSON.stringify(receipt));

  mutated.certificationDecision.automaticMultiSceneApplyCertified = true;
  mutated.certificationDecision.runtimeApplyAuthorityGranted = true;
  mutated.certificationDecision.shadowCoordinatorAcceptedAsRuntimeApply = true;
  mutated.runtimeClaims.automaticApplyExpanded = true;
  mutated.runtimeClaims.automaticMultiSceneApplyAdded = true;
  mutated.remainingWordLimitations.push('AUTOMATIC_MULTI_SCENE_APPLY_NOT_PHYSICAL_WORD_CERTIFIED');

  const result = await verifier.evaluateWordV4E12MultiSceneApplyFollowup({ receipt: mutated });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E12_MULTI_SCENE_DECISION_INVALID'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E12_MULTI_SCENE_STILL_ACTIVE'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E12_MULTI_SCENE_RUNTIME_OVERCLAIM'), true);
});

test('E12 saturation ledger binds multi-scene typed limitation without saturation claim', async () => {
  const ledgerVerifier = await import(pathToFileURL(path.join(REPO_ROOT, LEDGER_SCRIPT_PATH)).href);
  const ledger = readJson(LEDGER_PATH);
  const profile = readJson(PROFILE_PATH);
  const program = readJson(PROGRAM_PATH);
  const result = ledgerVerifier.evaluateWordV4E12SaturationLedger({
    receipt: ledger,
    profile,
    program,
    requireFiles: true,
  });
  const binding = ledger.evidenceBindings.find((item) => item.id === 'E12_MULTI_SCENE_APPLY_LIMITATION');

  assert.equal(result.status, 'PASS');
  assert.equal(binding.status, 'BOUND');
  assert.equal(binding.path, RECEIPT_PATH);
  assert.equal(ledger.coverageLedger.multiSceneApplyFollowup.status, 'BOUND');
  assert.equal(ledger.notSaturatedReasons.includes('AUTOMATIC_MULTI_SCENE_APPLY_NOT_PHYSICAL_WORD_CERTIFIED'), false);
  assert.equal(ledger.saturationRule.saturated, false);
  assert.equal(program.v4ExecutionState.nextStage, 'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_MODERN_COMMENT_NATIVE_UI_CERTIFICATION');
  assert.equal(program.v4ExecutionState.googleDocsOpened, false);
});
