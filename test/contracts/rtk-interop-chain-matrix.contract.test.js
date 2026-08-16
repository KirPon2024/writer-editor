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
    readChainMatrix,
    verifyInteropChainMatrix,
  } = await loadVerifier();

  const report = verifyInteropChainMatrix();
  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.equal(report.exactHead, INTEROP_CHAIN_EXACT_HEAD_SHA);
  assert.match(report.exactHeadBinding.status, /^(REACHABLE_FROM_CURRENT_HEAD|MATCHES_PULL_REQUEST_BASE_SHA_IN_SHALLOW_CHECKOUT|MATCHES_RECOVERY_PARENT_SHA_IN_SHALLOW_CHECKOUT|MATCHES_CURRENT_MAIN_BASE_SHA_IN_SHALLOW_CHECKOUT)$/u);

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

  for (const route of matrix.routeDenominator) {
    assert.equal(route.fullCanonicalSyntheticBookRequired, true, route.routeId);
    assert.equal(route.userDocumentsAllowed, false, route.routeId);
    assert.equal(route.productMutationAuthority, 'DENY_UNTIL_ROUTE_CONTOUR_PROVES_APPLY_AUTHORITY', route.routeId);
    assert.notEqual(route.routeVerdict, 'PASS', route.routeId);
    assert.match(route.routeVerdict, /^(NEEDS_MORE_EVIDENCE|UNSUPPORTED|BLOCKED)$/u, route.routeId);
  }
});

test('Interop chain exact-head binding accepts only matching GitHub PR base metadata when local graph is shallow', async () => {
  const { INTEROP_CHAIN_EXACT_HEAD_SHA, INTEROP_CHAIN_RECOVERY_PARENT_SHA, resolveExactHeadBinding } = await loadVerifier();
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

  fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { base: { sha: INTEROP_CHAIN_RECOVERY_PARENT_SHA } } }), 'utf8');
  const recoveredParent = resolveExactHeadBinding('/definitely/not/a/git/repo', {
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_EVENT_PATH: eventPath,
  });
  assert.equal(recoveredParent.ok, true);
  assert.equal(recoveredParent.status, 'MATCHES_RECOVERY_PARENT_SHA_IN_SHALLOW_CHECKOUT');
  assert.equal(recoveredParent.historicalExactHead, INTEROP_CHAIN_EXACT_HEAD_SHA);

  fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { base: { sha: '09ce09efd5ed11a3d68ae97bb0d0db6f0ba1ecba' } } }), 'utf8');
  const currentMergedBase = resolveExactHeadBinding('/definitely/not/a/git/repo', {
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_EVENT_PATH: eventPath,
  });
  assert.equal(currentMergedBase.ok, true);
  assert.equal(currentMergedBase.status, 'MATCHES_CURRENT_MAIN_BASE_SHA_IN_SHALLOW_CHECKOUT');
  assert.equal(currentMergedBase.historicalExactHead, INTEROP_CHAIN_EXACT_HEAD_SHA);

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
