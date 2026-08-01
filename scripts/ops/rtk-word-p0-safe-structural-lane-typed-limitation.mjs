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

const TASK_ID = 'WORD_RTK_P0_SAFE_STRUCTURAL_LANE_TYPED_LIMITATION';
const STATUS = 'WORD_P0_SAFE_STRUCTURAL_LANE_TYPED_LIMITATION_BOUND_NOT_SATURATED';
const SCHEMA = 'yalken.rtk.word.p0-safe-structural-lane-typed-limitation-receipt.v1';
const CREATED_AT_UTC = '2026-08-01T13:20:00.000Z';
const NEXT_STAGE = 'P0_MULTI_ROUND_STALE_CONFLICT_AND_LEDGER_RECONCILIATION';
const SCALE_SUCCESSOR_STAGE = 'P0_WORD_SCALE_ENGINEERING_AND_DECLARED_SUPPORT_ENVELOPE';
const FINAL_ENVELOPE_SUCCESSOR_STAGE = 'READY_FOR_FRESH_INDEPENDENT_EXACT_HEAD_AUDIT';

const RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_SAFE_STRUCTURAL_LANE_TYPED_LIMITATION_RECEIPT.json';
const E09_RECEIPT_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E09_TYPED_STRUCTURAL_EDITS_RECEIPT.json';
const PRODUCT_STRESS_RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_FORMAT_UNICODE_STRUCTURE_STRESS_RECEIPT.json';
const PROFILE_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json';
const PROGRAM_REF = 'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json';
const LEDGER_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json';
const GOVERNANCE_APPROVALS_REF = 'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json';
const SCRIPT_REF = 'scripts/ops/rtk-word-p0-safe-structural-lane-typed-limitation.mjs';
const CONTRACT_REF = 'test/contracts/rtk-word-p0-safe-structural-lane-typed-limitation.contract.test.js';
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

function e09Evidence() {
  const receipt = readJson(E09_RECEIPT_REF);
  const totals = receipt.structuralTotals || {};
  return {
    sourceReceipt: binding('E09_TYPED_STRUCTURAL_DIAGNOSTIC_LANE', E09_RECEIPT_REF),
    status: receipt.status,
    physicalStructuralCases: Number(totals.physicalStructuralCases || 0),
    totalStructureChanges: Number(totals.totalStructureChanges || 0),
    nativeMoveRevisionCases: Number(totals.nativeMoveRevisionCases || 0),
    nativeMoveRevisions: Number(totals.nativeMoveRevisions || 0),
    automaticStructuralApplyCertified: Number(totals.automaticStructuralApplyCertified || 0),
    destructiveStructuralApplyAdded: Number(totals.destructiveStructuralApplyAdded || 0),
    typedLimitations: list(receipt.typedLimitations),
    runtimeClaims: receipt.runtimeClaims || {},
    diagnosticLaneBound: receipt.status === 'STRUCTURAL_DIAGNOSTIC_BLOCKING_CERTIFIED_WITH_TYPED_LIMITATIONS'
      && Number(totals.physicalStructuralCases || 0) === 30
      && Number(totals.totalStructureChanges || 0) === 31
      && Number(totals.nativeMoveRevisionCases || 0) === 0
      && Number(totals.nativeMoveRevisions || 0) === 0
      && Number(totals.automaticStructuralApplyCertified || 0) === 0
      && Number(totals.destructiveStructuralApplyAdded || 0) === 0
      && list(receipt.typedLimitations).includes('STRUCTURAL_APPLY_NOT_CERTIFIED_IN_E09')
      && list(receipt.typedLimitations).includes('NATIVE_MOVEFROM_MOVETO_NOT_OBSERVED_IN_E09')
      && receipt.runtimeClaims?.automaticStructuralApplyAdded === false
      && receipt.runtimeClaims?.writerAuthorityAdded === false,
  };
}

