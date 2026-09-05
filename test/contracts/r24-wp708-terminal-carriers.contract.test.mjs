import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { buildClaimBinding } from '../../scripts/ops/r24/claim-binding.mjs';
import { canonicalDigest } from '../../scripts/ops/r24/canonical-json.mjs';
import { HISTORICAL_INVENTORY_CLAIM_PINS_V17 } from '../../scripts/ops/r24/docs-claim-lint.mjs';

const C = 'docs/OPS/R24/CORRECTIVE/';
const h = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file));
const names = [
  'MAIN_PRODUCT_OWNER_AUTHORITY', 'MAIN_PRODUCT_STAGE_INSTANCE', 'MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION',
  'PROTECTED_WIP_BEFORE', 'GOOGLE_EGRESS_APPLY_OWNER_DECISION', 'GOOGLE_PROVIDER_PHYSICAL_RECEIPT',
  'WP806_TERMINAL_PREDECESSOR', 'GOOGLE_PROVIDER_CONTRACT', 'FEATURE_INTEGRATION_MANIFEST', 'FIXTURE_MANIFEST',
  'EFFECTIVE_GRAPH_BASELINE', 'CARRIER_REGISTRY', 'ACCEPTANCE_MATRIX', 'EFFECTIVE_STATE', 'STAGE_REGISTRY',
  'LEASE_RELEASE', 'TERMINAL_RECEIPT',
];
const load = () => Object.fromEntries(names.map(name => [name, read(`${C}WP708_${name}_V1.json`)]));
const counts = states => Object.fromEntries(['BLOCKED_TYPED', 'DONE', 'INELIGIBLE_OPTIONAL', 'PENDING']
  .map(state => [state, Object.values(states).filter(value => value === state).length]));

