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

test('release audit P0 product-originated smoke wave records truthful terminal state', async () => {
  const mod = await loadScript();
  const result = mod.evaluateWordReleaseAuditP0ProductOriginatedSmokeWave12();
  assert.equal(result.status, 'PASS');
  assert.equal(result.observedCases, 12);
  assert.equal(result.productCommandHandlerOriginated, 12);
  assert.equal(result.packageInvalidProven, false);
  assert.equal(result.automaticApplyCertified, false);
  assert.equal(result.wordSaturated, false);

  const receipt = readJson(RECEIPT_PATH);
  assert.equal(receipt.physicalCorpus.syntheticOnly, true);
  assert.equal(receipt.physicalCorpus.productCommandHandlerOriginated, true);
  assert.equal(receipt.physicalCorpus.liveElectronUiClicked, false);
  assert.equal(receipt.implementedCapability.automaticApplyCertified, false);
  assert.equal(receipt.implementedCapability.wordSaturated, false);
  assert.equal(receipt.implementedCapability.googleDocsOpened, false);
  assert.equal(receipt.totals.productCommandHandlerOriginated, 12);
  assert.equal(receipt.vetoMetrics.falseExact, 0);
  assert.equal(receipt.vetoMetrics.silentApply, 0);
  assert.equal(receipt.vetoMetrics.googleDocsOpened, 0);
  if (receipt.result === 'PASS') {
    assert.equal(result.physicalOpenEditSaveCloseReopenPass, 12);
    assert.equal(result.macosWordSandboxGrantRequired, false);
    assert.equal(receipt.physicalCorpus.launchServicesOpenUsed, true);
    assert.equal(receipt.physicalCorpus.wordSaveMode, 'SAVE_EXISTING_DOCUMENT_NO_SAVE_AS');
    assert.equal(receipt.implementedCapability.productOriginatedPhysicalLoopSmokeProven, true);
    assert.equal(receipt.totals.pass, 12);
    assert.equal(receipt.totals.physicalOpenEditSaveCloseReopenPass, 12);
    assert.equal(receipt.vetoMetrics.physicalWordBlockedByEnvironmentPermission, 0);
  } else {
    assert.equal(receipt.result, 'BLOCKED');
    assert.equal(result.physicalOpenEditSaveCloseReopenPass, 0);
    assert.equal(result.macosWordSandboxGrantRequired, true);
    assert.equal(receipt.environmentPermissionBoundary.status, 'MACOS_WORD_SANDBOX_GRANT_REQUIRED');
    assert.equal(receipt.environmentPermissionBoundary.packageInvalidProven, false);
    assert.equal(receipt.environmentPermissionBoundary.exporterOrOoxmlChangedForPrompt, false);
    assert.equal(receipt.environmentPermissionBoundary.controlledPositiveGrantAutomated, false);
    assert.equal(receipt.physicalCorpus.blockedBeforeWordOpenByEnvironmentPermission, true);
    assert.equal(receipt.implementedCapability.productOriginatedPhysicalLoopSmokeProven, false);
    assert.equal(receipt.totals.pass, 0);
    assert.equal(receipt.totals.blocked, 12);
    assert.equal(receipt.totals.physicalOpenEditSaveCloseReopenPass, 0);
    assert.equal(receipt.totals.physicalOpenEditSaveCloseReopenBlocked, 12);
    assert.equal(receipt.vetoMetrics.physicalWordBlockedByEnvironmentPermission, 12);
    assert.equal(receipt.physicalCorpus.cases.every((item) => item.blockedReasonCode === 'MACOS_WORD_SANDBOX_GRANT_REQUIRED'), true);
  }
});

