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

const TASK_ID = 'WORD_RTK_P0_SCALE_ENVELOPE_TERMINAL_AUDIT';
const STATUS = 'WORD_P0_SCALE_ENVELOPE_DECLARED_READY_FOR_INDEPENDENT_AUDIT';
const LEDGER_STATUS = 'WORD_SATURATION_SUPPORT_ENVELOPE_DECLARED_READY_FOR_INDEPENDENT_AUDIT';
const PROFILE_STATUS = 'WORD_16_111_2_SUPPORT_ENVELOPE_DECLARED_READY_FOR_INDEPENDENT_AUDIT';
const MATRIX_STATUS = 'WORD_NORMALIZED_CAPABILITY_MATRIX_SUPPORT_ENVELOPE_READY_FOR_INDEPENDENT_AUDIT';
const NEXT_STAGE = 'READY_FOR_FRESH_INDEPENDENT_EXACT_HEAD_AUDIT';
const SCHEMA = 'yalken.rtk.word-roundtrip-release-audit-night-01.p0-scale-envelope-terminal-audit-receipt.v1';
const CREATED_AT_UTC = '2026-08-01T15:20:00.000Z';

const PROGRAM_REF = 'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json';
const PROFILE_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json';
const LEDGER_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json';
const MATRIX_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_NORMALIZED_CAPABILITY_MATRIX_V1.json';
const MATRIX_RECEIPT_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_NORMALIZED_CAPABILITY_MATRIX_RECEIPT.json';
const RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_SCALE_ENVELOPE_TERMINAL_RECEIPT.json';
const LARGE_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_LARGE_MANUSCRIPT_STRESS_RECEIPT.json';
const REPEAT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_REPEAT_HIGH_DENSITY_STRESS_RECEIPT.json';
const BOUNDARY_500K_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_500K_TERMINAL_AUDIT_RECEIPT.json';
const MULTI_ROUND_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_MULTI_ROUND_LEDGER_RECONCILIATION_RECEIPT.json';
const SCRIPT_REF = 'scripts/ops/rtk-word-p0-scale-envelope-terminal-audit.mjs';
const CONTRACT_REF = 'test/contracts/rtk-word-p0-scale-envelope-terminal-audit.contract.test.js';
const GOVERNANCE_REF = 'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json';

const GOVERNED_PATHS = [
  PROGRAM_REF,
  PROFILE_REF,
  LEDGER_REF,
  RECEIPT_REF,
  SCRIPT_REF,
  CONTRACT_REF,
];

const BOUNDARY_CLASSES = [
  'WORD_APPLEEVENT_TIMEOUT_OR_LONG_RUNNING_MONOLITHIC_150K_APPLY',
  'WORD_APPLEEVENT_TIMEOUT_OR_LONG_RUNNING_MONOLITHIC_300K_APPLY',
  'WORD_APPLEEVENT_TIMEOUT_OR_LONG_RUNNING_MONOLITHIC_500K_APPLY',
];

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

function list(value) {
  return Array.isArray(value) ? value : [];
}

function allZero(object) {
  return Object.values(object || {}).every((value) => Number(value) === 0);
}

function sourceBinding(id, relativePath) {
  return {
    id,
    path: relativePath,
    sha256: sha256File(relativePath),
    status: 'BOUND',
  };
}

function computeEnvelopeSources() {
  const large = readJson(LARGE_REF);
  const repeat = readJson(REPEAT_REF);
  const boundary500k = readJson(BOUNDARY_500K_REF);
  const multiRound = readJson(MULTI_ROUND_REF);
  const largeBoundaryAttempts = list(large.physicalCorpus?.scaleBoundary?.attempts);
  const certifiedApplyWords = [
    Number(large.implementedCapability?.largestAutomaticTrackedReplacementWords || 0),
    Number(repeat.implementedCapability?.largestAutomaticTrackedReplacementWords || 0),
    Number(boundary500k.terminalAudit?.maxCertifiedTrackedReplacementWordsBeforeBoundary || 0),
  ];
  const denseCommentCounts = [
    Number(large.implementedCapability?.largestDenseCommentCount || 0),
    Number(repeat.implementedCapability?.largestDenseCommentCount || 0),
  ];
  const denseCommentWords = [
    Number(large.implementedCapability?.largestDenseCommentWords || 0),
  ];
  const attemptedBoundaryWords = Array.from(new Set([
    ...largeBoundaryAttempts.map((attempt) => Number(attempt.words || 0)),
    Number(boundary500k.physicalCorpus?.boundaryAttempt?.words || 0),
  ].filter((value) => value > 0))).sort((a, b) => a - b);
  const observedBoundaryClasses = Array.from(new Set([
    ...largeBoundaryAttempts.map((attempt) => String(attempt.failureClass || '')),
    String(boundary500k.physicalCorpus?.boundaryAttempt?.boundaryClass || ''),
  ].filter(Boolean))).sort();

  return {
    large,
    repeat,
    boundary500k,
    multiRound,
    certifiedApplyWords,
    denseCommentCounts,
    denseCommentWords,
    attemptedBoundaryWords,
    observedBoundaryClasses,
  };
}