function verify(value) {
  const instance = value.MAIN_PRODUCT_STAGE_INSTANCE;
  const admission = value.MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION;
  const before = value.PROTECTED_WIP_BEFORE;
  const graph = value.EFFECTIVE_GRAPH_BASELINE;
  const contract = value.GOOGLE_PROVIDER_CONTRACT;
  assert.equal(h(fs.readFileSync(`${C}WP708_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json`)), '916d26a4a6a4224885c1a60ec21373241aa6b3ce8c58f790cb89172ad41d83f8');
  assert.equal(h(fs.readFileSync(`${C}WP708_MAIN_PRODUCT_STAGE_INSTANCE_V1.json`)), '5945388287d25dcdd4d33a7217747e672ef762ef3e9afddbe5faea3f558d9f51');
  assert.equal(h(fs.readFileSync(`${C}WP708_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json`)), 'cd6e60f5059ec2a7e486e0961b0345be66fec914ee0da0e3750c990b57816fc8');
  assert.equal(instance.model, 'gpt-5.6-sol');
  assert.equal(instance.reasoningEffort, 'xhigh');
  assert.equal(admission.writeSetDigest, 'e9f7715043e1b295e073f6a42ba99a9a82ed933cccc89a3fd8a5d32d6da6e1e0');
  assert.deepEqual(instance.lease, { fencingCounter: 98, status: 'ACTIVE', wip: 1, predecessorReleaseDigest: 'ad0514727c76d467cad99d027db89fe0f07b8b1ebef0ee8cd3412b76616bd46c' });
  const { snapshotSha256, ...payload } = before;
  assert.equal(h(Buffer.from(`${JSON.stringify(payload)}\n`)), snapshotSha256);
  assert.equal(snapshotSha256, 'f2c24f138570354602766b1b1202214fd1d9f9807aeca7c26c1fd7c6dfbd7e79');
  assert.equal(before.completeDenominator, 297);
  assert.equal(before.entries.length, 297);
  assert.equal(before.dirtyDenominator, 11);
  assert.equal(value.GOOGLE_EGRESS_APPLY_OWNER_DECISION.status, 'APPROVED');
  assert.equal(value.GOOGLE_EGRESS_APPLY_OWNER_DECISION.decisionRevision, 2);
  assert.equal(value.GOOGLE_PROVIDER_PHYSICAL_RECEIPT.status, 'PASS_WITH_VERIFIED_CLEANUP');
  assert.equal(value.GOOGLE_PROVIDER_PHYSICAL_RECEIPT.cleanup.providerArtifactsRemaining, 0);
  assert.equal(value.WP806_TERMINAL_PREDECESSOR.predecessorLeaseStatus, 'RELEASED');
  assert.equal(value.WP806_TERMINAL_PREDECESSOR.predecessorWip, 0);
  assert.deepEqual(contract.profiles.map(profile => profile.physicalDisposition), [
    'PASS_BOUNDED_TO_EXACT_GATE05_SYNTHETIC_LIFECYCLE',
    'ABSTAIN_NO_PHYSICAL_PASS',
    'PASS_BOUNDED_TO_EXACT_GATE05_CONNECTOR_LIFECYCLE',
  ]);
  assert.equal(contract.historicalRegistry.maySeedCurrentPass, false);
  assert.equal(contract.evidenceIsolation.claimDigestReuseAcrossProfiles, false);
  assert.equal(contract.applyAdmission.default, 'DENY');
  assert.equal(contract.applyAdmission.grantsProductAuthority, false);
  assert.equal(contract.applyAdmission.grantsProviderAuthority, false);
  assert.equal(value.FEATURE_INTEGRATION_MANIFEST.runtimeNetwork, false);
  assert.equal(graph.statesDigest, canonicalDigest(graph.states));
  assert.deepEqual(counts(graph.states), { BLOCKED_TYPED: 3, DONE: 85, INELIGIBLE_OPTIONAL: 10, PENDING: 11 });
  const targetStates = { ...graph.states, 'WP-708_GOOGLE_PROVIDER': 'DONE' };
  assert.equal(value.EFFECTIVE_STATE.targetGraph.statesDigest, canonicalDigest(targetStates));
  assert.equal(value.EFFECTIVE_STATE.targetGraph.transition.nodeId, 'WP-708_GOOGLE_PROVIDER');
  assert.deepEqual(value.EFFECTIVE_STATE.targetCounts, { BLOCKED_TYPED: 3, DONE: 86, INELIGIBLE_OPTIONAL: 10, PENDING: 10 });
  const admitted = [...instance.operations.modifyPaths, ...instance.operations.createPaths].sort();
  const registry = value.CARRIER_REGISTRY;
  assert.deepEqual([...registry.carriers.map(binding => binding.path), ...registry.excludedDependentCarriers].sort(), admitted);
  assert.equal(admitted.length, 37);
  assert.equal(registry.carrierDenominator, 29);
  assert.equal(registry.currentTreeFallbackAllowed, false);
  for (const binding of registry.carriers) {
    const bytes = fs.readFileSync(binding.path);
    assert.equal(h(bytes), binding.sha256, binding.path);
    assert.equal(bytes.length, binding.byteLength);
  }
  assert.equal(value.ACCEPTANCE_MATRIX.denominator, value.ACCEPTANCE_MATRIX.rows.length);
  assert.equal(value.ACCEPTANCE_MATRIX.rows.filter(row => row.status === 'PASS').length, 20);
  assert.equal(value.ACCEPTANCE_MATRIX.rows.filter(row => row.status === 'REQUIRED_NOT_PRECLAIMED').length, 7);
  assert.equal(value.TERMINAL_RECEIPT.status, 'CONDITIONAL_DONE_PENDING_REQUIRED_LOCAL_AND_EXTERNAL_DELIVERY_PREDICATES');
  assert.equal(value.TERMINAL_RECEIPT.activationOutcome.doneCount, 86);
  assert.equal(value.LEASE_RELEASE.currentLease.status, 'ACTIVE');
  assert.equal(value.LEASE_RELEASE.targetLease.wip, 0);
  for (const [field, name] of [['leaseReleaseDigest', 'LEASE_RELEASE'], ['acceptanceMatrixDigest', 'ACCEPTANCE_MATRIX'], ['effectiveStateDigest', 'EFFECTIVE_STATE'], ['stageRegistryDigest', 'STAGE_REGISTRY']]) {
    assert.equal(value.TERMINAL_RECEIPT.bindings[field], h(fs.readFileSync(`${C}WP708_${name}_V1.json`)));
  }
  for (const carrier of Object.values(value)) if (Object.hasOwn(carrier, 'programDone')) assert.equal(carrier.programDone, false);
}

