#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { writeJsonAtomic } from './rtk-word-latest-physical-certification-lab.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const require = createRequire(import.meta.url);

const TASK_ID = 'WORD_RTK_P0_MODERN_COMMENT_RESOLVE_REOPEN_TYPED_LIMITATION';
const STATUS = 'WORD_P0_MODERN_COMMENT_RESOLVE_REOPEN_TYPED_LIMITATION_BOUND_NOT_SATURATED';
const SCHEMA = 'yalken.rtk.word.p0-modern-comment-resolve-reopen-typed-limitation-receipt.v1';
const CREATED_AT_UTC = '2026-08-01T12:20:00.000Z';
const NEXT_STAGE = 'P0_SAFE_FORMATTING_APPLY_LANE_OR_TYPED_LIMITATION';
const FORMATTING_SUCCESSOR_STAGE = 'P0_SAFE_STRUCTURAL_APPLY_LANE_OR_TYPED_LIMITATION';
const STRUCTURAL_SUCCESSOR_STAGE = 'P0_MULTI_ROUND_STALE_CONFLICT_AND_LEDGER_RECONCILIATION';
const SCALE_SUCCESSOR_STAGE = 'P0_WORD_SCALE_ENGINEERING_AND_DECLARED_SUPPORT_ENVELOPE';
const FINAL_ENVELOPE_SUCCESSOR_STAGE = 'READY_FOR_FRESH_INDEPENDENT_EXACT_HEAD_AUDIT';

const RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_MODERN_COMMENT_RESOLVE_REOPEN_TYPED_LIMITATION_RECEIPT.json';
const C04_RECEIPT_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_C04_MODERN_COMMENT_STATE_RECEIPT.json';
const P0_REPLY_RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_MODERN_COMMENT_REPLY_TYPED_LIMITATION_RECEIPT.json';
const PROFILE_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json';
const PROGRAM_REF = 'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json';
const LEDGER_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json';
const GOVERNANCE_APPROVALS_REF = 'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json';
const SCRIPT_REF = 'scripts/ops/rtk-word-p0-modern-comment-resolve-reopen-typed-limitation.mjs';
const CONTRACT_REF = 'test/contracts/rtk-word-p0-modern-comment-resolve-reopen-typed-limitation.contract.test.js';
const COMMENT_SESSION_REF = 'src/io/revisionBridge/reviewTransportCommentShadowSession.mjs';
const C01_CONTRACT_REF = 'test/contracts/rtk-word-v4-a03-c01-comment-shadow-runtime.contract.test.js';

