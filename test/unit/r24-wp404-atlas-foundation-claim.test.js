'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const importRepo = (relativePath) => import(pathToFileURL(path.join(ROOT, relativePath)).href);
const HEAD = 'a'.repeat(40);
const TREE = 'b'.repeat(40);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const digest = (value) => `sha256:${crypto.createHash('sha256').update(
  typeof value === 'string' ? value : canonical(value),
  'utf8',
).digest('hex')}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

function writerReceipt(overrides = {}) {
  const receipt = {
    ok: true,
    schemaVersion: 'yalken.r24.v0.writer-claim-compiler.receipt.v1',
    verdict: 'PASS',
    code: 'R24_V0_PROFILE_VERDICT_COMPILED',
    generatedAt: '2026-09-01T00:00:00.000Z',
    exactIdentity: { headSha: HEAD, originMainSha: HEAD, treeSha: TREE, dirty: false },
    selectedProfiles: ['SHARED_ASSURANCE', 'WRITER_CORE'],
    profileVerdict: {
      profileId: 'WRITER_CORE',
      verdict: 'WRITER_CORE_EVIDENCE_BOUND_BY_R24_EXACT_HEAD_PREFIX',
      claimCeiling: 'PROFILE_VERDICT_ONLY',
      requiredEvidenceClass: 'INDEPENDENT_EXACT_HEAD',
      requiredStageCount: 2,
      closedStageCount: 2,
      requiredStageIds: ['F0_WRITER_REFINEMENT_CONFORMANCE', 'T1_ANCHOR_LINEAGE'],
      gateEvidenceDigest: 'c'.repeat(64),
    },
    programVerdict: 'NEEDS_MORE_EVIDENCE',
    globalScalarPassForbidden: true,
    optionalProfilesExcluded: ['ATLAS_MAPS_DERIVED', 'WORD_ROUNDTRIP', 'PACKAGED_RELEASE_SECURITY'],
    nonClaims: ['NO_PROGRAM_DONE', 'NO_GLOBAL_SCALAR_PASS', 'NO_ATLAS_PROFILE_VERDICT'],
    workflow: { v0Script: 'test:r24-v0', v0WorkflowIndex: 2, supportingScriptsBeforeV0: ['test:r24-f0'] },
  };
  return Object.assign(receipt, overrides);
}

function claimRequest(overrides = {}) {
  return {
    profileId: 'ATLAS_FOUNDATION',
    claimCeiling: 'NODE_AND_SELECTED_PROFILE_ONLY',
    programVerdict: 'NEEDS_MORE_EVIDENCE',
    globalScalarPass: false,
    includeWriterV0: true,
    promoteProfiles: [],
    ...overrides,
  };
}

function proofInput(module, nodeId, index = 0, supportingEvidence = null) {
  return {
    schemaVersion: module.ATLAS_FOUNDATION_PROOF_SCHEMA_VERSION,
    nodeId,
    state: 'DONE',
    verdict: 'PASS',
    evidenceClass: 'INDEPENDENT_EXACT_HEAD',
    evaluationSha: HEAD,
    evaluationTreeSha: TREE,
    terminalReceiptDigest: digest(`terminal-${nodeId}`),
    claimBindingDigest: digest(`binding-${nodeId}`),
    supportingEvidence: supportingEvidence || [{
      evidenceId: `evidence-${index}`,
      evidenceClass: 'INDEPENDENT_EXACT_HEAD',
      evidenceDigest: digest(`evidence-${nodeId}-${index}`),
    }],
  };
}

function validInput(module, overrides = {}) {
  const writerV0Receipt = overrides.writerV0Receipt || writerReceipt();
  const foundationProofs = overrides.foundationProofs || module.REQUIRED_FOUNDATION_NODE_IDS.map(
    (nodeId, index) => module.createAtlasFoundationProof(proofInput(module, nodeId, index)),
  );
  return {
    exactIdentity: { headSha: HEAD, originMainSha: HEAD, treeSha: TREE, dirty: false },
    writerV0Receipt,
    writerV0ReceiptDigest: digest(writerV0Receipt),
    foundationProofs,
    claimRequest: claimRequest(),
    ...overrides,
  };
}

test('WP-404 contract: exact Writer V0 plus the complete four-node proof set compiles one bounded Atlas foundation verdict', async () => {
  const module = await importRepo('src/core/atlas-foundation-claim-v1.mjs');
  const input = validInput(module);
  const receipt = module.compileAtlasFoundationClaim(input);
  const reordered = module.compileAtlasFoundationClaim({
    ...input,
    foundationProofs: [...input.foundationProofs].reverse(),
  });
  assert.deepEqual(reordered, receipt);
  assert.equal(receipt.profileVerdict.profileId, 'ATLAS_FOUNDATION');
  assert.equal(receipt.profileVerdict.claimCeiling, 'NODE_AND_SELECTED_PROFILE_ONLY');
  assert.equal(receipt.profileVerdict.verdict, 'ATLAS_FOUNDATION_EVIDENCE_BOUND_BY_WRITER_V0_AND_WP400_WP403');
  assert.equal(receipt.writerInheritance.stageId, 'V0_WRITER_CLAIM_COMPILER');
  assert.equal(receipt.writerInheritance.receiptDigest, input.writerV0ReceiptDigest);
  assert.equal(receipt.foundation.requiredNodeCount, 4);
  assert.equal(receipt.foundation.closedNodeCount, 4);
  assert.equal(receipt.foundation.supportingEvidenceDenominator, 4);
  assert.equal(receipt.programVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(receipt.globalScalarPassForbidden, true);
  assert.equal(receipt.authority.productMutation, false);
  assert.equal(receipt.authority.rendererWiring, false);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.foundation.nodeProofs), true);
  assert.equal(module.verifyAtlasFoundationClaim(receipt), receipt);
});

test('WP-404 contract negatives: missing, duplicate, unknown, failed and skipped foundation rows fail closed', async () => {
  const module = await importRepo('src/core/atlas-foundation-claim-v1.mjs');
  const base = validInput(module);
  assert.throws(
    () => module.compileAtlasFoundationClaim({ ...base, foundationProofs: base.foundationProofs.slice(1) }),
    (error) => error.code === 'E_ATLAS_FOUNDATION_PROOF_DENOMINATOR',
  );
  const duplicate = [...base.foundationProofs];
  duplicate[3] = module.createAtlasFoundationProof(proofInput(module, module.REQUIRED_FOUNDATION_NODE_IDS[0], 99));
  assert.throws(
    () => module.compileAtlasFoundationClaim({ ...base, foundationProofs: duplicate }),
    (error) => error.code === 'E_ATLAS_FOUNDATION_DUPLICATE_NODE',
  );
  assert.throws(
    () => module.createAtlasFoundationProof({ ...proofInput(module, 'WP-999_UNKNOWN'), nodeId: 'WP-999_UNKNOWN' }),
    (error) => error.code === 'E_ATLAS_FOUNDATION_UNKNOWN_NODE',
  );
  assert.throws(
    () => module.createAtlasFoundationProof({ ...proofInput(module, module.REQUIRED_FOUNDATION_NODE_IDS[0]), verdict: 'FAIL' }),
    (error) => error.code === 'E_ATLAS_FOUNDATION_PROOF_NOT_CLOSED',
  );
  assert.throws(
    () => module.createAtlasFoundationProof({
      ...proofInput(module, module.REQUIRED_FOUNDATION_NODE_IDS[0]),
      supportingEvidence: [],
    }),
    (error) => error.code === 'E_ATLAS_FOUNDATION_SUPPORTING_EVIDENCE_BOUND',
  );
});

test('WP-404 stale and tamper rejection binds Writer receipt, proof and claim to one exact head and tree', async () => {
  const module = await importRepo('src/core/atlas-foundation-claim-v1.mjs');
  const base = validInput(module);
  assert.throws(
    () => module.compileAtlasFoundationClaim({ ...base, writerV0ReceiptDigest: digest('forged-writer') }),
    (error) => error.code === 'E_ATLAS_FOUNDATION_WRITER_RECEIPT_DIGEST_MISMATCH',
  );
  const staleWriter = clone(base.writerV0Receipt);
  staleWriter.exactIdentity.treeSha = 'd'.repeat(40);
  assert.throws(
    () => module.compileAtlasFoundationClaim({
      ...base,
      writerV0Receipt: staleWriter,
      writerV0ReceiptDigest: digest(staleWriter),
    }),
    (error) => error.code === 'E_ATLAS_FOUNDATION_WRITER_IDENTITY_STALE',
  );
  const staleProofs = clone(base.foundationProofs);
  staleProofs[0].evaluationSha = 'e'.repeat(40);
  const staleIdentity = { ...staleProofs[0] };
  delete staleIdentity.proofDigest;
  staleProofs[0].proofDigest = digest(staleIdentity);
  assert.throws(
    () => module.compileAtlasFoundationClaim({ ...base, foundationProofs: staleProofs }),
    (error) => error.code === 'E_ATLAS_FOUNDATION_PROOF_IDENTITY_STALE',
  );
  const tamperedProofs = clone(base.foundationProofs);
  tamperedProofs[0].claimBindingDigest = digest('forged-binding');
  assert.throws(
    () => module.compileAtlasFoundationClaim({ ...base, foundationProofs: tamperedProofs }),
    (error) => error.code === 'E_ATLAS_FOUNDATION_PROOF_DIGEST_MISMATCH',
  );
  const receipt = clone(module.compileAtlasFoundationClaim(base));
  receipt.authority.productMutation = true;
  assert.throws(
    () => module.verifyAtlasFoundationClaim(receipt),
    (error) => ['E_ATLAS_FOUNDATION_CLAIM_DIGEST_MISMATCH', 'E_ATLAS_FOUNDATION_AUTHORITY_LEAK'].includes(error.code),
  );
});

test('WP-404 refuses Writer recomputation, global PASS, cross-profile promotion and widened claim ceilings', async () => {
  const module = await importRepo('src/core/atlas-foundation-claim-v1.mjs');
  const base = validInput(module);
  for (const request of [
    claimRequest({ includeWriterV0: false }),
    claimRequest({ programVerdict: 'PASS' }),
    claimRequest({ globalScalarPass: true }),
    claimRequest({ promoteProfiles: ['WRITER_CORE'] }),
    claimRequest({ profileId: 'ATLAS_MAPS_DERIVED' }),
    claimRequest({ claimCeiling: 'PROGRAM_AND_RELEASE' }),
  ]) {
    assert.throws(() => module.compileAtlasFoundationClaim({ ...base, claimRequest: request }));
  }
  const overclaimingWriter = clone(base.writerV0Receipt);
  overclaimingWriter.programVerdict = 'PASS';
  assert.throws(
    () => module.compileAtlasFoundationClaim({
      ...base,
      writerV0Receipt: overclaimingWriter,
      writerV0ReceiptDigest: digest(overclaimingWriter),
    }),
    (error) => error.code === 'E_ATLAS_FOUNDATION_WRITER_OVERCLAIM',
  );
});

test('WP-404 strict boundary rejects accessors, sparse arrays, non-NFC identifiers, symbols and unknown fields', async () => {
  const module = await importRepo('src/core/atlas-foundation-claim-v1.mjs');
  const base = validInput(module);
  const accessor = { ...base };
  Object.defineProperty(accessor, 'writerV0ReceiptDigest', { enumerable: true, get: () => base.writerV0ReceiptDigest });
  assert.throws(() => module.compileAtlasFoundationClaim(accessor));
  const sparse = new Array(4);
  sparse[0] = base.foundationProofs[0];
  assert.throws(() => module.compileAtlasFoundationClaim({ ...base, foundationProofs: sparse }));
  const symbolic = { ...base, [Symbol('authority')]: true };
  assert.throws(() => module.compileAtlasFoundationClaim(symbolic));
  assert.throws(() => module.compileAtlasFoundationClaim({ ...base, unknown: true }));
  assert.throws(() => module.createAtlasFoundationProof({
    ...proofInput(module, module.REQUIRED_FOUNDATION_NODE_IDS[0]),
    supportingEvidence: [{
      evidenceId: 'Cafe\u0301',
      evidenceClass: 'INDEPENDENT_EXACT_HEAD',
      evidenceDigest: digest('nfc'),
    }],
  }));
});

module.exports = { HEAD, TREE, canonical, digest, writerReceipt, claimRequest, proofInput, validInput };
