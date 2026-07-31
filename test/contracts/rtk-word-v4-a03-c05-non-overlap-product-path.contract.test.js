const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-v4-a03-c05-non-overlap-product-path.mjs');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_C05_NON_OVERLAP_PRODUCT_PATH_RECEIPT.json');
const PROMOTION_LIST_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_PROMOTION_LIST.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function loadScript() {
  return import(pathToFileURL(SCRIPT_PATH).href);
}

test('A03 C05 verifier binds product path without release-level automatic apply overclaim', async () => {
  const mod = await loadScript();
  const result = mod.evaluateWordV4A03C05NonOverlapProductPath({
    receipt: readJson(RECEIPT_PATH),
    promotionList: readJson(PROMOTION_LIST_PATH),
    profile: readJson(PROFILE_PATH),
    program: readJson(PROGRAM_PATH),
    ledger: readJson(LEDGER_PATH),
  });

  assert.equal(result.status, 'PASS', JSON.stringify(result, null, 2));
  assert.equal(result.productRuntimeWired, true);
  assert.equal(result.automaticApplyCertified, false);
  assert.equal(result.releaseReady, false);
});

test('A03 C05 verifier fails if product path wiring is downgraded or overclaimed', async () => {
  const mod = await loadScript();
  const receipt = readJson(RECEIPT_PATH);
  const promotionList = readJson(PROMOTION_LIST_PATH);
  const profile = readJson(PROFILE_PATH);
  const program = readJson(PROGRAM_PATH);
  const ledger = readJson(LEDGER_PATH);

  const row = promotionList.rows.find((item) => item.capability === 'nonOverlapTrackedReplacementRuntimeApply');
  row.authorityLevel.productRuntimeWired = false;
  let result = mod.evaluateWordV4A03C05NonOverlapProductPath({
    receipt,
    promotionList,
    profile,
    program,
    ledger,
  });
  assert.equal(result.status, 'FAIL');
  assert.equal(
    result.issues.some((issue) => issue.code === 'RTK_A03_C05_PROMOTION_ROW_INVALID'),
    true,
  );

  row.authorityLevel.productRuntimeWired = true;
  receipt.implementedCapability.automaticApplyCertified = true;
  result = mod.evaluateWordV4A03C05NonOverlapProductPath({
    receipt,
    promotionList,
    profile,
    program,
    ledger,
  });
  assert.equal(result.status, 'FAIL');
  assert.equal(
    result.issues.some((issue) => issue.code === 'RTK_A03_C05_AUTHORITY_INVALID'),
    true,
  );
});
