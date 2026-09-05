import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { buildClaimBinding } from '../../scripts/ops/r24/claim-binding.mjs';
import { canonicalDigest } from '../../scripts/ops/r24/canonical-json.mjs';
import { HISTORICAL_INVENTORY_CLAIM_PINS_V14 } from '../../scripts/ops/r24/docs-claim-lint.mjs';

const C = 'docs/OPS/R24/CORRECTIVE/';
const h = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file));
const names = ['MAIN_PRODUCT_OWNER_AUTHORITY','MAIN_PRODUCT_STAGE_INSTANCE','MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION','PROTECTED_WIP_BEFORE',
  'WP803_TERMINAL_PREDECESSOR','PULSE_PRIVACY_CONTRACT','FEATURE_INTEGRATION_MANIFEST','EFFECTIVE_GRAPH_BASELINE','CARRIER_REGISTRY','ACCEPTANCE_MATRIX',
  'EFFECTIVE_STATE','STAGE_REGISTRY','LEASE_RELEASE','TERMINAL_RECEIPT'];
const load = () => Object.fromEntries(names.map(name => [name, read(`${C}WP804_${name}_V1.json`)]));
const counts = states => Object.fromEntries(['BLOCKED_TYPED','DONE','INELIGIBLE_OPTIONAL','PENDING'].map(state => [state, Object.values(states).filter(value => value === state).length]));

function verify(value) {
  const instance = value.MAIN_PRODUCT_STAGE_INSTANCE;
  const admission = value.MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION;
  const before = value.PROTECTED_WIP_BEFORE;
  const graph = value.EFFECTIVE_GRAPH_BASELINE;
  const contract = value.PULSE_PRIVACY_CONTRACT;
  assert.equal(h(fs.readFileSync(`${C}WP804_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json`)), '165256d2ec8cad19fa9214fb6dcd20b297fba6edcd0c65447bc1e9dc4b6fdb9e');
  assert.equal(h(fs.readFileSync(`${C}WP804_MAIN_PRODUCT_STAGE_INSTANCE_V1.json`)), 'f50a700482da9fa7f198f55f99d05395bb3b2f522f173550a9928d4d69c6c89a');
  assert.equal(h(fs.readFileSync(`${C}WP804_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json`)), '5533d8d9caa75751251a9697251dd50d86c64bb53433bddbfd1b5d9c793e2c43');
  assert.equal(h(fs.readFileSync('docs/OPS/R24/OWNER_GATE_DECISIONS/PULSE_RETENTION_ADR_WP804_PULSE_PRIVACY_V1.json')), '020e35546b2e568e2be0e532cc7f057f3aacfc07dfd4737286508fac0a599dd3');
  assert.equal(admission.writeSetDigest, 'e59291eae2a450800a0d08e90be6a37927599e22a9102b1648b93818fd9382a5');
  assert.deepEqual(instance.lease, { fencingCounter: 95, status: 'ACTIVE', wip: 1, predecessorReleaseDigest: '8543978f6f6dfadd8659e0de171c9ec3adaa0f288b53a0fa6d0096136660ffca' });
  const { snapshotSha256, ...payload } = before;
  assert.equal(h(Buffer.from(`${JSON.stringify(payload)}\n`)), snapshotSha256);
  assert.equal(snapshotSha256, 'bde27115015b8a27c31d79ac3f4a4a39237c550dcda2ddba9c424e60b45db006');
  assert.equal(before.completeDenominator, 290);
  assert.equal(before.entries.length, 290);
  assert.equal(before.dirtyDenominator, 10);
  assert.equal(value.WP803_TERMINAL_PREDECESSOR.predecessorStageId, 'WP-803_DESCRIPTIVE_HISTORY');
  assert.equal(value.WP803_TERMINAL_PREDECESSOR.predecessorWip, 0);
  assert.equal(contract.policy.maximumRetainedEntries, 4096);
  assert.equal(contract.policy.automaticCleanup, false);
  assert.equal(contract.consent.defaultStatus, 'OPTED_OUT');
  assert.equal(contract.consent.explicitOptInRequired, true);
  assert.equal(contract.corrections.appendOnlyHashChain, true);
  assert.equal(contract.effects.requestPathAuthority, false);
  assert.equal(value.FEATURE_INTEGRATION_MANIFEST.runtimeNetwork, false);
  assert.equal(value.FEATURE_INTEGRATION_MANIFEST.interfacePlane.designOs, 'NOT_APPLICABLE_NO_UI');
  assert.equal(graph.statesDigest, canonicalDigest(graph.states));
  assert.deepEqual(counts(graph.states), { BLOCKED_TYPED: 3, DONE: 82, INELIGIBLE_OPTIONAL: 10, PENDING: 14 });
  assert.deepEqual(value.EFFECTIVE_STATE.targetStates, { ...graph.states, 'WP-804_PULSE_PRIVACY': 'DONE' });
  assert.deepEqual(value.EFFECTIVE_STATE.targetCounts, { BLOCKED_TYPED: 3, DONE: 83, INELIGIBLE_OPTIONAL: 10, PENDING: 13 });
  const admitted = [...instance.operations.modifyPaths, ...instance.operations.createPaths].sort();
  const registry = value.CARRIER_REGISTRY;
  assert.deepEqual([...registry.carriers.map(binding => binding.path), ...registry.excludedDependentCarriers].sort(), admitted);
  assert.equal(admitted.length, 41);
  assert.equal(registry.carrierDenominator, 33);
  assert.equal(registry.currentTreeFallbackAllowed, false);
  for (const binding of registry.carriers) {
    const bytes = execFileSync('git', ['show', `22a12573e3539c5f91064cc6db90c0a1c47cbaa1:${binding.path}`]);
    assert.equal(h(bytes), binding.sha256, binding.path);
    assert.equal(bytes.length, binding.byteLength);
  }
  const acceptance = value.ACCEPTANCE_MATRIX;
  assert.equal(acceptance.denominator, acceptance.rows.length);
  assert.equal(acceptance.rows.filter(row => row.status === 'REQUIRED_NOT_PRECLAIMED').length, 7);
  assert.equal(value.TERMINAL_RECEIPT.status, 'CONDITIONAL_DONE_PENDING_REQUIRED_LOCAL_AND_EXTERNAL_PREDICATES');
  assert.equal(value.TERMINAL_RECEIPT.activationOutcome.doneCount, 83);
  assert.equal(value.LEASE_RELEASE.currentLease.status, 'ACTIVE');
  assert.equal(value.LEASE_RELEASE.targetLease.wip, 0);
  for (const [field, name] of [['leaseReleaseDigest','LEASE_RELEASE'],['acceptanceMatrixDigest','ACCEPTANCE_MATRIX'],['effectiveStateDigest','EFFECTIVE_STATE'],['stageRegistryDigest','STAGE_REGISTRY']]) {
    assert.equal(value.TERMINAL_RECEIPT.bindings[field], h(fs.readFileSync(`${C}WP804_${name}_V1.json`)));
  }
  for (const carrier of Object.values(value)) if (Object.hasOwn(carrier, 'programDone')) assert.equal(carrier.programDone, false);
}

