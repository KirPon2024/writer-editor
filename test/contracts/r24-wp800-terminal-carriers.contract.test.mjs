import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { buildClaimBinding } from '../../scripts/ops/r24/claim-binding.mjs';
import { canonicalDigest } from '../../scripts/ops/r24/canonical-json.mjs';
import { HISTORICAL_INVENTORY_CLAIM_PINS_V10 } from '../../scripts/ops/r24/docs-claim-lint.mjs';

const C = 'docs/OPS/R24/CORRECTIVE/';
const TERMINAL_MERGE = 'acfbd6896cd9830ab48f794bbbb2a433bd72b42d';
const h = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const paths = {
  authority: C + 'WP800_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json',
  instance: C + 'WP800_MAIN_PRODUCT_STAGE_INSTANCE_V1.json',
  admission: C + 'WP800_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json',
  selection: C + 'WP800_MAIN_PRODUCT_SELECTION_RECEIPT_V1.json',
  before: C + 'WP800_PROTECTED_WIP_BEFORE_V1.json',
  predecessor: C + 'WP800_WP607_TERMINAL_PREDECESSOR_V1.json',
  fixture: C + 'WP800_FIXTURE_MANIFEST_V1.json',
  privacy: C + 'WP800_PULSE_METRIC_PRIVACY_CONTRACT_V1.json',
  feature: C + 'WP800_FEATURE_INTEGRATION_MANIFEST_V1.json',
  graph: C + 'WP800_EFFECTIVE_GRAPH_BASELINE_V1.json',
  registry: C + 'WP800_CARRIER_REGISTRY_V1.json',
  acceptance: C + 'WP800_ACCEPTANCE_MATRIX_V1.json',
  state: C + 'WP800_EFFECTIVE_STATE_V1.json',
  stageRegistry: C + 'WP800_STAGE_REGISTRY_V1.json',
  lease: C + 'WP800_LEASE_RELEASE_V1.json',
  terminal: C + 'WP800_TERMINAL_RECEIPT_V1.json',
};
const bytes = (file) => execFileSync('git', ['show', `${TERMINAL_MERGE}:${file}`], { encoding: null, maxBuffer: 32 * 1024 * 1024 });
const read = (file) => JSON.parse(bytes(file));
const roles = { externalSourcePlanDigest: '1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a', compiledProgramFileDigest: 'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a', rolesDistinct: true };
const counts = (states) => Object.fromEntries(['BLOCKED_TYPED', 'DONE', 'INELIGIBLE_OPTIONAL', 'PENDING'].map((state) => [state, Object.values(states).filter((value) => value === state).length]));
function load() { return Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, read(file)])); }

function verify(values) {
  assert.equal(h(bytes(paths.authority)), '263f19347430b354e3b6aa86f401216b9522a7273e9b5947925191cb1c51bd67');
  assert.equal(h(bytes(paths.instance)), 'acfc5620dc03208e048f8d7d3d1ec670e937b1eda0dceacef7b223c0fdbf8444');
  assert.equal(h(bytes(paths.admission)), '96679cf17b8f92cb2278d4e6eae4d390b05e7176ee7717310461a963dd1489fe');
  assert.equal(values.admission.writeSetDigest, '580564c9f3fcb1c1025a0c999b2c684e95f0bb607d3c7e07f7ee1768b846bf07');
  assert.deepEqual(values.instance.lease, { fencingCounter: 91, status: 'ACTIVE', wip: 1, predecessorReleaseDigest: '5d6677f745c514ab7b98f38834cf0ef9c938b39c27c23b407eb7c0da368e0579' });
  const { snapshotSha256, ...payload } = values.before;
  assert.equal(h(Buffer.from(JSON.stringify(payload) + '\n')), snapshotSha256);
  assert.equal(values.before.completeDenominator, 282);
  assert.equal(values.before.entries.length, 282);
  assert.equal(values.before.dirtyDenominator, 10);
  assert.equal(values.before.excludedTaskWorktrees.length, 1);
  assert.equal(values.predecessor.predecessorLeaseStatus, 'RELEASED');
  assert.equal(values.predecessor.predecessorWip, 0);
  assert.deepEqual(values.predecessor.predecessorGraphCounts, { DONE: 78, PENDING: 18, BLOCKED_TYPED: 3, INELIGIBLE_OPTIONAL: 10 });
  assert.equal(values.fixture.syntheticOnly, true);
  assert.equal(values.fixture.realOwnerDocuments, false);
  assert.equal(values.fixture.fixtures.length, 4);
  assert.deepEqual(values.privacy.denylist, ['CONTENT', 'IDENTITY', 'PATH', 'NETWORK', 'EXPORT', 'TELEMETRY']);
  assert.equal(values.privacy.authority.localOnly, true);
  assert.equal(values.privacy.authority.storageAuthority, false);
  assert.equal(values.feature.runtimeNetwork, false);
  assert.equal(values.graph.completeDenominator, 109);
  assert.equal(canonicalDigest(values.graph.states), values.graph.statesDigest);
  assert.deepEqual(counts(values.graph.states), { BLOCKED_TYPED: 3, DONE: 78, INELIGIBLE_OPTIONAL: 10, PENDING: 18 });
  assert.deepEqual(values.state.currentCounts, counts(values.graph.states));
  assert.deepEqual(values.state.targetStates, { ...values.graph.states, 'WP-800_PULSE_POLICY_CODEC': 'DONE' });
  assert.deepEqual(values.state.targetCounts, { BLOCKED_TYPED: 3, DONE: 79, INELIGIBLE_OPTIONAL: 10, PENDING: 17 });
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
  assert.equal(values.terminal.activationOutcome.doneCount, 79);
  assert.equal(values.terminal.activationOutcome.pendingCount, 17);
  for (const value of Object.values(values)) {
    if (value.sourcePlanRoles) assert.deepEqual(value.sourcePlanRoles, roles);
    if (Object.hasOwn(value, 'programDone')) assert.equal(value.programDone, false);
  }
  return true;
}

