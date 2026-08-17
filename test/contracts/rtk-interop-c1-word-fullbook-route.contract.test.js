'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

async function loadVerifier() {
  return import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-interop-c1-word-fullbook-route-v1.mjs'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('C1 chunked Word runner binds progress to the active round id, never an undefined outer variable', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs'), 'utf8');
  assert.equal(source.includes('roundIndex,\n              roundId,\n              ...progress'), false);
  assert.equal(source.includes('roundIndex,\n          roundId,\n          operationCount'), false);
  assert.match(source, /roundIndex,\n\s+roundId: round\.roundId,\n\s+\.\.\.progress/u);
  assert.match(source, /roundIndex,\n\s+roundId: round\.roundId,\n\s+operationCount/u);
});

test('C1 Word full-book route receipt is fail-closed blocker evidence, not route PASS', async () => {
  const {
    EXACT_HEAD,
    EXPECTED_DENOMINATOR,
    EXPECTED_WORD_PROFILE,
    NEXT_SEQUENTIAL_CONTOUR,
    STATUS,
    TASK_ID,
    readC1Receipt,
    verifyC1Route,
  } = await loadVerifier();

  const report = verifyC1Route();
  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.equal(report.exactHead, EXACT_HEAD);
  assert.equal(report.routeId, 'C1');
  assert.equal(report.routeVerdict, 'BLOCKED');
  assert.equal(report.chainSaturationVerdict, 'NEEDS_MORE_EVIDENCE');

  const receipt = readC1Receipt();
  assert.equal(receipt.taskId, TASK_ID);
  assert.equal(receipt.status, STATUS);
  assert.equal(receipt.verdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(receipt.programVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(receipt.route.routeId, 'C1');
  assert.equal(receipt.route.routeVerdict, 'BLOCKED');
  assert.equal(receipt.route.chainSaturationVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(receipt.route.c2ToC8ClosureAuthority, 'DENY');
  assert.equal(receipt.route.universalParityClaim, 'DENY');
  assert.equal(receipt.route.byteIdentityClaim, 'DENY');
  assert.equal(receipt.route.productMutationAuthority, 'DENY');
  assert.equal(receipt.authority.userDocumentsAllowed, false);
  assert.equal(receipt.authority.userDocumentsRead, 0);
  assert.equal(receipt.authority.userDocumentsMutated, 0);
  assert.equal(receipt.authority.productRuntimeWiringChanged, false);
  assert.equal(receipt.authority.productNetworkRuntimeUsed, false);
  assert.equal(receipt.provider.word.version, EXPECTED_WORD_PROFILE.version);
  assert.equal(receipt.provider.word.build, EXPECTED_WORD_PROFILE.build);
  assert.equal(receipt.provider.word.bundleId, EXPECTED_WORD_PROFILE.bundleId);
  assert.equal(receipt.provider.word.teamIdentifier, EXPECTED_WORD_PROFILE.teamIdentifier);
  assert.equal(receipt.denominator.fullBook.noSampling, true);
  assert.equal(receipt.denominator.fullBook.excerptOrSmokeEvidenceAdmitted, false);
  assert.equal(receipt.denominator.fullBook.sceneCount, EXPECTED_DENOMINATOR.sceneCount);
  assert.equal(receipt.denominator.fullBook.paragraphCount, EXPECTED_DENOMINATOR.paragraphCount);
  assert.equal(receipt.denominator.fullBook.charCount, EXPECTED_DENOMINATOR.charCount);
  assert.equal(receipt.denominator.route.expectedRouteCount, 1);
  assert.equal(receipt.denominator.route.actualRouteCount, 0);
  assert.equal(receipt.denominator.route.fullBookProcessed, false);
  assert.match(receipt.denominator.route.reason, /chunk 008/u);
  assert.equal(receipt.failureCounters.unknownAsPass, 0);
  assert.equal(receipt.failureCounters.abstainAsPass, 0);
  assert.equal(receipt.failureCounters.conflictingAsPass, 0);
  assert.equal(receipt.failureCounters.silentLoss, 0);
  assert.equal(receipt.failureCounters.falseAutoApplyCount, 0);
  assert.equal(receipt.nextSequentialContour, NEXT_SEQUENTIAL_CONTOUR);
});

test('C1 Word full-book physical evidence binds exact blocker facts and no terminal aggregate', async () => {
  const { readC1Receipt, verifyC1Route } = await loadVerifier();
  const report = verifyC1Route();
  assert.equal(report.ok, true, report.errors.join('\n'));

  const receipt = readC1Receipt();
  assert.equal(receipt.physicalEvidence.syntheticDisposableDocxOnly, true);
  assert.match(receipt.physicalEvidence.corpusDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(receipt.physicalEvidence.corpusManifestSha256, /^sha256:[0-9a-f]{64}$/u);
  assert.match(receipt.physicalEvidence.canaryScriptSha256, /^sha256:[0-9a-f]{64}$/u);
  assert.match(receipt.physicalEvidence.resultSha256, /^sha256:[0-9a-f]{64}$/u);
  assert.match(receipt.physicalEvidence.sourceDocxSha256, /^sha256:[0-9a-f]{64}$/u);
  assert.match(receipt.physicalEvidence.returnedDocxSha256, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(receipt.physicalEvidence.runId, 'c1-window-visibility-repair-w06-r1-20260817');
  assert.equal(receipt.physicalEvidence.previousRedRunId, 'c1-fullbook-auth-repair-w06-r3-20260817');
  assert.equal(receipt.physicalEvidence.stageResult.headSha, '834f37a8cb5ba3eb854f6407e2dc4e7e14606d88');
  assert.equal(receipt.physicalEvidence.stageResult.operationCount, 2000);
  assert.equal(receipt.physicalEvidence.stageResult.roundGreen, false);
  assert.equal(receipt.physicalEvidence.masterLedger.ledgerDigest, 'sha256:e075c4942b590d2622bf6202a4db1f33259f97367e2612a78673c7a54adf2d71');
  assert.equal(receipt.physicalEvidence.masterLedger.operationIdSetDigest, 'sha256:efd614ddf59d445f06da9a3f491053004ba7019246a97ad35515aaa29b773f32');
  assert.equal(receipt.physicalEvidence.round01.plannedOperationCount, 379);
  assert.equal(receipt.physicalEvidence.round01.completedCheckpointOperationCount, 336);
  assert.equal(receipt.physicalEvidence.round01.failedChunk, 'word-chunk-008');
  assert.equal(receipt.physicalEvidence.round01.returnedReady, false);
  assert.equal(receipt.physicalEvidence.round01.failureCode, 'NATIVE_MATERIALIZATION_ROOT_COUNT_MISMATCH');
  assert.match(receipt.physicalEvidence.round01.failureError, /NATIVE_MATERIALIZATION_ROOT_COUNT_MISMATCH:1:0/u);
  assert.equal(receipt.physicalEvidence.resultStatus.plannedOperations, 2000);
  assert.equal(receipt.physicalEvidence.resultStatus.attemptedOperations, 379);
  assert.equal(receipt.physicalEvidence.resultStatus.reportedOperations, 336);
  assert.equal(receipt.physicalEvidence.resultStatus.wordStatus, 'FAIL');
  assert.equal(receipt.physicalEvidence.resultStatus.sourceExportOk, true);
  assert.equal(receipt.physicalEvidence.resultStatus.electronOk, true);
  assert.equal(receipt.physicalEvidence.resultStatus.nativeLifecycleOk, false);
  assert.equal(receipt.physicalEvidence.resultStatus.productReturnApplyOk, false);
  assert.equal(receipt.physicalEvidence.resultStatus.roundOracleGateOk, false);
  assert.equal(receipt.physicalEvidence.resultStatus.terminalOperationAggregatePresent, false);
  assert.equal(receipt.physicalEvidence.resultStatus.returnIntakeAuthenticated, false);
  assert.equal(receipt.physicalEvidence.resultStatus.returnIntakeStatus, 'not-started-returned-docx-not-ready');
  assert.equal(receipt.physicalEvidence.resultStatus.returnedDocxReady, false);
  assert.match(receipt.physicalEvidence.resultStatus.wordWindowDiagnostics, /MACOS_ACCESSIBILITY_PREFLIGHT_READY/u);
  assert.match(receipt.physicalEvidence.resultStatus.wordWindowDiagnostics, /WINDOW_COUNT:1/u);
  assert.match(receipt.physicalEvidence.resultStatus.wordWindowDiagnostics, /WINDOW_REVIVE/u);
  assert.match(receipt.physicalEvidence.resultStatus.wrapperError, /NATIVE_MATERIALIZATION_ROOT_COUNT_MISMATCH/u);
  assert.equal(receipt.physicalEvidence.resultStatus.falseAutoApplyCount, 0);
  assert.equal(receipt.physicalEvidence.returnedArtifactPresent, true);
  assert.equal(receipt.physicalEvidence.returnedArtifactSha256, receipt.physicalEvidence.returnedDocxSha256);
  assert.equal(receipt.physicalEvidence.returnedPackageObservation.modernMode15Ready, false);
  assert.equal(receipt.physicalEvidence.returnedPackageObservation.customDocumentPropertyCarrierSurvived, false);
  assert.equal(receipt.physicalEvidence.returnedPackageObservation.customXmlCarrierSurvived, false);
  assert.equal(receipt.physicalEvidence.independentParserProbe.ok, false);
  assert.equal(receipt.physicalEvidence.independentParserProbe.status, 'not-run-returned-docx-not-ready');
  assert.equal(receipt.physicalEvidence.independentParserProbe.sourceMode, 'RETURNED_WORD_ARTIFACT_NOT_READY');
  assert.equal(receipt.physicalEvidence.independentParserProbe.canWriteManuscript, false);
  assert.equal(receipt.physicalEvidence.independentParserProbe.selectedCarrier, '');
  assert.equal(receipt.physicalEvidence.independentParserProbe.authorityVerified, false);
  assert.equal(receipt.physicalEvidence.independentParserProbe.authorityReason, 'RETURNED_DOCX_NOT_READY_FOR_PRODUCT_INTAKE');
  assert.equal(receipt.physicalEvidence.independentParserProbe.payloadProfileId, '');
  assert.equal(receipt.physicalEvidence.independentParserProbe.payloadProfileIdStale, false);
  assert.equal(receipt.physicalEvidence.independentParserProbe.reviewCounts.textRevisions, 0);
  assert.equal(receipt.physicalEvidence.independentParserProbe.reviewCounts.commentThreads, 0);
  assert.equal(receipt.physicalEvidence.independentParserProbe.reviewCounts.formattingDeltas, 0);

  for (const oracleName of Object.keys(receipt.oracles)) {
    assert.notEqual(receipt.oracles[oracleName].status, 'PASS', oracleName);
  }
});

test('C1 Word full-book route updates only C1 as blocked in the chain matrix and does not launder other routes', async () => {
  const { readChainMatrix, verifyC1Route } = await loadVerifier();
  const { POST_AUTH_REPAIR_FULL_BOOK_ACCOUNTING } = await loadVerifier();
  const report = verifyC1Route({ checkCatalog: true });
  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.equal(report.catalogIncludesContract, true);

  const matrix = readChainMatrix();
  const c1 = matrix.routeDenominator.find((route) => route.routeId === 'C1');
  assert.equal(c1.routeVerdict, 'BLOCKED');
  assert.equal(c1.accountingStatus, 'FULL_BOOK_ATTEMPTED_BLOCKED');
  assert.equal(c1.fullBookAccounting, POST_AUTH_REPAIR_FULL_BOOK_ACCOUNTING);
  assert.deepEqual(c1.executedFullRouteEvidence, []);
  assert.deepEqual(c1.blockerEvidenceRefs, [
    'YALKEN_INTEROP_C1_WORD_FULLBOOK_ROUTE_RECEIPT_V1',
    'C1_WORD_NATIVE_MATERIALIZATION_ROOT_COUNT_BLOCKER',
  ]);
  assert.equal(c1.productMutationAuthority, 'DENY_UNTIL_ROUTE_CONTOUR_PROVES_APPLY_AUTHORITY');
  assert.notEqual(c1.requiredOracles.semanticOracle.status, 'PASS');

  const others = matrix.routeDenominator.filter((route) => route.routeId !== 'C1');
  assert.equal(others.length, 7);
  for (const route of others) {
    assert.equal(route.routeVerdict, 'NEEDS_MORE_EVIDENCE', route.routeId);
    assert.equal(route.accountingStatus, 'NOT_STARTED', route.routeId);
    assert.deepEqual(route.executedFullRouteEvidence, [], route.routeId);
    assert.equal(route.productMutationAuthority, 'DENY_UNTIL_ROUTE_CONTOUR_PROVES_APPLY_AUTHORITY', route.routeId);
  }
  assert.equal(matrix.claimControls.chainSaturationVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(matrix.claimControls.allRoutesProven, false);
});

test('C1 Word full-book route hostile receipt mutations are rejected fail-closed', async () => {
  const {
    readC1Receipt,
    runC1HostileCorpus,
    runC1SemanticMutationCatalog,
    validateC1Receipt,
  } = await loadVerifier();
  const base = readC1Receipt();
  assert.equal(validateC1Receipt(base).ok, true);

  const hostile = runC1HostileCorpus();
  const mutations = runC1SemanticMutationCatalog();
  assert.equal(hostile.total, 19);
  assert.equal(hostile.survivors, 0, JSON.stringify(hostile.survivorDetails, null, 2));
  assert.equal(mutations.total, 12);
  assert.equal(mutations.survivors, 0, JSON.stringify(mutations.survivorDetails, null, 2));

  const cases = [
    ['route-pass', (r) => { r.route.routeVerdict = 'PASS'; }, 'ROUTE_VERDICT_MUST_BE_BLOCKED'],
    ['word-build', (r) => { r.provider.word.build = '16.111.26080215'; }, 'WORD_PROFILE_MISMATCH'],
    ['excerpt-denominator', (r) => { r.denominator.fullBook.noSampling = false; }, 'FULL_BOOK_DENOMINATOR_INVALID'],
    ['missing-artifact-digest', (r) => { r.physicalEvidence.resultSha256 = ''; }, 'PHYSICAL_DIGEST_INVALID'],
    ['unknown-as-pass', (r) => { r.failureCounters.unknownAsPass = 1; }, 'BLOCKED_COUNTER_NONZERO'],
    ['user-doc-read', (r) => { r.authority.userDocumentsRead = 1; }, 'USER_DOCUMENT_COUNTER_NONZERO'],
    ['chain-saturation', (r) => { r.route.chainSaturationVerdict = 'PASS'; }, 'CHAIN_SATURATION_ESCALATION'],
    ['oracle-pass', (r) => { r.oracles.semanticOracle.status = 'PASS'; }, 'ORACLE_NOT_PASS_WHEN_ROUTE_BLOCKED'],
    ['terminal-aggregate-present', (r) => { r.physicalEvidence.resultStatus.terminalOperationAggregatePresent = true; }, 'TERMINAL_AGGREGATE_MUST_BE_ABSENT'],
    ['returned-ready-launder', (r) => { r.physicalEvidence.resultStatus.returnedDocxReady = true; }, 'RETURNED_DOCX_READY_MUST_BE_FALSE'],
    ['current-profile-launder', (r) => { r.physicalEvidence.independentParserProbe.payloadProfileId = 'word-mac-16.112-26081010-product-review-export-c5v2-full-manuscript'; }, 'CURRENT_PROFILE_MUST_NOT_BE_CLAIMED_WHEN_NOT_READY'],
    ['returned-artifact-missing-after-repair', (r) => { r.physicalEvidence.returnedArtifactPresent = false; }, 'RETURNED_ARTIFACT_MUST_BE_PRESENT_AFTER_REPAIR'],
    ['window-revive-missing-launder', (r) => { r.physicalEvidence.resultStatus.wordWindowDiagnostics = 'MACOS_ACCESSIBILITY_PREFLIGHT_READY|WINDOW_COUNT:1'; }, 'WINDOW_REVIVE_NOT_RECORDED'],
    ['native-materialization-failure-launder', (r) => { r.physicalEvidence.round01.failureCode = 'MACOS_ACCESSIBILITY_WORD_WINDOW_UNAVAILABLE'; }, 'NATIVE_MATERIALIZATION_FAILURE_CODE'],
  ];

  for (const [name, mutate, expected] of cases) {
    const mutated = clone(base);
    mutate(mutated);
    const report = validateC1Receipt(mutated);
    assert.equal(report.ok, false, name);
    assert.equal(report.errors.some((error) => error.includes(expected)), true, `${name}: ${report.errors.join('\n')}`);
  }
});

test('C1 Word full-book route rejects stale GitHub shallow base binding and CLI is deterministic', async () => {
  const { EXACT_HEAD, PRE_AUTH_REPAIR_ROUTE_HEAD, resolveExactHeadBinding } = await loadVerifier();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-c1-pr-event-'));
  const eventPath = path.join(tempDir, 'event.json');
  fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { base: { sha: EXACT_HEAD } } }), 'utf8');

  const accepted = resolveExactHeadBinding('/definitely/not/a/git/repo', {
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_EVENT_PATH: eventPath,
  });
  assert.equal(accepted.ok, true);

  fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { base: { sha: PRE_AUTH_REPAIR_ROUTE_HEAD } } }), 'utf8');
  const stalePreRepairBase = resolveExactHeadBinding('/definitely/not/a/git/repo', {
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_EVENT_PATH: eventPath,
  });
  assert.equal(stalePreRepairBase.ok, false);
  assert.equal(stalePreRepairBase.status, 'PULL_REQUEST_BASE_SHA_MISMATCH');
  assert.deepEqual(stalePreRepairBase.acceptedBaseShas, [EXACT_HEAD]);
  assert.ok(stalePreRepairBase.staleRejectedBaseShas.includes(PRE_AUTH_REPAIR_ROUTE_HEAD));

  fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { base: { sha: '0'.repeat(40) } } }), 'utf8');
  const rejected = resolveExactHeadBinding('/definitely/not/a/git/repo', {
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_EVENT_PATH: eventPath,
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.status, 'PULL_REQUEST_BASE_SHA_MISMATCH');

  const first = spawnSync(process.execPath, ['scripts/ops/rtk-interop-c1-word-fullbook-route-v1.mjs', '--check-catalog'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const second = spawnSync(process.execPath, ['scripts/ops/rtk-interop-c1-word-fullbook-route-v1.mjs', '--check-catalog'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(first.status, 0, first.stderr || first.stdout);
  assert.equal(second.status, 0, second.stderr || second.stdout);
  assert.equal(first.stdout, second.stdout);
  assert.match(first.stdout, /C1_WORD_FULLBOOK_ROUTE_STATUS=PASS/u);
  assert.match(first.stdout, /ROUTE_VERDICT=BLOCKED/u);
});
