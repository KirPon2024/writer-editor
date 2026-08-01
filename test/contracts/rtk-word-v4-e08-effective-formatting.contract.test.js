const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = 'scripts/ops/rtk-word-v4-e08-effective-formatting.mjs';
const RECEIPT_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E08_EFFECTIVE_FORMATTING_RECEIPT.json';
const PROFILE_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json';
const PROGRAM_PATH = 'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json';

async function loadVerifier() {
  return import(pathToFileURL(path.join(REPO_ROOT, SCRIPT_PATH)).href);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
}

test('V4 E08 certifies physical formatting diagnostic lane without apply authority', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const result = verifier.evaluateWordV4E08EffectiveFormatting({ receipt });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.issues, []);
  assert.equal(receipt.wordProfile.versionByBundle, '16.111.2');
  assert.equal(receipt.formattingTotals.physicalFormattingCases, 17);
  assert.equal(receipt.formattingTotals.totalFormattingDeltas, 117);
  assert.equal(receipt.formattingTotals.writerFormattingCases, 11);
  assert.equal(receipt.formattingTotals.writerFormattingDeltas, 26);
  assert.equal(receipt.formattingTotals.commentAnchorFormattingDeltas, 91);
  assert.equal(receipt.formattingTotals.automaticFormattingApplyCertified, 0);
  assert.equal(receipt.formattingTotals.destructiveFormattingApplyAdded, 0);
});

test('V4 E08 binds required Word formatting cases and typed manual limits', () => {
  const receipt = readJson(RECEIPT_PATH);
  const byId = new Map(receipt.formattingCertificationCases.map((item) => [item.caseId, item]));

  for (const caseId of ['WL2-018', 'WL2-019', 'WL2-021', 'WL2-026', 'WL2-030']) {
    const item = byId.get(caseId);
    assert.equal(item.wordStatus, 'PASS');
    assert.equal(item.parserStatus, 'PASS');
    assert.ok(item.reviewIrSummary.formattingDeltas > 0);
  }

  assert.equal(byId.get('WL2-018').reviewIrSummary.formattingDeltas, 4);
  assert.equal(byId.get('WL2-018').provenKinds.includes('rPr'), true);
  assert.equal(byId.get('WL2-019').provenKinds.includes('pPr'), true);
  assert.equal(byId.get('WL2-019').provenKinds.includes('hyperlink'), true);
  assert.equal(
    byId.get('WL2-019').limitations.includes('STYLE_LIST_HYPERLINK_SEMANTICS_SEE_PACKAGE_READBACK_MANUAL'),
    true,
  );
  assert.equal(receipt.typedLimitations.includes('FORMAT_APPLY_NOT_CERTIFIED_IN_E08'), true);
});

test('V4 E08 rejects formatting false-green and destructive authority mutations', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const mutated = JSON.parse(JSON.stringify(receipt));
  mutated.formattingTotals.automaticFormattingApplyCertified = 1;
  mutated.formattingTotals.destructiveFormattingApplyAdded = 1;
  mutated.runtimeClaims.automaticFormattingApplyAdded = true;
  mutated.runtimeClaims.writerAuthorityAdded = true;
  mutated.typedLimitations = mutated.typedLimitations.filter((item) => item !== 'FORMAT_APPLY_NOT_CERTIFIED_IN_E08');

  const result = verifier.evaluateWordV4E08EffectiveFormatting({ receipt: mutated });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E08_FORMATTING_APPLY_OVERCLAIM'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E08_RUNTIME_SCOPE_OVERCLAIM'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E08_TYPED_LIMITATIONS_MISSING'), true);
});

test('V4 E08 optional external evidence check verifies local T7 receipt only when present', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const externalPath = receipt.externalEvidence.externalReceiptPath;

  if (!fs.existsSync(externalPath)) {
    assert.equal(receipt.externalEvidence.externalFileAvailableAtReceiptCreation, true);
    return;
  }

  const result = verifier.evaluateWordV4E08EffectiveFormatting({ receipt, requireExternal: true });
  assert.equal(result.status, 'PASS');
});

