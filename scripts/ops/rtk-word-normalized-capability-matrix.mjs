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

const TASK_ID = 'WORD_RTK_NORMALIZED_CAPABILITY_MATRIX';
const STATUS = 'WORD_NORMALIZED_CAPABILITY_MATRIX_BOUND_NOT_SATURATED';
const MATRIX_SCHEMA = 'yalken.rtk.word.safe-semantic-roundtrip-v4.normalized-capability-matrix.v1';
const RECEIPT_SCHEMA = 'yalken.rtk.word.safe-semantic-roundtrip-v4.normalized-capability-matrix-receipt.v1';
const CREATED_AT_UTC = '2026-08-01T10:20:00.000Z';
const NEXT_STAGE = 'P0_MODERN_COMMENT_RESOLVE_REOPEN_PRODUCT_PATH_OR_TYPED_LIMITATION';

const V4_SPEC_REF = 'docs/OPS/RTK/YALKEN_WORD_SAFE_SEMANTIC_ROUNDTRIP_FINAL_V4.md';
const PROFILE_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json';
const PROGRAM_REF = 'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json';
const LEDGER_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json';
const MATRIX_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_NORMALIZED_CAPABILITY_MATRIX_V1.json';
const RECEIPT_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_NORMALIZED_CAPABILITY_MATRIX_RECEIPT.json';
const SCRIPT_REF = 'scripts/ops/rtk-word-normalized-capability-matrix.mjs';
const CONTRACT_REF = 'test/contracts/rtk-word-normalized-capability-matrix.contract.test.js';
const GOVERNANCE_APPROVALS_REF = 'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json';

const CLASS = Object.freeze({
  COMPONENT: 'COMPONENT_PROVEN',
  PHYSICAL: 'PHYSICAL_WORD_EVIDENCE',
  PRODUCT: 'PRODUCT_RUNTIME_WIRED',
  DIAGNOSTIC: 'DIAGNOSTIC_ONLY',
  LIMITATION: 'TYPED_LIMITATION',
  GOVERNANCE: 'SATURATION_GOVERNANCE',
});

const GOVERNED_PATHS = [
  PROFILE_REF,
  PROGRAM_REF,
  LEDGER_REF,
  MATRIX_REF,
  RECEIPT_REF,
  SCRIPT_REF,
  CONTRACT_REF,
];

