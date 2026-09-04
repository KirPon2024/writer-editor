import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { buildClaimBinding } from '../../scripts/ops/r24/claim-binding.mjs';
import { canonicalDigest } from '../../scripts/ops/r24/canonical-json.mjs';
import { HISTORICAL_INVENTORY_CLAIM_PINS_V6 } from '../../scripts/ops/r24/docs-claim-lint.mjs';

const C = 'docs/OPS/R24/CORRECTIVE/';
const WP605_TERMINAL_MERGE_SHA = '725b47c254895a5075c381ce5182592a40c31b45';
const h = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const paths = {
  authority: C + 'WP605_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json', instance: C + 'WP605_MAIN_PRODUCT_STAGE_INSTANCE_V1.json', admission: C + 'WP605_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json',
  selection: C + 'WP605_MAIN_PRODUCT_SELECTION_RECEIPT_V1.json', before: C + 'WP605_PROTECTED_WIP_BEFORE_V1.json', predecessor: C + 'WP605_WP604_TERMINAL_PREDECESSOR_V1.json',
  fixture: C + 'WP605_FIXTURE_MANIFEST_V1.json', graph: C + 'WP605_EFFECTIVE_GRAPH_BASELINE_V1.json', registry: C + 'WP605_CARRIER_REGISTRY_V1.json', acceptance: C + 'WP605_ACCEPTANCE_MATRIX_V1.json',
  state: C + 'WP605_EFFECTIVE_STATE_V1.json', stageRegistry: C + 'WP605_STAGE_REGISTRY_V1.json', lease: C + 'WP605_LEASE_RELEASE_V1.json', terminal: C + 'WP605_TERMINAL_RECEIPT_V1.json',
};
const bytes = (file) => fs.readFileSync(file);
const historicalBytes = (file) => execFileSync('git', ['show', `${WP605_TERMINAL_MERGE_SHA}:${file}`], {
  encoding: null,
  maxBuffer: 32 * 1024 * 1024,
});
const read = (file) => JSON.parse(bytes(file));
const roles = { externalSourcePlanDigest: '1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a', compiledProgramFileDigest: 'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a', rolesDistinct: true };
const counts = (states) => Object.fromEntries(['BLOCKED_TYPED', 'DONE', 'INELIGIBLE_OPTIONAL', 'PENDING'].map((state) => [state, Object.values(states).filter((value) => value === state).length]));
function load() { return Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, read(file)])); }

