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

const TASK_ID = 'GOOGLE_DOCS_LOCAL_COMPATIBILITY_G00_REBIND_V1';
const STATUS = 'LOCAL_COMPATIBILITY_REBOUND_NEEDS_REAL_ACCOUNT_E2E';
const RESULT = 'LOCAL_COMPATIBILITY_NEEDS_MORE_EVIDENCE';
const CREATED_AT_UTC = '2026-08-15T00:00:00.000Z';
const WORD_PROFILE_ID = 'word-mac-16.112-26081010';
const WORD_SCOPE_STATUS = 'COMPLETE_NOT_SATURATED';
const NEXT_LOCAL_CONTOUR = 'GOOGLE_DOCS_LOCAL_EXPORT_PACKET_QUARANTINE_V1';
const REAL_ACCOUNT_E2E_BOUNDARY = 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE';

const GOOGLE_PROFILE_REGISTRY_REF = 'docs/OPS/RTK/GOOGLE_BUILD_PROFILE_REGISTRY_V1.json';
const GOOGLE_EVIDENCE_STATUS_REF = 'docs/OPS/STATUS/REVIEW_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_BINDING_001_STATUS.json';
const GOOGLE_EVIDENCE_CLAIM_CONTRACT_REF = 'test/contracts/review-bridge-google-docs-evidence-claim-binding.contract.test.js';
const GOOGLE_GATE_CONTRACT_REF = 'test/contracts/revision-bridge-google-docs-evidence-check.contract.test.js';
const GOOGLE_MATRIX_REF = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json';
const GOOGLE_RECEIPT_REF = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json';
const TERMINAL_CLAIM_REGISTRY_REF = 'docs/OPS/RTK/YALKEN_INTEROP_TERMINAL_CLAIM_REGISTRY_V1.json';
const WORD_SATURATION_AUDIT_REF = 'docs/OPS/RTK/WORD_MAC_16_112_SATURATION_LIMITATION_AUDIT_RECEIPT.json';
const WORD_TYPED_ADVERSE_REF = 'docs/OPS/RTK/WORD_MAC_16_112_TYPED_ADVERSE_SCHEDULES_RECEIPT.json';
const SCRIPT_REF = 'scripts/ops/rtk-google-docs-g00-discovery-binding.mjs';
const MODEL_REF = 'scripts/ops/rtk-google-docs-g00-rebind-model.mjs';
const CONTRACT_REF = 'test/contracts/rtk-google-docs-g00-discovery-binding.contract.test.js';
const GOOGLE_EVIDENCE_GATE_CONTRACT_TEST_REF = 'test/contracts/revision-bridge-google-docs-evidence-check.contract.test.js';
const GOVERNANCE_REF = 'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json';

const GOVERNED_PATHS = Object.freeze([
  GOOGLE_PROFILE_REGISTRY_REF,
  GOOGLE_MATRIX_REF,
  GOOGLE_RECEIPT_REF,
  SCRIPT_REF,
  MODEL_REF,
  CONTRACT_REF,
  GOOGLE_EVIDENCE_GATE_CONTRACT_TEST_REF,
]);

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
    requiredNextContour: 'GOOGLE_DOCS_REAL_ACCOUNT_E2E_AUTHORITY_BOUNDARY',
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
    requiredNextContour: NEXT_LOCAL_CONTOUR,
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
    requiredNextContour: 'GOOGLE_DOCS_REAL_ACCOUNT_E2E_AUTHORITY_BOUNDARY',
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
    requiredNextContour: 'GOOGLE_DOCS_REAL_ACCOUNT_E2E_AUTHORITY_BOUNDARY',
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
    requiredNextContour: 'GOOGLE_DOCS_LOCAL_RETURN_INTAKE_QUARANTINE_V1',
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
    requiredNextContour: 'GOOGLE_DOCS_LOCAL_SUGGESTIONS_IR_ABSTAIN_V1',
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
    requiredNextContour: 'GOOGLE_DOCS_LOCAL_COMMENTS_LIMITATION_V1',
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
    requiredNextContour: 'GOOGLE_DOCS_LOCAL_FORMAT_STRUCTURE_MATRIX_V1',
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
    requiredNextContour: 'GOOGLE_DOCS_LOCAL_FORMAT_STRUCTURE_MATRIX_V1',
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
    requiredNextContour: 'GOOGLE_DOCS_LOCAL_PREVIEW_ONLY_NO_APPLY_V1',
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
    requiredNextContour: 'GOOGLE_DOCS_LOCAL_RECOVERY_REPLAY_CONTRACT_V1',
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
    requiredNextContour: 'GOOGLE_DOCS_REAL_ACCOUNT_E2E_AUTHORITY_BOUNDARY',
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

