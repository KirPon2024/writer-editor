import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { buildClaimBinding } from '../../scripts/ops/r24/claim-binding.mjs';
import { canonicalDigest } from '../../scripts/ops/r24/canonical-json.mjs';
import { HISTORICAL_INVENTORY_CLAIM_PINS_V11 } from '../../scripts/ops/r24/docs-claim-lint.mjs';

const C = 'docs/OPS/R24/CORRECTIVE/';
const h = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const paths = {
  authority: C + 'WP801_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json',
  instance: C + 'WP801_MAIN_PRODUCT_STAGE_INSTANCE_V1.json',
  admission: C + 'WP801_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json',
  selection: C + 'WP801_MAIN_PRODUCT_SELECTION_RECEIPT_V1.json',
  before: C + 'WP801_PROTECTED_WIP_BEFORE_V1.json',
  predecessor: C + 'WP801_WP800_TERMINAL_PREDECESSOR_V1.json',
  fixture: C + 'WP801_FIXTURE_MANIFEST_V1.json',
  contract: C + 'WP801_PULSE_LEDGER_CONTRACT_V1.json',
  feature: C + 'WP801_FEATURE_INTEGRATION_MANIFEST_V1.json',
  graph: C + 'WP801_EFFECTIVE_GRAPH_BASELINE_V1.json',
  registry: C + 'WP801_CARRIER_REGISTRY_V1.json',
  acceptance: C + 'WP801_ACCEPTANCE_MATRIX_V1.json',
  state: C + 'WP801_EFFECTIVE_STATE_V1.json',
  stageRegistry: C + 'WP801_STAGE_REGISTRY_V1.json',
  lease: C + 'WP801_LEASE_RELEASE_V1.json',
  terminal: C + 'WP801_TERMINAL_RECEIPT_V1.json',
};
const bytes = (file) => fs.readFileSync(file);
const read = (file) => JSON.parse(bytes(file));
const counts = (states) => Object.fromEntries(['BLOCKED_TYPED', 'DONE', 'INELIGIBLE_OPTIONAL', 'PENDING'].map((state) => [state, Object.values(states).filter((value) => value === state).length]));
function load() { return Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, read(file)])); }

function verify(values) {
  assert.equal(h(bytes(paths.authority)), '75d3cde6716eec93bfb540c1a9364c9c8e159499417dd0937fd79bc3300fc67a');
  assert.equal(h(bytes(paths.instance)), '34754d8797c4d1495a712ce079ea892eeaa17c010130a31acdbb6690a636822c');
  assert.equal(h(bytes(paths.admission)), 'c936d54dbd11acdfae7599aea720b1b5db43304e69737780a047b1fc3c824498');
  assert.equal(values.admission.writeSetDigest, '32987d25b85ac966097ecf4726485501555f9d3fff4e3f195ec5594786948b7e');
  assert.deepEqual(values.instance.lease, { fencingCounter: 92, status: 'ACTIVE', wip: 1, predecessorReleaseDigest: 'e0c755502d4e3ace92d0c0aa41bc3b14b46e2a931864f7da951a1af13e36e366' });
  assert.equal(values.instance.model, 'gpt-6-astra');
  assert.equal(values.instance.reasoningEffort, 'xhigh');
  const { snapshotSha256, ...payload } = values.before;
  assert.equal(h(Buffer.from(JSON.stringify(payload) + '\n')), snapshotSha256);
  assert.equal(values.before.completeDenominator, 284);
  assert.equal(values.before.entries.length, 284);
  assert.equal(values.before.dirtyDenominator, 10);
  assert.equal(values.predecessor.predecessorLeaseStatus, 'RELEASED');
  assert.equal(values.predecessor.predecessorWip, 0);
  assert.deepEqual(values.predecessor.predecessorGraphCounts, { DONE: 79, PENDING: 17, BLOCKED_TYPED: 3, INELIGIBLE_OPTIONAL: 10 });
  assert.equal(values.fixture.syntheticOnly, true);
  assert.equal(values.fixture.realOwnerDocuments, false);
  assert.equal(values.contract.logicalAppendOnly, true);
  assert.equal(values.contract.persistence.atomicReplacement, true);
  assert.equal(values.contract.protocol.expectedSequenceCompareAndSwap, true);
  assert.equal(values.contract.protocol.idempotencyKeyHashedBeforePersistence, true);
  assert.equal(values.contract.recovery.provablePendingPhases.length, 5);
  assert.equal(values.contract.capacity.maximumEntries, 4096);
  assert.equal(values.feature.interfacePlane.designOs, 'NOT_APPLICABLE_NO_UI');
  assert.equal(values.feature.runtimeNetwork, false);
  assert.equal(values.graph.completeDenominator, 109);
  assert.equal(canonicalDigest(values.graph.states), values.graph.statesDigest);
  assert.deepEqual(counts(values.graph.states), { BLOCKED_TYPED: 3, DONE: 79, INELIGIBLE_OPTIONAL: 10, PENDING: 17 });
  assert.deepEqual(values.state.currentCounts, counts(values.graph.states));
  assert.deepEqual(values.state.targetStates, { ...values.graph.states, 'WP-801_PULSE_LEDGER': 'DONE' });
  assert.deepEqual(values.state.targetCounts, { BLOCKED_TYPED: 3, DONE: 80, INELIGIBLE_OPTIONAL: 10, PENDING: 16 });
  const admitted = [...values.instance.operations.modifyPaths, ...values.instance.operations.createPaths].sort();
  const allCarriers = [...values.registry.carriers.map((row) => row.path), ...values.registry.excludedDependentCarriers].sort();
  assert.deepEqual(allCarriers, admitted);
  assert.equal(new Set(allCarriers).size, 41);
  assert.equal(values.registry.carrierDenominator, 33);
  assert.equal(values.registry.currentTreeFallbackAllowed, false);
  for (const binding of values.registry.carriers) {
    assert.equal(h(bytes(binding.path)), binding.sha256, binding.path);
    assert.equal(bytes(binding.path).length, binding.byteLength, binding.path);
  }
  assert.equal(values.acceptance.rows.length, values.acceptance.denominator);
  assert.equal(values.acceptance.rows.filter((row) => row.status === 'PASS').length, values.acceptance.localPassCount);
  assert.equal(values.acceptance.rows.filter((row) => row.status === 'REQUIRED_NOT_PRECLAIMED').length, values.acceptance.localRequiredCount + values.acceptance.externalRequiredCount);
  assert.equal(values.terminal.status, 'CONDITIONAL_DONE_PENDING_REQUIRED_LOCAL_AND_EXTERNAL_PREDICATES');
  assert.equal(values.terminal.bindings.leaseReleaseDigest, h(bytes(paths.lease)));
  assert.equal(values.terminal.bindings.acceptanceMatrixDigest, h(bytes(paths.acceptance)));
  assert.equal(values.terminal.bindings.effectiveStateDigest, h(bytes(paths.state)));
  assert.equal(values.lease.currentLease.status, 'ACTIVE');
  assert.equal(values.lease.targetLease.status, 'RELEASED');
  assert.equal(values.lease.targetLease.wip, 0);
  assert.equal(values.terminal.activationOutcome.doneCount, 80);
  assert.equal(values.terminal.activationOutcome.pendingCount, 16);
  for (const value of Object.values(values)) if (Object.hasOwn(value, 'programDone')) assert.equal(value.programDone, false);
  return true;
}

