const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = 'scripts/ops/rtk-word-v4-e12-modern-comment-native-ui-followup.mjs';
const LEDGER_SCRIPT_PATH = 'scripts/ops/rtk-word-v4-e12-saturation-ledger.mjs';
const RECEIPT_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_MODERN_COMMENT_NATIVE_UI_FOLLOWUP_RECEIPT.json';
const LEDGER_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json';
const PROFILE_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json';
const PROGRAM_PATH = 'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
}

async function loadVerifier() {
  return import(pathToFileURL(path.join(REPO_ROOT, SCRIPT_PATH)).href);
}

test('E12 modern comment native UI follow-up binds external Accessibility blocker without support PASS', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const result = verifier.evaluateWordV4E12ModernCommentNativeUiFollowup({ receipt, requireFiles: true });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.issues, []);
  assert.equal(receipt.result, 'BLOCKED');
  assert.equal(receipt.systemEvents.uiElementsEnabled, false);
  assert.equal(receipt.systemEvents.nativeUiAutomationAllowed, false);
  assert.equal(receipt.certificationDecision.modernReplyCertified, false);
  assert.equal(receipt.certificationDecision.resolveReopenCertified, false);
  assert.equal(receipt.certificationDecision.deleteCertified, false);
  assert.equal(receipt.certificationDecision.nativeUiPhysicalActionsPerformed, false);
  assert.equal(receipt.certificationDecision.externalPermissionRequired, true);
  assert.equal(receipt.remainingWordLimitations.includes('MODERN_REPLY_RESOLVE_REOPEN_STILL_TYPED_LIMITATION'), true);
  assert.equal(receipt.saturated, false);
});

test('E12 modern comment native UI follow-up rejects false support overclaims', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const mutated = JSON.parse(JSON.stringify(receipt));

  mutated.result = 'PASS';
  mutated.systemEvents.uiElementsEnabled = true;
  mutated.certificationDecision.modernReplyCertified = true;
  mutated.certificationDecision.nativeUiPhysicalActionsPerformed = true;
  mutated.runtimeClaims.automaticApplyExpanded = true;
  mutated.vetoMetrics.falseModernCommentSupportClaim = 1;

  const result = verifier.evaluateWordV4E12ModernCommentNativeUiFollowup({ receipt: mutated });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E12_MODERN_NATIVE_UI_STATUS_INVALID'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E12_MODERN_NATIVE_UI_ACCESSIBILITY_INVALID'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E12_MODERN_NATIVE_UI_DECISION_INVALID'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E12_MODERN_NATIVE_UI_RUNTIME_OVERCLAIM'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E12_MODERN_NATIVE_UI_VETO_NONZERO'), true);
});

test('E12 saturation ledger binds native UI blocker and keeps Word current', async () => {
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
  const binding = ledger.evidenceBindings.find((item) => item.id === 'E12_MODERN_COMMENT_NATIVE_UI_ACCESSIBILITY_BLOCKER');

  assert.equal(result.status, 'PASS');
  assert.equal(binding.status, 'BOUND');
  assert.equal(binding.path, RECEIPT_PATH);
  assert.equal(ledger.coverageLedger.modernCommentNativeUiFollowup.status, 'BOUND');
  assert.equal(ledger.notSaturatedReasons.includes('MODERN_REPLY_RESOLVE_REOPEN_STILL_TYPED_LIMITATION'), true);
  assert.equal(ledger.saturationRule.saturated, false);
  assert.equal(program.v4ExecutionState.nextStage, 'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_MODERN_COMMENT_NATIVE_UI_CERTIFICATION');
  assert.equal(program.v4ExecutionState.googleDocsOpened, false);
});
