const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function loadVerifier() {
  return import('../../scripts/ops/rtk-interop-chain-matrix-v1.mjs');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function validFixture() {
  const { readChainMatrix, verifyInteropChainMatrix } = await loadVerifier();
  const report = verifyInteropChainMatrix();
  assert.equal(report.ok, true, report.errors.join('\n'));
  return readChainMatrix();
}

test('Interop chain matrix registers the exact C1-C8 full-book denominator without route saturation claims', async () => {
  const {
    EXPECTED_ROUTE_IDS,
    INTEROP_CHAIN_EXACT_HEAD_SHA,
    MATRIX_STATUS,
    NEXT_SEQUENTIAL_CONTOUR,
    POST_AUTH_REPAIR_FULL_BOOK_ACCOUNTING,
    readChainMatrix,
    verifyInteropChainMatrix,
  } = await loadVerifier();

  const report = verifyInteropChainMatrix();
  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.equal(report.exactHead, INTEROP_CHAIN_EXACT_HEAD_SHA);
  assert.match(report.exactHeadBinding.status, /^(REACHABLE_FROM_CURRENT_HEAD|MATCHES_PULL_REQUEST_BASE_SHA_IN_SHALLOW_CHECKOUT)$/u);

  const matrix = readChainMatrix();
  assert.equal(matrix.status, MATRIX_STATUS);
  assert.deepEqual(matrix.routeDenominator.map((route) => route.routeId), EXPECTED_ROUTE_IDS);
  assert.equal(matrix.claimControls.chainSaturationVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(matrix.claimControls.allRoutesProven, false);
  assert.equal(matrix.claimControls.falseAutoApplyCount, 0);
  assert.equal(matrix.claimControls.wordEvidenceTransferToGoogle, 'DENY');
  assert.equal(matrix.claimControls.googleEvidenceTransferToWord, 'DENY');
  assert.equal(matrix.claimControls.universalParityClaim, 'DENY');
  assert.equal(matrix.claimControls.byteIdentityClaim, 'DENY');
  assert.equal(matrix.nextSequentialContour, NEXT_SEQUENTIAL_CONTOUR);

  const c1 = matrix.routeDenominator.find((route) => route.routeId === 'C1');
  assert.equal(c1.fullBookAccounting, POST_AUTH_REPAIR_FULL_BOOK_ACCOUNTING);
  assert.deepEqual(c1.blockerEvidenceRefs, [
    'YALKEN_INTEROP_C1_WORD_FULLBOOK_ROUTE_RECEIPT_V1',
    'C1_WORD_ROUND01_EXACT_LEDGER_BINDING_BLOCKER',
    'C1_WORD_ROUND01_APPLY_LIFECYCLE_REUSE_GATE_BLOCKER',
    'C1_WORD_ROUND01_EXACT_LEDGER_BINDING_REPAIR_MERGED_NOT_ROUTE_PASS',
  ]);
  assert.equal(c1.blockerEvidenceRefs.includes('C1_WORD_MACOS_ACCESSIBILITY_PERMISSION_REQUIRED_CURRENT_BLOCKER'), false);
  assert.equal(c1.fullBookEvidenceRefs.includes('C1_WORD_ACCESSIBILITY_CALLER_IDENTITY_PROBE_ROUTING_RECLASSIFIED'), true);
  assert.equal(c1.fullBookEvidenceRefs.includes('YALKEN_R24_W0_WORD_PHYSICAL_RECERTIFICATION_RECEIPT_V1'), true);
  assert.equal(c1.nextContour, NEXT_SEQUENTIAL_CONTOUR);
  assert.equal(matrix.sourceEvidence.c1FreshApplyLifecycleGateBlockedReplay.failureCode, 'C5V2_COMPLETE_ROUND_ORACLE_GATE_FAILED');
  assert.equal(matrix.sourceEvidence.c1FreshApplyLifecycleGateBlockedReplay.returnedDocxReady, true);
  assert.equal(matrix.sourceEvidence.c1FreshApplyLifecycleGateBlockedReplay.completeRoundOracleGreen, true);
  assert.equal(matrix.sourceEvidence.c1FreshApplyLifecycleGateBlockedReplay.productReturnApplyGreen, false);
  assert.equal(matrix.sourceEvidence.c1FreshApplyLifecycleGateBlockedReplay.nativeLifecycleVerifiedCount, 0);
  assert.equal(matrix.sourceEvidence.c1FreshApplyLifecycleGateBlockedReplay.nativeLifecycleBlockedCount, 38);
  assert.equal(matrix.sourceEvidence.c1FreshApplyLifecycleGateBlockedReplay.exactTextBindingMatched, 0);
  assert.equal(matrix.sourceEvidence.c1FreshApplyLifecycleGateBlockedReplay.exactTextBindingExpected, 105);
  assert.equal(matrix.sourceEvidence.c1FreshApplyLifecycleGateBlockedReplay.exactTextBindingUnmatched, 105);
  assert.equal(matrix.sourceEvidence.c1FreshApplyLifecycleGateBlockedReplay.exactTextBindingFailure, 'NO_EXACT_TEXT_CANDIDATE_OPERATION_ID_BINDING_FAILED');
  assert.equal(matrix.sourceEvidence.c1FreshApplyLifecycleGateBlockedReplay.exactTextBindingFirstUnmatched[0], 'c5v2-tracked_text_edit-0003');
  assert.equal(matrix.sourceEvidence.c1FreshApplyLifecycleGateBlockedReplay.formattingApplyCode, 'RTK_FORMATTING_OPERATION_UNKNOWN_KEY');
  assert.deepEqual(matrix.sourceEvidence.c1FreshApplyLifecycleGateBlockedReplay.gateFailures, [
    'PRODUCT_RETURN_APPLY_NOT_GREEN',
    'NATIVE_LIFECYCLE_VERIFICATION_NOT_GREEN',
    'NATIVE_LIFECYCLE_COVERAGE_NOT_GREEN',
    'COMPLETED_ROUND_REUSE_BINDING_NOT_GREEN',
  ]);
  assert.match(matrix.sourceEvidence.c1FreshApplyLifecycleGateBlockedReplay.wordWindowDiagnostics, /COMPLETE_ROUND_ORACLE_GREEN_TRUE/u);
  assert.match(matrix.sourceEvidence.c1FreshApplyLifecycleGateBlockedReplay.wordWindowDiagnostics, /APPLY_LIFECYCLE_REUSE_GATE_FAILED/u);
  assert.match(matrix.sourceEvidence.c1FreshApplyLifecycleGateBlockedReplay.wordWindowDiagnostics, /EXACT_LEDGER_BINDING_0_OF_105/u);
  assert.equal(matrix.sourceEvidence.c1ExactLedgerBindingRepairMerged.taskId, 'C1_WORD_ROUND01_EXACT_LEDGER_BINDING_REPAIR_V1');
  assert.equal(matrix.sourceEvidence.c1ExactLedgerBindingRepairMerged.pr, 1596);
  assert.equal(matrix.sourceEvidence.c1ExactLedgerBindingRepairMerged.prHeadSha, 'f53f80fe21828c270f04ef7766d2fe74bbe2d31f');
  assert.equal(matrix.sourceEvidence.c1ExactLedgerBindingRepairMerged.mergeSha, '8b3d9cbb3d76c43bd777104bf95cf209062e6d40');
  assert.equal(matrix.sourceEvidence.c1ExactLedgerBindingRepairMerged.mergeTree, 'c07b18ed3db7fbb859596e224830f371bd698320');
  assert.equal(matrix.sourceEvidence.c1ExactLedgerBindingRepairMerged.routePassClaim, false);
  assert.equal(matrix.sourceEvidence.c1ExactLedgerBindingRepairMerged.productApplyAuthority, false);
  assert.equal(matrix.sourceEvidence.c1CurrentRuntimePrecondition.classification, 'CALLER_IDENTITY_PROBE_ROUTING_RECLASSIFIED');
  assert.equal(matrix.sourceEvidence.c1CurrentRuntimePrecondition.probeModel, 'CALLER_IDENTITY_BOUND');
  assert.equal(matrix.sourceEvidence.c1CurrentRuntimePrecondition.systemEventsUiElementsEnabled, false);
  assert.equal(matrix.sourceEvidence.c1CurrentRuntimePrecondition.zshSystemEventsUiElementsEnabled, false);
  assert.equal(matrix.sourceEvidence.c1CurrentRuntimePrecondition.legacyUiElementsAuthority, 'ADVISORY_ONLY_CALLER_SPECIFIC');
  assert.equal(matrix.sourceEvidence.c1CurrentRuntimePrecondition.hammerspoonAccessibilityState, true);
  assert.equal(matrix.sourceEvidence.c1CurrentRuntimePrecondition.hammerspoonCallerIdentity, 'com.hammerspoon.Hammerspoon');
  assert.equal(matrix.sourceEvidence.c1CurrentRuntimePrecondition.wordProcessExists, false);
  assert.equal(matrix.sourceEvidence.c1CurrentRuntimePrecondition.wordNotRunningPermissionDenial, false);
  assert.equal(matrix.sourceEvidence.c1CurrentRuntimePrecondition.freshPhysicalReplayAuthority, 'ALLOW_GOVERNED_HAMMERSPOON_ACCESSIBILITY_ROUTE_FOR_W0_PHYSICAL_RECERTIFICATION');

  for (const route of matrix.routeDenominator) {
    assert.equal(route.fullCanonicalSyntheticBookRequired, true, route.routeId);
    assert.equal(route.userDocumentsAllowed, false, route.routeId);
    assert.equal(route.productMutationAuthority, 'DENY_UNTIL_ROUTE_CONTOUR_PROVES_APPLY_AUTHORITY', route.routeId);
    assert.notEqual(route.routeVerdict, 'PASS', route.routeId);
    assert.match(route.routeVerdict, /^(NEEDS_MORE_EVIDENCE|UNSUPPORTED|BLOCKED)$/u, route.routeId);
  }
});

test('Interop chain exact-head binding accepts only matching GitHub PR base metadata when local graph is shallow', async () => {
  const {
    INTEROP_CHAIN_EXACT_HEAD_SHA,
    INTEROP_CHAIN_PRE_APPLY_LIFECYCLE_REUSE_GATE_REPAIR_SHA,
    INTEROP_CHAIN_PRE_AUTH_REPAIR_ROUTE_SHA,
    resolveExactHeadBinding,
  } = await loadVerifier();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-chain-pr-event-'));
  const eventPath = path.join(tempDir, 'event.json');
  fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { base: { sha: INTEROP_CHAIN_EXACT_HEAD_SHA } } }), 'utf8');

  const accepted = resolveExactHeadBinding('/definitely/not/a/git/repo', {
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_EVENT_PATH: eventPath,
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.status, 'MATCHES_PULL_REQUEST_BASE_SHA_IN_SHALLOW_CHECKOUT');

  fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { base: { sha: INTEROP_CHAIN_PRE_AUTH_REPAIR_ROUTE_SHA } } }), 'utf8');
  const stalePreRepairBase = resolveExactHeadBinding('/definitely/not/a/git/repo', {
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_EVENT_PATH: eventPath,
  });
  assert.equal(stalePreRepairBase.ok, false);
  assert.equal(stalePreRepairBase.status, 'PULL_REQUEST_BASE_SHA_MISMATCH');
  assert.deepEqual(stalePreRepairBase.acceptedBaseShas, [INTEROP_CHAIN_EXACT_HEAD_SHA]);
  assert.ok(stalePreRepairBase.staleRejectedBaseShas.includes(INTEROP_CHAIN_PRE_AUTH_REPAIR_ROUTE_SHA));
  assert.ok(stalePreRepairBase.staleRejectedBaseShas.includes(INTEROP_CHAIN_PRE_APPLY_LIFECYCLE_REUSE_GATE_REPAIR_SHA));

  fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { base: { sha: '0'.repeat(40) } } }), 'utf8');
  const rejected = resolveExactHeadBinding('/definitely/not/a/git/repo', {
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_EVENT_PATH: eventPath,
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.status, 'PULL_REQUEST_BASE_SHA_MISMATCH');
});

