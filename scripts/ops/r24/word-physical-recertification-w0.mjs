#!/usr/bin/env node
// R2.4 W0 - Word physical recertification evidence classifier. This OPS-only
// verifier binds the corrected macOS Accessibility caller identity model to
// checked-in C1 physical evidence while refusing Word route PASS, product apply
// authority, SAFE_APPLY widening, user-document access, Google transfer, and
// Program PASS promotion.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HEX40_RE } from './canonical-json.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '..', '..', '..');

export const W0_STAGE_ID = 'W0_WORD_PHYSICAL_RECERTIFICATION';
export const W0_PROFILE_ID = 'WORD_ROUNDTRIP';
export const W0_SCHEMA_VERSION = 'yalken.r24.w0.word-physical-recertification.v1';
export const W0_PROFILE_VERDICT = 'WORD_ROUNDTRIP_NOT_READY_HAMMERSPOON_CALLER_ROUTE_RECLASSIFIED';
export const W0_CLAIM_CEILING = 'WORD_TESTED_DENOMINATOR_ONLY';
export const W0_CURRENT_RUNTIME_CLASSIFICATION = 'CALLER_IDENTITY_PROBE_ROUTING_RECLASSIFIED';
export const W0_REPLAY_AUTHORITY = 'ALLOW_GOVERNED_HAMMERSPOON_ACCESSIBILITY_ROUTE_FOR_W0_PHYSICAL_RECERTIFICATION';
export const W0_NEXT_CONTOUR = 'V2_WORD_CLAIM_COMPILER_AFTER_W0_PHYSICAL_RECERTIFICATION_V1';
export const LEGACY_PERMISSION_BLOCKER_ID = 'C1_WORD_MACOS_ACCESSIBILITY_PERMISSION_REQUIRED_CURRENT_BLOCKER';
export const ACCESSIBILITY_RECLASSIFICATION_ID = 'C1_WORD_ACCESSIBILITY_CALLER_IDENTITY_PROBE_ROUTING_RECLASSIFIED';
export const W0_PHYSICAL_RECEIPT_ID = 'YALKEN_R24_W0_WORD_PHYSICAL_RECERTIFICATION_RECEIPT_V1';
export const W0_PHYSICAL_RECEIPT_SCHEMA_VERSION = 'yalken.r24.w0.word-physical-recertification.receipt.v1';
export const W0_PHYSICAL_RECEIPT_PATH = `docs/OPS/RTK/${W0_PHYSICAL_RECEIPT_ID}.json`;

export const W0_NON_CLAIMS = Object.freeze([
  'NO_PROGRAM_DONE',
  'NO_GLOBAL_SCALAR_PASS',
  'NO_WORD_TERMINAL_PASS',
  'NO_C1_ROUTE_PASS',
  'NO_C2_TO_C8_CLOSURE',
  'NO_PRODUCT_APPLY_AUTHORITY',
  'NO_SAFE_APPLY_EXPANSION',
  'NO_USER_WORD_DOCUMENT_ACCESS',
  'NO_GOOGLE_DOCS_TRANSFER',
  'NO_RELEASE_READINESS',
  'NO_PRODUCT_RUNTIME_MUTATION',
  'NO_RUNTIME_NETWORK',
]);

function fail(code, detail, context = {}) {
  return {
    ok: false,
    schemaVersion: W0_SCHEMA_VERSION,
    verdict: 'FAIL',
    code,
    detail,
    context,
  };
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSha256(value) {
  return /^sha256:[a-f0-9]{64}$/u.test(String(value || ''));
}

function readTextBounded(filePath, maxBytes = 4 * 1024 * 1024) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error(`E_R24_W0_NOT_FILE:${filePath}`);
  if (stat.size > maxBytes) throw new Error(`E_R24_W0_FILE_TOO_LARGE:${filePath}:${stat.size}`);
  return fs.readFileSync(filePath, 'utf8');
}

function readJsonBounded(filePath) {
  return JSON.parse(readTextBounded(filePath));
}

function runGit(repoRoot, args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10000,
  });
  if (result.status !== 0) return null;
  return String(result.stdout || '').trim();
}

function stageById(program, stageId) {
  return Array.isArray(program?.stages) ? program.stages.find((row) => row?.stageId === stageId) : null;
}

