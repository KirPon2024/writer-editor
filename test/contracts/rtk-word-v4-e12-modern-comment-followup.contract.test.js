const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = 'scripts/ops/rtk-word-v4-e12-modern-comment-followup.mjs';
const LEDGER_SCRIPT_PATH = 'scripts/ops/rtk-word-v4-e12-saturation-ledger.mjs';
const RECEIPT_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_MODERN_COMMENT_FOLLOWUP_RECEIPT.json';
const LEDGER_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json';
const PROFILE_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json';
const PROGRAM_PATH = 'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
}

async function loadVerifier() {
  return import(pathToFileURL(path.join(REPO_ROOT, SCRIPT_PATH)).href);
}

test('E12 modern comment follow-up binds physical Word AppleScript limitation evidence', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const result = verifier.evaluateWordV4E12ModernCommentFollowup({ receipt, requireFiles: true });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.issues, []);
  assert.equal(receipt.wordProfile.versionByAppleScript, '16.111.2');
  assert.equal(receipt.wordSandboxWorkRoot.insideWordContainer, true);
  assert.equal(receipt.wordSandboxWorkRoot.plainTmpForbidden, true);
  assert.equal(receipt.wordAutomation.commentsAfterReopen, 5);
  assert.equal(receipt.parserSummary.commentThreads, 5);
  assert.equal(receipt.parserSummary.replyCount, 0);
  assert.equal(receipt.parserSummary.canApply, false);
  assert.equal(receipt.totals.replyThreadsCertified, 0);
  assert.equal(receipt.totals.resolveReopenCertified, 0);
  assert.equal(receipt.totals.deleteCertified, 0);
  assert.equal(receipt.runtimeClaims.writerAuthorityAdded, false);
  assert.equal(receipt.runtimeClaims.automaticApplyExpanded, false);
  assert.equal(receipt.nextStage, 'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_CUSTOM_XML_MUTATION_AUTHORITY');
});

test('E12 modern comment follow-up rejects false support overclaims', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const mutated = JSON.parse(JSON.stringify(receipt));

  mutated.totals.replyThreadsCertified = 1;
  mutated.totals.resolveReopenCertified = 1;
  mutated.totals.deleteCertified = 1;
  mutated.parserSummary.replyCount = 2;
  mutated.parserSummary.canApply = true;
  mutated.runtimeClaims.writerAuthorityAdded = true;
  mutated.runtimeClaims.automaticApplyExpanded = true;
  mutated.saturated = true;

  const result = verifier.evaluateWordV4E12ModernCommentFollowup({ receipt: mutated });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E12_MODERN_COMMENT_TOTALS_INVALID'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E12_MODERN_COMMENT_PARSER_SUMMARY_INVALID'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E12_MODERN_COMMENT_RUNTIME_OVERCLAIM'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E12_MODERN_COMMENT_SEQUENCE_INVALID'), true);
});

test('E12 saturation ledger binds modern comment follow-up without declaring Word saturated', async () => {
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
  const binding = ledger.evidenceBindings.find((item) => item.id === 'E12_MODERN_COMMENT_APPLESCRIPT_LIMITATION');

  assert.equal(result.status, 'PASS');
  assert.equal(binding.status, 'BOUND');
  assert.equal(binding.path, RECEIPT_PATH);
  assert.equal(ledger.coverageLedger.modernCommentAppleScriptFollowup.status, 'BOUND');
  assert.equal(ledger.saturationRule.saturated, false);
  assert.equal(ledger.saturationRule.googleDocsAllowedToOpen, false);
  assert.equal(program.v4ExecutionState.googleDocsOpened, false);
  assert.match(program.v4ExecutionState.nextStage, /^EXECUTION_(12_WORD_LIMITATION_FOLLOWUP_(CUSTOM_XML_MUTATION_AUTHORITY|MULTI_SCENE_APPLY_CERTIFICATION|MODERN_COMMENT_NATIVE_UI_CERTIFICATION)|12_A02_TERMINAL_WORD_AUDIT_AND_A03_PROMOTION_LIST|03_A03_SAFE_PORTABILITY_IMPROVEMENTS_RUNTIME_CONTOUR)$/u);
});
