import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { buildClaimBinding } from '../../scripts/ops/r24/claim-binding.mjs';
import { canonicalDigest } from '../../scripts/ops/r24/canonical-json.mjs';
import { HISTORICAL_INVENTORY_CLAIM_PINS_V12 } from '../../scripts/ops/r24/docs-claim-lint.mjs';

const C = 'docs/OPS/R24/CORRECTIVE/';
const h = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const paths = {
  authority: C + 'WP802_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json',
  instance: C + 'WP802_MAIN_PRODUCT_STAGE_INSTANCE_V1.json',
  admission: C + 'WP802_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json',
  selection: C + 'WP802_MAIN_PRODUCT_SELECTION_RECEIPT_V1.json',
  before: C + 'WP802_PROTECTED_WIP_BEFORE_V1.json',
  predecessor: C + 'WP802_WP801_TERMINAL_PREDECESSOR_V1.json',
  fixture: C + 'WP802_FIXTURE_MANIFEST_V1.json',
  contract: C + 'WP802_PULSE_FORMULAS_CONTRACT_V1.json',
  feature: C + 'WP802_FEATURE_INTEGRATION_MANIFEST_V1.json',
  graph: C + 'WP802_EFFECTIVE_GRAPH_BASELINE_V1.json',
  registry: C + 'WP802_CARRIER_REGISTRY_V1.json',
  acceptance: C + 'WP802_ACCEPTANCE_MATRIX_V1.json',
  state: C + 'WP802_EFFECTIVE_STATE_V1.json',
  stageRegistry: C + 'WP802_STAGE_REGISTRY_V1.json',
  lease: C + 'WP802_LEASE_RELEASE_V1.json',
  terminal: C + 'WP802_TERMINAL_RECEIPT_V1.json',
};
const bytes = (file) => fs.readFileSync(file);
const read = (file) => JSON.parse(bytes(file));
const counts = (states) => Object.fromEntries(['BLOCKED_TYPED', 'DONE', 'INELIGIBLE_OPTIONAL', 'PENDING'].map((state) => [state, Object.values(states).filter((value) => value === state).length]));
function load() { return Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, read(file)])); }

function verify(values) {
  assert.equal(h(bytes(paths.authority)), 'b7a0d5ca54ad7deedc47db4ef2eebce72d10d5e02ed678c475710f279b611f47');
  assert.equal(h(bytes(paths.instance)), '0b28cb20451b725f4e840319edaf94665e7415ae1a4c0e9fe1bff99a6468a44e');
  assert.equal(h(bytes(paths.admission)), '8948922792a58f2714b76cdff7c52f56ee8a8205719cc5b3af0f207a91eb9913');
  assert.equal(values.admission.writeSetDigest, 'd8c6cebbab593448f6a69c351a737075b52280cf8ccf3434f8ffdd02201921e9');
  assert.deepEqual(values.instance.lease, { fencingCounter: 93, status: 'ACTIVE', wip: 1, predecessorReleaseDigest: '3a786fb7539b1d396ffd84713db68aee53419470673fae70161da769354b4e23' });
  assert.equal(values.instance.model, 'gpt-6-astra');
  assert.equal(values.instance.reasoningEffort, 'xhigh');
  const { snapshotSha256, ...payload } = values.before;
  assert.equal(h(Buffer.from(JSON.stringify(payload) + '\n')), snapshotSha256);
  assert.equal(snapshotSha256, '7eb69fac421173495bf9ce473352ff82d1bd95e0a9ef89ee71894cb892e4b855');
  assert.equal(values.before.completeDenominator, 286);
  assert.equal(values.before.entries.length, 286);
  assert.equal(values.before.dirtyDenominator, 10);
  assert.equal(values.predecessor.predecessorLeaseStatus, 'RELEASED');
  assert.equal(values.predecessor.predecessorWip, 0);
  assert.deepEqual(values.predecessor.predecessorGraphCounts, { DONE: 80, PENDING: 16, BLOCKED_TYPED: 3, INELIGIBLE_OPTIONAL: 10 });
  assert.equal(values.fixture.syntheticOnly, true);
  assert.equal(values.fixture.realOwnerDocuments, false);
  assert.equal(values.contract.formulaVersion, 'PULSE_FORMULAS_V1');
  assert.equal(values.contract.formulaSetDigest, 'e1537c6dd1cf8bbf6dfc9e1f01153607a9c17169c42b97811983000cef4c67b4');
  assert.equal(values.contract.input.maximumEntries, 4096);
  assert.equal(values.contract.merkle.oddLeafRule, 'DUPLICATE_LAST_DIGEST_AT_EACH_ODD_LEVEL');
  assert.equal(values.contract.checkpoint.revalidatesExactPrefix, true);
  assert.equal(values.contract.projection.fullAndCheckpointAssistedEquivalent, true);
  assert.equal(values.feature.interfacePlane.designOs, 'NOT_APPLICABLE_NO_UI');
  assert.equal(values.feature.runtimeNetwork, false);
  assert.equal(values.graph.completeDenominator, 109);
  assert.equal(canonicalDigest(values.graph.states), values.graph.statesDigest);
  assert.deepEqual(counts(values.graph.states), { BLOCKED_TYPED: 3, DONE: 80, INELIGIBLE_OPTIONAL: 10, PENDING: 16 });
  assert.deepEqual(values.state.currentCounts, counts(values.graph.states));
  assert.deepEqual(values.state.targetStates, { ...values.graph.states, 'WP-802_PULSE_FORMULAS': 'DONE' });
  assert.deepEqual(values.state.targetCounts, { BLOCKED_TYPED: 3, DONE: 81, INELIGIBLE_OPTIONAL: 10, PENDING: 15 });
  const admitted = [...values.instance.operations.modifyPaths, ...values.instance.operations.createPaths].sort();
  const allCarriers = [...values.registry.carriers.map((row) => row.path), ...values.registry.excludedDependentCarriers].sort();
  assert.deepEqual(allCarriers, admitted);
  assert.equal(new Set(allCarriers).size, 37);
  assert.equal(values.registry.carrierDenominator, 29);
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
  assert.equal(values.terminal.activationOutcome.doneCount, 81);
  assert.equal(values.terminal.activationOutcome.pendingCount, 15);
  for (const value of Object.values(values)) if (Object.hasOwn(value, 'programDone')) assert.equal(value.programDone, false);
  return true;
}