function validateProgramBinding(programDag) {
  const stage = stageById(programDag, W0_STAGE_ID);
  if (!stage) return fail('E_R24_W0_STAGE_MISSING', W0_STAGE_ID);
  if (stage.profile !== W0_PROFILE_ID) return fail('E_R24_W0_STAGE_PROFILE', String(stage.profile || ''));
  if (stage.mutationAuthority !== 'WORD_SANDBOX_AND_PHYSICAL_EVIDENCE_ONLY') {
    return fail('E_R24_W0_STAGE_AUTHORITY', String(stage.mutationAuthority || ''));
  }
  if (stage.claimCeiling !== W0_CLAIM_CEILING) return fail('E_R24_W0_CLAIM_CEILING', String(stage.claimCeiling || ''));
  for (const dep of ['P2_DURABLE_SAVE_COORDINATOR', 'T1_ANCHOR_LINEAGE']) {
    if (!Array.isArray(stage.dependsOn) || !stage.dependsOn.includes(dep)) return fail('E_R24_W0_DEPENDENCY_MISSING', dep);
  }
  for (const evidenceClass of ['E5_PHYSICAL', 'E6_INDEPENDENT_EXACT_HEAD']) {
    if (!Array.isArray(stage.requiredEvidence) || !stage.requiredEvidence.includes(evidenceClass)) {
      return fail('E_R24_W0_REQUIRED_EVIDENCE_MISSING', evidenceClass);
    }
  }
  return { ok: true, stage };
}

function validateRepositoryIdentity({ repoState, expectedHeadSha, expectedOriginMainSha }) {
  if (!repoState || !HEX40_RE.test(String(repoState.headSha || ''))) {
    return fail('E_R24_W0_HEAD_REQUIRED', String(repoState?.headSha || ''));
  }
  if (!HEX40_RE.test(String(expectedHeadSha || ''))) {
    return fail('E_R24_W0_EXPECTED_HEAD_REQUIRED', String(expectedHeadSha || ''));
  }
  if (repoState.headSha !== expectedHeadSha) {
    return fail('E_R24_W0_EXACT_HEAD_MISMATCH', `${repoState.headSha} != ${expectedHeadSha}`);
  }
  if (expectedOriginMainSha !== null && expectedOriginMainSha !== undefined && repoState.originMainSha !== expectedOriginMainSha) {
    return fail('E_R24_W0_ORIGIN_MAIN_MISMATCH', `${repoState.originMainSha} != ${expectedOriginMainSha}`);
  }
  if (repoState.dirty === true) return fail('E_R24_W0_WORKTREE_DIRTY', 'clean exact-head evidence required');
  return { ok: true };
}

function validatePrecondition(precondition, prefix = 'E_R24_W0_PRECONDITION') {
  if (!isObject(precondition)) return fail(`${prefix}_MISSING`, 'currentRuntimePrecondition');
  if (precondition.classification !== W0_CURRENT_RUNTIME_CLASSIFICATION) {
    return fail(`${prefix}_CLASSIFICATION`, String(precondition.classification || ''));
  }
  if (precondition.probeModel !== 'CALLER_IDENTITY_BOUND') return fail(`${prefix}_MODEL`, String(precondition.probeModel || ''));
  if (precondition.systemEventsUiElementsEnabled !== false || precondition.zshSystemEventsUiElementsEnabled !== false) {
    return fail(`${prefix}_ZSH_DIAGNOSTIC`, 'zsh UI-elements scalar must remain false diagnostic evidence');
  }
  if (precondition.legacyUiElementsAuthority !== 'ADVISORY_ONLY_CALLER_SPECIFIC') {
    return fail(`${prefix}_LEGACY_UI_ELEMENTS_AUTHORITY`, String(precondition.legacyUiElementsAuthority || ''));
  }
  if (precondition.hammerspoonAccessibilityState !== true) {
    return fail(`${prefix}_HAMMERSPOON_ACCESSIBILITY_STATE`, String(precondition.hammerspoonAccessibilityState));
  }
  if (precondition.hammerspoonCallerIdentity !== 'com.hammerspoon.Hammerspoon') {
    return fail(`${prefix}_HAMMERSPOON_CALLER_IDENTITY`, String(precondition.hammerspoonCallerIdentity || ''));
  }
  if (precondition.wordProcessExists !== false || precondition.wordNotRunningPermissionDenial !== false) {
    return fail(`${prefix}_WORD_PROCESS_PRE_FLOW`, JSON.stringify({
      wordProcessExists: precondition.wordProcessExists,
      wordNotRunningPermissionDenial: precondition.wordNotRunningPermissionDenial,
    }));
  }
  if (precondition.freshPhysicalReplayAuthority !== W0_REPLAY_AUTHORITY) {
    return fail(`${prefix}_REPLAY_AUTHORITY`, String(precondition.freshPhysicalReplayAuthority || ''));
  }
  return { ok: true };
}

