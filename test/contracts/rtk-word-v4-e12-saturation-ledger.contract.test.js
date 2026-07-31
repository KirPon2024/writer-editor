const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = 'scripts/ops/rtk-word-v4-e12-saturation-ledger.mjs';
const WAVE40_SCRIPT_PATH = 'scripts/ops/rtk-word-v4-e12-physical-wave40.mjs';
const WAVE100_SCRIPT_PATH = 'scripts/ops/rtk-word-v4-e12-physical-wave100.mjs';
const WAVE300_SCRIPT_PATH = 'scripts/ops/rtk-word-v4-e12-physical-wave300.mjs';
const STABILITY_AUDIT_SCRIPT_PATH = 'scripts/ops/rtk-word-v4-e12-stability-limitation-audit.mjs';
const STABILITY_REPEAT_SCRIPT_PATH = 'scripts/ops/rtk-word-v4-e12-stability-wave300-repeat.mjs';
const PARSER_GAP_FOLLOWUP_SCRIPT_PATH = 'scripts/ops/rtk-word-v4-e12-parser-gap-followup.mjs';
const CUSTOMXML_FOLLOWUP_SCRIPT_PATH = 'scripts/ops/rtk-word-v4-e12-customxml-authority-followup.mjs';
const MULTI_SCENE_FOLLOWUP_SCRIPT_PATH = 'scripts/ops/rtk-word-v4-e12-multi-scene-apply-followup.mjs';
const MODERN_NATIVE_UI_FOLLOWUP_SCRIPT_PATH = 'scripts/ops/rtk-word-v4-e12-modern-comment-native-ui-followup.mjs';
const WORD_SANDBOX_HELPER_PATH = 'scripts/ops/rtk-word-sandbox-work-root.mjs';
const RECEIPT_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json';
const STABILITY_AUDIT_RECEIPT_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_STABILITY_LIMITATION_AUDIT_RECEIPT.json';
const STABILITY_REPEAT_RECEIPT_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_PHYSICAL_WAVE300_REPEAT_RECEIPT.json';
const PARSER_GAP_FOLLOWUP_RECEIPT_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_PARSER_GAP_FOLLOWUP_RECEIPT.json';
const CUSTOMXML_FOLLOWUP_RECEIPT_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_CUSTOMXML_AUTHORITY_FOLLOWUP_RECEIPT.json';
const MULTI_SCENE_FOLLOWUP_RECEIPT_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_MULTI_SCENE_APPLY_FOLLOWUP_RECEIPT.json';
const MODERN_NATIVE_UI_FOLLOWUP_RECEIPT_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_MODERN_COMMENT_NATIVE_UI_FOLLOWUP_RECEIPT.json';
const WAVE40_RECEIPT_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_PHYSICAL_WAVE40_RECEIPT.json';
const WAVE100_RECEIPT_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_PHYSICAL_WAVE100_RECEIPT.json';
const WAVE300_RECEIPT_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_PHYSICAL_WAVE300_RECEIPT.json';
const PROFILE_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json';
const PROGRAM_PATH = 'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json';

async function loadVerifier() {
  return import(pathToFileURL(path.join(REPO_ROOT, SCRIPT_PATH)).href);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
}

test('V4 E12 binds saturation ledger without claiming Word SATURATED', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const result = verifier.evaluateWordV4E12SaturationLedger({ receipt, requireFiles: true });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.issues, []);
  assert.equal(receipt.status, 'WORD_SATURATION_MODERN_COMMENT_NATIVE_UI_PHYSICAL_LIMITATION_CONFIRMED_NOT_SATURATED');
  assert.deepEqual(receipt.saturationRule.requiredWaveSequence, [10, 40, 100, 300]);
  assert.deepEqual(receipt.saturationRule.completedWaves, [10, 40, 100, 300]);
  assert.equal(receipt.saturationRule.lastCompletedWaveTarget, 300);
  assert.equal(receipt.saturationRule.currentWaveTarget, 300);
  assert.equal(receipt.saturationRule.currentWaveObservedRounds, 300);
  assert.equal(receipt.saturationRule.consecutiveStableApprovedWaves, 2);
  assert.equal(receipt.saturationRule.stableHistogram, true);
  assert.equal(receipt.nextStage, 'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_MODERN_COMMENT_NATIVE_UI_CERTIFICATION');
  assert.equal(receipt.saturationRule.saturated, false);
  assert.equal(receipt.saturationRule.googleDocsAllowedToOpen, false);
  assert.equal(receipt.notSaturatedReasons.includes('WAVE300_SINGLE_PARSER_GAP_REQUIRES_CASE_LEVEL_FOLLOWUP'), false);
});