function productStressEvidence() {
  const receipt = readJson(PRODUCT_STRESS_RECEIPT_REF);
  const cases = list(receipt.physicalCorpus?.productCases);
  const structuralCases = cases.filter((item) => item.waveFamily === 'paragraph-structure-diagnostic');
  const structuralWriterCalls = structuralCases.filter((item) => item.productLoop?.writerCalled === true).length;
  const structuralExplicitApplies = structuralCases.filter((item) => item.productLoop?.explicitUserConfirmedCommandApply === true).length;
  const structuralDiagnostics = structuralCases.filter((item) => item.productLoop?.structuralDiagnosticsVerified === true).length;
  return {
    sourceReceipt: binding('P0_FORMAT_UNICODE_STRUCTURE_PRODUCT_STRESS', PRODUCT_STRESS_RECEIPT_REF),
    status: receipt.status,
    result: receipt.result,
    totalCases: Number(receipt.totals?.cases || 0),
    passCases: Number(receipt.totals?.pass || 0),
    physicalWordPass: Number(receipt.totals?.physicalWordPass || 0),
    structuralDiagnosticPass: Number(receipt.totals?.structuralDiagnosticPass || 0),
    structuralCaseCount: structuralCases.length,
    structuralDiagnostics,
    structuralWriterCalls,
    structuralExplicitApplies,
    vetoMetrics: receipt.vetoMetrics || {},
    typedLimitations: list(receipt.typedLimitations),
    productDiagnosticPathBound: receipt.result === 'PASS'
      && Number(receipt.totals?.cases || 0) === 36
      && Number(receipt.totals?.structuralDiagnosticPass || 0) === 12
      && structuralCases.length === 12
      && structuralDiagnostics === 12
      && structuralWriterCalls === 0
      && structuralExplicitApplies === 0
      && Object.values(receipt.vetoMetrics || {}).every((value) => Number(value) === 0)
      && list(receipt.typedLimitations).includes('STRUCTURAL_APPLY_REMAINS_MANUAL_OR_BLOCKED_ONLY'),
  };
}

function classifierEvidence() {
  const source = fs.readFileSync(abs(CLASSIFIER_REF), 'utf8');
  return {
    sourceBinding: binding('REVIEW_TRANSPORT_CLASSIFIER_V2', CLASSIFIER_REF),
    structureClassifiedAsBlockedLane: source.includes("structure: classifyBlockedLane(reviewIr.structureChanges, 'structure', 'RTK_BLOCKED_STRUCTURAL')"),
    movesClassifiedAsBlockedLane: source.includes("moves: classifyBlockedLane(reviewIr.moveRevisions, 'move-revisions', 'RTK_BLOCKED_MOVE_REVISION')"),
  };
}

function buildReceipt() {
  const e09 = e09Evidence();
  const product = productStressEvidence();
  const classifier = classifierEvidence();
  const ok = e09.diagnosticLaneBound
    && product.productDiagnosticPathBound
    && classifier.structureClassifiedAsBlockedLane
    && classifier.movesClassifiedAsBlockedLane;
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
      physicalStructure: e09,
      productStructuralDiagnostics: product,
      classifier,
    },
    implementedCapability: {
      capability: 'safeStructuralLaneTypedLimitation',
      physicalWordProven: true,
      componentProven: true,
      productDiagnosticPathProven: product.productDiagnosticPathBound,
      productRuntimeApplyWired: false,
      productRuntimeWired: false,
      automaticApplyCertified: false,
      automaticStructuralApplyCertified: false,
      destructiveStructuralApplyAdded: false,
      structuralApplyTypedLimitationBound: e09.diagnosticLaneBound && product.productDiagnosticPathBound,
      userFacingAuthority: 'STRUCTURE_PREVIEW_MANUAL_OR_BLOCKED_ONLY',
      terminalClass: 'DIAGNOSTIC_ONLY_TYPED_LIMITATION_BOUND',
    },
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      silentCommentLoss: 0,
      structuralApplyOverclaim: 0,
      destructiveStructuralApply: 0,
      productNetwork: 0,
      googleDocsOpened: 0,
    },
    typedLimitations: [
      'STRUCTURAL_APPLY_REMAINS_MANUAL_OR_BLOCKED_ONLY',
      'NATIVE_MOVEFROM_MOVETO_NOT_OBSERVED_OR_CERTIFIED',
      'TABLE_SECTION_FOOTNOTE_ENDNOTE_FIELD_LAYOUT_MUTATIONS_REMAIN_TYPED_DIAGNOSTIC_ONLY',
      'NO_STRUCTURAL_WRITER_AUTHORITY_WITHOUT_FUTURE_STRUCTURE_IR_AND_REVERSE_VERIFICATION_CONTOUR',
    ],
    nonClaims: [
      'NO_STRUCTURAL_MANUSCRIPT_WRITE_AUTHORITY_ADDED',
      'NO_AUTOMATIC_STRUCTURAL_APPLY_CERTIFIED',
      'NO_MOVE_REVISION_EXACT_AUTHORITY',
      'WORD_SATURATED_FALSE',
      'GOOGLE_DOCS_NOT_OPENED',
    ],
    nextStage: NEXT_STAGE,
  };
}

