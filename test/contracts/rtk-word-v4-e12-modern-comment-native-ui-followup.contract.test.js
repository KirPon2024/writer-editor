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

test('E12 modern comment native UI follow-up binds targeted 30-case gap closure with typed limitations', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const result = verifier.evaluateWordV4E12ModernCommentNativeUiFollowup({ receipt, requireFiles: true });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.issues, []);
  assert.equal(receipt.result, 'PASS');
  assert.equal(receipt.status, 'MODERN_COMMENT_NATIVE_UI_TARGETED_GAP_CLOSURE_COMPLETE_NOT_SATURATED');
  assert.equal(receipt.systemEvents.targetedWordProcessProbe.ok, true);
  assert.equal(receipt.systemEvents.nativeUiAutomationAllowed, true);
  assert.equal(receipt.systemEvents.openDocumentSetUnchanged, true);
  assert.equal(receipt.physicalCorpus.genericWaveRepeated, false);
  assert.equal(receipt.physicalCorpus.observedTargetedCases, 30);
  assert.equal(receipt.physicalCorpus.failedCases.length, 0);
  assert.equal(receipt.certificationDecision.rootModernCommentCertified, true);
  assert.equal(receipt.certificationDecision.wordAuthoredTrackedReplacementCertified, true);
  assert.equal(receipt.certificationDecision.trackedAdjacentEditsCertified, true);
  assert.equal(receipt.certificationDecision.trackedSequentialEditsCertified, true);
  assert.equal(receipt.certificationDecision.trackedParagraphBoundaryCertified, true);
  assert.equal(receipt.certificationDecision.commentsAdjacentToRevisionsCertified, true);
  assert.equal(receipt.certificationDecision.trackedOverlappingEditsCertified, false);
  assert.equal(receipt.certificationDecision.wordNormalizedOverlapAttemptCertified, true);
  assert.equal(receipt.certificationDecision.modernReplyCertified, false);
  assert.equal(receipt.certificationDecision.resolveReopenCertified, false);
  assert.equal(receipt.certificationDecision.deleteCertified, true);
  assert.equal(receipt.certificationDecision.nativeUiPhysicalActionsPerformed, true);
  assert.equal(receipt.certificationDecision.externalPermissionRequired, false);
  const adjacentCase = receipt.physicalCorpus.cases.find((item) => item.id === 'NCUI-T02');
  assert.equal(adjacentCase.result, 'PASS');
  assert.equal(adjacentCase.packageReadback.expectedTrackedTokensFound.includes('178553000002'), true);
  assert.equal(adjacentCase.packageReadback.expectedTrackedTokensFound.includes('178553000003'), true);
  assert.equal(adjacentCase.packageReadback.expectedTrackedTokensMissing.length, 0);
  assert.equal(receipt.remainingWordLimitations.includes('MODERN_REPLY_RESOLVE_REOPEN_STILL_TYPED_LIMITATION'), true);
  assert.equal(receipt.remainingWordLimitations.includes('NATIVE_UI_OVERLAPPING_TRACKED_EDITS_WORD_NORMALIZED_NOT_LITERAL_OVERLAP_CERTIFIED'), true);
  assert.equal(receipt.resolvedLimitations.includes('GENERIC_WAVE300_REPEAT_NOT_REQUIRED_FOR_CURRENT_GAP_CLOSURE'), true);
  assert.equal(receipt.a02Verdict, 'NON_TERMINAL_WORD_NOT_SATURATED_TARGETED_GAPS_REDUCED_A03_PROMOTION_LIST_REQUIRED');
  assert.equal(receipt.saturated, false);
});

test('E12 modern comment native UI follow-up rejects false support overclaims', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const mutated = JSON.parse(JSON.stringify(receipt));

  mutated.result = 'PASS';
  mutated.systemEvents.targetedWordProcessProbe.ok = false;
  mutated.certificationDecision.modernReplyCertified = true;
  mutated.certificationDecision.wordAuthoredTrackedReplacementCertified = false;
  mutated.runtimeClaims.automaticApplyExpanded = true;
  mutated.vetoMetrics.falseModernCommentSupportClaim = 1;

  const result = verifier.evaluateWordV4E12ModernCommentNativeUiFollowup({ receipt: mutated });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E12_TARGETED_GAP_DECISION_INVALID'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E12_MODERN_NATIVE_UI_RUNTIME_OVERCLAIM'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E12_MODERN_NATIVE_UI_VETO_NONZERO'), true);
});

test('E12 saturation ledger binds native UI physical limitation and keeps Word current', async () => {
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
  const binding = ledger.evidenceBindings.find((item) => item.id === 'E12_MODERN_COMMENT_NATIVE_UI_TARGETED_GAP_CLOSURE');

  assert.equal(result.status, 'PASS');
  assert.equal(binding.status, 'BOUND');
  assert.equal(binding.path, RECEIPT_PATH);
  assert.equal(ledger.coverageLedger.modernCommentNativeUiFollowup.status, 'BOUND');
  assert.equal(ledger.coverageLedger.modernCommentNativeUiFollowup.outcome, 'TARGETED_30_CASE_NATIVE_UI_GAP_CLOSURE_CONFIRMED_WITH_TYPED_LIMITATIONS_NO_GENERIC_WAVE_REPEAT');
  assert.equal(ledger.notSaturatedReasons.includes('MODERN_REPLY_REMAINS_ZERO_PARENT_LINK_NOT_CERTIFIED'), true);
  assert.equal(ledger.notSaturatedReasons.includes('TRIPLE_ADJACENT_TRACKED_EDITS_WORD_MODEL_TYPED_LIMITATION'), true);
  assert.equal(ledger.saturationRule.saturated, false);
  assert.equal(program.v4ExecutionState.nextStage, 'EXECUTION_03_A03_C02_NON_OVERLAP_TRACKED_REPLACEMENTS_RUNTIME_CONTOUR');
  assert.equal(program.v4ExecutionState.googleDocsOpened, false);
});