test('V4 E08 updates capability profile and program state without runtime changes', () => {
  const profile = readJson(PROFILE_PATH);
  const program = readJson(PROGRAM_PATH);
  const cell = profile.cells.find((item) => item.capabilityId === 'rtk.word.v4.effectiveFormattingDiagnostics');

  assert.equal(cell.state, 'PHYSICAL_WORD_PROVEN');
  assert.ok([
    'FORMATTING_DIAGNOSTIC_LANE_WITH_TYPED_LIMITATIONS',
    'FORMATTING_DIAGNOSTIC_LANE_TERMINAL_TYPED_LIMITATION_BOUND',
  ].includes(cell.currentCapability));
  assert.equal(cell.physicalWordEvidence, true);
  assert.equal(cell.acceptanceTest, 'test/contracts/rtk-word-v4-e08-effective-formatting.contract.test.js');
  assert.equal(cell.physicalTotals.physicalFormattingCases, 17);
  assert.equal(cell.physicalTotals.totalFormattingDeltas, 117);
  assert.match(program.v4ExecutionState.status, /^(EXECUTION_((0[89]|1[01])_LOCAL_VERIFIED_READY_FOR_DELIVERY_CHAIN|03_A03_C01_COMMENT_SHADOW_RUNTIME_WIRED_READY_FOR_DELIVERY_CHAIN|03_A03_C02_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_CERTIFIED|12_(?:LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_WAVES|WAVE40_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_WAVE_100|WAVE100_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_WAVE_300|WAVE300_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_STABILITY_LIMITATION_AUDIT|STABILITY_LIMITATION_AUDIT_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_STABILITY_WAVE|STABILITY_WAVE300_REPEAT_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_LIMITATION_FOLLOWUP|WL2_031_HOSTILE_PACKAGE_TYPED_BLOCK_CONFIRMED_CONTINUE_REMAINING_WORD_LIMITATIONS|MODERN_COMMENT_APPLESCRIPT_LIMITATION_CONFIRMED_CONTINUE_CUSTOM_XML_AUTHORITY|CUSTOM_XML_AUTHORITY_REROUTED_CONTINUE_MULTI_SCENE_APPLY_CERTIFICATION|MULTI_SCENE_APPLY_TYPED_LIMITATION_CONFIRMED_CONTINUE_MODERN_COMMENT_NATIVE_UI|MODERN_COMMENT_NATIVE_UI_BLOCKED_EXTERNAL_ACCESSIBILITY_WAITING|A02_TERMINAL_AUDIT_COMPLETE_A03_READY))|WORD_P0_SAFE_FORMATTING_LANE_TYPED_LIMITATION_BOUND_NOT_SATURATED|WORD_NORMALIZED_CAPABILITY_MATRIX_BOUND_NOT_SATURATED)$/u);
  assert.equal(typeof program.v4ExecutionState.currentStage, 'string');
  assert.equal(typeof program.v4ExecutionState.nextStage, 'string');
  assert.equal(program.v4ExecutionState.effectiveFormattingCertified, true);
  assert.equal(program.v4ExecutionState.automaticFormattingApplyCertified, 0);
  if (program.v4ExecutionState.status === 'EXECUTION_03_A03_C02_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_CERTIFIED') {
    assert.equal(program.v4ExecutionState.runtimeApplyAuthorityScope, 'NON_OVERLAP_TRACKED_REPLACEMENT_PAIRS_ONLY');
  } else {
    assert.equal(program.v4ExecutionState.runtimeApplyAuthorityGrantedForFormatting === false || program.v4ExecutionState.runtimeApplyAuthorityGranted === false, true);
  }
  assert.equal(program.v4ExecutionState.googleDocsOpened, false);
});