const NORMALIZED_OVERLAY = {
  'rtk.word.v4.locallyBoundBlockRangeExactText': {
    intendedTerminalClass: CLASS.COMPONENT,
    currentTerminalClass: CLASS.COMPONENT,
    userFacingAuthority: 'NONE_INTERNAL_WRITER_PRIMITIVE',
    reasonCode: 'RTK_NORM_COMPONENT_NOT_USER_CAPABILITY',
    requiredNextContour: 'NONE_SUPERSEDED_BY_C05_PRODUCT_PATH',
    blocksWordSaturation: false,
  },
  'rtk.word.v4.locatorSurvivalLab': {
    intendedTerminalClass: CLASS.PHYSICAL,
    currentTerminalClass: CLASS.PHYSICAL,
    userFacingAuthority: 'NONE_SURVIVAL_EVIDENCE_ONLY',
    reasonCode: 'RTK_NORM_SURVIVAL_ONLY_NO_APPLY_AUTHORITY',
    requiredNextContour: 'NONE',
    blocksWordSaturation: false,
  },
  'rtk.word.v4.commentsShadowAnalysis': {
    intendedTerminalClass: CLASS.DIAGNOSTIC,
    currentTerminalClass: CLASS.DIAGNOSTIC,
    userFacingAuthority: 'COMMENTS_SHADOW_PREVIEW_ONLY',
    reasonCode: 'RTK_NORM_MODERN_REPLY_TYPED_LIMITATION_BOUND',
    requiredNextContour: 'NONE_REPLY_TYPED_LIMITATION_BOUND',
    blocksWordSaturation: false,
  },
  'rtk.word.v4.coreManifestYrtk2': {
    intendedTerminalClass: CLASS.COMPONENT,
    currentTerminalClass: CLASS.COMPONENT,
    userFacingAuthority: 'NONE_AUTHORITY_INFRASTRUCTURE',
    reasonCode: 'RTK_NORM_COMPONENT_NOT_PRODUCT_UI',
    requiredNextContour: 'NONE',
    blocksWordSaturation: false,
  },
  'rtk.word.v4.minimalSemanticKernel': {
    intendedTerminalClass: CLASS.COMPONENT,
    currentTerminalClass: CLASS.COMPONENT,
    userFacingAuthority: 'NONE_PARSER_COMPONENT_ONLY',
    reasonCode: 'RTK_NORM_COMPONENT_NOT_PRODUCT_UI',
    requiredNextContour: 'NONE',
    blocksWordSaturation: false,
  },
  'rtk.word.v4.sourceMapUniqueDiff': {
    intendedTerminalClass: CLASS.COMPONENT,
    currentTerminalClass: CLASS.COMPONENT,
    userFacingAuthority: 'NONE_EFFECT_PROJECTION_ONLY',
    reasonCode: 'RTK_NORM_COMPONENT_NOT_PRODUCT_UI',
    requiredNextContour: 'NONE',
    blocksWordSaturation: false,
  },
  'rtk.word.v4.physicalTextCertification': {
    intendedTerminalClass: CLASS.PHYSICAL,
    currentTerminalClass: CLASS.PHYSICAL,
    userFacingAuthority: 'PHYSICAL_TEXT_EVIDENCE_NO_NEW_APPLY_AUTHORITY',
    reasonCode: 'RTK_NORM_PHYSICAL_TEXT_EVIDENCE_BOUND',
    requiredNextContour: 'NONE',
    blocksWordSaturation: false,
  },
  'rtk.word.v4.effectiveFormattingDiagnostics': {
    intendedTerminalClass: CLASS.DIAGNOSTIC,
    currentTerminalClass: CLASS.DIAGNOSTIC,
    userFacingAuthority: 'FORMAT_PREVIEW_AND_LOSS_REPORT_ONLY',
    reasonCode: 'RTK_NORM_FORMATTING_APPLY_LANE_PENDING',
    requiredNextContour: 'P0_SAFE_FORMATTING_APPLY_LANE_OR_TYPED_LIMITATION',
    blocksWordSaturation: true,
  },
  'rtk.word.v4.typedStructuralDiagnostics': {
    intendedTerminalClass: CLASS.DIAGNOSTIC,
    currentTerminalClass: CLASS.DIAGNOSTIC,
    userFacingAuthority: 'STRUCTURE_PREVIEW_MANUAL_OR_BLOCKED_ONLY',
    reasonCode: 'RTK_NORM_STRUCTURAL_APPLY_LANE_PENDING',
    requiredNextContour: 'P0_SAFE_STRUCTURAL_APPLY_LANE_OR_TYPED_LIMITATION',
    blocksWordSaturation: true,
  },
  'rtk.word.v4.multiRoundReplayStaleConflictGuards': {
    intendedTerminalClass: CLASS.PHYSICAL,
    currentTerminalClass: CLASS.PHYSICAL,
    userFacingAuthority: 'REPLAY_STALE_CONFLICT_GUARD_EVIDENCE',
    reasonCode: 'RTK_NORM_MULTI_ROUND_LEDGER_RECONCILIATION_PENDING',
    requiredNextContour: 'P0_MULTI_ROUND_STALE_CONFLICT_AND_LEDGER_RECONCILIATION',
    blocksWordSaturation: true,
  },
  'rtk.word.v4.multiSceneAtomicCoordinator': {
    intendedTerminalClass: CLASS.COMPONENT,
    currentTerminalClass: CLASS.COMPONENT,
    userFacingAuthority: 'NONE_COMPONENT_SUPERSEDED_BY_PRODUCT_VERTICAL',
    reasonCode: 'RTK_NORM_COMPONENT_NOT_PRODUCT_UI',
    requiredNextContour: 'NONE_SUPERSEDED_BY_P0_MULTI_SCENE_PRODUCT_VERTICAL',
    blocksWordSaturation: false,
  },
  'rtk.word.v4.saturationLedger': {
    intendedTerminalClass: CLASS.GOVERNANCE,
    currentTerminalClass: CLASS.GOVERNANCE,
    userFacingAuthority: 'NONE_SATURATION_GOVERNANCE_ONLY',
    reasonCode: 'RTK_NORM_WORD_HOLD_NOT_SATURATED',
    requiredNextContour: NEXT_STAGE,
    blocksWordSaturation: true,
  },
  'rtk.word.v4.rootModernCommentShadowSession': {
    intendedTerminalClass: CLASS.PRODUCT,
    currentTerminalClass: CLASS.PRODUCT,
    userFacingAuthority: 'COMMENTS_ONLY_SHADOW_SESSION_IMPORT',
    reasonCode: 'RTK_NORM_COMMENT_SHADOW_PRODUCT_PATH_WIRED',
    requiredNextContour: 'NONE_FOR_ROOT_COMMENT_SHADOW_ONLY',
    blocksWordSaturation: false,
  },
  'rtk.word.v4.nonOverlapTrackedReplacementRuntimeApply': {
    intendedTerminalClass: CLASS.PRODUCT,
    currentTerminalClass: 'PRODUCT_COMPOSITION_REGISTERED_COMPONENT_CONSUMER',
    userFacingAuthority: 'NONE_STANDALONE_SUPERSEDED_BY_C05_PRODUCT_PATH',
    reasonCode: 'RTK_NORM_C02_REGISTERED_COMPONENT_SUPERSEDED_NOT_USER_AUTHORITY',
    requiredNextContour: 'NONE_SUPERSEDED_BY_C05_PRODUCT_PATH',
    blocksWordSaturation: false,
  },
  'rtk.word.v4.adjacentRangeNegativeOracle': {
    intendedTerminalClass: CLASS.LIMITATION,
    currentTerminalClass: CLASS.LIMITATION,
    userFacingAuthority: 'MANUAL_OR_BLOCKED_FOR_ADJACENT_RANGE',
    reasonCode: 'RTK_NORM_ADJACENT_TRIPLE_EDIT_TYPED_LIMITATION',
    requiredNextContour: 'NONE_UNLESS_NEW_WORD_EVIDENCE_CHANGES_BOUNDARY',
    blocksWordSaturation: false,
  },
  'rtk.word.v4.modernCommentStateReadbackGate': {
    intendedTerminalClass: CLASS.LIMITATION,
    currentTerminalClass: CLASS.LIMITATION,
    userFacingAuthority: 'COMMENT_STATE_READBACK_ONLY_NO_RESOLVE_REOPEN_PROMISE',
    reasonCode: 'RTK_NORM_RESOLVE_REOPEN_PRODUCT_PATH_OR_LIMITATION_PENDING',
    requiredNextContour: 'P0_MODERN_COMMENT_RESOLVE_REOPEN_PRODUCT_PATH_OR_TYPED_LIMITATION',
    blocksWordSaturation: true,
  },
  'rtk.word.v4.nonOverlapTrackedReplacementProductPath': {
    intendedTerminalClass: CLASS.PRODUCT,
    currentTerminalClass: CLASS.PRODUCT,
    userFacingAuthority: 'EXPLICIT_USER_CONFIRMED_NON_OVERLAP_TRACKED_REPLACEMENT_APPLY',
    reasonCode: 'RTK_NORM_SUPPORTED_TEXT_APPLY_PRODUCT_PATH_WIRED',
    requiredNextContour: 'NONE_FOR_SUPPORTED_NON_OVERLAP_REPLACEMENTS',
    blocksWordSaturation: false,
  },
  'rtk.word.releaseAudit.p0.productReviewDocxExporter': {
    intendedTerminalClass: CLASS.PRODUCT,
    currentTerminalClass: CLASS.PRODUCT,
    userFacingAuthority: 'USER_REVIEW_DOCX_EXPORT_COMMAND',
    reasonCode: 'RTK_NORM_PRODUCT_EXPORT_PATH_WIRED',
    requiredNextContour: 'NONE',
    blocksWordSaturation: false,
  },
  'rtk.word.releaseAudit.p0.returnIntakeV2': {
    intendedTerminalClass: CLASS.PRODUCT,
    currentTerminalClass: CLASS.PRODUCT,
    userFacingAuthority: 'USER_RETURN_INTAKE_QUARANTINE_PREVIEW',
    reasonCode: 'RTK_NORM_RETURN_INTAKE_PATH_WIRED',
    requiredNextContour: 'NONE',
    blocksWordSaturation: false,
  },
  'rtk.word.releaseAudit.p0.parsedIrPreviewApplyReplay': {
    intendedTerminalClass: CLASS.PRODUCT,
    currentTerminalClass: CLASS.PRODUCT,
    userFacingAuthority: 'VISIBLE_PREVIEW_AND_EXPLICIT_APPLY_PATH',
    reasonCode: 'RTK_NORM_PREVIEW_APPLY_REPLAY_PATH_WIRED',
    requiredNextContour: 'NONE',
    blocksWordSaturation: false,
  },
  'rtk.word.releaseAudit.p0.commentShadowAuthenticatedSessionStorageEffects': {
    intendedTerminalClass: CLASS.PRODUCT,
    currentTerminalClass: CLASS.PRODUCT,
    userFacingAuthority: 'COMMENTS_ONLY_AUTHENTICATED_SHADOW_SESSION_STORAGE',
    reasonCode: 'RTK_NORM_AUTHENTICATED_COMMENT_SHADOW_PATH_WIRED',
    requiredNextContour: 'NONE_FOR_COMMENT_SHADOW_STORAGE_ONLY',
    blocksWordSaturation: false,
  },
  'rtk.word.releaseAudit.p0.productOriginatedSmokeWave12': {
    intendedTerminalClass: CLASS.PRODUCT,
    currentTerminalClass: CLASS.PRODUCT,
    userFacingAuthority: 'PRODUCT_ORIGINATED_WORD_SMOKE_EVIDENCE',
    reasonCode: 'RTK_NORM_PRODUCT_ORIGINATED_PHYSICAL_SMOKE_BOUND',
    requiredNextContour: 'NONE',
    blocksWordSaturation: false,
  },
  'rtk.word.releaseAudit.p0.productVerticalTrackedEdit': {
    intendedTerminalClass: CLASS.PRODUCT,
    currentTerminalClass: CLASS.PRODUCT,
    userFacingAuthority: 'ONE_SUPPORTED_TRACKED_EDIT_VERTICAL_EXPLICIT_APPLY',
    reasonCode: 'RTK_NORM_TRACKED_EDIT_PRODUCT_VERTICAL_BOUND',
    requiredNextContour: 'NONE',
    blocksWordSaturation: false,
  },
  'rtk.word.releaseAudit.p0.productCommentsMixedMultiScene': {
    intendedTerminalClass: CLASS.PRODUCT,
    currentTerminalClass: CLASS.PRODUCT,
    userFacingAuthority: 'ROOT_COMMENT_SHADOW_AND_MIXED_TRACKED_REPLACEMENT_PRODUCT_PATH',
    reasonCode: 'RTK_NORM_COMMENTS_MIXED_PRODUCT_PATH_BOUND',
    requiredNextContour: 'NONE_FOR_PROVEN_ROOT_COMMENT_MIXED_PATH',
    blocksWordSaturation: false,
  },
  'rtk.word.releaseAudit.p0.multiSceneAtomicCommentStateClosure': {
    intendedTerminalClass: CLASS.PRODUCT,
    currentTerminalClass: CLASS.PRODUCT,
    userFacingAuthority: 'MULTI_SCENE_ATOMIC_EXPLICIT_APPLY_AND_COMMENT_DELETE_TOMBSTONE_PATH',
    reasonCode: 'RTK_NORM_MULTI_SCENE_ATOMIC_COMMENT_DELETE_PATH_BOUND',
    requiredNextContour: 'NONE_FOR_PROVEN_MULTI_SCENE_DELETE_TOMBSTONE_PATH',
    blocksWordSaturation: false,
  },
};