function validateC1Receipt(receipt) {
  if (!isObject(receipt)) return fail('E_R24_W0_C1_RECEIPT_REQUIRED', 'receipt');
  if (receipt.route?.routeVerdict !== 'BLOCKED') return fail('E_R24_W0_C1_ROUTE_PASS_FORBIDDEN', String(receipt.route?.routeVerdict || ''));
  if (receipt.route?.productMutationAuthority !== 'DENY') {
    return fail('E_R24_W0_C1_PRODUCT_MUTATION_AUTHORITY', String(receipt.route?.productMutationAuthority || ''));
  }
  if (receipt.programVerdict === 'PASS' || receipt.verdict === 'PASS') return fail('E_R24_W0_PROGRAM_PASS_FORBIDDEN', 'C1 receipt');
  if (receipt.physicalEvidence?.syntheticDisposableDocxOnly !== true || receipt.physicalEvidence?.userDocumentsTouched !== false) {
    return fail('E_R24_W0_USER_DOCUMENT_BOUNDARY', 'C1 physical evidence must be synthetic disposable only');
  }
  if (receipt.authority?.userDocumentsAllowed !== false || receipt.authority?.userDocumentsRead !== 0 || receipt.authority?.userDocumentsMutated !== 0) {
    return fail('E_R24_W0_USER_DOCUMENT_AUTHORITY', JSON.stringify(receipt.authority || {}));
  }
  const rebind = receipt.physicalEvidence?.postExactLedgerRepairRebind;
  if (!isObject(rebind)) return fail('E_R24_W0_REBIND_MISSING', 'postExactLedgerRepairRebind');
  if (rebind.routePassClaim !== false || rebind.productApplyAuthority !== false || rebind.executedFreshPhysicalReplayAfterRepair !== false) {
    return fail('E_R24_W0_REBIND_OVERCLAIM', JSON.stringify({
      routePassClaim: rebind.routePassClaim,
      productApplyAuthority: rebind.productApplyAuthority,
      executedFreshPhysicalReplayAfterRepair: rebind.executedFreshPhysicalReplayAfterRepair,
    }));
  }
  const precondition = validatePrecondition(rebind.currentRuntimePrecondition);
  if (!precondition.ok) return precondition;
  const byId = new Map((receipt.failureClassification || []).map((row) => [row.id, row]));
  if (byId.get(LEGACY_PERMISSION_BLOCKER_ID)?.disposition !== 'RECLASSIFIED_CALLER_IDENTITY_PROBE_ROUTING_NOT_PERMISSION_BLOCKER') {
    return fail('E_R24_W0_LEGACY_PERMISSION_BLOCKER_NOT_RECLASSIFIED', String(byId.get(LEGACY_PERMISSION_BLOCKER_ID)?.disposition || ''));
  }
  if (byId.get(ACCESSIBILITY_RECLASSIFICATION_ID)?.disposition !== 'HAMMERSPOON_ROUTE_READY_NOT_ROUTE_PASS') {
    return fail('E_R24_W0_HAMMERSPOON_RECLASSIFICATION_MISSING', String(byId.get(ACCESSIBILITY_RECLASSIFICATION_ID)?.disposition || ''));
  }
  if (byId.get('C1_WORD_ROUND01_EXACT_LEDGER_APPLY_LIFECYCLE_REUSE_GATE_BLOCKER')?.disposition !== 'ACTIVE_BLOCKER_NOT_ROUTE_PASS') {
    return fail('E_R24_W0_APPLY_LIFECYCLE_BLOCKER_MISSING', 'C1 exact-ledger/apply-lifecycle/reuse blocker must remain active');
  }
  if (receipt.nextSequentialContour !== W0_NEXT_CONTOUR) return fail('E_R24_W0_NEXT_CONTOUR', String(receipt.nextSequentialContour || ''));
  return { ok: true, precondition: rebind.currentRuntimePrecondition };
}

