const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_REPEAT_HIGH_DENSITY_STRESS_RECEIPT.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-release-audit-p0-repeat-high-density-stress.mjs');

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

test('P0 repeat high-density stress receipt verifies bounded physical product loop', async () => {
  const { evaluateWordReleaseAuditP0RepeatHighDensityStress } = await loadEvaluator();
  const receipt = readJson(RECEIPT_PATH);
  const result = evaluateWordReleaseAuditP0RepeatHighDensityStress({
    receipt,
    program: readJson(PROGRAM_PATH),
    profile: readJson(PROFILE_PATH),
    ledger: readJson(LEDGER_PATH),
  });

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.equal(result.observedCases, 12);
  assert.equal(result.passCases, 12);
  assert.equal(result.trackedReplacementApplyPass, 8);
  assert.equal(result.highDensityCommentShadowPass, 4);
  assert.equal(result.largestWords >= 100000, true);
  assert.equal(result.largestCommentCount >= 120, true);
  assert.deepEqual(zeroValues(receipt.vetoMetrics), []);
  assert.equal(receipt.implementedCapability.automaticApplyCertified, false);
  assert.equal(receipt.implementedCapability.userAutomaticApplyCertified, false);
  assert.equal(receipt.implementedCapability.wordSaturated, false);
  assert.equal(receipt.implementedCapability.googleDocsOpened, false);
});

test('P0 repeat high-density stress proves deterministic repeat groups', () => {
  const receipt = readJson(RECEIPT_PATH);
  const repeatStability = receipt.totals.repeatStability;
  const groups = new Map(repeatStability.map((item) => [item.group, item]));

  assert.equal(repeatStability.length, 5);
  assert.equal(receipt.totals.stableRepeatGroups, 5);
  assert.equal(groups.get('T10').cases, 3);
  assert.equal(groups.get('T50').cases, 3);
  assert.equal(groups.get('T100').cases, 2);
  assert.equal(groups.get('C80').cases, 2);
  assert.equal(groups.get('C120').cases, 2);
  assert.equal(repeatStability.every((item) => item.stable === true), true);
});

test('P0 repeat high-density stress separates apply and shadow lanes', () => {
  const receipt = readJson(RECEIPT_PATH);
  const tracked = receipt.physicalCorpus.productCases.filter((item) => item.waveFamily === 'repeat-tracked-replacement');
  const comments = receipt.physicalCorpus.productCases.filter((item) => item.waveFamily === 'high-density-comment-shadow');

  assert.equal(tracked.length, 8);
  assert.equal(tracked.some((item) => item.stressProfile.words >= 100000), true);
  assert.equal(tracked.every((item) => item.productLoop.explicitUserConfirmedCommandApply === true), true);
  assert.equal(tracked.every((item) => item.productLoop.replacementSemanticsVerified === true), true);
  assert.equal(comments.length, 4);
  assert.equal(comments.some((item) => item.stressProfile.commentTargets >= 120), true);
  assert.equal(comments.every((item) => item.productLoop.commentShadowCommitted === true), true);
  assert.equal(comments.every((item) => item.productLoop.writerCalled === false), true);
});

test('P0 repeat high-density stress uses product path and current Word only', () => {
  const receipt = readJson(RECEIPT_PATH);
  const scriptSource = fs.readFileSync(SCRIPT_PATH, 'utf8');

  assert.equal(receipt.physicalCorpus.liveElectronUiExportSurfaceClick.ok, true);
  assert.equal(receipt.physicalCorpus.liveElectronUiExportSurfaceClick.result.clicked, true);
  assert.equal(receipt.physicalCorpus.liveElectronUiExportSurfaceClick.userDocumentsTouched, false);
  assert.deepEqual(receipt.physicalCorpus.liveElectronUiExportSurfaceClick.networkRequests, []);
  assert.equal(receipt.wordProfile.versionByBundle, '16.111.2');
  assert.equal(receipt.physicalCorpus.productCases.every((item) => item.export.productCommandHandlerOriginated === true), true);
  assert.equal(receipt.physicalCorpus.productCases.every((item) => item.productLoop.returnIntakeAuthenticated === true), true);
  assert.equal(receipt.physicalCorpus.productCases.every((item) => item.productLoop.visiblePreviewReady === true), true);
  assert.equal(receipt.physicalCorpus.productCases.every((item) => item.productLoop.projectReopenReadbackMatchesExpected === true), true);
  assert.equal(receipt.physicalCorpus.productCases.every((item) => item.productLoop.replayIdempotent === true), true);
  assert.equal(receipt.sourceEvidence.reviewBridgeRuntime.status, 'BOUND');
  assert.doesNotMatch(scriptSource, /openGoogle|docs\.google|LibreOffice|ONLYOFFICE|Apple Pages|WPS/u);
});

test('P0 repeat high-density evaluator rejects overclaim count drift and unstable repeats', async () => {
  const { evaluateWordReleaseAuditP0RepeatHighDensityStress } = await loadEvaluator();
  const base = {
    receipt: readJson(RECEIPT_PATH),
    program: readJson(PROGRAM_PATH),
    profile: readJson(PROFILE_PATH),
    ledger: readJson(LEDGER_PATH),
  };

  const overclaimed = clone(base.receipt);
  overclaimed.implementedCapability.automaticApplyCertified = true;
  overclaimed.implementedCapability.wordSaturated = true;
  assert.equal(evaluateWordReleaseAuditP0RepeatHighDensityStress({
    ...base,
    receipt: overclaimed,
  }).ok, false);

  const missingDense = clone(base.receipt);
  missingDense.totals.highDensityCommentShadowPass = 3;
  assert.equal(evaluateWordReleaseAuditP0RepeatHighDensityStress({
    ...base,
    receipt: missingDense,
  }).ok, false);

  const unstable = clone(base.receipt);
  unstable.totals.stableRepeatGroups = 4;
  assert.equal(evaluateWordReleaseAuditP0RepeatHighDensityStress({
    ...base,
    receipt: unstable,
  }).ok, false);
});

test('P0 repeat high-density state bindings remain non-terminal', () => {
  const receipt = readJson(RECEIPT_PATH);
  const program = readJson(PROGRAM_PATH);
  const profile = readJson(PROFILE_PATH);
  const ledger = readJson(LEDGER_PATH);

  assert.equal(program.releaseAuditNight01.latestRepeatHighDensityStressReceiptPath, 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_REPEAT_HIGH_DENSITY_STRESS_RECEIPT.json');
  assert.equal(program.releaseAuditNight01.repeatHighDensityStressComplete, true);
  assert.equal([
    receipt.nextStage,
    'P0_WORD_SCALE_ENGINEERING_AND_REMAINING_LIMITATION_CLOSURE_AFTER_500K_AUDIT',
    'WORD_SAFETY_REMEDIATION_V1_C5_FULL_PHYSICAL_WORD_RECERTIFICATION',
  ].includes(program.releaseAuditNight01.nextStage), true);
  assert.equal(program.releaseAuditNight01.wordSaturated, false);
  assert.equal(profile.latestProductRepeatHighDensityStress.receiptPath, program.releaseAuditNight01.latestRepeatHighDensityStressReceiptPath);
  assert.equal(profile.latestProductRepeatHighDensityStress.automaticApplyCertified, false);
  assert.equal(ledger.coverageLedger.releaseAuditNight01P0RepeatHighDensityStress.passCases, 12);
  assert.equal(ledger.runtimeClaims.wordSaturated, false);
  assert.equal(ledger.runtimeClaims.googleDocsOpened, false);
});