test('WP801 carriers bind admission, durable ledger protocol, graph increment and conditional release', () => {
  const values = load();
  assert.equal(verify(values), true);
  const claim = buildClaimBinding(read('docs/OPS/R24/EVIDENCE/ES-R24-WP-801-PULSE-LEDGER-CLAIM-BINDINGS.json'));
  for (const binding of claim.claimBindings) assert.equal(h(bytes(binding.filePath)), binding.sha256, binding.filePath);
  for (const binding of claim.implementationArtifactDigests) assert.equal(h(bytes(binding.path)), binding.sha256, binding.path);
  assert.ok(claim.nonClaims.includes('PROGRAM_DONE_FALSE'));
  assert.deepEqual(HISTORICAL_INVENTORY_CLAIM_PINS_V11.at(-1), { stampId: 'ES-R24-WP-800-PULSE-POLICY-CODEC-CLAIM-BINDINGS', stampSha256: '1afa04b7d79b978f2fdec427fb7076b8503df0362e782f4bc6037452dc4314e0', evaluationSha: 'acfbd6896cd9830ab48f794bbbb2a433bd72b42d', evaluationTree: '1981f9b3d7a9963b54472ea3b0d47b40f13fa359', targetSha256: '3f1eed6cebb483b42ef182fee19af777417b01d65aca8fd431ded4f1c9c50aef' });
});

test('WP801 evidence stamps bind all 19 executed tests with no skip or todo', () => {
  const prefix = 'docs/OPS/R24/EVIDENCE/ES-R24-WP-801-PULSE-LEDGER-';
  for (const kind of ['MODEL', 'CONTRACT', 'INTEGRATION', 'MUTANTS']) {
    const evidence = read(prefix + kind + '.json');
    const raw = evidence.artifact.rawEvidence;
    const rawBytes = Buffer.from(raw.stdoutBase64, 'base64');
    assert.equal(rawBytes.length, raw.byteLength);
    assert.equal(h(rawBytes), raw.sha256);
    assert.match(rawBytes.toString(), /\n1\.\.19\n# tests 19\n# suites 0\n# pass 19\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n/u);
    assert.equal(raw.processExitCode, 0);
    assert.equal(raw.node, '22.12.0');
    for (const binding of evidence.artifact.implementationArtifacts) assert.equal(h(bytes(binding.path)), binding.sha256, binding.path);
  }
  assert.equal(read(prefix + 'MUTANTS.json').test.denominator, 8);
  assert.equal(read(prefix + 'MUTANTS.json').test.passed, 8);
});

test('WP801 carrier mutants reject graph overclaim, widened capacity and false release', () => {
  const mutations = [
    (value) => { value.before.entries.pop(); },
    (value) => { value.graph.states['WP-801_PULSE_LEDGER'] = 'DONE'; },
    (value) => { value.state.targetCounts.DONE = 81; },
    (value) => { value.contract.capacity.maximumEntries = 4097; },
    (value) => { value.contract.recovery.provablePendingPhases.pop(); },
    (value) => { value.registry.currentTreeFallbackAllowed = true; },
    (value) => { value.terminal.status = 'CERTIFIED_DONE'; },
    (value) => { value.lease.targetLease.wip = 1; },
    (value) => { value.terminal.programDone = true; },
  ];
  for (const mutate of mutations) {
    const values = structuredClone(load());
    mutate(values);
    assert.throws(() => verify(values));
  }
  assert.equal(mutations.length, 9);
});