function validateChainMatrix(matrix) {
  if (!isObject(matrix)) return fail('E_R24_W0_MATRIX_REQUIRED', 'matrix');
  if (matrix.programVerdict === 'PASS') return fail('E_R24_W0_MATRIX_PROGRAM_PASS_FORBIDDEN', 'matrix');
  const precondition = validatePrecondition(matrix.sourceEvidence?.c1CurrentRuntimePrecondition, 'E_R24_W0_MATRIX_PRECONDITION');
  if (!precondition.ok) return precondition;
  const c1 = Array.isArray(matrix.routeDenominator) ? matrix.routeDenominator.find((row) => row.routeId === 'C1') : null;
  if (!c1) return fail('E_R24_W0_MATRIX_C1_MISSING', 'C1');
  if (c1.routeVerdict !== 'BLOCKED') return fail('E_R24_W0_MATRIX_C1_ROUTE_PASS_FORBIDDEN', String(c1.routeVerdict || ''));
  if (Array.isArray(c1.blockerEvidenceRefs) && c1.blockerEvidenceRefs.includes(LEGACY_PERMISSION_BLOCKER_ID)) {
    return fail('E_R24_W0_MATRIX_LEGACY_PERMISSION_BLOCKER_STILL_ACTIVE', LEGACY_PERMISSION_BLOCKER_ID);
  }
  for (const required of [
    'YALKEN_INTEROP_C1_WORD_FULLBOOK_ROUTE_RECEIPT_V1',
    'C1_WORD_ROUND01_EXACT_LEDGER_BINDING_BLOCKER',
    'C1_WORD_ROUND01_APPLY_LIFECYCLE_REUSE_GATE_BLOCKER',
    'C1_WORD_ROUND01_EXACT_LEDGER_BINDING_REPAIR_MERGED_NOT_ROUTE_PASS',
  ]) {
    if (!Array.isArray(c1.blockerEvidenceRefs) || !c1.blockerEvidenceRefs.includes(required)) {
      return fail('E_R24_W0_MATRIX_C1_BLOCKER_REF_MISSING', required);
    }
  }
  if (!Array.isArray(c1.fullBookEvidenceRefs) || !c1.fullBookEvidenceRefs.includes(ACCESSIBILITY_RECLASSIFICATION_ID)) {
    return fail('E_R24_W0_MATRIX_RECLASSIFICATION_EVIDENCE_REF_MISSING', ACCESSIBILITY_RECLASSIFICATION_ID);
  }
  if (!Array.isArray(c1.fullBookEvidenceRefs) || !c1.fullBookEvidenceRefs.includes(W0_PHYSICAL_RECEIPT_ID)) {
    return fail('E_R24_W0_MATRIX_PHYSICAL_RECEIPT_REF_MISSING', W0_PHYSICAL_RECEIPT_ID);
  }
  if (Array.isArray(c1.executedFullRouteEvidence) && c1.executedFullRouteEvidence.length !== 0) {
    return fail('E_R24_W0_MATRIX_EXECUTED_ROUTE_EVIDENCE_FORBIDDEN', JSON.stringify(c1.executedFullRouteEvidence));
  }
  if (c1.nextContour !== W0_NEXT_CONTOUR || matrix.nextSequentialContour !== W0_NEXT_CONTOUR) {
    return fail('E_R24_W0_MATRIX_NEXT_CONTOUR', JSON.stringify({ c1: c1.nextContour, matrix: matrix.nextSequentialContour }));
  }
  return { ok: true };
}

