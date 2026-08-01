const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_500K_TERMINAL_AUDIT_RECEIPT.json';
const RECEIPT_PATH = path.join(REPO_ROOT, RECEIPT_REF);
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-release-audit-p0-500k-terminal-audit.mjs');
const NEXT_STAGE = 'P0_WORD_SCALE_ENGINEERING_AND_REMAINING_LIMITATION_CLOSURE_AFTER_500K_AUDIT';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function zeroValues(object) {
  return Object.values(object || {}).filter((value) => Number(value) !== 0);
}

async function loadEvaluator() {
  return import(pathToFileURL(SCRIPT_PATH).href);
}

test('P0 500K terminal audit verifies a physical boundary without saturation', async () => {
  const { evaluateWordReleaseAuditP0500kTerminalAudit } = await loadEvaluator();
  const receipt = readJson(RECEIPT_PATH);
  const result = evaluateWordReleaseAuditP0500kTerminalAudit({
    receipt,
    program: readJson(PROGRAM_PATH),
    profile: readJson(PROFILE_PATH),
    ledger: readJson(LEDGER_PATH),
  });
  const boundary = receipt.physicalCorpus.boundaryAttempt;

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.equal(receipt.status, 'WORD_RELEASE_AUDIT_P0_500K_TERMINAL_AUDIT_COMPLETE_NOT_SATURATED');
  assert.equal(receipt.physicalCorpus.liveElectronUiExportSurfaceClick.ok, true);
  assert.equal(receipt.physicalCorpus.liveElectronUiExportSurfaceClick.userDocumentsTouched, false);
  assert.deepEqual(receipt.physicalCorpus.liveElectronUiExportSurfaceClick.networkRequests, []);
  assert.equal(boundary.words, 500000);
  assert.equal(['PASS', 'TYPED_LIMITATION_REPRODUCED'].includes(boundary.result), true);
  assert.equal(boundary.packageInvalidClaimed, false);
  assert.equal(boundary.userDocumentTouched, false);
  assert.equal(receipt.terminalAudit.maxCertifiedTrackedReplacementWordsBeforeBoundary >= 100000, true);
  assert.deepEqual(zeroValues(receipt.vetoMetrics), []);
  assert.equal(receipt.implementedCapability.automaticApplyCertified, false);
  assert.equal(receipt.implementedCapability.userAutomaticApplyCertified, false);
  assert.equal(receipt.implementedCapability.wordSaturated, false);
  assert.equal(receipt.implementedCapability.googleDocsOpened, false);
});

test('P0 500K terminal audit binds prior product evidence', () => {
  const receipt = readJson(RECEIPT_PATH);
  const prior = receipt.priorEvidence;

  assert.equal(prior.repeatHighDensity.status, 'WORD_RELEASE_AUDIT_P0_REPEAT_HIGH_DENSITY_STRESS_COMPLETE_NOT_SATURATED');
  assert.equal(prior.repeatHighDensity.result, 'PASS');
  assert.equal(prior.largeManuscriptStress.status, 'WORD_RELEASE_AUDIT_P0_LARGE_MANUSCRIPT_STRESS_COMPLETE_NOT_SATURATED');
  assert.equal(prior.largeManuscriptStress.result, 'PASS');
  assert.equal(prior.variedWave64.status, 'WORD_RELEASE_AUDIT_P0_VARIED_WAVE64_PRODUCT_LOOP_COMPLETE_NOT_SATURATED');
  assert.equal(prior.variedWave64.result, 'PASS');
  assert.equal(prior.multiSceneCommentState.status, 'WORD_RELEASE_AUDIT_P0_MULTI_SCENE_ATOMIC_COMMENT_STATE_CLOSURE_COMPLETE_NOT_SATURATED');
});

test('P0 500K terminal audit refuses overclaim and invalid boundary evidence', async () => {
  const { evaluateWordReleaseAuditP0500kTerminalAudit } = await loadEvaluator();
  const base = {
    receipt: readJson(RECEIPT_PATH),
    program: readJson(PROGRAM_PATH),
    profile: readJson(PROFILE_PATH),
    ledger: readJson(LEDGER_PATH),
  };

  const overclaimed = clone(base.receipt);
  overclaimed.implementedCapability.automaticApplyCertified = true;
  overclaimed.implementedCapability.wordSaturated = true;
  assert.equal(evaluateWordReleaseAuditP0500kTerminalAudit({ ...base, receipt: overclaimed }).ok, false);

  const packageInvalid = clone(base.receipt);
  packageInvalid.physicalCorpus.boundaryAttempt.packageInvalidClaimed = true;
  assert.equal(evaluateWordReleaseAuditP0500kTerminalAudit({ ...base, receipt: packageInvalid }).ok, false);

  const noOp = clone(base.receipt);
  noOp.physicalCorpus.boundaryAttempt.result = 'NO_OP';
  assert.equal(evaluateWordReleaseAuditP0500kTerminalAudit({ ...base, receipt: noOp }).ok, false);
});

test('P0 500K terminal audit state bindings remain non-terminal', () => {
  const program = readJson(PROGRAM_PATH);
  const profile = readJson(PROFILE_PATH);
  const ledger = readJson(LEDGER_PATH);

  assert.equal(program.releaseAuditNight01.latest500kTerminalAuditReceiptPath, RECEIPT_REF);
  assert.equal(program.releaseAuditNight01.terminal500kAuditComplete, true);
  assert.equal(program.releaseAuditNight01.nextStage, 'WORD_SAFETY_REMEDIATION_V1_C5_FULL_PHYSICAL_WORD_RECERTIFICATION');
  assert.equal(program.releaseAuditNight01.wordSaturated, false);
  assert.equal(profile.latestProduct500kTerminalAudit.receiptPath, RECEIPT_REF);
  assert.equal(profile.latestProduct500kTerminalAudit.automaticApplyCertified, false);
  assert.equal(profile.latestProduct500kTerminalAudit.wordSaturated, false);
  assert.equal(ledger.coverageLedger.releaseAuditNight01P0500kTerminalAudit.observedCases, 1);
  assert.equal(ledger.runtimeClaims.wordSaturated, false);
  assert.equal(ledger.runtimeClaims.googleDocsOpened, false);
});

test('P0 500K terminal audit runner keeps Word cleanup scoped and avoids other editors', () => {
  const scriptSource = fs.readFileSync(SCRIPT_PATH, 'utf8');

  assert.match(scriptSource, /POSIX path of \(full name of yDoc as alias\)/u);
  assert.match(scriptSource, /starts with/);
  assert.match(scriptSource, /wordRunDir/);
  assert.doesNotMatch(scriptSource, /openGoogle|docs\.google|LibreOffice|ONLYOFFICE|Apple Pages|WPS/u);
});