test('WP708 carriers bind exact Sol admission, independent profiles, physical cleanup and conditional release', () => {
  verify(load());
  const claim = buildClaimBinding(read('docs/OPS/R24/EVIDENCE/ES-R24-WP-708-GOOGLE-PROVIDER-CLAIM-BINDINGS.json'));
  for (const binding of claim.claimBindings) assert.equal(h(fs.readFileSync(binding.filePath)), binding.sha256);
  assert.deepEqual(HISTORICAL_INVENTORY_CLAIM_PINS_V17.at(-1), {
    stampId: 'ES-R24-WP-806-PULSE-CLAIM-CLAIM-BINDINGS',
    stampSha256: '11f6883263a8069d9c8347b846f52a3df61c695d0bc6c97524eb7c4ff5c4ffdf',
    evaluationSha: '7734cc48666f260c9554fbf46357c0a3b8b97c4d',
    evaluationTree: 'e46a1b50943b7fa36e784400291080fd033235b2',
    targetSha256: '8f7c411a9521a97aa39f2367319ebb9b75cab8941fb35b702690151b80aeedff',
  });
});

test('WP708 evidence carries 14 focused tests, 19 real source mutants and exact external cleanup', () => {
  const model = read('docs/OPS/R24/EVIDENCE/ES-R24-WP-708-GOOGLE-PROVIDER-MODEL.json');
  assert.deepEqual(model.test, { denominator: 14, passed: 14, failed: 0, skipped: 0, todo: 0 });
  assert.equal(model.artifact.rawEvidence.processExitCode, 0);
  assert.equal(model.artifact.rawEvidence.sha256, '4e734a89981f2cc1fdf6694c83805beeddf42a6178d13d7631e98696e3ef032c');
  for (const artifact of model.artifact.implementationArtifacts) assert.equal(h(fs.readFileSync(artifact.path)), artifact.sha256);
  const mutants = read('docs/OPS/R24/EVIDENCE/ES-R24-WP-708-GOOGLE-PROVIDER-MUTANTS.json');
  assert.deepEqual(mutants.claim, { ceiling: 'WP708_ACTUAL_SOURCE_MUTATION_SCORE_ONLY', actualSourceMutations: true, killed: 19, survived: 0, syntaxOrImportFailuresCountedAsKills: false });
  const integration = read('docs/OPS/R24/EVIDENCE/ES-R24-WP-708-GOOGLE-PROVIDER-INTEGRATION.json');
  assert.equal(integration.artifact.externalPhysicalEvidence.providerArtifactsRemaining, 0);
});

test('WP708 carriers reject evidence inheritance, authority overclaim, graph overclaim and false release', () => {
  const mutations = [
    value => { value.GOOGLE_PROVIDER_CONTRACT.profiles[1].physicalDisposition = 'PASS_INHERITED'; },
    value => { value.GOOGLE_PROVIDER_CONTRACT.historicalRegistry.maySeedCurrentPass = true; },
    value => { value.GOOGLE_PROVIDER_CONTRACT.applyAdmission.grantsProviderAuthority = true; },
    value => { value.GOOGLE_PROVIDER_PHYSICAL_RECEIPT.cleanup.providerArtifactsRemaining = 1; },
    value => { value.EFFECTIVE_GRAPH_BASELINE.states['WP-708_GOOGLE_PROVIDER'] = 'DONE'; },
    value => { value.EFFECTIVE_STATE.targetCounts.DONE = 87; },
    value => { value.CARRIER_REGISTRY.currentTreeFallbackAllowed = true; },
    value => { value.LEASE_RELEASE.targetLease.wip = 1; },
    value => { value.TERMINAL_RECEIPT.status = 'CERTIFIED_DONE'; },
    value => { value.TERMINAL_RECEIPT.programDone = true; },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const value = structuredClone(load());
    mutate(value);
    assert.throws(() => verify(value), undefined, `carrier mutation ${index + 1} must be rejected`);
  }
});