function validatePhysicalReceipt(receipt, c1Precondition) {
  if (!isObject(receipt)) return fail('E_R24_W0_PHYSICAL_RECEIPT_REQUIRED', W0_PHYSICAL_RECEIPT_PATH);
  if (receipt.schemaVersion !== W0_PHYSICAL_RECEIPT_SCHEMA_VERSION) {
    return fail('E_R24_W0_PHYSICAL_RECEIPT_SCHEMA', String(receipt.schemaVersion || ''));
  }
  if (receipt.receiptId !== W0_PHYSICAL_RECEIPT_ID) return fail('E_R24_W0_PHYSICAL_RECEIPT_ID', String(receipt.receiptId || ''));
  if (receipt.stageId !== W0_STAGE_ID || receipt.profileId !== W0_PROFILE_ID) {
    return fail('E_R24_W0_PHYSICAL_RECEIPT_STAGE_PROFILE', JSON.stringify({ stageId: receipt.stageId, profileId: receipt.profileId }));
  }

  const runner = receipt.physicalRunner || {};
  if (runner.runner !== 'hammerspoon') return fail('E_R24_W0_PHYSICAL_RECEIPT_RUNNER', String(runner.runner || ''));
  if (runner.callerIdentity !== c1Precondition.hammerspoonCallerIdentity) {
    return fail('E_R24_W0_PHYSICAL_RECEIPT_CALLER_IDENTITY', String(runner.callerIdentity || ''));
  }
  if (runner.hammerspoonAccessibilityState !== c1Precondition.hammerspoonAccessibilityState) {
    return fail('E_R24_W0_PHYSICAL_RECEIPT_HAMMERSPOON_STATE', String(runner.hammerspoonAccessibilityState));
  }
  if (runner.zshSystemEventsUiElementsEnabled !== c1Precondition.zshSystemEventsUiElementsEnabled) {
    return fail('E_R24_W0_PHYSICAL_RECEIPT_ZSH_DIAGNOSTIC', String(runner.zshSystemEventsUiElementsEnabled));
  }
  if (runner.legacyUiElementsAuthority !== c1Precondition.legacyUiElementsAuthority) {
    return fail('E_R24_W0_PHYSICAL_RECEIPT_LEGACY_AUTHORITY', String(runner.legacyUiElementsAuthority || ''));
  }

  const artifact = receipt.disposableArtifact || {};
  if (artifact.syntheticDisposableDocxOnly !== true || artifact.userDocumentsTouched !== false) {
    return fail('E_R24_W0_PHYSICAL_RECEIPT_USER_DOC_BOUNDARY', JSON.stringify({
      syntheticDisposableDocxOnly: artifact.syntheticDisposableDocxOnly,
      userDocumentsTouched: artifact.userDocumentsTouched,
    }));
  }
  if (artifact.wordProcessAfterFlow !== false) {
    return fail('E_R24_W0_PHYSICAL_RECEIPT_WORD_PROCESS_AFTER', String(artifact.wordProcessAfterFlow));
  }
  if (!isSha256(artifact.docxSha256) || !isSha256(artifact.preflightReceiptSha256) || !isSha256(receipt.runtimeCode?.canaryScriptSha256)) {
    return fail('E_R24_W0_PHYSICAL_RECEIPT_HASH_BINDING', JSON.stringify({
      docxSha256: artifact.docxSha256,
      preflightReceiptSha256: artifact.preflightReceiptSha256,
      canaryScriptSha256: receipt.runtimeCode?.canaryScriptSha256,
    }));
  }

  const preflight = receipt.preflightDiagnostics || {};
  for (const [field, expected] of [
    ['ok', true],
    ['code', 'MACOS_ACCESSIBILITY_PREFLIGHT_READY'],
    ['directAxCapabilityProven', true],
    ['wordProcessExists', true],
    ['wordFrontmost', true],
    ['hammerspoonAccessibilityState', true],
    ['legacyUiElementsEnabled', false],
    ['legacyUiElementsAuthority', 'ADVISORY_ONLY_CALLER_SPECIFIC'],
  ]) {
    if (preflight[field] !== expected) return fail('E_R24_W0_PHYSICAL_RECEIPT_PREFLIGHT', `${field}=${String(preflight[field])}`);
  }
  if (!(Number(preflight.wordWindowCount) >= 1) || !(Number(preflight.axWindowSubtreeItemCount) >= 1)) {
    return fail('E_R24_W0_PHYSICAL_RECEIPT_AX_WINDOW', JSON.stringify({
      wordWindowCount: preflight.wordWindowCount,
      axWindowSubtreeItemCount: preflight.axWindowSubtreeItemCount,
    }));
  }
  if (!preflight.frontDocumentFullName || preflight.frontDocumentFullName !== preflight.expectedFrontDocumentFullName) {
    return fail('E_R24_W0_PHYSICAL_RECEIPT_FRONT_DOCUMENT', JSON.stringify({
      frontDocumentFullName: preflight.frontDocumentFullName,
      expectedFrontDocumentFullName: preflight.expectedFrontDocumentFullName,
    }));
  }

  const result = receipt.result || {};
  for (const forbidden of ['routePassClaim', 'productApplyAuthority', 'safeApplyExpansion', 'wordTerminalPass', 'programPass', 'userDocumentsAllowed']) {
    if (result[forbidden] !== false) return fail('E_R24_W0_PHYSICAL_RECEIPT_OVERCLAIM', forbidden);
  }
  const binding = receipt.c1Binding || {};
  if (binding.currentRuntimeClassification !== W0_CURRENT_RUNTIME_CLASSIFICATION) {
    return fail('E_R24_W0_PHYSICAL_RECEIPT_C1_CLASSIFICATION', String(binding.currentRuntimeClassification || ''));
  }
  if (binding.reclassifiedBlocker !== LEGACY_PERMISSION_BLOCKER_ID || binding.reclassificationEvidence !== ACCESSIBILITY_RECLASSIFICATION_ID) {
    return fail('E_R24_W0_PHYSICAL_RECEIPT_RECLASSIFICATION_BINDING', JSON.stringify(binding));
  }
  if (binding.nextSequentialContour !== W0_NEXT_CONTOUR) {
    return fail('E_R24_W0_PHYSICAL_RECEIPT_NEXT_CONTOUR', String(binding.nextSequentialContour || ''));
  }
  if (!Array.isArray(binding.activeBlockers) || !binding.activeBlockers.includes('C1_WORD_ROUND01_EXACT_LEDGER_APPLY_LIFECYCLE_REUSE_GATE_BLOCKER')) {
    return fail('E_R24_W0_PHYSICAL_RECEIPT_ACTIVE_BLOCKERS', JSON.stringify(binding.activeBlockers || []));
  }
  return { ok: true };
}

