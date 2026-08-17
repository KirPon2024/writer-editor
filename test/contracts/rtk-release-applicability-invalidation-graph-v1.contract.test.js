const assert = require('node:assert/strict');
const test = require('node:test');

const CURRENT_HEAD = 'a668fd01fc44146738263e50cba2608d9785c91b';
const CURRENT_TREE = 'a5564c34c70013e0c35e11eecb402d2f4677e42c';
const R2_RECEIPT_HEAD = 'a668fd01fc44146738263e50cba2608d9785c91b';
const R2_RECEIPT_TREE = 'a5564c34c70013e0c35e11eecb402d2f4677e42c';

async function loadGraphCompiler() {
  return import('../../scripts/ops/rtk-release-applicability-invalidation-graph-v1.mjs');
}

function sourceReceipt(overrides = {}) {
  return {
    id: 'receipt:r2-offline-release-claim-compiler-v0',
    schemaVersion: 'yalken.releaseClaimCompiler.receipt.v0',
    compilerId: 'R2_OFFLINE_RELEASE_CLAIM_COMPILER_V0',
    headSha: R2_RECEIPT_HEAD,
    treeSha: R2_RECEIPT_TREE,
    evidenceDigest: 'sha256:' + 'b'.repeat(64),
    status: 'PASS',
    verdict: 'VERIFIED_SCOPED',
    ...overrides,
  };
}

function providerProfile(overrides = {}) {
  return {
    id: 'word-mac-16.112-26081010',
    provider: 'Microsoft Word for Mac',
    bundleIdentifier: 'com.microsoft.Word',
    teamIdentifier: 'UBF8T346G9',
    version: '16.112',
    build: '16.112.26081010',
    status: 'CURRENT_VERIFIED',
    observedAtUtc: '2026-08-16T13:13:00.000Z',
    expiresAtUtc: '2026-09-15T00:00:00.000Z',
    evidenceDigest: 'sha256:' + 'c'.repeat(64),
    ...overrides,
  };
}

function claim(overrides = {}) {
  return {
    id: 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1',
    family: 'INTEROP_CHAIN',
    profileId: 'word-mac-16.112-26081010',
    scopeId: 'return-intake-authority-carrier-authentication-repair',
    denominatorId: 'c1-return-intake-authority-carrier-authentication-repair',
    exactHeadSha: CURRENT_HEAD,
    exactTreeSha: CURRENT_TREE,
    status: 'PASS',
    verdict: 'VERIFIED_SCOPED',
    sourceReceiptIds: ['receipt:r2-offline-release-claim-compiler-v0'],
    providerProfileId: 'word-mac-16.112-26081010',
    dependsOn: [],
    conflictsWith: [],
    nonClaims: ['C1_ROUTE_PASS', 'CHAIN_SATURATION', 'USER_DOCUMENT_COVERAGE'],
    outcomes: ['PASS'],
    receiptRefs: [
      {
        id: 'receipt:pr1575-postmerge-c1-return-intake-authentication-repair',
        claimId: 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1',
        profileId: 'word-mac-16.112-26081010',
        scopeId: 'return-intake-authority-carrier-authentication-repair',
        headSha: CURRENT_HEAD,
        treeSha: CURRENT_TREE,
        evidenceDigest: 'sha256:' + 'd'.repeat(64),
        status: 'PASS',
        verdict: 'VERIFIED_SCOPED',
        outcomes: ['PASS'],
        supersededBy: null,
      },
    ],
    ...overrides,
  };
}