test('Interop chain matrix binds Google whole-book evidence as scoped input, not chain closure', async () => {
  const { readChainMatrix, readLineageReceipt, verifyInteropChainMatrix } = await loadVerifier();
  const report = verifyInteropChainMatrix();
  assert.equal(report.ok, true, report.errors.join('\n'));

  const matrix = readChainMatrix();
  const receipt = readLineageReceipt();
  assert.equal(receipt.status, 'INTEROP_CHAIN_LINEAGE_DENOMINATOR_REGISTERED_NEEDS_MORE_EVIDENCE');
  assert.equal(receipt.matrixSha256, report.matrixSha256);
  assert.equal(receipt.googleWholeBookInput.status, 'SCOPED_EVIDENCE_ONLY_NOT_CHAIN_CLOSURE');
  assert.equal(receipt.googleWholeBookInput.programVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(receipt.googleWholeBookInput.interopChainPending, true);
  assert.equal(matrix.routeDenominator.every((route) => route.fullBookEvidenceRefs.includes('GOOGLE_DOCS_REAL_ACCOUNT_WHOLE_BOOK_E2E_V1') === false || route.routeId.startsWith('C4') || route.routeId.startsWith('C5') || route.routeId.startsWith('C6') || route.routeId.startsWith('C7') || route.routeId.startsWith('C8')), true);
});

test('Interop chain matrix hostile mutations are rejected fail-closed', async () => {
  const { validateInteropChainMatrix } = await loadVerifier();
  const base = await validFixture();

  const cases = [
    {
      name: 'missing-route',
      mutate(matrix) {
        matrix.routeDenominator = matrix.routeDenominator.filter((route) => route.routeId !== 'C8');
      },
      error: 'ROUTE_SET_MISMATCH',
    },
    {
      name: 'extra-route',
      mutate(matrix) {
        matrix.routeDenominator.push(clone(matrix.routeDenominator[0]));
        matrix.routeDenominator.at(-1).routeId = 'C9';
      },
      error: 'ROUTE_SET_MISMATCH',
    },
    {
      name: 'pass-without-full-route-evidence',
      mutate(matrix) {
        const route = matrix.routeDenominator[0];
        route.routeVerdict = 'PASS';
        route.executedFullRouteEvidence = [];
      },
      error: 'PASS_WITHOUT_EXECUTED_FULL_ROUTE_EVIDENCE',
    },
    {
      name: 'unknown-as-pass',
      mutate(matrix) {
        const route = matrix.routeDenominator[1];
        route.routeVerdict = 'PASS';
        route.accountingStatus = 'UNKNOWN';
      },
      error: 'UNKNOWN_ABSTAIN_CONFLICTING_CANNOT_PASS',
    },
    {
      name: 'abstain-as-pass',
      mutate(matrix) {
        const route = matrix.routeDenominator[2];
        route.routeVerdict = 'PASS';
        route.accountingStatus = 'ABSTAIN';
      },
      error: 'UNKNOWN_ABSTAIN_CONFLICTING_CANNOT_PASS',
    },
    {
      name: 'false-auto-apply-nonzero',
      mutate(matrix) {
        matrix.claimControls.falseAutoApplyCount = 1;
      },
      error: 'FALSE_AUTO_APPLY_COUNT_NONZERO',
    },
    {
      name: 'word-google-inheritance',
      mutate(matrix) {
        matrix.claimControls.wordEvidenceTransferToGoogle = 'ALLOW';
      },
      error: 'EVIDENCE_TRANSFER_MUST_BE_DENY',
    },
    {
      name: 'sampling-final-gate',
      mutate(matrix) {
        matrix.routeDenominator[0].fullCanonicalSyntheticBookRequired = false;
      },
      error: 'FULL_BOOK_REQUIRED',
    },
    {
      name: 'user-documents-allowed',
      mutate(matrix) {
        matrix.routeDenominator[0].userDocumentsAllowed = true;
      },
      error: 'USER_DOCUMENTS_MUST_BE_FORBIDDEN',
    },
    {
      name: 'stale-head',
      mutate(matrix) {
        matrix.exactHead = '0'.repeat(40);
      },
      error: 'EXACT_HEAD_MISMATCH',
    },
    {
      name: 'universal-parity-claim',
      mutate(matrix) {
        matrix.claimControls.universalParityClaim = 'ALLOW';
      },
      error: 'UNIVERSAL_PARITY_OR_BYTE_IDENTITY_CLAIM_DENIED',
    },
    {
      name: 'post-ledger-repair-route-pass-launder',
      mutate(matrix) {
        matrix.sourceEvidence.c1ExactLedgerBindingRepairMerged.routePassClaim = true;
      },
      error: 'C1_EXACT_LEDGER_REPAIR_ROUTE_PASS_LAUNDER',
    },
    {
      name: 'legacy-ui-elements-authority-launder',
      mutate(matrix) {
        matrix.sourceEvidence.c1CurrentRuntimePrecondition.legacyUiElementsAuthority = 'AUTHORITATIVE';
      },
      error: 'C1_CURRENT_RUNTIME_PRECONDITION_LEGACY_UI_ELEMENTS_AUTHORITY_INVALID',
    },
    {
      name: 'hammerspoon-accessibility-disabled-launder',
      mutate(matrix) {
        matrix.sourceEvidence.c1CurrentRuntimePrecondition.hammerspoonAccessibilityState = false;
      },
      error: 'C1_CURRENT_RUNTIME_PRECONDITION_HAMMERSPOON_ACCESSIBILITY_STATE_INVALID',
    },
  ];

  for (const item of cases) {
    const mutated = clone(base);
    item.mutate(mutated);
    const report = validateInteropChainMatrix(mutated);
    assert.equal(report.ok, false, item.name);
    assert.equal(report.errors.some((error) => error.includes(item.error)), true, `${item.name}: ${report.errors.join('\n')}`);
  }
});

test('Interop chain matrix is admitted into the maintained RTK graph', async () => {
  const { verifyInteropChainMatrix } = await loadVerifier();
  const report = verifyInteropChainMatrix({ checkCatalog: true });
  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.equal(report.catalogIncludesContract, true);
});
