import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { buildClaimBinding } from '../../scripts/ops/r24/claim-binding.mjs';
import { canonicalDigest } from '../../scripts/ops/r24/canonical-json.mjs';
import { HISTORICAL_INVENTORY_CLAIM_PINS_V5 } from '../../scripts/ops/r24/docs-claim-lint.mjs';

const C = 'docs/OPS/R24/CORRECTIVE/';
const h = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const paths = {
  authority: C + 'WP604_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json',
  instance: C + 'WP604_MAIN_PRODUCT_STAGE_INSTANCE_V1.json',
  admission: C + 'WP604_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json',
  selection: C + 'WP604_MAIN_PRODUCT_SELECTION_RECEIPT_V1.json',
  before: C + 'WP604_PROTECTED_WIP_BEFORE_V1.json',
  predecessor: C + 'WP604_WP603_TERMINAL_PREDECESSOR_V1.json',
  fixture: C + 'WP604_FIXTURE_MANIFEST_V1.json',
  graph: C + 'WP604_EFFECTIVE_GRAPH_BASELINE_V1.json',
  registry: C + 'WP604_CARRIER_REGISTRY_V1.json',
  acceptance: C + 'WP604_ACCEPTANCE_MATRIX_V1.json',
  state: C + 'WP604_EFFECTIVE_STATE_V1.json',
  stageRegistry: C + 'WP604_STAGE_REGISTRY_V1.json',
  lease: C + 'WP604_LEASE_RELEASE_V1.json',
  terminal: C + 'WP604_TERMINAL_RECEIPT_V1.json',
};
const bytes = (file) => fs.readFileSync(file);
const read = (file) => JSON.parse(bytes(file));
const roles = { externalSourcePlanDigest: '1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a', compiledProgramFileDigest: 'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a', rolesDistinct: true };
const counts = (states) => Object.fromEntries(['BLOCKED_TYPED', 'DONE', 'INELIGIBLE_OPTIONAL', 'PENDING'].map((state) => [state, Object.values(states).filter((value) => value === state).length]));

function load() { return Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, read(file)])); }

function verify(values) {
  assert.equal(h(bytes(paths.authority)), '81faa2dbb754f2ddd89c91a0369a86f1f84e48e8c1a37cac0b1afc4bab62299d');
  assert.equal(h(bytes(paths.instance)), 'c585b9f8033e9312291d56692a3e1c14ad43e16496bfe0add0d5ffcea7847685');
  assert.equal(h(bytes(paths.admission)), '53f34a1872384858d950a602b6c504587175f8529586219ae74e77e35dae020f');
  assert.equal(values.admission.writeSetDigest, '0b976826cf2fd12b66dc5821df8ac072af37f98abc9dd922da35172909b81052');
  assert.deepEqual(values.instance.lease, { fencingCounter: 86, status: 'ACTIVE', wip: 1, predecessorReleaseDigest: '32f36dfe323cf1400b4082188a1ba78002734f6e74a8c64d97b9f6a776fc8976' });
  const { snapshotSha256, ...payload } = values.before;
  assert.equal(h(Buffer.from(JSON.stringify(payload) + '\n')), snapshotSha256);
  assert.equal(values.before.completeDenominator, 273);
  assert.equal(values.before.entries.length, 273);
  assert.equal(values.before.dirtyDenominator, 10);
  assert.equal(values.predecessor.predecessorLeaseStatus, 'RELEASED');
  assert.equal(values.predecessor.predecessorWip, 0);
  assert.equal(values.fixture.syntheticOnly, true);
  assert.equal(values.fixture.realOwnerDocuments, false);
  assert.equal(values.fixture.fixtures.length, 9);
  assert.equal(values.graph.completeDenominator, 109);
  assert.equal(canonicalDigest(values.graph.states), values.graph.statesDigest);
  assert.deepEqual(counts(values.graph.states), { BLOCKED_TYPED: 3, DONE: 73, INELIGIBLE_OPTIONAL: 10, PENDING: 23 });
  assert.deepEqual(values.state.currentCounts, counts(values.graph.states));
  assert.deepEqual(values.state.targetStates, { ...values.graph.states, 'WP-604_WSE_THREADS_EXPLANATION': 'DONE' });
  assert.deepEqual(values.state.targetCounts, { BLOCKED_TYPED: 3, DONE: 74, INELIGIBLE_OPTIONAL: 10, PENDING: 22 });
  const admitted = [...values.instance.operations.modifyPaths, ...values.instance.operations.createPaths].sort();
  const allCarriers = [...values.registry.carriers.map((row) => row.path), ...values.registry.excludedDependentCarriers].sort();
  assert.deepEqual(allCarriers, admitted);
  assert.equal(new Set(allCarriers).size, 43);
  assert.equal(values.registry.carrierDenominator, 35);
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
  assert.equal(values.terminal.activationOutcome.doneCount, 74);
  assert.equal(values.terminal.activationOutcome.pendingCount, 22);
  for (const value of Object.values(values)) {
    if (value.sourcePlanRoles) assert.deepEqual(value.sourcePlanRoles, roles);
    if (Object.hasOwn(value, 'programDone')) assert.equal(value.programDone, false);
  }
  return true;
}