test('V4 E12 binds Unicode hostile performance crash replay evidence families', () => {
  const receipt = readJson(RECEIPT_PATH);
  const bindings = new Map(receipt.evidenceBindings.map((item) => [item.id, item]));

  for (const id of ['E06_PHYSICAL_TEXT', 'E07_COMMENTS', 'E08_FORMATTING', 'E09_STRUCTURE', 'E10_REPLAY_HOSTILE', 'E11_MULTI_SCENE_COORDINATOR', 'E12_PHYSICAL_WAVE40', 'E12_PHYSICAL_WAVE100', 'E12_PHYSICAL_WAVE300', 'E12_PHYSICAL_WAVE300_REPEAT_01', 'E12_WL2_031_HOSTILE_PACKAGE_TYPED_BLOCK', 'E12_MODERN_COMMENT_APPLESCRIPT_LIMITATION', 'E12_CUSTOM_XML_AUTHORITY_REROUTE', 'E12_MULTI_SCENE_APPLY_LIMITATION', 'E12_MODERN_COMMENT_NATIVE_UI_ACCESSIBILITY_BLOCKER']) {
    assert.equal(bindings.get(id).status, 'BOUND');
    assert.match(bindings.get(id).sha256, /^[0-9a-f]{64}$/u);
  }
  for (const key of ['unicodeAndBidi', 'hostilePackage', 'performanceScale', 'crashRecovery', 'replayIdempotence', 'physicalWave40', 'physicalWave100', 'physicalWave300', 'physicalWave300Repeat', 'wave300ParserGapFollowup', 'modernCommentAppleScriptFollowup', 'customXmlAuthorityFollowup', 'multiSceneApplyFollowup', 'modernCommentNativeUiFollowup']) {
    assert.equal(receipt.coverageLedger[key].status, 'BOUND');
  }
  assert.equal(receipt.aggregateTotals.physicalRoundTripsObserved, 300);
  assert.equal(receipt.aggregateTotals.visibleAnchoredCommentThreads, 638);
  assert.equal(receipt.aggregateTotals.wave40PhysicalOpenEditSaveCloseReopenPass, 40);
  assert.equal(receipt.aggregateTotals.wave40DenseCommentThreads, 120);
  assert.equal(receipt.aggregateTotals.wave40ScaleWordsMax, 300000);
  assert.equal(receipt.aggregateTotals.wave100PhysicalOpenEditSaveCloseReopenPass, 100);
  assert.equal(receipt.aggregateTotals.wave100ParserPass, 99);
  assert.equal(receipt.aggregateTotals.wave100DenseCommentThreads, 120);
  assert.equal(receipt.aggregateTotals.wave100ScaleReturnedBytesMax, 994079);
  assert.equal(receipt.aggregateTotals.wave300PhysicalOpenEditSaveCloseReopenPass, 300);
  assert.equal(receipt.aggregateTotals.wave300ParserPass, 299);
  assert.equal(receipt.aggregateTotals.wave300DenseCommentThreads, 100);
  assert.equal(receipt.aggregateTotals.wave300ScaleReturnedBytesMax, 1239432);
  assert.equal(receipt.aggregateTotals.repeatWave300PhysicalOpenEditSaveCloseReopenPass, 300);
  assert.equal(receipt.aggregateTotals.repeatWave300ParserPass, 299);
  assert.equal(receipt.aggregateTotals.repeatWave300DenseCommentThreads, 100);
  assert.equal(receipt.aggregateTotals.consecutiveStableApprovedWaves, 2);
  assert.equal(receipt.aggregateTotals.wl2031HostilePackageTypedBlockedFollowupCases, 1);
  assert.equal(receipt.aggregateTotals.modernCommentAppleScriptProbeCases, 1);
  assert.equal(receipt.aggregateTotals.customXmlAuthorityFollowupCases, 1);
  assert.equal(receipt.aggregateTotals.customXmlMutatingAuthorityAllowed, 0);
  assert.equal(receipt.aggregateTotals.multiSceneApplyFollowupCases, 1);
  assert.equal(receipt.aggregateTotals.automaticMultiSceneApplyCertified, 0);
  assert.equal(receipt.aggregateTotals.falseMultiSceneApplyCertification, 0);
  assert.equal(receipt.aggregateTotals.modernCommentNativeUiProbeCases, 1);
  assert.equal(receipt.aggregateTotals.modernCommentNativeUiActionsPerformed, 1);
  assert.equal(receipt.aggregateTotals.falseModernCommentSupportClaim, 0);
  assert.equal(receipt.aggregateTotals.focusedE11CoordinatorContracts, 7);
});

