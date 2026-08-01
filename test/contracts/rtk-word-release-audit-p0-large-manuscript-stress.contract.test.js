const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_LARGE_MANUSCRIPT_STRESS_RECEIPT.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-release-audit-p0-large-manuscript-stress.mjs');

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

test('P0 large manuscript stress receipt verifies bounded physical product loop', async () => {
  const { evaluateWordReleaseAuditP0LargeManuscriptStress } = await loadEvaluator();
  const receipt = readJson(RECEIPT_PATH);
  const result = evaluateWordReleaseAuditP0LargeManuscriptStress({
    receipt,
    program: readJson(PROGRAM_PATH),
    profile: readJson(PROFILE_PATH),
    ledger: readJson(LEDGER_PATH),
  });

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.equal(result.observedCases, 7);
  assert.equal(result.passCases, 7);
  assert.equal(result.largeTrackedReplacementApplyPass, 3);
  assert.equal(result.denseCommentShadowPass, 2);
  assert.equal(result.formattingDiagnosticPass, 1);
  assert.equal(result.structuralDiagnosticPass, 1);
  assert.equal(result.largestWords >= 100000, true);
  assert.equal(result.monolithic300kBoundaryStatus, 'TYPED_LIMITATION_REPRODUCED');
  assert.equal(receipt.physicalCorpus.scaleBoundary.largestBoundaryWords, 300000);
  assert.equal(receipt.physicalCorpus.scaleBoundary.attempts.some((item) => item.caseId === 'P0LMS-T150K'), true);
  assert.equal(receipt.physicalCorpus.scaleBoundary.attempts.some((item) => item.caseId === 'P0LMS-T300K'), true);
  assert.deepEqual(zeroValues(receipt.vetoMetrics), []);
  assert.equal(receipt.implementedCapability.automaticApplyCertified, false);
  assert.equal(receipt.implementedCapability.wordSaturated, false);
  assert.equal(receipt.implementedCapability.googleDocsOpened, false);
});

test('P0 large manuscript stress separates supported apply from diagnostic lanes', () => {
  const receipt = readJson(RECEIPT_PATH);
  const tracked = receipt.physicalCorpus.productCases.filter((item) => item.waveFamily === 'large-tracked-replacement');
  const comments = receipt.physicalCorpus.productCases.filter((item) => item.waveFamily === 'dense-comment-shadow');
  const formatting = receipt.physicalCorpus.productCases.find((item) => item.waveFamily === 'large-formatting-diagnostic');
  const structure = receipt.physicalCorpus.productCases.find((item) => item.waveFamily === 'large-structure-diagnostic');

  assert.equal(tracked.length, 3);
  assert.equal(tracked.some((item) => item.stressProfile.words >= 100000), true);
  assert.equal(tracked.every((item) => item.productLoop.explicitUserConfirmedCommandApply === true), true);
  assert.equal(tracked.every((item) => item.productLoop.replacementSemanticsVerified === true), true);
  assert.equal(comments.length, 2);
  assert.equal(comments.some((item) => item.stressProfile.commentTargets >= 80), true);
  assert.equal(comments.some((item) => item.stressProfile.words >= 50000), true);
  assert.equal(comments.every((item) => item.productLoop.commentShadowCommitted === true), true);
  assert.equal(comments.every((item) => item.productLoop.writerCalled === false), true);
  assert.equal(formatting.productLoop.formattingDiagnosticsVerified, true);
  assert.equal(formatting.productLoop.writerCalled, false);
  assert.equal(structure.productLoop.structuralDiagnosticsVerified, true);
  assert.equal(structure.productLoop.writerCalled, false);
});

test('P0 large manuscript stress uses product UI proof and current Word only', () => {
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
  assert.doesNotMatch(scriptSource, /openGoogle|docs\.google|LibreOffice|ONLYOFFICE|Apple Pages|WPS/u);
});

test('P0 large manuscript evaluator rejects overclaim count drift and stale scale', async () => {
  const { evaluateWordReleaseAuditP0LargeManuscriptStress } = await loadEvaluator();
  const base = {
    receipt: readJson(RECEIPT_PATH),
    program: readJson(PROGRAM_PATH),
    profile: readJson(PROFILE_PATH),
    ledger: readJson(LEDGER_PATH),
  };

  const overclaimed = clone(base.receipt);
  overclaimed.implementedCapability.automaticApplyCertified = true;
  overclaimed.implementedCapability.wordSaturated = true;
  assert.equal(evaluateWordReleaseAuditP0LargeManuscriptStress({
    ...base,
    receipt: overclaimed,
  }).ok, false);

  const missingDense = clone(base.receipt);
  missingDense.totals.denseCommentShadowPass = 1;
  assert.equal(evaluateWordReleaseAuditP0LargeManuscriptStress({
    ...base,
    receipt: missingDense,
  }).ok, false);

  const undersized = clone(base.receipt);
  undersized.totals.largestWords = 50000;
  assert.equal(evaluateWordReleaseAuditP0LargeManuscriptStress({
    ...base,
    receipt: undersized,
  }).ok, false);

  const missingBoundary = clone(base.receipt);
  missingBoundary.physicalCorpus.scaleBoundary.status = 'NO_PRIOR_SCALE_BOUNDARY_ATTEMPT_FOUND';
  assert.equal(evaluateWordReleaseAuditP0LargeManuscriptStress({
    ...base,
    receipt: missingBoundary,
  }).ok, false);
});

test('P0 large manuscript state bindings remain non-terminal', () => {
  const receipt = readJson(RECEIPT_PATH);
  const program = readJson(PROGRAM_PATH);
  const profile = readJson(PROFILE_PATH);
  const ledger = readJson(LEDGER_PATH);

  assert.equal(program.releaseAuditNight01.latestLargeManuscriptStressReceiptPath, 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_LARGE_MANUSCRIPT_STRESS_RECEIPT.json');
  assert.equal(program.releaseAuditNight01.largeManuscriptStressComplete, true);
  assert.equal([
    receipt.nextStage,
    'P0_PRODUCT_VERTICAL_500K_BOUNDARY_AND_TERMINAL_WORD_AUDIT_AFTER_REPEAT_HIGH_DENSITY',
    'P0_WORD_SCALE_ENGINEERING_AND_REMAINING_LIMITATION_CLOSURE_AFTER_500K_AUDIT',
    'WORD_SAFETY_REMEDIATION_V1_C5_FULL_PHYSICAL_WORD_RECERTIFICATION',
  ].includes(program.releaseAuditNight01.nextStage), true);
  assert.equal(program.releaseAuditNight01.wordSaturated, false);
  assert.equal(profile.latestProductLargeManuscriptStress.receiptPath, program.releaseAuditNight01.latestLargeManuscriptStressReceiptPath);
  assert.equal(profile.latestProductLargeManuscriptStress.automaticApplyCertified, false);
  assert.equal(ledger.coverageLedger.releaseAuditNight01P0LargeManuscriptStress.passCases, 7);
  assert.equal(ledger.runtimeClaims.wordSaturated, false);
  assert.equal(ledger.runtimeClaims.googleDocsOpened, false);
});
