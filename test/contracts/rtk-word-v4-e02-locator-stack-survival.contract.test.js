const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E02_LOCATOR_STACK_SURVIVAL_RECEIPT.json');
const C01_RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_C01_LOCATOR_CARRIER_RECEIPT.json');
const CAPABILITY_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const LAB_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-v4-e02-locator-stack-survival.mjs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function loadLab() {
  return import(pathToFileURL(LAB_PATH).href);
}

test('V4 E02 binds physical C01 locator survival without selecting a fragile carrier by opinion', async () => {
  const lab = await loadLab();
  const receipt = readJson(RECEIPT_PATH);
  const c01 = readJson(C01_RECEIPT_PATH);
  const result = await lab.evaluateV4E02LocatorStackSurvival({ receipt, c01Receipt: c01 });

  assert.equal(result.ok, true);
  assert.equal(receipt.status, 'PASS_READY_FOR_DELIVERY_CHAIN');
  assert.equal(receipt.physicalEvidence.sourceReceiptSha256, sha256File(C01_RECEIPT_PATH));
  assert.equal(receipt.physicalEvidence.caseCount, 5);
  assert.equal(receipt.physicalEvidence.mutatingCaseCount, 4);
  assert.equal(receipt.physicalEvidence.wordCreatedBaseDocx, true);
  assert.equal(receipt.physicalEvidence.openEditSaveCloseReopenAllPass, true);
  assert.equal(receipt.selectedCarrier.carrier, 'customDocumentProperty');
  assert.equal(receipt.selectedCarrier.selectedFromPhysicalEvidence, true);
  assert.equal(receipt.selectedCarrier.authorityRole, 'SIGNED_LOCATOR_PAYLOAD_CARRIER_NOT_PLACEMENT_AUTHORITY');
});

test('V4 E02 keeps customXml, docVars, bookmarks, SDT and paraIds out of apply authority', () => {
  const receipt = readJson(RECEIPT_PATH);
  const rejected = new Map(receipt.rejectedAuthorityCarriers.map((item) => [item.carrier, item]));

  assert.equal(rejected.get('customXmlManifest').reasonCode, 'V4_E02_CUSTOM_XML_DROPPED_AFTER_MUTATING_WORD_SAVE');
  assert.equal(rejected.get('settingsDocVar').authorityAllowed, false);
  assert.equal(rejected.get('hiddenRun').authorityAllowed, false);
  assert.equal(rejected.get('bookmarkName').authorityAllowed, false);
  assert.equal(rejected.get('sdtTag').authorityAllowed, false);
  assert.equal(receipt.placementSignals.every((item) => item.applyAuthority === false), true);
  assert.equal(receipt.placementSignals.some((item) => item.signal === 'w14ParaIdTextId'), true);
});

test('V4 E02 updates capability truth but does not claim YRTK2 runtime authority or Word saturation', () => {
  const receipt = readJson(RECEIPT_PATH);
  const capability = readJson(CAPABILITY_PATH);
  const program = readJson(PROGRAM_PATH);
  const cell = capability.cells.find((item) => item.capabilityId === 'rtk.word.v4.locatorSurvivalLab');

  assert.equal(cell.state, 'PHYSICAL_WORD_PROVEN');
  assert.equal(cell.physicalWordEvidence, true);
  assert.equal(cell.currentCapability, 'AUTHORITY_PAYLOAD_CARRIER_PROVEN_NOT_RUNTIME_APPLY');
  assert.equal(cell.provenCarrier, 'customDocumentProperty');
  assert.equal(receipt.selectedCarrier.requiresYrtk2BeforeRuntimeAuthority, true);
  assert.equal(receipt.runtimeClaims.automaticApplyExpanded, false);
  assert.equal(receipt.runtimeClaims.parserAuthorityIntegrated, false);
  assert.equal(program.v4ExecutionState.currentStage, 'EXECUTION_02_LOCATOR_STACK_SURVIVAL_LAB');
  assert.equal(program.v4ExecutionState.nextStage, 'EXECUTION_03_COREMANIFEST_EXPORTMAP_HASHTREE_YRTK2');
  assert.equal(program.v4ExecutionState.wordSaturationCurrentFocus, true);
  assert.equal(program.v4ExecutionState.googleDocsOpened, false);
});

test('V4 E02 negative contract blocks broad claims and stale evidence', async () => {
  const lab = await loadLab();
  const receipt = readJson(RECEIPT_PATH);

  const staleHash = structuredClone(receipt);
  staleHash.physicalEvidence.sourceReceiptSha256 = '0'.repeat(64);
  assert((await lab.evaluateV4E02LocatorStackSurvival({ receipt: staleHash })).issues.some((item) => (
    item.code === 'V4_E02_C01_RECEIPT_HASH_MISMATCH'
  )));

  const customXmlSelected = structuredClone(receipt);
  customXmlSelected.selectedCarrier.carrier = 'customXmlManifest';
  assert((await lab.evaluateV4E02LocatorStackSurvival({ receipt: customXmlSelected })).issues.some((item) => (
    item.code === 'V4_E02_SELECTED_CARRIER_NOT_C01_VIABLE'
  )));

  const overclaim = structuredClone(receipt);
  overclaim.selectedCarrier.authorityRole = 'PLACEMENT_AND_APPLY_AUTHORITY';
  assert((await lab.evaluateV4E02LocatorStackSurvival({ receipt: overclaim })).issues.some((item) => (
    item.code === 'V4_E02_AUTHORITY_ROLE_OVERCLAIM'
  )));

  const runtimeClaim = structuredClone(receipt);
  runtimeClaim.runtimeClaims.automaticApplyExpanded = true;
  assert((await lab.evaluateV4E02LocatorStackSurvival({ receipt: runtimeClaim })).issues.some((item) => (
    item.code === 'V4_E02_RUNTIME_SCOPE_OVERCLAIM'
  )));

  const googleOpened = structuredClone(receipt);
  googleOpened.sequencing.googleDocsOpened = true;
  assert((await lab.evaluateV4E02LocatorStackSurvival({ receipt: googleOpened })).issues.some((item) => (
    item.code === 'V4_E02_SEQUENCE_DRIFT'
  )));
});

test('V4 E02 CLI verifies committed receipt without requiring Word in CI', () => {
  const output = execFileSync(process.execPath, [LAB_PATH], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const parsed = JSON.parse(output);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.status, 'PASS');
  assert.equal(parsed.selectedCarrier, 'customDocumentProperty');
  assert.equal(parsed.sourceC01Status, 'PASS');
});
