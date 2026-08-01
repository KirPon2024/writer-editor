#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const TASK_ID = 'YALKEN_WORD_A03_C04_MODERN_COMMENT_STATE';
const CONTOUR_ID = 'A03-C04';
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_C04_MODERN_COMMENT_STATE_RECEIPT.json');
const TARGETED_RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_MODERN_COMMENT_NATIVE_UI_FOLLOWUP_RECEIPT.json');
const A02_RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A02_TERMINAL_AUDIT_RECEIPT.json');
const C01_RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_C01_COMMENT_SHADOW_RUNTIME_RECEIPT.json');
const C03_RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_C03_ADJACENT_RANGE_NEGATIVE_ORACLE_RECEIPT.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const PROMOTION_LIST_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_PROMOTION_LIST.json');
const CONTRACT_PATH = path.join(REPO_ROOT, 'test', 'contracts', 'rtk-word-v4-a03-c04-modern-comment-state.contract.test.js');

const SCHEMA = 'yalken.rtk.word-safe-semantic-roundtrip-v4.a03-c04-modern-comment-state-receipt.v1';
const STATUS = 'WORD_A03_C04_MODERN_COMMENT_STATE_READBACK_BOUND_TYPED_LIMITATION_NOT_PROMOTED';
const LEDGER_STATUS = 'WORD_SATURATION_A03_C04_MODERN_COMMENT_STATE_BOUND_NOT_SATURATED';
const PROFILE_STATUS = 'WORD_16_111_2_A03_C04_MODERN_COMMENT_STATE_READBACK_BOUND_NOT_PROMOTED';
const PROGRAM_STATUS = 'WORD_A03_C04_MODERN_COMMENT_STATE_READBACK_BOUND_NOT_PROMOTED';
const PROMOTION_STATUS = 'A03_C04_MODERN_COMMENT_STATE_BOUND_C05_NEXT';
const CURRENT_STAGE = 'EXECUTION_03_A03_C04_MODERN_COMMENT_STATE_ONLY_IF_PHYSICAL_PASS';
const NEXT_STAGE = 'EXECUTION_03_A03_C05_NON_OVERLAP_TRACKED_REPLACEMENTS_PRODUCT_PATH_CONTOUR';
const C05_LEDGER_STATUS = 'WORD_SATURATION_A03_C05_NON_OVERLAP_PRODUCT_PATH_WIRED_NOT_SATURATED';
const C05_PROFILE_STATUS = 'WORD_16_111_2_A03_C05_NON_OVERLAP_PRODUCT_PATH_WIRED_NOT_SATURATED';
const C05_PROGRAM_STATUS = 'WORD_A03_C05_NON_OVERLAP_TRACKED_REPLACEMENT_PRODUCT_PATH_WIRED_NOT_SATURATED';
const C05_PROMOTION_STATUS = 'A03_C05_NON_OVERLAP_PRODUCT_PATH_WIRED_RELEASE_AUDIT_NEXT';
const C05_NEXT_STAGE = 'RELEASE_AUDIT_REBIND_AFTER_C05';
const P0_REPLY_STATUS = 'WORD_NORMALIZED_CAPABILITY_MATRIX_BOUND_NOT_SATURATED';
const P0_REPLY_NEXT_STAGE = 'P0_MODERN_COMMENT_RESOLVE_REOPEN_PRODUCT_PATH_OR_TYPED_LIMITATION';
const P0_RESOLVE_NEXT_STAGE = 'P0_SAFE_FORMATTING_APPLY_LANE_OR_TYPED_LIMITATION';
const P0_FORMATTING_NEXT_STAGE = 'P0_SAFE_STRUCTURAL_APPLY_LANE_OR_TYPED_LIMITATION';
const P0_STRUCTURAL_NEXT_STAGE = 'P0_MULTI_ROUND_STALE_CONFLICT_AND_LEDGER_RECONCILIATION';
const P0_SCALE_NEXT_STAGE = 'P0_WORD_SCALE_ENGINEERING_AND_DECLARED_SUPPORT_ENVELOPE';
const FINAL_MATRIX_STATUS = 'WORD_NORMALIZED_CAPABILITY_MATRIX_SUPPORT_ENVELOPE_READY_FOR_INDEPENDENT_AUDIT';
const FINAL_NEXT_STAGE = 'READY_FOR_FRESH_INDEPENDENT_EXACT_HEAD_AUDIT';
const C4_REMEDIATION_STATUS = 'WORD_SAFETY_REMEDIATION_V1_C4_TEST_GRAPH_CI_TRUTH_LOCAL_VERIFIED';
const C4_REMEDIATION_STAGE = 'WORD_SAFETY_REMEDIATION_V1_C4_TEST_GRAPH_AND_CI_TRUTH';
const C4_NEXT_STAGE = 'WORD_SAFETY_REMEDIATION_V1_C5_FULL_PHYSICAL_WORD_RECERTIFICATION';
const EVIDENCE_ID = 'A03_C04_MODERN_COMMENT_STATE';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function gitRevParse(ref) {
  return execFileSync('git', ['rev-parse', ref], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function issue(code, field, message) {
  return { code, field, message };
}

function binding(id, filePath) {
  return {
    id,
    path: path.relative(REPO_ROOT, filePath),
    sha256: sha256File(filePath),
    status: 'BOUND',
  };
}

function findCase(receipt, id) {
  return list(receipt?.physicalCorpus?.cases).find((item) => item?.id === id) || null;
}

function hasPart(readback, partName) {
  return list(readback?.commentRelatedParts).includes(partName);
}

function isActiveRootModernCommentCase(item) {
  return item?.result === 'PASS'
    && item?.packageReadback?.commentCount === 1
    && item?.packageReadback?.doneTrueCount === 0
    && item?.packageReadback?.doneFalseCount >= 1
    && item?.packageReadback?.parentLinkCount === 0
    && hasPart(item?.packageReadback, 'word/comments.xml')
    && hasPart(item?.packageReadback, 'word/commentsExtended.xml')
    && hasPart(item?.packageReadback, 'word/commentsIds.xml')
    && hasPart(item?.packageReadback, 'word/people.xml');
}

function buildOracle({
  targetedReceipt = readJson(TARGETED_RECEIPT_PATH),
  a02Receipt = readJson(A02_RECEIPT_PATH),
  c01Receipt = readJson(C01_RECEIPT_PATH),
  c03Receipt = readJson(C03_RECEIPT_PATH),
} = {}) {
  const commentCases = list(targetedReceipt?.physicalCorpus?.cases).filter((item) => /^NCUI-C/u.test(String(item?.id || '')));
  const activeRootCases = commentCases.filter(isActiveRootModernCommentCase);
  const replyCase = findCase(targetedReceipt, 'NCUI-C08');
  const resolveAttemptCase = findCase(targetedReceipt, 'NCUI-C09');
  const deleteCase = findCase(targetedReceipt, 'NCUI-C11');
  const a02MicroLab = a02Receipt?.microLab?.modernCommentResolveReopen || {};
  const resolvedReadback = a02MicroLab?.packageReadback?.resolved || {};
  const reopenedReadback = a02MicroLab?.packageReadback?.reopened || {};
  const c01RuntimeWired = c01Receipt?.implementedCapability?.capability === 'rootModernCommentShadowImport'
    && c01Receipt?.implementedCapability?.physicalWordProven === true
    && c01Receipt?.implementedCapability?.componentProven === true
    && c01Receipt?.implementedCapability?.productRuntimeWired === true
    && c01Receipt?.implementedCapability?.automaticApplyCertified === false
    && c01Receipt?.implementedCapability?.manuscriptApplyAuthority === false;
  const c03KeepsApplyClosed = c03Receipt?.implementedCapability?.automaticApplyCertified === false
    && c03Receipt?.implementedCapability?.productRuntimeWired === false
    && c03Receipt?.implementedCapability?.negativeOracleBound === true;
  const activeRootCommentReadbackPass = activeRootCases.length >= 5
    && targetedReceipt?.certificationDecision?.rootModernCommentCertified === true;
  const commentDeletePhysicalPass = deleteCase?.result === 'PASS'
    && deleteCase?.packageReadback?.commentCount === 0
    && targetedReceipt?.certificationDecision?.deleteCertified === true;
  const replyRemainsTypedLimitation = String(replyCase?.result || '').includes('TYPED_LIMITATION')
    && replyCase?.packageReadback?.parentLinkCount === 0
    && targetedReceipt?.certificationDecision?.modernReplyCertified === false;
  const resolveDoneTrueReadbackOnly = a02MicroLab.result === 'TYPED_LIMITATION'
    && a02MicroLab.deterministicSelectedThreadBinding === true
    && a02MicroLab.controls?.resolveStableControlBound === true
    && Number(resolvedReadback.doneTrueCount || 0) >= 1
    && Number(resolvedReadback.doneFalseCount || 0) === 0
    && Number(reopenedReadback.doneTrueCount || 0) >= 1
    && Number(reopenedReadback.doneFalseCount || 0) === 0;
  const resolveReopenFullPass = a02MicroLab.result === 'PASS'
    && a02MicroLab.controls?.reopenStableControlBound === true
    && Number(resolvedReadback.doneTrueCount || 0) >= 1
    && Number(reopenedReadback.doneFalseCount || 0) >= 1
    && targetedReceipt?.certificationDecision?.resolveReopenCertified === true;
  const resolveAttemptStillLimited = String(resolveAttemptCase?.result || '').includes('TYPED_LIMITATION')
    && targetedReceipt?.certificationDecision?.resolveReopenCertified === false
    && resolveReopenFullPass === false;
  const decision = activeRootCommentReadbackPass
    && commentDeletePhysicalPass
    && replyRemainsTypedLimitation
    && resolveDoneTrueReadbackOnly
    && resolveAttemptStillLimited
    && c01RuntimeWired
    && c03KeepsApplyClosed
    ? 'BIND_STATE_READBACK_ONLY_DO_NOT_PROMOTE_RESOLVE_REOPEN_RUNTIME'
    : 'BLOCKED_ORACLE_INPUT_INCOMPLETE';
  return {
    activeRootCommentReadbackPass,
    activeRootCommentCaseCount: activeRootCases.length,
    commentDeletePhysicalPass,
    replyRemainsTypedLimitation,
    resolveDoneTrueReadbackOnly,
    resolveReopenFullPass,
    resolveAttemptStillLimited,
    c01RuntimeWired,
    c03KeepsApplyClosed,
    physicalEvidence: {
      rootCaseIds: activeRootCases.map((item) => item.id),
      replyCase: {
        id: 'NCUI-C08',
        result: replyCase?.result || '',
        commentCount: replyCase?.packageReadback?.commentCount || 0,
        parentLinkCount: replyCase?.packageReadback?.parentLinkCount || 0,
      },
      resolveAttemptCase: {
        id: 'NCUI-C09',
        result: resolveAttemptCase?.result || '',
        doneTrueCount: resolveAttemptCase?.packageReadback?.doneTrueCount || 0,
        doneFalseCount: resolveAttemptCase?.packageReadback?.doneFalseCount || 0,
      },
      deleteCase: {
        id: 'NCUI-C11',
        result: deleteCase?.result || '',
        commentCount: deleteCase?.packageReadback?.commentCount || 0,
      },
      a02ResolveMicroLab: {
        id: a02MicroLab.id || 'A02-MC-RESOLVE-REOPEN',
        result: a02MicroLab.result || '',
        deterministicSelectedThreadBinding: a02MicroLab.deterministicSelectedThreadBinding === true,
        resolveStableControlBound: a02MicroLab.controls?.resolveStableControlBound === true,
        reopenStableControlBound: a02MicroLab.controls?.reopenStableControlBound === true,
        resolvedDoneTrueCount: resolvedReadback.doneTrueCount || 0,
        resolvedDoneFalseCount: resolvedReadback.doneFalseCount || 0,
        reopenedDoneTrueCount: reopenedReadback.doneTrueCount || 0,
        reopenedDoneFalseCount: reopenedReadback.doneFalseCount || 0,
      },
    },
    decision,
  };
}

function buildReceipt() {
  const oracle = buildOracle();
  return {
    schemaVersion: SCHEMA,
    taskId: TASK_ID,
    contourId: CONTOUR_ID,
    status: STATUS,
    result: oracle.decision === 'BIND_STATE_READBACK_ONLY_DO_NOT_PROMOTE_RESOLVE_REOPEN_RUNTIME' ? 'PASS' : 'FAIL',
    headBinding: {
      headSha: gitRevParse('HEAD'),
      originMainSha: gitRevParse('origin/main'),
      mergedRemoteShaRequired: true,
    },
    sourceEvidence: {
      targetedNativeUiReceipt: binding('E12_MODERN_COMMENT_NATIVE_UI_TARGETED_GAP_CLOSURE', TARGETED_RECEIPT_PATH),
      a02TerminalAuditReceipt: binding('E12_A02_TERMINAL_AUDIT', A02_RECEIPT_PATH),
      c01CommentShadowRuntimeReceipt: binding('A03_C01_COMMENT_SHADOW_RUNTIME', C01_RECEIPT_PATH),
      c03AdjacentRangeNegativeOracleReceipt: binding('A03_C03_ADJACENT_RANGE_NEGATIVE_ORACLE', C03_RECEIPT_PATH),
    },
    oracle,
    implementedCapability: {
      capability: 'modernCommentResolveReopenState',
      physicalWordProven: false,
      componentProven: true,
      productRuntimeWired: false,
      automaticApplyCertified: false,
      stateReadbackOnlyPhysicalWordProven: oracle.resolveDoneTrueReadbackOnly,
      activeRootCommentReadbackPhysicalWordProven: oracle.activeRootCommentReadbackPass,
      commentDeletePhysicalWordProven: oracle.commentDeletePhysicalPass,
      replyPhysicalWordProven: false,
      resolveReopenPhysicalWordProven: false,
      productCommentStateMutationWired: false,
      manuscriptApplyAuthority: false,
      decision: oracle.decision,
      stateReadbackScope: 'commentsExtended done true readback only; no done false after reopen authority',
    },
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      silentCommentLoss: 0,
      falseSupport: 0,
      noOpPass: 0,
      userDocumentTouch: 0,
      networkRequest: 0,
      googleDocsOpened: 0,
    },
    nonClaims: [
      'MODERN_REPLY_NOT_CERTIFIED',
      'MODERN_RESOLVE_REOPEN_NOT_CERTIFIED',
      'COMMENT_DELETE_NOT_PRODUCT_RUNTIME_WIRED_IN_C04',
      'NO_COMMENT_STATE_PRODUCT_MUTATION_ADDED',
      'NO_MANUSCRIPT_APPLY_AUTHORITY_ADDED',
      'GOOGLE_DOCS_NOT_OPENED',
      'NO_GENERIC_WAVE_REPEATED',
    ],
    nextStage: NEXT_STAGE,
  };
}

function countPromotionRows(promotionList) {
  const rows = list(promotionList.rows);
  return {
    totalRows: rows.length,
    physicalWordProvenRows: rows.filter((row) => row.authorityLevel?.physicalWordProven === true).length,
    componentProvenRows: rows.filter((row) => row.authorityLevel?.componentProven === true).length,
    productRuntimeWiredRows: rows.filter((row) => row.authorityLevel?.productRuntimeWired === true).length,
    automaticApplyCertifiedRows: rows.filter((row) => row.authorityLevel?.automaticApplyCertified === true).length,
  };
}

function upsertBinding(ledger, id, filePath) {
  const next = binding(id, filePath);
  const bindings = Array.isArray(ledger.evidenceBindings) ? ledger.evidenceBindings : [];
  const index = bindings.findIndex((item) => item.id === id);
  if (index >= 0) bindings[index] = next;
  else bindings.push(next);
  ledger.evidenceBindings = bindings;
}

function updatePromotionList(promotionList, receipt) {
  promotionList.status = PROMOTION_STATUS;
  promotionList.latestRuntimeContour = CONTOUR_ID;
  promotionList.nextContour = 'A03-C05';
  for (const row of list(promotionList.rows)) {
    if (row.capability === 'modernCommentResolveReopenState') {
      row.missingRuntimeWiring = 'blocked for resolve reopen; C04 binds done true readback only and keeps product comment state mutation closed until done true then done false physical evidence exists';
      row.authorityLevel = isPlainObject(row.authorityLevel) ? row.authorityLevel : {};
      row.authorityLevel.physicalWordProven = false;
      row.authorityLevel.componentProven = true;
      row.authorityLevel.productRuntimeWired = false;
      row.authorityLevel.automaticApplyCertified = false;
      row.authorityLevel.stateReadbackOnlyPhysicalWordProven = true;
      row.authorityLevel.commentDeletePhysicalWordProven = true;
      row.authorityLevel.replyPhysicalWordProven = false;
      row.authorityLevel.resolveReopenPhysicalWordProven = false;
      row.authorityLevel.productCommentStateMutationWired = false;
      row.runtimeContour = CONTOUR_ID;
      row.runtimeReceiptPath = path.relative(REPO_ROOT, RECEIPT_PATH);
      row.killCriterion = 'any reply or resolve-reopen runtime capability is claimed without parent link and done true then done false save-close-reopen readback';
    }
  }
  promotionList.summary = countPromotionRows(promotionList);
  promotionList.authorityCounts = countPromotionRows(promotionList);
  promotionList.c04Truth = {
    stateReadbackOnlyPhysicalWordProven: receipt.implementedCapability.stateReadbackOnlyPhysicalWordProven,
    commentDeletePhysicalWordProven: receipt.implementedCapability.commentDeletePhysicalWordProven,
    replyPhysicalWordProven: false,
    resolveReopenPhysicalWordProven: false,
    productRuntimeWiredRows: promotionList.summary.productRuntimeWiredRows,
    automaticApplyCertifiedRows: 0,
  };
}

function updateProfile(profile, receipt) {
  profile.status = PROFILE_STATUS;
  const cells = Array.isArray(profile.cells) ? profile.cells : [];
  const saturationCell = cells.find((item) => item.capabilityId === 'rtk.word.v4.saturationLedger');
  if (saturationCell) {
    saturationCell.currentCapability = 'A03_C04_MODERN_COMMENT_STATE_READBACK_ONLY_NOT_PROMOTED';
    saturationCell.physicalWordEvidence = true;
  }
  const cell = {
    capabilityId: 'rtk.word.v4.modernCommentStateReadbackGate',
    operationFamily: 'modern comment done state and thread lifecycle readback',
    state: 'COMPONENT_PROVEN_STATE_READBACK_ONLY_TYPED_LIMITATION',
    currentCapability: 'DONE_TRUE_READBACK_ONLY_BOUND_NO_RESOLVE_REOPEN_RUNTIME_PROMOTION',
    physicalWordEvidence: true,
    componentProven: true,
    productRuntimeWired: false,
    automaticApplyCertified: false,
    authorityLevel: receipt.implementedCapability,
    consumer: 'A03-C05 product runtime contour gate',
    acceptanceTest: path.relative(REPO_ROOT, CONTRACT_PATH),
    evidenceReceiptPath: path.relative(REPO_ROOT, RECEIPT_PATH),
    supportedNow: [
      'active root modern comments preserve commentsExtended commentsIds and people parts after Word save-close-reopen',
      'single-thread resolve control produces done true OOXML readback',
      'Word-authored comment delete is physically read back as zero comments',
      'C01 root modern comments remain product-runtime wired as shadow-only review session import',
    ],
    limitations: [
      'modern replies remain not certified because no parent link is read back',
      'resolve then reopen remains not certified because done false after reopen is not read back',
      'comment delete is physical evidence only until a later product runtime shadow-state contour',
      'C04 adds no manuscript apply authority',
    ],
    killCriterion: 'Any modern comment state is promoted to product mutation or automatic apply without deterministic physical Word readback and Command Kernel receipt.',
  };
  const index = cells.findIndex((item) => item.capabilityId === cell.capabilityId);
  if (index >= 0) cells[index] = cell;
  else cells.push(cell);
  profile.cells = cells;
}

function updateProgram(program, receipt) {
  program.status = PROGRAM_STATUS;
  program.nextStep = NEXT_STAGE;
  program.v4ExecutionState = {
    ...(isPlainObject(program.v4ExecutionState) ? program.v4ExecutionState : {}),
    status: 'EXECUTION_03_A03_C04_MODERN_COMMENT_STATE_READBACK_ONLY_BOUND',
    currentStage: CURRENT_STAGE,
    nextStage: NEXT_STAGE,
    latestReceiptPath: path.relative(REPO_ROOT, RECEIPT_PATH),
    modernCommentStateReadbackOnlyBound: true,
    modernCommentDoneTrueReadbackPhysicalWordProven: receipt.implementedCapability.stateReadbackOnlyPhysicalWordProven,
    modernCommentDeletePhysicalWordProven: receipt.implementedCapability.commentDeletePhysicalWordProven,
    modernReplyCertified: false,
    modernResolveReopenCertified: false,
    productCommentStateMutationWired: false,
    runtimeApplyAuthorityGranted: false,
    runtimeApplyAuthorityScope: 'NONE_C04_STATE_READBACK_ONLY',
    automaticApplyCertified: 0,
    wordSaturated: false,
    googleDocsOpened: false,
  };
}

function updateLedger(ledger, receipt) {
  ledger.status = LEDGER_STATUS;
  ledger.nextStage = NEXT_STAGE;
  ledger.runtimeClaims = {
    ...(isPlainObject(ledger.runtimeClaims) ? ledger.runtimeClaims : {}),
    productRuntimeChanged: true,
    writerAuthorityAdded: false,
    automaticApplyExpanded: false,
    automaticApplyScope: 'none; C04 modern comment state readback gate only',
    uiChanged: false,
    dependencyAdded: false,
    networkAdded: false,
    googleDocsOpened: false,
    wordSaturated: false,
  };
  ledger.aggregateTotals = {
    ...(isPlainObject(ledger.aggregateTotals) ? ledger.aggregateTotals : {}),
    a03C04ModernCommentStateReadbackOnlyBound: 1,
    a03C04ActiveRootCommentReadbackPass: receipt.oracle.activeRootCommentReadbackPass ? 1 : 0,
    a03C04ActiveRootCommentCaseCount: receipt.oracle.activeRootCommentCaseCount,
    a03C04CommentDeletePhysicalPass: receipt.oracle.commentDeletePhysicalPass ? 1 : 0,
    a03C04ResolveDoneTrueReadbackOnly: receipt.oracle.resolveDoneTrueReadbackOnly ? 1 : 0,
    a03C04ResolveReopenFullPass: 0,
    a03C04ModernReplyPass: 0,
    a03PromotionProductRuntimeWiredRows: 1,
    a03PromotionAutomaticApplyCertifiedRows: 0,
    falseExact: 0,
    wrongSceneRouting: 0,
    silentApply: 0,
    replayFailure: 0,
    silentCommentLoss: 0,
  };
  ledger.coverageLedger = {
    ...(isPlainObject(ledger.coverageLedger) ? ledger.coverageLedger : {}),
    a03C04ModernCommentState: {
      status: 'BOUND_STATE_READBACK_ONLY',
      sourceEvidence: EVIDENCE_ID,
      result: STATUS,
      stateReadbackOnlyPhysicalWordProven: receipt.implementedCapability.stateReadbackOnlyPhysicalWordProven,
      commentDeletePhysicalWordProven: receipt.implementedCapability.commentDeletePhysicalWordProven,
      productRuntimeWired: false,
      automaticApplyCertified: false,
      replyPhysicalWordProven: false,
      resolveReopenPhysicalWordProven: false,
    },
  };
  upsertBinding(ledger, EVIDENCE_ID, RECEIPT_PATH);
  upsertBinding(ledger, 'E12_A03_PROMOTION_LIST', PROMOTION_LIST_PATH);
}

function updateState() {
  const receipt = buildReceipt();
  writeJson(RECEIPT_PATH, receipt);

  const promotionList = readJson(PROMOTION_LIST_PATH);
  updatePromotionList(promotionList, receipt);
  writeJson(PROMOTION_LIST_PATH, promotionList);

  const profile = readJson(PROFILE_PATH);
  updateProfile(profile, receipt);
  writeJson(PROFILE_PATH, profile);

  const program = readJson(PROGRAM_PATH);
  updateProgram(program, receipt);
  writeJson(PROGRAM_PATH, program);

  const ledger = readJson(LEDGER_PATH);
  updateLedger(ledger, receipt);
  writeJson(LEDGER_PATH, ledger);

  return receipt;
}

function isC05SuccessorState(profile, program, ledger, promotionList) {
  return promotionList.status === C05_PROMOTION_STATUS
    && promotionList.nextContour === 'RELEASE-AUDIT'
    && profile.status === C05_PROFILE_STATUS
    && program.status === C05_PROGRAM_STATUS
    && program.nextStep === C05_NEXT_STAGE
    && program.v4ExecutionState?.nextStage === C05_NEXT_STAGE
    && program.v4ExecutionState?.modernResolveReopenCertified === false
    && program.v4ExecutionState?.productCommentStateMutationWired === false
    && program.v4ExecutionState?.googleDocsOpened === false
    && ledger.status === C05_LEDGER_STATUS
    && ledger.coverageLedger?.a03C04ModernCommentState?.status === 'BOUND_STATE_READBACK_ONLY'
    && ledger.coverageLedger?.a03C05NonOverlapProductPath?.status === 'BOUND_PRODUCT_PATH_WIRED_NOT_RELEASE_READY'
    && ledger.runtimeClaims?.googleDocsOpened === false
    && ledger.runtimeClaims?.releaseReady === false;
}

function isP0ReplySuccessorState(profile, program, ledger, promotionList) {
  const nextStage = program.v4ExecutionState?.nextStage;
  const replyOrLaterNextStage = [
    P0_REPLY_NEXT_STAGE,
    P0_RESOLVE_NEXT_STAGE,
    P0_FORMATTING_NEXT_STAGE,
    P0_STRUCTURAL_NEXT_STAGE,
    P0_SCALE_NEXT_STAGE,
  ].includes(nextStage);
  const allowedNextStages = [
    P0_REPLY_NEXT_STAGE,
    P0_RESOLVE_NEXT_STAGE,
    P0_FORMATTING_NEXT_STAGE,
    P0_STRUCTURAL_NEXT_STAGE,
    P0_SCALE_NEXT_STAGE,
  ];
  return promotionList.status === C05_PROMOTION_STATUS
    && promotionList.nextContour === 'RELEASE-AUDIT'
    && profile.status === P0_REPLY_STATUS
    && program.status === P0_REPLY_STATUS
    && allowedNextStages.includes(program.nextStep)
    && replyOrLaterNextStage
    && program.v4ExecutionState?.modernReplyTypedLimitationBound === true
    && program.v4ExecutionState?.modernResolveReopenCertified !== true
    && program.v4ExecutionState?.googleDocsOpened === false
    && ledger.status === P0_REPLY_STATUS
    && allowedNextStages.includes(ledger.nextStage)
    && ledger.coverageLedger?.a03C04ModernCommentState?.status === 'BOUND_STATE_READBACK_ONLY'
    && ledger.coverageLedger?.p0ModernCommentRepliesTypedLimitation?.status === 'BOUND_TYPED_LIMITATION_WITH_SHADOW_PRESERVATION'
    && (
      nextStage === P0_REPLY_NEXT_STAGE
      || ledger.coverageLedger?.p0ModernCommentResolveReopenTypedLimitation?.status === 'BOUND_RESOLVED_STATE_SHADOW_AND_REOPEN_TYPED_LIMITATION'
    )
    && ledger.runtimeClaims?.googleDocsOpened === false
    && ledger.runtimeClaims?.automaticApplyExpanded === false
    && ledger.runtimeClaims?.wordSaturated === false;
}

function isFinalEnvelopeSuccessorState(profile, program, ledger, promotionList) {
  return promotionList.status === C05_PROMOTION_STATUS
    && promotionList.nextContour === 'RELEASE-AUDIT'
    && profile.status === FINAL_MATRIX_STATUS
    && program.status === FINAL_MATRIX_STATUS
    && program.nextStep === FINAL_NEXT_STAGE
    && program.v4ExecutionState?.status === FINAL_MATRIX_STATUS
    && program.v4ExecutionState?.nextStage === FINAL_NEXT_STAGE
    && program.v4ExecutionState?.wordSaturated === true
    && program.v4ExecutionState?.wordSaturationScope === 'DECLARED_SUPPORT_ENVELOPE_ONLY'
    && program.v4ExecutionState?.readyForFreshIndependentExactHeadAudit === true
    && program.v4ExecutionState?.modernResolveReopenCertified === false
    && program.v4ExecutionState?.modernReplyProductRuntimeWired === false
    && program.v4ExecutionState?.modernResolveReopenProductRuntimeWired === false
    && program.v4ExecutionState?.googleDocsOpened === false
    && ledger.status === FINAL_MATRIX_STATUS
    && ledger.nextStage === FINAL_NEXT_STAGE
    && ledger.coverageLedger?.a03C04ModernCommentState?.status === 'BOUND_STATE_READBACK_ONLY'
    && ledger.coverageLedger?.p0ModernCommentRepliesTypedLimitation?.status === 'BOUND_TYPED_LIMITATION_WITH_SHADOW_PRESERVATION'
    && ledger.coverageLedger?.p0ModernCommentResolveReopenTypedLimitation?.status === 'BOUND_RESOLVED_STATE_SHADOW_AND_REOPEN_TYPED_LIMITATION'
    && ledger.runtimeClaims?.wordSaturated === true
    && ledger.runtimeClaims?.wordSaturationScope === 'DECLARED_SUPPORT_ENVELOPE_ONLY'
    && ledger.runtimeClaims?.readyForFreshIndependentExactHeadAudit === true
    && ledger.runtimeClaims?.googleDocsOpened === false
    && ledger.runtimeClaims?.automaticApplyExpanded === false;
}

function isC4RemediationState(profile, program, ledger) {
  return profile.status === C4_REMEDIATION_STATUS
    && program.status === C4_REMEDIATION_STATUS
    && program.nextStep === C4_NEXT_STAGE
    && program.v4ExecutionState?.status === C4_REMEDIATION_STATUS
    && program.v4ExecutionState?.currentStage === C4_REMEDIATION_STAGE
    && program.v4ExecutionState?.nextStage === C4_NEXT_STAGE
    && program.v4ExecutionState?.wordAcceptanceRevoked === true
    && program.v4ExecutionState?.wordSaturated === false
    && program.v4ExecutionState?.readyForFreshIndependentExactHeadAudit === false
    && program.v4ExecutionState?.googleDocsOpened === false
    && ledger.status === C4_REMEDIATION_STATUS
    && ledger.nextStage === C4_NEXT_STAGE
    && ledger.runtimeClaims?.wordSaturated === false
    && ledger.runtimeClaims?.readyForFreshIndependentExactHeadAudit === false
    && ledger.runtimeClaims?.googleDocsOpened === false;
}

export function evaluateWordV4A03C04ModernCommentState(input = {}) {
  const receipt = input.receipt || (fs.existsSync(RECEIPT_PATH) ? readJson(RECEIPT_PATH) : buildReceipt());
  const promotionList = input.promotionList || readJson(PROMOTION_LIST_PATH);
  const profile = input.profile || readJson(PROFILE_PATH);
  const program = input.program || readJson(PROGRAM_PATH);
  const ledger = input.ledger || readJson(LEDGER_PATH);
  const c05SuccessorState = isC05SuccessorState(profile, program, ledger, promotionList);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));
  const row = list(promotionList.rows).find((item) => item.capability === 'modernCommentResolveReopenState');
  const cell = list(profile.cells).find((item) => item.capabilityId === 'rtk.word.v4.modernCommentStateReadbackGate');
  const validSuccessorState = c05SuccessorState
    || isP0ReplySuccessorState(profile, program, ledger, promotionList)
    || isFinalEnvelopeSuccessorState(profile, program, ledger, promotionList)
    || isC4RemediationState(profile, program, ledger);

  if (receipt.schemaVersion !== SCHEMA || receipt.status !== STATUS || receipt.result !== 'PASS') add('RTK_A03_C04_RECEIPT_INVALID', 'receipt', 'C04 receipt must bind a passing state-readback-only gate.');
  if (receipt.oracle?.activeRootCommentReadbackPass !== true
    || receipt.oracle?.commentDeletePhysicalPass !== true
    || receipt.oracle?.replyRemainsTypedLimitation !== true
    || receipt.oracle?.resolveDoneTrueReadbackOnly !== true
    || receipt.oracle?.resolveReopenFullPass !== false
    || receipt.oracle?.resolveAttemptStillLimited !== true
    || receipt.oracle?.c01RuntimeWired !== true
    || receipt.oracle?.c03KeepsApplyClosed !== true) add('RTK_A03_C04_ORACLE_INVALID', 'oracle', 'C04 oracle requires root comments, delete evidence, done true readback, reply limitation, and no full resolve-reopen.');
  if (receipt.implementedCapability?.physicalWordProven !== false
    || receipt.implementedCapability?.componentProven !== true
    || receipt.implementedCapability?.productRuntimeWired !== false
    || receipt.implementedCapability?.automaticApplyCertified !== false
    || receipt.implementedCapability?.stateReadbackOnlyPhysicalWordProven !== true
    || receipt.implementedCapability?.commentDeletePhysicalWordProven !== true
    || receipt.implementedCapability?.replyPhysicalWordProven !== false
    || receipt.implementedCapability?.resolveReopenPhysicalWordProven !== false) add('RTK_A03_C04_AUTHORITY_OVERCLAIM', 'implementedCapability', 'C04 must not promote full modern comment resolve or reply runtime authority.');
  if (Object.values(receipt.vetoMetrics || {}).some((value) => Number(value) !== 0)) add('RTK_A03_C04_VETO_NONZERO', 'vetoMetrics', 'C04 veto metrics must remain zero.');
  if ((promotionList.status !== PROMOTION_STATUS || promotionList.nextContour !== 'A03-C05') && !validSuccessorState) add('RTK_A03_C04_PROMOTION_STATUS_INVALID', 'promotionList', 'Promotion list must advance to C05 after binding C04, or remain valid after bounded successors.');
  if (!row
    || row.authorityLevel?.physicalWordProven !== false
    || row.authorityLevel?.componentProven !== true
    || row.authorityLevel?.productRuntimeWired !== false
    || row.authorityLevel?.automaticApplyCertified !== false
    || row.authorityLevel?.stateReadbackOnlyPhysicalWordProven !== true
    || row.authorityLevel?.resolveReopenPhysicalWordProven !== false) add('RTK_A03_C04_PROMOTION_ROW_INVALID', 'promotionList.rows.modernCommentResolveReopenState', 'C04 promotion row must stay state-readback-only and not runtime-promoted.');
  if ((profile.status !== PROFILE_STATUS && !validSuccessorState)
    || !cell
    || cell.state !== 'COMPONENT_PROVEN_STATE_READBACK_ONLY_TYPED_LIMITATION'
    || cell.productRuntimeWired !== false
    || cell.automaticApplyCertified !== false) add('RTK_A03_C04_PROFILE_INVALID', 'profile', 'Profile must bind C04 as component-proven state readback with typed limitations.');
  if ((program.status !== PROGRAM_STATUS
    || program.nextStep !== NEXT_STAGE
    || program.v4ExecutionState?.status !== 'EXECUTION_03_A03_C04_MODERN_COMMENT_STATE_READBACK_ONLY_BOUND'
    || program.v4ExecutionState?.modernResolveReopenCertified !== false
    || program.v4ExecutionState?.productCommentStateMutationWired !== false
    || program.v4ExecutionState?.runtimeApplyAuthorityGranted !== false
    || program.v4ExecutionState?.googleDocsOpened !== false) && !validSuccessorState) add('RTK_A03_C04_PROGRAM_INVALID', 'program', 'Program must advance to C05 with no comment-state product mutation and Google closed, or remain valid after bounded successors.');
  if ((ledger.status !== LEDGER_STATUS
    || ledger.coverageLedger?.a03C04ModernCommentState?.status !== 'BOUND_STATE_READBACK_ONLY'
    || ledger.runtimeClaims?.automaticApplyExpanded !== false
    || ledger.runtimeClaims?.writerAuthorityAdded !== false
    || ledger.runtimeClaims?.googleDocsOpened !== false
    || ledger.aggregateTotals?.a03C04ResolveReopenFullPass !== 0
    || ledger.aggregateTotals?.a03C04ModernReplyPass !== 0) && !validSuccessorState) add('RTK_A03_C04_LEDGER_INVALID', 'ledger', 'Ledger must bind C04 without runtime, reply, resolve-reopen, or Google expansion, or remain valid after bounded successors.');

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    nextStage: program.v4ExecutionState?.nextStage || '',
    stateReadbackOnlyPhysicalWordProven: receipt.implementedCapability?.stateReadbackOnlyPhysicalWordProven === true,
    commentDeletePhysicalWordProven: receipt.implementedCapability?.commentDeletePhysicalWordProven === true,
    resolveReopenPhysicalWordProven: receipt.implementedCapability?.resolveReopenPhysicalWordProven === true,
    automaticApplyCertified: receipt.implementedCapability?.automaticApplyCertified === true,
  };
}

function main() {
  const json = process.argv.includes('--json');
  if (process.argv.includes('--write-receipt') || process.argv.includes('--update-state')) updateState();
  const result = evaluateWordV4A03C04ModernCommentState();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_A03_C04_MODERN_COMMENT_STATE=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