function baseInput(overrides = {}) {
  return {
    schemaVersion: 'yalken.releaseApplicabilityInvalidationGraph.input.v1',
    compilerId: 'R3_APPLICABILITY_INVALIDATION_GRAPH_V1',
    generatedAtUtc: '2026-08-16T17:20:00.000Z',
    nowUtc: '2026-08-16T17:20:00.000Z',
    exact: {
      headSha: CURRENT_HEAD,
      treeSha: CURRENT_TREE,
      buildId: 'postmerge-local-node-22.22.2-npm-10.9.7',
    },
    sourceReceipts: [sourceReceipt()],
    providerProfiles: [providerProfile()],
    revocations: [],
    supersessions: [],
    conflicts: [],
    claims: [
      claim(),
      claim({
        id: 'INTEROP_CHAIN_SATURATION_V1',
        family: 'INTEROP_CHAIN',
        profileId: 'word-google-chain',
        scopeId: 'c1-c8-full-book-denominator',
        denominatorId: 'interop-c1-c8-full-book-route-matrix',
        providerProfileId: null,
        dependsOn: ['C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1'],
        nonClaims: ['ALL_ROUTES_PROVEN', 'UNIVERSAL_PARITY', 'BYTE_IDENTITY'],
        status: 'NEEDS_MORE_EVIDENCE',
        verdict: 'BLOCKED',
        outcomes: ['BLOCKED'],
        receiptRefs: [
          {
            id: 'receipt:chain-saturation-blocked-after-r2',
            claimId: 'INTEROP_CHAIN_SATURATION_V1',
            profileId: 'word-google-chain',
            scopeId: 'c1-c8-full-book-denominator',
            headSha: CURRENT_HEAD,
            treeSha: CURRENT_TREE,
            evidenceDigest: 'sha256:' + 'e'.repeat(64),
            status: 'NEEDS_MORE_EVIDENCE',
            verdict: 'BLOCKED',
            outcomes: ['BLOCKED'],
            supersededBy: null,
          },
        ],
      }),
      claim({
        id: 'F3_PHYSICAL_OWNER_OFFHOST_RESTORE_V1',
        family: 'BLACK_BOX_RECOVERY',
        profileId: 'owner-offhost-removable-media',
        scopeId: 'physical-owner-key-restore-drill',
        denominatorId: 'physical-owner-key-offhost-removable-media-restore',
        providerProfileId: null,
        nonClaims: ['FINAL_PROGRAM_READY', 'OFFHOST_RESTORE_PASS', 'PHYSICAL_OWNER_DRILL_PASS'],
        status: 'NEEDS_MORE_EVIDENCE',
        verdict: 'BLOCKED',
        outcomes: ['BLOCKED'],
        receiptRefs: [
          {
            id: 'receipt:f3-physical-remains-blocked',
            claimId: 'F3_PHYSICAL_OWNER_OFFHOST_RESTORE_V1',
            profileId: 'owner-offhost-removable-media',
            scopeId: 'physical-owner-key-restore-drill',
            headSha: CURRENT_HEAD,
            treeSha: CURRENT_TREE,
            evidenceDigest: 'sha256:' + 'f'.repeat(64),
            status: 'NEEDS_MORE_EVIDENCE',
            verdict: 'BLOCKED',
            outcomes: ['BLOCKED'],
            supersededBy: null,
          },
        ],
      }),
    ],
    ...overrides,
  };
}

function nodeFor(graph, id) {
  const row = graph.nodes.find((node) => node.id === id);
  assert.ok(row, `missing graph node ${id}`);
  return row;
}

