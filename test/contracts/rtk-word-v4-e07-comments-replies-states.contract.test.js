const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = 'scripts/ops/rtk-word-v4-e07-comments-replies-states.mjs';
const RECEIPT_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E07_COMMENTS_REPLIES_STATES_RECEIPT.json';
const PROFILE_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json';
const PROGRAM_PATH = 'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json';

async function loadVerifier() {
  return import(pathToFileURL(path.join(REPO_ROOT, SCRIPT_PATH)).href);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
}

test('V4 E07 certifies only visible anchored Word comment shadow analysis', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const result = verifier.evaluateWordV4E07CommentsRepliesStates({ receipt });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.issues, []);
  assert.equal(receipt.wordProfile.versionByBundle, '16.111.2');
  assert.equal(receipt.commentTotals.declaredCommentCases, 8);
  assert.equal(receipt.commentTotals.visibleAndParsedCommentCases, 6);
  assert.equal(receipt.commentTotals.visibleAnchoredThreads, 91);
  assert.equal(receipt.commentTotals.unsupportedBlockedThreads, 2);
  assert.equal(receipt.commentTotals.silentCommentLoss, 0);
  assert.equal(receipt.commentTotals.noOpCommentPassClaimed, 0);
});

test('V4 E07 keeps replies resolve reopen and delete as typed limitations', () => {
  const receipt = readJson(RECEIPT_PATH);
  const byId = new Map(receipt.commentCertificationCases.map((item) => [item.caseId, item]));

  assert.equal(byId.get('WL2-014').commentGraphCapability.replyCount, 0);
  assert.equal(byId.get('WL2-014').limitations.includes('MODERN_REPLY_UI_NOT_AVAILABLE_IN_APPLESCRIPT_DICTIONARY_PROBE'), true);
  assert.equal(byId.get('WL2-015').commentPass, false);
  assert.equal(byId.get('WL2-015').commentGraphCapability.statusCounts.UNSUPPORTED_BLOCKED, 1);
  assert.equal(receipt.commentTotals.replyThreadsCertified, 0);
  assert.equal(receipt.commentTotals.resolveReopenCertified, 0);
  assert.equal(receipt.commentTotals.deleteCertified, 0);
  assert.equal(receipt.typedLimitations.includes('COMMENT_RESOLVE_REOPEN_APPLESCRIPT_UNSUPPORTED'), true);
});

test('V4 E07 proves high-density comment case and package inventory without no-op pass', () => {
  const receipt = readJson(RECEIPT_PATH);
  const highDensity = receipt.commentCertificationCases.find((item) => item.caseId === 'WL2-028');
  const inventory = receipt.commentCertificationCases.find((item) => item.caseId === 'WL2-017');

  assert.equal(highDensity.wordCommentCount, 80);
  assert.equal(highDensity.commentGraphCapability.threadCount, 80);
  assert.equal(highDensity.commentGraphCapability.physicalWordReopenVisibility, true);
  assert.equal(inventory.commentGraphCapability.noOpSaveCountsAsPass, false);
  for (const part of ['word/comments.xml', 'word/commentsExtended.xml', 'word/commentsExtensible.xml', 'word/commentsIds.xml', 'word/people.xml']) {
    assert.equal(inventory.commentGraphCapability.packageParts.includes(part), true);
  }
});

test('V4 E07 rejects false green comment mutations', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const mutated = JSON.parse(JSON.stringify(receipt));
  mutated.commentTotals.replyThreadsCertified = 1;
  mutated.commentTotals.noOpCommentPassClaimed = 1;
  mutated.commentCertificationCases.find((item) => item.caseId === 'WL2-015').commentPass = true;
  mutated.commentCertificationCases.find((item) => item.caseId === 'WL2-015').commentGraphCapability.commentPassAllowed = true;

  const result = verifier.evaluateWordV4E07CommentsRepliesStates({ receipt: mutated });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E07_UNSUPPORTED_OVERCLAIM'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E07_COMMENT_VETO_INVALID'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E07_BLOCKED_CASE_OVERCLAIM'), true);
});

test('V4 E07 optional external evidence check verifies local T7 receipt only when present', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const externalPath = receipt.externalEvidence.externalReceiptPath;

  if (!fs.existsSync(externalPath)) {
    assert.equal(receipt.externalEvidence.externalFileAvailableAtReceiptCreation, true);
    return;
  }

  const result = verifier.evaluateWordV4E07CommentsRepliesStates({ receipt, requireExternal: true });
  assert.equal(result.status, 'PASS');
});

test('V4 E07 updates capability profile and program state without runtime mutation authority', () => {
  const profile = readJson(PROFILE_PATH);
  const program = readJson(PROGRAM_PATH);
  const cell = profile.cells.find((item) => item.capabilityId === 'rtk.word.v4.commentsShadowAnalysis');

  assert.equal(cell.state, 'PHYSICAL_WORD_PROVEN');
  assert.equal(cell.currentCapability, 'VISIBLE_ANCHORED_COMMENT_SHADOW_ANALYSIS_WITH_TYPED_LIMITATIONS');
  assert.equal(cell.physicalWordEvidence, true);
  assert.equal(cell.acceptanceTest, 'test/contracts/rtk-word-v4-e07-comments-replies-states.contract.test.js');
  assert.match(program.v4ExecutionState.status, /^EXECUTION_((0[789]|1[01])_LOCAL_VERIFIED_READY_FOR_DELIVERY_CHAIN|03_A03_C01_COMMENT_SHADOW_RUNTIME_WIRED_READY_FOR_DELIVERY_CHAIN|03_A03_C02_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_CERTIFIED|12_(?:LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_WAVES|WAVE40_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_WAVE_100|WAVE100_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_WAVE_300|WAVE300_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_STABILITY_LIMITATION_AUDIT|STABILITY_LIMITATION_AUDIT_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_STABILITY_WAVE|STABILITY_WAVE300_REPEAT_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_LIMITATION_FOLLOWUP|WL2_031_HOSTILE_PACKAGE_TYPED_BLOCK_CONFIRMED_CONTINUE_REMAINING_WORD_LIMITATIONS|MODERN_COMMENT_APPLESCRIPT_LIMITATION_CONFIRMED_CONTINUE_CUSTOM_XML_AUTHORITY|CUSTOM_XML_AUTHORITY_REROUTED_CONTINUE_MULTI_SCENE_APPLY_CERTIFICATION|MULTI_SCENE_APPLY_TYPED_LIMITATION_CONFIRMED_CONTINUE_MODERN_COMMENT_NATIVE_UI|MODERN_COMMENT_NATIVE_UI_BLOCKED_EXTERNAL_ACCESSIBILITY_WAITING|A02_TERMINAL_AUDIT_COMPLETE_A03_READY))$/u);
  assert.equal(typeof program.v4ExecutionState.currentStage, 'string');
  assert.equal(typeof program.v4ExecutionState.nextStage, 'string');
  assert.equal(program.v4ExecutionState.commentShadowAnalysisCertified, true);
  if (program.v4ExecutionState.status === 'EXECUTION_03_A03_C02_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_CERTIFIED') {
    assert.equal(program.v4ExecutionState.runtimeApplyAuthorityScope, 'NON_OVERLAP_TRACKED_REPLACEMENT_PAIRS_ONLY');
  } else {
    assert.equal(program.v4ExecutionState.runtimeApplyAuthorityGranted, false);
  }
  assert.equal(program.v4ExecutionState.googleDocsOpened, false);
});
