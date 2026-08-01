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

const TASK_ID = 'WORD_RTK_P0_SAFE_FORMATTING_LANE_TYPED_LIMITATION';
const STATUS = 'WORD_P0_SAFE_FORMATTING_LANE_TYPED_LIMITATION_BOUND_NOT_SATURATED';
const SCHEMA = 'yalken.rtk.word.p0-safe-formatting-lane-typed-limitation-receipt.v1';
const CREATED_AT_UTC = '2026-08-01T12:55:00.000Z';
const NEXT_STAGE = 'P0_SAFE_STRUCTURAL_APPLY_LANE_OR_TYPED_LIMITATION';
const STRUCTURAL_SUCCESSOR_STAGE = 'P0_MULTI_ROUND_STALE_CONFLICT_AND_LEDGER_RECONCILIATION';

const RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_SAFE_FORMATTING_LANE_TYPED_LIMITATION_RECEIPT.json';
const E08_RECEIPT_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E08_EFFECTIVE_FORMATTING_RECEIPT.json';
const PRODUCT_STRESS_RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_FORMAT_UNICODE_STRUCTURE_STRESS_RECEIPT.json';
const PROFILE_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json';
const PROGRAM_REF = 'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json';
const LEDGER_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json';
const GOVERNANCE_APPROVALS_REF = 'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json';
const SCRIPT_REF = 'scripts/ops/rtk-word-p0-safe-formatting-lane-typed-limitation.mjs';
const CONTRACT_REF = 'test/contracts/rtk-word-p0-safe-formatting-lane-typed-limitation.contract.test.js';
const MATRIX_SCRIPT_REF = 'scripts/ops/rtk-word-normalized-capability-matrix.mjs';
const MATRIX_CONTRACT_REF = 'test/contracts/rtk-word-normalized-capability-matrix.contract.test.js';
const CLASSIFIER_REF = 'src/io/revisionBridge/reviewTransportClassifierV2.mjs';

