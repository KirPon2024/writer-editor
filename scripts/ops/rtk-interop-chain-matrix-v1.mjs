#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const MATRIX_PATH = 'docs/OPS/RTK/YALKEN_INTEROP_CHAIN_MATRIX_V1.json';
export const LINEAGE_RECEIPT_PATH = 'docs/OPS/RTK/YALKEN_INTEROP_MULTI_ROUND_LINEAGE_RECEIPT_V1.json';
export const CATALOG_PATH = 'docs/OPS/RTK/RTK_TEST_GRAPH_CATALOG_V1.json';
export const GOOGLE_WHOLE_BOOK_RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_REAL_ACCOUNT_WHOLE_BOOK_E2E_V1_RECEIPT.json';
export const CONTRACT_BASENAME = 'rtk-interop-chain-matrix.contract.test.js';

export const MATRIX_SCHEMA_VERSION = 'yalken.interopChain.matrix.v1';
export const LINEAGE_SCHEMA_VERSION = 'yalken.interopChain.multiRoundLineage.receipt.v1';
export const INTEROP_CHAIN_EXACT_HEAD_SHA = '8504d5fa8db9af9456cc6a6d0ec8b1aa8ad4d81a';
export const INTEROP_CHAIN_PRE_AUTH_REPAIR_ROUTE_SHA = '1b8a23441ba29b6cac79a62a3b18ece031654e62';
export const INTEROP_CHAIN_PRE_VISIBILITY_REPLAY_SHA = '5ebb75f4110bb1a287ad9a9109cebdeb373642ba';
export const INTEROP_CHAIN_PRE_WINDOW_REPAIR_REPLAY_SHA = '9453e232a65b6cf92ceb802adf2d2f776fd3ee33';
export const INTEROP_CHAIN_PRE_NATIVE_MATERIALIZATION_REPLAY_SHA = '834f37a8cb5ba3eb854f6407e2dc4e7e14606d88';
export const INTEROP_CHAIN_PRE_ORACLE_OUTCOME_MISMATCH_REPAIR_SHA = '279dde31d1bcf4c6a7cc80f6acfd034f9bdd600b';
export const INTEROP_CHAIN_PRE_APPLY_LIFECYCLE_REUSE_GATE_REPAIR_SHA = '6aee73c0770357cd0b84bf5e8388cee38071c798';
export const INTEROP_CHAIN_PRE_REUSE_GATE_REPLAY_SHA = '5a5b34210bad80eaf1851efcf5a64426484f3f2a';
export const INTEROP_CHAIN_PRE_STDOUT_DRAIN_REPAIR_SHA = '77bbf5c24459d5a16dd8e20a51de0987235eab13';
export const INTEROP_CHAIN_POST_EXACT_LEDGER_REPAIR_PR_HEAD_SHA = 'f53f80fe21828c270f04ef7766d2fe74bbe2d31f';
export const INTEROP_CHAIN_POST_EXACT_LEDGER_REPAIR_MERGE_SHA = '8b3d9cbb3d76c43bd777104bf95cf209062e6d40';
export const INTEROP_CHAIN_POST_EXACT_LEDGER_REPAIR_MERGE_TREE = 'c07b18ed3db7fbb859596e224830f371bd698320';
export const INTEROP_CHAIN_CURRENT_RUNTIME_PRECONDITION = 'CALLER_IDENTITY_PROBE_ROUTING_RECLASSIFIED';
export const INTEROP_CHAIN_CURRENT_RUNTIME_REPLAY_AUTHORITY = 'ALLOW_GOVERNED_HAMMERSPOON_ACCESSIBILITY_ROUTE_FOR_W0_PHYSICAL_RECERTIFICATION';
export const INTEROP_CHAIN_LEGACY_PERMISSION_BLOCKER_ID = 'C1_WORD_MACOS_ACCESSIBILITY_PERMISSION_REQUIRED_CURRENT_BLOCKER';
export const MATRIX_STATUS = 'INTEROP_CHAIN_C1_C8_DENOMINATOR_REGISTERED_NEEDS_MORE_EVIDENCE';
export const NEXT_SEQUENTIAL_CONTOUR = 'V2_WORD_CLAIM_COMPILER_AFTER_W0_PHYSICAL_RECERTIFICATION_V1';
export const POST_FAILCLOSED_REPLAY_FULL_BOOK_ACCOUNTING = 'FULL_BOOK_ATTEMPTED_POST_FAILCLOSED_REPLAY_EXACT_LEDGER_BINDING_BLOCKED_NOT_PROVEN';
export const POST_REUSE_GATE_REPAIR_FULL_BOOK_ACCOUNTING = POST_FAILCLOSED_REPLAY_FULL_BOOK_ACCOUNTING;
export const POST_AUTH_REPAIR_FULL_BOOK_ACCOUNTING = POST_REUSE_GATE_REPAIR_FULL_BOOK_ACCOUNTING;

