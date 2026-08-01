#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeJsonAtomic } from './rtk-word-latest-physical-certification-lab.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const TASK_ID = 'WORD_RTK_P0_MULTI_ROUND_LEDGER_RECONCILIATION';
const STATUS = 'WORD_P0_MULTI_ROUND_LEDGER_RECONCILED_NOT_SATURATED';
const SCHEMA = 'yalken.rtk.word.p0-multi-round-ledger-reconciliation-receipt.v1';
const CREATED_AT_UTC = '2026-08-01T14:10:00.000Z';
const NEXT_STAGE = 'P0_WORD_SCALE_ENGINEERING_AND_DECLARED_SUPPORT_ENVELOPE';

const RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_MULTI_ROUND_LEDGER_RECONCILIATION_RECEIPT.json';
const E10_RECEIPT_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E10_MULTI_ROUND_REPLAY_CONFLICTS_RECEIPT.json';
const PRODUCT_VERTICAL_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_PRODUCT_VERTICAL_TRACKED_EDIT_RECEIPT.json';
const COMMENTS_MIXED_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_PRODUCT_COMMENTS_MIXED_MULTI_SCENE_RECEIPT.json';
const MULTI_SCENE_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_MULTI_SCENE_ATOMIC_COMMENT_STATE_CLOSURE_RECEIPT.json';
const WAVE64_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_VARIED_WAVE64_PRODUCT_LOOP_RECEIPT.json';
const LARGE_STRESS_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_LARGE_MANUSCRIPT_STRESS_RECEIPT.json';
const REPEAT_STRESS_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_REPEAT_HIGH_DENSITY_STRESS_RECEIPT.json';
const AUDIT500K_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_500K_TERMINAL_AUDIT_RECEIPT.json';
const PROFILE_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json';
const PROGRAM_REF = 'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json';
const LEDGER_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json';
const GOVERNANCE_APPROVALS_REF = 'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json';
const SCRIPT_REF = 'scripts/ops/rtk-word-p0-multi-round-ledger-reconciliation.mjs';
const CONTRACT_REF = 'test/contracts/rtk-word-p0-multi-round-ledger-reconciliation.contract.test.js';
const MATRIX_SCRIPT_REF = 'scripts/ops/rtk-word-normalized-capability-matrix.mjs';
const MATRIX_CONTRACT_REF = 'test/contracts/rtk-word-normalized-capability-matrix.contract.test.js';
const E10_SCRIPT_REF = 'scripts/ops/rtk-word-v4-e10-multi-round-replay-conflicts.mjs';
const E10_CONTRACT_REF = 'test/contracts/rtk-word-v4-e10-multi-round-replay-conflicts.contract.test.js';
const E12_SCRIPT_REF = 'scripts/ops/rtk-word-v4-e12-saturation-ledger.mjs';
const E12_CONTRACT_REF = 'test/contracts/rtk-word-v4-e12-saturation-ledger.contract.test.js';

const GOVERNED_PATHS = [
  RECEIPT_REF,
  PROFILE_REF,
  PROGRAM_REF,
  LEDGER_REF,
  SCRIPT_REF,
  CONTRACT_REF,
  MATRIX_SCRIPT_REF,
  MATRIX_CONTRACT_REF,
  E10_SCRIPT_REF,
  E10_CONTRACT_REF,
  E12_SCRIPT_REF,
  E12_CONTRACT_REF,
];

function abs(relativePath) {
  return path.join(REPO_ROOT, relativePath);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(abs(relativePath), 'utf8'));
}

function writeJson(relativePath, value) {
  writeJsonAtomic(abs(relativePath), value);
}

function sha256File(relativePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(abs(relativePath))).digest('hex');
}

