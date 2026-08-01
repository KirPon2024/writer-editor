const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_SCALE_ENVELOPE_TERMINAL_RECEIPT.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const MATRIX_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_NORMALIZED_CAPABILITY_MATRIX_V1.json');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-p0-scale-envelope-terminal-audit.mjs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function loadEvaluator() {
  return import(pathToFileURL(SCRIPT_PATH).href);
}

test('P0 scale envelope declares terminal Word support envelope without universal overclaim', async () => {
  const { evaluateWordP0ScaleEnvelopeTerminalAudit } = await loadEvaluator();
  const receipt = readJson(RECEIPT_PATH);
  const result = evaluateWordP0ScaleEnvelopeTerminalAudit({
    receipt,
    profile: readJson(PROFILE_PATH),
    program: readJson(PROGRAM_PATH),
    ledger: readJson(LEDGER_PATH),
    matrix: readJson(MATRIX_PATH),
  });

  assert.equal(result.status, 'PASS', JSON.stringify(result.issues, null, 2));
  assert.equal(receipt.status, 'WORD_P0_SCALE_ENVELOPE_DECLARED_READY_FOR_INDEPENDENT_AUDIT');
  assert.equal(receipt.supportEnvelope.supportedTrackedReplacementApply.maxCertifiedManuscriptWords, 100000);
  assert.equal(receipt.supportEnvelope.supportedCommentShadow.maxCertifiedDenseCommentThreads, 120);
  assert.deepEqual(receipt.supportEnvelope.attemptedBoundaryWords, [150000, 300000, 500000]);
  assert.equal(receipt.supportEnvelope.boundaryStatus, 'TYPED_LIMITATION_REPRODUCED');
  assert.equal(receipt.supportEnvelope.aboveEnvelopeDisposition, 'MANUAL_RESOURCE_LIMIT');
  assert.equal(receipt.saturationDecision.wordSaturated, true);
  assert.equal(receipt.saturationDecision.wordSaturationScope, 'DECLARED_SUPPORT_ENVELOPE_ONLY');
  assert.equal(receipt.saturationDecision.wordSaturationUniversalClaim, false);
  assert.equal(receipt.saturationDecision.automaticApplyCertified, false);
  assert.equal(receipt.saturationDecision.googleDocsOpened, false);
  assert.equal(receipt.saturationDecision.googleDocsAllowedToOpen, false);
  assert.equal(receipt.saturationDecision.programDone, false);
  assert.equal(receipt.saturationDecision.readyForFreshIndependentExactHeadAudit, true);
});

test('P0 scale envelope rejects 500K support overclaim and premature Google', async () => {
  const { evaluateWordP0ScaleEnvelopeTerminalAudit } = await loadEvaluator();
  const base = {
    receipt: readJson(RECEIPT_PATH),
    profile: readJson(PROFILE_PATH),
    program: readJson(PROGRAM_PATH),
    ledger: readJson(LEDGER_PATH),
    matrix: readJson(MATRIX_PATH),
  };

  const broadAuto = clone(base.receipt);
  broadAuto.saturationDecision.automaticApplyCertified = true;
  assert.equal(evaluateWordP0ScaleEnvelopeTerminalAudit({ ...base, receipt: broadAuto }).ok, false);

  const universal = clone(base.receipt);
  universal.saturationDecision.wordSaturationUniversalClaim = true;
  assert.equal(evaluateWordP0ScaleEnvelopeTerminalAudit({ ...base, receipt: universal }).ok, false);

  const google = clone(base.receipt);
  google.saturationDecision.googleDocsAllowedToOpen = true;
  assert.equal(evaluateWordP0ScaleEnvelopeTerminalAudit({ ...base, receipt: google }).ok, false);

  const unsupported500k = clone(base.receipt);
  unsupported500k.supportEnvelope.supportedTrackedReplacementApply.maxCertifiedManuscriptWords = 500000;
  assert.equal(evaluateWordP0ScaleEnvelopeTerminalAudit({ ...base, receipt: unsupported500k }).ok, false);
});

test('P0 scale envelope binds profile program ledger and normalized matrix terminal state', async () => {
  const { evaluateWordP0ScaleEnvelopeTerminalAudit } = await loadEvaluator();
  const receipt = readJson(RECEIPT_PATH);
  const profile = readJson(PROFILE_PATH);
  const program = readJson(PROGRAM_PATH);
  const ledger = readJson(LEDGER_PATH);
  const matrix = readJson(MATRIX_PATH);
  const saturationCell = profile.cells.find((cell) => cell.capabilityId === 'rtk.word.v4.saturationLedger');
  const matrixSaturationRow = matrix.rows.find((row) => row.cellId === 'rtk.word.v4.saturationLedger');
  const result = evaluateWordP0ScaleEnvelopeTerminalAudit({ receipt, profile, program, ledger, matrix });

  assert.equal(result.status, 'PASS', JSON.stringify(result.issues, null, 2));
  assert.equal(profile.status, 'WORD_SAFETY_REMEDIATION_V1_C4_TEST_GRAPH_CI_TRUTH_LOCAL_VERIFIED');
  assert.equal(saturationCell.currentCapability, 'REOPENED_BY_WORD_SAFETY_REMEDIATION_C4_VERIFIED_C5_REQUIRED');
  assert.equal(program.status, 'WORD_SAFETY_REMEDIATION_V1_C4_TEST_GRAPH_CI_TRUTH_LOCAL_VERIFIED');
  assert.equal(program.nextStep, 'WORD_SAFETY_REMEDIATION_V1_C5_FULL_PHYSICAL_WORD_RECERTIFICATION');
  assert.equal(program.v4ExecutionState.wordSaturated, false);
  assert.equal(program.v4ExecutionState.wordAcceptanceRevoked, true);
  assert.equal(program.v4ExecutionState.readyForFreshIndependentExactHeadAudit, false);
  assert.equal(program.v4ExecutionState.googleDocsOpened, false);
  assert.equal(ledger.status, 'WORD_SAFETY_REMEDIATION_V1_C4_TEST_GRAPH_CI_TRUTH_LOCAL_VERIFIED');
  assert.equal(ledger.runtimeClaims.wordSaturated, false);
  assert.equal(ledger.runtimeClaims.wordSaturationScope, 'DECLARED_SUPPORT_ENVELOPE_ONLY');
  assert.equal(ledger.notSaturatedReasons.includes('C5_FULL_PHYSICAL_WORD_RECERTIFICATION_REQUIRED'), true);
  assert.equal(matrix.status, 'WORD_NORMALIZED_CAPABILITY_MATRIX_REOPENED_BY_SAFETY_REMEDIATION_C4_VERIFIED');
  assert.equal(matrix.counts.blocksWordSaturation, 0);
  assert.equal(matrixSaturationRow.blocksWordSaturation, false);
  assert.equal(matrix.supportEnvelope.readyForFreshIndependentExactHeadAudit, false);
});
