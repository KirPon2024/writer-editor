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

async function loadCanary() {
  return import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs'));
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

test('C1 generated Word script predeclares AppleScript error handler locals before Accessibility preflight', async () => {
  const { buildWordScript } = await loadCanary();
  const script = buildWordScript({
    sourcePath: '/tmp/c1-source.docx',
    returnedPath: '/tmp/c1-returned.docx',
    artifactReturnedPath: '/tmp/c1-returned-artifact.docx',
    initializeFromSource: false,
    ledger: {
      operations: [
        {
          id: 'c5v2-root_comment-test',
          family: 'root_comment',
          quote: 'unique root quote',
          locatorQuote: 'unique root quote',
          expectedOutcome: 'SAFE_APPLY',
        },
        {
          id: 'c5v2-reply-test',
          family: 'reply_attempt',
          targetRootOperationId: 'c5v2-root_comment-test',
          physicalAction: 'native-ui',
          expectedOutcome: 'SAFE_APPLY',
        },
      ],
    },
  });
  const predeclareIndex = script.indexOf('set yOperationErrMsg to ""');
  const topTryIndex = script.indexOf('\ntry\n  set display alerts to alerts none');
  const axPreflightIndex = script.indexOf('set yAccessibilityPreflight to my yMacosAccessibilityPreflight');
  assert.ok(predeclareIndex > -1, 'operation error message default must be generated');
  assert.ok(script.includes('set yOperationErrNo to 0'), 'operation error number default must be generated');
  assert.ok(script.includes('set yCanaryErrMsg to ""'), 'top-level canary error default must be generated');
  assert.ok(script.includes('set yNativeReadbackErrMsg to ""'), 'native readback error default must be generated');
  assert.ok(predeclareIndex < topTryIndex, 'handler locals must exist before top-level try');
  assert.ok(topTryIndex < axPreflightIndex, 'top-level try must still guard Accessibility preflight');
});

test('C1 generated macOS Accessibility preflight normalizes indeterminate AX probe values fail-closed', async () => {
  const { buildWordScript } = await loadCanary();
  const script = buildWordScript({
    sourcePath: '/tmp/c1-source.docx',
    returnedPath: '/tmp/c1-returned.docx',
    artifactReturnedPath: '/tmp/c1-returned-artifact.docx',
    initializeFromSource: false,
    ledger: {
      operations: [
        {
          id: 'c5v2-root_comment-test',
          family: 'root_comment',
          quote: 'unique root quote',
          locatorQuote: 'unique root quote',
          expectedOutcome: 'SAFE_APPLY',
        },
        {
          id: 'c5v2-reply-test',
          family: 'reply_attempt',
          targetRootOperationId: 'c5v2-root_comment-test',
          physicalAction: 'native-ui',
          expectedOutcome: 'SAFE_APPLY',
        },
      ],
    },
  });
  assert.ok(script.includes('on yAxIntegerOrMissing(yValue)'), 'AX integer normalizer must be generated');
  assert.ok(script.includes('if yValue is true then return missing value'), 'boolean true must not become a count');
  assert.ok(script.includes('if yValue is false then return missing value'), 'boolean false must not become a count');
  assert.ok(script.includes('on yAxBooleanOrFalse(yValue)'), 'AX boolean normalizer must be generated');
  assert.ok(script.includes('set yAxProbeIndeterminate to false'), 'indeterminate probe state must be explicit');
  assert.ok(script.includes('set yWindowCountValue to my yAxIntegerOrMissing(yWindowCountRaw)'), 'window count must be normalized before comparison');
  assert.ok(script.includes('set yAxMenuCountValue to my yAxIntegerOrMissing(yAxMenuCountRaw)'), 'menu count must be normalized before comparison');
  assert.ok(script.includes('set yAxWindowSubtreeCountValue to my yAxIntegerOrMissing(yAxWindowSubtreeCountRaw)'), 'window subtree count must be normalized before comparison');
  assert.ok(script.includes('AX_PROBE_INDETERMINATE:'), 'diagnostics must expose indeterminate probes');
  assert.ok(
    script.includes('if yAxProbeIndeterminate is true then return "MACOS_ACCESSIBILITY_WORD_WINDOW_UNAVAILABLE|" & yDiagnostics'),
    'indeterminate probes must fail closed with a typed Accessibility outcome',
  );
  assert.ok(
    script.includes('if (yAxQuerySucceeded is true) and (yWordFrontmost is true) and (yWindowCount > 0) and (yAxWindowSubtreeCount > 0) then exit repeat'),
    'ready condition must keep boolean and numeric operands type-separated',
  );
  assert.equal(
    script.includes('if yAxQuerySucceeded and yWordFrontmost and yWindowCount > 0 and yAxWindowSubtreeCount > 0 then exit repeat'),
    false,
    'bare mixed boolean/numeric ready condition must not return',
  );
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
  assert.match(receipt.denominator.route.reason, /complete-round semantic oracle passed/u);
  assert.match(receipt.denominator.route.reason, /PRODUCT_RETURN_APPLY_NOT_GREEN/u);
  assert.match(receipt.denominator.route.reason, /NATIVE_LIFECYCLE_VERIFICATION_NOT_GREEN/u);
  assert.match(receipt.denominator.route.reason, /COMPLETED_ROUND_REUSE_BINDING_NOT_GREEN/u);
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
  assert.equal(receipt.physicalEvidence.runId, 'c1-round01-post-failclosed-w06-r4-20260817t230824z');
  assert.equal(receipt.physicalEvidence.previousRedRunId, 'c1-round01-oracle-repair-w06-20260817');
  assert.equal(receipt.physicalEvidence.previousNativeMaterializationBlockedRunId, 'c1-window-visibility-repair-w06-r1-20260817');
  assert.equal(receipt.physicalEvidence.postExactLedgerRepairRebind.taskId, 'C1_WORD_POST_EXACT_LEDGER_REPAIR_DAG_REBIND_V1');
  assert.equal(receipt.physicalEvidence.postExactLedgerRepairRebind.repairPr, 1596);
  assert.equal(receipt.physicalEvidence.postExactLedgerRepairRebind.repairPrHeadSha, 'f53f80fe21828c270f04ef7766d2fe74bbe2d31f');
  assert.equal(receipt.physicalEvidence.postExactLedgerRepairRebind.mergedMainSha, '8b3d9cbb3d76c43bd777104bf95cf209062e6d40');
  assert.equal(receipt.physicalEvidence.postExactLedgerRepairRebind.mergedMainTree, 'c07b18ed3db7fbb859596e224830f371bd698320');
  assert.equal(receipt.physicalEvidence.postExactLedgerRepairRebind.routePassClaim, false);
  assert.equal(receipt.physicalEvidence.postExactLedgerRepairRebind.productApplyAuthority, false);
  assert.equal(receipt.physicalEvidence.postExactLedgerRepairRebind.executedFreshPhysicalReplayAfterRepair, false);
  assert.equal(receipt.physicalEvidence.postExactLedgerRepairRebind.currentRuntimePrecondition.classification, 'MACOS_ACCESSIBILITY_PERMISSION_REQUIRED');
  assert.equal(receipt.physicalEvidence.postExactLedgerRepairRebind.currentRuntimePrecondition.systemEventsUiElementsEnabled, false);
  assert.equal(receipt.physicalEvidence.postExactLedgerRepairRebind.currentRuntimePrecondition.wordProcessExists, false);
  assert.equal(receipt.physicalEvidence.postExactLedgerRepairRebind.currentRuntimePrecondition.freshPhysicalReplayAuthority, 'DENY_UNTIL_MACOS_ACCESSIBILITY_PERMISSION_RESTORED');
  assert.equal(receipt.physicalEvidence.stageResult.headSha, '8504d5fa8db9af9456cc6a6d0ec8b1aa8ad4d81a');
  assert.equal(receipt.physicalEvidence.stageResult.operationCount, 2000);
  assert.equal(receipt.physicalEvidence.stageResult.roundGreen, false);
  assert.equal(receipt.physicalEvidence.stageResult.roundGateCount, 5);
  assert.equal(receipt.physicalEvidence.stageResult.failureMarkerCode, 'ORCH_CHILD_EXIT_NONZERO:1:none');
  assert.equal(receipt.physicalEvidence.masterLedger.ledgerDigest, 'sha256:e075c4942b590d2622bf6202a4db1f33259f97367e2612a78673c7a54adf2d71');
  assert.equal(receipt.physicalEvidence.masterLedger.operationIdSetDigest, 'sha256:efd614ddf59d445f06da9a3f491053004ba7019246a97ad35515aaa29b773f32');
  assert.equal(receipt.physicalEvidence.round01.plannedOperationCount, 379);
  assert.equal(receipt.physicalEvidence.round01.completedCheckpointCount, 8);
  assert.equal(receipt.physicalEvidence.round01.completedCheckpointOperationCount, 379);
  assert.equal(receipt.physicalEvidence.round01.lastCompletedCheckpoint, 'word-chunk-008');
  assert.equal(receipt.physicalEvidence.round01.failedChunk, 'complete-round-oracle');
  assert.equal(receipt.physicalEvidence.round01.returnedReady, true);
  assert.equal(receipt.physicalEvidence.round01.failureCode, 'C5V2_COMPLETE_ROUND_ORACLE_GATE_FAILED');
  assert.match(receipt.physicalEvidence.round01.failureError, /PRODUCT_RETURN_APPLY_NOT_GREEN/u);
  assert.match(receipt.physicalEvidence.round01.failureError, /NATIVE_LIFECYCLE_VERIFICATION_NOT_GREEN/u);
  assert.match(receipt.physicalEvidence.round01.failureError, /COMPLETED_ROUND_REUSE_BINDING_NOT_GREEN/u);
  assert.equal(receipt.physicalEvidence.round01.completeRoundOracleGreen, true);
  assert.equal(receipt.physicalEvidence.round01.productReturnApplyGreen, false);
  assert.equal(receipt.physicalEvidence.round01.nativeLifecycleVerificationGreen, false);
  assert.equal(receipt.physicalEvidence.round01.nativeLifecycleCoverage.ok, false);
  assert.equal(receipt.physicalEvidence.round01.nativeLifecycleCoverage.verifiedCount, 0);
  assert.equal(receipt.physicalEvidence.round01.nativeLifecycleCoverage.blockedCount, 38);
  assert.equal(receipt.physicalEvidence.round01.completedRoundReuseBindingOk, false);
  assert.equal(receipt.physicalEvidence.round01.nativeMaterializationRootCountRepairObserved, true);
  assert.equal(receipt.physicalEvidence.round01.productReturnApply.ok, false);
  assert.equal(receipt.physicalEvidence.round01.productReturnApply.activationOk, true);
  assert.equal(receipt.physicalEvidence.round01.productReturnApply.returnIntakeAuthenticated, true);
  assert.equal(receipt.physicalEvidence.round01.productReturnApply.returnIntakeStatus, 'authenticated-return-ir-ready');
  assert.equal(receipt.physicalEvidence.round01.productReturnApply.textRevisions, 398);
  assert.equal(receipt.physicalEvidence.round01.productReturnApply.commentThreads, 54);
  assert.equal(receipt.physicalEvidence.round01.productReturnApply.formattingDeltas, 304);
  assert.equal(receipt.physicalEvidence.round01.productReturnApply.opaqueUnsupported, 9);
  assert.equal(receipt.physicalEvidence.round01.productReturnApply.exactTextBindingOk, false);
  assert.equal(receipt.physicalEvidence.round01.productReturnApply.expectedOperationCount, 105);
  assert.equal(receipt.physicalEvidence.round01.productReturnApply.matchedOperationCount, 0);
  assert.equal(receipt.physicalEvidence.round01.productReturnApply.matchedChangeCount, 0);
  assert.equal(receipt.physicalEvidence.round01.productReturnApply.excludedCandidateCount, 161);
  assert.equal(receipt.physicalEvidence.round01.productReturnApply.unmatchedExpectedOperationCount, 105);
  assert.equal(receipt.physicalEvidence.round01.productReturnApply.firstUnmatchedExpectedOperationIds[0], 'c5v2-tracked_text_edit-0003');
  assert.equal(receipt.physicalEvidence.round01.productReturnApply.formattingApplyOk, false);
  assert.equal(receipt.physicalEvidence.round01.productReturnApply.formattingApplyCode, 'RTK_FORMATTING_OPERATION_UNKNOWN_KEY');
  assert.equal(receipt.physicalEvidence.round01.productReturnApply.formattingPreviewCode, 'RTK_FORMATTING_RETURN_USER_DECISION_READY');
  assert.equal(receipt.physicalEvidence.round01.productReturnApply.formattingPreviewOperationCount, 304);
  assert.equal(receipt.physicalEvidence.round01.productReturnApply.applyResultsCount, 0);
  assert.equal(receipt.physicalEvidence.round01.productReturnApply.replayResultsCount, 0);
  assert.equal(receipt.physicalEvidence.round01.productReturnApply.staleRetryBlockedCount, 0);
  assert.equal(receipt.physicalEvidence.round01.productReturnApply.nonOverlapReason, 'NO_EXACT_TEXT_CANDIDATE_OPERATION_ID_BINDING_FAILED');
  assert.equal(receipt.physicalEvidence.resultStatus.plannedOperations, 2000);
  assert.equal(receipt.physicalEvidence.resultStatus.attemptedOperations, 379);
  assert.equal(receipt.physicalEvidence.resultStatus.reportedOperations, 379);
  assert.equal(receipt.physicalEvidence.resultStatus.wordStatus, 'PASS');
  assert.equal(receipt.physicalEvidence.resultStatus.sourceExportOk, true);
  assert.equal(receipt.physicalEvidence.resultStatus.electronOk, true);
  assert.equal(receipt.physicalEvidence.resultStatus.nativeLifecycleOk, false);
  assert.equal(receipt.physicalEvidence.resultStatus.productReturnApplyOk, false);
  assert.equal(receipt.physicalEvidence.resultStatus.roundOracleGateOk, false);
  assert.equal(receipt.physicalEvidence.resultStatus.terminalOperationAggregatePresent, false);
  assert.equal(receipt.physicalEvidence.resultStatus.returnIntakeAuthenticated, true);
  assert.equal(receipt.physicalEvidence.resultStatus.returnIntakeStatus, 'authenticated-return-ir-ready');
  assert.equal(receipt.physicalEvidence.resultStatus.returnedDocxReady, true);
  assert.match(receipt.physicalEvidence.resultStatus.wordWindowDiagnostics, /RETURNED_READY_TRUE/u);
  assert.match(receipt.physicalEvidence.resultStatus.wordWindowDiagnostics, /COMPLETE_ROUND_ORACLE_GREEN_TRUE/u);
  assert.match(receipt.physicalEvidence.resultStatus.wordWindowDiagnostics, /EXACT_LEDGER_BINDING_0_OF_105/u);
  assert.match(receipt.physicalEvidence.resultStatus.wrapperError, /C5V2_COMPLETE_ROUND_ORACLE_GATE_FAILED/u);
  assert.equal(receipt.physicalEvidence.resultStatus.productReturnApplyFailure, 'PRODUCT_RETURN_APPLY_NOT_GREEN');
  assert.equal(receipt.physicalEvidence.resultStatus.nativeLifecycleVerifiedCount, 0);
  assert.equal(receipt.physicalEvidence.resultStatus.nativeLifecycleBlockedCount, 38);
  assert.equal(receipt.physicalEvidence.resultStatus.falseAutoApplyCount, 0);
  assert.equal(receipt.physicalEvidence.returnedArtifactPresent, true);
  assert.equal(receipt.physicalEvidence.returnedArtifactSha256, receipt.physicalEvidence.returnedDocxSha256);
  assert.equal(receipt.physicalEvidence.returnedPackageObservation.modernMode15Ready, true);
  assert.equal(receipt.physicalEvidence.returnedPackageObservation.customDocumentPropertyCarrierSurvived, true);
  assert.equal(receipt.physicalEvidence.returnedPackageObservation.customXmlCarrierSurvived, true);
  assert.equal(receipt.physicalEvidence.returnedPackageObservation.authorityReason, 'RETURNED_DOCX_READY_BUT_APPLY_LIFECYCLE_REUSE_GATE_FAILED');
  assert.equal(receipt.physicalEvidence.independentParserProbe.ok, false);
  assert.equal(receipt.physicalEvidence.independentParserProbe.status, 'not-run-apply-lifecycle-reuse-gate-failed');
  assert.equal(receipt.physicalEvidence.independentParserProbe.sourceMode, 'RETURNED_WORD_ARTIFACT_READY_GATE_FAILED');
  assert.equal(receipt.physicalEvidence.independentParserProbe.canWriteManuscript, false);
  assert.equal(receipt.physicalEvidence.independentParserProbe.selectedCarrier, 'RETURNED_READY_APPLY_LIFECYCLE_REUSE_GATE_BLOCKED_NOT_ROUTE_PASS');
  assert.equal(receipt.physicalEvidence.independentParserProbe.authorityVerified, false);
  assert.equal(receipt.physicalEvidence.independentParserProbe.authorityReason, 'APPLY_LIFECYCLE_REUSE_GATE_FAILED');
  assert.equal(receipt.physicalEvidence.independentParserProbe.payloadProfileId, '');
  assert.equal(receipt.physicalEvidence.independentParserProbe.payloadProfileIdStale, false);
  assert.equal(receipt.physicalEvidence.independentParserProbe.reviewCounts.textRevisions, 398);
  assert.equal(receipt.physicalEvidence.independentParserProbe.reviewCounts.commentThreads, 54);
  assert.equal(receipt.physicalEvidence.independentParserProbe.reviewCounts.formattingDeltas, 304);

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
    'C1_WORD_ROUND01_EXACT_LEDGER_BINDING_BLOCKER',
    'C1_WORD_ROUND01_APPLY_LIFECYCLE_REUSE_GATE_BLOCKER',
    'C1_WORD_ROUND01_EXACT_LEDGER_BINDING_REPAIR_MERGED_NOT_ROUTE_PASS',
    'C1_WORD_MACOS_ACCESSIBILITY_PERMISSION_REQUIRED_CURRENT_BLOCKER',
  ]);
  assert.equal(c1.nextContour, 'C1_WORD_FULLBOOK_ROUTE_REPLAY_AFTER_MACOS_ACCESSIBILITY_PERMISSION_RESTORED_V1');
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
  assert.equal(hostile.total, 22);
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
    ['returned-ready-false-launder', (r) => { r.physicalEvidence.resultStatus.returnedDocxReady = false; }, 'RETURNED_DOCX_READY_MUST_BE_TRUE_FOR_ORACLE_FAILURE'],
    ['current-profile-launder', (r) => { r.physicalEvidence.independentParserProbe.payloadProfileId = 'word-mac-16.112-26081010-product-review-export-c5v2-full-manuscript'; }, 'CURRENT_PROFILE_MUST_NOT_BE_CLAIMED_AFTER_ORACLE_FAILURE'],
    ['returned-artifact-missing-after-repair', (r) => { r.physicalEvidence.returnedArtifactPresent = false; }, 'RETURNED_ARTIFACT_MUST_BE_PRESENT_AFTER_REPAIR'],
    ['complete-oracle-regression-launder', (r) => { r.physicalEvidence.round01.completeRoundOracleGreen = false; }, 'COMPLETE_ROUND_ORACLE_MUST_BE_GREEN_FOR_THIS_BLOCKER'],
    ['exact-ledger-binding-false-pass', (r) => { r.physicalEvidence.round01.productReturnApply.exactTextBindingOk = true; }, 'EXACT_LEDGER_BINDING_MUST_REMAIN_FALSE'],
    ['post-ledger-repair-route-pass-launder', (r) => { r.physicalEvidence.postExactLedgerRepairRebind.routePassClaim = true; }, 'POST_EXACT_LEDGER_REPAIR_ROUTE_PASS_LAUNDER'],
    ['ax-precondition-ready-launder', (r) => { r.physicalEvidence.postExactLedgerRepairRebind.currentRuntimePrecondition.systemEventsUiElementsEnabled = true; }, 'CURRENT_RUNTIME_PRECONDITION_INVALID:UI_ELEMENTS_ENABLED'],
    ['native-materialization-failure-launder', (r) => { r.physicalEvidence.round01.failureCode = 'NATIVE_MATERIALIZATION_ROOT_COUNT_MISMATCH'; }, 'COMPLETE_ROUND_ORACLE_GATE_FAILURE_CODE'],
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
  const { EXACT_HEAD, PRE_APPLY_LIFECYCLE_REUSE_GATE_REPAIR_ROUTE_HEAD, PRE_AUTH_REPAIR_ROUTE_HEAD, resolveExactHeadBinding } = await loadVerifier();
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
  assert.ok(stalePreRepairBase.staleRejectedBaseShas.includes(PRE_APPLY_LIFECYCLE_REUSE_GATE_REPAIR_ROUTE_HEAD));

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