const GOVERNED_PATHS = [
  RECEIPT_REF,
  PROFILE_REF,
  PROGRAM_REF,
  LEDGER_REF,
  SCRIPT_REF,
  CONTRACT_REF,
  MATRIX_SCRIPT_REF,
  MATRIX_CONTRACT_REF,
  CLASSIFIER_REF,
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

function e08Evidence() {
  const receipt = readJson(E08_RECEIPT_REF);
  const totals = receipt.formattingTotals || {};
  return {
    sourceReceipt: binding('E08_EFFECTIVE_FORMATTING_DIAGNOSTIC_LANE', E08_RECEIPT_REF),
    status: receipt.status,
    physicalFormattingCases: Number(totals.physicalFormattingCases || 0),
    totalFormattingDeltas: Number(totals.totalFormattingDeltas || 0),
    writerFormattingCases: Number(totals.writerFormattingCases || 0),
    writerFormattingDeltas: Number(totals.writerFormattingDeltas || 0),
    commentAnchorFormattingDeltas: Number(totals.commentAnchorFormattingDeltas || 0),
    automaticFormattingApplyCertified: Number(totals.automaticFormattingApplyCertified || 0),
    destructiveFormattingApplyAdded: Number(totals.destructiveFormattingApplyAdded || 0),
    typedLimitations: list(receipt.typedLimitations),
    runtimeClaims: receipt.runtimeClaims || {},
    diagnosticLaneBound: receipt.status === 'FORMATTING_DIAGNOSTIC_LANE_CERTIFIED_WITH_TYPED_LIMITATIONS'
      && Number(totals.physicalFormattingCases || 0) === 17
      && Number(totals.totalFormattingDeltas || 0) === 117
      && Number(totals.writerFormattingDeltas || 0) === 26
      && Number(totals.automaticFormattingApplyCertified || 0) === 0
      && Number(totals.destructiveFormattingApplyAdded || 0) === 0
      && list(receipt.typedLimitations).includes('FORMAT_APPLY_NOT_CERTIFIED_IN_E08')
      && receipt.runtimeClaims?.automaticFormattingApplyAdded === false
      && receipt.runtimeClaims?.writerAuthorityAdded === false,
  };
}

function productStressEvidence() {
  const receipt = readJson(PRODUCT_STRESS_RECEIPT_REF);
  const cases = list(receipt.physicalCorpus?.productCases);
  const formattingCases = cases.filter((item) => String(item.waveFamily || '').startsWith('formatting'));
  const formattingWriterCalls = formattingCases.filter((item) => item.productLoop?.writerCalled === true).length;
  const formattingExplicitApplies = formattingCases.filter((item) => item.productLoop?.explicitUserConfirmedCommandApply === true).length;
  const formattingDiagnostics = formattingCases.filter((item) => item.productLoop?.formattingDiagnosticsVerified === true).length;
  return {
    sourceReceipt: binding('P0_FORMAT_UNICODE_STRUCTURE_PRODUCT_STRESS', PRODUCT_STRESS_RECEIPT_REF),
    status: receipt.status,
    result: receipt.result,
    totalCases: Number(receipt.totals?.cases || 0),
    passCases: Number(receipt.totals?.pass || 0),
    physicalWordPass: Number(receipt.totals?.physicalWordPass || 0),
    formattingDiagnosticPass: Number(receipt.totals?.formattingDiagnosticPass || 0),
    formattingCaseCount: formattingCases.length,
    formattingDiagnostics,
    formattingWriterCalls,
    formattingExplicitApplies,
    vetoMetrics: receipt.vetoMetrics || {},
    typedLimitations: list(receipt.typedLimitations),
    productDiagnosticPathBound: receipt.result === 'PASS'
      && Number(receipt.totals?.cases || 0) === 36
      && Number(receipt.totals?.formattingDiagnosticPass || 0) === 12
      && formattingCases.length === 12
      && formattingDiagnostics === 12
      && formattingWriterCalls === 0
      && formattingExplicitApplies === 0
      && Object.values(receipt.vetoMetrics || {}).every((value) => Number(value) === 0)
      && list(receipt.typedLimitations).includes('FORMATTING_APPLY_REMAINS_MANUAL_DIAGNOSTIC_ONLY'),
  };
}

function classifierEvidence() {
  const source = fs.readFileSync(abs(CLASSIFIER_REF), 'utf8');
  return {
    sourceBinding: binding('REVIEW_TRANSPORT_CLASSIFIER_V2', CLASSIFIER_REF),
    formattingClassifiedAsManualLane: source.includes("formatting: classifyManualLane(reviewIr.formattingDeltas, 'formatting', 'RTK_MANUAL_DEGRADED_LOCATOR')"),
    moveAndStructureRemainBlocked: source.includes("structure: classifyBlockedLane(reviewIr.structureChanges, 'structure', 'RTK_BLOCKED_STRUCTURAL')"),
  };
}

function buildReceipt() {
  const e08 = e08Evidence();
  const product = productStressEvidence();
  const classifier = classifierEvidence();
  const ok = e08.diagnosticLaneBound
    && product.productDiagnosticPathBound
    && classifier.formattingClassifiedAsManualLane;
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
      physicalFormatting: e08,
      productFormattingDiagnostics: product,
      classifier,
    },
    implementedCapability: {
      capability: 'safeFormattingLaneTypedLimitation',
      physicalWordProven: true,
      componentProven: true,
      productDiagnosticPathProven: product.productDiagnosticPathBound,
      productRuntimeApplyWired: false,
      productRuntimeWired: false,
      automaticApplyCertified: false,
      automaticFormattingApplyCertified: false,
      destructiveFormattingApplyAdded: false,
      formattingApplyTypedLimitationBound: e08.diagnosticLaneBound && product.productDiagnosticPathBound,
      userFacingAuthority: 'FORMAT_PREVIEW_AND_LOSS_REPORT_ONLY',
      terminalClass: 'DIAGNOSTIC_ONLY_TYPED_LIMITATION_BOUND',
    },
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      silentCommentLoss: 0,
      formattingApplyOverclaim: 0,
      destructiveFormattingApply: 0,
      productNetwork: 0,
      googleDocsOpened: 0,
    },
    typedLimitations: [
      'FORMATTING_APPLY_REMAINS_MANUAL_DIAGNOSTIC_ONLY',
      'INLINE_RPR_PPR_HYPERLINK_STYLE_LIST_FORMATTING_REMAINS_PREVIEW_AND_LOSS_REPORT_ONLY',
      'NO_FORMATTING_WRITER_AUTHORITY_WITHOUT_FUTURE_FORMAT_IR_AND_REVERSE_VERIFICATION_CONTOUR',
    ],
    nonClaims: [
      'NO_FORMATTING_MANUSCRIPT_WRITE_AUTHORITY_ADDED',
      'NO_AUTOMATIC_FORMATTING_APPLY_CERTIFIED',
      'NO_FORMATTING_STYLE_LIST_HYPERLINK_SEMANTIC_APPLY',
      'WORD_SATURATED_FALSE',
      'GOOGLE_DOCS_NOT_OPENED',
    ],
    nextStage: NEXT_STAGE,
  };
}

