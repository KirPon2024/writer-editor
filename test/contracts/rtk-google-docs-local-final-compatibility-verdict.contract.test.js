const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const receiptPath = path.join(repoRoot, 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_V1_RECEIPT.json');
const matrixPath = path.join(repoRoot, 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json');
const discoveryPath = path.join(repoRoot, 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json');
const registryPath = path.join(repoRoot, 'docs/OPS/RTK/GOOGLE_BUILD_PROFILE_REGISTRY_V1.json');
const catalogPath = path.join(repoRoot, 'docs/OPS/RTK/RTK_TEST_GRAPH_CATALOG_V1.json');

function readJson(absPath) {
  return JSON.parse(fs.readFileSync(absPath, 'utf8'));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function receiptDigest(relativePath) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(path.join(repoRoot, relativePath))).digest('hex')}`;
}

let implementation;
let model;

test.before(async () => {
  implementation = await import('../../scripts/ops/rtk-google-docs-local-final-compatibility-verdict-v1.mjs');
  model = await import('../../scripts/ops/rtk-google-docs-local-final-compatibility-verdict-model.mjs');
});

test('Google Docs local final compatibility verdict accepts only exact local-only NEEDS_MORE_EVIDENCE packet', () => {
  const {
    buildGoogleDocsLocalFinalCompatibilityVerdictPacket,
    evaluateGoogleDocsLocalFinalCompatibilityVerdict,
    sha256Text,
  } = implementation;
  const packet = buildGoogleDocsLocalFinalCompatibilityVerdictPacket();
  const result = evaluateGoogleDocsLocalFinalCompatibilityVerdict(packet);

  assert.equal(result.ok, true);
  assert.equal(result.status, 'GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_V1_LOCAL_VERIFIED');
  assert.equal(result.verdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(result.localCompatibilityVerdict, 'LOCAL_COMPATIBILITY_NEEDS_REAL_GOOGLE_E2E');
  assert.equal(result.realAccountE2E, 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE');
  assert.equal(result.supportClaimed, false);
  assert.equal(result.importClaimed, false);
  assert.equal(result.roundtripClaimed, false);
  assert.equal(result.applyAuthority, 'DENY');
  assert.equal(result.productMutationAuthority, 'DENY');
  assert.equal(result.physicalGoogleEvidence, 0);
  assert.equal(result.productRuntimeWired, 0);
  assert.equal(result.wordEvidenceTransferred, false);
  assert.deepEqual(result.denominators, {
    requiredLocalContours: 7,
    includedLocalContours: 7,
    realGoogleE2ERequired: 1,
    realGoogleE2ECompleted: 0,
    supportClaims: 0,
    importClaims: 0,
    roundtripClaims: 0,
    applyAdmissions: 0,
    productMutations: 0,
  });
  assert.equal(result.packetDigest, `sha256:${sha256Text(stableJson(packet))}`);
});

test('Google Docs local final compatibility verdict rejects overclaims, hash drift, inherited evidence, and UNKNOWN/ABSTAIN as PASS', () => {
  const { runHostileCorpus } = model;
  const hostile = runHostileCorpus();

  assert.equal(hostile.total, 40);
  assert.equal(hostile.survivors, 0);
  assert.equal(hostile.results.every((entry) => entry.ok === true), true);
  assert.equal(hostile.reasonCounts.GOOGLE_FINAL_VERDICT_SUPPORT_OVERCLAIM > 0, true);
  assert.equal(hostile.reasonCounts.GOOGLE_FINAL_VERDICT_IMPORT_OVERCLAIM > 0, true);
  assert.equal(hostile.reasonCounts.GOOGLE_FINAL_VERDICT_ROUNDTRIP_OVERCLAIM > 0, true);
  assert.equal(hostile.reasonCounts.GOOGLE_FINAL_VERDICT_APPLY_OVERCLAIM > 0, true);
  assert.equal(hostile.reasonCounts.GOOGLE_FINAL_VERDICT_PRODUCT_MUTATION_OVERCLAIM > 0, true);
  assert.equal(hostile.reasonCounts.GOOGLE_FINAL_VERDICT_RECEIPT_HASH_MISMATCH > 0, true);
  assert.equal(hostile.reasonCounts.GOOGLE_FINAL_VERDICT_WORD_EVIDENCE_TRANSFER > 0, true);
  assert.equal(hostile.reasonCounts.GOOGLE_FINAL_VERDICT_UNKNOWN_ABSTAIN_NOT_PASS > 0, true);
});

test('Google Docs local final compatibility finite model and mutation catalog are closed', () => {
  const { runFiniteModel, runSemanticMutationCatalog } = model;
  const finite = runFiniteModel();
  const mutants = runSemanticMutationCatalog();

  assert.equal(finite.total, 1);
  assert.equal(finite.accepted, 1);
  assert.equal(finite.rejected, 0);
  assert.equal(finite.mismatches, 0);
  assert.equal(mutants.total, 28);
  assert.equal(mutants.survivors, 0);
});

test('Google Docs local final compatibility receipt, registry, matrix, discovery, and catalog are exact-head bound', () => {
  const {
    buildGoogleDocsLocalFinalCompatibilityVerdictPacket,
    evaluateGoogleDocsLocalFinalCompatibilityVerdict,
  } = implementation;
  const packet = buildGoogleDocsLocalFinalCompatibilityVerdictPacket();
  const result = evaluateGoogleDocsLocalFinalCompatibilityVerdict(packet);
  const receipt = readJson(receiptPath);
  const matrix = readJson(matrixPath);
  const discovery = readJson(discoveryPath);
  const registry = readJson(registryPath);
  const catalog = readJson(catalogPath);

  assert.equal(receipt.status, result.status);
  assert.equal(receipt.verdict, result.verdict);
  assert.equal(receipt.localCompatibilityVerdict, result.localCompatibilityVerdict);
  assert.equal(receipt.realAccountE2E, result.realAccountE2E);
  assert.equal(receipt.supportClaimed, false);
  assert.equal(receipt.importClaimed, false);
  assert.equal(receipt.roundtripClaimed, false);
  assert.equal(receipt.applyAuthority, 'DENY');
  assert.equal(receipt.productMutationAuthority, 'DENY');
  assert.equal(receipt.packetDigest, result.packetDigest);

  for (const evidence of receipt.localEvidence) {
    assert.equal(evidence.receiptSha256, receiptDigest(evidence.receiptPath));
  }

  assert.equal(matrix.googleCurrentState.localCompatibilityVerdict, 'LOCAL_COMPATIBILITY_NEEDS_REAL_GOOGLE_E2E');
  assert.equal(matrix.googleCurrentState.realAccountE2E, 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE');
  assert.equal(matrix.googleCurrentState.finalLocalVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(matrix.googleCurrentState.nextLocalContour, 'GOOGLE_DOCS_REAL_ACCOUNT_E2E_AUTHORITY_BOUNDARY');
  assert.equal(matrix.localFinalCompatibilityVerdict.status, receipt.status);
  assert.equal(matrix.localFinalCompatibilityVerdict.receiptSha256, receiptDigest('docs/OPS/RTK/GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_V1_RECEIPT.json'));

  assert.equal(discovery.googleCurrentState.localCompatibilityVerdict, 'LOCAL_COMPATIBILITY_NEEDS_REAL_GOOGLE_E2E');
  assert.equal(discovery.googleCurrentState.finalLocalVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(discovery.localFinalCompatibilityVerdict.status, receipt.status);
  assert.equal(discovery.nextLocalContour, 'GOOGLE_DOCS_REAL_ACCOUNT_E2E_AUTHORITY_BOUNDARY');

  assert.equal(registry.discoveryHeads.some((entry) => entry.path === 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_V1_RECEIPT.json'), true);
  assert.equal(catalog.contractBasenames.includes('rtk-google-docs-local-final-compatibility-verdict.contract.test.js'), true);
  assert.equal(catalog.currentTruthBinding.googleLocalFinalCompatibilityVerdict, receipt.status);

  const scriptRun = spawnSync(process.execPath, ['scripts/ops/rtk-google-docs-local-final-compatibility-verdict-v1.mjs', '--check'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(scriptRun.status, 0, scriptRun.stderr || scriptRun.stdout);
  assert.match(scriptRun.stdout, /GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_STATUS=PASS/u);
});
