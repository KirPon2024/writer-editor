const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-google-docs-g00-discovery-binding.mjs');
const MATRIX_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json');
const GOOGLE_PROFILE_REGISTRY_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'GOOGLE_BUILD_PROFILE_REGISTRY_V1.json');
const GOOGLE_EVIDENCE_STATUS_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'REVIEW_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_BINDING_001_STATUS.json');
const TERMINAL_CLAIM_REGISTRY_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'YALKEN_INTEROP_TERMINAL_CLAIM_REGISTRY_V1.json');

const STATUS = 'LOCAL_COMPATIBILITY_REBOUND_NEEDS_REAL_ACCOUNT_E2E';
const RESULT = 'LOCAL_COMPATIBILITY_NEEDS_MORE_EVIDENCE';
const WORD_PROFILE_ID = 'word-mac-16.112-26081010';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function loadVerifier() {
  return import(pathToFileURL(SCRIPT_PATH).href);
}

test('G00 rebinds Google Docs current reality without inheriting Word 16.112 PASS', async () => {
  const verifier = await loadVerifier();
  const result = verifier.evaluateGoogleDocsG00DiscoveryBinding();
  const matrix = readJson(MATRIX_PATH);
  const receipt = readJson(RECEIPT_PATH);
  const googleProfiles = readJson(GOOGLE_PROFILE_REGISTRY_PATH);
  const terminal = readJson(TERMINAL_CLAIM_REGISTRY_PATH);

  assert.equal(result.status, 'PASS', result.issues.map((issue) => issue.code).join('\n'));
  assert.deepEqual(result.issues, []);

  assert.equal(matrix.status, STATUS);
  assert.equal(matrix.result, RESULT);
  assert.equal(matrix.currentWordBoundary.profileId, WORD_PROFILE_ID);
  assert.equal(matrix.currentWordBoundary.evidenceTransferToGoogleDocs, 'DENY');
  assert.equal(matrix.currentWordBoundary.wordScopeReady, true);
  assert.equal(matrix.currentWordBoundary.terminalPassClaimed, false);

  assert.equal(matrix.counts.totalCells, 13);
  assert.equal(matrix.counts.componentProven, 1);
  assert.equal(matrix.counts.physicalGoogleEvidence, 0);
  assert.equal(matrix.counts.productRuntimeWired, 0);
  assert.equal(matrix.counts.automaticApplyCertified, 0);
  assert.equal(matrix.counts.blocksGoogleStage, 12);
  assert.equal(matrix.counts.externalActivationRequired, 1);

  assert.equal(matrix.currentRealityAudit.realAdapterExists, false);
  assert.equal(matrix.currentRealityAudit.existingFlow, 'EVIDENCE_CLAIM_GATE_ONLY');
  assert.equal(matrix.currentRealityAudit.identityRevisionFence, 'NOT_ADMITTED_FOR_GOOGLE_RUNTIME');
  assert.equal(matrix.currentRealityAudit.quarantine, 'NOT_WIRED');
  assert.equal(matrix.currentRealityAudit.localCompatibilityVerdict, RESULT);
  assert.equal(matrix.currentRealityAudit.realAccountE2E, 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE');
  assert.equal(matrix.currentRealityAudit.roundtripLossMatrix.officeMode, 'ABSTAIN_NO_SIGNED_IN_E2E');
  assert.equal(matrix.currentRealityAudit.roundtripLossMatrix.nativeConversion, 'ABSTAIN_LOSSY_BY_DEFAULT_UNTIL_EVIDENCE');

  assert.equal(receipt.status, STATUS);
  assert.equal(receipt.result, RESULT);
  assert.equal(receipt.googleCurrentState.supportClaimed, false);
  assert.equal(receipt.googleCurrentState.importClaimed, false);
  assert.equal(receipt.googleCurrentState.roundtripClaimed, false);
  assert.equal(receipt.googleCurrentState.applyAuthorityClaimed, false);
  assert.equal(receipt.googleCurrentState.googleStageDone, false);
  assert.equal(receipt.googleCurrentState.realAccountE2E, 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE');

  assert.equal(googleProfiles.profiles.length, 2);
  for (const profile of googleProfiles.profiles) {
    assert.equal(profile.provider, 'google-docs');
    assert.equal(profile.class, 'DECLARED');
    assert.deepEqual(profile.evidenceHeads, []);
    assert.deepEqual(profile.ladder.completedRungs, []);
  }

  const googleClaimClasses = terminal.claims
    .filter((claim) => claim.evidenceBinding?.profileId?.startsWith('google-docs-'))
    .map((claim) => claim.claimClass)
    .sort();
  assert.deepEqual(googleClaimClasses, ['NOT_CLAIMED_BLOCKED', 'NOT_CLAIMED_BLOCKED']);
  assert.ok(terminal.terminalRollup.blockers.includes('GOOGLE_PROFILE_DECLARED:google-docs-office-mode-post-d1-v1'));
  assert.ok(terminal.terminalRollup.blockers.includes('GOOGLE_PROFILE_DECLARED:google-docs-native-conversion-post-d1-v1'));
});

test('G00 rejects false Google support, runtime/network authority, and Word evidence inheritance', async () => {
  const verifier = await loadVerifier();
  const matrix = readJson(MATRIX_PATH);
  const receipt = readJson(RECEIPT_PATH);
  const googleProfiles = readJson(GOOGLE_PROFILE_REGISTRY_PATH);
  const googleEvidenceStatus = readJson(GOOGLE_EVIDENCE_STATUS_PATH);
  const terminal = readJson(TERMINAL_CLAIM_REGISTRY_PATH);

  const falseSupportMatrix = clone(matrix);
  falseSupportMatrix.existingGoogleTruth.supportClaimed = true;
  falseSupportMatrix.existingGoogleTruth.roundtripClaimed = true;
  falseSupportMatrix.counts.physicalGoogleEvidence = 1;
  falseSupportMatrix.counts.productRuntimeWired = 1;
  falseSupportMatrix.rows.find((row) => row.cellId === 'google.officeModePhysicalRoundtrip').physicalEvidence = true;

  const falseSupportResult = verifier.evaluateGoogleDocsG00DiscoveryBinding({
    matrix: falseSupportMatrix,
    receipt,
    googleProfiles,
    googleEvidenceStatus,
    terminal,
  });

  const inheritedWordMatrix = clone(matrix);
  inheritedWordMatrix.currentWordBoundary.evidenceTransferToGoogleDocs = 'ALLOW';
  inheritedWordMatrix.currentWordBoundary.terminalPassClaimed = true;
  inheritedWordMatrix.currentRealityAudit.roundtripLossMatrix.officeMode = 'PASS_INHERITED_FROM_WORD';

  const inheritedWordResult = verifier.evaluateGoogleDocsG00DiscoveryBinding({
    matrix: inheritedWordMatrix,
    receipt,
    googleProfiles,
    googleEvidenceStatus,
    terminal,
  });

  const profileEvidenceRegistry = clone(googleProfiles);
  profileEvidenceRegistry.profiles[0].class = 'COMPETING_NOT_SATURATED';
  profileEvidenceRegistry.profiles[0].evidenceHeads = [{
    path: 'docs/OPS/RTK/WORD_MAC_16_112_PHYSICAL_WAVE300_RECEIPT.json',
    sha256: `sha256:${'0'.repeat(64)}`,
    editorMode: 'OFFICE_MODE',
  }];
  profileEvidenceRegistry.profiles[0].ladder.completedRungs = ['WAVE_300'];

  const profileEvidenceResult = verifier.evaluateGoogleDocsG00DiscoveryBinding({
    matrix,
    receipt,
    googleProfiles: profileEvidenceRegistry,
    googleEvidenceStatus,
    terminal,
  });

  assert.equal(falseSupportResult.status, 'FAIL');
  assert.equal(falseSupportResult.issues.some((issue) => issue.code === 'GOOGLE_G00_FALSE_SUPPORT_CLAIM'), true);
  assert.equal(falseSupportResult.issues.some((issue) => issue.code === 'GOOGLE_G00_MATRIX_COUNTS_INVALID'), true);

  assert.equal(inheritedWordResult.status, 'FAIL');
  assert.equal(inheritedWordResult.issues.some((issue) => issue.code === 'GOOGLE_G00_WORD_INHERITANCE_ATTEMPT'), true);

  assert.equal(profileEvidenceResult.status, 'FAIL');
  assert.equal(profileEvidenceResult.issues.some((issue) => issue.code === 'GOOGLE_G00_PROFILE_NOT_DECLARED_EMPTY'), true);
});

test('G00 source text keeps Google limitations explicit and bans support wording', () => {
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
    'Word 16.112 evidence is non-transferable to Google Docs.',
    'Real signed-in Google Docs E2E requires separate owner/account authority.',
  ]) {
    assert.match(combined, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }

  assert.doesNotMatch(combined, /\bGoogle Docs support is (?:available|supported|ready|complete)\b/iu);
  assert.doesNotMatch(combined, /\bGoogle Docs roundtrip is (?:available|supported|ready|complete)\b/iu);
  assert.doesNotMatch(combined, /\bWord 16\.112 (?:proves|certifies) Google Docs\b/iu);
});
