const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_B06_PHYSICAL_CERTIFICATION_RECEIPT.json');
const LAB_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-latest-physical-certification-lab.mjs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function loadLab() {
  return import(pathToFileURL(LAB_PATH).href);
}

test('B06 verifies physical latest Word receipt without broadening D1 or exact apply', async () => {
  const lab = await loadLab();
  const receipt = readJson(RECEIPT_PATH);
  const evaluation = lab.evaluateB06PhysicalCertificationReceipt(receipt);

  assert.equal(evaluation.ok, true);
  assert.equal(receipt.result, 'PASS');
  assert.equal(receipt.taskId, 'YALKEN_RTK_WORD_LATEST_SEMANTIC_ROUNDTRIP_V2');
  assert.equal(receipt.stageId, 'B06_WORD_MAC_LATEST_PHYSICAL_CERTIFICATION');
  assert.equal(receipt.profile.statusAfterB06, 'CERTIFIED_WITH_TYPED_LIMITATIONS');
  assert.equal(receipt.profile.physicalRoundTripsExecutedForCertification, 32);
  assert.equal(receipt.profile.physicalRoundTripsClaimedAsCertification, true);
  assert.equal(receipt.profile.oldD1Profile.notReboundByB06, true);
  assert.equal(receipt.runtimeClaims.automaticApplyExpanded, false);
  assert.equal(receipt.runtimeClaims.uiChanged, false);
  assert.equal(receipt.runtimeClaims.networkDependencyAdded, false);
});

test('B06 physical corpus has 30-plus native open edit save close reopen rows and preserves veto counters', () => {
  const receipt = readJson(RECEIPT_PATH);

  assert.equal(receipt.cases.length, 32);
  assert.equal(receipt.cases.every((item) => item.openEditSaveCloseReopen === 'PASS'), true);
  assert.equal(receipt.cases.every((item) => item.packageZipOk === true), true);
  assert.equal(receipt.totals.physicalOpenEditSaveCloseReopenPass, 32);
  assert.equal(receipt.totals.falseExact, 0);
  assert.equal(receipt.totals.silentApply, 0);
  assert.equal(receipt.totals.wrongSceneRouting, 0);
  assert.equal(receipt.totals.replayFailure, 0);
  assert.equal(receipt.totals.productNetworkRequests, 0);
  assert.equal(receipt.totals.exactAutomaticCandidates, 0);
});

test('B06 comments PASS requires package inventory semantic readback and Word reopen visibility', () => {
  const receipt = readJson(RECEIPT_PATH);
  const passCases = receipt.cases.filter((item) => item.commentsPass === true);

  assert.ok(passCases.length >= 5);
  for (const item of passCases) {
    assert.equal(item.declaredCommentCase, true, item.caseId);
    assert.ok(item.wordCommentCount > 0, item.caseId);
    assert.ok(item.reviewIrSummary.commentThreads > 0, item.caseId);
    assert.equal(item.commentGraphCapability.physicalWordReopenVisibility, true, item.caseId);
    assert.equal(item.commentGraphCapability.commentPassAllowed, true, item.caseId);
    assert.ok(item.packageInventory.commentParts.includes('word/comments.xml'), item.caseId);
  }

  const deletedOrUnsupported = receipt.cases.find((item) => item.caseId === 'WL2-015');
  assert.equal(deletedOrUnsupported.declaredCommentCase, true);
  assert.equal(deletedOrUnsupported.wordCommentCount, 0);
  assert.equal(deletedOrUnsupported.commentsPass, false);
  assert.equal(receipt.commentNoopPassClaimed, false);
});

test('B06 scale hostile locator and unsupported modern semantics stay typed, not false green', () => {
  const receipt = readJson(RECEIPT_PATH);
  const scale100k = receipt.cases.find((item) => item.caseId === 'WL2-026');
  const scale250k = receipt.cases.find((item) => item.caseId === 'WL2-027');
  const highComments = receipt.cases.find((item) => item.caseId === 'WL2-028');
  const hostile = receipt.cases.find((item) => item.caseId === 'WL2-031');

  assert.ok(scale100k.returnedBytes > 100000);
  assert.ok(scale250k.returnedBytes > 200000);
  assert.ok(highComments.wordCommentCount >= 50);
  assert.equal(hostile.parserStatus, 'BLOCKED');
  assert.equal(hostile.exactAutomaticCandidateCount, 0);

  for (const limitation of [
    'MODERN_REPLY_UI_NOT_AVAILABLE_IN_APPLESCRIPT_DICTIONARY_PROBE',
    'COMMENT_RESOLVE_REOPEN_APPLESCRIPT_UNSUPPORTED',
    'HIGH_COMMENT_DENSITY_BOUNDED_TO_80_COMMENTS_IN_B06',
    'POST_WORD_HOSTILE_PACKAGE_NEGATIVE',
    'WORD_COMPARE_COMBINE_APPLESCRIPT_NOT_PROVEN_IN_B06',
  ]) {
    assert.equal(receipt.typedLimitations.includes(limitation), true, limitation);
  }
});

test('B06 runner CLI verifies committed receipt without requiring CI Word or T7 physical run', () => {
  const output = execFileSync(process.execPath, [LAB_PATH, '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const parsed = JSON.parse(output);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.status, 'PASS');
  assert.equal(parsed.cases, 32);
});

test('B06 runner is ops-only and does not add product UI network dependency or fixture-only pass', () => {
  const source = fs.readFileSync(LAB_PATH, 'utf8');
  const receipt = readJson(RECEIPT_PATH);

  assert.equal(/\bfetch\s*\(/u.test(source), false);
  assert.equal(/\bXMLHttpRequest\b/u.test(source), false);
  assert.equal(/\bWebSocket\b/u.test(source), false);
  assert.equal(receipt.certificationBoundary.noFixtureOnlyPass, true);
  assert.equal(receipt.certificationBoundary.wordReopenVisibilityRequiredForCommentPass, true);
  assert.equal(receipt.certificationBoundary.noFuzzyApplyAuthority, true);
});
