const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = 'scripts/ops/rtk-word-v4-e06-physical-text-certification.mjs';
const RECEIPT_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E06_PHYSICAL_TEXT_CERTIFICATION_RECEIPT.json';
const PROFILE_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json';
const PROGRAM_PATH = 'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json';

async function loadVerifier() {
  return import(pathToFileURL(path.join(REPO_ROOT, SCRIPT_PATH)).href);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
}

test('V4 E06 receipt binds physical Word 16.111.2 text corpus without overclaiming exact authority', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const result = verifier.evaluateWordV4E06PhysicalTextCertification({ receipt });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.issues, []);
  assert.equal(receipt.wordProfile.versionByBundle, '16.111.2');
  assert.equal(receipt.wordProfile.versionByAppleScript, '16.111.2');
  assert.equal(receipt.physicalTextTotals.physicalRoundTrips, 32);
  assert.equal(receipt.physicalTextTotals.physicalOpenEditSaveCloseReopenPass, 32);
  assert.equal(receipt.physicalTextTotals.parserPass, 31);
  assert.equal(receipt.physicalTextTotals.exactAutomaticCandidates, 0);
  assert.equal(receipt.runtimeClaims.automaticApplyExpanded, false);
  assert.equal(receipt.runtimeClaims.writerAuthorityAdded, false);
  assert.equal(receipt.vetoMetrics.falseExact, 0);
  assert.equal(receipt.vetoMetrics.silentApply, 0);
  assert.equal(receipt.vetoMetrics.wrongSceneRouting, 0);
  assert.equal(receipt.vetoMetrics.replayFailure, 0);
});

test('V4 E06 requires concrete text, scale, ambiguity, hostile, and locator survival cases', async () => {
  const receipt = readJson(RECEIPT_PATH);
  const byId = new Map(receipt.textCertificationCases.map((item) => [item.caseId, item]));

  for (const caseId of ['WL2-001', 'WL2-002', 'WL2-003', 'WL2-004', 'WL2-005', 'WL2-006', 'WL2-009', 'WL2-010', 'WL2-021', 'WL2-026', 'WL2-027', 'WL2-030', 'WL2-031', 'WL2-032']) {
    assert.equal(byId.has(caseId), true, `${caseId} must be committed in the E06 receipt`);
  }
  assert.equal(byId.get('WL2-004').title, 'repeated passages attack locator ambiguity');
  assert.equal(byId.get('WL2-026').returnedBytes > 100000, true);
  assert.equal(byId.get('WL2-027').returnedBytes > 200000, true);
  assert.equal(byId.get('WL2-031').parserStatus, 'BLOCKED');
  assert.equal(byId.get('WL2-030').limitations.includes('SUPPORTED_APPLY_REEXPORT_ORACLE_REMAINS_BLOCKED_WHEN_SIGNED_LOCATOR_DROPS'), true);

  for (const [caseId, item] of byId) {
    assert.match(item.sourceDocxSha256, /^sha256:[0-9a-f]{64}$/u, `${caseId} source digest`);
    assert.match(item.returnedDocxSha256, /^sha256:[0-9a-f]{64}$/u, `${caseId} returned digest`);
    assert.equal(item.exactAutomaticCandidateCount, 0);
  }
});

test('V4 E06 rejects false green mutations in committed receipt truth', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const mutated = JSON.parse(JSON.stringify(receipt));
  mutated.physicalTextTotals.exactAutomaticCandidates = 1;
  mutated.runtimeClaims.automaticApplyExpanded = true;
  mutated.textCertificationCases.find((item) => item.caseId === 'WL2-031').parserStatus = 'PASS';

  const result = verifier.evaluateWordV4E06PhysicalTextCertification({ receipt: mutated });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E06_EXACT_OVERCLAIM'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E06_RUNTIME_SCOPE_OVERCLAIM'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E06_HOSTILE_NOT_BLOCKED'), true);
});

test('V4 E06 optional external evidence check verifies local T7 receipt only when present', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const externalPath = receipt.externalEvidence.externalReceiptPath;

  if (!fs.existsSync(externalPath)) {
    assert.equal(receipt.externalEvidence.externalFileAvailableAtReceiptCreation, true);
    return;
  }

  const result = verifier.evaluateWordV4E06PhysicalTextCertification({ receipt, requireExternal: true });
  assert.equal(result.status, 'PASS');
});

test('V4 E06 updates capability profile and program state without starting Google or runtime writes', () => {
  const profile = readJson(PROFILE_PATH);
  const program = readJson(PROGRAM_PATH);
  const cell = profile.cells.find((item) => item.capabilityId === 'rtk.word.v4.physicalTextCertification');

  assert.equal(cell.state, 'PHYSICAL_WORD_PROVEN');
  assert.equal(cell.physicalWordEvidence, true);
  assert.equal(cell.currentCapability, 'WORD_16_111_2_TEXT_CORPUS_PHYSICAL_PASS_NO_EXACT_AUTHORITY_EXPANSION');
  assert.equal(cell.acceptanceTest, 'test/contracts/rtk-word-v4-e06-physical-text-certification.contract.test.js');
  assert.match(program.v4ExecutionState.status, /^EXECUTION_((0[6789]|1[01])_LOCAL_VERIFIED_READY_FOR_DELIVERY_CHAIN|12_(?:LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_WAVES|WAVE40_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_WAVE_100|WAVE100_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_WAVE_300|WAVE300_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_STABILITY_LIMITATION_AUDIT|STABILITY_LIMITATION_AUDIT_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_STABILITY_WAVE|STABILITY_WAVE300_REPEAT_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_LIMITATION_FOLLOWUP|WL2_031_HOSTILE_PACKAGE_TYPED_BLOCK_CONFIRMED_CONTINUE_REMAINING_WORD_LIMITATIONS|MODERN_COMMENT_APPLESCRIPT_LIMITATION_CONFIRMED_CONTINUE_CUSTOM_XML_AUTHORITY|CUSTOM_XML_AUTHORITY_REROUTED_CONTINUE_MULTI_SCENE_APPLY_CERTIFICATION))$/u);
  assert.equal(typeof program.v4ExecutionState.currentStage, 'string');
  assert.equal(program.v4ExecutionState.physicalTextCertificationProven, true);
  assert.equal(program.v4ExecutionState.runtimeApplyAuthorityGranted, false);
  assert.equal(program.v4ExecutionState.googleDocsOpened, false);
});