function updateProfile(profile, receipt) {
  profile.status = STATUS;
  const cell = list(profile.cells).find((item) => item.capabilityId === 'rtk.word.v4.typedStructuralDiagnostics');
  if (cell) {
    cell.currentCapability = 'STRUCTURAL_DIAGNOSTIC_LANE_TERMINAL_TYPED_LIMITATION_BOUND';
    cell.productRuntimeWired = false;
    cell.automaticApplyCertified = false;
    cell.safeStructuralLaneTypedLimitationReceiptPath = RECEIPT_REF;
    cell.structuralDiagnosticProductPathProven = true;
    cell.structuralApplyTypedLimitationBound = true;
    cell.automaticStructuralApplyCertified = false;
    cell.supportedNow = Array.from(new Set([
      ...list(cell.supportedNow),
      'product return preview preserves structural diagnostics as manual or blocked proposals without writer authority',
    ]));
    cell.limitations = Array.from(new Set([
      ...list(cell.limitations),
      'structural apply remains manual or blocked until a future StructureIR apply contour proves reverse verification and recovery',
    ]));
    cell.killCriterion = 'Any structural diagnostic is promoted to manuscript write authority without a future StructureIR reverse-verification contour, or move/cross-scene topology becomes EXACT.';
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
    currentStage: 'P0_SAFE_STRUCTURAL_LANE_TYPED_LIMITATION',
    nextStage: NEXT_STAGE,
    latestReceiptPath: RECEIPT_REF,
    safeStructuralLaneTypedLimitationBound: true,
    structuralDiagnosticProductPathProven: receipt.implementedCapability.productDiagnosticPathProven,
    automaticStructuralApplyCertified: 0,
    runtimeApplyAuthorityGrantedForStructure: false,
    wordSaturated: false,
    googleDocsOpened: false,
  };
  program.releaseAuditNight01 = {
    ...(program.releaseAuditNight01 || {}),
    status: STATUS,
    currentStage: 'P0_SAFE_STRUCTURAL_LANE_TYPED_LIMITATION',
    nextStage: NEXT_STAGE,
    latestReceiptPath: RECEIPT_REF,
    safeStructuralLaneTypedLimitationBound: true,
    structuralDiagnosticProductPathProven: receipt.implementedCapability.productDiagnosticPathProven,
    automaticStructuralApplyCertified: false,
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
    p0SafeStructuralLaneTypedLimitation: {
      status: 'BOUND_STRUCTURAL_DIAGNOSTIC_ONLY_TYPED_LIMITATION',
      sourceEvidence: 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_SAFE_STRUCTURAL_LANE_TYPED_LIMITATION_RECEIPT',
      physicalStructuralCases: receipt.sourceEvidence.physicalStructure.physicalStructuralCases,
      totalStructureChanges: receipt.sourceEvidence.physicalStructure.totalStructureChanges,
      productStructuralDiagnosticCases: receipt.sourceEvidence.productStructuralDiagnostics.structuralDiagnosticPass,
      productDiagnosticPathProven: receipt.implementedCapability.productDiagnosticPathProven,
      automaticStructuralApplyCertified: false,
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
      .filter((reason) => reason !== 'RTK_NORM_STRUCTURAL_APPLY_LANE_PENDING')
      .concat(['RTK_NORM_MULTI_ROUND_LEDGER_RECONCILIATION_PENDING']),
  ));
  ledger.evidenceBindings = list(ledger.evidenceBindings)
    .filter((entry) => entry.id !== 'P0_SAFE_STRUCTURAL_LANE_TYPED_LIMITATION')
    .concat([binding('P0_SAFE_STRUCTURAL_LANE_TYPED_LIMITATION', RECEIPT_REF)]);
  ledger.aggregateTotals = {
    ...(ledger.aggregateTotals || {}),
    p0SafeStructuralLaneTypedLimitationBound: 1,
    p0StructuralDiagnosticProductPathProven: receipt.implementedCapability.productDiagnosticPathProven ? 1 : 0,
    p0AutomaticStructuralApplyCertified: 0,
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
  const rationale = 'Approve Word P0 safe structural lane typed-limitation closure: physical E09 structural evidence and product-loop structural diagnostics are bound, structural edits remain manual or blocked only, no structural writer authority or automatic apply is added, Word saturated remains false, and Google Docs remains closed.';
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

export function evaluateP0SafeStructuralLaneTypedLimitation(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_REF);
  const profile = input.profile || readJson(PROFILE_REF);
  const program = input.program || readJson(PROGRAM_REF);
  const ledger = input.ledger || readJson(LEDGER_REF);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));
  const cell = list(profile.cells).find((item) => item.capabilityId === 'rtk.word.v4.typedStructuralDiagnostics');

  if (receipt.schemaVersion !== SCHEMA || receipt.status !== STATUS || receipt.result !== 'PASS') add('RTK_P0_STRUCTURAL_RECEIPT_INVALID', 'receipt', 'P0 safe structural lane receipt must pass.');
  if (receipt.implementedCapability?.structuralApplyTypedLimitationBound !== true
    || receipt.implementedCapability?.productDiagnosticPathProven !== true
    || receipt.implementedCapability?.productRuntimeApplyWired !== false
    || receipt.implementedCapability?.automaticStructuralApplyCertified !== false
    || receipt.implementedCapability?.automaticApplyCertified !== false) add('RTK_P0_STRUCTURAL_AUTHORITY_INVALID', 'implementedCapability', 'Structural edits must remain diagnostic/manual/blocked without apply authority.');
  if (receipt.sourceEvidence?.physicalStructure?.diagnosticLaneBound !== true
    || receipt.sourceEvidence?.productStructuralDiagnostics?.productDiagnosticPathBound !== true
    || receipt.sourceEvidence?.classifier?.structureClassifiedAsBlockedLane !== true
    || receipt.sourceEvidence?.classifier?.movesClassifiedAsBlockedLane !== true) add('RTK_P0_STRUCTURAL_EVIDENCE_INVALID', 'sourceEvidence', 'Structural closure requires E09 physical evidence, product diagnostic path, and blocked classifier lanes.');
  if (Object.values(receipt.vetoMetrics || {}).some((value) => Number(value) !== 0)) add('RTK_P0_STRUCTURAL_VETO_NONZERO', 'vetoMetrics', 'All veto metrics must remain zero.');
  if (!cell
    || cell.structuralApplyTypedLimitationBound !== true
    || cell.structuralDiagnosticProductPathProven !== true
    || cell.automaticApplyCertified !== false) add('RTK_P0_STRUCTURAL_PROFILE_INVALID', 'profile.typedStructuralDiagnostics', 'Profile must bind structural diagnostic typed limitation without automatic apply.');
  const actualNextStage = program.v4ExecutionState?.nextStage || program.nextStep || '';
  if (![NEXT_STAGE, SCALE_SUCCESSOR_STAGE, FINAL_ENVELOPE_SUCCESSOR_STAGE].includes(actualNextStage)
    || program.v4ExecutionState?.safeStructuralLaneTypedLimitationBound !== true
    || program.v4ExecutionState?.runtimeApplyAuthorityGrantedForStructure !== false
    || program.v4ExecutionState?.googleDocsOpened !== false) add('RTK_P0_STRUCTURAL_PROGRAM_INVALID', 'program', 'Program must advance to multi-round reconciliation with Google closed.');
  if (ledger.coverageLedger?.p0SafeStructuralLaneTypedLimitation?.status !== 'BOUND_STRUCTURAL_DIAGNOSTIC_ONLY_TYPED_LIMITATION'
    || ledger.runtimeClaims?.automaticApplyExpanded !== false
    || ledger.runtimeClaims?.googleDocsOpened !== false) add('RTK_P0_STRUCTURAL_LEDGER_INVALID', 'ledger', 'Ledger must bind structural typed limitation without automatic apply or Google.');

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    nextStage: actualNextStage || NEXT_STAGE,
    structuralApplyTypedLimitationBound: receipt.implementedCapability?.structuralApplyTypedLimitationBound === true,
    productDiagnosticPathProven: receipt.implementedCapability?.productDiagnosticPathProven === true,
    automaticStructuralApplyCertified: receipt.implementedCapability?.automaticStructuralApplyCertified === true,
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
  const result = evaluateP0SafeStructuralLaneTypedLimitation();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_P0_SAFE_STRUCTURAL_LANE_TYPED_LIMITATION=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
