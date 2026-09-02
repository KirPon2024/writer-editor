'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const importRepo = (relativePath) => import(pathToFileURL(path.join(ROOT, relativePath)).href);
const HEAD = 'a'.repeat(40);
const TREE = 'b'.repeat(40);
const clone = (value) => JSON.parse(JSON.stringify(value));

function supporting(module, nodeId, count = 1) {
  return Array.from({ length: count }, (_, index) => ({
    evidenceId: `${nodeId}-evidence-${String(index).padStart(5, '0')}`,
    evidenceClass: module.ATLAS_PRODUCT_REQUIRED_EVIDENCE_CLASS,
    evidenceDigest: module.digestAtlasProductValue(`${nodeId}-evidence-${index}`),
  }));
}

function nodeProof(module, nodeId, count = 1) {
  return module.createAtlasProductNodeProof({
    schemaVersion: module.ATLAS_PRODUCT_NODE_PROOF_SCHEMA_VERSION,
    nodeId,
    state: 'DONE',
    verdict: 'PASS',
    evidenceClass: module.ATLAS_PRODUCT_REQUIRED_EVIDENCE_CLASS,
    evaluationSha: HEAD,
    evaluationTreeSha: TREE,
    terminalReceiptDigest: module.digestAtlasProductValue(`terminal-${nodeId}`),
    claimBindingDigest: module.digestAtlasProductValue(`binding-${nodeId}`),
    supportingEvidence: supporting(module, nodeId, count),
  });
}

function assuranceSpec(assuranceClass) {
  switch (assuranceClass) {
    case 'ACCESSIBILITY': return { required: 4, observed: 4, threshold: 4, comparison: 'GTE', unit: 'verified-contracts' };
    case 'EXPORT_IR': return { required: 8, observed: 8, threshold: 8, comparison: 'GTE', unit: 'bound-members' };
    case 'PERFORMANCE': return { required: 7, observed: 19_999, threshold: 20_000, comparison: 'LTE', unit: 'milliseconds' };
    case 'SECURITY': return { required: 6, observed: 0, threshold: 0, comparison: 'LTE', unit: 'findings' };
    default: throw new Error(`unknown assurance ${assuranceClass}`);
  }
}

function assuranceProof(module, assuranceClass) {
  const spec = assuranceSpec(assuranceClass);
  return module.createAtlasProductAssuranceProof({
    schemaVersion: module.ATLAS_PRODUCT_ASSURANCE_PROOF_SCHEMA_VERSION,
    assuranceClass,
    verdict: 'PASS',
    evidenceClass: module.ATLAS_PRODUCT_REQUIRED_EVIDENCE_CLASS,
    evaluationSha: HEAD,
    evaluationTreeSha: TREE,
    oracleId: `WP507_${assuranceClass}_ORACLE`,
    artifactDigest: module.digestAtlasProductValue(`artifact-${assuranceClass}`),
    required: spec.required,
    passed: spec.required,
    skipped: 0,
    todos: 0,
    metrics: { comparison: spec.comparison, observed: spec.observed, threshold: spec.threshold, unit: spec.unit },
  });
}

function gateDecision(module, overrides = {}) {
  return module.createAtlasProfileReleaseDecision({
    schemaVersion: module.ATLAS_PRODUCT_GATE_DECISION_SCHEMA_VERSION,
    gateId: module.ATLAS_PROFILE_RELEASE_GATE_ID,
    decision: 'APPROVED',
    scopeNodeId: module.ATLAS_PRODUCT_NODE_ID,
    missionDigest: module.ATLAS_PRODUCT_MISSION_DIGEST,
    authorityBindingDigest: module.ATLAS_PRODUCT_AUTHORITY_BINDING_DIGEST,
    issuedAtUtc: '2026-09-02T06:45:03Z',
    ...overrides,
  });
}

