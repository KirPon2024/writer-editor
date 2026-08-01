const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_FORMAT_UNICODE_STRUCTURE_STRESS_RECEIPT.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-release-audit-p0-format-unicode-structure-stress.mjs');

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

test('P0 format Unicode structure stress receipt verifies bounded physical product loop', async () => {
  const { evaluateWordReleaseAuditP0FormatUnicodeStructureStress } = await loadEvaluator();
  const receipt = readJson(RECEIPT_PATH);
  const result = evaluateWordReleaseAuditP0FormatUnicodeStructureStress({
    receipt,
    program: readJson(PROGRAM_PATH),
    profile: readJson(PROFILE_PATH),
    ledger: readJson(LEDGER_PATH),
  });

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.equal(result.observedCases, 36);
  assert.equal(result.passCases, 36);
  assert.equal(result.unicodeTrackedReplacementApplyPass, 12);
  assert.equal(result.formattingDiagnosticPass, 12);
  assert.equal(result.structuralDiagnosticPass, 12);
  assert.deepEqual(zeroValues(receipt.vetoMetrics), []);
  assert.equal(receipt.implementedCapability.automaticApplyCertified, false);
  assert.equal(receipt.implementedCapability.automaticFormattingApplyCertified, false);
  assert.equal(receipt.implementedCapability.automaticStructuralApplyCertified, false);
  assert.equal(receipt.implementedCapability.wordSaturated, false);
  assert.equal(receipt.implementedCapability.googleDocsOpened, false);
});

test('P0 format Unicode structure stress covers each family without false authority', () => {
  const receipt = readJson(RECEIPT_PATH);
  const unicodeCases = receipt.physicalCorpus.productCases.filter((item) => item.waveFamily === 'unicode-tracked-replacement');
  const formattingCases = receipt.physicalCorpus.productCases.filter((item) => item.waveFamily?.startsWith('formatting'));
  const structuralCases = receipt.physicalCorpus.productCases.filter((item) => item.waveFamily === 'paragraph-structure-diagnostic');

  assert.equal(unicodeCases.length, 12);
  assert.equal(formattingCases.length, 12);
  assert.equal(structuralCases.length, 12);
  assert.equal(unicodeCases.every((item) => item.productLoop.replacementSemanticsVerified === true), true);
  assert.equal(unicodeCases.every((item) => item.productLoop.explicitUserConfirmedCommandApply === true), true);
  assert.equal(formattingCases.every((item) => item.productLoop.formattingDiagnosticsVerified === true), true);
  assert.equal(formattingCases.every((item) => item.productLoop.writerCalled === false), true);
  assert.equal(formattingCases.every((item) => item.productLoop.explicitUserConfirmedCommandApply === false), true);
  assert.equal(structuralCases.every((item) => item.productLoop.structuralDiagnosticsVerified === true), true);
  assert.equal(structuralCases.every((item) => item.productLoop.writerCalled === false), true);
  assert.equal(structuralCases.every((item) => item.productLoop.explicitUserConfirmedCommandApply === false), true);
});

test('P0 format Unicode structure stress uses product path and current Word only', () => {
  const receipt = readJson(RECEIPT_PATH);
  const scriptSource = fs.readFileSync(SCRIPT_PATH, 'utf8');

  assert.equal(receipt.physicalCorpus.liveElectronUiExportSurfaceClick.ok, true);
  assert.equal(receipt.physicalCorpus.liveElectronUiExportSurfaceClick.result.clicked, true);
  assert.equal(receipt.physicalCorpus.liveElectronUiExportSurfaceClick.userDocumentsTouched, false);
  assert.deepEqual(receipt.physicalCorpus.liveElectronUiExportSurfaceClick.networkRequests, []);
  assert.equal(receipt.implementedCapability.productRuntimeWired, true);
  assert.equal(receipt.wordProfile.versionByBundle, '16.111.2');
  assert.equal(receipt.physicalCorpus.productCases.every((item) => item.export.productCommandHandlerOriginated === true), true);
  assert.equal(receipt.physicalCorpus.productCases.every((item) => item.productLoop.returnIntakeAuthenticated === true), true);
  assert.equal(receipt.physicalCorpus.productCases.every((item) => item.productLoop.visiblePreviewReady === true), true);
  assert.doesNotMatch(scriptSource, /openGoogle|docs\.google|LibreOffice|ONLYOFFICE|Apple Pages|WPS/u);
});

test('P0 format Unicode structure evaluator rejects saturation auto-apply and count drift', async () => {
  const { evaluateWordReleaseAuditP0FormatUnicodeStructureStress } = await loadEvaluator();
  const base = {
    receipt: readJson(RECEIPT_PATH),
    program: readJson(PROGRAM_PATH),
    profile: readJson(PROFILE_PATH),
    ledger: readJson(LEDGER_PATH),
  };

  const overclaimed = clone(base.receipt);
  overclaimed.implementedCapability.automaticApplyCertified = true;
  overclaimed.implementedCapability.automaticFormattingApplyCertified = true;
  overclaimed.implementedCapability.wordSaturated = true;
  assert.equal(evaluateWordReleaseAuditP0FormatUnicodeStructureStress({
    ...base,
    receipt: overclaimed,
  }).ok, false);

  const missingFamily = clone(base.receipt);
  missingFamily.totals.formattingDiagnosticPass = 11;
  assert.equal(evaluateWordReleaseAuditP0FormatUnicodeStructureStress({
    ...base,
    receipt: missingFamily,
  }).ok, false);

  const vetoed = clone(base.receipt);
  vetoed.vetoMetrics.structuralApplyOverclaim = 1;
  assert.equal(evaluateWordReleaseAuditP0FormatUnicodeStructureStress({
    ...base,
    receipt: vetoed,
  }).ok, false);
});

test('P0 format Unicode structure state bindings are exact and non-terminal', () => {
  const receipt = readJson(RECEIPT_PATH);
  const program = readJson(PROGRAM_PATH);
  const profile = readJson(PROFILE_PATH);
  const ledger = readJson(LEDGER_PATH);

  assert.equal(program.releaseAuditNight01.latestFormatUnicodeStructureStressReceiptPath, 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_FORMAT_UNICODE_STRUCTURE_STRESS_RECEIPT.json');
  assert.equal(program.releaseAuditNight01.formatUnicodeStructureStressComplete, true);
  assert.equal(program.releaseAuditNight01.nextStage, receipt.nextStage);
  assert.equal(program.releaseAuditNight01.wordSaturated, false);
  assert.equal(profile.latestProductFormatUnicodeStructureStress.receiptPath, program.releaseAuditNight01.latestFormatUnicodeStructureStressReceiptPath);
  assert.equal(profile.latestProductFormatUnicodeStructureStress.automaticApplyCertified, false);
  assert.equal(ledger.coverageLedger.releaseAuditNight01P0FormatUnicodeStructureStress.passCases, 36);
  assert.equal(ledger.runtimeClaims.wordSaturated, false);
  assert.equal(ledger.runtimeClaims.googleDocsOpened, false);
});