test('WP802 carriers bind admission, formulas, Merkle checkpoints, graph increment and conditional release', () => {
  const values = load();
  assert.equal(verify(values), true);
  const claim = buildClaimBinding(read('docs/OPS/R24/EVIDENCE/ES-R24-WP-802-PULSE-FORMULAS-CLAIM-BINDINGS.json'));
  for (const binding of claim.claimBindings) assert.equal(h(bytes(binding.filePath)), binding.sha256, binding.filePath);
  for (const binding of claim.implementationArtifactDigests) assert.equal(h(bytes(binding.path)), binding.sha256, binding.path);
  assert.ok(claim.nonClaims.includes('PROGRAM_DONE_FALSE'));
  assert.deepEqual(HISTORICAL_INVENTORY_CLAIM_PINS_V12.at(-1), { stampId: 'ES-R24-WP-801-PULSE-LEDGER-CLAIM-BINDINGS', stampSha256: '43367af52e9f00ea4dcd846dde273b8bb4083a917c7b5262b6fd854f2e448870', evaluationSha: '0482b9f1c838b3e89eb9055edb19dd2d9f0a93a5', evaluationTree: '4e20bc39abe02228b8d1e2833c37cb694eb12a51', targetSha256: '67f41cf7aec9ea96b4369dbb30a6bed7a38ac100183c50fac8c37f0e2f0feffb' });
});

test('WP802 evidence stamps bind all 22 executed tests with no skip or todo', () => {
  const prefix = 'docs/OPS/R24/EVIDENCE/ES-R24-WP-802-PULSE-FORMULAS-';
  for (const kind of ['MODEL', 'CONTRACT', 'INTEGRATION', 'MUTANTS']) {
    const evidence = read(prefix + kind + '.json');
    const raw = evidence.artifact.rawEvidence;
    const rawBytes = Buffer.from(raw.stdoutBase64, 'base64');
    assert.equal(rawBytes.length, raw.byteLength);
    assert.equal(h(rawBytes), raw.sha256);
    assert.match(rawBytes.toString(), /\n1\.\.22\n# tests 22\n# suites 0\n# pass 22\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n/u);
    assert.equal(raw.processExitCode, 0);
    assert.equal(raw.node, '22.12.0');
    for (const binding of evidence.artifact.implementationArtifacts) assert.equal(h(bytes(binding.path)), binding.sha256, binding.path);
  }
  assert.equal(read(prefix + 'MUTANTS.json').test.denominator, 15);
  assert.equal(read(prefix + 'MUTANTS.json').test.passed, 15);
});

test('WP802 carrier mutants reject graph overclaim, widened capacity and false release', () => {
  const mutations = [
    (value) => { value.before.entries.pop(); },
    (value) => { value.graph.states['WP-802_PULSE_FORMULAS'] = 'DONE'; },
    (value) => { value.state.targetCounts.DONE = 82; },
    (value) => { value.contract.input.maximumEntries = 4097; },
    (value) => { value.contract.checkpoint.revalidatesExactPrefix = false; },
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