test('WP604 carrier set replays exact admission, graph increment and conditional terminal state', () => {
  const values = load();
  assert.equal(verify(values), true);
  const claim = buildClaimBinding(read('docs/OPS/R24/EVIDENCE/ES-R24-WP-604-WSE-THREADS-EXPLANATION-CLAIM-BINDINGS.json'));
  for (const binding of claim.claimBindings) assert.equal(h(bytes(binding.filePath)), binding.sha256, binding.filePath);
  for (const binding of claim.implementationArtifactDigests) assert.equal(h(bytes(binding.path)), binding.sha256, binding.path);
  assert.ok(claim.nonClaims.includes('PROGRAM_DONE_FALSE'));
  assert.deepEqual(HISTORICAL_INVENTORY_CLAIM_PINS_V5.at(-1), { stampId: 'ES-R24-WP-603-PACKAGED-RECOVERY-CLAIM-BINDINGS', stampSha256: '49a0c6d820d9110158050298d193604759e484109f37fcf457cb804fc74a317f', evaluationSha: 'bf3b3c3c57e8f2268dc5f0be213c27de0002e5ff', evaluationTree: 'cfe9d94520d922a04c333be358875988dd15eb2e', targetSha256: '0f1e2c9ca3f5e0d1f59b5a1d9e1dbdf1282f5ea281398e62dd3ab4cb9126301a' });
});

test('WP604 evidence stamps bind the executed 11-test TAP and 13 rejected hostile cases', () => {
  const prefix = 'docs/OPS/R24/EVIDENCE/ES-R24-WP-604-WSE-THREADS-EXPLANATION-';
  for (const kind of ['MODEL', 'CONTRACT', 'INTEGRATION', 'MUTANTS']) {
    const evidence = read(prefix + kind + '.json');
    const raw = evidence.artifact.rawEvidence;
    const rawBytes = Buffer.from(raw.stdoutBase64, 'base64');
    assert.equal(rawBytes.length, raw.byteLength);
    assert.equal(h(rawBytes), raw.sha256);
    assert.match(rawBytes.toString(), /\n1\.\.11\n# tests 11\n# suites 0\n# pass 11\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n/u);
    assert.equal(raw.processExitCode, 0);
    assert.equal(raw.node, '22.12.0');
    for (const binding of evidence.artifact.implementationArtifacts) assert.equal(h(bytes(binding.path)), binding.sha256, binding.path);
  }
  assert.equal(read(prefix + 'MUTANTS.json').test.denominator, 13);
  assert.equal(read(prefix + 'MUTANTS.json').test.passed, 13);
});

test('WP604 hostile carrier mutants reject graph overclaim, false release and missing protected state', () => {
  const mutations = [
    (value) => { value.before.entries.pop(); },
    (value) => { value.graph.states['WP-604_WSE_THREADS_EXPLANATION'] = 'DONE'; },
    (value) => { value.state.targetCounts.DONE = 75; },
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
  assert.equal(mutations.length, 7);
});
