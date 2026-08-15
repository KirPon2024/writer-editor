const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');

let implementation;

test.before(async () => {
  implementation = await import('../../scripts/ops/google-docs-real-account-whole-book-e2e-v1.mjs');
});

test('Google Docs real-account whole-book E2E receipt is full-corpus, not smoke or excerpt evidence', () => {
  const {
    buildExpectedGoogleDocsRealAccountWholeBookE2EReceipt,
    evaluateGoogleDocsRealAccountWholeBookE2EReceipt,
  } = implementation;
  const receipt = buildExpectedGoogleDocsRealAccountWholeBookE2EReceipt();
  const result = evaluateGoogleDocsRealAccountWholeBookE2EReceipt(receipt);

  assert.equal(result.ok, true);
  assert.equal(result.status, 'GOOGLE_DOCS_REAL_ACCOUNT_WHOLE_BOOK_E2E_V1_SCOPED_VERIFIED');
  assert.equal(result.verdict, 'SCOPED_REAL_GOOGLE_DOCS_WHOLE_BOOK_E2E_PASS_WITH_LIMITATIONS');
  assert.equal(result.programVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(result.syntheticBook.sceneCount, 21);
  assert.equal(result.syntheticBook.paragraphCount > 250, true);
  assert.equal(result.syntheticBook.charCount > 100_000, true);
  assert.equal(result.createdArtifactCount, 1);
  assert.equal(result.createdArtifactsTrashed, 1);
  assert.equal(result.userDocumentsRead, 0);
  assert.equal(result.userDocumentsMutated, 0);
  assert.equal(result.existingDriveDiscoveryUsed, false);
  assert.equal(result.permanentDeleteUsed, false);
  assert.equal(result.fullReadbackVerified, true);
  assert.equal(result.noSampling, true);
  assert.equal(result.applyAuthority, 'DENY');
  assert.equal(result.productRuntimeWired, false);
});

test('Google Docs real-account whole-book hostile corpus and semantic mutations reject false-green evidence', () => {
  const {
    runGoogleDocsRealAccountWholeBookHostileCorpus,
    runGoogleDocsRealAccountWholeBookSemanticMutationCatalog,
  } = implementation;
  const hostile = runGoogleDocsRealAccountWholeBookHostileCorpus();
  const mutations = runGoogleDocsRealAccountWholeBookSemanticMutationCatalog();

  assert.equal(hostile.total >= 32, true);
  assert.equal(hostile.survivors, 0);
  assert.equal(mutations.total >= 24, true);
  assert.equal(mutations.survivors, 0);
  assert.equal(hostile.reasonCounts.GOOGLE_WHOLE_BOOK_EXCERPT_OR_SMOKE_OVERCLAIM > 0, true);
  assert.equal(hostile.reasonCounts.GOOGLE_WHOLE_BOOK_FULL_READBACK_MISSING > 0, true);
  assert.equal(hostile.reasonCounts.GOOGLE_WHOLE_BOOK_STRUCTURE_MISMATCH > 0, true);
  assert.equal(hostile.reasonCounts.GOOGLE_WHOLE_BOOK_TEXT_HASH_MISMATCH > 0, true);
  assert.equal(hostile.reasonCounts.GOOGLE_WHOLE_BOOK_TRASH_NOT_CONFIRMED > 0, true);
});

test('Google Docs real-account whole-book CLI check is exact and deterministic', () => {
  const first = spawnSync(process.execPath, ['scripts/ops/google-docs-real-account-whole-book-e2e-v1.mjs', '--check'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const second = spawnSync(process.execPath, ['scripts/ops/google-docs-real-account-whole-book-e2e-v1.mjs', '--check'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(first.status, 0, first.stderr || first.stdout);
  assert.equal(second.status, 0, second.stderr || second.stdout);
  assert.equal(first.stdout, second.stdout);
  assert.match(first.stdout, /GOOGLE_DOCS_REAL_ACCOUNT_WHOLE_BOOK_E2E_V1_STATUS=PASS/u);
});
