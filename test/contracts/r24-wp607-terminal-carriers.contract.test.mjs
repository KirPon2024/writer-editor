import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { buildClaimBinding } from '../../scripts/ops/r24/claim-binding.mjs';
import { canonicalDigest } from '../../scripts/ops/r24/canonical-json.mjs';
import { HISTORICAL_INVENTORY_CLAIM_PINS_V9 } from '../../scripts/ops/r24/docs-claim-lint.mjs';

const C = 'docs/OPS/R24/CORRECTIVE/';
const h = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const paths = {
  authority: C + 'WP607_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json',
  instance: C + 'WP607_MAIN_PRODUCT_STAGE_INSTANCE_V1.json',
  admission: C + 'WP607_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json',
  selection: C + 'WP607_MAIN_PRODUCT_SELECTION_RECEIPT_V1.json',
  before: C + 'WP607_PROTECTED_WIP_BEFORE_V1.json',
  predecessor: C + 'WP607_WP606_TERMINAL_PREDECESSOR_V1.json',
  fixture: C + 'WP607_FIXTURE_MANIFEST_V1.json',
  feature: C + 'WP607_FEATURE_INTEGRATION_MANIFEST_V1.json',
  graph: C + 'WP607_EFFECTIVE_GRAPH_BASELINE_V1.json',
  registry: C + 'WP607_CARRIER_REGISTRY_V1.json',
  acceptance: C + 'WP607_ACCEPTANCE_MATRIX_V1.json',
  state: C + 'WP607_EFFECTIVE_STATE_V1.json',
  stageRegistry: C + 'WP607_STAGE_REGISTRY_V1.json',
  lease: C + 'WP607_LEASE_RELEASE_V1.json',
  terminal: C + 'WP607_TERMINAL_RECEIPT_V1.json',
};
const bytes = (file) => fs.readFileSync(file);
const read = (file) => JSON.parse(bytes(file));
const roles = { externalSourcePlanDigest: '1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a', compiledProgramFileDigest: 'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a', rolesDistinct: true };
const counts = (states) => Object.fromEntries(['BLOCKED_TYPED', 'DONE', 'INELIGIBLE_OPTIONAL', 'PENDING'].map((state) => [state, Object.values(states).filter((value) => value === state).length]));
function load() { return Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, read(file)])); }

function verify(values) {
  assert.equal(h(bytes(paths.authority)), '25457f05218d13ef9a98de934c5acff0c477291a0a0441049e4a0e49ec699ee7');
  assert.equal(h(bytes(paths.instance)), '37ce64f8cb9bafc2bf74c1fd8848360eba8b3d6c2956961c95a711def9c4f958');
  assert.equal(h(bytes(paths.admission)), '172912b1b191b5e435b0a9027bf8b4e6241f9136475cca7e80a9ad776229c3f5');
  assert.equal(values.admission.writeSetDigest, 'f1053d27bf647dc31d8289e6366b95d6a47f74d5de62e73bf939c761a02838e1');
  assert.deepEqual(values.instance.lease, { fencingCounter: 90, status: 'ACTIVE', wip: 1, predecessorReleaseDigest: 'd6d45e426c6ecd50afd729d456765b82074042ae8d5a5046354b0a94d3dd9cad' });
  const { snapshotSha256, ...payload } = values.before;
  assert.equal(h(Buffer.from(JSON.stringify(payload) + '\n')), snapshotSha256);
  assert.equal(values.before.completeDenominator, 279);
  assert.equal(values.before.entries.length, 279);
  assert.equal(values.before.dirtyDenominator, 10);
  assert.equal(values.before.excludedTaskWorktrees.length, 2);
  assert.equal(values.predecessor.predecessorLeaseStatus, 'RELEASED');
  assert.equal(values.predecessor.predecessorWip, 0);
  assert.deepEqual(values.predecessor.predecessorGraphCounts, { DONE: 77, PENDING: 19, BLOCKED_TYPED: 3, INELIGIBLE_OPTIONAL: 10 });
  assert.equal(values.fixture.syntheticOnly, true);
  assert.equal(values.fixture.realOwnerDocuments, false);
  assert.equal(values.fixture.fixtures.length, 5);
  assert.equal(values.feature.runtimeNetwork, false);
  assert.equal(values.graph.completeDenominator, 109);
  assert.equal(canonicalDigest(values.graph.states), values.graph.statesDigest);
  assert.deepEqual(counts(values.graph.states), { BLOCKED_TYPED: 3, DONE: 77, INELIGIBLE_OPTIONAL: 10, PENDING: 19 });
  assert.deepEqual(values.state.currentCounts, counts(values.graph.states));
  assert.deepEqual(values.state.targetStates, { ...values.graph.states, 'WP-607_WSE_CLAIMS': 'DONE' });
  assert.deepEqual(values.state.targetCounts, { BLOCKED_TYPED: 3, DONE: 78, INELIGIBLE_OPTIONAL: 10, PENDING: 18 });
  const admitted = [...values.instance.operations.modifyPaths, ...values.instance.operations.createPaths].sort();
  const allCarriers = [...values.registry.carriers.map((row) => row.path), ...values.registry.excludedDependentCarriers].sort();
  assert.deepEqual(allCarriers, admitted);
  assert.equal(new Set(allCarriers).size, 44);
  assert.equal(values.registry.carrierDenominator, 36);
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
  assert.equal(values.terminal.activationOutcome.doneCount, 78);
  assert.equal(values.terminal.activationOutcome.pendingCount, 18);
  for (const value of Object.values(values)) {
    if (value.sourcePlanRoles) assert.deepEqual(value.sourcePlanRoles, roles);
    if (Object.hasOwn(value, 'programDone')) assert.equal(value.programDone, false);
  }
  return true;
}

