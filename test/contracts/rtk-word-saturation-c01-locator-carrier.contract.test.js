const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_C01_LOCATOR_CARRIER_RECEIPT.json');
const LAB_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-saturation-c01-locator-carrier-lab.mjs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function loadLab() {
  return import(pathToFileURL(LAB_PATH).href);
}

test('C01 verifies latest Word physical locator carrier receipt without expanding apply', async () => {
  const lab = await loadLab();
  const receipt = readJson(RECEIPT_PATH);
  const evaluation = lab.evaluateC01LocatorCarrierReceipt(receipt);

  assert.equal(evaluation.ok, true);
  assert.equal(receipt.result, 'PASS');
  assert.equal(receipt.taskId, 'YALKEN_RTK_WORD_LATEST_SEMANTIC_ROUNDTRIP_V2');
  assert.equal(receipt.stageId, 'C01_WORD_SATURATION_LOCATOR_AUTHORITY_CARRIER_AB');
  assert.equal(receipt.profile.oldD1ProfileNotRebound, true);
  assert.equal(receipt.b06Baseline.exactAutomaticCandidates, 0);
  assert.equal(receipt.selectedAuthorityCarrier.carrier, 'customDocumentProperty');
  assert.equal(receipt.runtimeClaims.automaticApplyExpanded, false);
  assert.equal(receipt.runtimeClaims.parserAuthorityIntegrated, false);
  assert.equal(receipt.runtimeClaims.productRuntimeChanged, false);
  assert.equal(receipt.runtimeClaims.uiChanged, false);
  assert.equal(receipt.runtimeClaims.networkDependencyAdded, false);
  assert.equal(receipt.runtimeClaims.newDependencyAdded, false);
});

test('C01 physical cases are Word-created, reopened, zipped, and keep zero false exact counters', () => {
  const receipt = readJson(RECEIPT_PATH);

  assert.equal(receipt.cases.length, 5);
  for (const item of receipt.cases) {
    assert.equal(item.sourceConstruction, 'WORD_CREATED_BASE_DOCX_THEN_CARRIER_INJECTION', item.caseId);
    assert.equal(item.baseWordStatus, 'PASS', item.caseId);
    assert.equal(item.closeStrategy, 'GUI_CLOSE_SAVED_ACTIVE_LAB_WINDOW_ONLY', item.caseId);
    assert.equal(item.openEditSaveCloseReopen, 'PASS', item.caseId);
    assert.equal(item.carrierInspection.packageZipOk, true, item.caseId);
    assert.ok(item.sourceDocxSha256.startsWith('sha256:'), item.caseId);
    assert.ok(item.returnedDocxSha256.startsWith('sha256:'), item.caseId);
  }

  assert.equal(receipt.zeroFalseExactPolicy.falseExact, 0);
  assert.equal(receipt.zeroFalseExactPolicy.silentApply, 0);
  assert.equal(receipt.zeroFalseExactPolicy.wrongSceneRouting, 0);
  assert.equal(receipt.zeroFalseExactPolicy.replayFailure, 0);
  assert.equal(receipt.zeroFalseExactPolicy.exactRateMeasuredNotGamed, true);
});

test('C01 proves custom document properties are viable while customXml and docVars stay non-authoritative on this profile', () => {
  const receipt = readJson(RECEIPT_PATH);
  const rollup = receipt.carrierRollup;

  assert.equal(rollup.customDocumentProperty.visibleToAuthor, false);
  assert.equal(rollup.customDocumentProperty.exactAuthorityCandidate, true);
  assert.equal(rollup.customDocumentProperty.survivedAllMutatingCases, true);
  assert.equal(rollup.customDocumentProperty.verifiedAllMutatingCases, true);
  assert.equal(rollup.customXmlManifest.survivedAllMutatingCases, false);
  assert.equal(rollup.settingsDocVar.survivedAllMutatingCases, false);
  assert.equal(rollup.hiddenRun.visibleToAuthor, true);
  assert.equal(rollup.hiddenRun.exactAuthorityCandidate, false);
});

test('C01 sequencing keeps Word as current WIP without reducing the master plan', () => {
  const receipt = readJson(RECEIPT_PATH);

  assert.equal(receipt.wordSaturationSequencing.currentFocus, 'WORD_ONLY_UNTIL_SATURATION');
  assert.equal(receipt.wordSaturationSequencing.googleDocsNextAfterWordSaturation, true);
  assert.equal(receipt.wordSaturationSequencing.otherEditorsRemainFutureMasterPlan, true);
  assert.equal(receipt.wordSaturationSequencing.masterPlanReduced, false);
  assert.equal(receipt.nonClaims.some((item) => item.includes('Google Docs')), true);
  assert.equal(receipt.nonClaims.some((item) => item.includes('customXml')), true);
});

test('C01 runner CLI verifies committed receipt without requiring Word in CI', () => {
  const output = execFileSync(process.execPath, [LAB_PATH, '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const parsed = JSON.parse(output);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.status, 'PASS');
  assert.deepEqual(parsed.viableAuthorityCarriers, ['customDocumentProperty']);
});

test('C01 harness remains ops-only and documents macOS file access prompt avoidance', () => {
  const source = fs.readFileSync(LAB_PATH, 'utf8');
  const receipt = readJson(RECEIPT_PATH);

  assert.equal(/\bfetch\s*\(/u.test(source), false);
  assert.equal(/\bXMLHttpRequest\b/u.test(source), false);
  assert.equal(/\bWebSocket\b/u.test(source), false);
  assert.equal(source.includes('close every document'), false);
  assert.equal(receipt.wordSandboxPolicy.scratchKind, 'WORD_CONTAINER_LOCAL_TMP_TO_AVOID_MACOS_FILE_ACCESS_PROMPTS');
  assert.equal(receipt.wordSandboxPolicy.durableEvidenceOnT7, true);
  assert.equal(receipt.wordSandboxPolicy.noUserDocumentsClosed, true);
});
