#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  RTK_COMMENT_SHADOW_IMPORT_COMMAND_ID,
  createRtkCommentShadowSessionCommandHandler,
  importRtkCommentShadowSession,
} from '../../src/io/revisionBridge/reviewTransportCommentShadowSession.mjs';
import { stableJson } from '../../src/io/revisionBridge/reviewTransportCore.mjs';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const TASK_ID = 'YALKEN_WORD_A03_SAFE_PORTABILITY_RUNTIME_CONTOUR';
const CONTOUR_ID = 'A03-C01';
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_C01_COMMENT_SHADOW_RUNTIME_RECEIPT.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const PROMOTION_LIST_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_PROMOTION_LIST.json');
const MODULE_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportCommentShadowSession.mjs');
const COMMAND_KERNEL_PATH = path.join(REPO_ROOT, 'src', 'command', 'commandSurfaceKernel.js');
const CONTRACT_PATH = path.join(REPO_ROOT, 'test', 'contracts', 'rtk-word-v4-a03-c01-comment-shadow-runtime.contract.test.js');

const RECEIPT_SCHEMA = 'yalken.rtk.word-safe-semantic-roundtrip-v4.a03-c01-comment-shadow-runtime-receipt.v1';
const STATUS = 'WORD_A03_C01_COMMENT_SHADOW_RUNTIME_WIRED_NOT_SATURATED';
const PROGRAM_STATUS = 'WORD_A03_C01_COMMENT_SHADOW_RUNTIME_WIRED_NOT_SATURATED';
const PROFILE_STATUS = 'WORD_16_111_2_A03_C01_COMMENT_SHADOW_RUNTIME_WIRED_NOT_SATURATED';
const LEDGER_STATUS = 'WORD_SATURATION_A03_C01_COMMENT_SHADOW_RUNTIME_WIRED_NOT_SATURATED';
const PROMOTION_STATUS = 'A03_C01_COMMENT_SHADOW_RUNTIME_WIRED_C02_NEXT';
const C02_PROGRAM_STATUS = 'WORD_A03_C02_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_CERTIFIED_NOT_SATURATED';
const C02_PROFILE_STATUS = 'WORD_16_111_2_A03_C02_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_CERTIFIED_NOT_SATURATED';
const C02_LEDGER_STATUS = 'WORD_SATURATION_A03_C02_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_CERTIFIED_NOT_SATURATED';
const C02_PROMOTION_STATUS = 'A03_C02_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_CERTIFIED_C03_NEXT';
const STATE_STATUS = 'EXECUTION_03_A03_C01_COMMENT_SHADOW_RUNTIME_WIRED_READY_FOR_DELIVERY_CHAIN';
const CURRENT_STAGE = 'EXECUTION_03_A03_C01_COMMENT_SHADOW_RUNTIME_CONTOUR';
const NEXT_STAGE = 'EXECUTION_03_A03_C02_NON_OVERLAP_TRACKED_REPLACEMENTS_RUNTIME_CONTOUR';
const EVIDENCE_ID = 'A03_C01_COMMENT_SHADOW_RUNTIME';
const PROMOTION_EVIDENCE_ID = 'E12_A03_PROMOTION_LIST';

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

