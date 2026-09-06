import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { buildClaimBinding } from '../../scripts/ops/r24/claim-binding.mjs';
import { canonicalDigest } from '../../scripts/ops/r24/canonical-json.mjs';
import { HISTORICAL_INVENTORY_CLAIM_PINS_V19 } from '../../scripts/ops/r24/docs-claim-lint.mjs';
import { WP706_MAIN_PRODUCT_ADMISSION_EXPECTATION as E } from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';

const C = 'docs/OPS/R24/CORRECTIVE/';
const h = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file));
const names = [
  'MAIN_PRODUCT_OWNER_AUTHORITY', 'MAIN_PRODUCT_STAGE_INSTANCE', 'MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION',
  'PROTECTED_WIP_BEFORE', 'V2_TERMINAL_PREDECESSOR', 'WORD_REPORT_CONTRACT', 'WORD_REPORT_OBSERVED',
  'FEATURE_INTEGRATION_MANIFEST', 'FIXTURE_MANIFEST', 'EFFECTIVE_GRAPH_BASELINE', 'CARRIER_REGISTRY',
  'ACCEPTANCE_MATRIX', 'EFFECTIVE_STATE', 'STAGE_REGISTRY', 'LEASE_RELEASE', 'TERMINAL_RECEIPT',
];
const load = () => Object.fromEntries(names.map(name => [name, read(`${C}WP706_${name}_V1.json`)]));
const counts = states => Object.fromEntries(['BLOCKED_TYPED', 'DONE', 'INELIGIBLE_OPTIONAL', 'PENDING']
  .map(state => [state, Object.values(states).filter(value => value === state).length]));

function verify(value) {
  const instance = value.MAIN_PRODUCT_STAGE_INSTANCE;
  const admission = value.MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION;
  const before = value.PROTECTED_WIP_BEFORE;
  const graph = value.EFFECTIVE_GRAPH_BASELINE;
  const contract = value.WORD_REPORT_CONTRACT;
  assert.equal(h(fs.readFileSync(`${C}WP706_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json`)), E.authorityDigest);
  assert.equal(h(fs.readFileSync(`${C}WP706_MAIN_PRODUCT_STAGE_INSTANCE_V1.json`)), E.instanceDigest);
  assert.equal(h(fs.readFileSync(`${C}WP706_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json`)), E.admissionDigest);
  assert.equal(instance.model, 'gpt-5.6-sol');
  assert.equal(instance.reasoningEffort, 'xhigh');
  assert.equal(admission.writeSetDigest, E.writeSetDigest);
  assert.deepEqual(instance.lease, { fencingCounter: 100, status: 'ACTIVE', wip: 1, predecessorReleaseDigest: E.predecessorReleaseDigest });
  const { snapshotSha256, ...payload } = before;
  assert.equal(h(Buffer.from(`${JSON.stringify(payload)}\n`)), snapshotSha256);
  assert.equal(snapshotSha256, E.protectedWipSnapshotDigest);
  assert.equal(before.completeDenominator, 302);
  assert.equal(before.entries.length, 302);
  assert.equal(before.dirtyDenominator, 11);
  assert.equal(value.V2_TERMINAL_PREDECESSOR.predecessorLeaseStatus, 'RELEASED');
  assert.equal(value.V2_TERMINAL_PREDECESSOR.predecessorWip, 0);
  assert.equal(contract.profileId, 'WORD_ROUNDTRIP');
  assert.equal(contract.profileVerdict, 'BLOCKED');
  assert.equal(contract.reportHarnessVerdict, 'PASS');
  assert.equal(contract.physicalInput.freshProviderExecutionByWp706, false);
  assert.equal(value.WORD_REPORT_OBSERVED.authority.wordProcessInvoked, false);
  assert.equal(value.WORD_REPORT_OBSERVED.authority.productApplyAuthority, false);
  assert.equal(value.FEATURE_INTEGRATION_MANIFEST.runtimeNetwork, false);
  assert.equal(value.FEATURE_INTEGRATION_MANIFEST.productPlane.mutation, false);
  assert.equal(graph.statesDigest, canonicalDigest(graph.states));
  assert.deepEqual(counts(graph.states), { BLOCKED_TYPED: 2, DONE: 87, INELIGIBLE_OPTIONAL: 10, PENDING: 10 });
  const targetStates = { ...graph.states, 'WP-706_WORD_REPORT': 'DONE' };
  assert.equal(value.EFFECTIVE_STATE.targetGraph.statesDigest, canonicalDigest(targetStates));
  assert.equal(value.EFFECTIVE_STATE.targetGraph.transition.nodeId, 'WP-706_WORD_REPORT');
  assert.deepEqual(value.EFFECTIVE_STATE.targetCounts, { BLOCKED_TYPED: 2, DONE: 88, INELIGIBLE_OPTIONAL: 10, PENDING: 9 });
  assert.deepEqual(value.EFFECTIVE_STATE.nextReadySet, []);
  assert.deepEqual(value.EFFECTIVE_STATE.ownerGatedSuccessorSet, ['WP-707_WORD_APPLY']);
  assert.equal(value.EFFECTIVE_STATE.wordProfileVerdict, 'BLOCKED');
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
  assert.equal(value.ACCEPTANCE_MATRIX.rows.filter(row => row.status === 'PASS').length, 22);
  assert.equal(value.ACCEPTANCE_MATRIX.rows.filter(row => row.status === 'REQUIRED_NOT_PRECLAIMED').length, 7);
  assert.equal(value.TERMINAL_RECEIPT.status, 'CONDITIONAL_DONE_PENDING_REQUIRED_LOCAL_AND_EXTERNAL_DELIVERY_PREDICATES');
  assert.equal(value.TERMINAL_RECEIPT.activationOutcome.doneCount, 88);
  assert.equal(value.TERMINAL_RECEIPT.activationOutcome.wordProfileVerdict, 'BLOCKED');
  assert.equal(value.LEASE_RELEASE.currentLease.status, 'ACTIVE');
  assert.equal(value.LEASE_RELEASE.targetLease.wip, 0);
  for (const [field, name] of [['leaseReleaseDigest', 'LEASE_RELEASE'], ['acceptanceMatrixDigest', 'ACCEPTANCE_MATRIX'], ['effectiveStateDigest', 'EFFECTIVE_STATE'], ['stageRegistryDigest', 'STAGE_REGISTRY']]) {
    assert.equal(value.TERMINAL_RECEIPT.bindings[field], h(fs.readFileSync(`${C}WP706_${name}_V1.json`)));
  }
  for (const carrier of Object.values(value)) if (Object.hasOwn(carrier, 'programDone')) assert.equal(carrier.programDone, false);
}

