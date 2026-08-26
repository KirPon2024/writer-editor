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
  assert.equal(state.transitionHistory.length, 115);
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
      ['WP-200_DURABLE_SAVE', 'PENDING', 'ELIGIBLE'],
      ['WP-200_DURABLE_SAVE', 'ELIGIBLE', 'RUNNING'],
      ['WP-200_DURABLE_SAVE', 'RUNNING', 'DELIVERED'],
      ['WP-200_DURABLE_SAVE', 'DELIVERED', 'POSTMERGE_VERIFIED'],
      ['WP-200_DURABLE_SAVE', 'POSTMERGE_VERIFIED', 'DONE'],
      ['WP-201_PROJECT_TRANSACTION', 'PENDING', 'ELIGIBLE'],
      ['WP-201_PROJECT_TRANSACTION', 'ELIGIBLE', 'RUNNING'],
      ['WP-201_PROJECT_TRANSACTION', 'RUNNING', 'DELIVERED'],
      ['WP-201_PROJECT_TRANSACTION', 'DELIVERED', 'POSTMERGE_VERIFIED'],
      ['WP-201_PROJECT_TRANSACTION', 'POSTMERGE_VERIFIED', 'DONE'],
      ['V1_ATLAS_CLAIM_COMPILER', 'PENDING', 'ELIGIBLE'],
      ['V1_ATLAS_CLAIM_COMPILER', 'ELIGIBLE', 'RUNNING'],
      ['V1_ATLAS_CLAIM_COMPILER', 'RUNNING', 'DELIVERED'],
      ['V1_ATLAS_CLAIM_COMPILER', 'DELIVERED', 'POSTMERGE_VERIFIED'],
      ['V1_ATLAS_CLAIM_COMPILER', 'POSTMERGE_VERIFIED', 'DONE'],
      ['WP-202_LEGACY_STRANGLER', 'PENDING', 'ELIGIBLE'],
      ['WP-202_LEGACY_STRANGLER', 'ELIGIBLE', 'RUNNING'],
      ['WP-202_LEGACY_STRANGLER', 'RUNNING', 'DELIVERED'],
      ['WP-202_LEGACY_STRANGLER', 'DELIVERED', 'POSTMERGE_VERIFIED'],
      ['WP-202_LEGACY_STRANGLER', 'POSTMERGE_VERIFIED', 'DONE'],
      ['WP-203_STORAGE_SELECTION', 'PENDING', 'ELIGIBLE'],
      ['WP-203_STORAGE_SELECTION', 'ELIGIBLE', 'RUNNING'],
      ['WP-203_STORAGE_SELECTION', 'RUNNING', 'DELIVERED'],
      ['WP-203_STORAGE_SELECTION', 'DELIVERED', 'POSTMERGE_VERIFIED'],
      ['WP-203_STORAGE_SELECTION', 'POSTMERGE_VERIFIED', 'DONE'],
      ['WP-204_LIFECYCLE_RECOVERY', 'PENDING', 'ELIGIBLE'],
      ['WP-204_LIFECYCLE_RECOVERY', 'ELIGIBLE', 'RUNNING'],
      ['WP-204_LIFECYCLE_RECOVERY', 'RUNNING', 'DELIVERED'],
      ['WP-204_LIFECYCLE_RECOVERY', 'DELIVERED', 'POSTMERGE_VERIFIED'],
      ['WP-204_LIFECYCLE_RECOVERY', 'POSTMERGE_VERIFIED', 'DONE'],
      ['WP-205_PATH_AND_TEXT', 'PENDING', 'ELIGIBLE'],
      ['WP-205_PATH_AND_TEXT', 'ELIGIBLE', 'RUNNING'],
      ['WP-205_PATH_AND_TEXT', 'RUNNING', 'DELIVERED'],
      ['WP-205_PATH_AND_TEXT', 'DELIVERED', 'POSTMERGE_VERIFIED'],
      ['WP-205_PATH_AND_TEXT', 'POSTMERGE_VERIFIED', 'DONE'],
      ['WP-206_SAFE_ENTITLEMENT_BASELINE', 'PENDING', 'ELIGIBLE'],
      ['WP-206_SAFE_ENTITLEMENT_BASELINE', 'ELIGIBLE', 'RUNNING'],
      ['WP-206_SAFE_ENTITLEMENT_BASELINE', 'RUNNING', 'DELIVERED'],
      ['WP-206_SAFE_ENTITLEMENT_BASELINE', 'DELIVERED', 'POSTMERGE_VERIFIED'],
      ['WP-206_SAFE_ENTITLEMENT_BASELINE', 'POSTMERGE_VERIFIED', 'DONE'],
      ['WP-207_WRITER_REFINEMENT', 'PENDING', 'ELIGIBLE'],
      ['WP-207_WRITER_REFINEMENT', 'ELIGIBLE', 'RUNNING'],
      ['WP-207_WRITER_REFINEMENT', 'RUNNING', 'DELIVERED'],
      ['WP-207_WRITER_REFINEMENT', 'DELIVERED', 'POSTMERGE_VERIFIED'],
      ['WP-207_WRITER_REFINEMENT', 'POSTMERGE_VERIFIED', 'DONE'],
      ['WP-300_WRITER_HOME', 'PENDING', 'ELIGIBLE'],
      ['WP-300_WRITER_HOME', 'ELIGIBLE', 'RUNNING'],
      ['WP-300_WRITER_HOME', 'RUNNING', 'DELIVERED'],
      ['WP-300_WRITER_HOME', 'DELIVERED', 'POSTMERGE_VERIFIED'],
      ['WP-300_WRITER_HOME', 'POSTMERGE_VERIFIED', 'DONE'],
      ['WP-301_AUTHORING_SURFACES', 'PENDING', 'ELIGIBLE'],
      ['WP-301_AUTHORING_SURFACES', 'ELIGIBLE', 'RUNNING'],
      ['WP-301_AUTHORING_SURFACES', 'RUNNING', 'DELIVERED'],
      ['WP-301_AUTHORING_SURFACES', 'DELIVERED', 'POSTMERGE_VERIFIED'],
      ['WP-301_AUTHORING_SURFACES', 'POSTMERGE_VERIFIED', 'DONE'],
      ['WP-302_SESSION_CONTINUITY', 'PENDING', 'ELIGIBLE'],
      ['WP-302_SESSION_CONTINUITY', 'ELIGIBLE', 'RUNNING'],
      ['WP-302_SESSION_CONTINUITY', 'RUNNING', 'DELIVERED'],
      ['WP-302_SESSION_CONTINUITY', 'DELIVERED', 'POSTMERGE_VERIFIED'],
      ['WP-302_SESSION_CONTINUITY', 'POSTMERGE_VERIFIED', 'DONE'],
      ['WP-303_DESIGN_OS_CUSTOMIZATION', 'PENDING', 'ELIGIBLE'],
      ['WP-303_DESIGN_OS_CUSTOMIZATION', 'ELIGIBLE', 'RUNNING'],
      ['WP-303_DESIGN_OS_CUSTOMIZATION', 'RUNNING', 'DELIVERED'],
      ['WP-303_DESIGN_OS_CUSTOMIZATION', 'DELIVERED', 'POSTMERGE_VERIFIED'],
      ['WP-303_DESIGN_OS_CUSTOMIZATION', 'POSTMERGE_VERIFIED', 'DONE'],
      ['WP-304_A11Y_PERFORMANCE', 'PENDING', 'ELIGIBLE'],
      ['WP-304_A11Y_PERFORMANCE', 'ELIGIBLE', 'RUNNING'],
      ['WP-304_A11Y_PERFORMANCE', 'RUNNING', 'DELIVERED'],
      ['WP-304_A11Y_PERFORMANCE', 'DELIVERED', 'POSTMERGE_VERIFIED'],
      ['WP-304_A11Y_PERFORMANCE', 'POSTMERGE_VERIFIED', 'DONE'],
    ],
  );
  assert.deepEqual(
    validateTransitionReplay(state, PLAN_STATE_PATH),
    {
      verdict: 'PASS',
      baselineClassification: 'ADOPTED_PRE_V2_UNREPLAYABLE_HISTORY',
      baselineRevision: 94,
      replayedTransitions: 115,
      finalRevision: 255,
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
  assert.equal(state.contours['WP-200_DURABLE_SAVE'].state, 'DONE');
  assert.equal(state.contours['WP-200_DURABLE_SAVE'].previousState, 'POSTMERGE_VERIFIED');
  assert.equal(state.contours['WP-200_DURABLE_SAVE'].headSha, '8f69bfd0300157a7d6c8db5e7263ee7c46facc91');
  assert.equal(state.contours['WP-201_PROJECT_TRANSACTION'].state, 'DONE');
  assert.equal(state.contours['WP-201_PROJECT_TRANSACTION'].previousState, 'POSTMERGE_VERIFIED');
  assert.equal(state.contours['WP-201_PROJECT_TRANSACTION'].headSha, 'e47605be9669ff9d7d79e5d0aae061710f3c7732');
  assert.equal(state.contours.V1_ATLAS_CLAIM_COMPILER.state, 'DONE');
  assert.equal(state.contours.V1_ATLAS_CLAIM_COMPILER.previousState, 'POSTMERGE_VERIFIED');
  assert.equal(state.contours.V1_ATLAS_CLAIM_COMPILER.headSha, '8b1535018f203fff57a8fcfc0618115260205f3c');
  assert.equal(state.contours['WP-202_LEGACY_STRANGLER'].state, 'DONE');
  assert.equal(state.contours['WP-202_LEGACY_STRANGLER'].previousState, 'POSTMERGE_VERIFIED');
  assert.equal(state.contours['WP-202_LEGACY_STRANGLER'].headSha, '3a7664cd74fe2137e630f033283849fe864e4e0b');
  assert.equal(state.contours['WP-203_STORAGE_SELECTION'].state, 'DONE');
  assert.equal(state.contours['WP-203_STORAGE_SELECTION'].previousState, 'POSTMERGE_VERIFIED');
  assert.equal(state.contours['WP-203_STORAGE_SELECTION'].headSha, '65f1cb12e676b2c342fc8102974f6d2184751ba3');
  assert.equal(state.contours['WP-204_LIFECYCLE_RECOVERY'].state, 'DONE');
  assert.equal(state.contours['WP-204_LIFECYCLE_RECOVERY'].previousState, 'POSTMERGE_VERIFIED');
  assert.equal(state.contours['WP-204_LIFECYCLE_RECOVERY'].headSha, '1518c29951f40aacbf61441c7e19a353a70234c4');
  assert.equal(state.contours['WP-205_PATH_AND_TEXT'].state, 'DONE');
  assert.equal(state.contours['WP-205_PATH_AND_TEXT'].previousState, 'POSTMERGE_VERIFIED');
  assert.equal(state.contours['WP-205_PATH_AND_TEXT'].headSha, 'd84b1b00df08a8f0576ec4fc50a7a169f1fbb858');
  assert.equal(state.contours['WP-206_SAFE_ENTITLEMENT_BASELINE'].state, 'DONE');
  assert.equal(state.contours['WP-206_SAFE_ENTITLEMENT_BASELINE'].previousState, 'POSTMERGE_VERIFIED');
  assert.equal(state.contours['WP-206_SAFE_ENTITLEMENT_BASELINE'].headSha, '2042cec2fa12cf6793cb194141f1669e7dda5454');
  assert.equal(state.contours['WP-207_WRITER_REFINEMENT'].state, 'DONE');
  assert.equal(state.contours['WP-207_WRITER_REFINEMENT'].previousState, 'POSTMERGE_VERIFIED');
  assert.equal(state.contours['WP-207_WRITER_REFINEMENT'].headSha, 'e952207aa5ef91d954ca3ee3c5068b9fa7beed1f');
  assert.equal(state.contours['WP-300_WRITER_HOME'].state, 'DONE');
  assert.equal(state.contours['WP-300_WRITER_HOME'].previousState, 'POSTMERGE_VERIFIED');
  assert.equal(state.contours['WP-300_WRITER_HOME'].headSha, '226d8c065c3fe3f5a3b6c02312f7f514d1b79f84');
  assert.equal(state.contours['WP-301_AUTHORING_SURFACES'].state, 'DONE');
  assert.equal(state.contours['WP-301_AUTHORING_SURFACES'].previousState, 'POSTMERGE_VERIFIED');
  assert.equal(state.contours['WP-301_AUTHORING_SURFACES'].headSha, 'd714e8cfbea0eba211fe8145a038b7db62f69132');
  assert.equal(state.contours['WP-302_SESSION_CONTINUITY'].state, 'DONE');
  assert.equal(state.contours['WP-302_SESSION_CONTINUITY'].previousState, 'POSTMERGE_VERIFIED');
  assert.equal(state.contours['WP-302_SESSION_CONTINUITY'].headSha, '6299274226f27bd9cbdc96832ac88499983f5ee5');
  assert.equal(state.contours['WP-303_DESIGN_OS_CUSTOMIZATION'].state, 'DONE');
  assert.equal(state.contours['WP-303_DESIGN_OS_CUSTOMIZATION'].previousState, 'POSTMERGE_VERIFIED');
  assert.equal(state.contours['WP-303_DESIGN_OS_CUSTOMIZATION'].headSha, 'aacaf1f6c15cfcd89925c248b1e90105c64bde43');
  assert.equal(state.contours['WP-304_A11Y_PERFORMANCE'].state, 'DONE');
  assert.equal(state.contours['WP-304_A11Y_PERFORMANCE'].previousState, 'POSTMERGE_VERIFIED');
  assert.equal(state.contours['WP-304_A11Y_PERFORMANCE'].headSha, '275d8d96406fa0081a88c14c31c13f0d434a6429');
  assert.equal(repoLocalDone, 32);
  assert.deepEqual(
    sourceReceipt.repoLocalPlanStateClosures.closures.map((row) => row.id),
    ['SEC0_PATH_CAPABILITY', 'ENT0_ENTITLEMENT_CONFORMANCE', 'K1_AUTHORITY_DECOMPOSITION', 'T1_ANCHOR_LINEAGE', 'A0_ATLAS_INCREMENTAL_EQUIVALENCE', 'PK0_PACKAGE_CONTENT_TRUST', 'WP-100_GENERATION_ADMISSION', 'WP-101_IPC_ADMISSION', 'WP-102_OPERATION_PROTOCOL', 'WP-103_REVISION_PRODUCT_ORDER', 'WP-104_BOUNDARY_FALSIFICATION', 'R2_STORAGE_BAKEOFF', 'R3_DURABLE_RECOVERY_LEDGER', 'R4_TRANSACTIONAL_INBOX_OUTBOX', 'R5_LIFECYCLE_EXTERNAL_CONFLICT', 'R6_MIGRATION_HISTORY_BACKUP_GC', 'F0_WRITER_REFINEMENT_CONFORMANCE', 'V0_WRITER_CLAIM_COMPILER', 'WP-200_DURABLE_SAVE', 'WP-201_PROJECT_TRANSACTION', 'V1_ATLAS_CLAIM_COMPILER', 'WP-202_LEGACY_STRANGLER', 'WP-203_STORAGE_SELECTION', 'WP-204_LIFECYCLE_RECOVERY', 'WP-205_PATH_AND_TEXT', 'WP-206_SAFE_ENTITLEMENT_BASELINE', 'WP-207_WRITER_REFINEMENT', 'WP-300_WRITER_HOME', 'WP-301_AUTHORING_SURFACES', 'WP-302_SESSION_CONTINUITY', 'WP-303_DESIGN_OS_CUSTOMIZATION', 'WP-304_A11Y_PERFORMANCE'],
  );
  assert.equal(sourceReceipt.fullDenominator.nodeCount, EXPECTED_NODE_COUNT);
  assert.equal(sourceReceipt.externalPlanState.doneContourCount, 12);
  assert.equal(sourceReceipt.discoveredR24TestFiles.treatment, 'NOT_DELIVERY_STATE_WITHOUT_TERMINAL_RECEIPT');
  assert.match(sourceReceipt.nonClaims.join('\n'), /does not mark the full 109-node program DONE/);
});

