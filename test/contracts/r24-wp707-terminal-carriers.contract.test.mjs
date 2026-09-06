import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { buildClaimBinding } from '../../scripts/ops/r24/claim-binding.mjs';
import { canonicalDigest } from '../../scripts/ops/r24/canonical-json.mjs';
import { HISTORICAL_INVENTORY_CLAIM_PINS_V20 } from '../../scripts/ops/r24/docs-claim-lint.mjs';
import { WP707_MAIN_PRODUCT_ADMISSION_EXPECTATION as E } from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';

const C = 'docs/OPS/R24/CORRECTIVE/';
const h = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file));
const names = [
  'MAIN_PRODUCT_OWNER_AUTHORITY', 'MAIN_PRODUCT_STAGE_INSTANCE', 'MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION',
  'PROTECTED_WIP_BEFORE', 'WP706_TERMINAL_PREDECESSOR', 'EXACT_BOUND_OWNER_DECISION', 'MAIN_PRODUCT_SELECTION_RECEIPT',
  'WORD_APPLY_CONTRACT', 'WORD_APPLY_PHYSICAL_RECEIPT', 'FEATURE_INTEGRATION_MANIFEST', 'FIXTURE_MANIFEST',
  'EFFECTIVE_GRAPH_BASELINE', 'CARRIER_REGISTRY', 'ACCEPTANCE_MATRIX', 'EFFECTIVE_STATE', 'STAGE_REGISTRY',
  'LEASE_RELEASE', 'TERMINAL_RECEIPT',
];
const load = () => Object.fromEntries(names.map(name => [name, read(`${C}WP707_${name}_V1.json`)]));
const counts = states => Object.fromEntries(['BLOCKED_TYPED', 'DONE', 'INELIGIBLE_OPTIONAL', 'PENDING']
  .map(state => [state, Object.values(states).filter(value => value === state).length]));

function verify(value) {
  const instance = value.MAIN_PRODUCT_STAGE_INSTANCE;
  const admission = value.MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION;
  const before = value.PROTECTED_WIP_BEFORE;
  const graph = value.EFFECTIVE_GRAPH_BASELINE;
  const contract = value.WORD_APPLY_CONTRACT;
  const physical = value.WORD_APPLY_PHYSICAL_RECEIPT;
  assert.equal(h(fs.readFileSync(`${C}WP707_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json`)), E.authorityDigest);
  assert.equal(h(fs.readFileSync(`${C}WP707_MAIN_PRODUCT_STAGE_INSTANCE_V1.json`)), E.instanceDigest);
  assert.equal(h(fs.readFileSync(`${C}WP707_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json`)), E.admissionDigest);
  assert.equal(instance.model, 'gpt-5.6-sol');
  assert.equal(instance.reasoningEffort, 'xhigh');
  assert.equal(admission.writeSetDigest, E.writeSetDigest);
  assert.deepEqual(instance.lease, { fencingCounter: 101, status: 'ACTIVE', wip: 1, predecessorReleaseDigest: E.predecessorReleaseDigest });
  const { snapshotSha256, ...payload } = before;
  assert.equal(h(Buffer.from(`${JSON.stringify(payload)}\n`)), snapshotSha256);
  assert.equal(snapshotSha256, E.protectedWipSnapshotDigest);
  assert.equal(before.completeDenominator, 302);
  assert.equal(before.entries.length, 302);
  assert.equal(before.dirtyDenominator, 11);
  assert.equal(value.WP706_TERMINAL_PREDECESSOR.predecessorState, 'DONE');
  assert.equal(value.WP706_TERMINAL_PREDECESSOR.externalTerminal.leaseStatus, 'RELEASED');
  assert.equal(value.WP706_TERMINAL_PREDECESSOR.externalTerminal.wip, 0);
  assert.equal(value.EXACT_BOUND_OWNER_DECISION.status, 'APPROVED');
  assert.equal(value.EXACT_BOUND_OWNER_DECISION.missionDigest, E.missionDigest);
  assert.equal(contract.status, 'PASS');
  assert.equal(contract.authority.automaticApply, false);
  assert.equal(contract.authority.multiSceneApply, false);
  assert.equal(contract.implementation.secondWriterCreated, false);
  assert.equal(physical.repetitionDenominator, 3);
  assert.equal(physical.repetitionPass, 3);
  assert.equal(physical.userDocumentsOpened, false);
  assert.equal(physical.repetitions.every(run => run.commandKernelRevalidationObserved), true);
  assert.equal(physical.repetitions.every(run => run.projectReopenReadback), true);
  assert.equal(physical.repetitions.every(run => run.completedRoundReuse), true);
  assert.equal(physical.repetitions.every(run => run.wordSandboxStableRoot), true);
  assert.equal(physical.repetitions.every(run => !run.wordOpenedT7Directly), true);
  assert.equal(physical.repetitions.every(run => run.grantFileAccessInteractionCount === 0), true);
  assert.equal(physical.repetitions.every(run => run.sandboxAndDurableHashesMatch), true);
  assert.equal(value.FEATURE_INTEGRATION_MANIFEST.runtimeNetwork, false);
  assert.equal(value.FEATURE_INTEGRATION_MANIFEST.productPlane.mutation, true);
  assert.equal(graph.statesDigest, canonicalDigest(graph.states));
  assert.deepEqual(counts(graph.states), { BLOCKED_TYPED: 2, DONE: 88, INELIGIBLE_OPTIONAL: 10, PENDING: 9 });
  const targetStates = { ...graph.states, 'WP-707_WORD_APPLY': 'DONE' };
  assert.equal(value.EFFECTIVE_STATE.targetGraph.statesDigest, canonicalDigest(targetStates));
  assert.equal(value.EFFECTIVE_STATE.targetGraph.transition.nodeId, 'WP-707_WORD_APPLY');
  assert.deepEqual(value.EFFECTIVE_STATE.targetCounts, { BLOCKED_TYPED: 2, DONE: 89, INELIGIBLE_OPTIONAL: 10, PENDING: 8 });
  assert.deepEqual(value.EFFECTIVE_STATE.nextReadySet, []);
  assert.deepEqual(value.EFFECTIVE_STATE.ownerGatedSuccessorSet, ['WP-709_MIXED_CHAINS']);
  assert.equal(value.EFFECTIVE_STATE.ownerGateStatus, 'UNRESOLVED_DENY');
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
  assert.equal(value.ACCEPTANCE_MATRIX.rows.filter(row => row.status === 'PASS').length, 23);
  assert.equal(value.ACCEPTANCE_MATRIX.rows.filter(row => row.status === 'REQUIRED_NOT_PRECLAIMED').length, 7);
  assert.equal(value.TERMINAL_RECEIPT.status, 'CONDITIONAL_DONE_PENDING_REQUIRED_LOCAL_AND_EXTERNAL_DELIVERY_PREDICATES');
  assert.equal(value.TERMINAL_RECEIPT.activationOutcome.doneCount, 89);
  assert.equal(value.TERMINAL_RECEIPT.activationOutcome.physicalWordRepetitionPass, 3);
  assert.equal(value.LEASE_RELEASE.currentLease.status, 'ACTIVE');
  assert.equal(value.LEASE_RELEASE.targetLease.wip, 0);
  for (const [field, name] of [['leaseReleaseDigest', 'LEASE_RELEASE'], ['acceptanceMatrixDigest', 'ACCEPTANCE_MATRIX'], ['effectiveStateDigest', 'EFFECTIVE_STATE'], ['stageRegistryDigest', 'STAGE_REGISTRY']]) {
    assert.equal(value.TERMINAL_RECEIPT.bindings[field], h(fs.readFileSync(`${C}WP707_${name}_V1.json`)));
  }
  for (const carrier of Object.values(value)) if (Object.hasOwn(carrier, 'programDone')) assert.equal(carrier.programDone, false);
}