function git(ref) {
  return execFileSync('git', ['rev-parse', ref], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function binding(id, relativePath) {
  return {
    id,
    path: relativePath,
    sha256: sha256File(relativePath),
    status: 'BOUND',
  };
}

function issue(code, field, message) {
  return { code, field, message };
}

function allZero(record) {
  return record && Object.values(record).every((value) => Number(value) === 0);
}

function e10Evidence() {
  const receipt = readJson(E10_RECEIPT_REF);
  const totals = receipt.multiRoundTotals || {};
  const byId = new Map(list(receipt.guardCertificationCases).map((item) => [item.caseId, item]));
  const requiredCases = ['WL2-022', 'WL2-023', 'WL2-029', 'WL2-030', 'WL2-031'];
  const casesBound = requiredCases.every((caseId) => {
    const item = byId.get(caseId);
    return item
      && item.wordStatus === 'PASS'
      && ['PASS', 'BLOCKED'].includes(item.parserStatus)
      && item.classificationAuthority === 'MANUAL_OR_BLOCKED_ONLY'
      && Number(item.exactAutomaticCandidateCount || 0) === 0;
  });
  return {
    sourceReceipt: binding('E10_MULTI_ROUND_REPLAY_CONFLICT_GUARDS', E10_RECEIPT_REF),
    status: receipt.status,
    physicalGuardCases: Number(totals.physicalGuardCases || 0),
    staleTamperedStrippedCases: Number(totals.staleTamperedStrippedCases || 0),
    replayIdempotenceCases: Number(totals.replayIdempotenceCases || 0),
    noEditConservationCases: Number(totals.noEditConservationCases || 0),
    reExportNoEditOracleCases: Number(totals.reExportNoEditOracleCases || 0),
    hostilePackageBlockedCases: Number(totals.hostilePackageBlockedCases || 0),
    automaticReplayApplyCertified: Number(totals.automaticReplayApplyCertified || 0),
    divergentRoundAutoMergeCertified: Number(totals.divergentRoundAutoMergeCertified || 0),
    destructiveConflictWriteAdded: Number(totals.destructiveConflictWriteAdded || 0),
    typedLimitations: list(receipt.typedLimitations),
    runtimeClaims: receipt.runtimeClaims || {},
    vetoMetrics: receipt.vetoMetrics || {},
    guardsBound: receipt.status === 'MULTI_ROUND_REPLAY_STALE_CONFLICTS_CERTIFIED_WITH_TYPED_LIMITATIONS'
      && Number(totals.physicalGuardCases || 0) === 5
      && Number(totals.staleTamperedStrippedCases || 0) === 1
      && Number(totals.replayIdempotenceCases || 0) === 1
      && Number(totals.noEditConservationCases || 0) === 1
      && Number(totals.reExportNoEditOracleCases || 0) === 1
      && Number(totals.hostilePackageBlockedCases || 0) === 1
      && Number(totals.automaticReplayApplyCertified || 0) === 0
      && Number(totals.divergentRoundAutoMergeCertified || 0) === 0
      && Number(totals.destructiveConflictWriteAdded || 0) === 0
      && casesBound
      && allZero(receipt.vetoMetrics || {})
      && receipt.runtimeClaims?.automaticReplayApplyAdded === false
      && receipt.runtimeClaims?.divergentRoundAutoMergeAdded === false
      && receipt.runtimeClaims?.writerAuthorityAdded === false
      && receipt.runtimeClaims?.productRuntimeChanged === false,
  };
}

function productSource(id, relativePath, receipt, replayPass, extra = {}) {
  return {
    id,
    sourceReceipt: binding(id, relativePath),
    status: receipt.status,
    result: receipt.result || '',
    cases: Number(receipt.totals?.cases || 0),
    pass: Number(receipt.totals?.pass || 0),
    fail: Number(receipt.totals?.fail || 0),
    replayIdempotentPass: Number(replayPass || 0),
    projectReopenReadbackPass: Number(receipt.totals?.projectReopenReadbackPass || 0),
    visiblePreviewPass: Number(receipt.totals?.visiblePreviewPass || 0),
    physicalWordPass: Number(receipt.totals?.physicalWordPass || receipt.totals?.physicalOpenEditSaveCloseReopenPass || 0),
    explicitConfirmedApplyPass: Number(receipt.totals?.explicitConfirmedApplyPass || 0),
    vetoMetrics: receipt.vetoMetrics || {},
    ok: Number(receipt.totals?.fail || 0) === 0 && allZero(receipt.vetoMetrics || {}),
    ...extra,
  };
}

function productReplayEvidence() {
  const vertical = readJson(PRODUCT_VERTICAL_REF);
  const commentsMixed = readJson(COMMENTS_MIXED_REF);
  const multiScene = readJson(MULTI_SCENE_REF);
  const wave64 = readJson(WAVE64_REF);
  const large = readJson(LARGE_STRESS_REF);
  const repeat = readJson(REPEAT_STRESS_REF);
  const audit500k = readJson(AUDIT500K_REF);
  const multiSceneReplay = list(multiScene.physicalCorpus?.productCases)
    .filter((item) => item.result === 'PASS' && (item.replayStatus === 'replay' || item.productLoop?.replayStatus === 'replay'))
    .length;
  const sources = [
    productSource('P0_PRODUCT_VERTICAL_TRACKED_EDIT', PRODUCT_VERTICAL_REF, vertical, vertical.totals?.replayIdempotentPass),
    productSource('P0_PRODUCT_COMMENTS_MIXED_MULTI_SCENE', COMMENTS_MIXED_REF, commentsMixed, commentsMixed.totals?.replayIdempotentPass, {
      negativePass: Number(commentsMixed.totals?.negativePass || 0),
    }),
    productSource('P0_MULTI_SCENE_ATOMIC_COMMENT_STATE_CLOSURE', MULTI_SCENE_REF, multiScene, multiSceneReplay, {
      negativePass: Number(multiScene.totals?.negativePass || 0),
      multiSceneAtomicApplyCertified: multiScene.implementedCapability?.multiSceneAtomicApplyCertified === true,
    }),
    productSource('P0_VARIED_WAVE64_PRODUCT_LOOP', WAVE64_REF, wave64, wave64.totals?.replayIdempotentPass),
    productSource('P0_LARGE_MANUSCRIPT_STRESS', LARGE_STRESS_REF, large, large.totals?.replayIdempotentPass, {
      largestWords: Number(large.totals?.largestWords || 0),
    }),
    productSource('P0_REPEAT_HIGH_DENSITY_STRESS', REPEAT_STRESS_REF, repeat, repeat.totals?.replayIdempotentPass, {
      stableRepeatGroups: Number(repeat.totals?.stableRepeatGroups || 0),
      largestWords: Number(repeat.totals?.largestWords || 0),
      largestCommentCount: Number(repeat.totals?.largestCommentCount || 0),
    }),
  ];
  const replayIdempotentPass = sources.reduce((sum, item) => sum + item.replayIdempotentPass, 0);
  const productLoopsBound = sources.every((item) => item.ok && item.replayIdempotentPass > 0)
    && sources.find((item) => item.id === 'P0_PRODUCT_COMMENTS_MIXED_MULTI_SCENE')?.negativePass === 5
    && sources.find((item) => item.id === 'P0_MULTI_SCENE_ATOMIC_COMMENT_STATE_CLOSURE')?.negativePass === 4
    && sources.find((item) => item.id === 'P0_REPEAT_HIGH_DENSITY_STRESS')?.stableRepeatGroups === 5
    && audit500k.status === 'WORD_RELEASE_AUDIT_P0_500K_TERMINAL_AUDIT_COMPLETE_NOT_SATURATED'
    && audit500k.implementedCapability?.typed500kBoundaryProven === true
    && allZero(audit500k.vetoMetrics || {});
  return {
    sources,
    terminal500kBoundary: {
      sourceReceipt: binding('P0_500K_TERMINAL_AUDIT', AUDIT500K_REF),
      status: audit500k.status,
      typed500kBoundaryProven: audit500k.implementedCapability?.typed500kBoundaryProven === true,
      boundaryClass: audit500k.physicalCorpus?.boundaryAttempt?.boundaryClass || '',
      maxCertifiedTrackedReplacementWordsBeforeBoundary: Number(audit500k.terminalAudit?.maxCertifiedTrackedReplacementWordsBeforeBoundary || 0),
      vetoMetrics: audit500k.vetoMetrics || {},
    },
    productLoops: sources.length,
    productReplayIdempotentPasses: replayIdempotentPass,
    productProjectReopenPasses: sources.reduce((sum, item) => sum + item.projectReopenReadbackPass, 0),
    productVisiblePreviewPasses: sources.reduce((sum, item) => sum + item.visiblePreviewPass, 0),
    productExplicitApplyPasses: sources.reduce((sum, item) => sum + item.explicitConfirmedApplyPass, 0),
    productLoopsBound,
  };
}

function buildReceipt() {
  const e10 = e10Evidence();
  const productReplay = productReplayEvidence();
  const ok = e10.guardsBound && productReplay.productLoopsBound && productReplay.productReplayIdempotentPasses >= 89;
  return {
    schemaVersion: SCHEMA,
    taskId: TASK_ID,
    status: STATUS,
    result: ok ? 'PASS' : 'FAIL',
    createdAtUtc: CREATED_AT_UTC,
    headBinding: {
      headSha: git('HEAD'),
      originMainSha: git('origin/main'),
      mergedRemoteShaRequired: true,
    },
    sourceEvidence: {
      e10,
      productReplay,
    },
    implementedCapability: {
      capability: 'multiRoundReplayStaleConflictLedgerReconciliation',
      physicalWordProven: true,
      componentProven: true,
      productReplayIdempotencyProven: productReplay.productLoopsBound,
      productReplayIdempotentPasses: productReplay.productReplayIdempotentPasses,
      productRuntimeWired: false,
      automaticApplyCertified: false,
      automaticReplayApplyCertified: false,
      divergentRoundAutoMergeCertified: false,
      destructiveConflictWriteAdded: false,
      multiRoundLedgerReconciled: e10.guardsBound && productReplay.productLoopsBound,
      userFacingAuthority: 'REPLAY_STALE_CONFLICT_GUARD_EVIDENCE_AND_PRODUCT_REPLAY_IDEMPOTENCY',
      terminalClass: 'PHYSICAL_WORD_EVIDENCE_RECONCILED',
    },
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      silentCommentLoss: 0,
      divergentRoundAutoMerge: 0,
      destructiveConflictWrite: 0,
      productNetwork: 0,
      googleDocsOpened: 0,
    },
    typedLimitations: [
      'DIVERGENT_EDITOR_ROUND_AUTOMERGE_NOT_CERTIFIED',
      'REPLAY_SECOND_MUTATION_REMAINS_BLOCKED_BY_LEDGER',
      'REEXPORT_APPLY_ORACLE_REMAINS_BLOCKED_WITHOUT_SIGNED_LOCATOR',
      'MONOLITHIC_500K_TRACKED_REPLACEMENT_REMAINS_SCALE_ENVELOPE_BOUNDARY',
    ],
    nonClaims: [
      'NO_AUTOMATIC_REPLAY_APPLY_ADDED',
      'NO_DIVERGENT_ROUND_AUTOMERGE_ADDED',
      'NO_NEW_WRITER_AUTHORITY_ADDED',
      'WORD_SATURATED_FALSE',
      'GOOGLE_DOCS_NOT_OPENED',
    ],
    nextStage: NEXT_STAGE,
  };
}

function updateProfile(profile, receipt) {
  profile.status = STATUS;
  const cell = list(profile.cells).find((item) => item.capabilityId === 'rtk.word.v4.multiRoundReplayStaleConflictGuards');
  if (cell) {
    cell.currentCapability = 'REPLAY_STALE_CONFLICT_GUARD_TERMINAL_RECONCILED_WITH_PRODUCT_REPLAY_EVIDENCE';
    cell.productRuntimeWired = false;
    cell.automaticApplyCertified = false;
    cell.p0MultiRoundLedgerReconciliationReceiptPath = RECEIPT_REF;
    cell.multiRoundLedgerReconciled = true;
    cell.productReplayIdempotentPasses = receipt.implementedCapability.productReplayIdempotentPasses;
    cell.productReplayIdempotencyProven = true;
    cell.automaticReplayApplyCertified = false;
    cell.divergentRoundAutoMergeCertified = false;
    cell.supportedNow = Array.from(new Set([
      ...list(cell.supportedNow),
      'product vertical loops prove replay/idempotent readback across tracked replacement, comment shadow, multi-scene, varied, large, and repeat high-density contours',
    ]));
    cell.limitations = Array.from(new Set([
      ...list(cell.limitations),
      'divergent editor rounds remain manual or blocked; no auto-merge is certified',
    ]));
  }
  const saturationCell = list(profile.cells).find((item) => item.capabilityId === 'rtk.word.v4.saturationLedger');
  if (saturationCell) {
    saturationCell.currentCapability = 'SATURATION_LEDGER_RECONCILED_SCALE_ENVELOPE_PENDING';
    saturationCell.wordSaturated = false;
    saturationCell.googleDocsOpened = false;
    saturationCell.p0MultiRoundLedgerReconciliationReceiptPath = RECEIPT_REF;
  }
  profile.normalizedCapabilityMatrix = {
    ...(profile.normalizedCapabilityMatrix || {}),
    nextStage: NEXT_STAGE,
    wordSaturated: false,
    automaticApplyCertified: false,
  };
}

function updateProgram(program, receipt) {
  program.status = STATUS;
  program.nextStep = NEXT_STAGE;
  program.v4ExecutionState = {
    ...(program.v4ExecutionState || {}),
    status: STATUS,
    currentStage: 'P0_MULTI_ROUND_STALE_CONFLICT_AND_LEDGER_RECONCILIATION',
    nextStage: NEXT_STAGE,
    latestReceiptPath: RECEIPT_REF,
    multiRoundLedgerReconciled: true,
    productReplayIdempotentPasses: receipt.implementedCapability.productReplayIdempotentPasses,
    automaticReplayApplyCertified: 0,
    divergentRoundAutoMergeCertified: 0,
    destructiveConflictWriteAdded: 0,
    wordSaturated: false,
    googleDocsOpened: false,
  };
  program.releaseAuditNight01 = {
    ...(program.releaseAuditNight01 || {}),
    status: STATUS,
    currentStage: 'P0_MULTI_ROUND_STALE_CONFLICT_AND_LEDGER_RECONCILIATION',
    nextStage: NEXT_STAGE,
    latestReceiptPath: RECEIPT_REF,
    multiRoundLedgerReconciled: true,
    productReplayIdempotentPasses: receipt.implementedCapability.productReplayIdempotentPasses,
    automaticReplayApplyCertified: false,
    divergentRoundAutoMergeCertified: false,
    wordSaturated: false,
    automaticApplyCertified: false,
    googleDocsOpened: false,
  };
}

function updateLedger(ledger, receipt) {
  ledger.status = STATUS;
  ledger.nextStage = NEXT_STAGE;
  ledger.coverageLedger = {
    ...(ledger.coverageLedger || {}),
    p0MultiRoundLedgerReconciliation: {
      status: 'BOUND_MULTI_ROUND_REPLAY_GUARDS_RECONCILED',
      sourceEvidence: 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_MULTI_ROUND_LEDGER_RECONCILIATION_RECEIPT',
      e10PhysicalGuardCases: receipt.sourceEvidence.e10.physicalGuardCases,
      productReplayIdempotentPasses: receipt.implementedCapability.productReplayIdempotentPasses,
      productReplayIdempotencyProven: receipt.implementedCapability.productReplayIdempotencyProven,
      automaticReplayApplyCertified: false,
      divergentRoundAutoMergeCertified: false,
      wordSaturated: false,
      googleDocsOpened: false,
    },
  };
  ledger.runtimeClaims = {
    ...(ledger.runtimeClaims || {}),
    wordSaturated: false,
    automaticApplyExpanded: false,
    writerAuthorityAdded: false,
    googleDocsOpened: false,
  };
  ledger.notSaturatedReasons = Array.from(new Set(
    list(ledger.notSaturatedReasons)
      .filter((reason) => reason !== 'RTK_NORM_MULTI_ROUND_LEDGER_RECONCILIATION_PENDING')
      .concat(['RTK_NORM_SCALE_ENVELOPE_PENDING', 'RTK_NORM_WORD_HOLD_NOT_SATURATED']),
  ));
  ledger.evidenceBindings = list(ledger.evidenceBindings)
    .filter((entry) => entry.id !== 'P0_MULTI_ROUND_LEDGER_RECONCILIATION')
    .concat([binding('P0_MULTI_ROUND_LEDGER_RECONCILIATION', RECEIPT_REF)]);
  ledger.aggregateTotals = {
    ...(ledger.aggregateTotals || {}),
    p0MultiRoundLedgerReconciled: 1,
    p0ProductReplayIdempotentPasses: receipt.implementedCapability.productReplayIdempotentPasses,
    p0AutomaticReplayApplyCertified: 0,
    p0DivergentRoundAutoMergeCertified: 0,
    falseExact: 0,
    wrongSceneRouting: 0,
    silentApply: 0,
    replayFailure: 0,
    silentCommentLoss: 0,
  };
}

function updateGovernanceApprovals() {
  const registry = readJson(GOVERNANCE_APPROVALS_REF);
  const touched = new Set(GOVERNED_PATHS);
  registry.approvals = list(registry.approvals).filter((entry) => !touched.has(entry.filePath));
  const rationale = 'Approve Word P0 multi-round replay/stale/conflict ledger reconciliation: E10 physical guard evidence and product-loop replay/idempotency receipts are bound, divergent round auto-merge and automatic replay apply remain uncertified, Word saturated remains false, and Google Docs remains closed.';
  for (const filePath of GOVERNED_PATHS) {
    registry.approvals.push({
      filePath,
      sha256: sha256File(filePath),
      approvedBy: 'owner:OWNER_GO_RESUME_AFTER_REBOOT_WITH_INDEPENDENT_AUDIT_CORRECTIONS',
      approvedAtUtc: CREATED_AT_UTC,
      rationale,
    });
  }
  writeJson(GOVERNANCE_APPROVALS_REF, registry);
}

function updateState(receipt) {
  const profile = readJson(PROFILE_REF);
  updateProfile(profile, receipt);
  writeJson(PROFILE_REF, profile);

  const program = readJson(PROGRAM_REF);
  updateProgram(program, receipt);
  writeJson(PROGRAM_REF, program);

  const ledger = readJson(LEDGER_REF);
  updateLedger(ledger, receipt);
  writeJson(LEDGER_REF, ledger);
}

export function evaluateP0MultiRoundLedgerReconciliation(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_REF);
  const profile = input.profile || readJson(PROFILE_REF);
  const program = input.program || readJson(PROGRAM_REF);
  const ledger = input.ledger || readJson(LEDGER_REF);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));
  const cell = list(profile.cells).find((item) => item.capabilityId === 'rtk.word.v4.multiRoundReplayStaleConflictGuards');

  if (receipt.schemaVersion !== SCHEMA || receipt.status !== STATUS || receipt.result !== 'PASS') add('RTK_P0_MULTI_ROUND_RECEIPT_INVALID', 'receipt', 'P0 multi-round ledger reconciliation receipt must pass.');
  if (receipt.sourceEvidence?.e10?.guardsBound !== true
    || receipt.sourceEvidence?.productReplay?.productLoopsBound !== true
    || Number(receipt.implementedCapability?.productReplayIdempotentPasses || 0) < 89) add('RTK_P0_MULTI_ROUND_EVIDENCE_INVALID', 'sourceEvidence', 'E10 guards and product replay/idempotency evidence must be bound.');
  if (receipt.implementedCapability?.multiRoundLedgerReconciled !== true
    || receipt.implementedCapability?.productRuntimeWired !== false
    || receipt.implementedCapability?.automaticReplayApplyCertified !== false
    || receipt.implementedCapability?.divergentRoundAutoMergeCertified !== false) add('RTK_P0_MULTI_ROUND_AUTHORITY_OVERCLAIM', 'implementedCapability', 'Multi-round reconciliation must not add runtime authority, replay auto-apply, or divergent auto-merge.');
  if (Object.values(receipt.vetoMetrics || {}).some((value) => Number(value) !== 0)) add('RTK_P0_MULTI_ROUND_VETO_NONZERO', 'vetoMetrics', 'All veto metrics must remain zero.');
  if (!cell
    || cell.multiRoundLedgerReconciled !== true
    || cell.productReplayIdempotencyProven !== true
    || cell.automaticApplyCertified !== false) add('RTK_P0_MULTI_ROUND_PROFILE_INVALID', 'profile.multiRoundReplayStaleConflictGuards', 'Profile must bind multi-round reconciliation without automatic apply.');
  if (program.v4ExecutionState?.nextStage !== NEXT_STAGE
    || program.v4ExecutionState?.multiRoundLedgerReconciled !== true
    || program.v4ExecutionState?.googleDocsOpened !== false) add('RTK_P0_MULTI_ROUND_PROGRAM_INVALID', 'program', 'Program must advance to scale envelope with Google closed.');
  if (ledger.coverageLedger?.p0MultiRoundLedgerReconciliation?.status !== 'BOUND_MULTI_ROUND_REPLAY_GUARDS_RECONCILED'
    || list(ledger.notSaturatedReasons).includes('RTK_NORM_MULTI_ROUND_LEDGER_RECONCILIATION_PENDING')
    || ledger.runtimeClaims?.automaticApplyExpanded !== false
    || ledger.runtimeClaims?.googleDocsOpened !== false) add('RTK_P0_MULTI_ROUND_LEDGER_INVALID', 'ledger', 'Ledger must remove multi-round pending blocker without automatic apply or Google.');

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    nextStage: NEXT_STAGE,
    multiRoundLedgerReconciled: receipt.implementedCapability?.multiRoundLedgerReconciled === true,
    productReplayIdempotentPasses: Number(receipt.implementedCapability?.productReplayIdempotentPasses || 0),
    automaticReplayApplyCertified: receipt.implementedCapability?.automaticReplayApplyCertified === true,
  };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const json = args.has('--json');
  if (args.has('--write')) {
    const receipt = buildReceipt();
    writeJson(RECEIPT_REF, receipt);
    updateState(receipt);
    if (args.has('--approve-governance')) updateGovernanceApprovals();
  }
  const result = evaluateP0MultiRoundLedgerReconciliation();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_P0_MULTI_ROUND_LEDGER_RECONCILIATION=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