export const EXPECTED_ROUTE_IDS = Object.freeze(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8']);
export const ALLOWED_ROUTE_VERDICTS = Object.freeze(['NEEDS_MORE_EVIDENCE', 'UNSUPPORTED', 'BLOCKED', 'PASS']);
export const NON_PASS_ROUTE_VERDICTS = Object.freeze(['NEEDS_MORE_EVIDENCE', 'UNSUPPORTED', 'BLOCKED']);
export const BLOCKED_ACCOUNTING_STATES = Object.freeze(['UNKNOWN', 'ABSTAIN', 'CONFLICTING']);
export const NON_PROVEN_FULL_BOOK_ACCOUNTING_STATES = Object.freeze([
  'REQUIRED_NOT_YET_PROVEN_FOR_ROUTE',
  POST_AUTH_REPAIR_FULL_BOOK_ACCOUNTING,
]);

const MATRIX_EXACT_KEYS = Object.freeze([
  'schemaVersion',
  'documentClass',
  'status',
  'claimBoundary',
  'generatedAtUtc',
  'exactHead',
  'programVerdict',
  'sourceEvidence',
  'canonicalFullBookDenominator',
  'claimControls',
  'routeDenominator',
  'nextSequentialContour',
  'rollback',
]);

const RECEIPT_EXACT_KEYS = Object.freeze([
  'schemaVersion',
  'documentClass',
  'status',
  'claimBoundary',
  'generatedAtUtc',
  'exactHead',
  'matrixPath',
  'matrixSha256',
  'routeIds',
  'lineageStatus',
  'googleWholeBookInput',
  'multiRoundLineageRequirements',
  'routeClosurePolicy',
  'deniedClaims',
  'rollback',
]);

function repoRootFromHere() {
  const scriptPath = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(scriptPath), '..', '..');
}

export function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function sha256File(repoRoot, repoRelativePath) {
  return sha256Bytes(fs.readFileSync(path.join(repoRoot, repoRelativePath)));
}

function readJsonAt(repoRoot, repoRelativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, repoRelativePath), 'utf8'));
}

function tryReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function readChainMatrix(repoRoot = repoRootFromHere()) {
  return readJsonAt(repoRoot, MATRIX_PATH);
}

export function readLineageReceipt(repoRoot = repoRootFromHere()) {
  return readJsonAt(repoRoot, LINEAGE_RECEIPT_PATH);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected, label, errors) {
  if (!isObject(value)) {
    errors.push(`${label}:NOT_OBJECT`);
    return;
  }
  const actual = Object.keys(value).sort();
  const want = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(want)) {
    errors.push(`${label}:KEYSET_INVALID:${actual.join(',')}`);
  }
}

function isCommitSha(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/u.test(value);
}

function isSha256(value) {
  return typeof value === 'string' && /^(?:sha256:)?[0-9a-f]{64}$/u.test(value);
}

function routeSetValid(routes) {
  if (!Array.isArray(routes)) return false;
  const ids = routes.map((route) => route?.routeId);
  return JSON.stringify(ids) === JSON.stringify(EXPECTED_ROUTE_IDS);
}