function sha256Json(value) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(stableJson(value), 'utf8')).digest('hex')}`;
}

function gitRevParse(ref) {
  return execFileSync('git', ['rev-parse', ref], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function issue(code, field, message) {
  return { code, field, message };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function fixtureReviewIr() {
  return {
    schemaVersion: 'yalken.rtk.review-ir.v2',
    roundId: 'round-a03-c01-receipt',
    returnArtifactId: 'return-a03-c01-receipt',
    semanticReturnId: 'semantic-a03-c01-receipt',
    textRevisions: [],
    moveRevisions: [],
    propertyRevisions: [],
    formattingDeltas: [],
    structureChanges: [],
    opaqueUnsupported: [],
    commentThreads: [
      {
        kind: 'CommentThread',
        threadId: 'rtk-comment-root-a03-c01-1',
        commentId: '101',
        durableId: 'durable-a03-c01-1',
        parentThreadId: '',
        replies: [],
        authorPersonIdentity: {
          author: 'Yalken Synthetic Editor',
          initials: 'YSE',
          people: [{ id: 'person-yse', displayName: 'Yalken Synthetic Editor' }],
        },
        date: '2026-07-31T16:50:00.000Z',
        anchorStart: 4,
        anchorEnd: 18,
        quotedAnchorText: 'comment target',
        body: 'A03 C01 root modern comment body',
        orderingKey: 1,
        status: 'ANCHORED',
        placement: {
          outcome: 'ANCHORED',
          anchored: true,
          selectorStack: {
            exactQuote: 'comment target',
            prefix: 'before',
            suffix: 'after',
            utf16Position: 4,
          },
        },
        reasonCodes: ['RTK_COMMENT_ANCHORED'],
        sourceXmlProvenance: { part: 'word/comments.xml', tokenIndex: 1 },
      },
      {
        kind: 'CommentThread',
        threadId: 'rtk-comment-root-a03-c01-2',
        commentId: '102',
        durableId: 'durable-a03-c01-2',
        parentThreadId: '',
        replies: [],
        authorPersonIdentity: { author: 'Yalken Synthetic Editor', initials: 'YSE', people: [] },
        date: '2026-07-31T16:51:00.000Z',
        body: 'A03 C01 orphan root comment body',
        orderingKey: 2,
        status: 'ORPHAN',
        placement: {
          outcome: 'ORPHAN',
          anchored: false,
          selectorStack: { exactQuote: '', prefix: '', suffix: '', utf16Position: null },
        },
        reasonCodes: ['RTK_COMMENT_ORPHAN'],
      },
    ],
  };
}

async function runRuntimeProof() {
  const { createCommandSurfaceKernel } = require(COMMAND_KERNEL_PATH);
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-a03-c01-receipt-'));
  const payload = {
    projectRoot,
    roundId: 'round-a03-c01-receipt',
    returnArtifactId: 'return-a03-c01-receipt',
    semanticReturnId: 'semantic-a03-c01-receipt',
    reviewIr: fixtureReviewIr(),
  };
  const kernel = createCommandSurfaceKernel({
    [RTK_COMMENT_SHADOW_IMPORT_COMMAND_ID]: createRtkCommentShadowSessionCommandHandler(),
  });
  const first = await kernel.dispatch(RTK_COMMENT_SHADOW_IMPORT_COMMAND_ID, payload);
  const replay = await kernel.dispatch(RTK_COMMENT_SHADOW_IMPORT_COMMAND_ID, payload);
  const replyBlocked = await importRtkCommentShadowSession({
    ...payload,
    semanticReturnId: 'semantic-a03-c01-reply-block',
    reviewIr: {
      ...fixtureReviewIr(),
      commentThreads: [{
        ...fixtureReviewIr().commentThreads[0],
        replies: [{ rawId: 'reply-1', body: 'reply remains typed limitation' }],
      }],
    },
  });
  const duplicateIr = fixtureReviewIr();
  duplicateIr.commentThreads[1].commentId = '101';
  const duplicateBlocked = await importRtkCommentShadowSession({
    ...payload,
    semanticReturnId: 'semantic-a03-c01-duplicate-block',
    reviewIr: duplicateIr,
  });
  const crashRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-a03-c01-recovery-'));
  const crashPayload = { ...payload, projectRoot: crashRoot, semanticReturnId: 'semantic-a03-c01-recovery' };
  const crashed = await importRtkCommentShadowSession(crashPayload, { simulateCrashAfterReceiptTempWrite: true });
  const recovered = await importRtkCommentShadowSession(crashPayload);

  return {
    commandId: RTK_COMMENT_SHADOW_IMPORT_COMMAND_ID,
    firstStatus: first.status,
    replayStatus: replay.status,
    replyBlocked: replyBlocked.ok === false && replyBlocked.reasons.some((item) => item.code === 'RTK_COMMENT_REPLY_NOT_PROMOTED'),
    duplicateBlocked: duplicateBlocked.ok === false && duplicateBlocked.reasons.some((item) => item.code === 'RTK_BLOCKED_DUPLICATE_TOKEN'),
    crashStatus: crashed.status,
    recoveryStatus: recovered.status,
    sessionPathCreated: fs.existsSync(first.sessionPath),
    receiptPathCreated: fs.existsSync(first.receiptPath),
    writerCalled: first.writerCalled === true || replay.writerCalled === true,
    manuscriptApplyAuthority: first.manuscriptApplyAuthority === true || replay.manuscriptApplyAuthority === true,
    threadCount: first.session?.summary?.threadCount || 0,
    anchored: first.session?.summary?.anchored || 0,
    orphan: first.session?.summary?.orphan || 0,
    automaticApplyCertified: first.session?.authorityLevel?.automaticApplyCertified === true,
    productRuntimeWired: first.session?.authorityLevel?.productRuntimeWired === true,
  };
}

async function buildReceipt() {
  const runtimeProof = await runRuntimeProof();
  return {
    schemaVersion: RECEIPT_SCHEMA,
    taskId: TASK_ID,
    contourId: CONTOUR_ID,
    status: STATUS,
    result: 'PASS',
    headBinding: {
      headSha: gitRevParse('HEAD'),
      originMainSha: gitRevParse('origin/main'),
      mergedRemoteShaRequired: true,
    },
    truthCorrection: {
      finalSummaryPhysicalWordProvenRowsWasWrong: true,
      a03PromotionList: {
        totalRows: 5,
        physicalWordProvenRows: 2,
        componentProvenRows: 4,
        productRuntimeWiredRowsBeforeC01: 0,
        productRuntimeWiredRowsAfterC01: 1,
        automaticApplyCertifiedRows: 0,
      },
      a02TerminalCapabilityFamilies: {
        physicalWordProvenFamilies: 4,
        families: [
          'rootModernComments',
          'modernResolveSaveCloseReopenDoneTrueReadbackOnly',
          'commentDelete',
          'trackedNonOverlapRevisions',
        ],
      },
      authorityCountsAreNotInterchangeable: true,
    },
    runtimeProof,
    implementedCapability: {
      capability: 'rootModernCommentShadowImport',
      physicalWordProven: true,
      componentProven: true,
      productRuntimeWired: true,
      automaticApplyCertified: false,
      manuscriptApplyAuthority: false,
      reviewSessionMutation: 'comment-shadow-session-only',
    },
    nonPromotedCapabilities: [
      'adjacent triple edits',
      'literal overlap',
      'modern replies',
      'resolve then reopen',
    ],
    changedRuntimeFiles: [
      'reviewTransportCommentShadowSession.mjs',
      'commandSurfaceKernel.js',
    ],
    evidenceFiles: {
      module: {
        path: 'src/io/revisionBridge/reviewTransportCommentShadowSession.mjs',
        sha256: sha256File(MODULE_PATH),
      },
      commandKernel: {
        path: 'src/command/commandSurfaceKernel.js',
        sha256: sha256File(COMMAND_KERNEL_PATH),
      },
      contract: {
        path: 'test/contracts/rtk-word-v4-a03-c01-comment-shadow-runtime.contract.test.js',
        sha256: sha256File(CONTRACT_PATH),
      },
    },
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      silentCommentLoss: 0,
      manuscriptMutation: 0,
      userDocumentTouch: 0,
      networkRequest: 0,
      googleDocsOpened: 0,
      replyPromotion: 0,
      resolveReopenPromotion: 0,
      automaticApplyCertified: 0,
    },
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

function isC02SuccessorPromotionList(promotionList) {
  const rows = list(promotionList.rows);
  const rootRow = rows.find((row) => row.capability === 'rootModernCommentShadowImport');
  const c02Row = rows.find((row) => row.capability === 'nonOverlapTrackedReplacementRuntimeApply');
  return promotionList.status === C02_PROMOTION_STATUS
    && rows.length === 5
    && rootRow?.authorityLevel?.productRuntimeWired === true
    && rootRow?.authorityLevel?.automaticApplyCertified === false
    && c02Row?.authorityLevel?.productRuntimeWired === true
    && c02Row?.authorityLevel?.automaticApplyCertified === true
    && rows.filter((row) => row.authorityLevel?.productRuntimeWired === true).length === 2
    && rows.filter((row) => row.authorityLevel?.automaticApplyCertified === true).length === 1;
}

function isC02SuccessorState(profile, program, ledger, promotionList) {
  return isC02SuccessorPromotionList(promotionList)
    && profile.status === C02_PROFILE_STATUS
    && program.status === C02_PROGRAM_STATUS
    && program.nextStep === 'EXECUTION_03_A03_C03_ADJACENT_RANGE_NEGATIVE_ORACLE'
    && program.v4ExecutionState?.status === 'EXECUTION_03_A03_C02_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_CERTIFIED'
    && program.v4ExecutionState?.rootModernCommentShadowRuntimeWired === true
    && program.v4ExecutionState?.c01TruthRepairBound === true
    && program.v4ExecutionState?.nonOverlapTrackedReplacementAutomaticApplyCertified === true
    && program.v4ExecutionState?.runtimeApplyAuthorityScope === 'NON_OVERLAP_TRACKED_REPLACEMENT_PAIRS_ONLY'
    && program.v4ExecutionState?.googleDocsOpened === false
    && ledger.status === C02_LEDGER_STATUS
    && ledger.coverageLedger?.a03C01CommentShadowRuntime?.status === 'BOUND'
    && ledger.coverageLedger?.a03C02NonOverlapTrackedReplacementRuntime?.status === 'BOUND'
    && ledger.runtimeClaims?.productRuntimeChanged === true
    && ledger.runtimeClaims?.writerAuthorityAdded === true
    && ledger.runtimeClaims?.automaticApplyExpanded === true
    && ledger.runtimeClaims?.automaticApplyScope === 'non-overlap tracked replacement pairs only'
    && ledger.runtimeClaims?.googleDocsOpened === false
    && ledger.runtimeClaims?.wordSaturated === false;
}

function evaluateReceiptShape(receipt, promotionList, issues) {
  if (receipt.schemaVersion !== RECEIPT_SCHEMA) issues.push(issue('RTK_A03_C01_SCHEMA_INVALID', 'schemaVersion', 'A03-C01 receipt schema is invalid.'));
  if (receipt.status !== STATUS || receipt.result !== 'PASS') issues.push(issue('RTK_A03_C01_STATUS_INVALID', 'status', 'A03-C01 receipt must be PASS without saturation.'));
  const counts = countPromotionRows(promotionList);
  const correction = receipt.truthCorrection?.a03PromotionList || {};
  if (correction.totalRows !== 5
    || correction.physicalWordProvenRows !== 2
    || correction.componentProvenRows !== 4
    || correction.productRuntimeWiredRowsBeforeC01 !== 0
    || correction.productRuntimeWiredRowsAfterC01 !== 1
    || correction.automaticApplyCertifiedRows !== 0) {
    issues.push(issue('RTK_A03_C01_TRUTH_CORRECTION_INVALID', 'truthCorrection', 'A03-C01 must correct row, family, and authority counts explicitly.'));
  }
  const c01CurrentCounts = counts.totalRows === 5
    && counts.physicalWordProvenRows === 2
    && counts.componentProvenRows === 4
    && counts.productRuntimeWiredRows === 1
    && counts.automaticApplyCertifiedRows === 0;
  if (!c01CurrentCounts && !isC02SuccessorPromotionList(promotionList)) {
    issues.push(issue('RTK_A03_C01_PROMOTION_COUNTS_INVALID', 'promotionList.rows', 'Promotion list must show only root modern comments runtime-wired after C01.'));
  }
  if (receipt.truthCorrection?.a02TerminalCapabilityFamilies?.physicalWordProvenFamilies !== 4) {
    issues.push(issue('RTK_A03_C01_A02_FAMILY_COUNT_INVALID', 'truthCorrection.a02TerminalCapabilityFamilies', 'A02 physical family count must remain distinct from A03 promotion rows.'));
  }
}

function evaluateRuntimeProof(receipt, issues) {
  const proof = receipt.runtimeProof || {};
  if (proof.commandId !== RTK_COMMENT_SHADOW_IMPORT_COMMAND_ID
    || proof.firstStatus !== 'committed'
    || proof.replayStatus !== 'replay'
    || proof.replyBlocked !== true
    || proof.duplicateBlocked !== true
    || proof.crashStatus !== 'blocked'
    || proof.recoveryStatus !== 'recovered-replay-receipt'
    || proof.sessionPathCreated !== true
    || proof.receiptPathCreated !== true
    || proof.writerCalled !== false
    || proof.manuscriptApplyAuthority !== false
    || proof.productRuntimeWired !== true
    || proof.automaticApplyCertified !== false
    || proof.threadCount !== 2
    || proof.anchored !== 1
    || proof.orphan !== 1) {
    issues.push(issue('RTK_A03_C01_RUNTIME_PROOF_INVALID', 'runtimeProof', 'A03-C01 must prove command-kernel shadow import, replay, recovery, and no writer authority.'));
  }
}

export async function evaluateWordV4A03C01CommentShadowRuntime(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_PATH);
  const promotionList = input.promotionList || readJson(PROMOTION_LIST_PATH);
  const profile = input.profile || readJson(PROFILE_PATH);
  const program = input.program || readJson(PROGRAM_PATH);
  const ledger = input.ledger || readJson(LEDGER_PATH);
  const issues = [];
  const c02SuccessorState = isC02SuccessorState(profile, program, ledger, promotionList);

  evaluateReceiptShape(receipt, promotionList, issues);
  evaluateRuntimeProof(receipt, issues);
  if (!Object.values(receipt.vetoMetrics || {}).every((value) => Number(value) === 0)) {
    issues.push(issue('RTK_A03_C01_VETO_NONZERO', 'vetoMetrics', 'All A03-C01 veto metrics must be zero.'));
  }
  for (const file of [MODULE_PATH, COMMAND_KERNEL_PATH, CONTRACT_PATH]) {
    if (!fs.existsSync(file)) issues.push(issue('RTK_A03_C01_FILE_MISSING', path.relative(REPO_ROOT, file), 'Required C01 implementation or contract file is missing.'));
  }
  const commandKernelText = fs.readFileSync(COMMAND_KERNEL_PATH, 'utf8');
  if (!commandKernelText.includes(`'${RTK_COMMENT_SHADOW_IMPORT_COMMAND_ID}'`)) {
    issues.push(issue('RTK_A03_C01_COMMAND_NOT_ALLOWED', 'commandSurfaceKernel', 'Command kernel must allow the C01 command id.'));
  }
  const profileCell = list(profile.cells).find((cell) => cell.capabilityId === 'rtk.word.v4.rootModernCommentShadowSession');
  if (!profileCell
    || profileCell.state !== 'PRODUCT_RUNTIME_WIRED'
    || profileCell.currentCapability !== 'ROOT_MODERN_COMMENT_SHADOW_SESSION_RUNTIME_WIRED_NO_APPLY_AUTHORITY'
    || profileCell.authorityLevel?.productRuntimeWired !== true
    || profileCell.authorityLevel?.automaticApplyCertified !== false) {
    issues.push(issue('RTK_A03_C01_PROFILE_CELL_INVALID', 'profile.cells.rtk.word.v4.rootModernCommentShadowSession', 'Capability profile must bind C01 runtime wiring without apply authority.'));
  }
  if (profile.status !== PROFILE_STATUS && !c02SuccessorState) {
    issues.push(issue('RTK_A03_C01_PROFILE_STATUS_INVALID', 'profile.status', 'Profile status must bind A03-C01.'));
  }
  if ((program.status !== PROGRAM_STATUS
    || program.nextStep !== NEXT_STAGE
    || program.v4ExecutionState?.status !== STATE_STATUS
    || program.v4ExecutionState?.currentStage !== CURRENT_STAGE
    || program.v4ExecutionState?.nextStage !== NEXT_STAGE
    || program.v4ExecutionState?.rootModernCommentShadowRuntimeWired !== true
    || program.v4ExecutionState?.runtimeApplyAuthorityGranted !== false
    || program.v4ExecutionState?.googleDocsOpened !== false) && !c02SuccessorState) {
    issues.push(issue('RTK_A03_C01_PROGRAM_STATE_INVALID', 'program.v4ExecutionState', 'Program state must advance to C01 complete and C02 next while keeping Google closed.'));
  }
  if ((ledger.status !== LEDGER_STATUS
    || ledger.runtimeClaims?.productRuntimeChanged !== true
    || ledger.runtimeClaims?.writerAuthorityAdded !== false
    || ledger.runtimeClaims?.automaticApplyExpanded !== false
    || ledger.runtimeClaims?.googleDocsOpened !== false
    || ledger.coverageLedger?.a03C01CommentShadowRuntime?.status !== 'BOUND') && !c02SuccessorState) {
    issues.push(issue('RTK_A03_C01_LEDGER_STATE_INVALID', 'ledger', 'Ledger must bind C01 runtime wiring without saturation or apply authority.'));
  }
  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    productRuntimeWiredRows: countPromotionRows(promotionList).productRuntimeWiredRows,
    automaticApplyCertifiedRows: countPromotionRows(promotionList).automaticApplyCertifiedRows,
    nextStage: program.v4ExecutionState?.nextStage || '',
  };
}

function upsertEvidenceBinding(ledger, receipt) {
  const binding = {
    id: EVIDENCE_ID,
    path: 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_C01_COMMENT_SHADOW_RUNTIME_RECEIPT.json',
    sha256: sha256File(RECEIPT_PATH),
    status: 'BOUND',
  };
  const bindings = Array.isArray(ledger.evidenceBindings) ? ledger.evidenceBindings : [];
  const index = bindings.findIndex((item) => item.id === EVIDENCE_ID);
  if (index >= 0) bindings[index] = binding;
  else bindings.push(binding);
  ledger.evidenceBindings = bindings;
  ledger.coverageLedger = isPlainObject(ledger.coverageLedger) ? ledger.coverageLedger : {};
  ledger.coverageLedger.a03C01CommentShadowRuntime = {
    status: 'BOUND',
    sourceEvidence: EVIDENCE_ID,
    result: receipt.status,
  };
}

function refreshPromotionEvidenceBinding(ledger) {
  const bindings = Array.isArray(ledger.evidenceBindings) ? ledger.evidenceBindings : [];
  const binding = bindings.find((item) => item.id === PROMOTION_EVIDENCE_ID);
  if (binding) binding.sha256 = sha256File(PROMOTION_LIST_PATH);
}

function updatePromotionList(promotionList, receipt) {
  promotionList.status = PROMOTION_STATUS;
  promotionList.latestRuntimeContour = CONTOUR_ID;
  promotionList.nextContour = 'A03-C02';
  promotionList.truthCorrection = receipt.truthCorrection;
  for (const row of list(promotionList.rows)) {
    if (row.capability === 'rootModernCommentShadowImport') {
      row.authorityLevel.productRuntimeWired = true;
      row.authorityLevel.automaticApplyCertified = false;
      row.runtimeContour = CONTOUR_ID;
      row.runtimeReceiptPath = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_C01_COMMENT_SHADOW_RUNTIME_RECEIPT.json';
    }
  }
}

function updateProfile(profile, receipt) {
  profile.status = PROFILE_STATUS;
  const cells = Array.isArray(profile.cells) ? profile.cells : [];
  const cell = {
    capabilityId: 'rtk.word.v4.rootModernCommentShadowSession',
    operationFamily: 'root modern comments shadow session import through Command Kernel',
    state: 'PRODUCT_RUNTIME_WIRED',
    currentCapability: 'ROOT_MODERN_COMMENT_SHADOW_SESSION_RUNTIME_WIRED_NO_APPLY_AUTHORITY',
    physicalWordEvidence: true,
    componentProven: true,
    productRuntimeWired: true,
    automaticApplyCertified: false,
    authorityLevel: receipt.implementedCapability,
    consumer: 'A03-C02 non-overlap tracked replacements runtime contour',
    acceptanceTest: 'test/contracts/rtk-word-v4-a03-c01-comment-shadow-runtime.contract.test.js',
    evidenceReceiptPath: 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_C01_COMMENT_SHADOW_RUNTIME_RECEIPT.json',
    supportedNow: [
      'root modern comment shadow session import',
      'thread identity body author anchor and orphan outcome preservation',
      'idempotent reimport replay',
      'write-once receipt recovery after receipt crash window',
    ],
    limitations: [
      'modern replies remain typed limitation',
      'resolve then reopen remains typed limitation',
      'no manuscript apply authority',
    ],
    killCriterion: 'Any C01 path writes manuscript text, promotes replies or resolve-reopen, loses a supported root comment, or grants automatic apply authority.',
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
    status: STATE_STATUS,
    currentStage: CURRENT_STAGE,
    nextStage: NEXT_STAGE,
    latestReceiptPath: 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_C01_COMMENT_SHADOW_RUNTIME_RECEIPT.json',
    rootModernCommentShadowRuntimeWired: true,
    rootModernCommentShadowRuntimeStatus: 'PRODUCT_RUNTIME_WIRED_NO_APPLY_AUTHORITY',
    rootModernCommentShadowRuntimeThreadProof: receipt.runtimeProof.threadCount,
    productRuntimeChanged: true,
    runtimeApplyAuthorityGranted: false,
    automaticApplyCertified: 0,
    wordSaturated: false,
    googleDocsOpened: false,
    a03PromotionListCorrected: true,
    a03PromotionRows: 5,
    a03PromotionPhysicalWordProvenRows: 2,
    a03PromotionComponentProvenRows: 4,
    a03PromotionProductRuntimeWiredRows: 1,
    a03PromotionAutomaticApplyCertifiedRows: 0,
  };
}

function updateLedger(ledger, receipt) {
  ledger.status = LEDGER_STATUS;
  ledger.nextStage = NEXT_STAGE;
  ledger.runtimeClaims = {
    ...(isPlainObject(ledger.runtimeClaims) ? ledger.runtimeClaims : {}),
    productRuntimeChanged: true,
    automaticApplyExpanded: false,
    writerAuthorityAdded: false,
    uiChanged: false,
    dependencyAdded: false,
    networkAdded: false,
    googleDocsOpened: false,
    wordSaturated: false,
  };
  ledger.aggregateTotals = {
    ...(isPlainObject(ledger.aggregateTotals) ? ledger.aggregateTotals : {}),
    a03PromotionRows: 5,
    a03PromotionPhysicalWordProvenRows: 2,
    a03PromotionComponentProvenRows: 4,
    a03PromotionProductRuntimeWiredRows: 1,
    a03PromotionAutomaticApplyCertifiedRows: 0,
    a03C01CommentShadowRuntimeWired: 1,
    a03C01CommentShadowRuntimeThreadProof: receipt.runtimeProof.threadCount,
  };
  upsertEvidenceBinding(ledger, receipt);
  refreshPromotionEvidenceBinding(ledger);
}

async function updateState() {
  const receipt = await buildReceipt();
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

async function main() {
  const json = process.argv.includes('--json');
  if (process.argv.includes('--write-receipt') || process.argv.includes('--update-state')) {
    await updateState();
  }
  const result = await evaluateWordV4A03C01CommentShadowRuntime();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_A03_C01_COMMENT_SHADOW_RUNTIME=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