test('WP800 carrier set replays exact admission, privacy contract, graph increment and conditional terminal state', () => {
  const values = load();
  assert.equal(verify(values), true);
  const claim = buildClaimBinding(read('docs/OPS/R24/EVIDENCE/ES-R24-WP-800-PULSE-POLICY-CODEC-CLAIM-BINDINGS.json'));
  for (const binding of claim.claimBindings) assert.equal(h(bytes(binding.filePath)), binding.sha256, binding.filePath);
  for (const binding of claim.implementationArtifactDigests) assert.equal(h(bytes(binding.path)), binding.sha256, binding.path);
  assert.ok(claim.nonClaims.includes('PROGRAM_DONE_FALSE'));
  assert.deepEqual(HISTORICAL_INVENTORY_CLAIM_PINS_V10.at(-1), { stampId: 'ES-R24-WP-607-WSE-CLAIMS-CLAIM-BINDINGS', stampSha256: '810674cf3e349c38405ee59cca010b10a4f749d904afd8222809a2a5c827286f', evaluationSha: 'b9b0737b56024f17595341438aba9b2722270d9b', evaluationTree: 'a0fa1c41b866cd23a17c64083b87181a9c8ff2bb', targetSha256: '932cfd778e056be98ccc2be5811796219c6135c4334996537acce1daa3b1bcef' });
});

test('WP800 evidence stamps bind the executed six-test TAP and 38 rejected hostile cases', () => {
  const prefix = 'docs/OPS/R24/EVIDENCE/ES-R24-WP-800-PULSE-POLICY-CODEC-';
  for (const kind of ['MODEL', 'CONTRACT', 'INTEGRATION', 'MUTANTS']) {
    const evidence = read(prefix + kind + '.json');
    const raw = evidence.artifact.rawEvidence;
    const rawBytes = Buffer.from(raw.stdoutBase64, 'base64');
    assert.equal(rawBytes.length, raw.byteLength);
    assert.equal(h(rawBytes), raw.sha256);
    assert.match(rawBytes.toString(), /\n1\.\.6\n# tests 6\n# suites 0\n# pass 6\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n/u);
    assert.equal(raw.processExitCode, 0);
    assert.equal(raw.node, '22.12.0');
    for (const binding of evidence.artifact.implementationArtifacts) assert.equal(h(bytes(binding.path)), binding.sha256, binding.path);
  }
  assert.equal(read(prefix + 'MUTANTS.json').test.denominator, 38);
  assert.equal(read(prefix + 'MUTANTS.json').test.passed, 38);
});

test('WP800 hostile carrier mutants reject privacy widening, graph overclaim and false release', () => {
  const mutations = [
    (value) => { value.before.entries.pop(); },
    (value) => { value.graph.states['WP-800_PULSE_POLICY_CODEC'] = 'DONE'; },
    (value) => { value.state.targetCounts.DONE = 80; },
    (value) => { value.privacy.denylist.pop(); },
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
  assert.equal(mutations.length, 8);
});
