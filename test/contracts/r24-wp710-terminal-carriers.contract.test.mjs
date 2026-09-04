import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { buildClaimBinding } from '../../scripts/ops/r24/claim-binding.mjs';
import { canonicalDigest } from '../../scripts/ops/r24/canonical-json.mjs';
import { HISTORICAL_INVENTORY_CLAIM_PINS_V7 } from '../../scripts/ops/r24/docs-claim-lint.mjs';

const C = 'docs/OPS/R24/CORRECTIVE/';
const WP710_TERMINAL_MERGE_SHA = '19c1ae3f39de73b87d468ff84dd65ecdbd478269';
const h = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const paths = {
  authority: C + 'WP710_MAIN_PRODUCT_OWNER_AUTHORITY_AMENDMENT_V1.json',
  instance: C + 'WP710_MAIN_PRODUCT_STAGE_INSTANCE_V2.json',
  admission: C + 'WP710_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V2.json',
  selection: C + 'WP710_MAIN_PRODUCT_SELECTION_RECEIPT_V1.json',
  before: C + 'WP710_PROTECTED_WIP_BEFORE_V1.json',
  predecessor: C + 'WP710_WP605_TERMINAL_PREDECESSOR_V1.json',
  fixture: C + 'WP710_FIXTURE_MANIFEST_V1.json',
  graph: C + 'WP710_EFFECTIVE_GRAPH_BASELINE_V1.json',
  registry: C + 'WP710_CARRIER_REGISTRY_V1.json',
  acceptance: C + 'WP710_ACCEPTANCE_MATRIX_V1.json',
  state: C + 'WP710_EFFECTIVE_STATE_V1.json',
  stageRegistry: C + 'WP710_STAGE_REGISTRY_V1.json',
  lease: C + 'WP710_LEASE_RELEASE_V1.json',
  terminal: C + 'WP710_TERMINAL_RECEIPT_V1.json',
};
const historicalBytes = (file) => execFileSync('git', ['show', `${WP710_TERMINAL_MERGE_SHA}:${file}`], {
  encoding: null,
  maxBuffer: 32 * 1024 * 1024,
});
const read = (file) => JSON.parse(historicalBytes(file));
const roles = { externalSourcePlanDigest: '1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a', compiledProgramFileDigest: 'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a', rolesDistinct: true };
const counts = (states) => Object.fromEntries(['BLOCKED_TYPED', 'DONE', 'INELIGIBLE_OPTIONAL', 'PENDING'].map((state) => [state, Object.values(states).filter((value) => value === state).length]));
function load() { return Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, read(file)])); }

function verify(values) {
  assert.equal(h(historicalBytes(paths.authority)), '9785635574e9f3a9fb1b9ac2bd0dcb75911c1e6ff461e4f44202563559cdc399');
  assert.equal(h(historicalBytes(paths.instance)), '199d6bbbe556860cd023e43b0e7fce2f7165d4595638140dda65bb5bfee738df');
  assert.equal(h(historicalBytes(paths.admission)), '5e7dd4f4e6183725ebc9952a10bc51ee14798d0e2ab9f66073202660abf53f1b');
  assert.equal(values.admission.writeSetDigest, 'e3d02ffdbcef25701de14ca8371bdb9ea9ffe2c906f69dfc4c3c961ee16233d0');
  assert.deepEqual(values.instance.lease, { fencingCounter: 88, status: 'ACTIVE', wip: 1, predecessorReleaseDigest: 'd87ca4ba2f91029ccaf14447a71ba17e565dfd1fe08220bea6fe497b44ba2f39' });
  const { snapshotSha256, ...payload } = values.before;
  assert.equal(h(Buffer.from(JSON.stringify(payload) + '\n')), snapshotSha256);
  assert.equal(values.before.completeDenominator, 276);
  assert.equal(values.before.entries.length, 276);
  assert.equal(values.before.dirtyDenominator, 10);
  assert.equal(values.predecessor.predecessorLeaseStatus, 'RELEASED');
  assert.equal(values.predecessor.predecessorWip, 0);
  assert.deepEqual(values.predecessor.predecessorGraphCounts, { DONE: 75, PENDING: 21, BLOCKED_TYPED: 3, INELIGIBLE_OPTIONAL: 10 });
  assert.equal(values.fixture.syntheticOnly, true);
  assert.equal(values.fixture.realOwnerDocuments, false);
  assert.equal(values.fixture.fixtures.length, 5);
  assert.equal(values.fixture.designEvidence.runtimeDependency, false);
  assert.equal(values.graph.completeDenominator, 109);
  assert.equal(canonicalDigest(values.graph.states), values.graph.statesDigest);
  assert.deepEqual(counts(values.graph.states), { BLOCKED_TYPED: 3, DONE: 75, INELIGIBLE_OPTIONAL: 10, PENDING: 21 });
  assert.deepEqual(values.state.currentCounts, counts(values.graph.states));
  assert.deepEqual(values.state.targetStates, { ...values.graph.states, 'WP-710_EVIDENCE_CAPSULE_EXPORT': 'DONE' });
  assert.deepEqual(values.state.targetCounts, { BLOCKED_TYPED: 3, DONE: 76, INELIGIBLE_OPTIONAL: 10, PENDING: 20 });
  const admitted = [...values.instance.operations.modifyPaths, ...values.instance.operations.createPaths].sort();
  const allCarriers = [...values.registry.carriers.map((row) => row.path), ...values.registry.excludedDependentCarriers].sort();
  assert.deepEqual(allCarriers, admitted);
  assert.equal(new Set(allCarriers).size, 37);
  assert.equal(values.registry.carrierDenominator, 29);
  assert.equal(values.registry.currentTreeFallbackAllowed, false);
  for (const binding of values.registry.carriers) {
    assert.equal(h(historicalBytes(binding.path)), binding.sha256, binding.path);
    assert.equal(historicalBytes(binding.path).length, binding.byteLength, binding.path);
  }
  assert.equal(values.acceptance.rows.length, values.acceptance.denominator);
  assert.equal(values.acceptance.rows.filter((row) => row.status === 'PASS').length, values.acceptance.localPassCount);
  assert.equal(values.acceptance.rows.filter((row) => row.status === 'REQUIRED_NOT_PRECLAIMED').length, values.acceptance.localRequiredCount + values.acceptance.externalRequiredCount);
  assert.equal(values.terminal.status, 'CONDITIONAL_DONE_PENDING_REQUIRED_LOCAL_AND_EXTERNAL_PREDICATES');
  assert.equal(values.terminal.bindings.leaseReleaseDigest, h(historicalBytes(paths.lease)));
  assert.equal(values.terminal.bindings.acceptanceMatrixDigest, h(historicalBytes(paths.acceptance)));
  assert.equal(values.terminal.bindings.effectiveStateDigest, h(historicalBytes(paths.state)));
  assert.equal(values.lease.currentLease.status, 'ACTIVE');
  assert.equal(values.lease.targetLease.status, 'RELEASED');
  assert.equal(values.lease.targetLease.wip, 0);
  assert.equal(values.terminal.activationOutcome.doneCount, 76);
  assert.equal(values.terminal.activationOutcome.pendingCount, 20);
  for (const value of Object.values(values)) {
    if (value.sourcePlanRoles) assert.deepEqual(value.sourcePlanRoles, roles);
    if (Object.hasOwn(value, 'programDone')) assert.equal(value.programDone, false);
  }
  return true;
}