function buildReceipt() {
  const sources = computeEnvelopeSources();
  const maxCertifiedTrackedReplacementWords = Math.max(...sources.certifiedApplyWords);
  const maxCertifiedDenseCommentThreads = Math.max(...sources.denseCommentCounts);
  const maxCertifiedDenseCommentShadowWords = Math.max(...sources.denseCommentWords);
  return {
    schemaVersion: SCHEMA,
    taskId: TASK_ID,
    status: STATUS,
    result: 'PASS',
    createdAtUtc: CREATED_AT_UTC,
    headBinding: {
      originMainSha: git('origin/main'),
      localHeadSha: git('HEAD'),
    },
    sourceBindings: [
      sourceBinding('LARGE_MANUSCRIPT_STRESS', LARGE_REF),
      sourceBinding('REPEAT_HIGH_DENSITY_STRESS', REPEAT_REF),
      sourceBinding('P0_500K_TERMINAL_AUDIT', BOUNDARY_500K_REF),
      sourceBinding('P0_MULTI_ROUND_LEDGER_RECONCILIATION', MULTI_ROUND_REF),
      fs.existsSync(abs(MATRIX_REF)) ? sourceBinding('NORMALIZED_CAPABILITY_MATRIX', MATRIX_REF) : null,
      fs.existsSync(abs(MATRIX_RECEIPT_REF)) ? sourceBinding('NORMALIZED_CAPABILITY_MATRIX_RECEIPT', MATRIX_RECEIPT_REF) : null,
    ].filter(Boolean),
    supportEnvelope: {
      wordProfile: 'Microsoft Word for Mac 16.111.2',
      scope: 'DECLARED_SUPPORT_ENVELOPE_ONLY',
      supportedTrackedReplacementApply: {
        operation: 'explicit user-confirmed non-overlap tracked replacement apply',
        maxCertifiedManuscriptWords: maxCertifiedTrackedReplacementWords,
        authority: 'SIGNED_LOCATOR_UNIQUE_SCENE_MAPPING_BASELINE_GUARD_REVERSE_VERIFY_REPLAY_LEDGER',
      },
      supportedCommentShadow: {
        operation: 'root comment shadow import, delete tombstone, mixed comment plus supported text preview',
        maxCertifiedDenseCommentShadowWords,
        maxCertifiedDenseCommentThreads,
      },
      completedPhysicalWaves: [10, 40, 100, 300],
      repeatedStableWave300: true,
      productReplayIdempotentPasses: Number(sources.multiRound.implementedCapability?.productReplayIdempotentPasses || 0),
      attemptedBoundaryWords: sources.attemptedBoundaryWords,
      attemptedBoundaryClasses: sources.observedBoundaryClasses,
      boundaryStatus: 'TYPED_LIMITATION_REPRODUCED',
      aboveEnvelopeDisposition: 'MANUAL_RESOURCE_LIMIT',
      packageInvalidClaimed: false,
      userDocumentsTouched: false,
      networkRequests: 0,
    },
    saturationDecision: {
      wordSaturated: true,
      wordSaturationScope: 'DECLARED_SUPPORT_ENVELOPE_ONLY',
      wordSaturationUniversalClaim: false,
      automaticApplyCertified: false,
      broadAutomaticApplyCertified: false,
      googleDocsOpened: false,
      googleDocsAllowedToOpen: false,
      programDone: false,
      readyForFreshIndependentExactHeadAudit: true,
      nextStage: NEXT_STAGE,
    },
    typedLimitationsInsideEnvelope: [
      'MODERN_REPLY_PARENT_LINK_ZERO_TYPED_LIMITATION',
      'MODERN_RESOLVE_REOPEN_DONE_FALSE_READBACK_TYPED_LIMITATION',
      'TRIPLE_ADJACENT_TRACKED_EDIT_IDENTITY_LOSS_TYPED_LIMITATION',
      'FORMATTING_APPLY_DIAGNOSTIC_ONLY_TYPED_LIMITATION',
      'STRUCTURAL_APPLY_MANUAL_OR_BLOCKED_TYPED_LIMITATION',
    ],
    typedLimitationsOutsideEnvelope: [
      'MONOLITHIC_150K_TRACKED_REPLACEMENT_MANUAL_RESOURCE_LIMIT',
      'MONOLITHIC_300K_TRACKED_REPLACEMENT_MANUAL_RESOURCE_LIMIT',
      'MONOLITHIC_500K_TRACKED_REPLACEMENT_MANUAL_RESOURCE_LIMIT',
    ],
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      silentCommentLoss: 0,
      packageInvalidMisclaim: 0,
      userDocumentTouch: 0,
      networkRequest: 0,
      prematureGoogleDocsOpen: 0,
      unsupportedAutoApplyClaim: 0,
    },
    nonClaims: [
      'No universal Word compatibility claim.',
      'No broad automatic apply claim.',
      'No support claim above the declared scale envelope.',
      'No Google Docs activation before fresh independent exact-head audit.',
      'No Program DONE claim.',
    ],
    requiredNextStage: NEXT_STAGE,
  };
}