test('WP607 carrier set replays exact admission graph increment and conditional terminal state', () => {
  const values = load();
  assert.equal(verify(values), true);
  const claim = buildClaimBinding(read('docs/OPS/R24/EVIDENCE/ES-R24-WP-607-WSE-CLAIMS-CLAIM-BINDINGS.json'));
  for (const binding of claim.claimBindings) assert.equal(h(bytes(binding.filePath)), binding.sha256, binding.filePath);
  for (const binding of claim.implementationArtifactDigests) assert.equal(h(bytes(binding.path)), binding.sha256, binding.path);
  assert.ok(claim.nonClaims.includes('PROGRAM_DONE_FALSE'));
  assert.deepEqual(HISTORICAL_INVENTORY_CLAIM_PINS_V9.at(-1), { stampId: 'ES-R24-WP-606-WSE-SERIES-MULTI-LAYER-CLAIM-BINDINGS', stampSha256: 'd3c3321b5b27a65c0d1c2db2802ffa72538ff03f047feb1f814d111a85a9dffd', evaluationSha: '59bebbddb498eb9fd93863a4f837074ebffa5a52', evaluationTree: '4cf71e146824db6464380e287b9dd49ba556addd', targetSha256: '8239910498d4a256b4a85edaa1dd05fd8d67d5174bb6a4cd9d83f4048f6b73cb' });
});

test('WP607 evidence stamps bind the executed nine-test TAP and 18 rejected negative cases', () => {
  const prefix = 'docs/OPS/R24/EVIDENCE/ES-R24-WP-607-WSE-CLAIMS-';
  for (const kind of ['MODEL', 'CONTRACT', 'INTEGRATION', 'MUTANTS']) {
    const evidence = read(prefix + kind + '.json');
    const raw = evidence.artifact.rawEvidence;
    const rawBytes = Buffer.from(raw.stdoutBase64, 'base64');
    assert.equal(rawBytes.length, raw.byteLength);
    assert.equal(h(rawBytes), raw.sha256);
    assert.match(rawBytes.toString(), /\n1\.\.9\n# tests 9\n# suites 0\n# pass 9\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n/u);
    assert.equal(raw.processExitCode, 0);
    assert.equal(raw.node, '22.12.0');
    for (const binding of evidence.artifact.implementationArtifacts) assert.equal(h(bytes(binding.path)), binding.sha256, binding.path);
  }
  assert.equal(read(prefix + 'MUTANTS.json').test.denominator, 18);
  assert.equal(read(prefix + 'MUTANTS.json').test.passed, 18);
});

test('WP607 hostile carrier mutants reject graph overclaim false release and missing protected state', () => {
  const mutations = [
    (value) => { value.before.entries.pop(); },
    (value) => { value.graph.states['WP-607_WSE_CLAIMS'] = 'DONE'; },
    (value) => { value.state.targetCounts.DONE = 79; },
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