test('WP710 carrier set replays exact admission graph increment and conditional terminal state', () => {
  const values = load();
  assert.equal(verify(values), true);
  const claim = buildClaimBinding(read('docs/OPS/R24/EVIDENCE/ES-R24-WP-710-EVIDENCE-CAPSULE-EXPORT-CLAIM-BINDINGS.json'));
  for (const binding of claim.claimBindings) assert.equal(h(historicalBytes(binding.filePath)), binding.sha256, binding.filePath);
  for (const binding of claim.implementationArtifactDigests) assert.equal(h(historicalBytes(binding.path)), binding.sha256, binding.path);
  assert.ok(claim.nonClaims.includes('PROGRAM_DONE_FALSE'));
  assert.deepEqual(HISTORICAL_INVENTORY_CLAIM_PINS_V7.at(-1), { stampId: 'ES-R24-WP-605-WSE-REVISION-TIME-OBJECT-CLAIM-BINDINGS', stampSha256: '4111a07f485853c38ea32344b5f680f83e886ed2dabf037f5b15b79ed8deb19b', evaluationSha: '725b47c254895a5075c381ce5182592a40c31b45', evaluationTree: 'd81b51239ef10aa03ae57a96ac0e9ddc5d809d7b', targetSha256: '8738e80b3e77c1615922281d5b2fff34e16c6db774ece2a512c131e648ee4268' });
});

test('WP710 evidence stamps bind the executed eight-test TAP and 32 rejected negative cases', () => {
  const prefix = 'docs/OPS/R24/EVIDENCE/ES-R24-WP-710-EVIDENCE-CAPSULE-EXPORT-';
  for (const kind of ['MODEL', 'CONTRACT', 'INTEGRATION', 'MUTANTS']) {
    const evidence = read(prefix + kind + '.json');
    const raw = evidence.artifact.rawEvidence;
    const rawBytes = Buffer.from(raw.stdoutBase64, 'base64');
    assert.equal(rawBytes.length, raw.byteLength);
    assert.equal(h(rawBytes), raw.sha256);
    assert.match(rawBytes.toString(), /\n1\.\.8\n# tests 8\n# suites 0\n# pass 8\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n/u);
    assert.equal(raw.processExitCode, 0);
    assert.equal(raw.node, '22.12.0');
    for (const binding of evidence.artifact.implementationArtifacts) assert.equal(h(historicalBytes(binding.path)), binding.sha256, binding.path);
  }
  assert.equal(read(prefix + 'MUTANTS.json').test.denominator, 32);
  assert.equal(read(prefix + 'MUTANTS.json').test.passed, 32);
});

test('WP710 hostile carrier mutants reject graph overclaim false release and missing protected state', () => {
  const mutations = [
    (value) => { value.before.entries.pop(); },
    (value) => { value.graph.states['WP-710_EVIDENCE_CAPSULE_EXPORT'] = 'DONE'; },
    (value) => { value.state.targetCounts.DONE = 77; },
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