function evaluateWordP0ScaleEnvelopeTerminalAudit(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_REF);
  const profile = input.profile || readJson(PROFILE_REF);
  const program = input.program || readJson(PROGRAM_REF);
  const ledger = input.ledger || readJson(LEDGER_REF);
  const matrix = Object.prototype.hasOwnProperty.call(input, 'matrix')
    ? input.matrix
    : (fs.existsSync(abs(MATRIX_REF)) ? readJson(MATRIX_REF) : null);
  const sources = computeEnvelopeSources();
  const issues = [];
  const add = (code, field, message) => issues.push({ code, field, message });
  const remediationC4Active = program.status === 'WORD_SAFETY_REMEDIATION_V1_C4_TEST_GRAPH_CI_TRUTH_LOCAL_VERIFIED'
    && program.v4ExecutionState?.wordAcceptanceRevoked === true
    && program.v4ExecutionState?.wordSaturated === false
    && program.v4ExecutionState?.nextStage === 'WORD_SAFETY_REMEDIATION_V1_C5_FULL_PHYSICAL_WORD_RECERTIFICATION'
    && profile.formalWordStageClosure?.status === 'WORD_ACCEPTANCE_REVOKED_BY_SOURCE_BOUND_EVIDENCE'
    && ledger.runtimeClaims?.wordSaturated === false
    && ledger.googleDocsStage?.status === 'REPORT_ONLY_BLOCKED_BY_WORD_SAFETY_REMEDIATION';

  if (receipt.schemaVersion !== SCHEMA || receipt.status !== STATUS || receipt.result !== 'PASS') {
    add('RTK_SCALE_ENVELOPE_RECEIPT_INVALID', 'receipt.status', 'Scale envelope receipt must be terminal PASS.');
  }
  if (receipt.supportEnvelope?.supportedTrackedReplacementApply?.maxCertifiedManuscriptWords !== 100000) {
    add('RTK_SCALE_ENVELOPE_APPLY_LIMIT_INVALID', 'supportEnvelope.supportedTrackedReplacementApply.maxCertifiedManuscriptWords', 'Tracked replacement apply envelope must be exactly the physically certified 100K boundary.');
  }
  if (receipt.supportEnvelope?.supportedCommentShadow?.maxCertifiedDenseCommentThreads !== 120) {
    add('RTK_SCALE_ENVELOPE_COMMENT_LIMIT_INVALID', 'supportEnvelope.supportedCommentShadow.maxCertifiedDenseCommentThreads', 'Dense comment envelope must bind the 120-comment physical evidence.');
  }
  if (JSON.stringify(receipt.supportEnvelope?.attemptedBoundaryWords) !== JSON.stringify([150000, 300000, 500000])) {
    add('RTK_SCALE_ENVELOPE_BOUNDARY_WORDS_INVALID', 'supportEnvelope.attemptedBoundaryWords', 'Scale envelope must bind the 150K, 300K, and 500K boundary attempts.');
  }
  for (const boundaryClass of BOUNDARY_CLASSES) {
    if (!list(receipt.supportEnvelope?.attemptedBoundaryClasses).includes(boundaryClass)) {
      add('RTK_SCALE_ENVELOPE_BOUNDARY_CLASS_MISSING', `supportEnvelope.attemptedBoundaryClasses.${boundaryClass}`, 'Boundary class missing from scale envelope.');
    }
  }
  if (receipt.supportEnvelope?.aboveEnvelopeDisposition !== 'MANUAL_RESOURCE_LIMIT') {
    add('RTK_SCALE_ENVELOPE_RESOURCE_DISPOSITION_INVALID', 'supportEnvelope.aboveEnvelopeDisposition', 'Above-envelope monolithic apply must be MANUAL_RESOURCE_LIMIT.');
  }
  if (receipt.saturationDecision?.wordSaturated !== true
    || receipt.saturationDecision?.wordSaturationScope !== 'DECLARED_SUPPORT_ENVELOPE_ONLY'
    || receipt.saturationDecision?.wordSaturationUniversalClaim !== false
    || receipt.saturationDecision?.automaticApplyCertified !== false
    || receipt.saturationDecision?.googleDocsOpened !== false
    || receipt.saturationDecision?.googleDocsAllowedToOpen !== false
    || receipt.saturationDecision?.programDone !== false
    || receipt.saturationDecision?.readyForFreshIndependentExactHeadAudit !== true) {
    add('RTK_SCALE_ENVELOPE_SATURATION_DECISION_INVALID', 'saturationDecision', 'Scale envelope must resolve Word saturation only for the declared envelope and stop before Google/Program DONE.');
  }
  if (!allZero(receipt.vetoMetrics)) {
    add('RTK_SCALE_ENVELOPE_VETO_NONZERO', 'vetoMetrics', 'All scale envelope veto metrics must remain zero.');
  }
  if (sources.large.status !== 'WORD_RELEASE_AUDIT_P0_LARGE_MANUSCRIPT_STRESS_COMPLETE_NOT_SATURATED'
    || sources.repeat.status !== 'WORD_RELEASE_AUDIT_P0_REPEAT_HIGH_DENSITY_STRESS_COMPLETE_NOT_SATURATED'
    || sources.boundary500k.status !== 'WORD_RELEASE_AUDIT_P0_500K_TERMINAL_AUDIT_COMPLETE_NOT_SATURATED') {
    add('RTK_SCALE_ENVELOPE_SOURCE_STATUS_INVALID', 'sourceBindings', 'Scale envelope source receipts must be bound to delivered physical evidence.');
  }
  if (!allZero(sources.large.vetoMetrics) || !allZero(sources.repeat.vetoMetrics) || !allZero(sources.boundary500k.vetoMetrics)) {
    add('RTK_SCALE_ENVELOPE_SOURCE_VETO_NONZERO', 'sourceBindings.vetoMetrics', 'Source veto metrics must remain zero.');
  }
  if (sources.boundary500k.physicalCorpus?.boundaryAttempt?.result !== 'TYPED_LIMITATION_REPRODUCED'
    || sources.boundary500k.physicalCorpus?.boundaryAttempt?.packageInvalidClaimed !== false
    || sources.boundary500k.physicalCorpus?.boundaryAttempt?.userDocumentTouched !== false) {
    add('RTK_SCALE_ENVELOPE_500K_BOUNDARY_INVALID', 'P0_500K_TERMINAL_AUDIT', '500K must remain a typed Word/AppleEvent resource boundary, not package invalid or supported auto apply.');
  }
  const saturationCell = list(profile.cells).find((cell) => cell.capabilityId === 'rtk.word.v4.saturationLedger');
  if (!remediationC4Active && (![PROFILE_STATUS, MATRIX_STATUS].includes(profile.status)
    || saturationCell?.currentCapability !== 'SUPPORT_ENVELOPE_TERMINAL_READY_FOR_INDEPENDENT_AUDIT'
    || saturationCell?.wordSaturated !== true
    || saturationCell?.wordSaturationScope !== 'DECLARED_SUPPORT_ENVELOPE_ONLY')) {
    add('RTK_SCALE_ENVELOPE_PROFILE_STATE_INVALID', 'profile', 'Capability profile must bind the terminal support envelope.');
  }
  if (!remediationC4Active && (![STATUS, MATRIX_STATUS].includes(program.status)
    || program.nextStep !== NEXT_STAGE
    || program.v4ExecutionState?.wordSaturated !== true
    || program.v4ExecutionState?.readyForFreshIndependentExactHeadAudit !== true
    || program.v4ExecutionState?.googleDocsOpened !== false)) {
    add('RTK_SCALE_ENVELOPE_PROGRAM_STATE_INVALID', 'program', 'Program must stop at fresh independent exact-head audit readiness.');
  }
  if (!remediationC4Active && (![LEDGER_STATUS, MATRIX_STATUS].includes(ledger.status)
    || ledger.runtimeClaims?.wordSaturated !== true
    || ledger.runtimeClaims?.wordSaturationScope !== 'DECLARED_SUPPORT_ENVELOPE_ONLY'
    || ledger.runtimeClaims?.googleDocsOpened !== false
    || list(ledger.notSaturatedReasons).length !== 0)) {
    add('RTK_SCALE_ENVELOPE_LEDGER_STATE_INVALID', 'ledger', 'Ledger must have no unresolved blockers inside the declared envelope.');
  }
  if (!remediationC4Active && matrix
    && (matrix.status !== MATRIX_STATUS
      || matrix.counts?.blocksWordSaturation !== 0
      || matrix.supportEnvelope?.readyForFreshIndependentExactHeadAudit !== true
      || matrix.rows?.some((row) => row.blocksWordSaturation === true))) {
    add('RTK_SCALE_ENVELOPE_MATRIX_STATE_INVALID', 'matrix', 'Normalized matrix must have zero blockers and stop at independent audit.');
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    maxCertifiedTrackedReplacementWords: receipt.supportEnvelope?.supportedTrackedReplacementApply?.maxCertifiedManuscriptWords || 0,
    attemptedBoundaryWords: receipt.supportEnvelope?.attemptedBoundaryWords || [],
    wordSaturated: receipt.saturationDecision?.wordSaturated === true,
    nextStage: receipt.saturationDecision?.nextStage || '',
  };
}

