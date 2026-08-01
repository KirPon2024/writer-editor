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

const TASK_ID = 'YALKEN_GOOGLE_DOCS_G00_DISCOVERY_BINDING';
const STATUS = 'GOOGLE_DOCS_G00_DISCOVERY_BOUND_READY_FOR_G01';
const WORD_CLOSURE_STATUS = 'WORD_STAGE_FORMALLY_CLOSED_ACCEPTED_DECLARED_SUPPORT_ENVELOPE';
const NEXT_STAGE = 'GOOGLE_DOCS_G01_OFFICE_MODE_PHYSICAL_DISCOVERY_OR_EXTERNAL_ACTIVATION_BOUNDARY';
const CREATED_AT_UTC = '2026-08-01T16:05:00.000Z';
const WORD_AUDIT_THREAD = '019fbd7d-f375-7a72-836f-81301bd6eda9';
const AUDITED_SHA = 'e17f732b4ab38cb70a5c8cb6a7f3fd81d1c712fb';

const PROGRAM_REF = 'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json';
const PROFILE_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json';
const LEDGER_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json';
const WORD_SCALE_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_SCALE_ENVELOPE_TERMINAL_RECEIPT.json';
const WORD_MATRIX_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_NORMALIZED_CAPABILITY_MATRIX_V1.json';
const GOOGLE_EVIDENCE_STATUS_REF = 'docs/OPS/STATUS/REVIEW_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_BINDING_001_STATUS.json';
const GOOGLE_EVIDENCE_CONTRACT_REF = 'test/contracts/review-bridge-google-docs-evidence-claim-binding.contract.test.js';
const GOOGLE_GATE_CONTRACT_REF = 'test/contracts/revision-bridge-google-docs-evidence-check.contract.test.js';
const REVISION_BRIDGE_INDEX_REF = 'src/io/revisionBridge/index.mjs';
const WORD_CLOSURE_RECEIPT_REF = 'docs/OPS/RTK/WORD_FOR_MAC_STAGE_FORMAL_CLOSURE_RECEIPT.json';
const GOOGLE_MATRIX_REF = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json';
const GOOGLE_RECEIPT_REF = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json';
const SCRIPT_REF = 'scripts/ops/rtk-google-docs-g00-discovery-binding.mjs';
const CONTRACT_REF = 'test/contracts/rtk-google-docs-g00-discovery-binding.contract.test.js';
const GOVERNANCE_REF = 'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json';

const GOVERNED_PATHS = [
  PROGRAM_REF,
  PROFILE_REF,
  LEDGER_REF,
  WORD_CLOSURE_RECEIPT_REF,
  GOOGLE_MATRIX_REF,
  GOOGLE_RECEIPT_REF,
  SCRIPT_REF,
  CONTRACT_REF,
  GOOGLE_GATE_CONTRACT_REF,
];

