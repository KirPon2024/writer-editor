import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { buildClaimBinding } from '../../scripts/ops/r24/claim-binding.mjs';
import { canonicalDigest } from '../../scripts/ops/r24/canonical-json.mjs';
import { HISTORICAL_INVENTORY_CLAIM_PINS_V8 } from '../../scripts/ops/r24/docs-claim-lint.mjs';

const C = 'docs/OPS/R24/CORRECTIVE/';
const h = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const paths = {
  authority: C + 'WP606_MAIN_PRODUCT_OWNER_AUTHORITY_AMENDMENT_V2.json',
  instance: C + 'WP606_MAIN_PRODUCT_STAGE_INSTANCE_V3.json',
  admission: C + 'WP606_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V3.json',
  selection: C + 'WP606_MAIN_PRODUCT_SELECTION_RECEIPT_V1.json',
  before: C + 'WP606_PROTECTED_WIP_BEFORE_V1.json',
  predecessor: C + 'WP606_WP710_TERMINAL_PREDECESSOR_V1.json',
  fixture: C + 'WP606_FIXTURE_MANIFEST_V1.json',
  privacy: C + 'WP606_SERIES_IDENTITY_PRIVACY_CONTRACT_V1.json',
  feature: C + 'WP606_FEATURE_INTEGRATION_MANIFEST_V1.json',
  graph: C + 'WP606_EFFECTIVE_GRAPH_BASELINE_V1.json',
  registry: C + 'WP606_CARRIER_REGISTRY_V1.json',
  acceptance: C + 'WP606_ACCEPTANCE_MATRIX_V1.json',
  state: C + 'WP606_EFFECTIVE_STATE_V1.json',
  stageRegistry: C + 'WP606_STAGE_REGISTRY_V1.json',
  lease: C + 'WP606_LEASE_RELEASE_V1.json',
  terminal: C + 'WP606_TERMINAL_RECEIPT_V1.json',
};
const bytes = (file) => fs.readFileSync(file);
const read = (file) => JSON.parse(bytes(file));
const roles = { externalSourcePlanDigest: '1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a', compiledProgramFileDigest: 'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a', rolesDistinct: true };
const counts = (states) => Object.fromEntries(['BLOCKED_TYPED', 'DONE', 'INELIGIBLE_OPTIONAL', 'PENDING'].map((state) => [state, Object.values(states).filter((value) => value === state).length]));
function load() { return Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, read(file)])); }

function verify(values) {
  assert.equal(h(bytes(paths.authority)), 'c2db93b077ed71b0067c7b4e308b8bf735935223c84fe9c37370bf45e9e4ceeb');
  assert.equal(h(bytes(paths.instance)), '348848abc6b7541cba8647c2e6ec8ed179494bd487ec25e156fb22738307468a');
  assert.equal(h(bytes(paths.admission)), '3bda49850e8d1486de00fe16673368c21df9b34a1f6bb53f008fc59813d8298c');
  assert.equal(values.admission.writeSetDigest, 'e2b7e955e646f42c5da68eb3857735b761b62672719442bdd0bb323a36c8f697');
  assert.deepEqual(values.instance.lease, { fencingCounter: 89, status: 'ACTIVE', wip: 1, predecessorReleaseDigest: '3c3c92b6b0b5b4a38815ac00e944325de94275250bd47131f98851ff596031e0' });
  const { snapshotSha256, ...payload } = values.before;
  assert.equal(h(Buffer.from(JSON.stringify(payload) + '\n')), snapshotSha256);
  assert.equal(values.before.completeDenominator, 277);
  assert.equal(values.before.entries.length, 277);
  assert.equal(values.before.dirtyDenominator, 10);
  assert.equal(values.before.excludedTaskWorktrees.length, 2);
  assert.equal(values.predecessor.predecessorLeaseStatus, 'RELEASED');
  assert.equal(values.predecessor.predecessorWip, 0);
  assert.deepEqual(values.predecessor.predecessorGraphCounts, { DONE: 76, PENDING: 20, BLOCKED_TYPED: 3, INELIGIBLE_OPTIONAL: 10 });
  assert.equal(values.fixture.syntheticOnly, true);
  assert.equal(values.fixture.realOwnerDocuments, false);
  assert.equal(values.fixture.fixtures.length, 5);
  assert.equal(values.fixture.designEvidence.runtimeDependency, false);
  assert.equal(values.privacy.authority.readOnly, true);
  assert.equal(values.privacy.authority.productMutationAuthority, false);
  assert.equal(values.feature.runtimeNetwork, false);
  assert.equal(values.graph.completeDenominator, 109);
  assert.equal(canonicalDigest(values.graph.states), values.graph.statesDigest);
  assert.deepEqual(counts(values.graph.states), { BLOCKED_TYPED: 3, DONE: 76, INELIGIBLE_OPTIONAL: 10, PENDING: 20 });
  assert.deepEqual(values.state.currentCounts, counts(values.graph.states));
  assert.deepEqual(values.state.targetStates, { ...values.graph.states, 'WP-606_WSE_SERIES_MULTI_LAYER': 'DONE' });
  assert.deepEqual(values.state.targetCounts, { BLOCKED_TYPED: 3, DONE: 77, INELIGIBLE_OPTIONAL: 10, PENDING: 19 });
  const admitted = [...values.instance.operations.modifyPaths, ...values.instance.operations.createPaths].sort();
  const allCarriers = [...values.registry.carriers.map((row) => row.path), ...values.registry.excludedDependentCarriers].sort();
  assert.deepEqual(allCarriers, admitted);
  assert.equal(new Set(allCarriers).size, 53);
  assert.equal(values.registry.carrierDenominator, 45);
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
  assert.equal(values.terminal.activationOutcome.doneCount, 77);
  assert.equal(values.terminal.activationOutcome.pendingCount, 19);
  for (const value of Object.values(values)) {
    if (value.sourcePlanRoles) assert.deepEqual(value.sourcePlanRoles, roles);
    if (Object.hasOwn(value, 'programDone')) assert.equal(value.programDone, false);
  }
  return true;
}