test('release audit P0 product-originated smoke runner uses LaunchServices open and ordinary Word Save', () => {
  const source = fs.readFileSync(SCRIPT_PATH, 'utf8');
  assert.match(source, /\/usr\/bin\/open -a/);
  assert.match(source, /launchServicesOpenUsed/);
  assert.match(source, /SAVE_EXISTING_DOCUMENT_NO_SAVE_AS/);
  assert.doesNotMatch(source, /save as yDoc file name/);
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

test('release audit P0 verifier accepts only fully observed physical PASS promotion', async () => {
  const mod = await loadScript();
  const receipt = readJson(RECEIPT_PATH);
  const program = readJson(path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json'));
  const profile = readJson(path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json'));
  const ledger = readJson(path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json'));

  const passReceipt = JSON.parse(JSON.stringify(receipt));
  passReceipt.status = 'WORD_RELEASE_AUDIT_P0_PRODUCT_ORIGINATED_WORD_SMOKE_WAVE_12_COMPLETE_NOT_SATURATED';
  passReceipt.result = 'PASS';
  passReceipt.nextStage = 'P0_PRODUCT_ORIGINATED_WORD_VARIED_WAVE_64';
  passReceipt.physicalCorpus.launchServicesOpenUsed = true;
  passReceipt.physicalCorpus.wordSaveMode = 'SAVE_EXISTING_DOCUMENT_NO_SAVE_AS';
  passReceipt.physicalCorpus.wordNativeOpenEditSaveCloseReopen = true;
  passReceipt.implementedCapability.productOriginatedPhysicalLoopSmokeProven = true;
  passReceipt.environmentPermissionBoundary = {
    status: 'NOT_OBSERVED_LAUNCHSERVICES_OPEN_SAVE_PATH',
    packageInvalidProven: false,
    exporterOrOoxmlChangedForPrompt: false,
    launchServicesOpenUsed: true,
    wordSaveMode: 'SAVE_EXISTING_DOCUMENT_NO_SAVE_AS',
  };
  passReceipt.totals.pass = 12;
  passReceipt.totals.fail = 0;
  passReceipt.totals.blocked = 0;
  passReceipt.totals.physicalOpenEditSaveCloseReopenPass = 12;
  passReceipt.totals.physicalOpenEditSaveCloseReopenBlocked = 0;
  passReceipt.totals.environmentPermissionBlocked = 0;
  passReceipt.vetoMetrics.physicalWordBlockedByEnvironmentPermission = 0;
  for (const item of passReceipt.physicalCorpus.cases) {
    item.result = 'PASS';
    item.wordStatus = 'PASS';
    item.openEditSaveCloseReopen = 'PASS';
    delete item.blockedReasonCode;
    delete item.blockedReasonFamily;
  }

  const passProgram = JSON.parse(JSON.stringify(program));
  passProgram.releaseAuditNight01.status = passReceipt.status;
  passProgram.releaseAuditNight01.nextStage = passReceipt.nextStage;
  passProgram.releaseAuditNight01.productOriginatedPhysicalLoopSmokeProven = true;
  passProgram.releaseAuditNight01.macosWordSandboxGrantRequired = false;
  passProgram.releaseAuditNight01.launchServicesOpenUsed = true;
  passProgram.releaseAuditNight01.wordSaveMode = 'SAVE_EXISTING_DOCUMENT_NO_SAVE_AS';

  const passProfile = JSON.parse(JSON.stringify(profile));
  const cell = passProfile.cells.find((item) => item.capabilityId === 'rtk.word.releaseAudit.p0.productOriginatedSmokeWave12');
  cell.state = 'PHYSICAL_WORD_SMOKE_WAVE_12_COMPLETE_NOT_RELEASE_CERTIFIED';
  cell.currentCapability = 'PRODUCT_ORIGINATED_WORD_SMOKE_WAVE_12_COMPLETE';
  cell.physicalWordEvidence = true;
  cell.macosWordSandboxGrantRequired = false;
  cell.launchServicesOpenUsed = true;
  cell.wordSaveMode = 'SAVE_EXISTING_DOCUMENT_NO_SAVE_AS';

  const passLedger = JSON.parse(JSON.stringify(ledger));
  const coverage = passLedger.coverageLedger.releaseAuditNight01P0ProductOriginatedSmokeWave12;
  coverage.status = 'BOUND_PRODUCT_ORIGINATED_WORD_SMOKE_WAVE_12_PHYSICAL_COMPLETE';
  coverage.result = passReceipt.status;
  coverage.physicalWordEvidence = true;
  coverage.macosWordSandboxGrantRequired = false;
  coverage.launchServicesOpenUsed = true;
  coverage.wordSaveMode = 'SAVE_EXISTING_DOCUMENT_NO_SAVE_AS';
  coverage.blockedCases = 0;
  coverage.passCases = 12;

  assert.equal(mod.evaluateWordReleaseAuditP0ProductOriginatedSmokeWave12({
    receipt: passReceipt,
    program: passProgram,
    profile: passProfile,
    ledger: passLedger,
  }).status, 'PASS');

  passReceipt.totals.physicalOpenEditSaveCloseReopenPass = 11;
  assert.equal(mod.evaluateWordReleaseAuditP0ProductOriginatedSmokeWave12({
    receipt: passReceipt,
    program: passProgram,
    profile: passProfile,
    ledger: passLedger,
  }).status, 'FAIL');
});
