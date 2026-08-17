const assert = require('node:assert/strict');
const test = require('node:test');

const CURRENT_HEAD = 'dcb38b3295bccd675b82c3bc837ecc345887978b';
const CURRENT_TREE = '955fa8f7585f5be0b9a8fc2af5db324e6d225332';
const R3_HEAD = 'dcb38b3295bccd675b82c3bc837ecc345887978b';
const R3_TREE = '955fa8f7585f5be0b9a8fc2af5db324e6d225332';

async function loadPublisher() {
  return import('../../scripts/ops/rtk-release-claim-publication-v1.mjs');
}

function baseR3Receipt(overrides = {}) {
  return {
    schemaVersion: 'yalken.releaseApplicabilityInvalidationGraph.receipt.v1',
    compilerId: 'R3_APPLICABILITY_INVALIDATION_GRAPH_V1',
    ok: true,
    generatedAtUtc: '2026-08-16T17:20:00.000Z',
    exact: {
      headSha: R3_HEAD,
      treeSha: R3_TREE,
      buildId: 'postmerge-local-node-22.22.2-npm-10.9.7',
    },
    inputReceipts: [
      {
        id: 'receipt:r2-offline-release-claim-compiler-v0',
        schemaVersion: 'yalken.releaseClaimCompiler.receipt.v0',
        compilerId: 'R2_OFFLINE_RELEASE_CLAIM_COMPILER_V0',
        headSha: CURRENT_HEAD,
        treeSha: CURRENT_TREE,
        evidenceDigest: `sha256:${'2'.repeat(64)}`,
      },
    ],
    programVerdict: 'NEEDS_MORE_EVIDENCE',
    releaseAuthority: 'DENY',
    productMutationAuthority: 'DENY',
    providerMutationAuthority: 'DENY',
    nodes: [
      {
        id: 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1',
        family: 'INTEROP_CHAIN',
        profileId: 'word-mac-16.112-26081010',
        scopeId: 'return-intake-authority-carrier-authentication-repair',
        denominatorId: 'c1-return-intake-authority-carrier-authentication-repair',
        state: 'APPLICABLE_SCOPED',
        applicabilityDecision: 'APPLIES_TO_EXACT_SCOPE_ONLY',
        reasons: [],
        invalidatedBy: [],
        nonClaims: ['C1_ROUTE_PASS', 'CHAIN_SATURATION', 'USER_DOCUMENT_COVERAGE'],
      },
      {
        id: 'INTEROP_CHAIN_SATURATION_V1',
        family: 'INTEROP_CHAIN',
        profileId: 'word-google-chain',
        scopeId: 'c1-c8-full-book-denominator',
        denominatorId: 'interop-c1-c8-full-book-route-matrix',
        state: 'BLOCKED',
        applicabilityDecision: 'DENY',
        reasons: ['CLAIM_NOT_VERIFIED_SCOPED:NEEDS_MORE_EVIDENCE:BLOCKED'],
        invalidatedBy: ['receipt:chain-saturation-blocked-after-r2'],
        nonClaims: ['ALL_ROUTES_PROVEN', 'BYTE_IDENTITY', 'UNIVERSAL_PARITY'],
      },
      {
        id: 'F3_PHYSICAL_OWNER_OFFHOST_RESTORE_V1',
        family: 'BLACK_BOX_RECOVERY',
        profileId: 'owner-offhost-removable-media',
        scopeId: 'physical-owner-key-restore-drill',
        denominatorId: 'physical-owner-key-offhost-removable-media-restore',
        state: 'BLOCKED',
        applicabilityDecision: 'DENY',
        reasons: ['CLAIM_NOT_VERIFIED_SCOPED:NEEDS_MORE_EVIDENCE:BLOCKED'],
        invalidatedBy: ['receipt:f3-physical-remains-blocked'],
        nonClaims: ['FINAL_PROGRAM_READY', 'OFFHOST_RESTORE_PASS', 'PHYSICAL_OWNER_DRILL_PASS'],
      },
    ],
    edges: [
      {
        from: 'INTEROP_CHAIN_SATURATION_V1',
        to: 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1',
        type: 'DEPENDS_ON',
      },
    ],
    invalidations: [
      {
        claimId: 'INTEROP_CHAIN_SATURATION_V1',
        state: 'BLOCKED',
        reason: 'CLAIM_NOT_VERIFIED_SCOPED:NEEDS_MORE_EVIDENCE:BLOCKED',
      },
    ],
    denominators: {
      claimsTotal: 3,
      applicableScoped: 1,
      blockedOrInvalid: 2,
      edgesTotal: 1,
      sourceReceiptsTotal: 1,
      providerProfilesTotal: 1,
      revocationsActive: 0,
      supersessionsActive: 0,
      conflictsActive: 0,
    },
    errors: [],
    oracle: { ok: true, errors: [] },
    mutations: { total: 12, killed: 12, survivors: [] },
    limitations: ['Program verdict remains NEEDS_MORE_EVIDENCE.'],
    ...overrides,
  };
}

