const assert = require('node:assert/strict');
const test = require('node:test');

const CURRENT_HEAD = 'dcb38b3295bccd675b82c3bc837ecc345887978b';
const CURRENT_TREE = '955fa8f7585f5be0b9a8fc2af5db324e6d225332';

async function loadCompiler() {
  return import('../../scripts/ops/rtk-release-claim-compiler-v0.mjs');
}

function greenCheck(name = 'rtk-required') {
  return {
    name,
    status: 'completed',
    conclusion: 'success',
    headSha: CURRENT_HEAD,
  };
}

function baseReceipt(overrides = {}) {
  return {
    id: 'receipt:c1-return-intake-carrier-authentication-repair',
    claimId: 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1',
    status: 'PASS',
    verdict: 'VERIFIED_SCOPED',
    headSha: CURRENT_HEAD,
    treeSha: CURRENT_TREE,
    profileId: 'word-mac-16.112-26081010',
    scopeId: 'return-intake-authority-carrier-authentication-repair',
    machineCheckIds: ['rtk-required', 'OSS policy', 'x1-runtime-parity'],
    evidenceDigest: 'sha256:' + 'a'.repeat(64),
    outcomes: ['PASS'],
    expiresAtUtc: '2026-09-15T00:00:00.000Z',
    supersededBy: null,
    ...overrides,
  };
}

function baseInput(overrides = {}) {
  return {
    schemaVersion: 'yalken.releaseClaimCompiler.input.v0',
    compilerId: 'R2_OFFLINE_RELEASE_CLAIM_COMPILER_V0',
    generatedAtUtc: '2026-08-16T15:40:00.000Z',
    nowUtc: '2026-08-16T15:40:00.000Z',
    exact: {
      headSha: CURRENT_HEAD,
      treeSha: CURRENT_TREE,
      buildId: 'postmerge-local-node-22.22.2',
    },
    expectedExact: {
      headSha: CURRENT_HEAD,
      treeSha: CURRENT_TREE,
      buildId: 'postmerge-local-node-22.22.2',
    },
    requiredChecks: [
      greenCheck('rtk-required'),
      greenCheck('OSS policy'),
      greenCheck('x1-runtime-parity'),
    ],
    revocations: [],
    claims: [
      {
        id: 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1',
        family: 'INTEROP_CHAIN',
        profileId: 'word-mac-16.112-26081010',
        scopeId: 'return-intake-authority-carrier-authentication-repair',
        exactHeadSha: CURRENT_HEAD,
        exactTreeSha: CURRENT_TREE,
        requiredCheckNames: ['rtk-required', 'OSS policy', 'x1-runtime-parity'],
        nonClaims: ['C1_ROUTE_PASS', 'CHAIN_SATURATION', 'AUTO_APPLY', 'USER_DOCUMENT_COVERAGE'],
        receipts: [baseReceipt()],
        providerFacts: [
          { key: 'word.version', value: '16.112' },
          { key: 'word.build', value: '16.112.26081010' },
        ],
        runtimeFacts: [
          { key: 'productMutationAuthority', value: 'DENY' },
        ],
      },
      {
        id: 'INTEROP_CHAIN_SATURATION_V1',
        family: 'INTEROP_CHAIN',
        profileId: 'word-google-chain',
        scopeId: 'c1-c8-full-book-denominator',
        exactHeadSha: CURRENT_HEAD,
        exactTreeSha: CURRENT_TREE,
        requiredCheckNames: ['rtk-required'],
        nonClaims: ['UNIVERSAL_PARITY', 'BYTE_IDENTITY'],
        receipts: [
          baseReceipt({
            id: 'receipt:c1-route-blocked',
            claimId: 'INTEROP_CHAIN_SATURATION_V1',
            status: 'NEEDS_MORE_EVIDENCE',
            verdict: 'BLOCKED',
            profileId: 'word-google-chain',
            scopeId: 'c1-c8-full-book-denominator',
            outcomes: ['BLOCKED'],
          }),
        ],
        providerFacts: [],
        runtimeFacts: [{ key: 'route.C1', value: 'BLOCKED' }],
      },
    ],
    ...overrides,
  };
}

function stateFor(report, claimId) {
  const row = report.claims.find((claim) => claim.id === claimId);
  assert.ok(row, `missing claim ${claimId}`);
  return row;
}