test('WP706 carriers bind exact admission, report-only harness, blocked Word profile and conditional release', () => {
  verify(load());
  const claim = buildClaimBinding(read('docs/OPS/R24/EVIDENCE/ES-R24-WP-706-WORD-REPORT-CLAIM-BINDINGS.json'));
  for (const binding of claim.claimBindings) assert.equal(h(fs.readFileSync(binding.filePath)), binding.sha256);
  assert.deepEqual(HISTORICAL_INVENTORY_CLAIM_PINS_V19.at(-1), {
    stampId: 'ES-R24-V2-WORD-CLAIM-COMPILER-CLAIM-BINDINGS',
    stampSha256: '9d50b57f07368f9eed011717a98be57b9dc890062e9fd2d5ce3b2b0274655218',
    evaluationSha: E.baseSha,
    evaluationTree: E.baseTree,
    targetSha256: 'b141bd93fc000fd13a2c61a67ffab43f01784d3c19e9c5d88187a6caf6f5fd7e',
  });
});

test('WP706 evidence carries 9 focused tests and 10 real source mutants', () => {
  const model = read('docs/OPS/R24/EVIDENCE/ES-R24-WP-706-WORD-REPORT-MODEL.json');
  assert.deepEqual(model.test, { denominator: 9, passed: 9, failed: 0, skipped: 0, todo: 0 });
  assert.equal(model.artifact.rawEvidence.processExitCode, 0);
  for (const artifact of model.artifact.implementationArtifacts) assert.equal(h(fs.readFileSync(artifact.path)), artifact.sha256);
  const mutants = read('docs/OPS/R24/EVIDENCE/ES-R24-WP-706-WORD-REPORT-MUTANTS.json');
  assert.deepEqual(mutants.claim, { ceiling: 'WP706_ACTUAL_SOURCE_MUTATION_SCORE_ONLY', actualSourceMutations: true, killed: 10, survived: 0, importFailures: 0, syntaxOrImportFailuresCountedAsKills: false });
});

test('WP706 carriers reject Word overclaim, graph overclaim, successor activation and false release', () => {
  const mutations = [
    value => { value.WORD_REPORT_CONTRACT.profileVerdict = 'PASS'; },
    value => { value.WORD_REPORT_OBSERVED.authority.productApplyAuthority = true; },
    value => { value.EFFECTIVE_GRAPH_BASELINE.states['WP-706_WORD_REPORT'] = 'DONE'; },
    value => { value.EFFECTIVE_STATE.targetCounts.DONE = 89; },
    value => { value.EFFECTIVE_STATE.nextReadySet = ['WP-707_WORD_APPLY']; },
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
