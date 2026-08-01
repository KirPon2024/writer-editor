'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-release-audit-p0-product-originated-smoke-wave12.mjs');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_PRODUCT_ORIGINATED_WORD_SMOKE_WAVE12_RECEIPT.json');

async function loadScript() {
  return import(`${SCRIPT_PATH}?cacheBust=${Date.now()}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('release audit P0 product-originated smoke wave records typed macOS Word sandbox grant blocker', async () => {
  const mod = await loadScript();
  const result = mod.evaluateWordReleaseAuditP0ProductOriginatedSmokeWave12();
  assert.equal(result.status, 'PASS');
  assert.equal(result.observedCases, 12);
  assert.equal(result.productCommandHandlerOriginated, 12);
  assert.equal(result.physicalOpenEditSaveCloseReopenPass, 0);
  assert.equal(result.macosWordSandboxGrantRequired, true);
  assert.equal(result.packageInvalidProven, false);
  assert.equal(result.automaticApplyCertified, false);
  assert.equal(result.wordSaturated, false);

  const receipt = readJson(RECEIPT_PATH);
  assert.equal(receipt.result, 'BLOCKED');
  assert.equal(receipt.environmentPermissionBoundary.status, 'MACOS_WORD_SANDBOX_GRANT_REQUIRED');
  assert.equal(receipt.environmentPermissionBoundary.packageInvalidProven, false);
  assert.equal(receipt.environmentPermissionBoundary.exporterOrOoxmlChangedForPrompt, false);
  assert.equal(receipt.environmentPermissionBoundary.controlledPositiveGrantAutomated, false);
  assert.equal(receipt.physicalCorpus.syntheticOnly, true);
  assert.equal(receipt.physicalCorpus.productCommandHandlerOriginated, true);
  assert.equal(receipt.physicalCorpus.liveElectronUiClicked, false);
  assert.equal(receipt.physicalCorpus.blockedBeforeWordOpenByEnvironmentPermission, true);
  assert.equal(receipt.implementedCapability.productOriginatedPhysicalLoopSmokeProven, false);
  assert.equal(receipt.implementedCapability.automaticApplyCertified, false);
  assert.equal(receipt.implementedCapability.wordSaturated, false);
  assert.equal(receipt.implementedCapability.googleDocsOpened, false);
  assert.equal(receipt.totals.pass, 0);
  assert.equal(receipt.totals.blocked, 12);
  assert.equal(receipt.totals.productCommandHandlerOriginated, 12);
  assert.equal(receipt.totals.physicalOpenEditSaveCloseReopenPass, 0);
  assert.equal(receipt.totals.physicalOpenEditSaveCloseReopenBlocked, 12);
  assert.equal(receipt.vetoMetrics.physicalWordBlockedByEnvironmentPermission, 12);
  assert.equal(receipt.vetoMetrics.falseExact, 0);
  assert.equal(receipt.vetoMetrics.silentApply, 0);
  assert.equal(receipt.vetoMetrics.googleDocsOpened, 0);
  assert.equal(receipt.physicalCorpus.cases.every((item) => item.blockedReasonCode === 'MACOS_WORD_SANDBOX_GRANT_REQUIRED'), true);
});

test('release audit P0 product-originated smoke verifier rejects fixture-only or overclaimed drift', async () => {
  const mod = await loadScript();
  const receipt = readJson(RECEIPT_PATH);
  const program = readJson(path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json'));
  const profile = readJson(path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json'));
  const ledger = readJson(path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json'));

  const tooSmall = JSON.parse(JSON.stringify(receipt));
  tooSmall.physicalCorpus.cases = tooSmall.physicalCorpus.cases.slice(0, 11);
  tooSmall.totals.cases = 11;
  tooSmall.totals.blocked = 11;
  assert.equal(mod.evaluateWordReleaseAuditP0ProductOriginatedSmokeWave12({
    receipt: tooSmall,
    program,
    profile,
    ledger,
  }).status, 'FAIL');

  const noProductOrigin = JSON.parse(JSON.stringify(receipt));
  noProductOrigin.totals.productCommandHandlerOriginated = 11;
  noProductOrigin.physicalCorpus.cases[0].productPath.productCommandHandlerOriginated = false;
  assert.equal(mod.evaluateWordReleaseAuditP0ProductOriginatedSmokeWave12({
    receipt: noProductOrigin,
    program,
    profile,
    ledger,
  }).status, 'FAIL');

  const noOpComment = JSON.parse(JSON.stringify(receipt));
  noOpComment.vetoMetrics.noOpPass = 1;
  assert.equal(mod.evaluateWordReleaseAuditP0ProductOriginatedSmokeWave12({
    receipt: noOpComment,
    program,
    profile,
    ledger,
  }).status, 'FAIL');

  const packageOverclaim = JSON.parse(JSON.stringify(receipt));
  packageOverclaim.environmentPermissionBoundary.packageInvalidProven = true;
  assert.equal(mod.evaluateWordReleaseAuditP0ProductOriginatedSmokeWave12({
    receipt: packageOverclaim,
    program,
    profile,
    ledger,
  }).status, 'FAIL');

  const overclaim = JSON.parse(JSON.stringify(receipt));
  overclaim.implementedCapability.automaticApplyCertified = true;
  overclaim.implementedCapability.productOriginatedPhysicalLoopSmokeProven = true;
  assert.equal(mod.evaluateWordReleaseAuditP0ProductOriginatedSmokeWave12({
    receipt: overclaim,
    program,
    profile,
    ledger,
  }).status, 'FAIL');
});