function sha256WritableJson(value) {
  return crypto.createHash('sha256').update(Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8')).digest('hex');
}

function git(ref) {
  return execFileSync('git', ['rev-parse', ref], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function branchName() {
  return execFileSync('git', ['branch', '--show-current'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
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

function summarizeGoogleProfiles(registry) {
  const profiles = list(registry?.profiles);
  return profiles.map((profile) => ({
    profileId: profile.profileId,
    class: profile.class,
    provider: profile.provider,
    editorMode: profile.editorMode,
    conversionBoundary: profile.conversionBoundary,
    evidenceHeads: list(profile.evidenceHeads).length,
    completedRungs: list(profile.ladder?.completedRungs).length,
  }));
}

function currentWordBoundary(terminal, saturationAudit) {
  const blockers = list(terminal?.terminalRollup?.blockers);
  return {
    profileId: WORD_PROFILE_ID,
    status: saturationAudit?.status || WORD_SCOPE_STATUS,
    currentCompatibilityClaimClass: 'NOT_CLAIMED_BLOCKED',
    wordScopeReady: saturationAudit?.status === WORD_SCOPE_STATUS,
    wordSaturated: false,
    terminalRollupState: terminal?.terminalRollup?.state || 'UNKNOWN',
    terminalPassClaimed: false,
    blockersStillPresent: blockers.filter((blocker) => [
      `WORD_PROFILE_NOT_SATURATED:${WORD_PROFILE_ID}`,
      'BLOCKED_CLAIM:claim-current-word-compatibility',
      'BLOCKED_CLAIM:claim-google-office-mode',
      'BLOCKED_CLAIM:claim-google-native-conversion',
    ].includes(blocker)),
    evidenceTransferToGoogleDocs: 'DENY',
  };
}

function buildCurrentRealityAudit() {
  return {
    realAdapterExists: false,
    existingFlow: 'EVIDENCE_CLAIM_GATE_ONLY',
    exactInputs: [
      'revision-bridge.google-docs-evidence-packet.v1 claim packet',
      'Google Docs provider profile declarations',
    ],
    exactOutputs: [
      'typed evidence-claim PASS/FAIL only',
      'report-only compatibility matrix',
      'no project mutation',
    ],
    transportCandidates: {
      officeMode: 'DOCX edited in Google Docs without conversion; DECLARED only',
      nativeConversion: 'DOCX to Google native to DOCX; DECLARED and lossy by default until evidence',
      odt: 'ABSTAIN_NO_REPO_ADAPTER',
      html: 'ABSTAIN_NO_REPO_ADAPTER',
      googleApi: 'ABSTAIN_NO_AUTHORITY_NO_RUNTIME_DEPENDENCY',
    },
    ownership: 'Review Bridge evidence claim boundary only; no Google product writer.',
    identityRevisionFence: 'NOT_ADMITTED_FOR_GOOGLE_RUNTIME',
    quarantine: 'NOT_WIRED',
    accessibilityFallback: 'Typed limitation and no support claim; no Google UI surface is changed.',
    localCompatibilityVerdict: RESULT,
    realAccountE2E: REAL_ACCOUNT_E2E_BOUNDARY,
    roundtripLossMatrix: {
      officeMode: 'ABSTAIN_NO_SIGNED_IN_E2E',
      nativeConversion: 'ABSTAIN_LOSSY_BY_DEFAULT_UNTIL_EVIDENCE',
      suggestions: 'ABSTAIN_NO_PARSER_OR_E2E',
      comments: 'ABSTAIN_NO_DRIVE_COMMENTS_IMPORT',
      footnotes: 'ABSTAIN_UNMEASURED',
      tables: 'ABSTAIN_UNMEASURED',
      media: 'ABSTAIN_UNMEASURED',
      ids: 'ABSTAIN_NO_IDENTITY_FENCE',
    },
  };
}

function buildGoogleMatrix(input = {}) {
  const evidenceStatus = input.googleEvidenceStatus || readJson(GOOGLE_EVIDENCE_STATUS_REF);
  const googleProfiles = input.googleProfiles || readJson(GOOGLE_PROFILE_REGISTRY_REF);
  const terminal = input.terminal || readJson(TERMINAL_CLAIM_REGISTRY_REF);
  const saturationAudit = input.saturationAudit || readJson(WORD_SATURATION_AUDIT_REF);
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
    result: RESULT,
    createdAtUtc: CREATED_AT_UTC,
    originMainSha: git('origin/main'),
    localHeadSha: git('HEAD'),
    profileIds: [
      'google-docs-office-mode-post-d1-v1',
      'google-docs-native-conversion-post-d1-v1',
    ],
    currentWordBoundary: currentWordBoundary(terminal, saturationAudit),
    googleProfileSummary: summarizeGoogleProfiles(googleProfiles),
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
      alreadyAuthorizedSessionOnly: false,
      productNetworkForbiddenOutsideExplicitGoogleAdapterBoundary: true,
      unavailableLiveCloudOutcome: REAL_ACCOUNT_E2E_BOUNDARY,
    },
    currentRealityAudit: buildCurrentRealityAudit(),
    requiredProductRoute: [
      'export packet design',
      'physical Google Docs edit under separately authorized account/session',
      'authenticated quarantined intake',
      'visible preview',
      'explicit decision',
      'Command Kernel apply only after a future contour',
      'atomic recovery',
      'reopen readback',
      'replay',
    ],
    rows,
    counts,
    nextEngineeringOrder: [
      {
        contour: NEXT_LOCAL_CONTOUR,
        goal: 'Design and test only an offline/synthetic Google transport packet plus quarantine contract; no Google account, no runtime network, no support claim.',
      },
      {
        contour: 'GOOGLE_DOCS_REAL_ACCOUNT_E2E_AUTHORITY_BOUNDARY',
        goal: 'If real signed-in Google Docs evidence is required, request exact owner account/network/session authority and run disposable synthetic documents only.',
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
      'Word 16.112 evidence is non-transferable to Google Docs.',
      'Real signed-in Google Docs E2E requires separate owner/account authority.',
    ],
  };
}

function buildGoogleReceipt(matrix) {
  return {
    schemaVersion: 'yalken.rtk.google-docs.safe-roundtrip.g00-discovery-receipt.v1',
    taskId: TASK_ID,
    status: STATUS,
    result: RESULT,
    createdAtUtc: CREATED_AT_UTC,
    headBinding: {
      originMainSha: git('origin/main'),
      localHeadSha: git('HEAD'),
      branch: branchName(),
    },
    sourceBindings: [
      sourceBinding('WORD_MAC_16_112_SATURATION_LIMITATION_AUDIT', WORD_SATURATION_AUDIT_REF),
      sourceBinding('WORD_MAC_16_112_TYPED_ADVERSE_SCHEDULES', WORD_TYPED_ADVERSE_REF),
      sourceBinding('INTEROP_TERMINAL_CLAIM_REGISTRY', TERMINAL_CLAIM_REGISTRY_REF),
      sourceBinding('GOOGLE_G00_MATRIX', GOOGLE_MATRIX_REF),
      sourceBinding('GOOGLE_EVIDENCE_CLAIM_BINDING_STATUS', GOOGLE_EVIDENCE_STATUS_REF),
      sourceBinding('GOOGLE_EVIDENCE_CLAIM_CONTRACT', GOOGLE_EVIDENCE_CLAIM_CONTRACT_REF),
      sourceBinding('GOOGLE_EVIDENCE_GATE_CONTRACT', GOOGLE_GATE_CONTRACT_REF),
    ],
    wordCurrentScope: matrix.currentWordBoundary,
    googleCurrentState: {
      existingEvidenceClaimGateOnly: true,
      supportClaimed: false,
      importClaimed: false,
      roundtripClaimed: false,
      googleApiIntegrationClaimed: false,
      networkAccessAdded: false,
      applyAuthorityClaimed: false,
      physicalGoogleEvidence: matrix.counts.physicalGoogleEvidence,
      productRuntimeWired: matrix.counts.productRuntimeWired,
      automaticApplyCertified: matrix.counts.automaticApplyCertified,
      blockers: matrix.counts.blocksGoogleStage,
      googleStageDone: false,
      localCompatibilityVerdict: RESULT,
      realAccountE2E: REAL_ACCOUNT_E2E_BOUNDARY,
      nextLocalContour: NEXT_LOCAL_CONTOUR,
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
      noWordEvidenceInheritance: true,
    },
    currentRealityAudit: matrix.currentRealityAudit,
    nextLocalContour: NEXT_LOCAL_CONTOUR,
    realAccountE2E: REAL_ACCOUNT_E2E_BOUNDARY,
    nonClaims: matrix.nonClaims,
  };
}

function validateDeclaredEmptyProfiles(googleProfiles, issues) {
  const profiles = list(googleProfiles?.profiles);
  const expected = new Set(['google-docs-office-mode-post-d1-v1', 'google-docs-native-conversion-post-d1-v1']);
  if (profiles.length !== 2) {
    issues.push({ code: 'GOOGLE_G00_PROFILE_SET_INVALID', field: 'googleProfiles.profiles', message: 'Google G00 must have exactly two declared profiles.' });
    return;
  }
  for (const profile of profiles) {
    if (!expected.has(profile.profileId)
      || profile.provider !== 'google-docs'
      || profile.class !== 'DECLARED'
      || list(profile.evidenceHeads).length !== 0
      || list(profile.ladder?.completedRungs).length !== 0) {
      issues.push({
        code: 'GOOGLE_G00_PROFILE_NOT_DECLARED_EMPTY',
        field: `googleProfiles.profiles.${profile.profileId || 'unknown'}`,
        message: 'Google profile must remain DECLARED with no evidence heads and no ladder rungs in G00.',
      });
    }
  }
}

function evaluateGoogleDocsG00DiscoveryBinding(input = {}) {
  const matrix = input.matrix || readJson(GOOGLE_MATRIX_REF);
  const receipt = input.receipt || readJson(GOOGLE_RECEIPT_REF);
  const googleProfiles = input.googleProfiles || readJson(GOOGLE_PROFILE_REGISTRY_REF);
  const googleEvidenceStatus = input.googleEvidenceStatus || readJson(GOOGLE_EVIDENCE_STATUS_REF);
  const terminal = input.terminal || readJson(TERMINAL_CLAIM_REGISTRY_REF);
  const issues = [];
  const add = (code, field, message) => issues.push({ code, field, message });

  validateDeclaredEmptyProfiles(googleProfiles, issues);

  if (matrix.status !== STATUS || matrix.result !== RESULT) {
    add('GOOGLE_G00_MATRIX_STATUS_INVALID', 'matrix.status', 'G00 matrix must be rebound to the current local compatibility verdict.');
  }
  if (matrix.currentWordBoundary?.profileId !== WORD_PROFILE_ID
    || matrix.currentWordBoundary?.evidenceTransferToGoogleDocs !== 'DENY'
    || matrix.currentWordBoundary?.terminalPassClaimed !== false
    || matrix.currentWordBoundary?.wordScopeReady !== true) {
    add('GOOGLE_G00_WORD_INHERITANCE_ATTEMPT', 'matrix.currentWordBoundary', 'Word 16.112 scope must be non-transferable to Google Docs.');
  }
  if (matrix.counts?.totalCells !== GOOGLE_SUPPORT_CELLS.length
    || matrix.counts?.componentProven !== 1
    || matrix.counts?.physicalGoogleEvidence !== 0
    || matrix.counts?.productRuntimeWired !== 0
    || matrix.counts?.automaticApplyCertified !== 0
    || matrix.counts?.blocksGoogleStage !== 12
    || matrix.counts?.externalActivationRequired !== 1) {
    add('GOOGLE_G00_MATRIX_COUNTS_INVALID', 'matrix.counts', 'G00 matrix must show only evidence-claim component proof and no Google product/runtime/physical evidence.');
  }
  if (!matrix.rows?.some((row) => row.cellId === 'google.g00.externalActivationBoundary' && row.currentTerminalClass === 'EXTERNAL_ACTIVATION_REQUIRED')) {
    add('GOOGLE_G00_EXTERNAL_BOUNDARY_MISSING', 'matrix.rows', 'G00 must include the exact real-account/session activation boundary.');
  }
  if (matrix.existingGoogleTruth?.evidenceClaimStatus !== googleEvidenceStatus.status
    || matrix.existingGoogleTruth?.supportClaimed !== false
    || matrix.existingGoogleTruth?.importClaimed !== false
    || matrix.existingGoogleTruth?.roundtripClaimed !== false
    || matrix.existingGoogleTruth?.googleApiIntegrationClaimed !== false
    || matrix.existingGoogleTruth?.networkAccessAdded !== false
    || matrix.existingGoogleTruth?.applyAuthorityClaimed !== false) {
    add('GOOGLE_G00_FALSE_SUPPORT_CLAIM', 'matrix.existingGoogleTruth', 'Existing Google truth must remain evidence-claim only.');
  }
  if (!allZero(matrix.vetoMetrics)) {
    add('GOOGLE_G00_MATRIX_VETO_NONZERO', 'matrix.vetoMetrics', 'G00 veto counters must remain zero.');
  }
  if (matrix.currentRealityAudit?.realAdapterExists !== false
    || matrix.currentRealityAudit?.existingFlow !== 'EVIDENCE_CLAIM_GATE_ONLY'
    || matrix.currentRealityAudit?.identityRevisionFence !== 'NOT_ADMITTED_FOR_GOOGLE_RUNTIME'
    || matrix.currentRealityAudit?.quarantine !== 'NOT_WIRED'
    || matrix.currentRealityAudit?.localCompatibilityVerdict !== RESULT
    || matrix.currentRealityAudit?.realAccountE2E !== REAL_ACCOUNT_E2E_BOUNDARY
    || matrix.currentRealityAudit?.roundtripLossMatrix?.officeMode !== 'ABSTAIN_NO_SIGNED_IN_E2E'
    || matrix.currentRealityAudit?.roundtripLossMatrix?.nativeConversion !== 'ABSTAIN_LOSSY_BY_DEFAULT_UNTIL_EVIDENCE') {
    add('GOOGLE_G00_CURRENT_REALITY_AUDIT_INVALID', 'matrix.currentRealityAudit', 'G00 current-reality audit must be explicit ABSTAIN/NEEDS_MORE_EVIDENCE, not PASS.');
  }
  if (receipt.status !== STATUS
    || receipt.result !== RESULT
    || receipt.googleCurrentState?.existingEvidenceClaimGateOnly !== true
    || receipt.googleCurrentState?.supportClaimed !== false
    || receipt.googleCurrentState?.importClaimed !== false
    || receipt.googleCurrentState?.roundtripClaimed !== false
    || receipt.googleCurrentState?.applyAuthorityClaimed !== false
    || receipt.googleCurrentState?.physicalGoogleEvidence !== 0
    || receipt.googleCurrentState?.productRuntimeWired !== 0
    || receipt.googleCurrentState?.automaticApplyCertified !== 0
    || receipt.googleCurrentState?.googleStageDone !== false
    || receipt.googleCurrentState?.realAccountE2E !== REAL_ACCOUNT_E2E_BOUNDARY) {
    add('GOOGLE_G00_RECEIPT_INVALID', 'receipt', 'G00 receipt must keep Google as local compatibility NEEDS_MORE_EVIDENCE with real-account E2E blocked.');
  }
  const googleClaims = list(terminal?.claims).filter((claim) => String(claim?.evidenceBinding?.profileId || '').startsWith('google-docs-'));
  if (googleClaims.length !== 2 || googleClaims.some((claim) => claim.claimClass !== 'NOT_CLAIMED_BLOCKED')) {
    add('GOOGLE_G00_TERMINAL_CLAIM_ESCALATION', 'terminal.claims', 'Terminal Google claims must remain NOT_CLAIMED_BLOCKED.');
  }
  const terminalBlockers = list(terminal?.terminalRollup?.blockers);
  for (const blocker of [
    'GOOGLE_PROFILE_DECLARED:google-docs-native-conversion-post-d1-v1',
    'GOOGLE_PROFILE_DECLARED:google-docs-office-mode-post-d1-v1',
  ]) {
    if (!terminalBlockers.includes(blocker)) {
      add('GOOGLE_G00_TERMINAL_BLOCKER_MISSING', 'terminal.terminalRollup.blockers', `Missing ${blocker}.`);
    }
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    googleMatrixCells: matrix.counts?.totalCells || 0,
    googleBlockers: matrix.counts?.blocksGoogleStage || 0,
    physicalGoogleEvidence: matrix.counts?.physicalGoogleEvidence || 0,
    productRuntimeWired: matrix.counts?.productRuntimeWired || 0,
    localCompatibilityVerdict: matrix.currentRealityAudit?.localCompatibilityVerdict || null,
    realAccountE2E: matrix.currentRealityAudit?.realAccountE2E || null,
    nextLocalContour: receipt.nextLocalContour || '',
  };
}

function updateGoogleProfileRegistryDiscoveryHeads(matrix, receipt) {
  const registry = readJson(GOOGLE_PROFILE_REGISTRY_REF);
  registry.purpose = 'Machine-readable google-docs provider profiles for the GOOGLE-01 no-inheritance contract. Google Docs has two distinct editor modes (OFFICE_MODE and NATIVE_CONVERSION) with separate evidence heads. On the current exact-head local compatibility audit both profiles remain DECLARED with empty evidence heads and empty ladders. Word 16.112 evidence is non-transferable to Google Docs; no Google support/import/roundtrip/API/apply authority is claimed.';
  const heads = new Map(list(registry.discoveryHeads).map((entry) => [entry.path, { ...entry }]));
  heads.set(GOOGLE_MATRIX_REF, {
    path: GOOGLE_MATRIX_REF,
    sha256: `sha256:${sha256WritableJson(matrix)}`,
    note: 'G00 current local compatibility matrix — discovery/program evidence, NOT profile evidence. It cannot certify either Google profile.',
  });
  heads.set(GOOGLE_RECEIPT_REF, {
    path: GOOGLE_RECEIPT_REF,
    sha256: `sha256:${sha256WritableJson(receipt)}`,
    note: 'G00 current local compatibility receipt — discovery/program evidence, NOT profile evidence. It cannot certify either Google profile.',
  });
  heads.set(GOOGLE_EVIDENCE_STATUS_REF, {
    path: GOOGLE_EVIDENCE_STATUS_REF,
    sha256: `sha256:${sha256File(GOOGLE_EVIDENCE_STATUS_REF)}`,
    note: 'Review-bridge claim-binding status — evidence-claim gate only, not Google support/import/roundtrip authority.',
  });
  registry.discoveryHeads = [...heads.values()].sort((a, b) => a.path.localeCompare(b.path));
  return registry;
}

function updateGovernanceApprovals() {
  const registry = readJson(GOVERNANCE_REF);
  const touched = new Set([...GOVERNED_PATHS, GOVERNANCE_REF]);
  registry.approvals = list(registry.approvals).filter((entry) => !touched.has(entry.filePath));
  const rationale = 'Owner-approved Google Docs G00 local compatibility rebind after Word 16.112 closure: no Google account, no runtime network, no user documents, no support/import/roundtrip/API/apply claim, Word evidence transfer DENY.';
  for (const filePath of GOVERNED_PATHS) {
    registry.approvals.push({
      filePath,
      sha256: sha256File(filePath),
      approvedBy: 'owner:LEGACY_FEATURE_PROGRAM_GOOGLE_DOCS_LOCAL_COMPATIBILITY_G00_REBIND_V1',
      approvedAtUtc: CREATED_AT_UTC,
      rationale,
      authority: 'OWNER_BRIEF_2026_08_15_LEGACY_FEATURE_PROGRAM_LOCAL_RELEASE_CANDIDATE',
    });
  }
  writeJsonAtomic(abs(GOVERNANCE_REF), registry);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const write = args.has('--write');
  const json = args.has('--json');
  if (write) {
    const matrix = buildGoogleMatrix();
    writeJsonAtomic(abs(GOOGLE_MATRIX_REF), matrix);
    const receipt = buildGoogleReceipt(matrix);
    writeJsonAtomic(abs(GOOGLE_RECEIPT_REF), receipt);
    const googleProfileRegistry = updateGoogleProfileRegistryDiscoveryHeads(matrix, receipt);
    writeJsonAtomic(abs(GOOGLE_PROFILE_REGISTRY_REF), googleProfileRegistry);
    updateGovernanceApprovals();
  }
  const result = evaluateGoogleDocsG00DiscoveryBinding();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_GOOGLE_DOCS_G00_DISCOVERY_BINDING=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

export {
  buildGoogleMatrix,
  buildGoogleReceipt,
  evaluateGoogleDocsG00DiscoveryBinding,
  updateGoogleProfileRegistryDiscoveryHeads,
};

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    process.exit(1);
  });
}
