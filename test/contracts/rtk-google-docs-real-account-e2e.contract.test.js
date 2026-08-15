const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');

let implementation;

test.before(async () => {
  implementation = await import('../../scripts/ops/google-docs-real-account-e2e-v1.mjs');
});

test('Google Docs real-account E2E receipt accepts only scoped current-run synthetic evidence', () => {
  const {
    buildExpectedGoogleDocsRealAccountE2EReceipt,
    evaluateGoogleDocsRealAccountE2EReceipt,
  } = implementation;
  const receipt = buildExpectedGoogleDocsRealAccountE2EReceipt();
  const result = evaluateGoogleDocsRealAccountE2EReceipt(receipt);

  assert.equal(result.ok, true);
  assert.equal(result.status, 'GOOGLE_DOCS_REAL_ACCOUNT_E2E_V1_SCOPED_VERIFIED');
  assert.equal(result.verdict, 'SCOPED_REAL_GOOGLE_DOCS_E2E_PASS_WITH_LIMITATIONS');
  assert.equal(result.programVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(result.createdArtifactCount, 1);
  assert.equal(result.createdArtifactsTrashed, 1);
  assert.equal(result.userDocumentsRead, 0);
  assert.equal(result.userDocumentsMutated, 0);
  assert.equal(result.existingDriveDiscoveryUsed, false);
  assert.equal(result.permanentDeleteUsed, false);
  assert.equal(result.nativeSuggestionObserved, true);
  assert.equal(result.nativeSuggestionCreatedByConnector, false);
  assert.equal(result.applyAuthority, 'DENY');
  assert.equal(result.productRuntimeWired, false);
  assert.deepEqual(result.denominators, {
    createdSyntheticArtifacts: 1,
    trashedSyntheticArtifacts: 1,
    connectorCreatedNativeDocs: 1,
    revisionGuardedContentWrites: 1,
    revisionGuardedFormattingWrites: 1,
    connectorCommentThreadsCreated: 1,
    connectorCommentThreadsResolved: 1,
    nativeSuggestionsObserved: 1,
    staleRevisionNegatives: 1,
    exportsAttempted: 2,
    exportReadbacksPreserved: 1,
    nativeReimportAttempts: 1,
    nativeReimportPasses: 0,
    userDocumentsRead: 0,
    userDocumentsMutated: 0,
    permanentDeletes: 0,
    productMutations: 0,
  });
});

test('Google Docs real-account E2E hostile corpus rejects false-green evidence', () => {
  const {
    runGoogleDocsRealAccountE2EHostileCorpus,
    runGoogleDocsRealAccountE2ESemanticMutationCatalog,
  } = implementation;
  const hostile = runGoogleDocsRealAccountE2EHostileCorpus();
  const mutations = runGoogleDocsRealAccountE2ESemanticMutationCatalog();

  assert.equal(hostile.total, 24);
  assert.equal(hostile.survivors, 0);
  assert.equal(mutations.total, 18);
  assert.equal(mutations.survivors, 0);
  assert.equal(hostile.reasonCounts.GOOGLE_REAL_E2E_USER_DOC_SCOPE_VIOLATION > 0, true);
  assert.equal(hostile.reasonCounts.GOOGLE_REAL_E2E_SUGGESTION_NOT_OBSERVED > 0, true);
  assert.equal(hostile.reasonCounts.GOOGLE_REAL_E2E_TRASH_NOT_CONFIRMED > 0, true);
  assert.equal(hostile.reasonCounts.GOOGLE_REAL_E2E_PERMANENT_DELETE_FORBIDDEN > 0, true);
  assert.equal(hostile.reasonCounts.GOOGLE_REAL_E2E_IMPORT_OVERCLAIM > 0, true);
});

test('Google Docs real-account E2E CLI check is exact and deterministic', () => {
  const first = spawnSync(process.execPath, ['scripts/ops/google-docs-real-account-e2e-v1.mjs', '--check'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const second = spawnSync(process.execPath, ['scripts/ops/google-docs-real-account-e2e-v1.mjs', '--check'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(first.status, 0, first.stderr || first.stdout);
  assert.equal(second.status, 0, second.stderr || second.stdout);
  assert.equal(first.stdout, second.stdout);
  assert.match(first.stdout, /GOOGLE_DOCS_REAL_ACCOUNT_E2E_V1_STATUS=PASS/u);
});
