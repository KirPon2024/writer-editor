const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_VARIED_WAVE64_PRODUCT_LOOP_RECEIPT.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-release-audit-p0-varied-wave64-product-loop.mjs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function zeroValues(object) {
  return Object.values(object || {}).filter((value) => Number(value) !== 0);
}

async function loadEvaluator() {
  return import(pathToFileURL(SCRIPT_PATH).href);
}

test('P0 varied wave64 receipt proves bounded physical product loop without saturation', async () => {
  const { evaluateWordReleaseAuditP0VariedWave64ProductLoop } = await loadEvaluator();
  const receipt = readJson(RECEIPT_PATH);
  const result = evaluateWordReleaseAuditP0VariedWave64ProductLoop({
    receipt,
    program: readJson(PROGRAM_PATH),
    profile: readJson(PROFILE_PATH),
    ledger: readJson(LEDGER_PATH),
  });

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.equal(result.observedCases, 64);
  assert.equal(result.passCases, 64);
  assert.equal(result.physicalWordPass, 64);
  assert.deepEqual(zeroValues(receipt.vetoMetrics), []);
  assert.equal(receipt.implementedCapability.automaticApplyCertified, false);
  assert.equal(receipt.implementedCapability.wordSaturated, false);
  assert.equal(receipt.implementedCapability.googleDocsOpened, false);
});

test('P0 varied wave64 covers tracked replacements comments deletes and varied text contexts', () => {
  const receipt = readJson(RECEIPT_PATH);
  assert.equal(receipt.totals.actionCounts['mixed-comment-replace'], 32);
  assert.equal(receipt.totals.actionCounts['root-comment'], 16);
  assert.equal(receipt.totals.actionCounts['comment-delete'], 16);
  assert.equal(receipt.totals.familyCounts['paragraph-context'], 22);
  assert.equal(receipt.totals.familyCounts['unicode-context'], 21);
  assert.equal(receipt.totals.familyCounts['punctuation-spacing-context'], 21);
  assert.equal(receipt.totals.explicitConfirmedApplyPass, 32);
  assert.equal(receipt.totals.commentShadowPass, 64);
  assert.equal(receipt.totals.projectReopenReadbackPass, 64);
  assert.equal(receipt.totals.replayIdempotentPass, 64);
});

test('P0 varied wave64 product path stays explicit and Word-only', () => {
  const receipt = readJson(RECEIPT_PATH);
  const scriptSource = fs.readFileSync(SCRIPT_PATH, 'utf8');
  const commandIds = receipt.physicalCorpus.productCases.flatMap((item) => item.productLoop.commandKernelCommandIds || []);

  assert.equal(receipt.physicalCorpus.liveElectronUiExportSurfaceClick.ok, true);
  assert.equal(commandIds.includes('cmd.rtk.review.applyNonOverlapTrackedReplacements'), true);
  assert.equal(commandIds.includes('cmd.rtk.reviewSession.importComments'), true);
  assert.equal(commandIds.includes('cmd.rtk.review.applyMultiSceneNonOverlapTrackedReplacements'), false);
  assert.equal(receipt.physicalCorpus.productCases.every((item) => item.export.productCommandHandlerOriginated === true), true);
  assert.equal(receipt.physicalCorpus.productCases.every((item) => item.productLoop.manuscriptMutationDuringAnalysisOrPreview === false), true);
  assert.doesNotMatch(scriptSource, /openGoogle|docs\.google|LibreOffice|ONLYOFFICE|Apple Pages|WPS/u);
});

