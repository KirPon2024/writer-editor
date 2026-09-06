import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { buildClaimBinding } from '../../scripts/ops/r24/claim-binding.mjs';
import { canonicalDigest } from '../../scripts/ops/r24/canonical-json.mjs';
import { HISTORICAL_INVENTORY_CLAIM_PINS_V18 } from '../../scripts/ops/r24/docs-claim-lint.mjs';

const C = 'docs/OPS/R24/CORRECTIVE/';
const h = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file));
const names = [
  'MAIN_PRODUCT_OWNER_AUTHORITY', 'MAIN_PRODUCT_STAGE_INSTANCE', 'MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION',
  'PROTECTED_WIP_BEFORE', 'WP708_TERMINAL_PREDECESSOR', 'WORD_CLAIM_CONTRACT',
  'FEATURE_INTEGRATION_MANIFEST', 'FIXTURE_MANIFEST', 'EFFECTIVE_GRAPH_BASELINE', 'CARRIER_REGISTRY',
  'ACCEPTANCE_MATRIX', 'EFFECTIVE_STATE', 'STAGE_REGISTRY', 'LEASE_RELEASE', 'TERMINAL_RECEIPT',
];
const load = () => Object.fromEntries(names.map(name => [name, read(`${C}V2_${name}_V1.json`)]));
const counts = states => Object.fromEntries(['BLOCKED_TYPED', 'DONE', 'INELIGIBLE_OPTIONAL', 'PENDING']
  .map(state => [state, Object.values(states).filter(value => value === state).length]));

function verify(value) {
  const instance = value.MAIN_PRODUCT_STAGE_INSTANCE;
  const admission = value.MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION;
  const before = value.PROTECTED_WIP_BEFORE;
  const graph = value.EFFECTIVE_GRAPH_BASELINE;
  const contract = value.WORD_CLAIM_CONTRACT;
  assert.equal(h(fs.readFileSync(`${C}V2_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json`)), 'b5a97ae3f8bd5186fae2c88eb41ed69be99937916e1d7e7afb987a787582cb0f');
  assert.equal(h(fs.readFileSync(`${C}V2_MAIN_PRODUCT_STAGE_INSTANCE_V1.json`)), 'eacea43d79ee4d4b99b7dbc19e6c37da23973ac74f49b5f284a30c1b9cbb393c');
  assert.equal(h(fs.readFileSync(`${C}V2_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json`)), '07ae156a3c1fbe418fd17b00a609c5151efcf10842474f29ed2ebfda5b0bf4f7');
  assert.equal(instance.model, 'gpt-5.6-sol');
  assert.equal(instance.reasoningEffort, 'xhigh');
  assert.equal(admission.writeSetDigest, '795bec8bda2a991786b7067325743270cab29c565264597ea31beda02d4f61a9');
  assert.deepEqual(instance.lease, { fencingCounter: 99, status: 'ACTIVE', wip: 1, predecessorReleaseDigest: '4cb082a94ce18ec2b844038a5692dbf4bd8048e197265b845726c478a8b6efd9' });
  const { snapshotSha256, ...payload } = before;
  assert.equal(h(Buffer.from(`${JSON.stringify(payload)}\n`)), snapshotSha256);
  assert.equal(snapshotSha256, '2a841ee98fdd5cbc4603a338fad31272cd84e0a1dfff8a0e8c9b16cbae034731');
  assert.equal(before.completeDenominator, 300);
  assert.equal(before.entries.length, 300);
  assert.equal(before.dirtyDenominator, 11);
  assert.equal(value.WP708_TERMINAL_PREDECESSOR.predecessorLeaseStatus, 'RELEASED');
  assert.equal(value.WP708_TERMINAL_PREDECESSOR.predecessorWip, 0);
  assert.equal(contract.profileId, 'WORD_ROUNDTRIP');
  assert.equal(contract.profileVerdict, 'BLOCKED');
  assert.equal(contract.compilerVerdictOnValidEvidence, 'PASS');
  assert.equal(contract.programDone, false);
  assert.deepEqual(contract.physicalInput, {
    wordVersion: '16.112', wordBuild: '16.112.26081010', syntheticOnly: true,
    rootCommentOperations: 4, routeGapCount: 0, userDocumentsTouched: false,
  });
  assert.equal(value.FEATURE_INTEGRATION_MANIFEST.runtimeNetwork, false);
  assert.equal(value.FEATURE_INTEGRATION_MANIFEST.productPlane.mutation, false);
  assert.equal(graph.statesDigest, canonicalDigest(graph.states));
  assert.deepEqual(counts(graph.states), { BLOCKED_TYPED: 3, DONE: 86, INELIGIBLE_OPTIONAL: 10, PENDING: 10 });
  const targetStates = { ...graph.states, V2_WORD_CLAIM_COMPILER: 'DONE' };
  assert.equal(value.EFFECTIVE_STATE.targetGraph.statesDigest, canonicalDigest(targetStates));
  assert.equal(value.EFFECTIVE_STATE.targetGraph.transition.nodeId, 'V2_WORD_CLAIM_COMPILER');
  assert.deepEqual(value.EFFECTIVE_STATE.targetCounts, { BLOCKED_TYPED: 2, DONE: 87, INELIGIBLE_OPTIONAL: 10, PENDING: 10 });
  assert.deepEqual(value.EFFECTIVE_STATE.nextReadySet, ['WP-706_WORD_REPORT']);
  assert.equal(value.EFFECTIVE_STATE.nextReadyActivated, false);
  assert.equal(value.EFFECTIVE_STATE.wordProfileVerdict, 'BLOCKED');
  const admitted = [...instance.operations.modifyPaths, ...instance.operations.createPaths].sort();
  const registry = value.CARRIER_REGISTRY;
  assert.deepEqual([...registry.carriers.map(binding => binding.path), ...registry.excludedDependentCarriers].sort(), admitted);
  assert.equal(admitted.length, 34);
  assert.equal(registry.carrierDenominator, 26);
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
  assert.equal(value.TERMINAL_RECEIPT.activationOutcome.doneCount, 87);
  assert.equal(value.TERMINAL_RECEIPT.activationOutcome.wordProfileVerdict, 'BLOCKED');
  assert.equal(value.LEASE_RELEASE.currentLease.status, 'ACTIVE');
  assert.equal(value.LEASE_RELEASE.targetLease.wip, 0);
  for (const [field, name] of [['leaseReleaseDigest', 'LEASE_RELEASE'], ['acceptanceMatrixDigest', 'ACCEPTANCE_MATRIX'], ['effectiveStateDigest', 'EFFECTIVE_STATE'], ['stageRegistryDigest', 'STAGE_REGISTRY']]) {
    assert.equal(value.TERMINAL_RECEIPT.bindings[field], h(fs.readFileSync(`${C}V2_${name}_V1.json`)));
  }
  for (const carrier of Object.values(value)) if (Object.hasOwn(carrier, 'programDone')) assert.equal(carrier.programDone, false);
}

