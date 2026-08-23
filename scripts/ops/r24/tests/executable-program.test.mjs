import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  EXPECTED_FOUNDATION_COUNT,
  EXPECTED_MISSION_DIGEST,
  EXPECTED_NODE_COUNT,
  EXPECTED_PROGRAM_DIGEST,
  EXPECTED_WORK_PACKAGE_COUNT,
  R24_DIR,
  assertExecutableProgramShape,
  assertMissionApproval,
  buildSelectionReceiptOnFullGraph,
  loadExecutableProgram,
  readR24Json,
  summarizeLegacyGraphDivergence,
  validateCommittedR24Sot,
} from '../executable-program.mjs';
import { readJsonBounded } from '../canonical-json.mjs';

const ROOT = path.resolve(R24_DIR, '..', '..', '..');
const PLAN_STATE_PATH = path.join(R24_DIR, 'PLAN_STATE_R24.json');
const LEGACY_PROGRAM_PATH = path.join(
  ROOT,
  'docs',
  'OPS',
  'EVIDENCE',
  'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1',
  'PROGRAM_DAG.json',
);

const clone = (value) => structuredClone(value);

test('committed executable R2.4 SOT has exact digest and 109-node denominator', () => {
  const { program, digest, summary, path: programPath } = loadExecutableProgram();
  assert.equal(programPath, 'docs/OPS/R24/EXECUTABLE_PROGRAM_R2_4.json');
  assert.equal(digest, EXPECTED_PROGRAM_DIGEST);
  assert.equal(program.programId, 'YALKEN-FINAL-EVOLUTIONARY-PROGRAM-R2.4');
  assert.equal(summary.nodeCount, EXPECTED_NODE_COUNT);
  assert.equal(summary.foundationCount, EXPECTED_FOUNDATION_COUNT);
  assert.equal(summary.workPackageCount, EXPECTED_WORK_PACKAGE_COUNT);
  assert.equal(program.guards.filter((guard) => guard.id === 'G0_AUTHORITY_CLOSURE').length, 1);
  assert.equal(program.nodes.some((node) => node.id === 'G0_AUTHORITY_CLOSURE'), false);
});

test('mission approval is a separate owner-bound receipt for the exact digest', () => {
  const approval = assertMissionApproval();
  assert.equal(approval.approved, true);
  assert.equal(approval.digest, EXPECTED_MISSION_DIGEST);
  assert.equal(approval.approvedBy, 'owner:RESUME_AFTER_AUDIT_CORRECTIVE_PRIORITY_OVERRIDE');
});

test('legacy 32-stage DAG is historical evidence and cannot validate as R2.4 master', () => {
  const legacy = readJsonBounded(LEGACY_PROGRAM_PATH);
  assert.throws(
    () => assertExecutableProgramShape(legacy),
    /E_R24_PROGRAM_SCHEMA/,
  );
  const divergence = summarizeLegacyGraphDivergence();
  assert.equal(divergence.legacyStageCount, 32);
  assert.equal(divergence.executableNodeCount, 109);
  assert.equal(divergence.legacyHasG0Stage, true);
  assert.equal(divergence.executableHasG0Node, false);
  assert.deepEqual(divergence.legacyNotExecutable, ['G0_AUTHORITY_CLOSURE']);
  assert.equal(divergence.missingInLegacy.length, 78);
  assert.equal(divergence.namedDependencyMismatches.length, 6);
});

test('validator fails closed on G0 as executable node', () => {
  const { program } = loadExecutableProgram();
  const mutant = clone(program);
  mutant.nodes[mutant.nodes.length - 1] = {
    ...mutant.nodes[mutant.nodes.length - 1],
    id: 'G0_AUTHORITY_CLOSURE',
  };
  assert.throws(
    () => assertExecutableProgramShape(mutant),
    /E_R24_G0_MUST_BE_GUARD_NOT_NODE/,
  );
});

test('validator fails closed on scalar E0-E6 evidence aliases', () => {
  const { program } = loadExecutableProgram();
  const mutant = clone(program);
  const node = mutant.nodes.find((candidate) => candidate.id === 'V1_ATLAS_CLAIM_COMPILER');
  node.evidenceContract.requiredClasses = ['E6_INDEPENDENT_EXACT_HEAD'];
  assert.throws(
    () => assertExecutableProgramShape(mutant),
    /E_R24_FORBIDDEN_LEGACY_EVIDENCE_ALIAS/,
  );
});