test('V4 E12 rejects false saturation and premature Google sequencing', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const program = readJson(PROGRAM_PATH);
  const profile = readJson(PROFILE_PATH);
  const mutatedReceipt = JSON.parse(JSON.stringify(receipt));
  const mutatedProgram = JSON.parse(JSON.stringify(program));

  mutatedReceipt.saturationRule.saturated = true;
  mutatedReceipt.saturationRule.wordSaturationClaimAllowed = true;
  mutatedReceipt.vetoMetrics.falseSaturationClaim = 1;
  mutatedReceipt.runtimeClaims.googleDocsOpened = true;
  mutatedProgram.v4ExecutionState.googleDocsOpened = true;
  mutatedProgram.v4ExecutionState.wordSaturated = true;
  mutatedProgram.v4ExecutionState.nextStage = 'EXECUTION_13_GOOGLE_DOCS_PROFILE';

  const result = verifier.evaluateWordV4E12SaturationLedger({
    receipt: mutatedReceipt,
    profile,
    program: mutatedProgram,
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E12_FALSE_SATURATION_CLAIM'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E12_VETO_NONZERO'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E12_RUNTIME_SCOPE_OVERCLAIM'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E12_SEQUENCE_BROKEN'), true);
});

test('V4 E12 rejects missing evidence binding and profile overclaim', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const program = readJson(PROGRAM_PATH);
  const profile = readJson(PROFILE_PATH);
  const mutatedReceipt = JSON.parse(JSON.stringify(receipt));
  const mutatedProfile = JSON.parse(JSON.stringify(profile));

  mutatedReceipt.evidenceBindings = mutatedReceipt.evidenceBindings.filter((item) => item.id !== 'E12_PHYSICAL_WAVE300');
  const cell = mutatedProfile.cells.find((item) => item.capabilityId === 'rtk.word.v4.saturationLedger');
  cell.state = 'SATURATED';
  cell.currentCapability = 'WORD_SATURATED';

  const result = verifier.evaluateWordV4E12SaturationLedger({
    receipt: mutatedReceipt,
    profile: mutatedProfile,
    program,
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E12_EVIDENCE_BINDING_MISSING'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E12_PROFILE_CELL_INVALID'), true);
});

test('V4 E12 updates capability profile and program state while keeping Word as current focus', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const profile = readJson(PROFILE_PATH);
  const program = readJson(PROGRAM_PATH);
  const cell = profile.cells.find((item) => item.capabilityId === 'rtk.word.v4.saturationLedger');
  const result = verifier.evaluateWordV4E12SaturationLedger({ receipt, profile, program });

  assert.equal(result.status, 'PASS');
  assert.equal(profile.status, 'WORD_16_111_2_E12_MODERN_COMMENT_NATIVE_UI_PHYSICAL_LIMITATION_NOT_SATURATED');
  assert.equal(cell.state, 'PHYSICAL_WORD_PROVEN');
  assert.equal(cell.currentCapability, 'MODERN_COMMENT_NATIVE_UI_PHYSICAL_LIMITATION_CONFIRMED_NOT_SATURATED');
  assert.equal(cell.physicalWordEvidence, true);
  assert.equal(program.status, 'WORD_E12_MODERN_COMMENT_NATIVE_UI_PHYSICAL_LIMITATION_CONFIRMED_NOT_SATURATED');
  assert.equal(program.v4ExecutionState.currentStage, 'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_MODERN_COMMENT_NATIVE_UI_CERTIFICATION');
  assert.equal(program.v4ExecutionState.nextStage, 'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_MODERN_COMMENT_NATIVE_UI_CERTIFICATION');
  assert.equal(program.v4ExecutionState.wordSaturated, false);
  assert.equal(program.v4ExecutionState.googleDocsOpened, false);
});

