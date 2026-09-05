import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { buildClaimBinding } from '../../scripts/ops/r24/claim-binding.mjs';
import { canonicalDigest } from '../../scripts/ops/r24/canonical-json.mjs';
import { HISTORICAL_INVENTORY_CLAIM_PINS_V15 } from '../../scripts/ops/r24/docs-claim-lint.mjs';

const C = 'docs/OPS/R24/CORRECTIVE/';
const h = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file));
const names = ['MAIN_PRODUCT_OWNER_AUTHORITY','MAIN_PRODUCT_STAGE_INSTANCE','MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION','PROTECTED_WIP_BEFORE',
  'WP804_TERMINAL_PREDECESSOR','LOCAL_HISTORY_CONTRACT','FEATURE_INTEGRATION_MANIFEST','EFFECTIVE_GRAPH_BASELINE','CARRIER_REGISTRY','ACCEPTANCE_MATRIX',
  'EFFECTIVE_STATE','STAGE_REGISTRY','LEASE_RELEASE','TERMINAL_RECEIPT'];
const load = () => Object.fromEntries(names.map(name => [name, read(`${C}WP805_${name}_V1.json`)]));
const counts = states => Object.fromEntries(['BLOCKED_TYPED','DONE','INELIGIBLE_OPTIONAL','PENDING'].map(state => [state, Object.values(states).filter(value => value === state).length]));

function verify(value) {
  const instance = value.MAIN_PRODUCT_STAGE_INSTANCE;
  const admission = value.MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION;
  const before = value.PROTECTED_WIP_BEFORE;
  const graph = value.EFFECTIVE_GRAPH_BASELINE;
  const contract = value.LOCAL_HISTORY_CONTRACT;
  assert.equal(h(fs.readFileSync(`${C}WP805_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json`)), '9e617c71a311a68f331e8e00a22f0dd4513551e30aeaf2fb9983502bcaeaee92');
  assert.equal(h(fs.readFileSync(`${C}WP805_MAIN_PRODUCT_STAGE_INSTANCE_V1.json`)), '65163e833173b72408cde717bc408c88ef59309a2cb8689f2faccb2c96f98177');
  assert.equal(h(fs.readFileSync(`${C}WP805_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json`)), 'c6221c7b603ffeac99e7774899f5058be0d917917e7b98bcae47e24085ca5caa');
  assert.equal(admission.writeSetDigest, '23891eebfc31baff6574b3803b7705f74304a5474e53fabafefd611169ae38ea');
  assert.deepEqual(instance.lease, { fencingCounter: 96, status: 'ACTIVE', wip: 1, predecessorReleaseDigest: '610ba880eb36af11305d66e56f62e152dcd3104591a6cb12297cc347c60f84a9' });
  const { snapshotSha256, ...payload } = before;
  assert.equal(h(Buffer.from(`${JSON.stringify(payload)}\n`)), snapshotSha256);
  assert.equal(snapshotSha256, 'ca2e424371eef8745f440f2991a0d22fbc65b0d2ba540460882af61337a56135');
  assert.equal(before.completeDenominator, 292);
  assert.equal(before.entries.length, 292);
  assert.equal(before.dirtyDenominator, 10);
  assert.equal(value.WP804_TERMINAL_PREDECESSOR.predecessorStageId, 'WP-804_PULSE_PRIVACY');
  assert.equal(value.WP804_TERMINAL_PREDECESSOR.predecessorWip, 0);
  assert.equal(contract.semanticDiff.mode, 'THREE_WAY_EFFECTIVE_AGGREGATE_VALUES');
  assert.equal(contract.lineage.appendOnly, true);
  assert.equal(contract.conflicts.typed, true);
  assert.equal(contract.conflicts.explicitLocalDecisionRequired, true);
  assert.equal(contract.persistence.appendOnlyHashChain, true);
  assert.equal(contract.authority.network, false);
  assert.equal(contract.authority.requestPath, false);
  assert.equal(value.FEATURE_INTEGRATION_MANIFEST.runtimeNetwork, false);
  assert.equal(value.FEATURE_INTEGRATION_MANIFEST.interfacePlane.designOs, 'NOT_APPLICABLE_NO_UI');
  assert.equal(graph.statesDigest, canonicalDigest(graph.states));
  assert.deepEqual(counts(graph.states), { BLOCKED_TYPED: 3, DONE: 83, INELIGIBLE_OPTIONAL: 10, PENDING: 13 });
  assert.deepEqual(value.EFFECTIVE_STATE.targetStates, { ...graph.states, 'WP-805_LOCAL_HISTORY': 'DONE' });
  assert.deepEqual(value.EFFECTIVE_STATE.targetCounts, { BLOCKED_TYPED: 3, DONE: 84, INELIGIBLE_OPTIONAL: 10, PENDING: 12 });
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
  const acceptance = value.ACCEPTANCE_MATRIX;
  assert.equal(acceptance.denominator, acceptance.rows.length);
  assert.equal(acceptance.rows.filter(row => row.status === 'REQUIRED_NOT_PRECLAIMED').length, 7);
  assert.equal(value.TERMINAL_RECEIPT.status, 'CONDITIONAL_DONE_PENDING_REQUIRED_LOCAL_AND_EXTERNAL_PREDICATES');
  assert.equal(value.TERMINAL_RECEIPT.activationOutcome.doneCount, 84);
  assert.equal(value.LEASE_RELEASE.currentLease.status, 'ACTIVE');
  assert.equal(value.LEASE_RELEASE.targetLease.wip, 0);
  for (const [field, name] of [['leaseReleaseDigest','LEASE_RELEASE'],['acceptanceMatrixDigest','ACCEPTANCE_MATRIX'],['effectiveStateDigest','EFFECTIVE_STATE'],['stageRegistryDigest','STAGE_REGISTRY']]) {
    assert.equal(value.TERMINAL_RECEIPT.bindings[field], h(fs.readFileSync(`${C}WP805_${name}_V1.json`)));
  }
  for (const carrier of Object.values(value)) if (Object.hasOwn(carrier, 'programDone')) assert.equal(carrier.programDone, false);
}

