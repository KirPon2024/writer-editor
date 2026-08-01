const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-google-docs-g00-discovery-binding.mjs');
const WORD_CLOSURE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_FOR_MAC_STAGE_FORMAL_CLOSURE_RECEIPT.json');
const MATRIX_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function loadVerifier() {
  return import(pathToFileURL(SCRIPT_PATH).href);
}

test('G00 formally closes Word and binds Google current state without support claims', async () => {
  const verifier = await loadVerifier();
  const result = verifier.evaluateGoogleDocsG00DiscoveryBinding();
  const wordClosure = readJson(WORD_CLOSURE_PATH);
  const matrix = readJson(MATRIX_PATH);
  const receipt = readJson(RECEIPT_PATH);
  const program = readJson(PROGRAM_PATH);
  const ledger = readJson(LEDGER_PATH);

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.issues, []);
  assert.equal(wordClosure.status, 'WORD_STAGE_FORMALLY_CLOSED_ACCEPTED_DECLARED_SUPPORT_ENVELOPE');
  assert.equal(wordClosure.controllerAcceptance.auditVerdict, 'PASS');
  assert.equal(wordClosure.acceptedEnvelope.supportedExplicitUserTrackedReplacementWordsMax, 100000);
  assert.deepEqual(wordClosure.acceptedEnvelope.aboveEnvelopeBoundaryWords, [150000, 300000, 500000]);
  assert.equal(wordClosure.acceptedEnvelope.aboveEnvelopeDisposition, 'MANUAL_RESOURCE_LIMIT');
  assert.equal(wordClosure.acceptedEnvelope.automaticApplyCertified, false);
  assert.equal(matrix.status, 'GOOGLE_DOCS_G00_DISCOVERY_BOUND_READY_FOR_G01');
  assert.equal(matrix.counts.totalCells, 13);
  assert.equal(matrix.counts.componentProven, 1);
  assert.equal(matrix.counts.physicalGoogleEvidence, 0);
  assert.equal(matrix.counts.productRuntimeWired, 0);
  assert.equal(matrix.counts.automaticApplyCertified, 0);
  assert.equal(matrix.counts.blocksGoogleStage > 0, true);
  assert.equal(matrix.existingGoogleTruth.supportClaimed, false);
  assert.equal(matrix.existingGoogleTruth.roundtripClaimed, false);
  assert.equal(matrix.existingGoogleTruth.googleApiIntegrationClaimed, false);
  assert.equal(matrix.approvedAdapterBoundary.noCredentialsHandling, true);
  assert.equal(matrix.approvedAdapterBoundary.alreadyAuthorizedSessionOnly, true);
  assert.equal(receipt.googleCurrentState.existingEvidenceClaimGateOnly, true);
  assert.equal(receipt.googleCurrentState.nextStage, 'GOOGLE_DOCS_G01_OFFICE_MODE_PHYSICAL_DISCOVERY_OR_EXTERNAL_ACTIVATION_BOUNDARY');
  assert.equal(program.googleDocsStage.supportClaimed, false);
  assert.equal(program.googleDocsStage.physicalGoogleEvidence, 0);
  assert.equal(program.googleDocsStage.productRuntimeWired, 0);
  assert.equal(ledger.googleDocsStage.googleStageDone, false);
});

test('G00 rejects Google false support, premature runtime, and Word envelope drift', async () => {
  const verifier = await loadVerifier();
  const wordClosure = readJson(WORD_CLOSURE_PATH);
  const matrix = readJson(MATRIX_PATH);
  const receipt = readJson(RECEIPT_PATH);
  const program = readJson(PROGRAM_PATH);
  const profile = readJson(PROFILE_PATH);
  const ledger = readJson(LEDGER_PATH);

  const falseSupportMatrix = clone(matrix);
  falseSupportMatrix.existingGoogleTruth.supportClaimed = true;
  falseSupportMatrix.counts.productRuntimeWired = 1;
  falseSupportMatrix.counts.physicalGoogleEvidence = 1;
  falseSupportMatrix.rows.find((row) => row.cellId === 'google.productUiExport').currentTerminalClass = 'PRODUCT_RUNTIME_WIRED';

  const falseSupportResult = verifier.evaluateGoogleDocsG00DiscoveryBinding({
    wordClosure,
    matrix: falseSupportMatrix,
    receipt,
    program,
    profile,
    ledger,
  });

  const wordOverclaim = clone(wordClosure);
  wordOverclaim.acceptedEnvelope.supportedExplicitUserTrackedReplacementWordsMax = 500000;
  wordOverclaim.acceptedEnvelope.automaticApplyCertified = true;
  const wordOverclaimResult = verifier.evaluateGoogleDocsG00DiscoveryBinding({
    wordClosure: wordOverclaim,
    matrix,
    receipt,
    program,
    profile,
    ledger,
  });

  assert.equal(falseSupportResult.status, 'FAIL');
  assert.equal(falseSupportResult.issues.some((issue) => issue.code === 'GOOGLE_G00_MATRIX_COUNTS_INVALID'), true);
  assert.equal(falseSupportResult.issues.some((issue) => issue.code === 'GOOGLE_G00_FALSE_SUPPORT_CLAIM'), true);
  assert.equal(wordOverclaimResult.status, 'FAIL');
  assert.equal(wordOverclaimResult.issues.some((issue) => issue.code === 'GOOGLE_G00_WORD_ENVELOPE_OVERCLAIM'), true);
});

test('G00 source text keeps Google support nonclaims explicit', () => {
  const matrixText = fs.readFileSync(MATRIX_PATH, 'utf8');
  const receiptText = fs.readFileSync(RECEIPT_PATH, 'utf8');
  const combined = `${matrixText}\n${receiptText}`;

  for (const phrase of [
    'No Google Docs support is claimed.',
    'No Google Docs import is claimed.',
    'No Google Docs roundtrip is claimed.',
    'No Google API runtime dependency is introduced.',
    'No automatic apply is certified.',
    'No Google stage DONE is claimed.',
  ]) {
    assert.match(combined, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }
  assert.doesNotMatch(combined, /\bGoogle Docs support is (?:available|supported|ready|complete)\b/iu);
  assert.doesNotMatch(combined, /\bGoogle Docs roundtrip is (?:available|supported|ready|complete)\b/iu);
});