const GOOGLE_SUPPORT_CELLS = Object.freeze([
  {
    cellId: 'google.g00.existingEvidenceClaimGate',
    family: 'evidence-claim',
    intendedTerminalClass: 'COMPONENT_PROVEN',
    currentTerminalClass: 'COMPONENT_PROVEN',
    userFacingAuthority: 'EVIDENCE_CLAIM_GATE_ONLY',
    physicalEvidence: false,
    reasonCode: 'G00_EXISTING_GOOGLE_EVIDENCE_CLAIM_GATE_ONLY',
    requiredNextContour: 'NONE',
    blocksGoogleStage: false,
  },
  {
    cellId: 'google.g00.externalActivationBoundary',
    family: 'external-session',
    intendedTerminalClass: 'PHYSICAL_GOOGLE_EVIDENCE',
    currentTerminalClass: 'EXTERNAL_ACTIVATION_REQUIRED',
    userFacingAuthority: 'NO_PRODUCT_AUTHORITY',
    physicalEvidence: false,
    reasonCode: 'G00_GOOGLE_SESSION_NOT_BOUND_IN_THIS_CONTOUR',
    requiredNextContour: NEXT_STAGE,
    blocksGoogleStage: true,
  },
  {
    cellId: 'google.productUiExport',
    family: 'export',
    intendedTerminalClass: 'PRODUCT_RUNTIME_WIRED',
    currentTerminalClass: 'UNTESTED',
    userFacingAuthority: 'NO_GOOGLE_EXPORT_CLAIM',
    physicalEvidence: false,
    reasonCode: 'G00_NO_GOOGLE_PRODUCT_EXPORT_PATH',
    requiredNextContour: 'GOOGLE_G01_PRODUCT_EXPORT_PACKET_DESIGN',
    blocksGoogleStage: true,
  },
  {
    cellId: 'google.officeModePhysicalRoundtrip',
    family: 'physical-office-mode',
    intendedTerminalClass: 'PHYSICAL_GOOGLE_EVIDENCE',
    currentTerminalClass: 'UNTESTED',
    userFacingAuthority: 'NO_GOOGLE_ROUNDTRIP_CLAIM',
    physicalEvidence: false,
    reasonCode: 'G00_NO_PHYSICAL_OFFICE_MODE_ROUNDTRIP',
    requiredNextContour: NEXT_STAGE,
    blocksGoogleStage: true,
  },
  {
    cellId: 'google.nativeConversionPhysicalRoundtrip',
    family: 'physical-native-conversion',
    intendedTerminalClass: 'PHYSICAL_GOOGLE_EVIDENCE',
    currentTerminalClass: 'UNTESTED_MANUAL_LOSSY_BY_DEFAULT',
    userFacingAuthority: 'NO_NATIVE_CONVERSION_CLAIM',
    physicalEvidence: false,
    reasonCode: 'G00_NATIVE_CONVERSION_DEFAULTS_LOSSY_UNTIL_EVIDENCE',
    requiredNextContour: 'GOOGLE_G02_NATIVE_CONVERSION_PHYSICAL_DISCOVERY',
    blocksGoogleStage: true,
  },
  {
    cellId: 'google.authenticatedReturnIntakeQuarantine',
    family: 'intake',
    intendedTerminalClass: 'PRODUCT_RUNTIME_WIRED',
    currentTerminalClass: 'UNTESTED',
    userFacingAuthority: 'NO_RETURN_INTAKE_AUTHORITY',
    physicalEvidence: false,
    reasonCode: 'G00_NO_GOOGLE_RETURN_INTAKE',
    requiredNextContour: 'GOOGLE_G03_RETURN_INTAKE_AND_QUARANTINE',
    blocksGoogleStage: true,
  },
  {
    cellId: 'google.suggestionsLane',
    family: 'suggestions',
    intendedTerminalClass: 'PRODUCT_RUNTIME_WIRED',
    currentTerminalClass: 'UNTESTED',
    userFacingAuthority: 'NO_SUGGESTION_APPLY_AUTHORITY',
    physicalEvidence: false,
    reasonCode: 'G00_SUGGESTIONS_NOT_PARSED_OR_CLASSIFIED',
    requiredNextContour: 'GOOGLE_G04_SUGGESTIONS_IR_AND_CLASSIFIER',
    blocksGoogleStage: true,
  },
  {
    cellId: 'google.commentsLane',
    family: 'comments',
    intendedTerminalClass: 'PRODUCT_RUNTIME_WIRED',
    currentTerminalClass: 'UNTESTED',
    userFacingAuthority: 'NO_COMMENT_IMPORT_CLAIM',
    physicalEvidence: false,
    reasonCode: 'G00_DRIVE_COMMENTS_NOT_IMPORTED',
    requiredNextContour: 'GOOGLE_G05_COMMENTS_REPLIES_STATUS_LANE',
    blocksGoogleStage: true,
  },
  {
    cellId: 'google.formattingLane',
    family: 'formatting',
    intendedTerminalClass: 'DIAGNOSTIC_OR_PRODUCT_RUNTIME_WIRED',
    currentTerminalClass: 'UNTESTED',
    userFacingAuthority: 'NO_FORMATTING_TRANSFER_CLAIM',
    physicalEvidence: false,
    reasonCode: 'G00_FORMATTING_UNMEASURED',
    requiredNextContour: 'GOOGLE_G06_FORMATTING_STRUCTURE_UNICODE_MATRIX',
    blocksGoogleStage: true,
  },
  {
    cellId: 'google.structureLane',
    family: 'structure',
    intendedTerminalClass: 'DIAGNOSTIC_OR_PRODUCT_RUNTIME_WIRED',
    currentTerminalClass: 'UNTESTED',
    userFacingAuthority: 'NO_STRUCTURE_TRANSFER_CLAIM',
    physicalEvidence: false,
    reasonCode: 'G00_STRUCTURE_UNMEASURED',
    requiredNextContour: 'GOOGLE_G06_FORMATTING_STRUCTURE_UNICODE_MATRIX',
    blocksGoogleStage: true,
  },
  {
    cellId: 'google.previewDecisionCommandApply',
    family: 'apply',
    intendedTerminalClass: 'PRODUCT_RUNTIME_WIRED',
    currentTerminalClass: 'UNTESTED',
    userFacingAuthority: 'NO_APPLY_AUTHORITY',
    physicalEvidence: false,
    reasonCode: 'G00_NO_GOOGLE_PREVIEW_OR_COMMAND_APPLY',
    requiredNextContour: 'GOOGLE_G07_PREVIEW_EXPLICIT_DECISION_COMMAND_KERNEL',
    blocksGoogleStage: true,
  },
  {
    cellId: 'google.recoveryReopenReplay',
    family: 'recovery',
    intendedTerminalClass: 'PRODUCT_RUNTIME_WIRED',
    currentTerminalClass: 'UNTESTED',
    userFacingAuthority: 'NO_RECOVERY_REPLAY_CLAIM',
    physicalEvidence: false,
    reasonCode: 'G00_NO_GOOGLE_RECOVERY_OR_REPLAY_LEDGER',
    requiredNextContour: 'GOOGLE_G08_RECOVERY_REOPEN_REPLAY',
    blocksGoogleStage: true,
  },
  {
    cellId: 'google.scaleEnvelope',
    family: 'scale',
    intendedTerminalClass: 'PHYSICAL_GOOGLE_EVIDENCE',
    currentTerminalClass: 'UNTESTED',
    userFacingAuthority: 'NO_GOOGLE_SCALE_ENVELOPE',
    physicalEvidence: false,
    reasonCode: 'G00_SCALE_UNMEASURED',
    requiredNextContour: 'GOOGLE_G09_SCALE_ENVELOPE',
    blocksGoogleStage: true,
  },
]);

