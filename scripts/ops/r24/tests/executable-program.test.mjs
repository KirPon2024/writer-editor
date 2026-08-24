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
import { readJsonBounded, canonicalDigest } from '../canonical-json.mjs';
import { validateTransitionReplay } from '../plan-state.mjs';
import './owner-gate-decisions.test.mjs';

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
  assert.equal(state.schemaVersion, 'yalken.plan-state.r24.v2');
  assert.equal(state.replayBaseline.classification, 'ADOPTED_PRE_V2_UNREPLAYABLE_HISTORY');
  assert.equal(state.replayBaseline.unreplayableContourIds.includes('WP-102_OPERATION_PROTOCOL'), true);
  assert.equal(state.transitionHistory.length, 45);
  assert.deepEqual(
    state.transitionHistory.map((row) => [row.contourId, row.from, row.to]),
    [
      ['WP-103_REVISION_PRODUCT_ORDER', 'PENDING', 'ELIGIBLE'],
      ['WP-103_REVISION_PRODUCT_ORDER', 'ELIGIBLE', 'RUNNING'],
      ['WP-103_REVISION_PRODUCT_ORDER', 'RUNNING', 'DELIVERED'],
      ['WP-103_REVISION_PRODUCT_ORDER', 'DELIVERED', 'POSTMERGE_VERIFIED'],
      ['WP-103_REVISION_PRODUCT_ORDER', 'POSTMERGE_VERIFIED', 'DONE'],
      ['WP-104_BOUNDARY_FALSIFICATION', 'PENDING', 'ELIGIBLE'],
      ['WP-104_BOUNDARY_FALSIFICATION', 'ELIGIBLE', 'RUNNING'],
      ['WP-104_BOUNDARY_FALSIFICATION', 'RUNNING', 'DELIVERED'],
      ['WP-104_BOUNDARY_FALSIFICATION', 'DELIVERED', 'POSTMERGE_VERIFIED'],
      ['WP-104_BOUNDARY_FALSIFICATION', 'POSTMERGE_VERIFIED', 'DONE'],
      ['R2_STORAGE_BAKEOFF', 'PENDING', 'ELIGIBLE'],
      ['R2_STORAGE_BAKEOFF', 'ELIGIBLE', 'RUNNING'],
      ['R2_STORAGE_BAKEOFF', 'RUNNING', 'DELIVERED'],
      ['R2_STORAGE_BAKEOFF', 'DELIVERED', 'POSTMERGE_VERIFIED'],
      ['R2_STORAGE_BAKEOFF', 'POSTMERGE_VERIFIED', 'DONE'],
      ['R3_DURABLE_RECOVERY_LEDGER', 'PENDING', 'ELIGIBLE'],
      ['R3_DURABLE_RECOVERY_LEDGER', 'ELIGIBLE', 'RUNNING'],
      ['R3_DURABLE_RECOVERY_LEDGER', 'RUNNING', 'DELIVERED'],
      ['R3_DURABLE_RECOVERY_LEDGER', 'DELIVERED', 'POSTMERGE_VERIFIED'],
      ['R3_DURABLE_RECOVERY_LEDGER', 'POSTMERGE_VERIFIED', 'DONE'],
      ['R4_TRANSACTIONAL_INBOX_OUTBOX', 'PENDING', 'ELIGIBLE'],
      ['R4_TRANSACTIONAL_INBOX_OUTBOX', 'ELIGIBLE', 'RUNNING'],
      ['R4_TRANSACTIONAL_INBOX_OUTBOX', 'RUNNING', 'DELIVERED'],
      ['R4_TRANSACTIONAL_INBOX_OUTBOX', 'DELIVERED', 'POSTMERGE_VERIFIED'],
      ['R4_TRANSACTIONAL_INBOX_OUTBOX', 'POSTMERGE_VERIFIED', 'DONE'],
      ['R5_LIFECYCLE_EXTERNAL_CONFLICT', 'PENDING', 'ELIGIBLE'],
      ['R5_LIFECYCLE_EXTERNAL_CONFLICT', 'ELIGIBLE', 'RUNNING'],
      ['R5_LIFECYCLE_EXTERNAL_CONFLICT', 'RUNNING', 'DELIVERED'],
      ['R5_LIFECYCLE_EXTERNAL_CONFLICT', 'DELIVERED', 'POSTMERGE_VERIFIED'],
      ['R5_LIFECYCLE_EXTERNAL_CONFLICT', 'POSTMERGE_VERIFIED', 'DONE'],
      ['R6_MIGRATION_HISTORY_BACKUP_GC', 'PENDING', 'ELIGIBLE'],
      ['R6_MIGRATION_HISTORY_BACKUP_GC', 'ELIGIBLE', 'RUNNING'],
      ['R6_MIGRATION_HISTORY_BACKUP_GC', 'RUNNING', 'DELIVERED'],
      ['R6_MIGRATION_HISTORY_BACKUP_GC', 'DELIVERED', 'POSTMERGE_VERIFIED'],
      ['R6_MIGRATION_HISTORY_BACKUP_GC', 'POSTMERGE_VERIFIED', 'DONE'],
      ['F0_WRITER_REFINEMENT_CONFORMANCE', 'PENDING', 'ELIGIBLE'],
      ['F0_WRITER_REFINEMENT_CONFORMANCE', 'ELIGIBLE', 'RUNNING'],
      ['F0_WRITER_REFINEMENT_CONFORMANCE', 'RUNNING', 'DELIVERED'],
      ['F0_WRITER_REFINEMENT_CONFORMANCE', 'DELIVERED', 'POSTMERGE_VERIFIED'],
      ['F0_WRITER_REFINEMENT_CONFORMANCE', 'POSTMERGE_VERIFIED', 'DONE'],
      ['V0_WRITER_CLAIM_COMPILER', 'PENDING', 'ELIGIBLE'],
      ['V0_WRITER_CLAIM_COMPILER', 'ELIGIBLE', 'RUNNING'],
      ['V0_WRITER_CLAIM_COMPILER', 'RUNNING', 'DELIVERED'],
      ['V0_WRITER_CLAIM_COMPILER', 'DELIVERED', 'POSTMERGE_VERIFIED'],
      ['V0_WRITER_CLAIM_COMPILER', 'POSTMERGE_VERIFIED', 'DONE'],
    ],
  );
  assert.deepEqual(
    validateTransitionReplay(state, PLAN_STATE_PATH),
    {
      verdict: 'PASS',
      baselineClassification: 'ADOPTED_PRE_V2_UNREPLAYABLE_HISTORY',
      baselineRevision: 94,
      replayedTransitions: 45,
      finalRevision: 157,
    },
  );
  assert.equal(Object.keys(state.contours).length, EXPECTED_NODE_COUNT);
  assert.equal(state.leases && Object.keys(state.leases).length, 0);
  const sourceReceipt = readR24Json('PLAN_STATE_SOURCE_RECEIPT_R24.json');
  const doneRows = Object.values(state.contours).filter((row) => row.state === 'DONE');
  const repoLocalDone = sourceReceipt.repoLocalPlanStateClosures?.doneContourCount || 0;
  assert.equal(doneRows.length, sourceReceipt.externalPlanState.doneContourCount + 1 + repoLocalDone);
  assert.equal(state.contours.SEC0_PATH_CAPABILITY.state, 'DONE');
  assert.equal(state.contours.SEC0_PATH_CAPABILITY.source, 'R24_SEC0_PATH_CAPABILITY_CLOSURE_V1');
  assert.equal(state.contours.ENT0_ENTITLEMENT_CONFORMANCE.state, 'DONE');
  assert.equal(state.contours.ENT0_ENTITLEMENT_CONFORMANCE.source, 'R24_ENT0_ENTITLEMENT_CONFORMANCE_CLOSURE_V1');
  assert.equal(state.contours.K1_AUTHORITY_DECOMPOSITION.state, 'DONE');
  assert.equal(state.contours.K1_AUTHORITY_DECOMPOSITION.source, 'R24_K1_AUTHORITY_DECOMPOSITION_CLOSURE_V1');
  assert.equal(state.contours.T1_ANCHOR_LINEAGE.state, 'DONE');
  assert.equal(state.contours.T1_ANCHOR_LINEAGE.source, 'R24_T1_ANCHOR_LINEAGE_CLOSURE_V1');
  assert.equal(state.contours.A0_ATLAS_INCREMENTAL_EQUIVALENCE.state, 'DONE');
  assert.equal(state.contours.A0_ATLAS_INCREMENTAL_EQUIVALENCE.source, 'R24_A0_ATLAS_INCREMENTAL_EQUIVALENCE_CLOSURE_V1');
  assert.equal(state.contours.PK0_PACKAGE_CONTENT_TRUST.state, 'DONE');
  assert.equal(state.contours.PK0_PACKAGE_CONTENT_TRUST.source, 'R24_PK0_PACKAGE_CONTENT_TRUST_CLOSURE_V1');
  assert.equal(state.contours['WP-100_GENERATION_ADMISSION'].state, 'DONE');
  assert.equal(state.contours['WP-100_GENERATION_ADMISSION'].source, 'R24_WP100_GENERATION_ADMISSION_CLOSURE_V1');
  assert.equal(state.contours['WP-101_IPC_ADMISSION'].state, 'DONE');
  assert.equal(state.contours['WP-101_IPC_ADMISSION'].source, 'R24_WP101_IPC_ADMISSION_CLOSURE_V1');
  assert.equal(state.contours['WP-102_OPERATION_PROTOCOL'].state, 'DONE');
  assert.equal(state.contours['WP-102_OPERATION_PROTOCOL'].source, 'R24_WP102_OPERATION_PROTOCOL_CLOSURE_V1');
  assert.equal(state.contours['WP-103_REVISION_PRODUCT_ORDER'].state, 'DONE');
  assert.equal(state.contours['WP-103_REVISION_PRODUCT_ORDER'].previousState, 'POSTMERGE_VERIFIED');
  assert.equal(state.contours['WP-103_REVISION_PRODUCT_ORDER'].headSha, '7400ef0074d9533e4988e6f06f856e44574fba23');
  assert.equal(state.contours['WP-104_BOUNDARY_FALSIFICATION'].state, 'DONE');
  assert.equal(state.contours['WP-104_BOUNDARY_FALSIFICATION'].previousState, 'POSTMERGE_VERIFIED');
  assert.equal(state.contours['WP-104_BOUNDARY_FALSIFICATION'].headSha, '727fe0f04a023c653f68a888b3d4644f24594940');
  assert.equal(state.contours.R2_STORAGE_BAKEOFF.state, 'DONE');
  assert.equal(state.contours.R2_STORAGE_BAKEOFF.previousState, 'POSTMERGE_VERIFIED');
  assert.equal(state.contours.R2_STORAGE_BAKEOFF.headSha, '5b505f27e0f51281f075b25257409e99755eae79');
  assert.equal(state.contours.R3_DURABLE_RECOVERY_LEDGER.state, 'DONE');
  assert.equal(state.contours.R3_DURABLE_RECOVERY_LEDGER.previousState, 'POSTMERGE_VERIFIED');
  assert.equal(state.contours.R3_DURABLE_RECOVERY_LEDGER.headSha, '0a3d035de277a6edc9287b86d17cb59a7e16c104');
  assert.equal(state.contours.R4_TRANSACTIONAL_INBOX_OUTBOX.state, 'DONE');
  assert.equal(state.contours.R4_TRANSACTIONAL_INBOX_OUTBOX.previousState, 'POSTMERGE_VERIFIED');
  assert.equal(state.contours.R4_TRANSACTIONAL_INBOX_OUTBOX.headSha, '7d295a9ccb3e2e2883d50c731666263aa31783de');
  assert.equal(state.contours.R5_LIFECYCLE_EXTERNAL_CONFLICT.state, 'DONE');
  assert.equal(state.contours.R5_LIFECYCLE_EXTERNAL_CONFLICT.previousState, 'POSTMERGE_VERIFIED');
  assert.equal(state.contours.R5_LIFECYCLE_EXTERNAL_CONFLICT.headSha, 'c32661613c3e0ceed9890dfc8ce7ab7ae1e4ee0e');
  assert.equal(state.contours.R6_MIGRATION_HISTORY_BACKUP_GC.state, 'DONE');
  assert.equal(state.contours.R6_MIGRATION_HISTORY_BACKUP_GC.previousState, 'POSTMERGE_VERIFIED');
  assert.equal(state.contours.R6_MIGRATION_HISTORY_BACKUP_GC.headSha, 'ee08668b33cc675f9666ba28cb58ee132e9a973c');
  assert.equal(state.contours.F0_WRITER_REFINEMENT_CONFORMANCE.state, 'DONE');
  assert.equal(state.contours.F0_WRITER_REFINEMENT_CONFORMANCE.previousState, 'POSTMERGE_VERIFIED');
  assert.equal(state.contours.F0_WRITER_REFINEMENT_CONFORMANCE.headSha, '95ba2dfa30777229ce0ed7a803df7cc3d9024e1e');
  assert.equal(state.contours.V0_WRITER_CLAIM_COMPILER.state, 'DONE');
  assert.equal(state.contours.V0_WRITER_CLAIM_COMPILER.previousState, 'POSTMERGE_VERIFIED');
  assert.equal(state.contours.V0_WRITER_CLAIM_COMPILER.headSha, 'f68486bc2653d646ecd23f11cb388f231376f54b');
  assert.equal(repoLocalDone, 18);
  assert.deepEqual(
    sourceReceipt.repoLocalPlanStateClosures.closures.map((row) => row.id),
    ['SEC0_PATH_CAPABILITY', 'ENT0_ENTITLEMENT_CONFORMANCE', 'K1_AUTHORITY_DECOMPOSITION', 'T1_ANCHOR_LINEAGE', 'A0_ATLAS_INCREMENTAL_EQUIVALENCE', 'PK0_PACKAGE_CONTENT_TRUST', 'WP-100_GENERATION_ADMISSION', 'WP-101_IPC_ADMISSION', 'WP-102_OPERATION_PROTOCOL', 'WP-103_REVISION_PRODUCT_ORDER', 'WP-104_BOUNDARY_FALSIFICATION', 'R2_STORAGE_BAKEOFF', 'R3_DURABLE_RECOVERY_LEDGER', 'R4_TRANSACTIONAL_INBOX_OUTBOX', 'R5_LIFECYCLE_EXTERNAL_CONFLICT', 'R6_MIGRATION_HISTORY_BACKUP_GC', 'F0_WRITER_REFINEMENT_CONFORMANCE', 'V0_WRITER_CLAIM_COMPILER'],
  );
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
  assert.equal(receipt.stateRevision, planState.revision);
  assert.equal(receipt.fencingCounter, planState.fencingCounter);
  assert.equal(receipt.stateDigest, canonicalDigest(planState));
  assert.equal(receipt.policyEpoch, 0);
  assert.match(receipt.policyDigest, /^[0-9a-f]{64}$/);
  assert.match(receipt.schedulerGraphDigest, /^[0-9a-f]{64}$/);
  assert.match(receipt.identityRoles.implementationSourceSha, /^[0-9a-f]{40}$/);
  assert.match(receipt.identityRoles.evaluationHeadSha, /^[0-9a-f]{40}$/);
  assert.match(receipt.identityRoles.evaluationTreeSha, /^[0-9a-f]{40}$/);
  assert.equal(receipt.identityRoles.prHeadSha, null);
  assert.equal(receipt.identityRoles.mergeSha, null);
  assert.equal(receipt.identityRoles.postmergeSha, null);
  assert.equal(receipt.sourceOfTruthPath, 'docs/OPS/R24/EXECUTABLE_PROGRAM_R2_4.json');
  assert.equal(receipt.selectedKind, 'NODE');
  assert.equal(receipt.selectedId, 'V1_ATLAS_CLAIM_COMPILER');
  assert.equal(receipt.verdict, 'SELECTED');
  assert.deepEqual(receipt.reasons, ['SUPERVISED_HANDOFF_ONLY_CANDIDATE']);
  assert.equal(nodeIds.has(receipt.selectedId), true);
  assert.equal(receipt.readySet.every((id) => nodeIds.has(id)), true);
  assert.deepEqual(receipt.readySet, ['V1_ATLAS_CLAIM_COMPILER', 'WP-200_DURABLE_SAVE']);
});

test('scheduler refuses a plan state not committed at the evaluation head', () => {
  const planState = readJsonBounded(PLAN_STATE_PATH);
  const stale = clone(planState);
  stale.revision += 1;
  assert.throws(
    () => buildSelectionReceiptOnFullGraph({
      now: '2026-08-22T23:22:16Z',
      planState: stale,
    }),
    (e) => e.code === 'E_R24_SELECTION_STATE_NOT_AT_EVALUATION_HEAD',
  );
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