function verify(values) {
  assert.equal(h(bytes(paths.authority)), '96faae68d8828738993817d62ae6c96c915a7c349022aaef3740560e6a699c63');
  assert.equal(h(bytes(paths.instance)), '706fc78778223d2fae4fb1fed1152afcde4e4094e99193102f9b3a1d8cfe4544');
  assert.equal(h(bytes(paths.admission)), 'ac51e1174e0d30466ff8ee5f9627aee436fd35dd230b52ad1d142cbba04dae4e');
  assert.equal(values.admission.writeSetDigest, '8c9566252d3b30a3421fc989aa0204db8577e57d3fde96aad9d1a3a8ce64672b');
  assert.deepEqual(values.instance.lease, { fencingCounter: 87, status: 'ACTIVE', wip: 1, predecessorReleaseDigest: '89035256fe312566133de642dd4844782779f03ad091a4cf15895a4f84da340f' });
  const { snapshotSha256, ...payload } = values.before;
  assert.equal(h(Buffer.from(JSON.stringify(payload) + '\n')), snapshotSha256);
  assert.equal(values.before.completeDenominator, 274);
  assert.equal(values.before.entries.length, 274);
  assert.equal(values.before.dirtyDenominator, 10);
  assert.equal(values.predecessor.predecessorLeaseStatus, 'RELEASED');
  assert.equal(values.predecessor.predecessorWip, 0);
  assert.equal(values.fixture.syntheticOnly, true);
  assert.equal(values.fixture.realOwnerDocuments, false);
  assert.equal(values.fixture.fixtures.length, 9);
  assert.equal(values.fixture.designEvidence.runtimeDependency, false);
  assert.equal(values.graph.completeDenominator, 109);
  assert.equal(canonicalDigest(values.graph.states), values.graph.statesDigest);
  assert.deepEqual(counts(values.graph.states), { BLOCKED_TYPED: 3, DONE: 74, INELIGIBLE_OPTIONAL: 10, PENDING: 22 });
  assert.deepEqual(values.state.currentCounts, counts(values.graph.states));
  assert.deepEqual(values.state.targetStates, { ...values.graph.states, 'WP-605_WSE_REVISION_TIME_OBJECT': 'DONE' });
  assert.deepEqual(values.state.targetCounts, { BLOCKED_TYPED: 3, DONE: 75, INELIGIBLE_OPTIONAL: 10, PENDING: 21 });
  const admitted = [...values.instance.operations.modifyPaths, ...values.instance.operations.createPaths].sort();
  const allCarriers = [...values.registry.carriers.map((row) => row.path), ...values.registry.excludedDependentCarriers].sort();
  assert.deepEqual(allCarriers, admitted);
  assert.equal(new Set(allCarriers).size, 41);
  assert.equal(values.registry.carrierDenominator, 33);
  assert.equal(values.registry.currentTreeFallbackAllowed, false);
  for (const binding of values.registry.carriers) {
    const terminalBytes = historicalBytes(binding.path);
    assert.equal(h(terminalBytes), binding.sha256, binding.path);
    assert.equal(terminalBytes.length, binding.byteLength, binding.path);
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
  assert.equal(values.terminal.activationOutcome.doneCount, 75);
  assert.equal(values.terminal.activationOutcome.pendingCount, 21);
  for (const value of Object.values(values)) {
    if (value.sourcePlanRoles) assert.deepEqual(value.sourcePlanRoles, roles);
    if (Object.hasOwn(value, 'programDone')) assert.equal(value.programDone, false);
  }
  return true;
}

test('WP605 carrier set replays exact admission, graph increment and conditional terminal state', () => {
  const values = load();
  assert.equal(verify(values), true);
  const claim = buildClaimBinding(read('docs/OPS/R24/EVIDENCE/ES-R24-WP-605-WSE-REVISION-TIME-OBJECT-CLAIM-BINDINGS.json'));
  for (const binding of claim.claimBindings) assert.equal(h(historicalBytes(binding.filePath)), binding.sha256, binding.filePath);
  for (const binding of claim.implementationArtifactDigests) assert.equal(h(historicalBytes(binding.path)), binding.sha256, binding.path);
  assert.ok(claim.nonClaims.includes('PROGRAM_DONE_FALSE'));
  assert.deepEqual(HISTORICAL_INVENTORY_CLAIM_PINS_V6.at(-1), { stampId: 'ES-R24-WP-604-WSE-THREADS-EXPLANATION-CLAIM-BINDINGS', stampSha256: '85baf335f693b427e15621259149b7ae9e9604d9a752b1ae33c5cc6503491426', evaluationSha: '250fa6533776556a6f98c07b03ef6d179fb62c79', evaluationTree: 'fc4fa5757cdbeddc188420fad1382559ed11043a', targetSha256: 'ed1f50c0265e6dc52b685ad160b4a0f491b2e9726e586f9e8526442f0ca0848c' });
});

test('WP605 evidence stamps bind the executed 9-test TAP and 12 rejected hostile cases', () => {
  const prefix = 'docs/OPS/R24/EVIDENCE/ES-R24-WP-605-WSE-REVISION-TIME-OBJECT-';
  for (const kind of ['MODEL', 'CONTRACT', 'INTEGRATION', 'MUTANTS']) {
    const evidence = read(prefix + kind + '.json');
    const raw = evidence.artifact.rawEvidence;
    const rawBytes = Buffer.from(raw.stdoutBase64, 'base64');
    assert.equal(rawBytes.length, raw.byteLength);
    assert.equal(h(rawBytes), raw.sha256);
    assert.match(rawBytes.toString(), /\n1\.\.9\n# tests 9\n# suites 0\n# pass 9\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n/u);
    assert.equal(raw.processExitCode, 0);
    assert.equal(raw.node, '22.12.0');
    for (const binding of evidence.artifact.implementationArtifacts) assert.equal(h(historicalBytes(binding.path)), binding.sha256, binding.path);
  }
  assert.equal(read(prefix + 'MUTANTS.json').test.denominator, 12);
  assert.equal(read(prefix + 'MUTANTS.json').test.passed, 12);
});

test('WP605 hostile carrier mutants reject graph overclaim, false release and missing protected state', () => {
  const mutations = [
    (value) => { value.before.entries.pop(); },
    (value) => { value.graph.states['WP-605_WSE_REVISION_TIME_OBJECT'] = 'DONE'; },
    (value) => { value.state.targetCounts.DONE = 76; },
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
