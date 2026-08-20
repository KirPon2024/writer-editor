#!/usr/bin/env node
// R2.4 E0 — deterministic ready-set scheduler.
// READY predicate (offline-computable conjuncts): state=PENDING, all
// dependencies DONE, node profile inside the mission-selected profiles,
// ownerGate null or APPROVED in the provided closed gate registry.
// Selection order is the sealed seven-key total order; numeric product
// scoring is forbidden; same inputs always produce the same receipt.
import { R24Error } from './canonical-json.mjs';

export const DETERMINISTIC_ORDER = Object.freeze([
  'MANDATORY_SAFETY_CORRECTNESS',
  'CUT_SET_UNBLOCK',
  'EVIDENCE_DEFICIT_REDUCTION',
  'DEPENDENCY_CRITICALITY',
  'BOUNDED_COST',
  'STABLE_TOPOLOGICAL_RANK',
  'STABLE_NODE_ID',
]);

const KIND_RANK = Object.freeze({ FOUNDATION: 0, WORK_PACKAGE: 1 });

function topoRanks(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const indegree = new Map(nodes.map((n) => [n.id, n.dependsOn.length]));
  const dependents = new Map(nodes.map((n) => [n.id, []]));
  for (const n of nodes) for (const dep of n.dependsOn) {
    if (!byId.has(dep)) throw new R24Error('E_SCHEDULER_DANGLING_DEPENDENCY', `${n.id}->${dep}`);
    dependents.get(dep).push(n.id);
  }
  const ready = nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id).sort();
  const ranks = new Map();
  let rank = 0;
  let processed = 0;
  while (ready.length > 0) {
    const id = ready.shift();
    ranks.set(id, rank);
    rank += 1;
    processed += 1;
    for (const next of dependents.get(id).slice().sort()) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) {
        ready.push(next);
        ready.sort();
      }
    }
  }
  if (processed !== nodes.length) throw new R24Error('E_SCHEDULER_GRAPH_CYCLE');
  return ranks;
}

function transitiveUnblockCounts(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const dependents = new Map(nodes.map((n) => [n.id, []]));
  for (const n of nodes) for (const dep of n.dependsOn) dependents.get(dep).push(n.id);
  const counts = new Map();
  for (const n of nodes) {
    const seen = new Set();
    const stack = [...dependents.get(n.id)];
    while (stack.length > 0) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      for (const next of dependents.get(id) || []) stack.push(next);
    }
    counts.set(n.id, seen.size);
  }
  return { counts, byId };
}

export function computeReadySet({ program, contourStates, mission }) {
  if (!program || !Array.isArray(program.nodes)) throw new R24Error('E_SCHEDULER_PROGRAM_REQUIRED');
  if (!mission || !Array.isArray(mission.selectedProfiles)) throw new R24Error('E_SCHEDULER_MISSION_PROFILES_REQUIRED');
  const profiles = new Set(mission.selectedProfiles);
  const gates = mission.ownerGateApprovals || {};
  const states = contourStates || {};
  return program.nodes.filter((node) => {
    const state = states[node.id] || node.state;
    if (state !== 'PENDING') return false;
    if (!profiles.has(node.profile)) return false;
    if (node.ownerGate !== null && node.ownerGate !== undefined && gates[node.ownerGate] !== 'APPROVED') return false;
    return node.dependsOn.every((dep) => {
      const depNode = program.nodes.find((x) => x.id === dep);
      const depState = states[dep] || (depNode && depNode.state);
      return depState === 'DONE';
    });
  }).map((node) => node.id);
}

export function selectNext({ program, contourStates, mission, now }) {
  if (typeof now !== 'string' || now.length === 0) throw new R24Error('E_CLOCK_REQUIRED');
  const reasons = [];
  const guard = (program.guards || []).find((g) => g.id === 'G0_AUTHORITY_CLOSURE');
  if (guard && guard.state !== 'CURRENT') {
    reasons.push('G0_AUTHORITY_EPOCH_STALE_REBIND_REQUIRED');
    if (!mission.approved) reasons.push('OWNER_APPROVAL_NOT_YET_ISSUED');
    reasons.push('AUTONOMY_RUNTIME_NOT_IMPLEMENTED_IN_PRODUCT_REPOSITORY');
    return buildReceipt({ program, mission, now, selectedKind: 'GUARD', selectedId: 'G0_AUTHORITY_CLOSURE', verdict: 'WAIT_FRESH_G0', reasons });
  }
  if (!mission.approved) {
    reasons.push('OWNER_APPROVAL_NOT_BOUND_TO_EXACT_MISSION_DIGEST');
    return buildReceipt({ program, mission, now, selectedKind: 'NONE', selectedId: null, verdict: 'WAIT_OWNER_DIGEST_APPROVAL', reasons });
  }
  const readyIds = computeReadySet({ program, contourStates, mission });
  if (readyIds.length === 0) {
    reasons.push('NO_DEPENDENCY_CLOSED_PENDING_NODE');
    return buildReceipt({ program, mission, now, selectedKind: 'NONE', selectedId: null, verdict: 'NO_ELIGIBLE_NODE', reasons });
  }
  const ranks = topoRanks(program.nodes);
  const { counts, byId } = transitiveUnblockCounts(program.nodes);
  const key = (id) => {
    const node = byId.get(id);
    return [
      KIND_RANK[node.kind] ?? 9,
      -counts.get(id),
      -(Array.isArray(node.evidenceContract?.requiredClasses) ? node.evidenceContract.requiredClasses.length : 0),
      -(program.nodes.filter((n) => n.dependsOn.includes(id)).length),
      Number.isInteger(node.costHint) ? node.costHint : 0,
      ranks.get(id),
      id,
    ];
  };
  const ordered = readyIds.slice().sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i += 1) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    return 0;
  });
  reasons.push('SUPERVISED_HANDOFF_ONLY_CANDIDATE');
  return buildReceipt({ program, mission, now, selectedKind: 'NODE', selectedId: ordered[0], verdict: 'SELECTED', reasons, readySet: readyIds.slice().sort() });
}

function buildReceipt({ program, mission, now, selectedKind, selectedId, verdict, reasons, readySet = [] }) {
  return {
    schemaVersion: 'SelectionReceiptR2_4',
    missionId: mission.missionId,
    missionDigest: mission.missionDigest,
    stateRevision: Number.isInteger(mission.stateRevision) ? mission.stateRevision : 0,
    policyEpoch: Number.isInteger(mission.policyEpoch) ? mission.policyEpoch : 0,
    mode: mission.autonomyEnabled === true ? 'AUTONOMOUS' : 'HANDOFF_ONLY',
    selectedKind,
    selectedId,
    verdict,
    readySet,
    deterministicOrder: [...DETERMINISTIC_ORDER],
    reasons: [...new Set(reasons)].sort(),
    generatedAt: now,
  };
}