test('V2 carriers bind exact Sol admission, blocked Word profile and conditional release', () => {
  verify(load());
  const claim = buildClaimBinding(read('docs/OPS/R24/EVIDENCE/ES-R24-V2-WORD-CLAIM-COMPILER-CLAIM-BINDINGS.json'));
  for (const binding of claim.claimBindings) assert.equal(h(fs.readFileSync(binding.filePath)), binding.sha256);
  assert.deepEqual(HISTORICAL_INVENTORY_CLAIM_PINS_V18.at(-1), {
    stampId: 'ES-R24-WP-708-GOOGLE-PROVIDER-CLAIM-BINDINGS',
    stampSha256: 'd68b5ecf084528247e8d65a61df3b9fcd994fb716388db3d2b74186bb427186f',
    evaluationSha: '2cc2d22d9427261f6eefe66394791083af049ca9',
    evaluationTree: 'eec02a2f54063d80eed3f37a9cce13a99acf2318',
    targetSha256: '77bfc2532b7e722925f39eb2e0a49f8cf02d49833f13a282333f5139b5f2b050',
  });
});

test('V2 evidence carries 7 focused tests and 10 real source mutants', () => {
  const model = read('docs/OPS/R24/EVIDENCE/ES-R24-V2-WORD-CLAIM-COMPILER-MODEL.json');
  assert.deepEqual(model.test, { denominator: 7, passed: 7, failed: 0, skipped: 0, todo: 0 });
  assert.equal(model.artifact.rawEvidence.processExitCode, 0);
  assert.equal(model.artifact.rawEvidence.sha256, 'eda303635c061f453477cbce74a02c0aec05d3edcfe53b7530b46d10fb174345');
  for (const artifact of model.artifact.implementationArtifacts) assert.equal(h(fs.readFileSync(artifact.path)), artifact.sha256);
  const mutants = read('docs/OPS/R24/EVIDENCE/ES-R24-V2-WORD-CLAIM-COMPILER-MUTANTS.json');
  assert.deepEqual(mutants.claim, { ceiling: 'V2_ACTUAL_SOURCE_MUTATION_SCORE_ONLY', actualSourceMutations: true, killed: 10, survived: 0, syntaxOrImportFailuresCountedAsKills: false });
});

test('V2 carriers reject Word overclaim, graph overclaim, successor activation and false release', () => {
  const mutations = [
    value => { value.WORD_CLAIM_CONTRACT.profileVerdict = 'PASS'; },
    value => { value.WORD_CLAIM_CONTRACT.physicalInput.syntheticOnly = false; },
    value => { value.EFFECTIVE_GRAPH_BASELINE.states.V2_WORD_CLAIM_COMPILER = 'DONE'; },
    value => { value.EFFECTIVE_STATE.targetCounts.DONE = 88; },
    value => { value.EFFECTIVE_STATE.nextReadyActivated = true; },
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