test('R2 compiler produces a closed scoped current report without upgrading blocked chain claims', async () => {
  const { compileReleaseClaims, RECEIPT_SCHEMA_VERSION } = await loadCompiler();
  const report = compileReleaseClaims(baseInput());

  assert.equal(report.schemaVersion, RECEIPT_SCHEMA_VERSION);
  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.equal(report.exact.headSha, CURRENT_HEAD);
  assert.equal(report.exact.treeSha, CURRENT_TREE);
  assert.equal(report.programVerdict, 'NEEDS_MORE_EVIDENCE');

  const repaired = stateFor(report, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1');
  assert.equal(repaired.state, 'VERIFIED_SCOPED');
  assert.equal(repaired.applyDecision, 'DENY');
  assert.deepEqual(repaired.nonClaims, ['AUTO_APPLY', 'C1_ROUTE_PASS', 'CHAIN_SATURATION', 'USER_DOCUMENT_COVERAGE']);

  const chain = stateFor(report, 'INTEROP_CHAIN_SATURATION_V1');
  assert.equal(chain.state, 'BLOCKED');
  assert.match(chain.reasons.join('\n'), /RECEIPT_NOT_PASS/);
});

test('R2 compiler fails closed for wrong head tree build or missing required check', async () => {
  const { compileReleaseClaims } = await loadCompiler();

  const wrongHead = compileReleaseClaims(baseInput({
    exact: { headSha: '0'.repeat(40), treeSha: CURRENT_TREE, buildId: 'postmerge-local-node-22.22.2' },
  }));
  assert.equal(wrongHead.ok, false);
  assert.match(wrongHead.errors.join('\n'), /EXACT_HEAD_MISMATCH/);
  assert.equal(stateFor(wrongHead, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1').state, 'STALE');

  const wrongTree = compileReleaseClaims(baseInput({
    exact: { headSha: CURRENT_HEAD, treeSha: '1'.repeat(40), buildId: 'postmerge-local-node-22.22.2' },
  }));
  assert.equal(wrongTree.ok, false);
  assert.match(wrongTree.errors.join('\n'), /EXACT_TREE_MISMATCH/);
  assert.equal(stateFor(wrongTree, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1').state, 'STALE');

  const missingExpected = compileReleaseClaims(baseInput({ expectedExact: undefined }));
  assert.equal(missingExpected.ok, false);
  assert.match(missingExpected.errors.join('\n'), /EXPECTED_EXACT_BINDING_MISSING/);

  const forgedExpected = compileReleaseClaims(baseInput({
    expectedExact: { headSha: '2'.repeat(40), treeSha: CURRENT_TREE, buildId: 'postmerge-local-node-22.22.2' },
  }));
  assert.equal(forgedExpected.ok, false);
  assert.match(forgedExpected.errors.join('\n'), /EXACT_HEAD_MISMATCH/);

  const missingCheck = compileReleaseClaims(baseInput({
    requiredChecks: [greenCheck('OSS policy'), greenCheck('x1-runtime-parity')],
  }));
  assert.equal(stateFor(missingCheck, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1').state, 'BLOCKED');
  assert.match(stateFor(missingCheck, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1').reasons.join('\n'), /MISSING_REQUIRED_CHECK:rtk-required/);
});

test('R2 compiler rejects stale superseded transplanted and scope-forged receipts', async () => {
  const { compileReleaseClaims } = await loadCompiler();

  const stale = compileReleaseClaims(baseInput({
    claims: [{
      ...baseInput().claims[0],
      receipts: [baseReceipt({ headSha: '2'.repeat(40) })],
    }],
  }));
  assert.equal(stateFor(stale, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1').state, 'STALE');

  const superseded = compileReleaseClaims(baseInput({
    claims: [{
      ...baseInput().claims[0],
      receipts: [baseReceipt({ supersededBy: 'receipt:newer' })],
    }],
  }));
  assert.equal(stateFor(superseded, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1').state, 'STALE');

  const transplanted = compileReleaseClaims(baseInput({
    claims: [{
      ...baseInput().claims[0],
      receipts: [baseReceipt({ claimId: 'OTHER_CLAIM' })],
    }],
  }));
  assert.equal(stateFor(transplanted, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1').state, 'CONFLICT');

  const forgedScope = compileReleaseClaims(baseInput({
    claims: [{
      ...baseInput().claims[0],
      receipts: [baseReceipt({ scopeId: 'expanded-universal-scope' })],
    }],
  }));
  assert.equal(stateFor(forgedScope, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1').state, 'CONFLICT');
});

test('R2 compiler lets active revocation conflict and expired provider profiles dominate historical pass', async () => {
  const { compileReleaseClaims } = await loadCompiler();

  const revoked = compileReleaseClaims(baseInput({
    revocations: [{
      claimId: 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1',
      active: true,
      reason: 'OWNER_REVOKED_STALE_PROVIDER',
    }],
  }));
  assert.equal(stateFor(revoked, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1').state, 'REVOKED');

  const providerConflict = compileReleaseClaims(baseInput({
    claims: [{
      ...baseInput().claims[0],
      providerFacts: [
        { key: 'word.build', value: '16.112.26081010' },
        { key: 'word.build', value: '16.113.26090000' },
      ],
    }],
  }));
  assert.equal(stateFor(providerConflict, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1').state, 'CONFLICT');

  const expired = compileReleaseClaims(baseInput({
    nowUtc: '2026-10-01T00:00:00.000Z',
  }));
  assert.equal(stateFor(expired, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1').state, 'STALE');
});

test('R2 compiler never aggregates UNKNOWN ABSTAIN STALE or CONFLICT into PASS and has zero mutation survivors', async () => {
  const {
    compileReleaseClaims,
    runIndependentReleaseClaimOracle,
    runSemanticMutationCatalog,
  } = await loadCompiler();

  for (const outcome of ['UNKNOWN', 'ABSTAIN', 'STALE', 'CONFLICT']) {
    const report = compileReleaseClaims(baseInput({
      claims: [{
        ...baseInput().claims[0],
        receipts: [baseReceipt({ outcomes: [outcome] })],
      }],
    }));
    assert.notEqual(stateFor(report, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1').state, 'VERIFIED_SCOPED');
    assert.equal(report.programVerdict, 'NEEDS_MORE_EVIDENCE');
  }

  const report = compileReleaseClaims(baseInput());
  const oracle = runIndependentReleaseClaimOracle(baseInput(), report);
  assert.equal(oracle.ok, true, oracle.errors.join('\n'));

  const mutations = runSemanticMutationCatalog(baseInput());
  assert.equal(mutations.total, 9);
  assert.equal(mutations.killed, 9);
  assert.deepEqual(mutations.survivors, []);
});
