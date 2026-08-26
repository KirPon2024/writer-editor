import test from 'node:test';
import assert from 'node:assert/strict';
import { computeReadySet, selectNext, DETERMINISTIC_ORDER } from '../scheduler.mjs';
import { canonicalDigest } from '../canonical-json.mjs';

const NOW = '2026-08-20T00:00:00Z';

function miniProgram() {
  return {
    guards: [{ id: 'G0_AUTHORITY_CLOSURE', state: 'CURRENT' }],
    nodes: [
      { id: 'ROOT', kind: 'FOUNDATION', profile: 'P1', dependsOn: [], state: 'DONE', ownerGate: null, evidenceContract: { requiredClasses: ['CONTRACT'] } },
      { id: 'A_LEAF', kind: 'WORK_PACKAGE', profile: 'P1', dependsOn: ['ROOT'], state: 'PENDING', ownerGate: null, evidenceContract: { requiredClasses: ['CONTRACT'] } },
      { id: 'B_GATE', kind: 'WORK_PACKAGE', profile: 'P1', dependsOn: ['ROOT'], state: 'PENDING', ownerGate: 'GATE_X', evidenceContract: { requiredClasses: ['CONTRACT'] } },
      { id: 'B_BLOCKED_GATE', kind: 'WORK_PACKAGE', profile: 'P1', dependsOn: ['ROOT'], state: 'BLOCKED_TYPED', ownerGate: 'GATE_X', evidenceContract: { requiredClasses: ['CONTRACT'] } },
      { id: 'B_BLOCKED_NO_GATE', kind: 'WORK_PACKAGE', profile: 'P1', dependsOn: ['ROOT'], state: 'BLOCKED_TYPED', ownerGate: null, evidenceContract: { requiredClasses: ['CONTRACT'] } },
      { id: 'B_DENY_GATE', kind: 'WORK_PACKAGE', profile: 'P1', dependsOn: ['ROOT'], state: 'PENDING', ownerGate: 'SAFE_PATH_OR_DENY', evidenceContract: { requiredClasses: ['CONTRACT'] } },
      { id: 'B_UNSAFE_DENY_GATE', kind: 'WORK_PACKAGE', profile: 'P1', dependsOn: ['ROOT'], state: 'PENDING', ownerGate: 'UNSAFE_GATE', evidenceContract: { requiredClasses: ['CONTRACT'] } },
      { id: 'C_PROFILE', kind: 'WORK_PACKAGE', profile: 'P2', dependsOn: ['ROOT'], state: 'PENDING', ownerGate: null, evidenceContract: { requiredClasses: ['CONTRACT'] } },
      { id: 'D_DEP', kind: 'WORK_PACKAGE', profile: 'P1', dependsOn: ['A_LEAF'], state: 'PENDING', ownerGate: null, evidenceContract: { requiredClasses: ['CONTRACT', 'UNIT'] } },
    ],
  };
}

const mission = {
  missionId: 'M1',
  missionDigest: 'd'.repeat(64),
  selectedProfiles: ['P1'],
  approved: true,
  autonomyEnabled: false,
};

function boundMission(program, contourStates = {}, overrides = {}) {
  return {
    ...mission,
    stateRevision: 94,
    fencingCounter: 20,
    stateDigest: 'a'.repeat(64),
    contourStatesDigest: canonicalDigest(contourStates),
    policyEpoch: 0,
    policyDigest: 'b'.repeat(64),
    graphNodeCount: program.nodes.length,
    graphDigest: 'c'.repeat(64),
    schedulerGraphDigest: canonicalDigest(program.nodes),
    sourceOfTruthPath: 'docs/OPS/R24/EXECUTABLE_PROGRAM_R2_4.json',
    identityRoles: {
      implementationSourceSha: 'd'.repeat(40),
      evaluationHeadSha: 'e'.repeat(40),
      evaluationTreeSha: 'f'.repeat(40),
      prHeadSha: null,
      mergeSha: null,
      postmergeSha: null,
    },
    ...overrides,
  };
}

test('ready set filters dependency, profile and gate conjuncts', () => {
  const ready = computeReadySet({ program: miniProgram(), contourStates: {}, mission });
  assert.deepEqual(ready.sort(), ['A_LEAF']);
  const withGate = computeReadySet({
    program: miniProgram(),
    contourStates: {},
    mission: { ...mission, ownerGateApprovals: { GATE_X: 'APPROVED' } },
  });
  assert.deepEqual(withGate.sort(), ['A_LEAF', 'B_BLOCKED_GATE', 'B_GATE']);
  const withSafeDeny = computeReadySet({
    program: miniProgram(),
    contourStates: {},
    mission: { ...mission, ownerGateApprovals: { SAFE_PATH_OR_DENY: 'DENIED', UNSAFE_GATE: 'DENIED' } },
  });
  assert.deepEqual(withSafeDeny.sort(), ['A_LEAF', 'B_DENY_GATE']);
});

