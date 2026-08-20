import test from 'node:test';
import assert from 'node:assert/strict';
import { computeReadySet, selectNext, DETERMINISTIC_ORDER } from '../scheduler.mjs';

const NOW = '2026-08-20T00:00:00Z';

function miniProgram() {
  return {
    guards: [{ id: 'G0_AUTHORITY_CLOSURE', state: 'CURRENT' }],
    nodes: [
      { id: 'ROOT', kind: 'FOUNDATION', profile: 'P1', dependsOn: [], state: 'DONE', ownerGate: null, evidenceContract: { requiredClasses: ['CONTRACT'] } },
      { id: 'A_LEAF', kind: 'WORK_PACKAGE', profile: 'P1', dependsOn: ['ROOT'], state: 'PENDING', ownerGate: null, evidenceContract: { requiredClasses: ['CONTRACT'] } },
      { id: 'B_GATE', kind: 'WORK_PACKAGE', profile: 'P1', dependsOn: ['ROOT'], state: 'PENDING', ownerGate: 'GATE_X', evidenceContract: { requiredClasses: ['CONTRACT'] } },
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

test('ready set filters dependency, profile and gate conjuncts', () => {
  const ready = computeReadySet({ program: miniProgram(), contourStates: {}, mission });
  assert.deepEqual(ready.sort(), ['A_LEAF']);
  const withGate = computeReadySet({
    program: miniProgram(),
    contourStates: {},
    mission: { ...mission, ownerGateApprovals: { GATE_X: 'APPROVED' } },
  });
  assert.deepEqual(withGate.sort(), ['A_LEAF', 'B_GATE']);
});

test('selection is deterministic and picks the only ready node', () => {
  const first = selectNext({ program: miniProgram(), contourStates: {}, mission, now: NOW });
  const second = selectNext({ program: miniProgram(), contourStates: {}, mission, now: NOW });
  assert.deepEqual(first, second);
  assert.equal(first.selectedKind, 'NODE');
  assert.equal(first.selectedId, 'A_LEAF');
  assert.equal(first.verdict, 'SELECTED');
  assert.deepEqual(first.deterministicOrder, [...DETERMINISTIC_ORDER]);
  assert.deepEqual(first.readySet, ['A_LEAF']);
});

test('stale G0 guard preempts everything with WAIT_FRESH_G0', () => {
  const program = miniProgram();
  program.guards[0].state = 'STALE_REBIND_REQUIRED';
  const receipt = selectNext({ program, contourStates: {}, mission, now: NOW });
  assert.equal(receipt.selectedKind, 'GUARD');
  assert.equal(receipt.selectedId, 'G0_AUTHORITY_CLOSURE');
  assert.equal(receipt.verdict, 'WAIT_FRESH_G0');
});

test('unapproved mission yields WAIT_OWNER_DIGEST_APPROVAL and no node', () => {
  const receipt = selectNext({ program: miniProgram(), contourStates: {}, mission: { ...mission, approved: false }, now: NOW });
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
  const receipt = selectNext({ program, contourStates: states, mission, now: NOW });
  assert.equal(receipt.verdict, 'NO_ELIGIBLE_NODE');
});

test('cycle in dependencies fails closed', () => {
  const program = miniProgram();
  program.nodes.push({ id: 'X', kind: 'WORK_PACKAGE', profile: 'P1', dependsOn: ['Y'], state: 'PENDING', ownerGate: null });
  program.nodes.push({ id: 'Y', kind: 'WORK_PACKAGE', profile: 'P1', dependsOn: ['X'], state: 'PENDING', ownerGate: null });
  assert.throws(
    () => selectNext({ program, contourStates: {}, mission, now: NOW }),
    (e) => e.code === 'E_SCHEDULER_GRAPH_CYCLE' || e.code === 'E_SCHEDULER_DANGLING_DEPENDENCY',
  );
});
