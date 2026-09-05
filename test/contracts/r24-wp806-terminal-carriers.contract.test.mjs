import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { buildClaimBinding } from '../../scripts/ops/r24/claim-binding.mjs';
import { canonicalDigest } from '../../scripts/ops/r24/canonical-json.mjs';
import { HISTORICAL_INVENTORY_CLAIM_PINS_V16 } from '../../scripts/ops/r24/docs-claim-lint.mjs';

const C = 'docs/OPS/R24/CORRECTIVE/';
const h = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file));
const names = ['MAIN_PRODUCT_OWNER_AUTHORITY','MAIN_PRODUCT_STAGE_INSTANCE','MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION','PROTECTED_WIP_BEFORE',
  'PULSE_PRODUCT_ADMISSION_OWNER_DECISION','WP805_TERMINAL_PREDECESSOR','PULSE_CLAIM_CONTRACT','FEATURE_INTEGRATION_MANIFEST','SURFACE_MANIFEST',
  'EFFECTIVE_GRAPH_BASELINE','CARRIER_REGISTRY','ACCEPTANCE_MATRIX','EFFECTIVE_STATE','STAGE_REGISTRY','LEASE_RELEASE','TERMINAL_RECEIPT'];
const load = () => Object.fromEntries(names.map(name => [name, read(`${C}WP806_${name}_V1.json`)]));
const counts = states => Object.fromEntries(['BLOCKED_TYPED','DONE','INELIGIBLE_OPTIONAL','PENDING'].map(state => [state, Object.values(states).filter(value => value === state).length]));

function verify(value) {
  const instance = value.MAIN_PRODUCT_STAGE_INSTANCE;
  const admission = value.MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION;
  const before = value.PROTECTED_WIP_BEFORE;
  const graph = value.EFFECTIVE_GRAPH_BASELINE;
  const contract = value.PULSE_CLAIM_CONTRACT;
  assert.equal(h(fs.readFileSync(`${C}WP806_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json`)), '4cc0e94e2b1c63cfd793de53a5cc771cf9c30273ad05a723cd56d247d8be7d20');
  assert.equal(h(fs.readFileSync(`${C}WP806_MAIN_PRODUCT_STAGE_INSTANCE_V1.json`)), '084199bfd07fb847a680baf3ecbb6698bd089ea12eacdf98850e0101e30011b9');
  assert.equal(h(fs.readFileSync(`${C}WP806_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json`)), '910a24f2bfea599c5685a70718c85e017fbb87bf4e0ab831164e07cb7d493b1c');
  assert.equal(instance.model, 'gpt-5.6-sol');
  assert.equal(instance.reasoningEffort, 'xhigh');
  assert.equal(admission.writeSetDigest, 'b93bf307c528c0859cd8ea2767ce838b148a46b55ae72889047440ed3e7de86d');
  assert.deepEqual(instance.lease, { fencingCounter: 97, status: 'ACTIVE', wip: 1, predecessorReleaseDigest: 'aace469be1af1657d077314b3718a830bf27ddaa1ef4cdb91ddb4024662a3efd' });
  const { snapshotSha256, ...payload } = before;
  assert.equal(h(Buffer.from(`${JSON.stringify(payload)}\n`)), snapshotSha256);
  assert.equal(snapshotSha256, 'd82ec9e83eea6d5de2e76465fd1004790f51285fffe463858e6c3ccfb71343a0');
  assert.equal(before.completeDenominator, 295);
  assert.equal(before.entries.length, 295);
  assert.equal(before.dirtyDenominator, 11);
  assert.equal(value.PULSE_PRODUCT_ADMISSION_OWNER_DECISION.decision, 'APPROVED');
  assert.equal(value.PULSE_PRODUCT_ADMISSION_OWNER_DECISION.model, 'gpt-5.6-sol');
  assert.equal(value.WP805_TERMINAL_PREDECESSOR.predecessorLeaseStatus, 'RELEASED');
  assert.equal(value.WP805_TERMINAL_PREDECESSOR.predecessorWip, 0);
  assert.equal(contract.claims.descriptiveOnly, true);
  assert.equal(contract.missingValues.notRecordedIsZero, false);
  assert.equal(contract.authority.rendererPath, false);
  assert.equal(contract.authority.storageMutation, false);
  assert.equal(contract.authority.network, false);
  assert.equal(value.FEATURE_INTEGRATION_MANIFEST.runtimeNetwork, false);
  assert.equal(value.SURFACE_MANIFEST.accessibility.nativeList, true);
  assert.equal(value.SURFACE_MANIFEST.activation.explicitOpenRequired, true);
  assert.equal(graph.statesDigest, canonicalDigest(graph.states));
  assert.deepEqual(counts(graph.states), { BLOCKED_TYPED: 3, DONE: 84, INELIGIBLE_OPTIONAL: 10, PENDING: 12 });
  assert.deepEqual(value.EFFECTIVE_STATE.targetStates, { ...graph.states, 'WP-806_PULSE_CLAIM': 'DONE' });
  assert.deepEqual(value.EFFECTIVE_STATE.targetCounts, { BLOCKED_TYPED: 3, DONE: 85, INELIGIBLE_OPTIONAL: 10, PENDING: 11 });
  const admitted = [...instance.operations.modifyPaths, ...instance.operations.createPaths].sort();
  const registry = value.CARRIER_REGISTRY;
  assert.deepEqual([...registry.carriers.map(binding => binding.path), ...registry.excludedDependentCarriers].sort(), admitted);
  assert.equal(admitted.length, 47);
  assert.equal(registry.carrierDenominator, 39);
  assert.equal(registry.currentTreeFallbackAllowed, false);
  for (const binding of registry.carriers) {
    const bytes = fs.readFileSync(binding.path);
    assert.equal(h(bytes), binding.sha256, binding.path);
    assert.equal(bytes.length, binding.byteLength);
  }
  assert.equal(value.ACCEPTANCE_MATRIX.denominator, value.ACCEPTANCE_MATRIX.rows.length);
  assert.equal(value.ACCEPTANCE_MATRIX.rows.filter(row => row.status === 'PASS').length, 22);
  assert.equal(value.ACCEPTANCE_MATRIX.rows.filter(row => row.status === 'REQUIRED_NOT_PRECLAIMED').length, 7);
  assert.equal(value.TERMINAL_RECEIPT.status, 'CONDITIONAL_DONE_PENDING_REQUIRED_LOCAL_AND_EXTERNAL_PREDICATES');
  assert.equal(value.TERMINAL_RECEIPT.activationOutcome.doneCount, 85);
  assert.equal(value.LEASE_RELEASE.currentLease.status, 'ACTIVE');
  assert.equal(value.LEASE_RELEASE.targetLease.wip, 0);
  for (const [field, name] of [['leaseReleaseDigest','LEASE_RELEASE'],['acceptanceMatrixDigest','ACCEPTANCE_MATRIX'],['effectiveStateDigest','EFFECTIVE_STATE'],['stageRegistryDigest','STAGE_REGISTRY']]) {
    assert.equal(value.TERMINAL_RECEIPT.bindings[field], h(fs.readFileSync(`${C}WP806_${name}_V1.json`)));
  }
  for (const carrier of Object.values(value)) if (Object.hasOwn(carrier, 'programDone')) assert.equal(carrier.programDone, false);
}