test('BLOCKED_TYPED becomes ready only through its exact satisfied owner gate', () => {
  const program = miniProgram();
  assert.deepEqual(
    computeReadySet({ program, contourStates: {}, mission }).filter((id) => id.startsWith('B_BLOCKED')),
    [],
  );
  assert.deepEqual(
    computeReadySet({
      program,
      contourStates: {},
      mission: { ...mission, ownerGateApprovals: { GATE_X: 'APPROVED' } },
    }).filter((id) => id.startsWith('B_BLOCKED')),
    ['B_BLOCKED_GATE'],
  );
  assert.deepEqual(
    computeReadySet({
      program,
      contourStates: { ROOT: 'RUNNING' },
      mission: { ...mission, ownerGateApprovals: { GATE_X: 'APPROVED' } },
    }).filter((id) => id.startsWith('B_BLOCKED')),
    [],
  );
});

test('selection is deterministic and picks the only ready node', () => {
  const program = miniProgram();
  const bound = boundMission(program);
  const first = selectNext({ program, contourStates: {}, mission: bound, now: NOW });
  const second = selectNext({ program, contourStates: {}, mission: bound, now: NOW });
  assert.deepEqual(first, second);
  assert.equal(first.selectedKind, 'NODE');
  assert.equal(first.selectedId, 'A_LEAF');
  assert.equal(first.verdict, 'SELECTED');
  assert.deepEqual(first.deterministicOrder, [...DETERMINISTIC_ORDER]);
  assert.deepEqual(first.readySet, ['A_LEAF']);
});

test('stale state, graph, and identity bindings fail before selection', () => {
  const program = miniProgram();
  const bound = boundMission(program);
  assert.throws(
    () => selectNext({ program, contourStates: { A_LEAF: 'DONE' }, mission: bound, now: NOW }),
    (e) => e.code === 'E_SCHEDULER_STATE_BINDING_STALE',
  );
  assert.throws(
    () => selectNext({
      program,
      contourStates: {},
      mission: { ...bound, schedulerGraphDigest: '0'.repeat(64) },
      now: NOW,
    }),
    (e) => e.code === 'E_SCHEDULER_GRAPH_BINDING_STALE',
  );
  assert.throws(
    () => selectNext({
      program,
      contourStates: {},
      mission: { ...bound, identityRoles: { ...bound.identityRoles, evaluationHeadSha: null } },
      now: NOW,
    }),
    (e) => e.code === 'E_SCHEDULER_IDENTITY_SHAPE',
  );
});

test('stale G0 guard preempts everything with WAIT_FRESH_G0', () => {
  const program = miniProgram();
  program.guards[0].state = 'STALE_REBIND_REQUIRED';
  const receipt = selectNext({ program, contourStates: {}, mission: boundMission(program), now: NOW });
  assert.equal(receipt.selectedKind, 'GUARD');
  assert.equal(receipt.selectedId, 'G0_AUTHORITY_CLOSURE');
  assert.equal(receipt.verdict, 'WAIT_FRESH_G0');
});

test('unapproved mission yields WAIT_OWNER_DIGEST_APPROVAL and no node', () => {
  const program = miniProgram();
  const receipt = selectNext({ program, contourStates: {}, mission: boundMission(program, {}, { approved: false }), now: NOW });
  assert.equal(receipt.verdict, 'WAIT_OWNER_DIGEST_APPROVAL');
  assert.equal(receipt.selectedId, null);
});

test('unmet dependency blocks readiness until dependency is DONE', () => {
  const program = miniProgram();
  const ready = computeReadySet({ program, contourStates: { A_LEAF: 'RUNNING' }, mission });
  assert.deepEqual(ready, []);
  const readyAfter = computeReadySet({ program, contourStates: { A_LEAF: 'DONE' }, mission });
  assert.deepEqual(readyAfter, ['D_DEP']);
});

test('dependency closed set yields NO_ELIGIBLE_NODE when nothing pending', () => {
  const program = miniProgram();
  const states = { A_LEAF: 'DONE', B_GATE: 'CANCELLED', C_PROFILE: 'CANCELLED', D_DEP: 'DONE' };
  const receipt = selectNext({ program, contourStates: states, mission: boundMission(program, states), now: NOW });
  assert.equal(receipt.verdict, 'NO_ELIGIBLE_NODE');
});

test('cycle in dependencies fails closed', () => {
  const program = miniProgram();
  program.nodes.push({ id: 'X', kind: 'WORK_PACKAGE', profile: 'P1', dependsOn: ['Y'], state: 'PENDING', ownerGate: null });
  program.nodes.push({ id: 'Y', kind: 'WORK_PACKAGE', profile: 'P1', dependsOn: ['X'], state: 'PENDING', ownerGate: null });
  assert.throws(
    () => selectNext({ program, contourStates: {}, mission: boundMission(program), now: NOW }),
    (e) => e.code === 'E_SCHEDULER_GRAPH_CYCLE' || e.code === 'E_SCHEDULER_DANGLING_DEPENDENCY',
  );
});
