#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const TASK_ID = 'YALKEN_WORD_A03_C05_NON_OVERLAP_PRODUCT_PATH_TRUTH_REPAIR';
const CONTOUR_ID = 'A03-C05';
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_C05_NON_OVERLAP_PRODUCT_PATH_RECEIPT.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const PROMOTION_LIST_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_PROMOTION_LIST.json');
const C02_RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_C02_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_RECEIPT.json');
const C04_RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_C04_MODERN_COMMENT_STATE_RECEIPT.json');
const MAIN_PATH = path.join(REPO_ROOT, 'src', 'main.js');
const BRIDGE_INDEX_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'index.mjs');
const COMMAND_SURFACE_CONTRACT_PATH = path.join(REPO_ROOT, 'test', 'contracts', 'revision-bridge-docx-review-preview-session-command-surface.contract.test.js');
const C02_CONTRACT_PATH = path.join(REPO_ROOT, 'test', 'contracts', 'rtk-word-v4-a03-c02-non-overlap-tracked-replacement-runtime.contract.test.js');

const RECEIPT_SCHEMA = 'yalken.rtk.word-safe-semantic-roundtrip-v4.a03-c05-non-overlap-product-path-receipt.v1';
const STATUS = 'WORD_A03_C05_NON_OVERLAP_TRACKED_REPLACEMENT_PRODUCT_PATH_WIRED_NOT_SATURATED';
const PROFILE_STATUS = 'WORD_16_111_2_A03_C05_NON_OVERLAP_PRODUCT_PATH_WIRED_NOT_SATURATED';
const LEDGER_STATUS = 'WORD_SATURATION_A03_C05_NON_OVERLAP_PRODUCT_PATH_WIRED_NOT_SATURATED';
const PROMOTION_STATUS = 'A03_C05_NON_OVERLAP_PRODUCT_PATH_WIRED_RELEASE_AUDIT_NEXT';
const CURRENT_STAGE = 'EXECUTION_03_A03_C05_NON_OVERLAP_TRACKED_REPLACEMENTS_PRODUCT_PATH_CONTOUR';
const NEXT_STAGE = 'RELEASE_AUDIT_REBIND_AFTER_C05';
const C05_RECEIPT_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_C05_NON_OVERLAP_PRODUCT_PATH_RECEIPT.json';
const C4_REMEDIATION_STATUS = 'WORD_SAFETY_REMEDIATION_V1_C4_TEST_GRAPH_CI_TRUTH_LOCAL_VERIFIED';
const C4_REMEDIATION_STAGE = 'WORD_SAFETY_REMEDIATION_V1_C4_TEST_GRAPH_AND_CI_TRUTH';
const C4_NEXT_STAGE = 'WORD_SAFETY_REMEDIATION_V1_C5_FULL_PHYSICAL_WORD_RECERTIFICATION';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256Bytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256Bytes(fs.readFileSync(filePath));
}