test('V4 E12 modern comment native UI followup binds physical root comments and tracked replacement without overclaims', async () => {
  const verifier = await import(pathToFileURL(path.join(REPO_ROOT, MODERN_NATIVE_UI_FOLLOWUP_SCRIPT_PATH)).href);
  const receipt = readJson(MODERN_NATIVE_UI_FOLLOWUP_RECEIPT_PATH);
  const result = verifier.evaluateWordV4E12ModernCommentNativeUiFollowup({ receipt, requireFiles: true });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.issues, []);
  assert.equal(receipt.result, 'PASS');
  assert.equal(receipt.systemEvents.targetedWordProcessProbe.ok, true);
  assert.equal(receipt.systemEvents.nativeUiAutomationAllowed, true);
  assert.equal(receipt.certificationDecision.rootModernCommentCertified, true);
  assert.equal(receipt.certificationDecision.wordAuthoredTrackedReplacementCertified, true);
  assert.equal(receipt.certificationDecision.trackedAdjacentEditsCertified, false);
  assert.equal(receipt.certificationDecision.trackedOverlappingEditsCertified, false);
  assert.equal(receipt.certificationDecision.modernReplyCertified, false);
  assert.equal(receipt.certificationDecision.resolveReopenCertified, false);
  assert.equal(receipt.certificationDecision.deleteCertified, false);
  assert.equal(receipt.remainingWordLimitations.includes('MODERN_REPLY_RESOLVE_REOPEN_STILL_TYPED_LIMITATION'), true);
  assert.equal(receipt.remainingWordLimitations.includes('NATIVE_UI_OVERLAPPING_TRACKED_EDITS_NOT_CERTIFIED'), true);
  assert.equal(receipt.saturated, false);
});

test('V4 E12 multi-scene apply followup proves typed shadow-only limitation without runtime apply authority', async () => {
  const verifier = await import(pathToFileURL(path.join(REPO_ROOT, MULTI_SCENE_FOLLOWUP_SCRIPT_PATH)).href);
  const receipt = readJson(MULTI_SCENE_FOLLOWUP_RECEIPT_PATH);
  const result = await verifier.evaluateWordV4E12MultiSceneApplyFollowup({ receipt, requireFiles: true });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.issues, []);
  assert.equal(receipt.certificationDecision.automaticMultiSceneApplyCertified, false);
  assert.equal(receipt.certificationDecision.runtimeApplyAuthorityGranted, false);
  assert.equal(receipt.certificationDecision.shadowCoordinatorAcceptedAsRuntimeApply, false);
  assert.equal(receipt.resolvedLimitations.includes('AUTOMATIC_MULTI_SCENE_APPLY_NOT_PHYSICAL_WORD_CERTIFIED'), true);
  assert.equal(receipt.remainingWordLimitations.includes('AUTOMATIC_MULTI_SCENE_APPLY_NOT_PHYSICAL_WORD_CERTIFIED'), false);
  assert.equal(receipt.saturated, false);
});

test('V4 E12 customXml authority followup proves reroute without customXml authority', async () => {
  const verifier = await import(pathToFileURL(path.join(REPO_ROOT, CUSTOMXML_FOLLOWUP_SCRIPT_PATH)).href);
  const receipt = readJson(CUSTOMXML_FOLLOWUP_RECEIPT_PATH);
  const result = verifier.evaluateWordV4E12CustomXmlAuthorityFollowup({ receipt, requireFiles: true });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.issues, []);
  assert.equal(receipt.authorityDecision.customXmlAuthorityAllowed, false);
  assert.equal(receipt.authorityDecision.customXmlResolvedByAllowlist, false);
  assert.equal(receipt.authorityDecision.selectedAuthorityCarrier, 'customDocumentProperty');
  assert.equal(receipt.resolvedLimitations.includes('CUSTOM_XML_MUTATING_WORD_SAVE_DROPS_AUTHORITY'), true);
  assert.equal(receipt.remainingWordLimitations.includes('CUSTOM_XML_MUTATING_WORD_SAVE_DROPS_AUTHORITY'), false);
  assert.equal(receipt.saturated, false);
});