test('WP806 carriers bind exact Sol admission, Pulse claim semantics and conditional release', () => {
  verify(load());
  const claim = buildClaimBinding(read('docs/OPS/R24/EVIDENCE/ES-R24-WP-806-PULSE-CLAIM-CLAIM-BINDINGS.json'));
  for (const binding of claim.claimBindings) assert.equal(h(fs.readFileSync(binding.filePath)), binding.sha256);
  assert.deepEqual(HISTORICAL_INVENTORY_CLAIM_PINS_V16.at(-1), {
    stampId: 'ES-R24-WP-805-LOCAL-HISTORY-CLAIM-BINDINGS',
    stampSha256: 'e3929caec7d09b9a6f7620d4b5f76c6984ad4051117107ad680d14d40b6f2310',
    evaluationSha: '0eed3261e0d7f2b394336be0b082140e633981e2',
    evaluationTree: 'd22411ca09571f9fb9cde35af806b111fb588a7c',
    targetSha256: 'ccf2a2d09b25e202849179eda96ba8e60f5f23dccb5849e12356482a5a4a7985',
  });
});

test('WP806 evidence carries 22 executed tests and 10 actual source mutants', () => {
  for (const kind of ['MODEL','CONTRACT','INTEGRATION','MUTANTS']) {
    const evidence = read(`docs/OPS/R24/EVIDENCE/ES-R24-WP-806-PULSE-CLAIM-${kind}.json`);
    const raw = evidence.artifact.rawEvidence;
    const bytes = Buffer.from(raw.stdoutBase64, 'base64');
    assert.equal(bytes.length, raw.byteLength);
    assert.equal(h(bytes), raw.sha256);
    assert.match(bytes.toString(), /\n1\.\.22\n# tests 22\n# suites 0\n# pass 22\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n/u);
    assert.equal(raw.processExitCode, 0);
    for (const artifact of evidence.artifact.implementationArtifacts) assert.equal(h(fs.readFileSync(artifact.path)), artifact.sha256);
    if (kind === 'MUTANTS') {
      assert.equal(evidence.test.denominator, 10);
      assert.equal(evidence.claim.actualSourceMutations, true);
      assert.equal((bytes.toString().match(/^ok \d+ - WP806 kills implementation mutant:/gmu) || []).length, 10);
    }
  }
});

test('WP806 carriers reject privacy bypass, graph overclaim and false release', () => {
  const mutations = [
    value => { value.PULSE_CLAIM_CONTRACT.authority.rendererPath = true; },
    value => { value.PULSE_CLAIM_CONTRACT.authority.storageMutation = true; },
    value => { value.PULSE_CLAIM_CONTRACT.missingValues.notRecordedIsZero = true; },
    value => { value.EFFECTIVE_GRAPH_BASELINE.states['WP-806_PULSE_CLAIM'] = 'DONE'; },
    value => { value.EFFECTIVE_STATE.targetCounts.DONE = 86; },
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