test('WP804 carriers bind exact admission, privacy semantics, bytes and conditional release', () => {
  verify(load());
  const claim = buildClaimBinding(read('docs/OPS/R24/EVIDENCE/ES-R24-WP-804-PULSE-PRIVACY-CLAIM-BINDINGS.json'));
  for (const binding of claim.claimBindings) {
    const bytes = execFileSync('git', ['show', `22a12573e3539c5f91064cc6db90c0a1c47cbaa1:${binding.filePath}`]);
    assert.equal(h(bytes), binding.sha256);
  }
  assert.equal(HISTORICAL_INVENTORY_CLAIM_PINS_V14.at(-1).evaluationSha, '86b79c5b3866e3c2d819569f17b8a38f4ffe26aa');
});

test('WP804 evidence carries 24 executed tests and 10 actual implementation mutants', () => {
  for (const kind of ['MODEL','CONTRACT','INTEGRATION','MUTANTS']) {
    const evidence = read(`docs/OPS/R24/EVIDENCE/ES-R24-WP-804-PULSE-PRIVACY-${kind}.json`);
    const raw = evidence.artifact.rawEvidence;
    const bytes = Buffer.from(raw.stdoutBase64, 'base64');
    assert.equal(bytes.length, raw.byteLength);
    assert.equal(h(bytes), raw.sha256);
    assert.match(bytes.toString(), /\n1\.\.24\n# tests 24\n# suites 0\n# pass 24\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n/u);
    assert.equal(raw.processExitCode, 0);
    for (const artifact of evidence.artifact.implementationArtifacts) assert.equal(h(fs.readFileSync(artifact.path)), artifact.sha256);
    if (kind === 'MUTANTS') {
      assert.equal(evidence.test.denominator, 10);
      assert.equal(evidence.claim.actualSourceMutations, true);
      assert.equal((bytes.toString().match(/^ok \d+ - WP804 kills implementation mutant:/gmu) || []).length, 10);
    }
  }
});

test('WP804 carriers reject implicit collection, cleanup, path authority, graph overclaim and false release', () => {
  const mutations = [
    value => { value.PULSE_PRIVACY_CONTRACT.consent.explicitOptInRequired = false; },
    value => { value.PULSE_PRIVACY_CONTRACT.policy.automaticCleanup = true; },
    value => { value.PULSE_PRIVACY_CONTRACT.effects.requestPathAuthority = true; },
    value => { value.EFFECTIVE_GRAPH_BASELINE.states['WP-804_PULSE_PRIVACY'] = 'DONE'; },
    value => { value.EFFECTIVE_STATE.targetCounts.DONE = 84; },
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

test('WP804 terminal receipt is the exact released predecessor of WP805', () => {
  const successor = read(`${C}WP805_WP804_TERMINAL_PREDECESSOR_V1.json`);
  assert.equal(successor.predecessorStageId, 'WP-804_PULSE_PRIVACY');
  assert.equal(successor.predecessorMergeSha, '22a12573e3539c5f91064cc6db90c0a1c47cbaa1');
  assert.equal(successor.predecessorTerminalReceiptSha256, 'a89b3154c4ecb8dbdc720e4a0b1ae8ec55b3100b7362d15fbe0a4bc1f92cd6b3');
  assert.equal(successor.predecessorLeaseReleaseDispositionSha256, '610ba880eb36af11305d66e56f62e152dcd3104591a6cb12297cc347c60f84a9');
  assert.equal(successor.predecessorWip, 0);
});