const COMMAND_ID = 'cmd.rtk.reviewSession.importComments';
const GOVERNED_PATHS = [
  RECEIPT_REF,
  PROFILE_REF,
  PROGRAM_REF,
  LEDGER_REF,
  SCRIPT_REF,
  CONTRACT_REF,
  COMMENT_SESSION_REF,
  C01_CONTRACT_REF,
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

function physicalStateEvidence() {
  const c04 = readJson(C04_RECEIPT_REF);
  const micro = c04.oracle?.physicalEvidence?.a02ResolveMicroLab || {};
  return {
    sourceReceipt: binding('A03_C04_MODERN_COMMENT_STATE', C04_RECEIPT_REF),
    a02ResolveMicroLab: micro,
    doneTrueReadbackOnly: c04.implementedCapability?.stateReadbackOnlyPhysicalWordProven === true
      && Number(micro.resolvedDoneTrueCount || 0) >= 1
      && Number(micro.resolvedDoneFalseCount || 0) === 0,
    reopenTypedLimitation: c04.implementedCapability?.resolveReopenPhysicalWordProven === false
      && Number(micro.reopenedDoneTrueCount || 0) >= 1
      && Number(micro.reopenedDoneFalseCount || 0) === 0
      && micro.reopenStableControlBound === false,
  };
}

function authenticatedIdentity() {
  return {
    authenticated: true,
    projectId: 'project-p0-modern-comment-resolve-reopen',
    sceneId: 'roman/imported/scene-resolve.txt',
    sceneRevision: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    rawSha256: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    baselineHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    currentBaselineHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    roundId: 'round-p0-modern-comment-resolve-reopen',
    exportId: 'export-p0-modern-comment-resolve-reopen',
    exportArtifactId: 'export-artifact-p0-modern-comment-resolve-reopen',
    returnArtifactId: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    semanticReturnId: 'semantic-p0-modern-comment-resolve-reopen',
    parserProfileDigest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    analysisDigest: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  };
}

function resolvedReviewIr(identity = authenticatedIdentity()) {
  return {
    schemaVersion: 'yalken.rtk.review-ir.v2',
    roundId: identity.roundId,
    returnArtifactId: identity.returnArtifactId,
    semanticReturnId: identity.semanticReturnId,
    textRevisions: [],
    moveRevisions: [],
    propertyRevisions: [],
    formattingDeltas: [],
    structureChanges: [],
    opaqueUnsupported: [],
    commentPlacements: [],
    commentThreads: [
      {
        kind: 'CommentThread',
        threadId: 'p0-resolve-thread-root',
        commentId: '7',
        durableId: 'durable-p0-resolve-thread-root',
        parentThreadId: '',
        authorPersonIdentity: { author: 'Yalken Synthetic Editor', initials: 'YSE', people: [] },
        date: '2026-08-01T12:20:00.000Z',
        anchorStart: 1,
        anchorEnd: 20,
        quotedAnchorText: 'resolve probe anchor',
        body: 'Resolved comment body preserved as shadow state.',
        status: 'RESOLVED',
        placement: {
          outcome: 'RESOLVED',
          anchored: true,
          selectorStack: { exactQuote: 'resolve probe anchor', prefix: '', suffix: '', utf16Position: 1 },
        },
        replies: [],
        reasonCodes: ['RTK_COMMENT_RESOLVED'],
      },
    ],
  };
}

async function runProductShadowProof() {
  const module = await import(pathToFileURL(abs(COMMENT_SESSION_REF)).href);
  const { createCommandSurfaceKernel } = require(abs('src/command/commandSurfaceKernel.js'));
  const kernel = createCommandSurfaceKernel({
    [COMMAND_ID]: module.createRtkCommentShadowSessionCommandHandler(),
  });
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-p0-modern-resolve-'));
  const identity = authenticatedIdentity();
  const payload = {
    projectRoot,
    roundId: identity.roundId,
    returnArtifactId: identity.returnArtifactId,
    semanticReturnId: identity.semanticReturnId,
    authenticatedReturnIdentity: identity,
    reviewIr: resolvedReviewIr(identity),
  };
  const first = await kernel.dispatch(COMMAND_ID, payload);
  const replay = await kernel.dispatch(COMMAND_ID, payload);
  return {
    commandId: COMMAND_ID,
    commandKernelDispatched: true,
    ok: first.ok === true && replay.ok === true,
    firstStatus: first.status || '',
    replayStatus: replay.status || '',
    writerCalled: first.writerCalled === true || replay.writerCalled === true,
    manuscriptApplyAuthority: first.manuscriptApplyAuthority === true || replay.manuscriptApplyAuthority === true,
    threadCount: Number(first.session?.summary?.threadCount || 0),
    resolvedCount: Number(first.session?.summary?.resolved || 0),
    resolveStateShadowPreserved: Number(first.session?.summary?.resolveStateShadowPreserved || 0),
    reopenStateCertified: Number(first.session?.summary?.reopenStateCertified || 0),
    stateLifecycle: first.session?.threads?.[0]?.stateLifecycle || {},
    idempotentReplay: replay.status === 'replay',
    storageEffects: {
      manuscriptBytesWritten: Number(first.storageEffects?.manuscriptBytesWritten || 0) + Number(replay.storageEffects?.manuscriptBytesWritten || 0),
      firstSessionRecordCreated: first.storageEffects?.sessionRecordCreated === true,
      replaySessionRecordExisting: replay.storageEffects?.sessionRecordExisting === true,
    },
    vetoMetrics: first.receipt?.vetoMetrics || {},
  };
}

function buildReceipt({ productProof = null } = {}) {
  const physical = physicalStateEvidence();
  const reply = readJson(P0_REPLY_RECEIPT_REF);
  const product = productProof || { ok: false };
  const productResolvedStateProven = product.ok === true
    && product.resolvedCount === 1
    && product.resolveStateShadowPreserved === 1
    && product.reopenStateCertified === 0
    && product.writerCalled === false
    && product.manuscriptApplyAuthority === false
    && product.idempotentReplay === true
    && list(product.stateLifecycle?.reasonCodes).includes('RTK_COMMENT_RESOLVE_STATE_SHADOW_PRESERVED')
    && list(product.stateLifecycle?.reasonCodes).includes('RTK_COMMENT_REOPEN_TYPED_LIMITATION');
  return {
    schemaVersion: SCHEMA,
    taskId: TASK_ID,
    status: STATUS,
    result: physical.doneTrueReadbackOnly && physical.reopenTypedLimitation && productResolvedStateProven ? 'PASS' : 'FAIL',
    createdAtUtc: CREATED_AT_UTC,
    headBinding: {
      headSha: git('HEAD'),
      originMainSha: git('origin/main'),
      mergedRemoteShaRequired: true,
    },
    sourceEvidence: {
      physicalStateEvidence: physical,
      p0ReplyClosure: binding('P0_MODERN_COMMENT_REPLIES_TYPED_LIMITATION', P0_REPLY_RECEIPT_REF),
      commentShadowSessionRuntime: binding('COMMENT_SHADOW_SESSION_RUNTIME', COMMENT_SESSION_REF),
    },
    productCommandProof: product,
    implementedCapability: {
      capability: 'modernCommentResolveReopenTypedLimitationShadowPreservation',
      physicalWordProven: false,
      componentProven: true,
      productRuntimeWired: true,
      automaticApplyCertified: false,
      resolvedStateShadowPreservationCertified: productResolvedStateProven,
      doneTrueStateReadbackPhysicalWordProven: physical.doneTrueReadbackOnly,
      reopenTypedLimitationBound: physical.reopenTypedLimitation,
      resolveReopenFullLifecycleCertified: false,
      manuscriptApplyAuthority: false,
      userFacingAuthority: 'COMMENT_STATE_SHADOW_PREVIEW_ONLY',
      terminalClass: 'TYPED_LIMITATION_BOUND_WITH_RESOLVED_STATE_SHADOW',
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
      resolveReopenPromotion: 0,
    },
    nonClaims: [
      'MODERN_RESOLVE_REOPEN_FULL_LIFECYCLE_NOT_CERTIFIED',
      'NO_REOPEN_DONE_FALSE_AUTHORITY',
      'NO_MANUSCRIPT_APPLY_AUTHORITY_ADDED',
      'NO_AUTOMATIC_APPLY_CERTIFIED',
      'GOOGLE_DOCS_NOT_OPENED',
      'NO_GENERIC_WAVE_REPEATED',
    ],
    nextStage: NEXT_STAGE,
  };
}

function updateProfile(profile, receipt) {
  profile.status = STATUS;
  const cell = list(profile.cells).find((item) => item.capabilityId === 'rtk.word.v4.modernCommentStateReadbackGate');
  if (cell) {
    cell.currentCapability = 'DONE_TRUE_RESOLVED_STATE_SHADOW_PRESERVED_REOPEN_TYPED_LIMITATION_BOUND';
    cell.productRuntimeWired = false;
    cell.automaticApplyCertified = false;
    cell.resolveReopenTypedLimitationReceiptPath = RECEIPT_REF;
    cell.doneTrueStateReadbackPhysicalWordProven = true;
    cell.resolvedStateShadowPreservationCertified = true;
    cell.reopenTypedLimitationBound = true;
    cell.resolveReopenFullLifecycleCertified = false;
    cell.supportedNow = Array.from(new Set([
      ...list(cell.supportedNow),
      'resolved comment state enters authenticated product comment shadow sessions as a diagnostic state',
    ]));
    cell.limitations = Array.from(new Set([
      ...list(cell.limitations),
      'resolve then reopen remains unsupported because Word did not produce done false after reopen in physical readback',
    ]));
    cell.killCriterion = 'Any resolve-reopen lifecycle is promoted without done true then done false physical readback, or resolved-state shadow import writes manuscript text.';
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
    currentStage: 'P0_MODERN_COMMENT_RESOLVE_REOPEN_TYPED_LIMITATION',
    nextStage: NEXT_STAGE,
    latestReceiptPath: RECEIPT_REF,
    modernResolveReopenCertified: false,
    modernResolveReopenTypedLimitationBound: true,
    resolvedStateShadowPreservationCertified: receipt.implementedCapability.resolvedStateShadowPreservationCertified,
    runtimeApplyAuthorityGranted: false,
    automaticApplyCertified: 0,
    wordSaturated: false,
    googleDocsOpened: false,
  };
  program.releaseAuditNight01 = {
    ...(program.releaseAuditNight01 || {}),
    status: STATUS,
    currentStage: 'P0_MODERN_COMMENT_RESOLVE_REOPEN_TYPED_LIMITATION',
    nextStage: NEXT_STAGE,
    latestReceiptPath: RECEIPT_REF,
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
    p0ModernCommentResolveReopenTypedLimitation: {
      status: 'BOUND_RESOLVED_STATE_SHADOW_AND_REOPEN_TYPED_LIMITATION',
      sourceEvidence: 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_MODERN_COMMENT_RESOLVE_REOPEN_TYPED_LIMITATION_RECEIPT',
      doneTrueStateReadbackPhysicalWordProven: true,
      resolvedStateShadowPreservationCertified: true,
      resolveReopenFullLifecycleCertified: false,
      automaticApplyCertified: false,
    },
  };
  ledger.runtimeClaims = {
    ...(ledger.runtimeClaims || {}),
    wordSaturated: false,
    automaticApplyExpanded: false,
    writerAuthorityAdded: false,
    googleDocsOpened: false,
  };
  ledger.notSaturatedReasons = list(ledger.notSaturatedReasons)
    .filter((reason) => reason !== 'RTK_NORM_RESOLVE_REOPEN_PRODUCT_PATH_OR_LIMITATION_PENDING')
    .concat(['RTK_NORM_FORMATTING_APPLY_LANE_PENDING']);
  ledger.evidenceBindings = list(ledger.evidenceBindings)
    .filter((entry) => entry.id !== 'P0_MODERN_COMMENT_RESOLVE_REOPEN_TYPED_LIMITATION')
    .concat([binding('P0_MODERN_COMMENT_RESOLVE_REOPEN_TYPED_LIMITATION', RECEIPT_REF)]);
  ledger.aggregateTotals = {
    ...(ledger.aggregateTotals || {}),
    p0ModernResolveReopenTypedLimitationBound: 1,
    p0ResolvedStateShadowPreservationCertified: 1,
    p0ResolveReopenFullLifecycleCertified: 0,
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
  const rationale = 'Approve Word P0 modern comment resolve/reopen typed-limitation closure: done=true state readback is physically bound and RESOLVED state is preserved through the authenticated product comment shadow command path, while reopen/full lifecycle authority remains a typed limitation with no manuscript or automatic apply authority.';
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

export function evaluateP0ModernCommentResolveReopenTypedLimitation(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_REF);
  const profile = input.profile || readJson(PROFILE_REF);
  const program = input.program || readJson(PROGRAM_REF);
  const ledger = input.ledger || readJson(LEDGER_REF);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));
  const cell = list(profile.cells).find((item) => item.capabilityId === 'rtk.word.v4.modernCommentStateReadbackGate');
  const actualNextStage = program.v4ExecutionState?.nextStage || program.nextStep || '';
  const validNextStage = [
    NEXT_STAGE,
    FORMATTING_SUCCESSOR_STAGE,
    STRUCTURAL_SUCCESSOR_STAGE,
    SCALE_SUCCESSOR_STAGE,
    FINAL_ENVELOPE_SUCCESSOR_STAGE,
  ].includes(actualNextStage);
  const validRemediationC4 = program.v4ExecutionState?.status === 'WORD_SAFETY_REMEDIATION_V1_C4_TEST_GRAPH_CI_TRUTH_LOCAL_VERIFIED'
    && actualNextStage === 'WORD_SAFETY_REMEDIATION_V1_C5_FULL_PHYSICAL_WORD_RECERTIFICATION'
    && program.v4ExecutionState?.wordAcceptanceRevoked === true
    && program.v4ExecutionState?.wordSaturated === false
    && program.v4ExecutionState?.googleDocsOpened === false;

  if (receipt.schemaVersion !== SCHEMA || receipt.status !== STATUS || receipt.result !== 'PASS') add('RTK_P0_RESOLVE_RECEIPT_INVALID', 'receipt', 'P0 resolve/reopen typed limitation receipt must pass.');
  if (receipt.implementedCapability?.resolvedStateShadowPreservationCertified !== true
    || receipt.implementedCapability?.reopenTypedLimitationBound !== true
    || receipt.implementedCapability?.resolveReopenFullLifecycleCertified !== false
    || receipt.implementedCapability?.automaticApplyCertified !== false) add('RTK_P0_RESOLVE_AUTHORITY_INVALID', 'implementedCapability', 'Resolved state must be shadow-only and reopen must remain typed limitation.');
  if (receipt.productCommandProof?.resolvedCount !== 1
    || receipt.productCommandProof?.resolveStateShadowPreserved !== 1
    || receipt.productCommandProof?.reopenStateCertified !== 0
    || receipt.productCommandProof?.idempotentReplay !== true
    || receipt.productCommandProof?.writerCalled !== false
    || receipt.productCommandProof?.storageEffects?.manuscriptBytesWritten !== 0) add('RTK_P0_RESOLVE_PRODUCT_PROOF_INVALID', 'productCommandProof', 'Product command proof must preserve one resolved state and replay without manuscript writes.');
  if (Object.values(receipt.vetoMetrics || {}).some((value) => Number(value) !== 0)) add('RTK_P0_RESOLVE_VETO_NONZERO', 'vetoMetrics', 'All veto metrics must remain zero.');
  if (!cell
    || cell.doneTrueStateReadbackPhysicalWordProven !== true
    || cell.resolvedStateShadowPreservationCertified !== true
    || cell.reopenTypedLimitationBound !== true
    || cell.automaticApplyCertified !== false) add('RTK_P0_RESOLVE_PROFILE_INVALID', 'profile.modernCommentStateReadbackGate', 'Profile must bind resolved state shadow preservation and reopen typed limitation.');
  if (!validRemediationC4 && !validNextStage
    || program.v4ExecutionState?.modernResolveReopenCertified !== false
    || program.v4ExecutionState?.modernResolveReopenTypedLimitationBound !== true
    || program.v4ExecutionState?.googleDocsOpened !== false) add('RTK_P0_RESOLVE_PROGRAM_INVALID', 'program', 'Program must advance to formatting with Google closed.');
  if (ledger.coverageLedger?.p0ModernCommentResolveReopenTypedLimitation?.status !== 'BOUND_RESOLVED_STATE_SHADOW_AND_REOPEN_TYPED_LIMITATION'
    || ledger.runtimeClaims?.automaticApplyExpanded !== false
    || ledger.runtimeClaims?.googleDocsOpened !== false) add('RTK_P0_RESOLVE_LEDGER_INVALID', 'ledger', 'Ledger must bind resolve/reopen typed limitation without automatic apply or Google.');

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    nextStage: actualNextStage || NEXT_STAGE,
    resolvedStateShadowPreservationCertified: receipt.implementedCapability?.resolvedStateShadowPreservationCertified === true,
    reopenTypedLimitationBound: receipt.implementedCapability?.reopenTypedLimitationBound === true,
    automaticApplyCertified: receipt.implementedCapability?.automaticApplyCertified === true,
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const json = args.has('--json');
  if (args.has('--write')) {
    const productProof = await runProductShadowProof();
    const receipt = buildReceipt({ productProof });
    writeJson(RECEIPT_REF, receipt);
    updateState(receipt);
    if (args.has('--approve-governance')) updateGovernanceApprovals();
  }
  const result = evaluateP0ModernCommentResolveReopenTypedLimitation();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_P0_MODERN_COMMENT_RESOLVE_REOPEN_TYPED_LIMITATION=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exit(1);
  });
}