function validateRoute(route, errors) {
  if (!isObject(route)) {
    errors.push('routeDenominator:ROUTE_NOT_OBJECT');
    return;
  }
  if (!EXPECTED_ROUTE_IDS.includes(route.routeId)) {
    errors.push(`routeDenominator:UNKNOWN_ROUTE:${route.routeId}`);
  }
  if (!Array.isArray(route.hops) || route.hops.length < 3) {
    errors.push(`routeDenominator:${route.routeId}:HOPS_REQUIRED`);
  }
  if (route.fullCanonicalSyntheticBookRequired !== true) {
    errors.push(`routeDenominator:${route.routeId}:FULL_BOOK_REQUIRED`);
  }
  if (route.userDocumentsAllowed !== false) {
    errors.push(`routeDenominator:${route.routeId}:USER_DOCUMENTS_MUST_BE_FORBIDDEN`);
  }
  if (route.productMutationAuthority !== 'DENY_UNTIL_ROUTE_CONTOUR_PROVES_APPLY_AUTHORITY') {
    errors.push(`routeDenominator:${route.routeId}:PRODUCT_MUTATION_AUTHORITY_ESCALATION`);
  }
  if (!ALLOWED_ROUTE_VERDICTS.includes(route.routeVerdict)) {
    errors.push(`routeDenominator:${route.routeId}:ROUTE_VERDICT_INVALID`);
  }
  if (route.routeVerdict === 'PASS' && (!Array.isArray(route.executedFullRouteEvidence) || route.executedFullRouteEvidence.length === 0)) {
    errors.push(`routeDenominator:${route.routeId}:PASS_WITHOUT_EXECUTED_FULL_ROUTE_EVIDENCE`);
  }
  if (route.routeVerdict === 'PASS' && BLOCKED_ACCOUNTING_STATES.includes(route.accountingStatus)) {
    errors.push(`routeDenominator:${route.routeId}:UNKNOWN_ABSTAIN_CONFLICTING_CANNOT_PASS`);
  }
  if (route.routeVerdict !== 'PASS' && !NON_PASS_ROUTE_VERDICTS.includes(route.routeVerdict)) {
    errors.push(`routeDenominator:${route.routeId}:NON_PASS_ROUTE_VERDICT_INVALID`);
  }
  if (!NON_PROVEN_FULL_BOOK_ACCOUNTING_STATES.includes(route.fullBookAccounting)) {
    errors.push(`routeDenominator:${route.routeId}:FULL_BOOK_ACCOUNTING_MUST_REMAIN_NON_PROVEN`);
  }
  if (route.routeId !== 'C1' && route.fullBookAccounting !== 'REQUIRED_NOT_YET_PROVEN_FOR_ROUTE') {
    errors.push(`routeDenominator:${route.routeId}:FULL_BOOK_ACCOUNTING_MUST_REMAIN_REQUIRED`);
  }
  if (route.routeId === 'C1') {
    if (route.routeVerdict !== 'BLOCKED') errors.push('routeDenominator:C1:BLOCKED_ROUTE_VERDICT_REQUIRED');
    if (route.accountingStatus !== 'FULL_BOOK_ATTEMPTED_BLOCKED') errors.push('routeDenominator:C1:ACCOUNTING_STATUS_INVALID');
    if (route.fullBookAccounting !== POST_AUTH_REPAIR_FULL_BOOK_ACCOUNTING) errors.push('routeDenominator:C1:FULL_BOOK_BLOCKER_ACCOUNTING_INVALID');
    if (!Array.isArray(route.blockerEvidenceRefs) || !route.blockerEvidenceRefs.includes('YALKEN_INTEROP_C1_WORD_FULLBOOK_ROUTE_RECEIPT_V1')) {
      errors.push('routeDenominator:C1:BLOCKER_EVIDENCE_REF_MISSING');
    }
    if (!Array.isArray(route.blockerEvidenceRefs) || !route.blockerEvidenceRefs.includes('C1_WORD_ROUND01_EXACT_LEDGER_BINDING_BLOCKER')) {
      errors.push('routeDenominator:C1:EXACT_LEDGER_BINDING_BLOCKER_REF_MISSING');
    }
    if (!Array.isArray(route.blockerEvidenceRefs) || !route.blockerEvidenceRefs.includes('C1_WORD_ROUND01_APPLY_LIFECYCLE_REUSE_GATE_BLOCKER')) {
      errors.push('routeDenominator:C1:ROUND01_APPLY_LIFECYCLE_REUSE_GATE_BLOCKER_REF_MISSING');
    }
    if (!Array.isArray(route.blockerEvidenceRefs) || !route.blockerEvidenceRefs.includes('C1_WORD_ROUND01_EXACT_LEDGER_BINDING_REPAIR_MERGED_NOT_ROUTE_PASS')) {
      errors.push('routeDenominator:C1:EXACT_LEDGER_REPAIR_MERGED_REF_MISSING');
    }
    if (Array.isArray(route.blockerEvidenceRefs) && route.blockerEvidenceRefs.includes(INTEROP_CHAIN_LEGACY_PERMISSION_BLOCKER_ID)) {
      errors.push('routeDenominator:C1:LEGACY_MACOS_ACCESSIBILITY_BLOCKER_REF_STILL_ACTIVE');
    }
    if (Array.isArray(route.executedFullRouteEvidence) && route.executedFullRouteEvidence.length !== 0) {
      errors.push('routeDenominator:C1:EXECUTED_FULL_ROUTE_EVIDENCE_MUST_REMAIN_EMPTY_WHEN_BLOCKED');
    }
    if (route.nextContour !== NEXT_SEQUENTIAL_CONTOUR) {
      errors.push('routeDenominator:C1:NEXT_CONTOUR_INVALID');
    }
  }
  for (const field of ['semanticOracle', 'structureOracle', 'commentsOracle', 'suggestionsOracle', 'formatOracle', 'recoveryOracle', 'cleanupOracle']) {
    if (!isObject(route.requiredOracles?.[field])) {
      errors.push(`routeDenominator:${route.routeId}:ORACLE_MISSING:${field}`);
      continue;
    }
    if (route.requiredOracles[field].status === 'PASS' && route.routeVerdict !== 'PASS') {
      errors.push(`routeDenominator:${route.routeId}:ORACLE_PASS_BEFORE_ROUTE_PASS:${field}`);
    }
  }
}

