const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_PRODUCT_VERTICAL_TRACKED_EDIT_RECEIPT.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-release-audit-p0-product-vertical-tracked-edit.mjs');
const SMOKE_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-release-audit-p0-product-originated-smoke-wave12.mjs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function loadEvaluator() {
  return import(pathToFileURL(SCRIPT_PATH).href);
}

test('P0 product vertical tracked edit receipt proves one physical product loop without saturation claim', async () => {
  const { evaluateWordReleaseAuditP0ProductVerticalTrackedEdit } = await loadEvaluator();
  const receipt = readJson(RECEIPT_PATH);
  const result = evaluateWordReleaseAuditP0ProductVerticalTrackedEdit({
    receipt,
    program: readJson(PROGRAM_PATH),
    profile: readJson(PROFILE_PATH),
    ledger: readJson(LEDGER_PATH),
  });

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.equal(result.observedCases, 1);
  assert.equal(result.productCommandHandlerOriginated, 1);
  assert.equal(result.physicalOpenEditSaveCloseReopenPass, 1);
  assert.equal(result.authenticatedV2IntakePass, 1);
  assert.equal(result.visiblePreviewPass, 1);
  assert.equal(result.explicitConfirmedApplyPass, 1);
  assert.equal(result.projectReopenReadbackPass, 1);
  assert.equal(result.replayIdempotentPass, 1);
  assert.equal(result.automaticApplyCertified, false);
  assert.equal(result.wordSaturated, false);
  assert.equal(result.googleDocsOpened, false);
});

test('P0 product vertical tracked edit receipt carries observed veto zeros and no silent preview mutation', () => {
  const receipt = readJson(RECEIPT_PATH);
  const caseResult = receipt.physicalCorpus.cases[0];

  assert.deepEqual(Object.values(receipt.vetoMetrics).filter((value) => Number(value) !== 0), []);
  assert.equal(caseResult.productLoop.manuscriptMutationDuringAnalysisOrPreview, false);
  assert.equal(caseResult.productLoop.commandPayloadPreviewConfirmed, true);
  assert.equal(caseResult.productLoop.writerCalled, true);
  assert.equal(caseResult.productLoop.sceneMatchesExpectedAfterApply, true);
  assert.equal(caseResult.productLoop.projectReopenReadbackMatchesExpected, true);
  assert.equal(caseResult.productLoop.replayIdempotent, true);
  assert.equal(caseResult.productLoop.liveElectronUiClicked, false);
  assert.equal(receipt.implementedCapability.liveElectronUiPhysicalClickProven, false);
});

test('P0 product vertical tracked edit evaluator rejects auto-apply and saturation overclaims', async () => {
  const { evaluateWordReleaseAuditP0ProductVerticalTrackedEdit } = await loadEvaluator();
  const receipt = readJson(RECEIPT_PATH);
  const program = readJson(PROGRAM_PATH);
  const profile = readJson(PROFILE_PATH);
  const ledger = readJson(LEDGER_PATH);

  const overclaimed = JSON.parse(JSON.stringify(receipt));
  overclaimed.implementedCapability.automaticApplyCertified = true;
  overclaimed.implementedCapability.wordSaturated = true;

  const result = evaluateWordReleaseAuditP0ProductVerticalTrackedEdit({
    receipt: overclaimed,
    program,
    profile,
    ledger,
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === 'RTK_P0_PRODUCT_VERTICAL_OVERCLAIM'));
});

test('P0 product vertical tracked edit runner is based on physical smoke helpers and does not rewrite exporter carrier', () => {
  const source = fs.readFileSync(SCRIPT_PATH, 'utf8');
  const smokeSource = fs.readFileSync(SMOKE_SCRIPT_PATH, 'utf8');

  assert.match(source, /runProductExport/u);
  assert.match(source, /runAppleScript/u);
  assert.match(source, /set content of \(create range yDoc start \$\{oldStart\} end \$\{oldEnd\}\)/u);
  assert.match(source, /handleDocxReviewPreviewSessionActivationCommandSurface/u);
  assert.match(source, /handleReviewSurfaceApplyExactTextChangeCommandSurface/u);
  assert.match(source, /automaticApplyCertified:\s*false/u);
  assert.doesNotMatch(source, /Google Docs|google docs/u);
  assert.match(smokeSource, /export\s*\{/u);
  for (const helperName of ['buildProductExportSource', 'runProductExport', 'runAppleScript']) {
    assert.match(smokeSource, new RegExp(`\\b${helperName}\\b`, 'u'));
  }
});