function claimRequest(overrides = {}) {
  return {
    profileId: 'ATLAS_PRODUCT_V33',
    claimCeiling: 'NODE_AND_SELECTED_PROFILE_ONLY',
    programVerdict: 'NEEDS_MORE_EVIDENCE',
    globalScalarPass: false,
    includeCompleteProofSet: true,
    publishMode: 'EVIDENCE_PACKAGE_ONLY',
    promoteProfiles: [],
    ...overrides,
  };
}

function validInput(module, options = {}) {
  const nodeProofs = options.nodeProofs || module.REQUIRED_ATLAS_PRODUCT_NODE_IDS.map(
    (nodeId) => nodeProof(module, nodeId, options.supportingCount || 1),
  );
  const assuranceProofs = options.assuranceProofs || module.REQUIRED_ATLAS_PRODUCT_ASSURANCE_CLASSES.map(
    (assuranceClass) => assuranceProof(module, assuranceClass),
  );
  const exportIr = options.exportIr || module.createAtlasProductExportIr({
    schemaVersion: module.ATLAS_PRODUCT_EXPORT_IR_SCHEMA_VERSION,
    packageId: 'atlas-product-v33-evidence-package-1',
    profileId: module.ATLAS_PRODUCT_PROFILE_ID,
    evaluationSha: HEAD,
    evaluationTreeSha: TREE,
    nodeProofSetDigest: module.digestAtlasProductValue([...nodeProofs].sort((a, b) => a.nodeId.localeCompare(b.nodeId))),
    assuranceProofSetDigest: module.digestAtlasProductValue([...assuranceProofs].sort((a, b) => a.assuranceClass.localeCompare(b.assuranceClass))),
  });
  return {
    exactIdentity: { headSha: HEAD, originMainSha: HEAD, treeSha: TREE, dirty: false },
    claimRequest: claimRequest(),
    ownerGateDecision: gateDecision(module),
    nodeProofs,
    assuranceProofs,
    exportIr,
  };
}