function validateClaimControls(controls, errors) {
  if (!isObject(controls)) {
    errors.push('claimControls:NOT_OBJECT');
    return;
  }
  if (controls.chainSaturationVerdict !== 'NEEDS_MORE_EVIDENCE') {
    errors.push('claimControls:CHAIN_SATURATION_MUST_REMAIN_NEEDS_MORE_EVIDENCE');
  }
  if (controls.allRoutesProven !== false) {
    errors.push('claimControls:ALL_ROUTES_PROVEN_MUST_BE_FALSE');
  }
  if (controls.falseAutoApplyCount !== 0) {
    errors.push('claimControls:FALSE_AUTO_APPLY_COUNT_NONZERO');
  }
  if (controls.wordEvidenceTransferToGoogle !== 'DENY' || controls.googleEvidenceTransferToWord !== 'DENY') {
    errors.push('claimControls:EVIDENCE_TRANSFER_MUST_BE_DENY');
  }
  if (controls.universalParityClaim !== 'DENY' || controls.byteIdentityClaim !== 'DENY') {
    errors.push('claimControls:UNIVERSAL_PARITY_OR_BYTE_IDENTITY_CLAIM_DENIED');
  }
  if (controls.samplingAllowedForFinalPass !== false || controls.smokeEvidenceCanCloseRoute !== false) {
    errors.push('claimControls:SMOKE_OR_SAMPLING_CANNOT_CLOSE_ROUTE');
  }
}