test('WP805 carriers bind exact admission, local-history semantics, bytes and conditional release', () => {
  verify(load());
  const claim = buildClaimBinding(read('docs/OPS/R24/EVIDENCE/ES-R24-WP-805-LOCAL-HISTORY-CLAIM-BINDINGS.json'));
  for (const binding of claim.claimBindings) assert.equal(h(fs.readFileSync(binding.filePath)), binding.sha256);
  assert.deepEqual(HISTORICAL_INVENTORY_CLAIM_PINS_V15.at(-1), {
    stampId: 'ES-R24-WP-804-PULSE-PRIVACY-CLAIM-BINDINGS',
    stampSha256: '128367e68a32830e1f94a779bafedc1ffc9113db887165b9d116c1226e42f8e2',
    evaluationSha: '22a12573e3539c5f91064cc6db90c0a1c47cbaa1',
    evaluationTree: 'fe4f6bb400bc3eb776929f34d50b3fed7e5980f3',
    targetSha256: 'fd37b1349fceae304b908e1aab0b99ae8b66380201656055b41fb790c8f46228',
  });
});

test('WP805 evidence carries 23 executed tests and 10 actual implementation mutants', () => {
  for (const kind of ['MODEL','CONTRACT','INTEGRATION','MUTANTS']) {
    const evidence = read(`docs/OPS/R24/EVIDENCE/ES-R24-WP-805-LOCAL-HISTORY-${kind}.json`);
    const raw = evidence.artifact.rawEvidence;
    const bytes = Buffer.from(raw.stdoutBase64, 'base64');
    assert.equal(bytes.length, raw.byteLength);
    assert.equal(h(bytes), raw.sha256);
    assert.match(bytes.toString(), /\n1\.\.23\n# tests 23\n# suites 0\n# pass 23\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n/u);
    assert.equal(raw.processExitCode, 0);
    for (const artifact of evidence.artifact.implementationArtifacts) assert.equal(h(fs.readFileSync(artifact.path)), artifact.sha256);
    if (kind === 'MUTANTS') {
      assert.equal(evidence.test.denominator, 10);
      assert.equal(evidence.claim.actualSourceMutations, true);
      assert.equal((bytes.toString().match(/^ok \d+ - WP805 kills implementation mutant:/gmu) || []).length, 10);
    }
  }
});

test('WP805 carriers reject lineage bypass, network authority, graph overclaim and false release', () => {
  const mutations = [
    value => { value.LOCAL_HISTORY_CONTRACT.lineage.appendOnly = false; },
    value => { value.LOCAL_HISTORY_CONTRACT.authority.network = true; },
    value => { value.LOCAL_HISTORY_CONTRACT.authority.requestPath = true; },
    value => { value.EFFECTIVE_GRAPH_BASELINE.states['WP-805_LOCAL_HISTORY'] = 'DONE'; },
    value => { value.EFFECTIVE_STATE.targetCounts.DONE = 85; },
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