if (path.resolve(process.argv[1] || '') === __filename) {
test('WP-507 compiles one deterministic evidence-only Atlas product package from complete node and assurance denominators', async () => {
  const module = await importRepo('src/core/atlas-product-claim-v1.mjs');
  const input = validInput(module);
  const receipt = module.compileAtlasProductClaim(input);
  const reordered = module.compileAtlasProductClaim({
    ...input,
    nodeProofs: [...input.nodeProofs].reverse(),
    assuranceProofs: [...input.assuranceProofs].reverse(),
  });
  assert.deepEqual(reordered, receipt);
  assert.equal(receipt.profileVerdict.profileId, 'ATLAS_PRODUCT_V33');
  assert.equal(receipt.profileVerdict.verdict, 'ATLAS_PRODUCT_V33_EVIDENCE_BOUND_PACKAGED_CLAIM');
  assert.equal(receipt.profileVerdict.requiredNodeCount, 8);
  assert.equal(receipt.profileVerdict.closedNodeCount, 8);
  assert.equal(receipt.profileVerdict.requiredAssuranceCount, 4);
  assert.equal(receipt.profileVerdict.closedAssuranceCount, 4);
  assert.equal(receipt.productPackage.evidencePackageOnly, true);
  assert.equal(receipt.authority.productMutation, false);
  assert.equal(receipt.authority.publicRelease, false);
  assert.deepEqual(receipt.authority, {
    commandDispatch: false,
    externalEffect: false,
    externalProvider: false,
    network: false,
    notarization: false,
    payments: false,
    persistence: false,
    productMutation: false,
    productionRelease: false,
    publicDistribution: false,
    publicRelease: false,
    rendererWiring: false,
    secrets: false,
    signing: false,
    userDocumentMutation: false,
  });
  assert.equal(receipt.programVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(receipt.globalScalarPassForbidden, true);
  assert.equal(Object.isFrozen(receipt), true);
  assert.deepEqual(module.verifyAtlasProductClaim(clone(receipt)), receipt);
});

test('WP-507 rejects missing, duplicate, unknown, failed and zero-evidence node rows', async () => {
  const module = await importRepo('src/core/atlas-product-claim-v1.mjs');
  const base = validInput(module);
  assert.throws(() => module.compileAtlasProductClaim({ ...base, nodeProofs: base.nodeProofs.slice(1) }), (error) => error.code === 'E_ATLAS_PRODUCT_NODE_PROOF_DENOMINATOR');
  const duplicate = [...base.nodeProofs];
  duplicate[7] = duplicate[0];
  assert.throws(() => module.compileAtlasProductClaim({ ...base, nodeProofs: duplicate }));
  assert.throws(() => module.createAtlasProductNodeProof({
    ...clone(base.nodeProofs[0]),
    schemaVersion: module.ATLAS_PRODUCT_NODE_PROOF_SCHEMA_VERSION,
    nodeId: 'WP-999_UNKNOWN',
    supportingEvidence: clone(base.nodeProofs[0].supportingEvidence),
    proofDigest: undefined,
  }));
  const failed = clone(base.nodeProofs[0]);
  delete failed.proofDigest;
  failed.verdict = 'FAIL';
  assert.throws(() => module.createAtlasProductNodeProof(failed), (error) => error.code === 'E_ATLAS_PRODUCT_NODE_NOT_CLOSED');
  const empty = clone(base.nodeProofs[0]);
  delete empty.proofDigest;
  empty.supportingEvidence = [];
  assert.throws(() => module.createAtlasProductNodeProof(empty), (error) => error.code === 'E_ATLAS_PRODUCT_SUPPORTING_EVIDENCE_BOUND');
});

test('WP-507 assurance denominator rejects missing classes, skips, todos, partial pass and unmet metrics', async () => {
  const module = await importRepo('src/core/atlas-product-claim-v1.mjs');
  const base = validInput(module);
  assert.throws(() => module.compileAtlasProductClaim({ ...base, assuranceProofs: base.assuranceProofs.slice(1) }), (error) => error.code === 'E_ATLAS_PRODUCT_ASSURANCE_PROOF_DENOMINATOR');
  for (const patch of [
    { skipped: 1 },
    { todos: 1 },
    { passed: 3 },
    { required: 0, passed: 0 },
  ]) {
    const input = clone(base.assuranceProofs[0]);
    delete input.proofDigest;
    Object.assign(input, patch);
    assert.throws(() => module.createAtlasProductAssuranceProof(input), (error) => error.code === 'E_ATLAS_PRODUCT_ASSURANCE_DENOMINATOR_NOT_CLOSED');
  }
  const metric = clone(base.assuranceProofs.find((row) => row.assuranceClass === 'PERFORMANCE'));
  delete metric.proofDigest;
  metric.metrics.observed = 20_001;
  assert.throws(() => module.createAtlasProductAssuranceProof(metric), (error) => error.code === 'E_ATLAS_PRODUCT_ASSURANCE_THRESHOLD_NOT_MET');
});

test('WP-507 stale, future and tampered node, assurance and ExportIR identities fail closed', async () => {
  const module = await importRepo('src/core/atlas-product-claim-v1.mjs');
  const base = validInput(module);
  const staleNodes = clone(base.nodeProofs);
  const staleInput = clone(staleNodes[0]);
  delete staleInput.proofDigest;
  staleInput.evaluationSha = 'c'.repeat(40);
  staleNodes[0] = module.createAtlasProductNodeProof(staleInput);
  assert.throws(() => module.compileAtlasProductClaim({ ...base, nodeProofs: staleNodes }), (error) => error.code === 'E_ATLAS_PRODUCT_NODE_PROOF_IDENTITY_STALE');
  const futureAssurance = clone(base.assuranceProofs);
  const futureInput = clone(futureAssurance[0]);
  delete futureInput.proofDigest;
  futureInput.evaluationTreeSha = 'd'.repeat(40);
  futureAssurance[0] = module.createAtlasProductAssuranceProof(futureInput);
  assert.throws(() => module.compileAtlasProductClaim({ ...base, assuranceProofs: futureAssurance }), (error) => error.code === 'E_ATLAS_PRODUCT_ASSURANCE_PROOF_IDENTITY_STALE');
  const tamperedProof = clone(base.nodeProofs);
  tamperedProof[0].claimBindingDigest = module.digestAtlasProductValue('forged');
  assert.throws(() => module.compileAtlasProductClaim({ ...base, nodeProofs: tamperedProof }), (error) => error.code === 'E_ATLAS_PRODUCT_NODE_PROOF_DIGEST_MISMATCH');
  const tamperedExport = clone(base.exportIr);
  tamperedExport.nodeProofSetDigest = module.digestAtlasProductValue('wrong-set');
  const exportInput = clone(tamperedExport);
  delete exportInput.manifestDigest;
  const rebuiltExport = module.createAtlasProductExportIr(exportInput);
  assert.throws(() => module.compileAtlasProductClaim({ ...base, exportIr: rebuiltExport }), (error) => error.code === 'E_ATLAS_PRODUCT_EXPORT_IR_CROSS_BINDING_MISMATCH');
});

test('WP-507 owner gate and overclaim boundary reject wrong scope, mission, decision, program verdict and profile promotion', async () => {
  const module = await importRepo('src/core/atlas-product-claim-v1.mjs');
  const base = validInput(module);
  for (const overrides of [
    { decision: 'DENIED' },
    { scopeNodeId: 'WP-506_COUNTERFACTUAL' },
    { missionDigest: module.digestAtlasProductValue('other-mission') },
    { authorityBindingDigest: module.digestAtlasProductValue('other-authority') },
  ]) assert.throws(() => gateDecision(module, overrides));
  for (const request of [
    claimRequest({ programVerdict: 'PASS' }),
    claimRequest({ globalScalarPass: true }),
    claimRequest({ promoteProfiles: ['PACKAGED_RELEASE_SECURITY'] }),
    claimRequest({ profileId: 'ATLAS_FOUNDATION' }),
    claimRequest({ claimCeiling: 'PROGRAM_AND_RELEASE' }),
    claimRequest({ publishMode: 'PUBLIC_RELEASE' }),
  ]) assert.throws(() => module.compileAtlasProductClaim({ ...base, claimRequest: request }));
  const tamperedGate = clone(base.ownerGateDecision);
  tamperedGate.issuedAtUtc = '2026-09-02T06:45:04Z';
  assert.throws(() => module.compileAtlasProductClaim({ ...base, ownerGateDecision: tamperedGate }), (error) => error.code === 'E_ATLAS_PRODUCT_GATE_DECISION_DIGEST_MISMATCH');
});

test('WP-507 strict boundary rejects accessors, symbols, sparse arrays, non-NFC identifiers and unknown fields', async () => {
  const module = await importRepo('src/core/atlas-product-claim-v1.mjs');
  const base = validInput(module);
  const accessor = { ...base };
  Object.defineProperty(accessor, 'exportIr', { enumerable: true, get: () => base.exportIr });
  assert.throws(() => module.compileAtlasProductClaim(accessor));
  assert.throws(() => module.compileAtlasProductClaim({ ...base, [Symbol('authority')]: true }));
  assert.throws(() => module.compileAtlasProductClaim({ ...base, unknown: true }));
  const sparse = new Array(8);
  sparse[0] = base.nodeProofs[0];
  assert.throws(() => module.compileAtlasProductClaim({ ...base, nodeProofs: sparse }));
  const badNode = clone(base.nodeProofs[0]);
  delete badNode.proofDigest;
  badNode.supportingEvidence[0].evidenceId = 'Cafe\u0301';
  assert.throws(() => module.createAtlasProductNodeProof(badNode), (error) => error.code === 'E_ATLAS_PRODUCT_EVIDENCE_ID_INVALID');
});
}

module.exports = {
  HEAD,
  TREE,
  clone,
  supporting,
  nodeProof,
  assuranceProof,
  gateDecision,
  claimRequest,
  validInput,
};