export function validateInteropChainMatrix(matrix, options = {}) {
  const errors = [];
  exactKeys(matrix, MATRIX_EXACT_KEYS, 'matrix', errors);
  if (matrix.schemaVersion !== MATRIX_SCHEMA_VERSION) errors.push('schemaVersion:INVALID');
  if (matrix.status !== MATRIX_STATUS) errors.push('status:INVALID');
  if (matrix.exactHead !== INTEROP_CHAIN_EXACT_HEAD_SHA || !isCommitSha(matrix.exactHead)) errors.push('EXACT_HEAD_MISMATCH');
  if (matrix.programVerdict !== 'NEEDS_MORE_EVIDENCE') errors.push('programVerdict:MUST_REMAIN_NEEDS_MORE_EVIDENCE');
  validateClaimControls(matrix.claimControls, errors);
  if (!isObject(matrix.canonicalFullBookDenominator)) {
    errors.push('canonicalFullBookDenominator:NOT_OBJECT');
  } else {
    if (matrix.canonicalFullBookDenominator.corpusId !== 'YALKEN_WHOLE_BOOK_CANONICAL_SYNTHETIC_V1_20260815T000001Z') {
      errors.push('canonicalFullBookDenominator:CORPUS_ID_INVALID');
    }
    for (const field of ['inputManifestSha256', 'inputHtmlSha256', 'plainOracleSha256', 'normalizedOracleSha256']) {
      if (!isSha256(matrix.canonicalFullBookDenominator[field])) errors.push(`canonicalFullBookDenominator:${field}:SHA256_INVALID`);
    }
    if (matrix.canonicalFullBookDenominator.noSampling !== true || matrix.canonicalFullBookDenominator.excerptOrSmokeEvidenceAdmitted !== false) {
      errors.push('canonicalFullBookDenominator:FULL_BOOK_NO_SAMPLING_POLICY_INVALID');
    }
  }
  if (!routeSetValid(matrix.routeDenominator)) {
    errors.push('routeDenominator:ROUTE_SET_MISMATCH');
  }
  if (Array.isArray(matrix.routeDenominator)) {
    for (const route of matrix.routeDenominator) validateRoute(route, errors);
  }
  const c1FreshReplay = matrix.sourceEvidence?.c1FreshApplyLifecycleGateBlockedReplay;
  if (c1FreshReplay?.exactHead !== INTEROP_CHAIN_EXACT_HEAD_SHA) {
    errors.push('sourceEvidence:C1_FRESH_REPLAY_EXACT_HEAD_MISMATCH');
  }
  if (c1FreshReplay?.failureCode !== 'C5V2_COMPLETE_ROUND_ORACLE_GATE_FAILED') {
    errors.push('sourceEvidence:C1_FRESH_REPLAY_GATE_FAILURE_CODE_MISSING');
  }
  if (c1FreshReplay?.returnedDocxReady !== true) {
    errors.push('sourceEvidence:C1_FRESH_REPLAY_RETURNED_READY_NOT_RECORDED');
  }
  if (c1FreshReplay?.completeRoundOracleGreen !== true) {
    errors.push('sourceEvidence:C1_FRESH_REPLAY_COMPLETE_ROUND_ORACLE_GREEN_MISSING');
  }
  if (c1FreshReplay?.productReturnApplyGreen !== false) {
    errors.push('sourceEvidence:C1_FRESH_REPLAY_PRODUCT_RETURN_APPLY_BLOCKER_MISSING');
  }
  if (c1FreshReplay?.nativeLifecycleVerifiedCount !== 0) {
    errors.push('sourceEvidence:C1_FRESH_REPLAY_NATIVE_LIFECYCLE_VERIFIED_COUNT_MISSING');
  }
  if (c1FreshReplay?.nativeLifecycleBlockedCount !== 38) {
    errors.push('sourceEvidence:C1_FRESH_REPLAY_NATIVE_LIFECYCLE_BLOCKED_COUNT_MISSING');
  }
  if (c1FreshReplay?.exactTextBindingMatched !== 0) {
    errors.push('sourceEvidence:C1_FRESH_REPLAY_EXACT_LEDGER_MATCHED_COUNT_MISSING');
  }
  if (c1FreshReplay?.exactTextBindingExpected !== 105) {
    errors.push('sourceEvidence:C1_FRESH_REPLAY_EXACT_LEDGER_EXPECTED_COUNT_MISSING');
  }
  if (c1FreshReplay?.exactTextBindingUnmatched !== 105) {
    errors.push('sourceEvidence:C1_FRESH_REPLAY_EXACT_LEDGER_UNMATCHED_COUNT_MISSING');
  }
  if (c1FreshReplay?.exactTextBindingFailure !== 'NO_EXACT_TEXT_CANDIDATE_OPERATION_ID_BINDING_FAILED') {
    errors.push('sourceEvidence:C1_FRESH_REPLAY_EXACT_LEDGER_FAILURE_NOT_RECORDED');
  }
  if (!Array.isArray(c1FreshReplay?.exactTextBindingFirstUnmatched) || c1FreshReplay.exactTextBindingFirstUnmatched[0] !== 'c5v2-tracked_text_edit-0003') {
    errors.push('sourceEvidence:C1_FRESH_REPLAY_EXACT_LEDGER_FIRST_UNMATCHED_NOT_RECORDED');
  }
  if (c1FreshReplay?.formattingApplyCode !== 'RTK_FORMATTING_OPERATION_UNKNOWN_KEY') {
    errors.push('sourceEvidence:C1_FRESH_REPLAY_FORMATTING_APPLY_BLOCKER_NOT_RECORDED');
  }
  const expectedGateFailures = [
    'PRODUCT_RETURN_APPLY_NOT_GREEN',
    'NATIVE_LIFECYCLE_VERIFICATION_NOT_GREEN',
    'NATIVE_LIFECYCLE_COVERAGE_NOT_GREEN',
    'COMPLETED_ROUND_REUSE_BINDING_NOT_GREEN',
  ];
  if (JSON.stringify(c1FreshReplay?.gateFailures || []) !== JSON.stringify(expectedGateFailures)) {
    errors.push('sourceEvidence:C1_FRESH_REPLAY_GATE_FAILURES_NOT_RECORDED');
  }
  const diagnostics = String(c1FreshReplay?.wordWindowDiagnostics || '');
  if (!diagnostics.includes('COMPLETE_ROUND_ORACLE_GREEN_TRUE') || !diagnostics.includes('APPLY_LIFECYCLE_REUSE_GATE_FAILED') || !diagnostics.includes('EXACT_LEDGER_BINDING_0_OF_105')) {
    errors.push('sourceEvidence:C1_FRESH_REPLAY_GATE_BLOCKER_DIAGNOSTICS_NOT_RECORDED');
  }
  const exactLedgerRepair = matrix.sourceEvidence?.c1ExactLedgerBindingRepairMerged;
  if (!isObject(exactLedgerRepair)) {
    errors.push('sourceEvidence:C1_EXACT_LEDGER_REPAIR_MERGE_MISSING');
  } else {
    if (exactLedgerRepair.taskId !== 'C1_WORD_ROUND01_EXACT_LEDGER_BINDING_REPAIR_V1') {
      errors.push('sourceEvidence:C1_EXACT_LEDGER_REPAIR_TASK_ID_INVALID');
    }
    if (exactLedgerRepair.pr !== 1596) {
      errors.push('sourceEvidence:C1_EXACT_LEDGER_REPAIR_PR_INVALID');
    }
    if (exactLedgerRepair.prHeadSha !== INTEROP_CHAIN_POST_EXACT_LEDGER_REPAIR_PR_HEAD_SHA) {
      errors.push('sourceEvidence:C1_EXACT_LEDGER_REPAIR_PR_HEAD_INVALID');
    }
    if (exactLedgerRepair.mergeSha !== INTEROP_CHAIN_POST_EXACT_LEDGER_REPAIR_MERGE_SHA) {
      errors.push('sourceEvidence:C1_EXACT_LEDGER_REPAIR_MERGE_SHA_INVALID');
    }
    if (exactLedgerRepair.mergeTree !== INTEROP_CHAIN_POST_EXACT_LEDGER_REPAIR_MERGE_TREE) {
      errors.push('sourceEvidence:C1_EXACT_LEDGER_REPAIR_MERGE_TREE_INVALID');
    }
    if (exactLedgerRepair.routePassClaim !== false) {
      errors.push('sourceEvidence:C1_EXACT_LEDGER_REPAIR_ROUTE_PASS_LAUNDER');
    }
    if (exactLedgerRepair.productApplyAuthority !== false) {
      errors.push('sourceEvidence:C1_EXACT_LEDGER_REPAIR_APPLY_AUTHORITY_LAUNDER');
    }
  }
  const runtimePrecondition = matrix.sourceEvidence?.c1CurrentRuntimePrecondition;
  if (!isObject(runtimePrecondition)) {
    errors.push('sourceEvidence:C1_CURRENT_RUNTIME_PRECONDITION_MISSING');
  } else {
    if (runtimePrecondition.classification !== INTEROP_CHAIN_CURRENT_RUNTIME_PRECONDITION) {
      errors.push('sourceEvidence:C1_CURRENT_RUNTIME_PRECONDITION_CLASSIFICATION_INVALID');
    }
    if (runtimePrecondition.probeModel !== 'CALLER_IDENTITY_BOUND') {
      errors.push('sourceEvidence:C1_CURRENT_RUNTIME_PRECONDITION_PROBE_MODEL_INVALID');
    }
    if (runtimePrecondition.systemEventsUiElementsEnabled !== false) {
      errors.push('sourceEvidence:C1_CURRENT_RUNTIME_PRECONDITION_LEGACY_UI_ELEMENTS_DIAGNOSTIC_LAUNDER');
    }
    if (runtimePrecondition.zshSystemEventsUiElementsEnabled !== false) {
      errors.push('sourceEvidence:C1_CURRENT_RUNTIME_PRECONDITION_ZSH_UI_ELEMENTS_DIAGNOSTIC_LAUNDER');
    }
    if (runtimePrecondition.legacyUiElementsAuthority !== 'ADVISORY_ONLY_CALLER_SPECIFIC') {
      errors.push('sourceEvidence:C1_CURRENT_RUNTIME_PRECONDITION_LEGACY_UI_ELEMENTS_AUTHORITY_INVALID');
    }
    if (runtimePrecondition.hammerspoonAccessibilityState !== true) {
      errors.push('sourceEvidence:C1_CURRENT_RUNTIME_PRECONDITION_HAMMERSPOON_ACCESSIBILITY_STATE_INVALID');
    }
    if (runtimePrecondition.hammerspoonCallerIdentity !== 'com.hammerspoon.Hammerspoon') {
      errors.push('sourceEvidence:C1_CURRENT_RUNTIME_PRECONDITION_HAMMERSPOON_CALLER_IDENTITY_INVALID');
    }
    if (runtimePrecondition.wordProcessExists !== false) {
      errors.push('sourceEvidence:C1_CURRENT_RUNTIME_PRECONDITION_WORD_PROCESS_PRE_FLOW_LAUNDER');
    }
    if (runtimePrecondition.wordNotRunningPermissionDenial !== false) {
      errors.push('sourceEvidence:C1_CURRENT_RUNTIME_PRECONDITION_WORD_PROCESS_PERMISSION_DENIAL_INVALID');
    }
    if (runtimePrecondition.freshPhysicalReplayAuthority !== INTEROP_CHAIN_CURRENT_RUNTIME_REPLAY_AUTHORITY) {
      errors.push('sourceEvidence:C1_CURRENT_RUNTIME_PRECONDITION_REPLAY_AUTHORITY_INVALID');
    }
  }
  if (matrix.nextSequentialContour !== NEXT_SEQUENTIAL_CONTOUR) {
    errors.push('nextSequentialContour:INVALID');
  }

  if (options.googleReceipt) {
    const google = options.googleReceipt;
    if (google.status !== 'GOOGLE_DOCS_REAL_ACCOUNT_WHOLE_BOOK_E2E_V1_SCOPED_VERIFIED') {
      errors.push('googleWholeBookInput:STATUS_INVALID');
    }
    if (google.programVerdict !== 'NEEDS_MORE_EVIDENCE') {
      errors.push('googleWholeBookInput:PROGRAM_VERDICT_MUST_REMAIN_NEEDS_MORE_EVIDENCE');
    }
    if (!google.limitations?.includes('INTEROP_CHAIN_C1_TO_C8_REMAINS_PENDING')) {
      errors.push('googleWholeBookInput:CHAIN_PENDING_LIMITATION_MISSING');
    }
    if (google.falseAutoApplyCount !== 0) {
      errors.push('googleWholeBookInput:FALSE_AUTO_APPLY_COUNT_NONZERO');
    }
  }

  return { ok: errors.length === 0, errors };
}