function validateClaims(claimRequest = {}) {
  const claims = isObject(claimRequest) ? claimRequest : {};
  for (const [field, code] of [
    ['programPass', 'E_R24_W0_PROGRAM_PASS_FORBIDDEN'],
    ['globalScalarPass', 'E_R24_W0_GLOBAL_PASS_FORBIDDEN'],
    ['wordTerminalPass', 'E_R24_W0_WORD_TERMINAL_PASS_FORBIDDEN'],
    ['routePass', 'E_R24_W0_ROUTE_PASS_FORBIDDEN'],
    ['productApplyAuthority', 'E_R24_W0_PRODUCT_APPLY_AUTHORITY_FORBIDDEN'],
    ['safeApplyExpansion', 'E_R24_W0_SAFE_APPLY_EXPANSION_FORBIDDEN'],
    ['userDocumentsAllowed', 'E_R24_W0_USER_DOCUMENTS_FORBIDDEN'],
    ['googleDocsTransfer', 'E_R24_W0_GOOGLE_TRANSFER_FORBIDDEN'],
    ['releaseReady', 'E_R24_W0_RELEASE_READY_FORBIDDEN'],
  ]) {
    if (claims[field] === true) return fail(code, field);
  }
  return { ok: true };
}

export function evaluateWordPhysicalRecertification(input = {}) {
  const program = validateProgramBinding(input.programDag);
  if (!program.ok) return program;
  const repo = validateRepositoryIdentity({
    repoState: input.repoState,
    expectedHeadSha: input.expectedHeadSha,
    expectedOriginMainSha: input.expectedOriginMainSha,
  });
  if (!repo.ok) return repo;
  const claims = validateClaims(input.claimRequest);
  if (!claims.ok) return claims;
  const c1 = validateC1Receipt(input.c1Receipt);
  if (!c1.ok) return c1;
  const physical = validatePhysicalReceipt(input.physicalReceipt, c1.precondition);
  if (!physical.ok) return physical;
  const matrix = validateChainMatrix(input.chainMatrix);
  if (!matrix.ok) return matrix;
  return {
    ok: true,
    schemaVersion: W0_SCHEMA_VERSION,
    code: 'R24_W0_WORD_PHYSICAL_RECERTIFICATION_COMPILED',
    verdict: 'PASS',
    stageId: W0_STAGE_ID,
    profileId: W0_PROFILE_ID,
    profileVerdict: {
      profileId: W0_PROFILE_ID,
      currentVerdict: 'NOT_READY',
      verdict: W0_PROFILE_VERDICT,
      claimCeiling: W0_CLAIM_CEILING,
      requiredEvidence: ['E5_PHYSICAL', 'E6_INDEPENDENT_EXACT_HEAD'],
      closedStageCount: 1,
      requiredStageCount: 1,
      routePassClaim: false,
      productApplyAuthority: false,
      wordTerminalPass: false,
    },
    programVerdict: 'NEEDS_MORE_EVIDENCE',
    hammerspoonRoute: {
      callerIdentity: c1.precondition.hammerspoonCallerIdentity,
      accessibilityState: c1.precondition.hammerspoonAccessibilityState,
      legacyUiElementsAuthority: c1.precondition.legacyUiElementsAuthority,
      zshSystemEventsUiElementsEnabled: c1.precondition.zshSystemEventsUiElementsEnabled,
      replayAuthority: c1.precondition.freshPhysicalReplayAuthority,
      wordProcessNotRunningPermissionDenial: c1.precondition.wordNotRunningPermissionDenial,
      physicalReceiptId: W0_PHYSICAL_RECEIPT_ID,
    },
    c1Route: {
      routeVerdict: 'BLOCKED',
      activeBlockers: [
        'C1_WORD_ROUND01_EXACT_LEDGER_BINDING_BLOCKER',
        'C1_WORD_ROUND01_APPLY_LIFECYCLE_REUSE_GATE_BLOCKER',
        'C1_WORD_ROUND01_EXACT_LEDGER_BINDING_REPAIR_MERGED_NOT_ROUTE_PASS',
      ],
      reclassifiedBlocker: LEGACY_PERMISSION_BLOCKER_ID,
      reclassificationEvidence: ACCESSIBILITY_RECLASSIFICATION_ID,
      nextSequentialContour: W0_NEXT_CONTOUR,
    },
    physicalReceipt: {
      receiptId: W0_PHYSICAL_RECEIPT_ID,
      status: 'BOUND',
      artifactClass: 'SYNTHETIC_DISPOSABLE_DOCX_ONLY',
      userDocumentsTouched: false,
      runner: 'hammerspoon',
      directAxCapabilityProven: true,
    },
    nonClaims: [...W0_NON_CLAIMS],
  };
}

