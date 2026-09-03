import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { buildClaimBinding } from '../../scripts/ops/r24/claim-binding.mjs';
import { canonicalDigest } from '../../scripts/ops/r24/canonical-json.mjs';

const C = 'docs/OPS/R24/CORRECTIVE/';
const h = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: null, maxBuffer: 32 * 1024 * 1024 });
const text = (...args) => git(...args).toString('utf8').trim();
const paths = {
  authority: C + 'WP603_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json',
  instance: C + 'WP603_MAIN_PRODUCT_STAGE_INSTANCE_V1.json',
  admission: C + 'WP603_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json',
  amendment: C + 'WP603_OWNER_SCOPE_AMENDMENT_V1.json',
  selection: C + 'WP603_MAIN_PRODUCT_SELECTION_RECEIPT_V1.json',
  before: C + 'WP603_PROTECTED_WIP_BEFORE_V1.json',
  predecessor: C + 'WP603_P03_TERMINAL_PREDECESSOR_V1.json',
  fixture: C + 'WP603_FIXTURE_MANIFEST_V1.json',
  graph: C + 'WP603_EFFECTIVE_GRAPH_BASELINE_V1.json',
  registry: C + 'WP603_CARRIER_REGISTRY_V1.json',
  acceptance: C + 'WP603_ACCEPTANCE_MATRIX_V1.json',
  state: C + 'WP603_EFFECTIVE_STATE_V1.json',
  stageRegistry: C + 'WP603_STAGE_REGISTRY_V1.json',
  lease: C + 'WP603_LEASE_RELEASE_V1.json',
  terminal: C + 'WP603_TERMINAL_RECEIPT_V1.json',
  supplement: C + 'WP603_TERMINAL_SUPPLEMENT_V1.json',
};
const issueSha = text('log', '--diff-filter=A', '--format=%H', '--max-count=1', '--', paths.terminal);
if (!issueSha) assert.equal(text('ls-files', '--', paths.terminal), '');
const bytes = (file) => issueSha ? git('show', `${issueSha}:${file}`) : fs.readFileSync(file);
const read = (file) => JSON.parse(bytes(file));
const roles = { externalSourcePlanDigest: '1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a', compiledProgramFileDigest: 'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a', rolesDistinct: true };
const counts = (states) => Object.fromEntries(['BLOCKED_TYPED', 'DONE', 'INELIGIBLE_OPTIONAL', 'PENDING'].map((state) => [state, Object.values(states).filter((value) => value === state).length]));

function load() {
  return Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, read(file)]));
}

function verify(values) {
  assert.equal(h(bytes(paths.authority)), '8476719bb1b3f2ac76f4a1efbe92124065608e1a4df32d415c4801273acdf7fd');
  assert.equal(h(bytes(paths.instance)), '4ccd7c44335c82d14027006284f7cb6134c51bb4a0d221d7c7236755bde7c5f4');
  assert.equal(h(bytes(paths.admission)), '9e908f725cff9b09f8662b898502522e131fe79c8c77653d8bc00d2918e156ed');
  assert.equal(values.admission.writeSetDigest, '8420377712deb9cec3598763f5ca1b657ee5357447b14509f4bb409063714264');
  assert.equal(values.instance.lease.fencingCounter, 85);
  assert.equal(values.instance.lease.status, 'ACTIVE');
  assert.equal(values.instance.lease.wip, 1);
  assert.equal(values.amendment.addedWritePath, 'src/derived/atlas/deriveAtlasContinuityLedgerSurface.mjs');
  assert.equal(values.amendment.ownerDecision.rawJsonlRecordSha256, '7d03855e17e204b5529d562937f3a0ad2b522210ae041472c77c36b934f3bd4e');
  const { snapshotSha256, ...payload } = values.before;
  assert.equal(h(Buffer.from(JSON.stringify(payload) + '\n')), snapshotSha256);
  assert.equal(values.before.completeDenominator, 269);
  assert.equal(values.before.entries.length, 269);
  assert.equal(values.before.dirtyDenominator, 10);
  assert.equal(values.predecessor.predecessorLeaseStatus, 'RELEASED');
  assert.equal(values.predecessor.predecessorWip, 0);
  assert.equal(values.fixture.fixtures.length, 9);
  assert.equal(values.graph.completeDenominator, 109);
  assert.equal(canonicalDigest(values.graph.states), values.graph.statesDigest);
  assert.deepEqual(counts(values.graph.states), { BLOCKED_TYPED: 3, DONE: 72, INELIGIBLE_OPTIONAL: 10, PENDING: 24 });
  assert.deepEqual(values.state.currentCounts, counts(values.graph.states));
  assert.deepEqual(values.state.targetStates, { ...values.graph.states, 'WP-603_WSE_STATE_EVIDENCE': 'DONE' });
  assert.deepEqual(values.state.targetCounts, { BLOCKED_TYPED: 3, DONE: 73, INELIGIBLE_OPTIONAL: 10, PENDING: 23 });
  const admitted = [...values.instance.operations.modifyPaths, ...values.instance.operations.createPaths].sort();
  const allCarriers = [...values.registry.carriers.map((row) => row.path), ...values.registry.excludedDependentCarriers].sort();
  assert.deepEqual(allCarriers, admitted);
  assert.equal(new Set(allCarriers).size, 44);
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
  assert.equal(values.supplement.bindings.terminalReceiptDigest, h(bytes(paths.terminal)));
  assert.equal(values.lease.currentLease.status, 'ACTIVE');
  assert.equal(values.lease.targetLease.status, 'RELEASED');
  assert.equal(values.lease.targetLease.wip, 0);
  assert.equal(values.terminal.activationOutcome.doneCount, 73);
  assert.equal(values.terminal.activationOutcome.pendingCount, 23);
  for (const value of Object.values(values)) {
    if (value.sourcePlanRoles) assert.deepEqual(value.sourcePlanRoles, roles);
    if (Object.hasOwn(value, 'programDone')) assert.equal(value.programDone, false);
  }
  return true;
}

test('WP603 carrier set replays exact admission, graph increment and conditional terminal state', () => {
  const values = load();
  assert.equal(verify(values), true);
  const claim = buildClaimBinding(read('docs/OPS/R24/EVIDENCE/ES-R24-WP-603-WSE-STATE-EVIDENCE-CLAIM-BINDINGS.json'));
  for (const binding of claim.claimBindings) assert.equal(h(bytes(binding.filePath)), binding.sha256, binding.filePath);
  for (const binding of claim.implementationArtifactDigests) assert.equal(h(bytes(binding.path)), binding.sha256, binding.path);
  assert.ok(claim.nonClaims.includes('PROGRAM_DONE_FALSE'));
});

test('WP603 evidence stamps bind the executed 11-test TAP and six killed source mutants', () => {
  const prefix = 'docs/OPS/R24/EVIDENCE/ES-R24-WP-603-WSE-STATE-EVIDENCE-';
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
  assert.equal(read(prefix + 'MUTANTS.json').test.denominator, 6);
  assert.equal(read(prefix + 'MUTANTS.json').test.passed, 6);
});

test('WP603 hostile carrier mutants reject graph overclaim, false release and missing protected state', () => {
  const mutations = [
    (value) => { value.before.entries.pop(); },
    (value) => { value.graph.states['WP-603_WSE_STATE_EVIDENCE'] = 'DONE'; },
    (value) => { value.state.targetCounts.DONE = 74; },
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