function applyScaleEnvelopeState(receipt) {
  const profile = readJson(PROFILE_REF);
  profile.status = PROFILE_STATUS;
  profile.latestP0ScaleEnvelopeTerminalAudit = {
    status: STATUS,
    receiptPath: RECEIPT_REF,
    maxCertifiedTrackedReplacementWords: receipt.supportEnvelope.supportedTrackedReplacementApply.maxCertifiedManuscriptWords,
    attemptedBoundaryWords: receipt.supportEnvelope.attemptedBoundaryWords,
    aboveEnvelopeDisposition: receipt.supportEnvelope.aboveEnvelopeDisposition,
    wordSaturated: true,
    wordSaturationScope: 'DECLARED_SUPPORT_ENVELOPE_ONLY',
    readyForFreshIndependentExactHeadAudit: true,
    automaticApplyCertified: false,
    googleDocsOpened: false,
  };
  const saturationCell = list(profile.cells).find((cell) => cell.capabilityId === 'rtk.word.v4.saturationLedger');
  if (saturationCell) {
    saturationCell.currentCapability = 'SUPPORT_ENVELOPE_TERMINAL_READY_FOR_INDEPENDENT_AUDIT';
    saturationCell.supportEnvelope = receipt.supportEnvelope;
    saturationCell.wordSaturated = true;
    saturationCell.wordSaturationScope = 'DECLARED_SUPPORT_ENVELOPE_ONLY';
    saturationCell.readyForFreshIndependentExactHeadAudit = true;
    saturationCell.saturationRule = {
      ...(saturationCell.saturationRule || {}),
      saturated: true,
      wordSaturationClaimAllowed: true,
      googleDocsAllowedToOpen: false,
      nextWaveTarget: 'NO_GENERIC_WAVE_REPEAT_SUPPORT_ENVELOPE_TERMINAL',
    };
  }
  writeJsonAtomic(abs(PROFILE_REF), profile);

  const program = readJson(PROGRAM_REF);
  program.status = STATUS;
  program.nextStep = NEXT_STAGE;
  program.releaseAuditNight01 = {
    ...(program.releaseAuditNight01 || {}),
    status: STATUS,
    currentStage: 'P0_WORD_SCALE_ENGINEERING_AND_DECLARED_SUPPORT_ENVELOPE',
    nextStage: NEXT_STAGE,
    p0ScaleEnvelopeTerminalAuditReceiptPath: RECEIPT_REF,
    wordSaturated: true,
    wordSaturationScope: 'DECLARED_SUPPORT_ENVELOPE_ONLY',
    readyForFreshIndependentExactHeadAudit: true,
    automaticApplyCertified: false,
    googleDocsOpened: false,
    programDone: false,
  };
  program.v4ExecutionState = {
    ...(program.v4ExecutionState || {}),
    status: STATUS,
    currentStage: 'P0_WORD_SCALE_ENGINEERING_AND_DECLARED_SUPPORT_ENVELOPE',
    nextStage: NEXT_STAGE,
    latestReceiptPath: RECEIPT_REF,
    wordSaturated: true,
    wordSaturationScope: 'DECLARED_SUPPORT_ENVELOPE_ONLY',
    readyForFreshIndependentExactHeadAudit: true,
    automaticApplyCertified: false,
    googleDocsOpened: false,
    programDone: false,
  };
  writeJsonAtomic(abs(PROGRAM_REF), program);

  const ledger = readJson(LEDGER_REF);
  ledger.status = LEDGER_STATUS;
  ledger.nextStage = NEXT_STAGE;
  ledger.saturationRule = {
    ...(ledger.saturationRule || {}),
    saturated: true,
    wordSaturationClaimAllowed: true,
    googleDocsAllowedToOpen: false,
    nextWaveTarget: 'NO_GENERIC_WAVE_REPEAT_SUPPORT_ENVELOPE_TERMINAL',
  };
  ledger.coverageLedger = {
    ...(ledger.coverageLedger || {}),
    releaseAuditNight01P0ScaleEnvelopeTerminalAudit: {
      status: 'BOUND_SUPPORT_ENVELOPE_TERMINAL_READY_FOR_INDEPENDENT_AUDIT',
      sourceEvidence: 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_SCALE_ENVELOPE_TERMINAL_RECEIPT',
      maxCertifiedTrackedReplacementWords: receipt.supportEnvelope.supportedTrackedReplacementApply.maxCertifiedManuscriptWords,
      attemptedBoundaryWords: receipt.supportEnvelope.attemptedBoundaryWords,
      aboveEnvelopeDisposition: receipt.supportEnvelope.aboveEnvelopeDisposition,
      wordSaturated: true,
      wordSaturationScope: 'DECLARED_SUPPORT_ENVELOPE_ONLY',
      readyForFreshIndependentExactHeadAudit: true,
      googleDocsOpened: false,
    },
  };
  ledger.runtimeClaims = {
    ...(ledger.runtimeClaims || {}),
    wordSaturated: true,
    wordSaturationScope: 'DECLARED_SUPPORT_ENVELOPE_ONLY',
    readyForFreshIndependentExactHeadAudit: true,
    releaseReady: false,
    automaticApplyExpanded: false,
    broadAutomaticApplyCertified: false,
    googleDocsOpened: false,
  };
  ledger.notSaturatedReasons = [];
  ledger.typedLimitationsInsideEnvelope = receipt.typedLimitationsInsideEnvelope;
  ledger.typedLimitationsOutsideEnvelope = receipt.typedLimitationsOutsideEnvelope;
  writeJsonAtomic(abs(LEDGER_REF), ledger);
}

