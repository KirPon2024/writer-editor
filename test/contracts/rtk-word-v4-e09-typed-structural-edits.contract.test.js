const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = 'scripts/ops/rtk-word-v4-e09-typed-structural-edits.mjs';
const RECEIPT_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E09_TYPED_STRUCTURAL_EDITS_RECEIPT.json';
const PROFILE_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json';
const PROGRAM_PATH = 'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json';

async function loadVerifier() {
  return import(pathToFileURL(path.join(REPO_ROOT, SCRIPT_PATH)).href);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
}

test('V4 E09 certifies structural diagnostic blocking without structural apply', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const result = verifier.evaluateWordV4E09TypedStructuralEdits({ receipt });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.issues, []);
  assert.equal(receipt.wordProfile.versionByBundle, '16.111.2');
  assert.equal(receipt.structuralTotals.physicalStructuralCases, 30);
  assert.equal(receipt.structuralTotals.totalStructureChanges, 31);
  assert.equal(receipt.structuralTotals.nativeMoveRevisionCases, 0);
  assert.equal(receipt.structuralTotals.nativeMoveRevisions, 0);
  assert.equal(receipt.structuralTotals.automaticStructuralApplyCertified, 0);
  assert.equal(receipt.structuralTotals.destructiveStructuralApplyAdded, 0);
});

test('V4 E09 binds paragraph move cross-scene complex boundary and Compare Combine cases', () => {
  const receipt = readJson(RECEIPT_PATH);
  const byId = new Map(receipt.structuralCertificationCases.map((item) => [item.caseId, item]));

  for (const caseId of ['WL2-005', 'WL2-006', 'WL2-007', 'WL2-008', 'WL2-020', 'WL2-024', 'WL2-025']) {
    const item = byId.get(caseId);
    assert.equal(item.wordStatus, 'PASS');
    assert.equal(item.parserStatus, 'PASS');
    assert.ok(item.reviewIrSummary.structureChanges > 0);
    assert.equal(item.classificationAuthority, 'MANUAL_OR_BLOCKED_ONLY');
  }

  assert.equal(byId.get('WL2-020').reviewIrSummary.structureChanges, 2);
  assert.equal(byId.get('WL2-020').structuralKinds.includes('tableSectionFootnoteEndnoteFieldBoundary'), true);
  assert.equal(byId.get('WL2-007').structuralKinds.includes('moveAttemptManualOnly'), true);
  assert.equal(byId.get('WL2-008').structuralKinds.includes('crossSceneMoveBlocked'), true);
  assert.equal(receipt.typedLimitations.includes('STRUCTURAL_APPLY_NOT_CERTIFIED_IN_E09'), true);
  assert.equal(receipt.typedLimitations.includes('NATIVE_MOVEFROM_MOVETO_NOT_OBSERVED_IN_E09'), true);
});

test('V4 E09 rejects structural false-green and native move overclaims', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const mutated = JSON.parse(JSON.stringify(receipt));
  mutated.structuralTotals.automaticStructuralApplyCertified = 1;
  mutated.structuralTotals.nativeMoveRevisionCases = 1;
  mutated.structuralTotals.nativeMoveRevisions = 2;
  mutated.runtimeClaims.automaticStructuralApplyAdded = true;
  mutated.runtimeClaims.writerAuthorityAdded = true;
  mutated.typedLimitations = mutated.typedLimitations.filter((item) => item !== 'STRUCTURAL_APPLY_NOT_CERTIFIED_IN_E09');

  const result = verifier.evaluateWordV4E09TypedStructuralEdits({ receipt: mutated });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E09_NATIVE_MOVE_OVERCLAIM'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E09_STRUCTURAL_APPLY_OVERCLAIM'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E09_RUNTIME_SCOPE_OVERCLAIM'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E09_TYPED_LIMITATIONS_MISSING'), true);
});

test('V4 E09 optional external evidence check verifies local T7 receipt only when present', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const externalPath = receipt.externalEvidence.externalReceiptPath;

  if (!fs.existsSync(externalPath)) {
    assert.equal(receipt.externalEvidence.externalFileAvailableAtReceiptCreation, true);
    return;
  }

  const result = verifier.evaluateWordV4E09TypedStructuralEdits({ receipt, requireExternal: true });
  assert.equal(result.status, 'PASS');
});

test('V4 E09 updates capability profile and program state without runtime changes', () => {
  const profile = readJson(PROFILE_PATH);
  const program = readJson(PROGRAM_PATH);
  const cell = profile.cells.find((item) => item.capabilityId === 'rtk.word.v4.typedStructuralDiagnostics');

  assert.equal(cell.state, 'PHYSICAL_WORD_PROVEN');
  assert.equal(cell.currentCapability, 'STRUCTURAL_DIAGNOSTIC_BLOCKING_WITH_TYPED_LIMITATIONS');
  assert.equal(cell.physicalWordEvidence, true);
  assert.equal(cell.acceptanceTest, 'test/contracts/rtk-word-v4-e09-typed-structural-edits.contract.test.js');
  assert.equal(cell.physicalTotals.physicalStructuralCases, 30);
  assert.equal(cell.physicalTotals.totalStructureChanges, 31);
  assert.equal(cell.physicalTotals.automaticStructuralApplyCertified, 0);
  assert.match(program.v4ExecutionState.status, /^EXECUTION_((09|1[01])_LOCAL_VERIFIED_READY_FOR_DELIVERY_CHAIN|12_(?:LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_WAVES|WAVE40_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_WAVE_100|WAVE100_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_WAVE_300|WAVE300_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_STABILITY_LIMITATION_AUDIT|STABILITY_LIMITATION_AUDIT_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_STABILITY_WAVE|STABILITY_WAVE300_REPEAT_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_LIMITATION_FOLLOWUP|WL2_031_HOSTILE_PACKAGE_TYPED_BLOCK_CONFIRMED_CONTINUE_REMAINING_WORD_LIMITATIONS))$/u);
  assert.equal(typeof program.v4ExecutionState.currentStage, 'string');
  assert.equal(typeof program.v4ExecutionState.nextStage, 'string');
  assert.equal(program.v4ExecutionState.typedStructuralDiagnosticsCertified, true);
  assert.equal(program.v4ExecutionState.automaticStructuralApplyCertified, 0);
  assert.equal(program.v4ExecutionState.runtimeApplyAuthorityGranted, false);
  assert.equal(program.v4ExecutionState.googleDocsOpened, false);
});