export function validateLineageReceipt(receipt, matrix, matrixSha256, googleReceipt, errors) {
  exactKeys(receipt, RECEIPT_EXACT_KEYS, 'lineageReceipt', errors);
  if (receipt.schemaVersion !== LINEAGE_SCHEMA_VERSION) errors.push('lineageReceipt:schemaVersion:INVALID');
  if (receipt.exactHead !== INTEROP_CHAIN_EXACT_HEAD_SHA) errors.push('lineageReceipt:EXACT_HEAD_MISMATCH');
  if (receipt.status !== 'INTEROP_CHAIN_LINEAGE_DENOMINATOR_REGISTERED_NEEDS_MORE_EVIDENCE') errors.push('lineageReceipt:status:INVALID');
  if (receipt.matrixPath !== MATRIX_PATH) errors.push('lineageReceipt:MATRIX_PATH_INVALID');
  if (receipt.matrixSha256 !== matrixSha256) errors.push('lineageReceipt:MATRIX_SHA256_MISMATCH');
  if (JSON.stringify(receipt.routeIds) !== JSON.stringify(EXPECTED_ROUTE_IDS)) errors.push('lineageReceipt:ROUTE_SET_MISMATCH');
  if (receipt.lineageStatus !== 'NOT_STARTED_DENOMINATOR_REGISTERED') errors.push('lineageReceipt:LINEAGE_STATUS_INVALID');
  if (receipt.googleWholeBookInput?.status !== 'SCOPED_EVIDENCE_ONLY_NOT_CHAIN_CLOSURE') errors.push('lineageReceipt:GOOGLE_INPUT_STATUS_INVALID');
  if (receipt.googleWholeBookInput?.programVerdict !== googleReceipt.programVerdict) errors.push('lineageReceipt:GOOGLE_PROGRAM_VERDICT_MISMATCH');
  if (receipt.googleWholeBookInput?.interopChainPending !== true) errors.push('lineageReceipt:GOOGLE_CHAIN_PENDING_REQUIRED');
  if (receipt.routeClosurePolicy?.fullBookRequired !== true || receipt.routeClosurePolicy?.samplingAllowed !== false) errors.push('lineageReceipt:ROUTE_CLOSURE_FULL_BOOK_POLICY_INVALID');
  if (receipt.routeClosurePolicy?.unknownAbstainConflictingCanPass !== false) errors.push('lineageReceipt:UNKNOWN_ABSTAIN_CONFLICTING_CANNOT_PASS');
  if (!Array.isArray(receipt.multiRoundLineageRequirements) || receipt.multiRoundLineageRequirements.length < 6) {
    errors.push('lineageReceipt:MULTI_ROUND_REQUIREMENTS_INCOMPLETE');
  }
  if (!receipt.deniedClaims?.includes('DIVERSE_OR_SATURATED_CHAIN_CLAIM')) errors.push('lineageReceipt:DENIED_CLAIMS_INCOMPLETE');
  if (matrix.claimControls.chainSaturationVerdict !== 'NEEDS_MORE_EVIDENCE') errors.push('lineageReceipt:MATRIX_CHAIN_VERDICT_ESCALATED');
}