export function readRepositoryState(repoRoot = REPO_ROOT) {
  return {
    headSha: runGit(repoRoot, ['rev-parse', 'HEAD']),
    originMainSha: runGit(repoRoot, ['rev-parse', 'origin/main']),
    treeSha: runGit(repoRoot, ['rev-parse', 'HEAD^{tree}']),
    dirty: runGit(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all']) !== '',
  };
}

export function evaluateCurrentRepositoryWordPhysicalRecertification(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || REPO_ROOT);
  const repoState = readRepositoryState(repoRoot);
  return evaluateWordPhysicalRecertification({
    programDag: readJsonBounded(path.join(repoRoot, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'PROGRAM_DAG.json')),
    c1Receipt: readJsonBounded(path.join(repoRoot, 'docs', 'OPS', 'RTK', 'YALKEN_INTEROP_C1_WORD_FULLBOOK_ROUTE_RECEIPT_V1.json')),
    chainMatrix: readJsonBounded(path.join(repoRoot, 'docs', 'OPS', 'RTK', 'YALKEN_INTEROP_CHAIN_MATRIX_V1.json')),
    physicalReceipt: readJsonBounded(path.join(repoRoot, W0_PHYSICAL_RECEIPT_PATH)),
    repoState,
    expectedHeadSha: options.expectedHeadSha || repoState.headSha,
    expectedOriginMainSha: options.expectedOriginMainSha ?? null,
    claimRequest: options.claimRequest,
  });
}

function main() {
  const receipt = evaluateCurrentRepositoryWordPhysicalRecertification();
  process.stdout.write(`R24_W0_WORD_PHYSICAL_RECERTIFICATION_RECEIPT=${JSON.stringify(receipt)}\n`);
  process.exitCode = receipt.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