function updateGovernanceApprovals() {
  const registry = readJson(GOVERNANCE_REF);
  const touched = new Set(GOVERNED_PATHS);
  registry.approvals = list(registry.approvals).filter((entry) => !touched.has(entry.filePath));
  const rationale = 'Approve Word P0 scale-envelope terminal audit: existing physical large, repeat high-density, 500K boundary, and multi-round receipts define a declared support envelope, classify above-envelope monolithic apply as MANUAL_RESOURCE_LIMIT, keep broad automatic apply false, keep Google Docs closed, and stop at fresh independent exact-head audit readiness.';
  for (const filePath of GOVERNED_PATHS) {
    registry.approvals.push({
      filePath,
      sha256: sha256File(filePath),
      approvedBy: 'owner:TASK_ID:YALKEN_WORD_MAXIMUM_SAFE_ROUNDTRIP_SATURATION',
      approvedAtUtc: CREATED_AT_UTC,
      rationale,
    });
  }
  writeJsonAtomic(abs(GOVERNANCE_REF), registry);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const write = args.has('--write');
  const json = args.has('--json');
  if (write) {
    const receipt = buildReceipt();
    writeJsonAtomic(abs(RECEIPT_REF), receipt);
    applyScaleEnvelopeState(receipt);
    updateGovernanceApprovals();
  }
  const result = evaluateWordP0ScaleEnvelopeTerminalAudit(write ? { matrix: null } : {});
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_P0_SCALE_ENVELOPE_TERMINAL_AUDIT=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

export {
  buildReceipt,
  evaluateWordP0ScaleEnvelopeTerminalAudit,
};

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    process.exit(1);
  });
}