function abs(relativePath) {
  return path.join(REPO_ROOT, relativePath);
}

function list(value) {
  return Array.isArray(value) ? value : [];
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

function sourceBinding(id, relativePath) {
  return {
    id,
    path: relativePath,
    sha256: sha256File(relativePath),
    status: 'BOUND',
  };
}

function allZero(object) {
  return Object.values(object || {}).every((value) => Number(value) === 0);
}

function buildWordClosureReceipt() {
  const scale = readJson(WORD_SCALE_REF);
  const matrix = readJson(WORD_MATRIX_REF);
  return {
    schemaVersion: 'yalken.rtk.word-for-mac.formal-stage-closure-receipt.v1',
    taskId: 'YALKEN_WORD_STAGE_FORMAL_CLOSURE',
    status: WORD_CLOSURE_STATUS,
    result: 'PASS',
    createdAtUtc: CREATED_AT_UTC,
    controllerAcceptance: {
      independentAuditThread: WORD_AUDIT_THREAD,
      auditedSha: AUDITED_SHA,
      auditVerdict: 'PASS',
      zeroOpenP0: true,
      zeroOpenP1: true,
      zeroOpenP2: true,
      wordStageAccepted: true,
      wordSaturationAccepted: 'TRUE_DECLARED_SUPPORT_ENVELOPE_ONLY',
      googleDocsStageEligibility: 'CONFIRMED',
    },
    sourceBindings: [
      sourceBinding('WORD_P0_SCALE_ENVELOPE_TERMINAL_AUDIT', WORD_SCALE_REF),
      sourceBinding('WORD_NORMALIZED_CAPABILITY_MATRIX', WORD_MATRIX_REF),
      sourceBinding('POST_D1_PORTABILITY_PROGRAM', PROGRAM_REF),
      sourceBinding('WORD_CAPABILITY_PROFILE', PROFILE_REF),
      sourceBinding('WORD_SATURATION_LEDGER', LEDGER_REF),
    ],
    acceptedEnvelope: {
      profile: 'Microsoft Word for Mac 16.111.2',
      scope: 'DECLARED_SUPPORT_ENVELOPE_ONLY',
      supportedExplicitUserTrackedReplacementWordsMax: scale.supportEnvelope?.supportedTrackedReplacementApply?.maxCertifiedManuscriptWords,
      aboveEnvelopeBoundaryWords: scale.supportEnvelope?.attemptedBoundaryWords,
      aboveEnvelopeDisposition: scale.supportEnvelope?.aboveEnvelopeDisposition,
      automaticApplyCertified: false,
      broadAutomaticApplyCertified: false,
      googleDocsOpenedDuringWordStage: false,
      programDone: false,
    },
    preservedTypedLimitations: {
      modernReplies: 'TYPED_WORD_OOXML_LIMITATION',
      resolveReopen: 'TYPED_WORD_OOXML_LIMITATION',
      formattingApply: 'DIAGNOSTIC_ONLY_TYPED_LIMITATION',
      structuralApply: 'MANUAL_OR_BLOCKED_TYPED_LIMITATION',
      scale150k300k500k: 'MANUAL_RESOURCE_LIMIT',
    },
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      silentCommentLoss: 0,
      productNetwork: 0,
    },
    matrixBinding: {
      totalCells: matrix.counts?.totalCells,
      blocksWordSaturation: matrix.counts?.blocksWordSaturation,
      productRuntimeWired: matrix.counts?.productRuntimeWired,
      physicalWordEvidence: matrix.counts?.physicalWordEvidence,
      automaticApplyCertified: matrix.counts?.automaticApplyCertified,
    },
    nextStage: 'GOOGLE_DOCS_G00_DISCOVERY_BINDING',
    nonClaims: [
      'Word corpus growth is closed unless new source-bound evidence reopens it.',
      'Word typed limitations remain typed limitations.',
      'Program DONE is not claimed.',
      'Google Docs support is not claimed by Word closure.',
    ],
  };
}