test('WP606 carrier set replays exact admission graph increment and conditional terminal state', () => {
  const values = load();
  assert.equal(verify(values), true);
  const claim = buildClaimBinding(read('docs/OPS/R24/EVIDENCE/ES-R24-WP-606-WSE-SERIES-MULTI-LAYER-CLAIM-BINDINGS.json'));
  for (const binding of claim.claimBindings) assert.equal(h(bytes(binding.filePath)), binding.sha256, binding.filePath);
  for (const binding of claim.implementationArtifactDigests) assert.equal(h(bytes(binding.path)), binding.sha256, binding.path);
  assert.ok(claim.nonClaims.includes('PROGRAM_DONE_FALSE'));
  assert.deepEqual(HISTORICAL_INVENTORY_CLAIM_PINS_V8.at(-1), { stampId: 'ES-R24-WP-710-EVIDENCE-CAPSULE-EXPORT-CLAIM-BINDINGS', stampSha256: '3792a39a24f93a842cfe96479253bc577f192915ef2790ee25fd99974c30117c', evaluationSha: '19c1ae3f39de73b87d468ff84dd65ecdbd478269', evaluationTree: '4c11af1a5a2265c7f4fb279edb5d2ae64f36532b', targetSha256: 'dd8a7d6ade9667a6cab6e5d01ae9be389b18656b525efac57e07638692392cfc' });
});

test('WP606 evidence stamps bind the executed eight-test TAP and 12 rejected negative cases', () => {
  const prefix = 'docs/OPS/R24/EVIDENCE/ES-R24-WP-606-WSE-SERIES-MULTI-LAYER-';
  for (const kind of ['MODEL', 'CONTRACT', 'INTEGRATION', 'MUTANTS']) {
    const evidence = read(prefix + kind + '.json');
    const raw = evidence.artifact.rawEvidence;
    const rawBytes = Buffer.from(raw.stdoutBase64, 'base64');
    assert.equal(rawBytes.length, raw.byteLength);
    assert.equal(h(rawBytes), raw.sha256);
    assert.match(rawBytes.toString(), /\n1\.\.8\n# tests 8\n# suites 0\n# pass 8\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n/u);
    assert.equal(raw.processExitCode, 0);
    assert.equal(raw.node, '22.12.0');
    for (const binding of evidence.artifact.implementationArtifacts) assert.equal(h(bytes(binding.path)), binding.sha256, binding.path);
  }
  assert.equal(read(prefix + 'MUTANTS.json').test.denominator, 12);
  assert.equal(read(prefix + 'MUTANTS.json').test.passed, 12);
});

test('WP606 hostile carrier mutants reject graph overclaim false release and missing protected state', () => {
  const mutations = [
    (value) => { value.before.entries.pop(); },
    (value) => { value.graph.states['WP-606_WSE_SERIES_MULTI_LAYER'] = 'DONE'; },
    (value) => { value.state.targetCounts.DONE = 78; },
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