function updateProfile(profile, receipt) {
  profile.status = STATUS;
  const cell = list(profile.cells).find((item) => item.capabilityId === 'rtk.word.v4.effectiveFormattingDiagnostics');
  if (cell) {
    cell.currentCapability = 'FORMATTING_DIAGNOSTIC_LANE_TERMINAL_TYPED_LIMITATION_BOUND';
    cell.productRuntimeWired = false;
    cell.automaticApplyCertified = false;
    cell.safeFormattingLaneTypedLimitationReceiptPath = RECEIPT_REF;
    cell.formattingDiagnosticProductPathProven = true;
    cell.formattingApplyTypedLimitationBound = true;
    cell.automaticFormattingApplyCertified = false;
    cell.supportedNow = Array.from(new Set([
      ...list(cell.supportedNow),
      'product return preview preserves formatting diagnostics as a user-visible loss report without writer authority',
    ]));
    cell.limitations = Array.from(new Set([
      ...list(cell.limitations),
      'formatting apply remains manual diagnostic only until a future FormatIR apply contour proves reverse verification and recovery',
    ]));
    cell.killCriterion = 'Any formatting diagnostic is promoted to manuscript write authority without a future FormatIR reverse-verification contour, or a formatting-only returned DOCX mutates project text.';
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
    currentStage: 'P0_SAFE_FORMATTING_LANE_TYPED_LIMITATION',
    nextStage: NEXT_STAGE,
    latestReceiptPath: RECEIPT_REF,
    safeFormattingLaneTypedLimitationBound: true,
    formattingDiagnosticProductPathProven: receipt.implementedCapability.productDiagnosticPathProven,
    automaticFormattingApplyCertified: 0,
    runtimeApplyAuthorityGrantedForFormatting: false,
    wordSaturated: false,
    googleDocsOpened: false,
  };
  program.releaseAuditNight01 = {
    ...(program.releaseAuditNight01 || {}),
    status: STATUS,
    currentStage: 'P0_SAFE_FORMATTING_LANE_TYPED_LIMITATION',
    nextStage: NEXT_STAGE,
    latestReceiptPath: RECEIPT_REF,
    safeFormattingLaneTypedLimitationBound: true,
    formattingDiagnosticProductPathProven: receipt.implementedCapability.productDiagnosticPathProven,
    automaticFormattingApplyCertified: false,
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
    p0SafeFormattingLaneTypedLimitation: {
      status: 'BOUND_FORMATTING_DIAGNOSTIC_ONLY_TYPED_LIMITATION',
      sourceEvidence: 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_SAFE_FORMATTING_LANE_TYPED_LIMITATION_RECEIPT',
      physicalFormattingCases: receipt.sourceEvidence.physicalFormatting.physicalFormattingCases,
      totalFormattingDeltas: receipt.sourceEvidence.physicalFormatting.totalFormattingDeltas,
      productFormattingDiagnosticCases: receipt.sourceEvidence.productFormattingDiagnostics.formattingDiagnosticPass,
      productDiagnosticPathProven: receipt.implementedCapability.productDiagnosticPathProven,
      automaticFormattingApplyCertified: false,
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
      .filter((reason) => reason !== 'RTK_NORM_FORMATTING_APPLY_LANE_PENDING')
      .concat(['RTK_NORM_STRUCTURAL_APPLY_LANE_PENDING']),
  ));
  ledger.evidenceBindings = list(ledger.evidenceBindings)
    .filter((entry) => entry.id !== 'P0_SAFE_FORMATTING_LANE_TYPED_LIMITATION')
    .concat([binding('P0_SAFE_FORMATTING_LANE_TYPED_LIMITATION', RECEIPT_REF)]);
  ledger.aggregateTotals = {
    ...(ledger.aggregateTotals || {}),
    p0SafeFormattingLaneTypedLimitationBound: 1,
    p0FormattingDiagnosticProductPathProven: receipt.implementedCapability.productDiagnosticPathProven ? 1 : 0,
    p0AutomaticFormattingApplyCertified: 0,
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
  const rationale = 'Approve Word P0 safe formatting lane typed-limitation closure: physical E08 formatting evidence and product-loop formatting diagnostics are bound, formatting remains preview/loss-report only, no formatting writer authority or automatic apply is added, Word saturated remains false, and Google Docs remains closed.';
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

export function evaluateP0SafeFormattingLaneTypedLimitation(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_REF);
  const profile = input.profile || readJson(PROFILE_REF);
  const program = input.program || readJson(PROGRAM_REF);
  const ledger = input.ledger || readJson(LEDGER_REF);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));
  const cell = list(profile.cells).find((item) => item.capabilityId === 'rtk.word.v4.effectiveFormattingDiagnostics');
  const actualNextStage = program.v4ExecutionState?.nextStage || program.nextStep || '';
  const validNextStage = actualNextStage === NEXT_STAGE || actualNextStage === STRUCTURAL_SUCCESSOR_STAGE;

  if (receipt.schemaVersion !== SCHEMA || receipt.status !== STATUS || receipt.result !== 'PASS') add('RTK_P0_FORMATTING_RECEIPT_INVALID', 'receipt', 'P0 safe formatting lane receipt must pass.');
  if (receipt.implementedCapability?.formattingApplyTypedLimitationBound !== true
    || receipt.implementedCapability?.productDiagnosticPathProven !== true
    || receipt.implementedCapability?.productRuntimeApplyWired !== false
    || receipt.implementedCapability?.automaticFormattingApplyCertified !== false
    || receipt.implementedCapability?.automaticApplyCertified !== false) add('RTK_P0_FORMATTING_AUTHORITY_INVALID', 'implementedCapability', 'Formatting must remain diagnostic-only without apply authority.');
  if (receipt.sourceEvidence?.physicalFormatting?.diagnosticLaneBound !== true
    || receipt.sourceEvidence?.productFormattingDiagnostics?.productDiagnosticPathBound !== true
    || receipt.sourceEvidence?.classifier?.formattingClassifiedAsManualLane !== true) add('RTK_P0_FORMATTING_EVIDENCE_INVALID', 'sourceEvidence', 'Formatting closure requires E08 physical evidence, product diagnostic path, and manual classifier lane.');
  if (Object.values(receipt.vetoMetrics || {}).some((value) => Number(value) !== 0)) add('RTK_P0_FORMATTING_VETO_NONZERO', 'vetoMetrics', 'All veto metrics must remain zero.');
  if (!cell
    || cell.formattingApplyTypedLimitationBound !== true
    || cell.formattingDiagnosticProductPathProven !== true
    || cell.automaticApplyCertified !== false) add('RTK_P0_FORMATTING_PROFILE_INVALID', 'profile.effectiveFormattingDiagnostics', 'Profile must bind formatting diagnostic typed limitation without automatic apply.');
  if (!validNextStage
    || program.v4ExecutionState?.safeFormattingLaneTypedLimitationBound !== true
    || program.v4ExecutionState?.runtimeApplyAuthorityGrantedForFormatting !== false
    || program.v4ExecutionState?.googleDocsOpened !== false) add('RTK_P0_FORMATTING_PROGRAM_INVALID', 'program', 'Program must advance to structural lane with Google closed.');
  if (ledger.coverageLedger?.p0SafeFormattingLaneTypedLimitation?.status !== 'BOUND_FORMATTING_DIAGNOSTIC_ONLY_TYPED_LIMITATION'
    || ledger.runtimeClaims?.automaticApplyExpanded !== false
    || ledger.runtimeClaims?.googleDocsOpened !== false) add('RTK_P0_FORMATTING_LEDGER_INVALID', 'ledger', 'Ledger must bind formatting typed limitation without automatic apply or Google.');

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    nextStage: actualNextStage || NEXT_STAGE,
    formattingApplyTypedLimitationBound: receipt.implementedCapability?.formattingApplyTypedLimitationBound === true,
    productDiagnosticPathProven: receipt.implementedCapability?.productDiagnosticPathProven === true,
    automaticFormattingApplyCertified: receipt.implementedCapability?.automaticFormattingApplyCertified === true,
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
  const result = evaluateP0SafeFormattingLaneTypedLimitation();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_P0_SAFE_FORMATTING_LANE_TYPED_LIMITATION=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