test('V4 E12 parser gap followup proves WL2-031 is hostile typed BLOCKED, not a parser gap', async () => {
  const verifier = await import(pathToFileURL(path.join(REPO_ROOT, PARSER_GAP_FOLLOWUP_SCRIPT_PATH)).href);
  const receipt = readJson(PARSER_GAP_FOLLOWUP_RECEIPT_PATH);
  const result = verifier.evaluateWordV4E12ParserGapFollowup({ receipt, requireFiles: true });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.issues, []);
  assert.equal(receipt.caseAssessment.caseId, 'WL2-031');
  assert.equal(receipt.caseAssessment.reclassification, 'HOSTILE_PACKAGE_TYPED_BLOCK_NOT_PARSER_GAP');
  assert.equal(receipt.caseAssessment.parserBlockedExpected, true);
  assert.equal(receipt.caseAssessment.exactAutomaticCandidateAllowed, false);
  assert.equal(receipt.resolvedLimitations.includes('WAVE300_SINGLE_PARSER_GAP_REQUIRES_CASE_LEVEL_FOLLOWUP'), true);
  assert.equal(receipt.remainingLimitations.includes('WAVE300_SINGLE_PARSER_GAP_REQUIRES_CASE_LEVEL_FOLLOWUP'), false);
  assert.equal(receipt.saturationDecision.wordSaturated, false);
  assert.equal(receipt.saturationDecision.googleDocsAllowedToOpen, false);
});

test('V4 E12 parser gap followup rejects PASS overclaim and stale active parser-gap blocker', async () => {
  const followupVerifier = await import(pathToFileURL(path.join(REPO_ROOT, PARSER_GAP_FOLLOWUP_SCRIPT_PATH)).href);
  const ledgerVerifier = await loadVerifier();
  const followupReceipt = readJson(PARSER_GAP_FOLLOWUP_RECEIPT_PATH);
  const ledgerReceipt = readJson(RECEIPT_PATH);
  const profile = readJson(PROFILE_PATH);
  const program = readJson(PROGRAM_PATH);
  const mutatedFollowup = JSON.parse(JSON.stringify(followupReceipt));
  const mutatedLedger = JSON.parse(JSON.stringify(ledgerReceipt));

  mutatedFollowup.caseAssessment.parserBlockedExpected = false;
  mutatedFollowup.caseAssessment.exactAutomaticCandidateAllowed = true;
  mutatedFollowup.caseAssessment.reclassification = 'PARSER_PASS_GAP_CLOSED';
  mutatedLedger.notSaturatedReasons.push('WAVE300_SINGLE_PARSER_GAP_REQUIRES_CASE_LEVEL_FOLLOWUP');

  const followupResult = followupVerifier.evaluateWordV4E12ParserGapFollowup({ receipt: mutatedFollowup });
  const ledgerResult = ledgerVerifier.evaluateWordV4E12SaturationLedger({
    receipt: mutatedLedger,
    profile,
    program,
  });

  assert.equal(followupResult.status, 'FAIL');
  assert.equal(followupResult.issues.some((item) => item.code === 'RTK_V4_E12_FOLLOWUP_RECLASSIFICATION_INVALID'), true);
  assert.equal(followupResult.issues.some((item) => item.code === 'RTK_V4_E12_FOLLOWUP_EXPECTATION_INVALID'), true);
  assert.equal(ledgerResult.status, 'FAIL');
  assert.equal(ledgerResult.issues.some((item) => item.code === 'RTK_V4_E12_PARSER_GAP_STILL_ACTIVE'), true);
});

test('V4 E12 stability limitation audit binds Word-only next wave without saturation or Google', async () => {
  const verifier = await import(pathToFileURL(path.join(REPO_ROOT, STABILITY_AUDIT_SCRIPT_PATH)).href);
  const receipt = readJson(STABILITY_AUDIT_RECEIPT_PATH);
  const result = verifier.evaluateWordV4E12StabilityLimitationAudit({ receipt, requireFiles: true });
  const limitationIds = new Set(receipt.actionableLimitations.map((item) => item.id));

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.issues, []);
  assert.equal(receipt.status, 'WORD_STABILITY_LIMITATION_AUDIT_COMPLETE_NOT_SATURATED');
  assert.equal(receipt.saturationDecision.wordSaturated, false);
  assert.equal(receipt.saturationDecision.googleDocsAllowedToOpen, false);
  assert.equal(receipt.saturationDecision.nextStage, 'EXECUTION_12_NEXT_PHYSICAL_STABILITY_WAVE_300_REPEAT');
  assert.equal(receipt.saturationDecision.consecutiveStableApprovedWaves, 1);
  assert.equal(receipt.vetoMetrics.falseExact, 0);
  assert.equal(receipt.vetoMetrics.prematureGoogleDocsOpen, 0);
  assert.equal(limitationIds.has('SECOND_CONSECUTIVE_STABLE_APPROVED_WAVE_REQUIRED'), true);
  assert.equal(limitationIds.has('CUSTOM_XML_MUTATING_WORD_SAVE_DROPS_AUTHORITY'), true);
  assert.equal(limitationIds.has('WAVE300_SINGLE_PARSER_GAP_REQUIRES_CASE_LEVEL_FOLLOWUP'), true);
  assert.equal(receipt.nonClaims.includes('WORD_SATURATED_NOT_CLAIMED'), true);
  assert.equal(receipt.nonClaims.includes('GOOGLE_DOCS_NOT_OPENED'), true);
});