function buildGoogleMatrix() {
  const evidenceStatus = readJson(GOOGLE_EVIDENCE_STATUS_REF);
  const rows = GOOGLE_SUPPORT_CELLS.map((row) => ({ ...row }));
  const counts = {
    totalCells: rows.length,
    componentProven: rows.filter((row) => row.currentTerminalClass === 'COMPONENT_PROVEN').length,
    physicalGoogleEvidence: rows.filter((row) => row.physicalEvidence === true).length,
    productRuntimeWired: rows.filter((row) => row.currentTerminalClass === 'PRODUCT_RUNTIME_WIRED').length,
    automaticApplyCertified: 0,
    blocksGoogleStage: rows.filter((row) => row.blocksGoogleStage === true).length,
    externalActivationRequired: rows.filter((row) => row.currentTerminalClass === 'EXTERNAL_ACTIVATION_REQUIRED').length,
  };
  return {
    schemaVersion: 'yalken.rtk.google-docs.safe-roundtrip.g00-capability-matrix.v1',
    taskId: TASK_ID,
    status: STATUS,
    createdAtUtc: CREATED_AT_UTC,
    originMainSha: git('origin/main'),
    localHeadSha: git('HEAD'),
    profileIds: [
      'google-docs-office-mode-post-d1-v1',
      'google-docs-native-conversion-post-d1-v1',
    ],
    acceptedWordClosure: {
      status: WORD_CLOSURE_STATUS,
      receiptPath: WORD_CLOSURE_RECEIPT_REF,
      saturationScope: 'DECLARED_SUPPORT_ENVELOPE_ONLY',
    },
    existingGoogleTruth: {
      evidenceClaimStatusPath: GOOGLE_EVIDENCE_STATUS_REF,
      evidenceClaimStatus: evidenceStatus.status,
      positiveClaimOnly: 'Evidence claim gate validates packet hash, requested coverage, docsSuggestions, and driveComments.',
      supportClaimed: false,
      importClaimed: false,
      roundtripClaimed: false,
      googleApiIntegrationClaimed: false,
      networkAccessAdded: false,
      applyAuthorityClaimed: false,
    },
    approvedAdapterBoundary: {
      noCredentialsHandling: true,
      noPasswordHandling: true,
      noPayment: true,
      noAccountCreation: true,
      syntheticArtifactsOnly: true,
      alreadyAuthorizedSessionOnly: true,
      productNetworkForbiddenOutsideExplicitGoogleAdapterBoundary: true,
      unavailableLiveCloudOutcome: 'EXTERNAL_ACTIVATION_REQUIRED_CONTINUE_LOCAL_ADAPTER_CONTRACTS',
    },
    requiredProductRoute: [
      'UI export',
      'physical Google Docs edit',
      'authenticated quarantined intake',
      'visible preview',
      'explicit decision',
      'Command Kernel apply',
      'atomic recovery',
      'reopen readback',
      'replay',
    ],
    rows,
    counts,
    nextEngineeringOrder: [
      {
        contour: NEXT_STAGE,
        goal: 'Bind an already-authorized synthetic Google Docs session or record the exact external activation boundary; no credentials, no private documents, no support claim.',
      },
      {
        contour: 'GOOGLE_G01_PRODUCT_EXPORT_PACKET_DESIGN',
        goal: 'Design Google transport packet through existing Review DOCX and RTK architecture without runtime network dependency.',
      },
      {
        contour: 'GOOGLE_G03_RETURN_INTAKE_AND_QUARANTINE',
        goal: 'Parse returned Google artifact only after quarantine and typed package/security gate.',
      },
    ],
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      silentCommentLoss: 0,
      productNetworkOutsideAdapter: 0,
      privateDocumentTouch: 0,
      credentialHandling: 0,
      noOpPass: 0,
    },
    nonClaims: [
      'No Google Docs support is claimed.',
      'No Google Docs import is claimed.',
      'No Google Docs roundtrip is claimed.',
      'No Google API runtime dependency is introduced.',
      'No Google Drive integration is introduced.',
      'No automatic apply is certified.',
      'No Google stage DONE is claimed.',
    ],
  };
}