test('scheduler selection receipt is bound to the real full graph rather than a fixture', () => {
  const planState = readJsonBounded(PLAN_STATE_PATH);
  const receipt = buildSelectionReceiptOnFullGraph({
    now: '2026-08-25T18:24:00Z',
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
  assert.equal(receipt.selectedId, 'WP-305_MINIMUM_INTERCHANGE');
  assert.equal(receipt.verdict, 'SELECTED');
  assert.deepEqual(receipt.reasons, ['SUPERVISED_HANDOFF_ONLY_CANDIDATE']);
  assert.equal(receipt.selectedId === null || nodeIds.has(receipt.selectedId), true);
  assert.equal(receipt.readySet.every((id) => nodeIds.has(id)), true);
  assert.deepEqual(receipt.readySet, ["WP-305_MINIMUM_INTERCHANGE"]);
});

test('scheduler refuses a plan state not committed at the evaluation head', () => {
  const planState = readJsonBounded(PLAN_STATE_PATH);
  const stale = clone(planState);
  stale.revision += 1;
  assert.throws(
    () => buildSelectionReceiptOnFullGraph({
      now: '2026-08-25T18:24:00Z',
      planState: stale,
    }),
    (e) => e.code === 'E_R24_SELECTION_STATE_NOT_AT_EVALUATION_HEAD',
  );
});

test('CLI validation receipt reports PASS on the committed SOT only', () => {
  const receipt = validateCommittedR24Sot({ now: '2026-08-25T18:24:00Z' });
  assert.equal(receipt.verdict, 'PASS');
  assert.equal(receipt.programDigest, EXPECTED_PROGRAM_DIGEST);
  assert.equal(receipt.missionDigest, EXPECTED_MISSION_DIGEST);
  assert.equal(receipt.nodeCount, EXPECTED_NODE_COUNT);
  assert.equal(receipt.legacyStageCount, 32);
  assert.equal(receipt.namedDependencyMismatchCount, 6);
  assert.equal(fs.existsSync(path.join(R24_DIR, 'A0_AUTHORITY_SOT_RECONCILIATION_RECEIPT_V1.json')), true);
});