test('WP707 carriers bind exact admission, explicit single-scene Word apply, physical proof and conditional release', () => {
  verify(load());
  const claim = buildClaimBinding(read('docs/OPS/R24/EVIDENCE/ES-R24-WP-707-WORD-APPLY-CLAIM-BINDINGS.json'));
  for (const binding of claim.claimBindings) assert.equal(h(fs.readFileSync(binding.filePath)), binding.sha256);
  assert.deepEqual(HISTORICAL_INVENTORY_CLAIM_PINS_V20.at(-1), {
    stampId: 'ES-R24-WP-706-WORD-REPORT-CLAIM-BINDINGS',
    stampSha256: 'e6091bc4e9b86eb96d9e10ca6c1bddaa3e74aaaf448439ea45ebb976896216fb',
    evaluationSha: E.baseSha,
    evaluationTree: E.baseTree,
    targetSha256: '18ad98a0dde943ba3f96a9517dbcca3380c4cac8090eaada92d8b9129e79661b',
  });
});

test('WP707 evidence carries 22 focused tests, 10 real source mutants and 3 physical Word runs', () => {
  const model = read('docs/OPS/R24/EVIDENCE/ES-R24-WP-707-WORD-APPLY-MODEL.json');
  assert.deepEqual(model.test, { denominator: 22, passed: 22, failed: 0, skipped: 0, todo: 0 });
  assert.equal(model.artifact.rawEvidence.processExitCode, 0);
  for (const artifact of model.artifact.implementationArtifacts) assert.equal(h(fs.readFileSync(artifact.path)), artifact.sha256);
  const mutants = read('docs/OPS/R24/EVIDENCE/ES-R24-WP-707-WORD-APPLY-MUTANTS.json');
  assert.deepEqual(mutants.claim, { ceiling: 'WP707_ACTUAL_SOURCE_MUTATION_SCORE_ONLY', actualSourceMutations: true, killed: 10, survived: 0, importFailures: 0, syntaxOrImportFailuresCountedAsKills: false });
  assert.equal(valuePhysicalPass(), 3);
});

function valuePhysicalPass() {
  return read(`${C}WP707_WORD_APPLY_PHYSICAL_RECEIPT_V1.json`).repetitionPass;
}

test('WP707 carriers reject apply overclaim, graph overclaim, successor activation and false release', () => {
  const mutations = [
    value => { value.WORD_APPLY_CONTRACT.authority.automaticApply = true; },
    value => { value.WORD_APPLY_CONTRACT.authority.multiSceneApply = true; },
    value => { value.WORD_APPLY_PHYSICAL_RECEIPT.repetitionPass = 2; },
    value => { value.EFFECTIVE_GRAPH_BASELINE.states['WP-707_WORD_APPLY'] = 'DONE'; },
    value => { value.EFFECTIVE_STATE.targetCounts.DONE = 90; },
    value => { value.EFFECTIVE_STATE.nextReadySet = ['WP-709_MIXED_CHAINS']; },
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