test('V4 E12 repeat stability wave binds second 300-round physical run without saturation or Google', async () => {
  const verifier = await import(pathToFileURL(path.join(REPO_ROOT, STABILITY_REPEAT_SCRIPT_PATH)).href);
  const receipt = readJson(STABILITY_REPEAT_RECEIPT_PATH);
  const result = verifier.evaluateWordV4E12StabilityWave300Repeat({ receipt, requireExternal: true });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.issues, []);
  assert.equal(receipt.status, 'PHYSICAL_STABILITY_WAVE_300_REPEAT_COMPLETE_NOT_SATURATED');
  assert.equal(receipt.totals.physicalOpenEditSaveCloseReopenPass, 300);
  assert.equal(receipt.totals.parserPass, 299);
  assert.equal(receipt.totals.falseExact, 0);
  assert.equal(receipt.totals.silentApply, 0);
  assert.equal(receipt.totals.wrongSceneRouting, 0);
  assert.equal(receipt.totals.replayFailure, 0);
  assert.equal(receipt.saturationDecision.consecutiveStableApprovedWaves, 2);
  assert.equal(receipt.saturationDecision.stableHistogram, true);
  assert.equal(receipt.saturationDecision.wordSaturated, false);
  assert.equal(receipt.saturationDecision.googleDocsAllowedToOpen, false);
  assert.equal(receipt.saturationDecision.nextStage, 'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_AFTER_STABLE_WAVES');
  assert.equal(receipt.wordSandboxWorkRoot.insideWordContainer, true);
  assert.equal(receipt.wordSandboxWorkRoot.plainTmpForbidden, true);
  assert.equal(receipt.artifactRoot.startsWith('/Volumes/T7-Secure/'), true);
});

test('V4 E12 wave 40 receipt proves physical Word rounds without saturation claim', async () => {
  const verifier = await import(pathToFileURL(path.join(REPO_ROOT, WAVE40_SCRIPT_PATH)).href);
  const receipt = readJson(WAVE40_RECEIPT_PATH);
  const result = verifier.evaluateReceipt(receipt, { requireExternal: true });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.issues, []);
  assert.equal(receipt.wave.target, 40);
  assert.equal(receipt.wave.observedRounds, 40);
  assert.equal(receipt.wave.completed, true);
  assert.equal(receipt.totals.physicalOpenEditSaveCloseReopenPass, 40);
  assert.equal(receipt.totals.exactAutomaticCandidates, 0);
  assert.equal(receipt.vetoMetrics.falseExact, 0);
  assert.equal(receipt.vetoMetrics.silentApply, 0);
  assert.equal(receipt.saturationDecision.wordSaturated, false);
  assert.equal(receipt.saturationDecision.googleDocsAllowedToOpen, false);
  assert.equal(receipt.wordSandboxWorkRoot.insideWordContainer, true);
  assert.equal(receipt.wordSandboxWorkRoot.plainTmpForbidden, true);
  assert.match(receipt.wordSandboxWorkRoot.root, /Library[/\\]Containers[/\\]com\.microsoft\.Word[/\\]Data[/\\]tmp[/\\]YalkenWordLab/u);
  assert.equal(receipt.artifactRoot.startsWith('/Volumes/T7-Secure/'), true);
});

