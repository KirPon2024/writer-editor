const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = 'scripts/ops/rtk-word-v4-e12-customxml-authority-followup.mjs';
const LEDGER_SCRIPT_PATH = 'scripts/ops/rtk-word-v4-e12-saturation-ledger.mjs';
const RECEIPT_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_CUSTOMXML_AUTHORITY_FOLLOWUP_RECEIPT.json';
const LEDGER_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json';
const PROFILE_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json';
const PROGRAM_PATH = 'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
}

async function loadVerifier() {
  return import(pathToFileURL(path.join(REPO_ROOT, SCRIPT_PATH)).href);
}

test('E12 customXml authority follow-up resolves mutating customXml loss by reroute only', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const result = verifier.evaluateWordV4E12CustomXmlAuthorityFollowup({ receipt, requireFiles: true });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.issues, []);
  assert.equal(receipt.authorityDecision.customXmlAuthorityAllowed, false);
  assert.equal(receipt.authorityDecision.customXmlResolvedByAllowlist, false);
  assert.equal(receipt.authorityDecision.selectedAuthorityCarrier, 'customDocumentProperty');
  assert.equal(receipt.authorityDecision.selectedPropertyName, 'YRTK_C01_AUTH');
  assert.equal(receipt.authorityDecision.parserAuthorityIntegrated, true);
  assert.equal(receipt.authorityDecision.yrtk2CoreImplemented, true);
  assert.equal(receipt.authorityDecision.runtimeApplyAuthorityExpanded, false);
  assert.equal(receipt.resolvedLimitations.includes('CUSTOM_XML_MUTATING_WORD_SAVE_DROPS_AUTHORITY'), true);
  assert.equal(receipt.remainingWordLimitations.includes('CUSTOM_XML_MUTATING_WORD_SAVE_DROPS_AUTHORITY'), false);
  assert.equal(receipt.saturated, false);
});

test('E12 customXml authority follow-up rejects customXml allowlist and runtime authority overclaims', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const mutated = JSON.parse(JSON.stringify(receipt));

  mutated.authorityDecision.customXmlAuthorityAllowed = true;
  mutated.authorityDecision.customXmlResolvedByAllowlist = true;
  mutated.authorityDecision.selectedAuthorityCarrier = 'customXmlManifest';
  mutated.runtimeClaims.automaticApplyExpanded = true;
  mutated.runtimeClaims.customXmlAuthorityAllowed = true;
  mutated.remainingWordLimitations.push('CUSTOM_XML_MUTATING_WORD_SAVE_DROPS_AUTHORITY');

  const result = verifier.evaluateWordV4E12CustomXmlAuthorityFollowup({ receipt: mutated });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E12_CUSTOMXML_DECISION_INVALID'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E12_CUSTOMXML_STILL_ACTIVE'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E12_CUSTOMXML_RUNTIME_OVERCLAIM'), true);
});

test('E12 saturation ledger binds customXml reroute and removes the old blocker without saturation claim', async () => {
  const ledgerVerifier = await import(pathToFileURL(path.join(REPO_ROOT, LEDGER_SCRIPT_PATH)).href);
  const ledger = readJson(LEDGER_PATH);
  const profile = readJson(PROFILE_PATH);
  const program = readJson(PROGRAM_PATH);
  const result = ledgerVerifier.evaluateWordV4E12SaturationLedger({
    receipt: ledger,
    profile,
    program,
    requireFiles: true,
  });
  const binding = ledger.evidenceBindings.find((item) => item.id === 'E12_CUSTOM_XML_AUTHORITY_REROUTE');

  assert.equal(result.status, 'PASS');
  assert.equal(binding.status, 'BOUND');
  assert.equal(binding.path, RECEIPT_PATH);
  assert.equal(ledger.coverageLedger.customXmlAuthorityFollowup.status, 'BOUND');
  assert.equal(ledger.notSaturatedReasons.includes('CUSTOM_XML_MUTATING_WORD_SAVE_DROPS_AUTHORITY'), false);
  assert.equal(ledger.saturationRule.saturated, false);
  assert.match(program.v4ExecutionState.nextStage, /^EXECUTION_(12_WORD_LIMITATION_FOLLOWUP_(MULTI_SCENE_APPLY_CERTIFICATION|MODERN_COMMENT_NATIVE_UI_CERTIFICATION)|12_A02_TERMINAL_WORD_AUDIT_AND_A03_PROMOTION_LIST|03_A03_SAFE_PORTABILITY_IMPROVEMENTS_RUNTIME_CONTOUR|03_A03_C02_NON_OVERLAP_TRACKED_REPLACEMENTS_RUNTIME_CONTOUR|03_A03_C03_ADJACENT_RANGE_NEGATIVE_ORACLE)$/u);
  assert.equal(program.v4ExecutionState.googleDocsOpened, false);
});