test('validator fails closed on audited dependency reconciliation drift', () => {
  const { program } = loadExecutableProgram();
  const mutant = clone(program);
  const node = mutant.nodes.find((candidate) => candidate.id === 'V1_ATLAS_CLAIM_COMPILER');
  node.dependsOn = ['A0_ATLAS_INCREMENTAL_EQUIVALENCE'];
  assert.throws(
    () => assertExecutableProgramShape(mutant),
    /E_R24_DEPENDENCY_RECONCILIATION_MISMATCH/,
  );
});

test('PlanState persists the full 109-node denominator without unreconciled DONE overclaim', () => {
  const state = readJsonBounded(PLAN_STATE_PATH);
  assert.equal(state.schemaVersion, 'yalken.plan-state.r24.v1');
  assert.equal(Object.keys(state.contours).length, EXPECTED_NODE_COUNT);
  assert.equal(state.leases && Object.keys(state.leases).length, 0);
  const sourceReceipt = readR24Json('PLAN_STATE_SOURCE_RECEIPT_R24.json');
  const doneRows = Object.values(state.contours).filter((row) => row.state === 'DONE');
  const repoLocalDone = sourceReceipt.repoLocalPlanStateClosures?.doneContourCount || 0;
  assert.equal(doneRows.length, sourceReceipt.externalPlanState.doneContourCount + 1 + repoLocalDone);
  assert.equal(state.contours.SEC0_PATH_CAPABILITY.state, 'DONE');
  assert.equal(state.contours.SEC0_PATH_CAPABILITY.source, 'R24_SEC0_PATH_CAPABILITY_CLOSURE_V1');
  assert.equal(repoLocalDone, 1);
  assert.equal(sourceReceipt.repoLocalPlanStateClosures.closures[0].id, 'SEC0_PATH_CAPABILITY');
  assert.equal(sourceReceipt.fullDenominator.nodeCount, EXPECTED_NODE_COUNT);
  assert.equal(sourceReceipt.externalPlanState.doneContourCount, 12);
  assert.equal(sourceReceipt.discoveredR24TestFiles.treatment, 'NOT_DELIVERY_STATE_WITHOUT_TERMINAL_RECEIPT');
  assert.match(sourceReceipt.nonClaims.join('\n'), /does not mark the full 109-node program DONE/);
});

test('scheduler selection receipt is bound to the real full graph rather than a fixture', () => {
  const planState = readJsonBounded(PLAN_STATE_PATH);
  const receipt = buildSelectionReceiptOnFullGraph({
    now: '2026-08-22T23:22:16Z',
    planState,
  });
  const { program } = loadExecutableProgram();
  const nodeIds = new Set(program.nodes.map((node) => node.id));
  assert.equal(receipt.schemaVersion, 'SelectionReceiptR2_4');
  assert.equal(receipt.graphNodeCount, EXPECTED_NODE_COUNT);
  assert.equal(receipt.graphDigest, EXPECTED_PROGRAM_DIGEST);
  assert.equal(receipt.sourceOfTruthPath, 'docs/OPS/R24/EXECUTABLE_PROGRAM_R2_4.json');
  assert.equal(receipt.selectedKind, 'NODE');
  assert.equal(nodeIds.has(receipt.selectedId), true);
  assert.equal(receipt.selectedId === 'G0_AUTHORITY_CLOSURE', false);
  assert.equal(receipt.readySet.every((id) => nodeIds.has(id)), true);
});

test('CLI validation receipt reports PASS on the committed SOT only', () => {
  const receipt = validateCommittedR24Sot({ now: '2026-08-22T23:22:16Z' });
  assert.equal(receipt.verdict, 'PASS');
  assert.equal(receipt.programDigest, EXPECTED_PROGRAM_DIGEST);
  assert.equal(receipt.missionDigest, EXPECTED_MISSION_DIGEST);
  assert.equal(receipt.nodeCount, EXPECTED_NODE_COUNT);
  assert.equal(receipt.legacyStageCount, 32);
  assert.equal(receipt.namedDependencyMismatchCount, 6);
  assert.equal(fs.existsSync(path.join(R24_DIR, 'A0_AUTHORITY_SOT_RECONCILIATION_RECEIPT_V1.json')), true);
});