test('V4 E12 wave 100 receipt proves physical Word rounds without saturation claim', async () => {
  const verifier = await import(pathToFileURL(path.join(REPO_ROOT, WAVE100_SCRIPT_PATH)).href);
  const receipt = readJson(WAVE100_RECEIPT_PATH);
  const result = verifier.evaluateReceipt(receipt, { requireExternal: true });
  const visibleComments = receipt.cases.reduce((total, item) => total + (Number(item.wordCommentCount) || 0), 0);

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.issues, []);
  assert.equal(receipt.wave.target, 100);
  assert.equal(receipt.wave.observedRounds, 100);
  assert.equal(receipt.wave.completed, true);
  assert.equal(receipt.totals.physicalOpenEditSaveCloseReopenPass, 100);
  assert.equal(receipt.totals.parserPass, 99);
  assert.equal(receipt.totals.exactAutomaticCandidates, 0);
  assert.equal(receipt.vetoMetrics.falseExact, 0);
  assert.equal(receipt.vetoMetrics.silentApply, 0);
  assert.equal(receipt.saturationDecision.wordSaturated, false);
  assert.equal(receipt.saturationDecision.googleDocsAllowedToOpen, false);
  assert.equal(visibleComments, 398);
  assert.equal(receipt.wordSandboxWorkRoot.insideWordContainer, true);
  assert.equal(receipt.wordSandboxWorkRoot.plainTmpForbidden, true);
  assert.match(receipt.wordSandboxWorkRoot.root, /Library[/\\]Containers[/\\]com\.microsoft\.Word[/\\]Data[/\\]tmp[/\\]YalkenWordLab/u);
  assert.equal(receipt.artifactRoot.startsWith('/Volumes/T7-Secure/'), true);
});

test('V4 E12 wave 300 receipt proves physical Word rounds without saturation claim', async () => {
  const verifier = await import(pathToFileURL(path.join(REPO_ROOT, WAVE300_SCRIPT_PATH)).href);
  const receipt = readJson(WAVE300_RECEIPT_PATH);
  const result = verifier.evaluateReceipt(receipt, { requireExternal: true });
  const visibleComments = receipt.cases.reduce((total, item) => total + (Number(item.wordCommentCount) || 0), 0);
  const scaleCase = receipt.cases.find((item) => item.caseId === 'WL2-280');
  const denseCase = receipt.cases.find((item) => item.caseId === 'WL2-240');

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.issues, []);
  assert.equal(receipt.wave.target, 300);
  assert.equal(receipt.wave.observedRounds, 300);
  assert.equal(receipt.wave.completed, true);
  assert.equal(receipt.totals.physicalOpenEditSaveCloseReopenPass, 300);
  assert.equal(receipt.totals.parserPass, 299);
  assert.equal(receipt.totals.exactAutomaticCandidates, 0);
  assert.equal(receipt.vetoMetrics.falseExact, 0);
  assert.equal(receipt.vetoMetrics.silentApply, 0);
  assert.equal(receipt.saturationDecision.wordSaturated, false);
  assert.equal(receipt.saturationDecision.googleDocsAllowedToOpen, false);
  assert.equal(visibleComments, 638);
  assert.equal(denseCase.wordCommentCount, 100);
  assert.equal(denseCase.commentGraphCapability.threadCount, 100);
  assert.equal(scaleCase.returnedBytes, 1239432);
  assert.equal(receipt.wordSandboxWorkRoot.insideWordContainer, true);
  assert.equal(receipt.wordSandboxWorkRoot.plainTmpForbidden, true);
  assert.match(receipt.wordSandboxWorkRoot.root, /Library[/\\]Containers[/\\]com\.microsoft\.Word[/\\]Data[/\\]tmp[/\\]YalkenWordLab/u);
  assert.equal(receipt.artifactRoot.startsWith('/Volumes/T7-Secure/'), true);
});

test('V4 E12 Word sandbox helper forbids plain tmp fallback and preserves diagnostic override boundary', async () => {
  const helper = await import(pathToFileURL(path.join(REPO_ROOT, WORD_SANDBOX_HELPER_PATH)).href);
  const resolved = helper.resolveWordSandboxWorkRoot({
    defaultSegments: ['word-safe-semantic-v4', 'e12-physical-wave40-contract'],
  });

  assert.equal(resolved.insideWordContainer, true);
  assert.equal(resolved.plainTmpForbidden, true);
  assert.equal(resolved.networkRequired, false);
  assert.match(resolved.root, /Library[/\\]Containers[/\\]com\.microsoft\.Word[/\\]Data[/\\]tmp[/\\]YalkenWordLab/u);
  assert.throws(
    () => helper.resolveWordSandboxWorkRoot({ overridePath: '/tmp/YalkenWordLab/e12-physical-wave40' }),
    /WORD_SANDBOX_WORK_ROOT_PLAIN_TMP_FORBIDDEN/u,
  );
});