export function resolveExactHeadBinding(repoRoot = repoRootFromHere(), env = process.env) {
  const git = spawnSync('git', ['merge-base', '--is-ancestor', INTEROP_CHAIN_EXACT_HEAD_SHA, 'HEAD'], {
    cwd: repoRoot,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  if (git.status === 0) {
    return {
      ok: true,
      status: 'REACHABLE_FROM_CURRENT_HEAD',
      source: 'LOCAL_GIT_GRAPH',
    };
  }

  if (env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'pull_request' && env.GITHUB_EVENT_PATH) {
    const event = tryReadJson(env.GITHUB_EVENT_PATH);
    const baseSha = event?.pull_request?.base?.sha;
    if (baseSha === INTEROP_CHAIN_EXACT_HEAD_SHA) {
      return {
        ok: true,
        status: 'MATCHES_PULL_REQUEST_BASE_SHA_IN_SHALLOW_CHECKOUT',
        source: 'GITHUB_PULL_REQUEST_EVENT',
      };
    }
    return {
      ok: false,
      status: 'PULL_REQUEST_BASE_SHA_MISMATCH',
      source: 'GITHUB_PULL_REQUEST_EVENT',
      observedBaseSha: baseSha || 'MISSING',
      acceptedBaseShas: [INTEROP_CHAIN_EXACT_HEAD_SHA],
      staleRejectedBaseShas: [
        INTEROP_CHAIN_PRE_AUTH_REPAIR_ROUTE_SHA,
        INTEROP_CHAIN_PRE_VISIBILITY_REPLAY_SHA,
        INTEROP_CHAIN_PRE_WINDOW_REPAIR_REPLAY_SHA,
        INTEROP_CHAIN_PRE_NATIVE_MATERIALIZATION_REPLAY_SHA,
        INTEROP_CHAIN_PRE_ORACLE_OUTCOME_MISMATCH_REPAIR_SHA,
        INTEROP_CHAIN_PRE_APPLY_LIFECYCLE_REUSE_GATE_REPAIR_SHA,
        INTEROP_CHAIN_PRE_REUSE_GATE_REPLAY_SHA,
        INTEROP_CHAIN_PRE_STDOUT_DRAIN_REPAIR_SHA,
      ],
    };
  }

  return {
    ok: false,
    status: 'NOT_REACHABLE_FROM_CURRENT_HEAD',
    source: 'LOCAL_GIT_GRAPH',
  };
}

export function verifyInteropChainMatrix(options = {}) {
  const repoRoot = options.repoRoot || repoRootFromHere();
  const errors = [];
  const matrix = readChainMatrix(repoRoot);
  const receipt = readLineageReceipt(repoRoot);
  const googleReceipt = readJsonAt(repoRoot, GOOGLE_WHOLE_BOOK_RECEIPT_PATH);
  const matrixSha256 = `sha256:${sha256File(repoRoot, MATRIX_PATH)}`;
  const matrixReport = validateInteropChainMatrix(matrix, { googleReceipt });
  errors.push(...matrixReport.errors);
  validateLineageReceipt(receipt, matrix, matrixSha256, googleReceipt, errors);

  let catalogIncludesContract = false;
  if (options.checkCatalog) {
    const catalog = readJsonAt(repoRoot, CATALOG_PATH);
    catalogIncludesContract = Array.isArray(catalog.contractBasenames) && catalog.contractBasenames.includes(CONTRACT_BASENAME);
    if (!catalogIncludesContract) errors.push(`catalog:CONTRACT_MISSING:${CONTRACT_BASENAME}`);
    if (catalog.currentTruthBinding?.interopChainMatrix !== MATRIX_STATUS) errors.push('catalog:INTEROP_CHAIN_BINDING_MISSING');
  }

  const exactHeadBinding = resolveExactHeadBinding(repoRoot, options.env || process.env);
  if (!exactHeadBinding.ok) errors.push(`EXACT_HEAD_BINDING_INVALID:${exactHeadBinding.status}`);

  return {
    ok: errors.length === 0,
    errors,
    exactHead: INTEROP_CHAIN_EXACT_HEAD_SHA,
    exactHeadBinding,
    matrixSha256,
    catalogIncludesContract,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = verifyInteropChainMatrix({ checkCatalog: process.argv.includes('--check-catalog') });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}