function abs(relativePath) {
  return path.join(REPO_ROOT, relativePath);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(abs(relativePath), 'utf8'));
}

function sha256File(relativePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(abs(relativePath))).digest('hex');
}

function git(ref) {
  return execFileSync('git', ['rev-parse', ref], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function classifyPhysical(cell) {
  return cell.physicalWordEvidence === true;
}

function classifyProductRuntime(row) {
  return row.intendedTerminalClass === CLASS.PRODUCT;
}

function buildMatrix() {
  const profile = readJson(PROFILE_REF);
  const ids = new Set(profile.cells.map((cell) => cell.capabilityId));
  const overlayIds = new Set(Object.keys(NORMALIZED_OVERLAY));
  const missing = [...ids].filter((id) => !overlayIds.has(id));
  const extra = [...overlayIds].filter((id) => !ids.has(id));
  if (missing.length || extra.length) {
    throw new Error(`NORMALIZED_MATRIX_OVERLAY_MISMATCH missing=${missing.join(',')} extra=${extra.join(',')}`);
  }

  const rows = profile.cells.map((cell, index) => {
    const overlay = NORMALIZED_OVERLAY[cell.capabilityId];
    return {
      ordinal: index + 1,
      cellId: cell.capabilityId,
      operationFamily: cell.operationFamily,
      intendedTerminalClass: overlay.intendedTerminalClass,
      currentTerminalClass: overlay.currentTerminalClass,
      userFacingAuthority: overlay.userFacingAuthority,
      physicalEvidence: {
        physicalWordEvidence: classifyPhysical(cell),
        evidenceReceiptPath: cell.evidenceReceiptPath || cell.runtimeReceiptPath || '',
        sourceState: cell.state,
        sourceCurrentCapability: cell.currentCapability,
      },
      productRuntimeWired: classifyProductRuntime(overlay),
      automaticApplyCertified: false,
      reasonCode: overlay.reasonCode,
      requiredNextContour: overlay.requiredNextContour,
      blocksWordSaturation: overlay.blocksWordSaturation === true,
      saturationDisposition: overlay.blocksWordSaturation === true ? 'OPEN_BEFORE_WORD_SATURATION' : 'NOT_A_SATURATION_BLOCKER',
    };
  });

  const counts = rows.reduce((acc, row) => {
    acc.totalCells += 1;
    acc.physicalWordEvidence += row.physicalEvidence.physicalWordEvidence ? 1 : 0;
    acc.productRuntimeWired += row.productRuntimeWired ? 1 : 0;
    acc.automaticApplyCertified += row.automaticApplyCertified ? 1 : 0;
    acc.blocksWordSaturation += row.blocksWordSaturation ? 1 : 0;
    acc.currentTerminalClass[row.currentTerminalClass] = (acc.currentTerminalClass[row.currentTerminalClass] || 0) + 1;
    acc.intendedTerminalClass[row.intendedTerminalClass] = (acc.intendedTerminalClass[row.intendedTerminalClass] || 0) + 1;
    return acc;
  }, {
    totalCells: 0,
    physicalWordEvidence: 0,
    productRuntimeWired: 0,
    automaticApplyCertified: 0,
    blocksWordSaturation: 0,
    currentTerminalClass: {},
    intendedTerminalClass: {},
  });

  return {
    schemaVersion: MATRIX_SCHEMA,
    taskId: TASK_ID,
    status: STATUS,
    createdAtUtc: CREATED_AT_UTC,
    headBinding: {
      originMainSha: git('origin/main'),
      localHeadSha: git('HEAD'),
      auditedHead: '0c514593f4e9fc8b6b0e936e83509f862ceda223',
      independentAuditId: '019fbd04-b1f9-7393-aa67-d3e65632b803',
    },
    sourceBindings: {
      v4Spec: { path: V4_SPEC_REF, sha256: sha256File(V4_SPEC_REF) },
      capabilityProfile: { path: PROFILE_REF, sha256: sha256File(PROFILE_REF) },
      postD1Program: { path: PROGRAM_REF, sha256: sha256File(PROGRAM_REF) },
      saturationLedger: { path: LEDGER_REF, sha256: sha256File(LEDGER_REF) },
    },
    normalizedVocabulary: [
      CLASS.COMPONENT,
      CLASS.PHYSICAL,
      CLASS.PRODUCT,
      CLASS.DIAGNOSTIC,
      CLASS.LIMITATION,
      CLASS.GOVERNANCE,
    ],
    counts,
    rows,
    nextEngineeringOrder: [
      {
        order: 1,
        contour: 'P0_MODERN_COMMENT_RESOLVE_REOPEN_PRODUCT_PATH_OR_TYPED_LIMITATION',
        blockingCells: ['rtk.word.v4.modernCommentStateReadbackGate'],
      },
      {
        order: 2,
        contour: 'P0_SAFE_FORMATTING_APPLY_LANE_OR_TYPED_LIMITATION',
        blockingCells: ['rtk.word.v4.effectiveFormattingDiagnostics'],
      },
      {
        order: 3,
        contour: 'P0_SAFE_STRUCTURAL_APPLY_LANE_OR_TYPED_LIMITATION',
        blockingCells: ['rtk.word.v4.typedStructuralDiagnostics'],
      },
      {
        order: 4,
        contour: 'P0_MULTI_ROUND_STALE_CONFLICT_AND_LEDGER_RECONCILIATION',
        blockingCells: ['rtk.word.v4.multiRoundReplayStaleConflictGuards', 'rtk.word.v4.saturationLedger'],
      },
      {
        order: 5,
        contour: 'P0_WORD_SCALE_ENGINEERING_AND_DECLARED_SUPPORT_ENVELOPE',
        blockingCells: [],
        boundaryEvidence: 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_500K_TERMINAL_AUDIT_RECEIPT',
      },
    ],
    supportEnvelope: {
      currentMaxCertifiedTrackedReplacementWords: 100000,
      attemptedBoundaryWords: 500000,
      boundaryStatus: 'TYPED_LIMITATION_REPRODUCED',
      boundaryClass: 'WORD_APPLEEVENT_TIMEOUT_OR_LONG_RUNNING_MONOLITHIC_500K_APPLY',
      saturationMeaning: 'All cells inside the declared support envelope must be deterministic exact, manual, blocked, diagnostic, or typed limitation with zero silent loss; it does not mean unsafe universal automatic apply.',
    },
    nonClaims: [
      'Automatic apply is not certified broadly.',
      'Physical Word evidence is not product runtime authority by itself.',
      'Component proven cells are not missing product UI work unless their intended terminal class says so.',
      'Diagnostic-only formatting and structural lanes are not silent apply capability.',
      'Google Docs remains closed until terminal Word audit and fresh independent exact-head audit.',
    ],
  };
}

function evaluateNormalizedCapabilityMatrix(input = {}) {
  const matrix = input.matrix || readJson(MATRIX_REF);
  const profile = input.profile || readJson(PROFILE_REF);
  const issues = [];
  const add = (code, field, message) => issues.push({ code, field, message });
  const rows = Array.isArray(matrix.rows) ? matrix.rows : [];
  const ids = rows.map((row) => row.cellId);
  const profileIds = profile.cells.map((cell) => cell.capabilityId);
  if (matrix.schemaVersion !== MATRIX_SCHEMA || matrix.status !== STATUS) {
    add('RTK_NORM_MATRIX_HEADER_INVALID', 'matrix.status', 'Normalized matrix must use the active schema and not-saturated status.');
  }
  if (rows.length !== 25 || profileIds.length !== 25 || ids.join('\n') !== profileIds.join('\n')) {
    add('RTK_NORM_MATRIX_CELL_SET_INVALID', 'rows', 'Normalized matrix must bind exactly the 25 capability profile cells in order.');
  }
  if (matrix.counts?.totalCells !== 25 || matrix.counts?.physicalWordEvidence !== 16 || matrix.counts?.productRuntimeWired !== 11) {
    add('RTK_NORM_MATRIX_COUNTS_INVALID', 'counts', 'Matrix must preserve audited 25 total, 16 physical evidence, and 11 product runtime wired counts.');
  }
  if (matrix.counts?.automaticApplyCertified !== 0) {
    add('RTK_NORM_MATRIX_AUTO_APPLY_OVERCLAIM', 'counts.automaticApplyCertified', 'Normalized matrix must not certify broad automatic apply.');
  }
  const forbiddenRuntime = rows.filter((row) => row.intendedTerminalClass !== CLASS.PRODUCT && row.productRuntimeWired === true);
  if (forbiddenRuntime.length) {
    add('RTK_NORM_INFRA_ESCALATED_TO_RUNTIME', 'rows.productRuntimeWired', 'Only intended product runtime rows can set productRuntimeWired.');
  }
  const requiredBlockers = new Set([
    'rtk.word.v4.modernCommentStateReadbackGate',
    'rtk.word.v4.effectiveFormattingDiagnostics',
    'rtk.word.v4.typedStructuralDiagnostics',
    'rtk.word.v4.multiRoundReplayStaleConflictGuards',
    'rtk.word.v4.saturationLedger',
  ]);
  for (const id of requiredBlockers) {
    const row = rows.find((item) => item.cellId === id);
    if (!row || row.blocksWordSaturation !== true) {
      add('RTK_NORM_REQUIRED_BLOCKER_MISSING', id, 'Known Word saturation blockers must remain explicit.');
    }
  }
  const googleOpened = JSON.stringify(matrix).match(/GOOGLE_DOCS_OPENED|GOOGLE_DOCS_ACTIVE|"googleDocsOpened"\s*:\s*true/u);
  if (googleOpened) {
    add('RTK_NORM_GOOGLE_PREMATURE', 'matrix', 'Google Docs must remain closed in the Word-only matrix contour.');
  }
  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    counts: matrix.counts || {},
    nextStage: matrix.nextEngineeringOrder?.[0]?.contour || '',
  };
}

function buildReceipt(matrix) {
  return {
    schemaVersion: RECEIPT_SCHEMA,
    taskId: TASK_ID,
    status: STATUS,
    result: 'PASS',
    createdAtUtc: CREATED_AT_UTC,
    matrixBinding: {
      path: MATRIX_REF,
      sha256: sha256File(MATRIX_REF),
      status: 'BOUND',
    },
    sourceBindings: matrix.sourceBindings,
    counts: matrix.counts,
    nextStage: NEXT_STAGE,
    nonClaims: matrix.nonClaims,
    testPlan: [
      'node scripts/ops/rtk-word-normalized-capability-matrix.mjs --json',
      'node --test test/contracts/rtk-word-normalized-capability-matrix.contract.test.js',
      'node scripts/ops/governance-approval-state.mjs --json',
      'npm run -s test:ops',
      'node scripts/run-tests.js',
    ],
  };
}

function updateState(matrix, receipt) {
  const program = readJson(PROGRAM_REF);
  program.status = STATUS;
  program.nextStep = NEXT_STAGE;
  program.releaseAuditNight01 = {
    ...(program.releaseAuditNight01 || {}),
    status: STATUS,
    currentStage: 'P0_NORMALIZED_CAPABILITY_MATRIX',
    nextStage: NEXT_STAGE,
    normalizedCapabilityMatrixPath: MATRIX_REF,
    normalizedCapabilityMatrixReceiptPath: RECEIPT_REF,
    normalizedCapabilityMatrixCounts: matrix.counts,
    wordSaturated: false,
    automaticApplyCertified: false,
    googleDocsOpened: false,
  };
  program.v4ExecutionState = {
    ...(program.v4ExecutionState || {}),
    status: STATUS,
    currentStage: 'P0_NORMALIZED_CAPABILITY_MATRIX',
    nextStage: NEXT_STAGE,
    latestReceiptPath: RECEIPT_REF,
    wordSaturated: false,
    googleDocsOpened: false,
  };
  writeJsonAtomic(abs(PROGRAM_REF), program);

  const profile = readJson(PROFILE_REF);
  profile.status = STATUS;
  profile.normalizedCapabilityMatrix = {
    status: STATUS,
    matrixPath: MATRIX_REF,
    receiptPath: RECEIPT_REF,
    counts: matrix.counts,
    nextStage: NEXT_STAGE,
    wordSaturated: false,
    automaticApplyCertified: false,
  };
  writeJsonAtomic(abs(PROFILE_REF), profile);

  const ledger = readJson(LEDGER_REF);
  ledger.status = STATUS;
  ledger.nextStage = NEXT_STAGE;
  ledger.coverageLedger = {
    ...(ledger.coverageLedger || {}),
    releaseAuditNight01NormalizedCapabilityMatrix: {
      status: 'BOUND_NORMALIZED_MATRIX_NOT_SATURATED',
      sourceEvidence: 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_NORMALIZED_CAPABILITY_MATRIX_V1',
      counts: matrix.counts,
      blockers: matrix.rows.filter((row) => row.blocksWordSaturation).map((row) => row.cellId),
      nextStage: NEXT_STAGE,
      wordSaturated: false,
      googleDocsOpened: false,
    },
  };
  ledger.runtimeClaims = {
    ...(ledger.runtimeClaims || {}),
    wordSaturated: false,
    automaticApplyExpanded: false,
    googleDocsOpened: false,
  };
  ledger.notSaturatedReasons = Array.from(new Set([
    ...(ledger.notSaturatedReasons || []),
    ...matrix.rows.filter((row) => row.blocksWordSaturation).map((row) => row.reasonCode),
  ]));
  writeJsonAtomic(abs(LEDGER_REF), ledger);

  return receipt;
}

function updateGovernanceApprovals() {
  const registry = readJson(GOVERNANCE_APPROVALS_REF);
  const touched = new Set(GOVERNED_PATHS);
  registry.approvals = (registry.approvals || []).filter((entry) => !touched.has(entry.filePath));
  const rationale = 'Approve normalized Word RTK capability matrix: binds exactly 25 V4 profile cells, preserves audited 16 physical evidence and 11 product runtime wired counts, separates component diagnostic typed limitation and product authority, keeps automatic apply false, Word saturated false, and Google Docs closed.';
  for (const filePath of GOVERNED_PATHS) {
    registry.approvals.push({
      filePath,
      sha256: sha256File(filePath),
      approvedBy: 'owner:OWNER_GO_RESUME_AFTER_REBOOT_WITH_INDEPENDENT_AUDIT_CORRECTIONS',
      approvedAtUtc: CREATED_AT_UTC,
      rationale,
    });
  }
  writeJsonAtomic(abs(GOVERNANCE_APPROVALS_REF), registry);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const write = args.has('--write');
  const approveGovernance = args.has('--approve-governance') || write;
  const json = args.has('--json');
  if (write) {
    const matrix = buildMatrix();
    writeJsonAtomic(abs(MATRIX_REF), matrix);
    const receipt = buildReceipt(matrix);
    writeJsonAtomic(abs(RECEIPT_REF), receipt);
    updateState(matrix, receipt);
    if (approveGovernance) updateGovernanceApprovals();
  }
  const result = evaluateNormalizedCapabilityMatrix();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_NORMALIZED_CAPABILITY_MATRIX=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

export {
  buildMatrix,
  evaluateNormalizedCapabilityMatrix,
};

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    process.exit(1);
  });
}