function baseInput(overrides = {}) {
  return {
    schemaVersion: 'yalken.releaseClaimPublication.input.v1',
    publisherId: 'R4_EXACT_HEAD_CLAIM_PUBLICATION_V1',
    generatedAtUtc: '2026-08-16T19:20:00.000Z',
    exact: {
      headSha: CURRENT_HEAD,
      treeSha: CURRENT_TREE,
      buildId: 'postmerge-local-node-22.22.2-npm-10.9.7',
    },
    expectedExact: {
      headSha: CURRENT_HEAD,
      treeSha: CURRENT_TREE,
      buildId: 'postmerge-local-node-22.22.2-npm-10.9.7',
    },
    requiredChecks: [
      { name: 'oss-policy', status: 'completed', conclusion: 'success', headSha: CURRENT_HEAD },
      { name: 'rtk-required', status: 'completed', conclusion: 'success', headSha: CURRENT_HEAD },
      { name: 'x1-runtime-parity (ubuntu-latest)', status: 'completed', conclusion: 'success', headSha: CURRENT_HEAD },
      { name: 'x1-runtime-parity (windows-latest)', status: 'completed', conclusion: 'success', headSha: CURRENT_HEAD },
      { name: 'postmerge-full-rtk', status: 'completed', conclusion: 'success', headSha: CURRENT_HEAD },
    ],
    r3Receipt: baseR3Receipt(),
    activeVetoes: [],
    ...overrides,
  };
}

function claimFor(publication, claimId) {
  const claim = publication.claims.find((row) => row.id === claimId);
  assert.ok(claim, `missing claim ${claimId}`);
  return claim;
}