test('R3 compiler emits a closed exact-head graph without upgrading blocked release claims', async () => {
  const { compileApplicabilityInvalidationGraph, RECEIPT_SCHEMA_VERSION } = await loadGraphCompiler();
  const graph = compileApplicabilityInvalidationGraph(baseInput());

  assert.equal(graph.schemaVersion, RECEIPT_SCHEMA_VERSION);
  assert.equal(graph.ok, true, graph.errors.join('\n'));
  assert.equal(graph.exact.headSha, CURRENT_HEAD);
  assert.equal(graph.exact.treeSha, CURRENT_TREE);
  assert.equal(graph.programVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(graph.releaseAuthority, 'DENY');
  assert.equal(graph.productMutationAuthority, 'DENY');
  assert.equal(graph.providerMutationAuthority, 'DENY');

  const scoped = nodeFor(graph, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1');
  assert.equal(scoped.state, 'APPLICABLE_SCOPED');
  assert.equal(scoped.applicabilityDecision, 'APPLIES_TO_EXACT_SCOPE_ONLY');
  assert.deepEqual(scoped.nonClaims, ['C1_ROUTE_PASS', 'CHAIN_SATURATION', 'USER_DOCUMENT_COVERAGE']);

  const chain = nodeFor(graph, 'INTEROP_CHAIN_SATURATION_V1');
  assert.equal(chain.state, 'BLOCKED');
  assert.equal(chain.applicabilityDecision, 'DENY');
  assert.match(chain.reasons.join('\n'), /CLAIM_NOT_VERIFIED_SCOPED:NEEDS_MORE_EVIDENCE:BLOCKED/);

  const f3 = nodeFor(graph, 'F3_PHYSICAL_OWNER_OFFHOST_RESTORE_V1');
  assert.equal(f3.state, 'BLOCKED');
  assert.match(f3.reasons.join('\n'), /CLAIM_NOT_VERIFIED_SCOPED/);

  assert.equal(graph.denominators.claimsTotal, 3);
  assert.equal(graph.denominators.applicableScoped, 1);
  assert.equal(graph.denominators.blockedOrInvalid, 2);
  assert.ok(graph.edges.some((edge) => edge.type === 'DEPENDS_ON' && edge.from === 'INTEROP_CHAIN_SATURATION_V1'));
});

test('R3 compiler fails closed on wrong exact binding and stale source receipts', async () => {
  const { compileApplicabilityInvalidationGraph } = await loadGraphCompiler();

  const wrongHead = compileApplicabilityInvalidationGraph(baseInput({
    exact: { headSha: '0'.repeat(40), treeSha: CURRENT_TREE, buildId: 'postmerge-local-node-22.22.2-npm-10.9.7' },
  }));
  assert.equal(wrongHead.ok, false);
  assert.equal(nodeFor(wrongHead, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1').state, 'STALE');

  const missingSource = compileApplicabilityInvalidationGraph(baseInput({
    sourceReceipts: [],
  }));
  assert.equal(nodeFor(missingSource, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1').state, 'BLOCKED');
  assert.match(nodeFor(missingSource, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1').reasons.join('\n'), /SOURCE_RECEIPT_MISSING/);
});

test('R3 propagates revocation and supersession through dependent claims', async () => {
  const { compileApplicabilityInvalidationGraph } = await loadGraphCompiler();

  const revoked = compileApplicabilityInvalidationGraph(baseInput({
    revocations: [
      {
        claimId: 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1',
        active: true,
        reason: 'OWNER_REVOKED_PROVIDER_BINDING',
      },
    ],
  }));
  assert.equal(nodeFor(revoked, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1').state, 'REVOKED');
  assert.equal(nodeFor(revoked, 'INTEROP_CHAIN_SATURATION_V1').state, 'REVOKED');
  assert.match(nodeFor(revoked, 'INTEROP_CHAIN_SATURATION_V1').reasons.join('\n'), /DEPENDENCY_NOT_APPLICABLE/);

  const superseded = compileApplicabilityInvalidationGraph(baseInput({
    supersessions: [
      {
        fromClaimId: 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1',
        toClaimId: 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V2',
        active: true,
        reason: 'NEWER_C1_AUTHORITY_RECEIPT',
      },
    ],
  }));
  assert.equal(nodeFor(superseded, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1').state, 'STALE');
  assert.equal(nodeFor(superseded, 'INTEROP_CHAIN_SATURATION_V1').state, 'STALE');
});

test('R3 rejects expired providers conflicts transplants replays and scope laundering', async () => {
  const { compileApplicabilityInvalidationGraph } = await loadGraphCompiler();

  const expiredProvider = compileApplicabilityInvalidationGraph(baseInput({
    nowUtc: '2026-10-01T00:00:00.000Z',
  }));
  assert.equal(nodeFor(expiredProvider, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1').state, 'STALE');

  const conflict = compileApplicabilityInvalidationGraph(baseInput({
    conflicts: [
      {
        claimIds: [
          'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1',
          'INTEROP_CHAIN_SATURATION_V1',
        ],
        active: true,
        reason: 'MUTUALLY_EXCLUSIVE_PROFILE_FACTS',
      },
    ],
  }));
  assert.equal(nodeFor(conflict, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1').state, 'CONFLICT');
  assert.equal(nodeFor(conflict, 'INTEROP_CHAIN_SATURATION_V1').state, 'CONFLICT');

  const transplanted = compileApplicabilityInvalidationGraph(baseInput({
    claims: [
      {
        ...claim(),
        receiptRefs: [
          {
            ...claim().receiptRefs[0],
            claimId: 'OTHER_CLAIM',
          },
        ],
      },
    ],
  }));
  assert.equal(nodeFor(transplanted, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1').state, 'CONFLICT');

  const replay = compileApplicabilityInvalidationGraph(baseInput({
    claims: [
      {
        ...claim(),
        receiptRefs: [
          {
            ...claim().receiptRefs[0],
            headSha: '3'.repeat(40),
            treeSha: R2_RECEIPT_TREE,
          },
        ],
      },
    ],
  }));
  assert.equal(nodeFor(replay, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1').state, 'STALE');

  const scopeLaundered = compileApplicabilityInvalidationGraph(baseInput({
    claims: [
      {
        ...claim(),
        scopeId: 'universal-google-word-chain',
      },
    ],
  }));
  assert.equal(nodeFor(scopeLaundered, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1').state, 'CONFLICT');
});

test('R3 never aggregates UNKNOWN ABSTAIN STALE or CONFLICT into applicability and has zero mutation survivors', async () => {
  const {
    compileApplicabilityInvalidationGraph,
    runIndependentApplicabilityGraphOracle,
    runApplicabilityMutationCatalog,
  } = await loadGraphCompiler();

  for (const outcome of ['UNKNOWN', 'ABSTAIN', 'STALE', 'CONFLICT']) {
    const graph = compileApplicabilityInvalidationGraph(baseInput({
      claims: [
        {
          ...claim(),
          outcomes: [outcome],
          receiptRefs: [{ ...claim().receiptRefs[0], outcomes: [outcome] }],
        },
      ],
    }));
    assert.notEqual(nodeFor(graph, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1').state, 'APPLICABLE_SCOPED');
    assert.equal(graph.programVerdict, 'NEEDS_MORE_EVIDENCE');
  }

  const graph = compileApplicabilityInvalidationGraph(baseInput());
  const oracle = runIndependentApplicabilityGraphOracle(baseInput(), graph);
  assert.equal(oracle.ok, true, oracle.errors.join('\n'));

  const mutations = runApplicabilityMutationCatalog(baseInput());
  assert.equal(mutations.total, 12);
  assert.equal(mutations.killed, 12);
  assert.deepEqual(mutations.survivors, []);
});