function buildGoogleReceipt(wordClosure, matrix) {
  return {
    schemaVersion: 'yalken.rtk.google-docs.safe-roundtrip.g00-discovery-receipt.v1',
    taskId: TASK_ID,
    status: STATUS,
    result: 'PASS',
    createdAtUtc: CREATED_AT_UTC,
    headBinding: {
      originMainSha: git('origin/main'),
      localHeadSha: git('HEAD'),
      branch: execFileSync('git', ['branch', '--show-current'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim(),
    },
    sourceBindings: [
      sourceBinding('WORD_STAGE_FORMAL_CLOSURE', WORD_CLOSURE_RECEIPT_REF),
      sourceBinding('GOOGLE_G00_MATRIX', GOOGLE_MATRIX_REF),
      sourceBinding('GOOGLE_EVIDENCE_CLAIM_BINDING_STATUS', GOOGLE_EVIDENCE_STATUS_REF),
      sourceBinding('GOOGLE_EVIDENCE_CLAIM_CONTRACT', GOOGLE_EVIDENCE_CONTRACT_REF),
      sourceBinding('GOOGLE_EVIDENCE_GATE_CONTRACT', GOOGLE_GATE_CONTRACT_REF),
      sourceBinding('REVISION_BRIDGE_INDEX', REVISION_BRIDGE_INDEX_REF),
    ],
    wordClosure: {
      status: wordClosure.status,
      auditVerdict: wordClosure.controllerAcceptance.auditVerdict,
      supportedExplicitUserTrackedReplacementWordsMax: wordClosure.acceptedEnvelope.supportedExplicitUserTrackedReplacementWordsMax,
      aboveEnvelopeDisposition: wordClosure.acceptedEnvelope.aboveEnvelopeDisposition,
      automaticApplyCertified: wordClosure.acceptedEnvelope.automaticApplyCertified,
    },
    googleCurrentState: {
      existingEvidenceClaimGateOnly: true,
      physicalGoogleEvidence: matrix.counts.physicalGoogleEvidence,
      productRuntimeWired: matrix.counts.productRuntimeWired,
      automaticApplyCertified: matrix.counts.automaticApplyCertified,
      blockers: matrix.counts.blocksGoogleStage,
      nextStage: NEXT_STAGE,
    },
    gapMap: matrix.rows.map((row) => ({
      cellId: row.cellId,
      currentTerminalClass: row.currentTerminalClass,
      userFacingAuthority: row.userFacingAuthority,
      reasonCode: row.reasonCode,
      requiredNextContour: row.requiredNextContour,
      blocksGoogleStage: row.blocksGoogleStage,
    })),
    safetyInvariants: {
      noCredentialsHandling: true,
      noPrivateUserDocuments: true,
      noPayments: true,
      noAccountCreation: true,
      noProductNetworkOutsideExplicitGoogleAdapterBoundary: true,
      noSilentApply: true,
      noSilentLoss: true,
      noFalseExact: true,
      noWrongSceneRouting: true,
      noReplayFailure: true,
    },
    nextStage: NEXT_STAGE,
    nonClaims: matrix.nonClaims,
  };
}

function evaluateGoogleDocsG00DiscoveryBinding(input = {}) {
  const wordClosure = input.wordClosure || readJson(WORD_CLOSURE_RECEIPT_REF);
  const matrix = input.matrix || readJson(GOOGLE_MATRIX_REF);
  const receipt = input.receipt || readJson(GOOGLE_RECEIPT_REF);
  const program = input.program || readJson(PROGRAM_REF);
  const profile = input.profile || readJson(PROFILE_REF);
  const ledger = input.ledger || readJson(LEDGER_REF);
  const issues = [];
  const add = (code, field, message) => issues.push({ code, field, message });

  if (wordClosure.status !== WORD_CLOSURE_STATUS || wordClosure.result !== 'PASS') {
    add('GOOGLE_G00_WORD_CLOSURE_INVALID', 'wordClosure.status', 'Word closure receipt must be accepted PASS.');
  }
  if (wordClosure.controllerAcceptance?.auditedSha !== AUDITED_SHA
    || wordClosure.controllerAcceptance?.auditVerdict !== 'PASS'
    || wordClosure.controllerAcceptance?.zeroOpenP0 !== true
    || wordClosure.controllerAcceptance?.zeroOpenP1 !== true
    || wordClosure.controllerAcceptance?.zeroOpenP2 !== true) {
    add('GOOGLE_G00_WORD_AUDIT_BINDING_INVALID', 'wordClosure.controllerAcceptance', 'Word closure must bind the accepted independent exact-head audit.');
  }
  if (wordClosure.acceptedEnvelope?.supportedExplicitUserTrackedReplacementWordsMax !== 100000
    || JSON.stringify(wordClosure.acceptedEnvelope?.aboveEnvelopeBoundaryWords) !== JSON.stringify([150000, 300000, 500000])
    || wordClosure.acceptedEnvelope?.aboveEnvelopeDisposition !== 'MANUAL_RESOURCE_LIMIT'
    || wordClosure.acceptedEnvelope?.automaticApplyCertified !== false) {
    add('GOOGLE_G00_WORD_ENVELOPE_OVERCLAIM', 'wordClosure.acceptedEnvelope', 'Word closure must preserve the accepted envelope and typed scale limits.');
  }
  if (!allZero(wordClosure.vetoMetrics)) {
    add('GOOGLE_G00_WORD_VETO_NONZERO', 'wordClosure.vetoMetrics', 'Word closure veto metrics must remain zero.');
  }
  if (matrix.status !== STATUS
    || matrix.counts?.totalCells !== GOOGLE_SUPPORT_CELLS.length
    || matrix.counts?.componentProven !== 1
    || matrix.counts?.physicalGoogleEvidence !== 0
    || matrix.counts?.productRuntimeWired !== 0
    || matrix.counts?.automaticApplyCertified !== 0
    || matrix.counts?.blocksGoogleStage < 1) {
    add('GOOGLE_G00_MATRIX_COUNTS_INVALID', 'matrix.counts', 'G00 matrix must show only existing component evidence and no Google product capability.');
  }
  if (!matrix.rows?.some((row) => row.cellId === 'google.g00.externalActivationBoundary' && row.currentTerminalClass === 'EXTERNAL_ACTIVATION_REQUIRED')) {
    add('GOOGLE_G00_EXTERNAL_BOUNDARY_MISSING', 'matrix.rows', 'G00 must include the exact external activation boundary.');
  }
  if (matrix.existingGoogleTruth?.supportClaimed !== false
    || matrix.existingGoogleTruth?.roundtripClaimed !== false
    || matrix.existingGoogleTruth?.googleApiIntegrationClaimed !== false
    || matrix.existingGoogleTruth?.applyAuthorityClaimed !== false) {
    add('GOOGLE_G00_FALSE_SUPPORT_CLAIM', 'matrix.existingGoogleTruth', 'Existing Google truth must remain evidence-claim only.');
  }
  if (!allZero(matrix.vetoMetrics)) {
    add('GOOGLE_G00_MATRIX_VETO_NONZERO', 'matrix.vetoMetrics', 'G00 veto counters must remain zero.');
  }
  if (receipt.status !== STATUS
    || receipt.result !== 'PASS'
    || receipt.googleCurrentState?.existingEvidenceClaimGateOnly !== true
    || receipt.googleCurrentState?.physicalGoogleEvidence !== 0
    || receipt.googleCurrentState?.productRuntimeWired !== 0
    || receipt.googleCurrentState?.automaticApplyCertified !== 0
    || receipt.nextStage !== NEXT_STAGE) {
    add('GOOGLE_G00_RECEIPT_INVALID', 'receipt', 'G00 receipt must bind discovery only and advance to G01.');
  }
  if (program.googleDocsStage?.status !== STATUS
    || program.googleDocsStage?.nextStage !== NEXT_STAGE
    || program.googleDocsStage?.supportClaimed !== false
    || program.googleDocsStage?.physicalGoogleEvidence !== 0
    || program.googleDocsStage?.automaticApplyCertified !== false) {
    add('GOOGLE_G00_PROGRAM_STATE_INVALID', 'program.googleDocsStage', 'Program must bind Google G00 without support or apply claims.');
  }
  if (program.wordStageClosure?.status !== WORD_CLOSURE_STATUS
    || program.wordStageClosure?.acceptedDeclaredSupportEnvelopeOnly !== true) {
    add('GOOGLE_G00_PROGRAM_WORD_CLOSURE_MISSING', 'program.wordStageClosure', 'Program must formally close the accepted Word stage.');
  }
  if (profile.formalWordStageClosure?.status !== WORD_CLOSURE_STATUS
    || ledger.formalWordStageClosure?.status !== WORD_CLOSURE_STATUS) {
    add('GOOGLE_G00_PROFILE_LEDGER_WORD_CLOSURE_MISSING', 'profile/ledger.formalWordStageClosure', 'Word profile and ledger must bind the formal closure without changing typed limitations.');
  }
  if (ledger.googleDocsStage?.status !== STATUS
    || ledger.googleDocsStage?.productRuntimeWired !== 0
    || ledger.googleDocsStage?.physicalGoogleEvidence !== 0
    || ledger.googleDocsStage?.googleStageDone !== false) {
    add('GOOGLE_G00_LEDGER_STATE_INVALID', 'ledger.googleDocsStage', 'Ledger must bind Google stage as open but not done.');
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    wordClosureStatus: wordClosure.status,
    googleMatrixCells: matrix.counts?.totalCells || 0,
    googleBlockers: matrix.counts?.blocksGoogleStage || 0,
    physicalGoogleEvidence: matrix.counts?.physicalGoogleEvidence || 0,
    productRuntimeWired: matrix.counts?.productRuntimeWired || 0,
    nextStage: receipt.nextStage || '',
  };
}

function applyState(wordClosure, matrix, receipt) {
  const program = readJson(PROGRAM_REF);
  program.status = STATUS;
  program.nextStep = NEXT_STAGE;
  program.wordStageClosure = {
    status: WORD_CLOSURE_STATUS,
    receiptPath: WORD_CLOSURE_RECEIPT_REF,
    independentAuditThread: WORD_AUDIT_THREAD,
    auditedSha: AUDITED_SHA,
    acceptedDeclaredSupportEnvelopeOnly: true,
    supportedExplicitUserTrackedReplacementWordsMax: 100000,
    aboveEnvelopeDisposition: 'MANUAL_RESOURCE_LIMIT',
    automaticApplyCertified: false,
    vetoMetrics: wordClosure.vetoMetrics,
  };
  program.googleDocsStage = {
    status: STATUS,
    currentStage: 'GOOGLE_DOCS_G00_DISCOVERY_BINDING',
    nextStage: NEXT_STAGE,
    matrixPath: GOOGLE_MATRIX_REF,
    receiptPath: GOOGLE_RECEIPT_REF,
    supportClaimed: false,
    importClaimed: false,
    roundtripClaimed: false,
    physicalGoogleEvidence: matrix.counts.physicalGoogleEvidence,
    productRuntimeWired: matrix.counts.productRuntimeWired,
    automaticApplyCertified: false,
    googleStageDone: false,
    blockers: matrix.counts.blocksGoogleStage,
    externalActivationBoundary: 'ALREADY_AUTHORIZED_SESSION_REQUIRED_FOR_PHYSICAL_G01',
  };
  program.v4ExecutionState = {
    ...(program.v4ExecutionState || {}),
    status: STATUS,
    currentStage: 'GOOGLE_DOCS_G00_DISCOVERY_BINDING',
    nextStage: NEXT_STAGE,
    latestReceiptPath: GOOGLE_RECEIPT_REF,
    wordStageClosed: true,
    wordSaturated: true,
    wordSaturationScope: 'DECLARED_SUPPORT_ENVELOPE_ONLY',
    googleDocsOpened: true,
    googleDocsStageDone: false,
    googleDocsSupportClaimed: false,
    googleDocsPhysicalEvidence: 0,
    googleDocsProductRuntimeWired: 0,
    automaticApplyCertified: false,
    programDone: false,
  };
  writeJsonAtomic(abs(PROGRAM_REF), program);

  const profile = readJson(PROFILE_REF);
  profile.formalWordStageClosure = {
    status: WORD_CLOSURE_STATUS,
    receiptPath: WORD_CLOSURE_RECEIPT_REF,
    acceptedDeclaredSupportEnvelopeOnly: true,
    supportedExplicitUserTrackedReplacementWordsMax: 100000,
    aboveEnvelopeDisposition: 'MANUAL_RESOURCE_LIMIT',
    automaticApplyCertified: false,
  };
  profile.nextEditorStage = {
    stage: 'GOOGLE_DOCS_G00_DISCOVERY_BINDING',
    status: STATUS,
    matrixPath: GOOGLE_MATRIX_REF,
    supportClaimed: false,
    physicalEvidence: 0,
    productRuntimeWired: 0,
    automaticApplyCertified: false,
  };
  writeJsonAtomic(abs(PROFILE_REF), profile);

  const ledger = readJson(LEDGER_REF);
  ledger.formalWordStageClosure = {
    status: WORD_CLOSURE_STATUS,
    receiptPath: WORD_CLOSURE_RECEIPT_REF,
    independentAuditThread: WORD_AUDIT_THREAD,
    auditedSha: AUDITED_SHA,
    acceptedDeclaredSupportEnvelopeOnly: true,
    automaticApplyCertified: false,
  };
  ledger.googleDocsStage = {
    status: STATUS,
    receiptPath: GOOGLE_RECEIPT_REF,
    matrixPath: GOOGLE_MATRIX_REF,
    existingEvidenceClaimGateOnly: true,
    physicalGoogleEvidence: matrix.counts.physicalGoogleEvidence,
    productRuntimeWired: matrix.counts.productRuntimeWired,
    automaticApplyCertified: false,
    blockers: matrix.counts.blocksGoogleStage,
    googleStageDone: false,
    nextStage: NEXT_STAGE,
  };
  ledger.coverageLedger = {
    ...(ledger.coverageLedger || {}),
    googleDocsG00DiscoveryBinding: {
      status: 'BOUND_DISCOVERY_ONLY_READY_FOR_G01',
      sourceEvidence: 'GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT',
      physicalGoogleEvidence: matrix.counts.physicalGoogleEvidence,
      productRuntimeWired: matrix.counts.productRuntimeWired,
      automaticApplyCertified: false,
      blockers: matrix.counts.blocksGoogleStage,
      nextStage: NEXT_STAGE,
    },
  };
  writeJsonAtomic(abs(LEDGER_REF), ledger);
}

function updateGovernanceApprovals() {
  const registry = readJson(GOVERNANCE_REF);
  const touched = new Set(GOVERNED_PATHS);
  registry.approvals = list(registry.approvals).filter((entry) => !touched.has(entry.filePath));
  const rationale = 'Approve G00 Google Docs discovery binding: Word for Mac stage is formally closed on accepted declared support envelope, Google Docs stage opens with evidence-claim-only current truth, no support/import/roundtrip/API/apply claim, and next physical work gated on already-authorized synthetic session.';
  for (const filePath of GOVERNED_PATHS) {
    registry.approvals.push({
      filePath,
      sha256: sha256File(filePath),
      approvedBy: 'owner:FINAL_CONTROLLER_ACCEPTANCE_AND_NEXT_STAGE_GO',
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
    const wordClosure = buildWordClosureReceipt();
    writeJsonAtomic(abs(WORD_CLOSURE_RECEIPT_REF), wordClosure);
    const matrix = buildGoogleMatrix();
    writeJsonAtomic(abs(GOOGLE_MATRIX_REF), matrix);
    const receipt = buildGoogleReceipt(wordClosure, matrix);
    writeJsonAtomic(abs(GOOGLE_RECEIPT_REF), receipt);
    applyState(wordClosure, matrix, receipt);
    updateGovernanceApprovals();
  }
  const result = evaluateGoogleDocsG00DiscoveryBinding();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_GOOGLE_DOCS_G00_DISCOVERY_BINDING=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

export {
  buildGoogleMatrix,
  buildGoogleReceipt,
  buildWordClosureReceipt,
  evaluateGoogleDocsG00DiscoveryBinding,
};

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    process.exit(1);
  });
}