test('R4 publishes a closed exact-head aggregate without upgrading blocked or unproven claims', async () => {
  const { publishExactHeadClaims, RECEIPT_SCHEMA_VERSION } = await loadPublisher();
  const publication = publishExactHeadClaims(baseInput());

  assert.equal(publication.schemaVersion, RECEIPT_SCHEMA_VERSION);
  assert.equal(publication.publisherId, 'R4_EXACT_HEAD_CLAIM_PUBLICATION_V1');
  assert.equal(publication.ok, true, publication.errors.join('\n'));
  assert.equal(publication.exact.headSha, CURRENT_HEAD);
  assert.equal(publication.exact.treeSha, CURRENT_TREE);
  assert.equal(publication.programVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(publication.releaseAuthority, 'DENY');
  assert.equal(publication.productMutationAuthority, 'DENY');
  assert.equal(publication.providerMutationAuthority, 'DENY');
  assert.equal(publication.publicationDecision, 'PUBLISH_SCOPED_NON_RELEASE_AGGREGATE');

  const c1 = claimFor(publication, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1');
  assert.equal(c1.publicationState, 'PUBLISHED_SCOPED');
  assert.deepEqual(c1.nonClaims, ['C1_ROUTE_PASS', 'CHAIN_SATURATION', 'USER_DOCUMENT_COVERAGE']);

  const chain = claimFor(publication, 'INTEROP_CHAIN_SATURATION_V1');
  assert.equal(chain.publicationState, 'BLOCKED_NOT_PUBLISHED');
  assert.match(chain.reasons.join('\n'), /CLAIM_NOT_VERIFIED_SCOPED/);

  const f3 = claimFor(publication, 'F3_PHYSICAL_OWNER_OFFHOST_RESTORE_V1');
  assert.equal(f3.publicationState, 'BLOCKED_NOT_PUBLISHED');
  assert.equal(publication.denominators.claimsTotal, 3);
  assert.equal(publication.denominators.publishedScoped, 1);
  assert.equal(publication.denominators.blockedNotPublished, 2);
});

test('R4 fails closed on wrong current head tree stale R3 receipt or missing required checks', async () => {
  const { publishExactHeadClaims } = await loadPublisher();

  const wrongHead = publishExactHeadClaims(baseInput({
    exact: { headSha: '0'.repeat(40), treeSha: CURRENT_TREE, buildId: 'postmerge-local-node-22.22.2-npm-10.9.7' },
  }));
  assert.equal(wrongHead.ok, false);
  assert.match(wrongHead.errors.join('\n'), /EXACT_HEAD_MISMATCH/);

  const wrongTree = publishExactHeadClaims(baseInput({
    exact: { headSha: CURRENT_HEAD, treeSha: '1'.repeat(40), buildId: 'postmerge-local-node-22.22.2-npm-10.9.7' },
  }));
  assert.equal(wrongTree.ok, false);
  assert.match(wrongTree.errors.join('\n'), /EXACT_TREE_MISMATCH/);

  const missingExpected = publishExactHeadClaims(baseInput({ expectedExact: undefined }));
  assert.equal(missingExpected.ok, false);
  assert.match(missingExpected.errors.join('\n'), /EXPECTED_EXACT_BINDING_MISSING/);

  const forgedExpected = publishExactHeadClaims(baseInput({
    expectedExact: { headSha: '3'.repeat(40), treeSha: CURRENT_TREE, buildId: 'postmerge-local-node-22.22.2-npm-10.9.7' },
  }));
  assert.equal(forgedExpected.ok, false);
  assert.match(forgedExpected.errors.join('\n'), /EXACT_HEAD_MISMATCH/);

  const staleR3 = publishExactHeadClaims(baseInput({
    r3Receipt: baseR3Receipt({ exact: { headSha: '2'.repeat(40), treeSha: R3_TREE, buildId: 'old' } }),
  }));
  assert.equal(staleR3.ok, false);
  assert.match(staleR3.errors.join('\n'), /R3_RECEIPT_HEAD_MISMATCH/);

  const missingCheck = publishExactHeadClaims(baseInput({
    requiredChecks: [{ name: 'rtk-required', status: 'completed', conclusion: 'success', headSha: CURRENT_HEAD }],
  }));
  assert.equal(missingCheck.ok, false);
  assert.match(missingCheck.errors.join('\n'), /MISSING_REQUIRED_CHECK:postmerge-full-rtk/);
});

test('R4 never turns UNKNOWN ABSTAIN STALE CONFLICT or active vetoes into published PASS', async () => {
  const { publishExactHeadClaims } = await loadPublisher();

  for (const state of ['UNKNOWN', 'ABSTAIN', 'STALE', 'CONFLICT', 'REVOKED']) {
    const receipt = baseR3Receipt({
      nodes: [
        {
          ...baseR3Receipt().nodes[0],
          state,
          applicabilityDecision: 'DENY',
          reasons: [`FORCED_${state}`],
        },
      ],
      denominators: { ...baseR3Receipt().denominators, claimsTotal: 1, applicableScoped: 0, blockedOrInvalid: 1 },
    });
    const publication = publishExactHeadClaims(baseInput({ r3Receipt: receipt }));
    assert.notEqual(claimFor(publication, 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1').publicationState, 'PUBLISHED_SCOPED');
  }

  const vetoed = publishExactHeadClaims(baseInput({
    activeVetoes: [{ id: 'OFFLINE_RELEASE_CLAIM_COMPILER_NOT_PROVEN', active: true, scope: 'BROAD_OR_AGGREGATE_READY' }],
  }));
  assert.equal(vetoed.ok, false);
  assert.equal(vetoed.publicationDecision, 'DENY');
  assert.match(vetoed.errors.join('\n'), /ACTIVE_VETO/);
});

test('R4 independent oracle and mutation catalog are closed with zero survivors', async () => {
  const {
    publishExactHeadClaims,
    runIndependentPublicationOracle,
    runSemanticMutationCatalog,
  } = await loadPublisher();

  const publication = publishExactHeadClaims(baseInput());
  const oracle = runIndependentPublicationOracle(baseInput(), publication);
  assert.deepEqual(oracle, { ok: true, errors: [] });

  const mutations = runSemanticMutationCatalog(baseInput());
  assert.equal(mutations.total, 12);
  assert.equal(mutations.killed, 12);
  assert.deepEqual(mutations.survivors, []);
});