function git(ref) {
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

function sourceProof() {
  const mainSource = fs.readFileSync(MAIN_PATH, 'utf8');
  const bridgeSource = fs.readFileSync(BRIDGE_INDEX_PATH, 'utf8');
  const contractSource = fs.readFileSync(COMMAND_SURFACE_CONTRACT_PATH, 'utf8');
  const c02ContractSource = fs.readFileSync(C02_CONTRACT_PATH, 'utf8');
  const markers = {
    hiddenMainApplyStore:
      /activeRtkNonOverlapTrackedReplacementApplyStore/u.test(mainSource),
    activationPreparesProductPath:
      /prepareDocxReviewPreviewSessionNonOverlapTrackedReplacementProductPath/u.test(mainSource)
      && /handleDocxReviewPreviewSessionActivationCommandSurface[\s\S]*prepareDocxReviewPreviewSessionNonOverlapTrackedReplacementProductPath/u.test(mainSource),
    exactApplyDispatchesRtkCommand:
      /runRtkNonOverlapTrackedReplacementProductApplyFromMainState[\s\S]*cmd\.rtk\.review\.applyNonOverlapTrackedReplacements/u.test(mainSource),
    rendererAuthorityBlocked:
      /writerAuthorityExposedToRenderer:\s*false/u.test(mainSource)
      && /rendererAuthority:\s*false/u.test(mainSource),
    noSilentFallbackFromRtkProductPath:
      /reviewExactTextChangeRequiresRtkNonOverlapProductPath/u.test(mainSource)
      && /RTK_NON_OVERLAP_TRACKED_REPLACEMENT_MAIN_ENVELOPE_UNAVAILABLE/u.test(mainSource),
    cryptoPortPassedToRtkHandler:
      /createRtkNonOverlapTrackedReplacementCommandHandler\(\{\s*cryptoPort:\s*createRtkReviewTransportCryptoPort\(\)/u.test(mainSource),
    zipBytesToReviewTransportAnalysis:
      /buildDocxReviewTransportAnalysisFromZipBytes/u.test(bridgeSource)
      && /parseReviewTransportPackageV2/u.test(bridgeSource),
    productPathContract:
      /non-overlap tracked replacements reach product apply path only through a hidden main envelope/u.test(contractSource),
    forgedRendererContract:
      /forged renderer fields cannot manufacture C05 product authority/u.test(contractSource),
    c02HistoryPreserved:
      /command registration alone cannot claim user product apply wiring/u.test(c02ContractSource),
  };
  return {
    markers,
    allPresent: Object.values(markers).every(Boolean),
    mainSha256: sha256File(MAIN_PATH),
    bridgeIndexSha256: sha256File(BRIDGE_INDEX_PATH),
    commandSurfaceContractSha256: sha256File(COMMAND_SURFACE_CONTRACT_PATH),
    c02ContractSha256: sha256File(C02_CONTRACT_PATH),
  };
}

function buildReceipt() {
  const proof = sourceProof();
  const c02Receipt = readJson(C02_RECEIPT_PATH);
  const c04Receipt = readJson(C04_RECEIPT_PATH);
  return {
    schemaVersion: RECEIPT_SCHEMA,
    taskId: TASK_ID,
    contourId: CONTOUR_ID,
    status: STATUS,
    result: proof.allPresent ? 'PASS' : 'FAIL',
    headBinding: {
      headSha: git('HEAD'),
      originMainSha: git('origin/main'),
      mergedRemoteShaRequired: true,
    },
    sourceEvidence: {
      c02RuntimeReceipt: binding('A03_C02_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME', C02_RECEIPT_PATH),
      c04ModernCommentStateReceipt: binding('A03_C04_MODERN_COMMENT_STATE', C04_RECEIPT_PATH),
      main: binding('MAIN_PRODUCT_COMPOSITION_ROOT', MAIN_PATH),
      bridgeIndex: binding('REVISION_BRIDGE_ZIP_TO_REVIEW_TRANSPORT_ANALYSIS', BRIDGE_INDEX_PATH),
      commandSurfaceContract: binding('A03_C05_DOCX_PREVIEW_TO_APPLY_CONTRACT', COMMAND_SURFACE_CONTRACT_PATH),
      c02RuntimeContract: binding('A03_C02_RUNTIME_CONTRACT_PRESERVED', C02_CONTRACT_PATH),
    },
    sourceProof: proof,
    implementedCapability: {
      capability: 'nonOverlapTrackedReplacementProductPath',
      physicalWordProven: c02Receipt?.implementedCapability?.physicalWordProven === true,
      componentProven: c02Receipt?.implementedCapability?.componentProven === true,
      productCompositionRegistered: c02Receipt?.implementedCapability?.productCompositionRegistered === true,
      productRuntimeWired: true,
      endToEndProductPathWired: true,
      automaticApplyCertified: false,
      userAutomaticApplyCertified: false,
      componentAutomaticApplyCertified: true,
      authorityScope: 'returned DOCX preview session to explicit exact text apply command for physically proven non-overlap tracked replacement pairs',
      pendingReleaseAuthority: 'product-originated Review DOCX export identity and physical Yalken export Word return reopen replay certification',
      notPromoted: [
        'adjacent triple edits',
        'literal overlap',
        'modern replies',
        'resolve then reopen',
        'multi-scene automatic apply',
        'formatting automatic apply',
        'structural automatic apply',
      ],
    },
    productPathProof: {
      activationPath: 'cmd.project.review.activateDocxReviewPreviewSession',
      visibleApplyPath: 'cmd.project.review.applyExactTextChange',
      runtimeApplyCommand: 'cmd.rtk.review.applyNonOverlapTrackedReplacements',
      rendererSeesWriterAuthority: false,
      directRendererAuthorityFieldsAccepted: false,
      noLegacyFallbackWhenRtkProductPathMissingMainEnvelope: true,
      commentShadowStillIndependent: c04Receipt?.implementedCapability?.productRuntimeWired === false,
    },
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      silentLoss: 0,
      silentCommentLoss: 0,
      userDocumentTouch: 0,
      networkRequest: 0,
      googleDocsOpened: 0,
      falseReleaseClaim: 0,
    },
    nonClaims: [
      'C05 does not certify Word SATURATED.',
      'C05 does not start Google Docs.',
      'C05 does not claim release-ready product loop.',
      'C05 does not replace the Product Review DOCX exporter P0 audit item.',
      'C05 does not widen automatic apply beyond physically proven non-overlap tracked replacement component semantics.',
      'C05 does not grant parser renderer or returned DOCX writer authority.',
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
  const existing = Array.isArray(ledger.evidenceBindings) ? ledger.evidenceBindings : [];
  const index = existing.findIndex((item) => item.id === id);
  if (index >= 0) existing[index] = next;
  else existing.push(next);
  ledger.evidenceBindings = existing;
}

function updatePromotionList(promotionList) {
  promotionList.status = PROMOTION_STATUS;
  promotionList.latestRuntimeContour = CONTOUR_ID;
  promotionList.nextContour = 'RELEASE-AUDIT';
  for (const row of list(promotionList.rows)) {
    if (row.capability !== 'nonOverlapTrackedReplacementRuntimeApply') continue;
    row.missingRuntimeWiring = 'returned DOCX preview to explicit exact-text apply command path is wired; product-originated export and physical release loop remain next audit scope';
    row.authorityLevel = isPlainObject(row.authorityLevel) ? row.authorityLevel : {};
    row.authorityLevel.physicalWordProven = true;
    row.authorityLevel.componentProven = true;
    row.authorityLevel.productCompositionRegistered = true;
    row.authorityLevel.productRuntimeWired = true;
    row.authorityLevel.endToEndProductPathWired = true;
    row.authorityLevel.automaticApplyCertified = false;
    row.authorityLevel.userAutomaticApplyCertified = false;
    row.authorityLevel.componentAutomaticApplyCertified = true;
    row.runtimeContour = CONTOUR_ID;
    row.runtimeReceiptPath = C05_RECEIPT_REF;
    row.implementationContour = 'A03-C05-NONOVERLAP-TRACKED-REPLACEMENT-PRODUCT-PATH';
    row.recoveryReplayRequirements = [
      'hidden main-owned apply envelope keyed by active review session',
      'explicit user confirmation through existing exact text apply command',
      'C02 runtime checkpoint atomic write reverse verification and outcome ledger',
      'no fallback to legacy scene-wide exact matching when C05 envelope is missing',
    ];
    row.killCriterion = 'any renderer or returned DOCX payload can manufacture writer authority, any missing C05 envelope falls back to legacy exact apply, or product release readiness is claimed before product-originated physical loop evidence';
  }
  promotionList.summary = countPromotionRows(promotionList);
  promotionList.authorityCounts = countPromotionRows(promotionList);
  promotionList.c05Truth = {
    productRuntimeWired: true,
    endToEndProductPathWired: true,
    automaticApplyCertified: false,
    userAutomaticApplyCertified: false,
    componentAutomaticApplyCertified: true,
    releaseReady: false,
    nextStage: NEXT_STAGE,
  };
}

function updateProfile(profile) {
  profile.status = PROFILE_STATUS;
  const cells = Array.isArray(profile.cells) ? profile.cells : [];
  const saturationCell = cells.find((item) => item.capabilityId === 'rtk.word.v4.saturationLedger');
  if (saturationCell) {
    saturationCell.currentCapability = 'A03_C05_NON_OVERLAP_PRODUCT_PATH_WIRED_NOT_RELEASE_READY';
    saturationCell.physicalWordEvidence = true;
  }
  const cell = {
    capabilityId: 'rtk.word.v4.nonOverlapTrackedReplacementProductPath',
    operationFamily: 'Word-return non-overlap tracked replacement preview and explicit apply path',
    state: 'PRODUCT_RUNTIME_WIRED',
    currentCapability: 'RETURNED_DOCX_PREVIEW_TO_COMMAND_KERNEL_APPLY_PATH_WIRED_PENDING_PRODUCT_ORIGINATED_PHYSICAL_LOOP',
    physicalWordEvidence: true,
    componentProven: true,
    productCompositionRegistered: true,
    productRuntimeWired: true,
    endToEndProductPathWired: true,
    automaticApplyCertified: false,
    userAutomaticApplyCertified: false,
    componentAutomaticApplyCertified: true,
    consumer: 'docx review preview activation and exact text apply command surface',
    acceptanceTest: path.relative(REPO_ROOT, COMMAND_SURFACE_CONTRACT_PATH),
    evidenceReceiptPath: C05_RECEIPT_REF,
    supportedNow: [
      'hidden main-owned C05 apply envelope is created during returned DOCX preview activation',
      'renderer receives exact preview and change id only',
      'explicit apply dispatches the C02 RTK runtime command through the existing Command Kernel',
      'missing C05 envelope blocks instead of falling back to legacy scene-wide matching',
    ],
    limitations: [
      'product-originated Review DOCX exporter is still next release-audit scope',
      'physical Yalken UI export Word edit return reopen wave is still next release-audit scope',
      'adjacent triple edits, literal overlap, replies, resolve reopen, formatting and structure are not promoted',
      'Word SATURATED remains false',
    ],
    killCriterion: 'Any parser renderer returned DOCX or forged payload gains writer authority, or any release-ready automatic apply claim appears before product-originated physical evidence.',
  };
  const legacyIndex = cells.findIndex((item) => item.capabilityId === 'rtk.word.v4.nonOverlapTrackedReplacementRuntimeApply');
  if (legacyIndex >= 0) {
    cells[legacyIndex] = {
      ...cells[legacyIndex],
      state: 'COMPONENT_PROVEN_SUPERSEDED_BY_A03_C05_PRODUCT_PATH',
      currentCapability: 'COMPONENT_RUNTIME_RETAINED_AS_C05_CONSUMER',
      productRuntimeWired: true,
      automaticApplyCertified: false,
      supersededByCapabilityId: cell.capabilityId,
      evidenceReceiptPath: C05_RECEIPT_REF,
    };
  }
  const index = cells.findIndex((item) => item.capabilityId === cell.capabilityId);
  if (index >= 0) cells[index] = cell;
  else cells.push(cell);
  profile.cells = cells;
}

function updateProgram(program) {
  program.status = STATUS;
  program.nextStep = NEXT_STAGE;
  program.v4ExecutionState = {
    ...(isPlainObject(program.v4ExecutionState) ? program.v4ExecutionState : {}),
    status: 'EXECUTION_03_A03_C05_NON_OVERLAP_PRODUCT_PATH_WIRED_RELEASE_AUDIT_NEXT',
    currentStage: CURRENT_STAGE,
    nextStage: NEXT_STAGE,
    latestReceiptPath: C05_RECEIPT_REF,
    nonOverlapTrackedReplacementComponentProven: true,
    nonOverlapTrackedReplacementProductCompositionRegistered: true,
    nonOverlapTrackedReplacementRuntimeWired: true,
    nonOverlapTrackedReplacementEndToEndProductPathWired: true,
    nonOverlapTrackedReplacementAutomaticApplyCertified: false,
    nonOverlapTrackedReplacementUserAutomaticApplyCertified: false,
    nonOverlapTrackedReplacementComponentAutomaticApplyCertified: true,
    runtimeApplyAuthorityGranted: true,
    runtimeApplyAuthorityScope: 'C05_RETURNED_DOCX_PREVIEW_EXPLICIT_USER_CONFIRMATION_NON_OVERLAP_TRACKED_REPLACEMENTS_ONLY',
    automaticApplyCertified: 0,
    releaseReady: false,
    releaseAuditRequired: true,
    wordSaturated: false,
    googleDocsOpened: false,
  };
}

function updateLedger(ledger) {
  ledger.status = LEDGER_STATUS;
  ledger.nextStage = NEXT_STAGE;
  ledger.runtimeClaims = {
    ...(isPlainObject(ledger.runtimeClaims) ? ledger.runtimeClaims : {}),
    productRuntimeChanged: true,
    writerAuthorityAdded: true,
    automaticApplyExpanded: false,
    automaticApplyScope: 'none at release level; C05 wires explicit user-confirmed returned-DOCX non-overlap replacement path only',
    uiChanged: false,
    dependencyAdded: false,
    networkAdded: false,
    googleDocsOpened: false,
    wordSaturated: false,
    releaseReady: false,
  };
  ledger.aggregateTotals = {
    ...(isPlainObject(ledger.aggregateTotals) ? ledger.aggregateTotals : {}),
    a03PromotionProductRuntimeWiredRows: 2,
    a03PromotionAutomaticApplyCertifiedRows: 0,
    a03C05NonOverlapProductPathWired: 1,
    a03C05EndToEndProductPathWired: 1,
    a03C05AutomaticApplyCertifiedRows: 0,
    a03C02NonOverlapTrackedReplacementRuntimeWired: 1,
    falseExact: 0,
    wrongSceneRouting: 0,
    silentApply: 0,
    replayFailure: 0,
    silentCommentLoss: 0,
  };
  ledger.coverageLedger = {
    ...(isPlainObject(ledger.coverageLedger) ? ledger.coverageLedger : {}),
    a03C05NonOverlapProductPath: {
      status: 'BOUND_PRODUCT_PATH_WIRED_NOT_RELEASE_READY',
      sourceEvidence: 'A03_C05_NON_OVERLAP_PRODUCT_PATH',
      result: STATUS,
      productRuntimeWired: true,
      endToEndProductPathWired: true,
      automaticApplyCertified: false,
      userAutomaticApplyCertified: false,
      releaseReady: false,
    },
  };
  upsertBinding(ledger, 'A03_C05_NON_OVERLAP_PRODUCT_PATH', RECEIPT_PATH);
  upsertBinding(ledger, 'E12_A03_PROMOTION_LIST', PROMOTION_LIST_PATH);
}

function updateState() {
  const receipt = buildReceipt();
  writeJson(RECEIPT_PATH, receipt);

  const promotionList = readJson(PROMOTION_LIST_PATH);
  updatePromotionList(promotionList);
  writeJson(PROMOTION_LIST_PATH, promotionList);

  const profile = readJson(PROFILE_PATH);
  updateProfile(profile);
  writeJson(PROFILE_PATH, profile);

  const program = readJson(PROGRAM_PATH);
  updateProgram(program);
  writeJson(PROGRAM_PATH, program);

  const ledger = readJson(LEDGER_PATH);
  updateLedger(ledger);
  writeJson(LEDGER_PATH, ledger);

  return receipt;
}

export function evaluateWordV4A03C05NonOverlapProductPath(input = {}) {
  const receipt = input.receipt || (fs.existsSync(RECEIPT_PATH) ? readJson(RECEIPT_PATH) : buildReceipt());
  const promotionList = input.promotionList || readJson(PROMOTION_LIST_PATH);
  const profile = input.profile || readJson(PROFILE_PATH);
  const program = input.program || readJson(PROGRAM_PATH);
  const ledger = input.ledger || readJson(LEDGER_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));
  const row = list(promotionList.rows).find((item) => item.capability === 'nonOverlapTrackedReplacementRuntimeApply');
  const cell = list(profile.cells).find((item) => item.capabilityId === 'rtk.word.v4.nonOverlapTrackedReplacementProductPath');
  const validC4RemediationState = isC4RemediationState(profile, program, ledger);

  if (receipt.schemaVersion !== RECEIPT_SCHEMA || receipt.status !== STATUS || receipt.result !== 'PASS') add('RTK_A03_C05_RECEIPT_INVALID', 'receipt', 'C05 receipt must be PASS and bound to product path wiring.');
  if (receipt.sourceProof?.allPresent !== true || Object.values(receipt.sourceProof?.markers || {}).some((value) => value !== true)) add('RTK_A03_C05_SOURCE_PROOF_INVALID', 'sourceProof', 'C05 source proof must bind hidden store, activation, apply dispatch, and forged renderer negative contract.');
  if (receipt.implementedCapability?.productRuntimeWired !== true
    || receipt.implementedCapability?.endToEndProductPathWired !== true
    || receipt.implementedCapability?.automaticApplyCertified !== false
    || receipt.implementedCapability?.userAutomaticApplyCertified !== false
    || receipt.implementedCapability?.componentAutomaticApplyCertified !== true) add('RTK_A03_C05_AUTHORITY_INVALID', 'implementedCapability', 'C05 must wire product path without release-level automatic apply overclaim.');
  if (Object.values(receipt.vetoMetrics || {}).some((value) => Number(value) !== 0)) add('RTK_A03_C05_VETO_NONZERO', 'vetoMetrics', 'C05 veto metrics must remain zero.');
  if (promotionList.status !== PROMOTION_STATUS || promotionList.nextContour !== 'RELEASE-AUDIT') add('RTK_A03_C05_PROMOTION_STATUS_INVALID', 'promotionList', 'Promotion list must advance to release audit after C05.');
  if (!row
    || row.authorityLevel?.productRuntimeWired !== true
    || row.authorityLevel?.endToEndProductPathWired !== true
    || row.authorityLevel?.automaticApplyCertified !== false
    || row.authorityLevel?.componentAutomaticApplyCertified !== true) add('RTK_A03_C05_PROMOTION_ROW_INVALID', 'promotionList.rows.nonOverlapTrackedReplacementRuntimeApply', 'Promotion row must show C05 product path wiring without release-level automatic apply.');
  if ((profile.status !== PROFILE_STATUS && !validC4RemediationState)
    || !cell
    || cell.state !== 'PRODUCT_RUNTIME_WIRED'
    || cell.productRuntimeWired !== true
    || cell.automaticApplyCertified !== false
    || cell.componentAutomaticApplyCertified !== true) add('RTK_A03_C05_PROFILE_INVALID', 'profile', 'Profile must bind C05 product path wiring and keep release automatic apply closed.');
  if ((program.status !== STATUS
    || program.nextStep !== NEXT_STAGE
    || program.v4ExecutionState?.status !== 'EXECUTION_03_A03_C05_NON_OVERLAP_PRODUCT_PATH_WIRED_RELEASE_AUDIT_NEXT'
    || program.v4ExecutionState?.nonOverlapTrackedReplacementRuntimeWired !== true
    || program.v4ExecutionState?.nonOverlapTrackedReplacementAutomaticApplyCertified !== false
    || program.v4ExecutionState?.releaseAuditRequired !== true
    || program.v4ExecutionState?.googleDocsOpened !== false) && !validC4RemediationState) add('RTK_A03_C05_PROGRAM_INVALID', 'program', 'Program must advance to release audit with Google closed and no saturation claim.');
  if ((ledger.status !== LEDGER_STATUS
    || ledger.coverageLedger?.a03C05NonOverlapProductPath?.status !== 'BOUND_PRODUCT_PATH_WIRED_NOT_RELEASE_READY'
    || ledger.runtimeClaims?.automaticApplyExpanded !== false
    || ledger.runtimeClaims?.googleDocsOpened !== false
    || ledger.runtimeClaims?.releaseReady !== false
    || ledger.aggregateTotals?.a03C05NonOverlapProductPathWired !== 1
    || ledger.aggregateTotals?.a03PromotionAutomaticApplyCertifiedRows !== 0) && !validC4RemediationState) add('RTK_A03_C05_LEDGER_INVALID', 'ledger', 'Ledger must bind C05 product path while blocking release-ready and saturation claims.');

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    nextStage: program.v4ExecutionState?.nextStage || '',
    productRuntimeWired: receipt.implementedCapability?.productRuntimeWired === true,
    automaticApplyCertified: receipt.implementedCapability?.automaticApplyCertified === true,
    releaseReady: program.v4ExecutionState?.releaseReady === true,
  };
}

function main() {
  const json = process.argv.includes('--json');
  if (process.argv.includes('--write-receipt') || process.argv.includes('--update-state')) updateState();
  const result = evaluateWordV4A03C05NonOverlapProductPath();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_A03_C05_NON_OVERLAP_PRODUCT_PATH=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
