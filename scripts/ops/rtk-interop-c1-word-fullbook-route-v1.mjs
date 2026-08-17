#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 'yalken.interopChain.c1WordFullBookRoute.receipt.v1';
export const TASK_ID = 'C1_YALKEN_WORD_YALKEN_FULL_BOOK_ROUTE_V1';
export const STATUS = 'C1_YALKEN_WORD_YALKEN_FULL_BOOK_ROUTE_V1_EXECUTED_BLOCKED_FAIL_CLOSED';
export const VERDICT = 'NEEDS_MORE_EVIDENCE';
export const PROGRAM_VERDICT = 'NEEDS_MORE_EVIDENCE';
export const EXACT_HEAD = '6aee73c0770357cd0b84bf5e8388cee38071c798';
export const PRE_AUTH_REPAIR_ROUTE_HEAD = '1b8a23441ba29b6cac79a62a3b18ece031654e62';
export const PRE_VISIBILITY_REPLAY_ROUTE_HEAD = '5ebb75f4110bb1a287ad9a9109cebdeb373642ba';
export const PRE_WINDOW_REPAIR_ROUTE_HEAD = '9453e232a65b6cf92ceb802adf2d2f776fd3ee33';
export const PRE_NATIVE_MATERIALIZATION_REPLAY_ROUTE_HEAD = '834f37a8cb5ba3eb854f6407e2dc4e7e14606d88';
export const PRE_ORACLE_OUTCOME_MISMATCH_REPAIR_ROUTE_HEAD = '279dde31d1bcf4c6a7cc80f6acfd034f9bdd600b';
export const NEXT_SEQUENTIAL_CONTOUR = 'C1_WORD_ROUND01_APPLY_LIFECYCLE_REUSE_GATE_REPAIR_V1';
export const POST_AUTH_REPAIR_FULL_BOOK_ACCOUNTING = 'FULL_BOOK_ATTEMPTED_POST_ORACLE_ACCOUNTING_REPAIR_APPLY_LIFECYCLE_REUSE_GATE_BLOCKED_NOT_PROVEN';
export const RECEIPT_PATH = 'docs/OPS/RTK/YALKEN_INTEROP_C1_WORD_FULLBOOK_ROUTE_RECEIPT_V1.json';
export const MATRIX_PATH = 'docs/OPS/RTK/YALKEN_INTEROP_CHAIN_MATRIX_V1.json';
export const CATALOG_PATH = 'docs/OPS/RTK/RTK_TEST_GRAPH_CATALOG_V1.json';
export const CONTRACT_BASENAME = 'rtk-interop-c1-word-fullbook-route.contract.test.js';

export const EXPECTED_WORD_PROFILE = Object.freeze({
  version: '16.112',
  build: '16.112.26081010',
  bundleId: 'com.microsoft.Word',
  teamIdentifier: 'UBF8T346G9',
});

export const EXPECTED_DENOMINATOR = Object.freeze({
  corpusId: 'YALKEN_WHOLE_BOOK_CANONICAL_SYNTHETIC_V1_20260815T000001Z',
  generatorMode: 'near-supported-limit',
  targetWords: 42000,
  sceneCount: 21,
  titleHeadingCount: 1,
  chapterHeadingCount: 21,
  sourceParagraphCount: 357,
  styleSentinelCount: 21,
  adverseParagraphCount: 3,
  paragraphCount: 381,
  charCount: 312996,
  utf8Bytes: 312996,
  htmlBytes: 318752,
  inputManifestSha256: 'sha256:5d9250722062c61cbb341efa9d436b846486c0dac3ae4ddccad16a6bc71ce484',
  inputHtmlSha256: 'sha256:ce523b19e05fa6b4b2ef87949933c8e8662891c2385843c3706e97ce38420a97',
  plainOracleSha256: 'sha256:9c83a184149ef3b0e5ac8490aac6c3e8ddf93804a5ff895836124f7f563fe1c7',
  normalizedOracleSha256: 'sha256:9c83a184149ef3b0e5ac8490aac6c3e8ddf93804a5ff895836124f7f563fe1c7',
});

const RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'taskId',
  'status',
  'verdict',
  'programVerdict',
  'exactHead',
  'generatedAtUtc',
  'route',
  'provider',
  'denominator',
  'physicalEvidence',
  'failureClassification',
  'oracles',
  'authority',
  'failureCounters',
  'hostileCorpus',
  'semanticMutations',
  'rollback',
  'nextSequentialContour',
]);

function repoRootFromHere() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Text(value) {
  return `sha256:${crypto.createHash('sha256').update(String(value), 'utf8').digest('hex')}`;
}

export function sha256Json(value) {
  return `sha256:${crypto.createHash('sha256').update(stableJson(value), 'utf8').digest('hex')}`;
}

export function sha256File(repoRoot, repoRelativePath) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(path.join(repoRoot, repoRelativePath))).digest('hex')}`;
}

function readJsonAt(repoRoot, repoRelativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, repoRelativePath), 'utf8'));
}

export function readC1Receipt(repoRoot = repoRootFromHere()) {
  return readJsonAt(repoRoot, RECEIPT_PATH);
}

export function readChainMatrix(repoRoot = repoRootFromHere()) {
  return readJsonAt(repoRoot, MATRIX_PATH);
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

function isSha256(value) {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function isCommitSha(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/u.test(value);
}

function failIf(condition, errors, code) {
  if (condition) errors.push(code);
}

function validateDenominator(denominator, errors) {
  if (!isObject(denominator?.fullBook)) {
    errors.push('FULL_BOOK_DENOMINATOR_INVALID:NOT_OBJECT');
    return;
  }
  const fullBook = denominator.fullBook;
  for (const [key, expected] of Object.entries(EXPECTED_DENOMINATOR)) {
    if (fullBook[key] !== expected) errors.push(`FULL_BOOK_DENOMINATOR_INVALID:${key}`);
  }
  failIf(fullBook.noSampling !== true, errors, 'FULL_BOOK_DENOMINATOR_INVALID:NO_SAMPLING_REQUIRED');
  failIf(fullBook.fullDocumentRequired !== true, errors, 'FULL_BOOK_DENOMINATOR_INVALID:FULL_DOCUMENT_REQUIRED');
  failIf(fullBook.excerptOrSmokeEvidenceAdmitted !== false, errors, 'FULL_BOOK_DENOMINATOR_INVALID:SMOKE_OR_EXCERPT_ADMITTED');
  failIf(denominator.route?.expectedRouteCount !== 1, errors, 'ROUTE_DENOMINATOR_INVALID:EXPECTED_ROUTE_COUNT');
  failIf(denominator.route?.actualRouteCount !== 0, errors, 'ROUTE_DENOMINATOR_INVALID:ACTUAL_ROUTE_MUST_REMAIN_ZERO_WHEN_BLOCKED');
  failIf(denominator.route?.fullBookProcessed !== false, errors, 'ROUTE_DENOMINATOR_INVALID:FULL_ROUTE_NOT_PROVEN');
  failIf(!String(denominator.route?.reason || '').includes('Word 16.112 / 16.112.26081010'), errors, 'ROUTE_DENOMINATOR_INVALID:FRESH_WORD_PROFILE_MISSING');
  failIf(!String(denominator.route?.reason || '').includes('complete-round semantic oracle passed'), errors, 'ROUTE_DENOMINATOR_INVALID:COMPLETE_ROUND_ORACLE_GREEN_NOT_RECORDED');
  failIf(!String(denominator.route?.reason || '').includes('PRODUCT_RETURN_APPLY_NOT_GREEN'), errors, 'ROUTE_DENOMINATOR_INVALID:PRODUCT_RETURN_APPLY_BLOCKER_NOT_RECORDED');
  failIf(!String(denominator.route?.reason || '').includes('NATIVE_LIFECYCLE_VERIFICATION_NOT_GREEN'), errors, 'ROUTE_DENOMINATOR_INVALID:NATIVE_LIFECYCLE_BLOCKER_NOT_RECORDED');
  failIf(!String(denominator.route?.reason || '').includes('COMPLETED_ROUND_REUSE_BINDING_NOT_GREEN'), errors, 'ROUTE_DENOMINATOR_INVALID:REUSE_BINDING_BLOCKER_NOT_RECORDED');
}

function validateProvider(provider, errors) {
  if (!isObject(provider?.word)) {
    errors.push('WORD_PROFILE_MISMATCH:WORD_PROVIDER_MISSING');
    return;
  }
  for (const [key, expected] of Object.entries(EXPECTED_WORD_PROFILE)) {
    if (provider.word[key] !== expected) errors.push(`WORD_PROFILE_MISMATCH:${key}`);
  }
  failIf(provider.word.signature !== 'VALID_MICROSOFT_NOTARIZED_DEVELOPER_ID', errors, 'WORD_PROFILE_MISMATCH:SIGNATURE');
  failIf(provider.word.processBeforeRun !== 'NOT_RUNNING', errors, 'WORD_PROFILE_MISMATCH:PROCESS_BEFORE_RUN');
  failIf(provider.word.processAfterCleanup !== 'NOT_RUNNING', errors, 'WORD_PROFILE_MISMATCH:PROCESS_AFTER_CLEANUP');
}

function validateRoute(route, errors) {
  failIf(route?.routeId !== 'C1', errors, 'ROUTE_ID_INVALID');
  failIf(route?.title !== 'Yalken to Word to Yalken', errors, 'ROUTE_TITLE_INVALID');
  failIf(route?.routeVerdict !== 'BLOCKED', errors, 'ROUTE_VERDICT_MUST_BE_BLOCKED');
  failIf(route?.chainSaturationVerdict !== 'NEEDS_MORE_EVIDENCE', errors, 'CHAIN_SATURATION_ESCALATION');
  failIf(route?.c2ToC8ClosureAuthority !== 'DENY', errors, 'C2_TO_C8_AUTHORITY_ESCALATION');
  failIf(route?.universalParityClaim !== 'DENY', errors, 'UNIVERSAL_PARITY_ESCALATION');
  failIf(route?.byteIdentityClaim !== 'DENY', errors, 'BYTE_IDENTITY_ESCALATION');
  failIf(route?.productMutationAuthority !== 'DENY', errors, 'PRODUCT_MUTATION_AUTHORITY_ESCALATION');
}

function validatePhysicalEvidence(evidence, errors) {
  if (!isObject(evidence)) {
    errors.push('PHYSICAL_EVIDENCE_INVALID:NOT_OBJECT');
    return;
  }
  for (const field of [
    'corpusDigest',
    'corpusManifestSha256',
    'canaryScriptSha256',
    'resultSha256',
    'sourceDocxSha256',
    'returnedDocxSha256',
  ]) {
    if (!isSha256(evidence[field])) errors.push(`PHYSICAL_DIGEST_INVALID:${field}`);
  }
  failIf(evidence.syntheticDisposableDocxOnly !== true, errors, 'PHYSICAL_EVIDENCE_INVALID:DISPOSABLE_ONLY_REQUIRED');
  failIf(evidence.userDocumentsTouched !== false, errors, 'USER_DOCUMENT_COUNTER_NONZERO');
  failIf(evidence.runId !== 'c1-round01-oracle-repair-w06-20260817', errors, 'PHYSICAL_RESULT_INVALID:FRESH_REPLAY_RUN_ID');
  failIf(evidence.previousRedRunId !== 'c1-native-root-count-repair-w06-r1-20260817', errors, 'PHYSICAL_RESULT_INVALID:PREVIOUS_ORACLE_MISMATCH_REPLAY_NOT_RECORDED');
  failIf(evidence.previousInterruptedRunId !== 'c1-fullbook-auth-repair-w06-r2-20260817', errors, 'PHYSICAL_RESULT_INVALID:INTERRUPTED_REPLAY_NOT_RECORDED');
  failIf(evidence.previousNativeMaterializationBlockedRunId !== 'c1-window-visibility-repair-w06-r1-20260817', errors, 'PHYSICAL_RESULT_INVALID:PREVIOUS_NATIVE_MATERIALIZATION_REPLAY_NOT_RECORDED');
  failIf(evidence.corpusId !== 'dorian-gray-pg174-cleaned-internal-qa', errors, 'PHYSICAL_RESULT_INVALID:CORPUS_ID');
  failIf(!isSha256(evidence.orchestratorScriptSha256), errors, 'PHYSICAL_DIGEST_INVALID:orchestratorScriptSha256');
  failIf(evidence.stageResult?.headSha !== EXACT_HEAD, errors, 'PHYSICAL_RESULT_INVALID:STAGE_HEAD');
  failIf(evidence.stageResult?.originMainSha !== EXACT_HEAD, errors, 'PHYSICAL_RESULT_INVALID:STAGE_ORIGIN_MAIN');
  failIf(evidence.stageResult?.operationCount !== 2000, errors, 'PHYSICAL_RESULT_INVALID:STAGE_OPERATION_COUNT');
  failIf(evidence.stageResult?.positiveOperationCount !== 1960, errors, 'PHYSICAL_RESULT_INVALID:STAGE_POSITIVE_COUNT');
  failIf(evidence.stageResult?.negativeOperationCount !== 40, errors, 'PHYSICAL_RESULT_INVALID:STAGE_NEGATIVE_COUNT');
  failIf(evidence.stageResult?.roundGreen !== false, errors, 'PHYSICAL_RESULT_INVALID:ROUND_GREEN_MUST_BE_FALSE');
  failIf(evidence.stageResult?.roundGateCount !== 5, errors, 'PHYSICAL_RESULT_INVALID:STAGE_ROUND_GATE_COUNT');
  failIf(evidence.stageResult?.failureMarkerCode !== 'ORCH_CHILD_EXIT_NONZERO:1:none', errors, 'PHYSICAL_RESULT_INVALID:STAGE_FAILURE_MARKER_CODE');
  failIf(evidence.masterLedger?.ledgerDigest !== 'sha256:e075c4942b590d2622bf6202a4db1f33259f97367e2612a78673c7a54adf2d71', errors, 'PHYSICAL_RESULT_INVALID:LEDGER_DIGEST');
  failIf(evidence.masterLedger?.operationIdSetDigest !== 'sha256:efd614ddf59d445f06da9a3f491053004ba7019246a97ad35515aaa29b773f32', errors, 'PHYSICAL_RESULT_INVALID:OPERATION_SET_DIGEST');
  failIf(evidence.round01?.plannedOperationCount !== 379, errors, 'PHYSICAL_RESULT_INVALID:ROUND01_PLANNED_OPERATIONS');
  failIf(evidence.round01?.completedCheckpointCount !== 8, errors, 'PHYSICAL_RESULT_INVALID:ROUND01_COMPLETED_CHECKPOINT_COUNT');
  failIf(evidence.round01?.completedCheckpointOperationCount !== 379, errors, 'PHYSICAL_RESULT_INVALID:ROUND01_COMPLETED_CHECKPOINT_OPERATIONS');
  failIf(evidence.round01?.lastCompletedCheckpoint !== 'word-chunk-008', errors, 'PHYSICAL_RESULT_INVALID:LAST_COMPLETED_CHECKPOINT');
  failIf(evidence.round01?.failedChunk !== 'complete-round-oracle', errors, 'PHYSICAL_RESULT_INVALID:FAILED_CHUNK');
  failIf(evidence.round01?.returnedReady !== true, errors, 'PHYSICAL_RESULT_INVALID:RETURNED_READY_MUST_BE_TRUE_FOR_ORACLE_FAILURE');
  failIf(evidence.round01?.failureCode !== 'C5V2_COMPLETE_ROUND_ORACLE_GATE_FAILED', errors, 'PHYSICAL_RESULT_INVALID:COMPLETE_ROUND_ORACLE_GATE_FAILURE_CODE');
  failIf(!String(evidence.round01?.failureError || '').includes('PRODUCT_RETURN_APPLY_NOT_GREEN'), errors, 'PHYSICAL_RESULT_INVALID:PRODUCT_RETURN_APPLY_GATE_DETAIL');
  failIf(!String(evidence.round01?.failureError || '').includes('NATIVE_LIFECYCLE_VERIFICATION_NOT_GREEN'), errors, 'PHYSICAL_RESULT_INVALID:NATIVE_LIFECYCLE_GATE_DETAIL');
  failIf(!String(evidence.round01?.failureError || '').includes('COMPLETED_ROUND_REUSE_BINDING_NOT_GREEN'), errors, 'PHYSICAL_RESULT_INVALID:REUSE_BINDING_GATE_DETAIL');
  failIf(evidence.round01?.completeRoundOracleGreen !== true, errors, 'PHYSICAL_RESULT_INVALID:COMPLETE_ROUND_ORACLE_MUST_BE_GREEN_FOR_THIS_BLOCKER');
  failIf(evidence.round01?.productReturnApplyGreen !== false, errors, 'PHYSICAL_RESULT_INVALID:PRODUCT_RETURN_APPLY_MUST_BE_FALSE_FOR_GATE_BLOCKER');
  failIf(evidence.round01?.nativeLifecycleVerificationGreen !== false, errors, 'PHYSICAL_RESULT_INVALID:NATIVE_LIFECYCLE_MUST_BE_FALSE_FOR_GATE_BLOCKER');
  failIf(evidence.round01?.nativeLifecycleCoverage?.ok !== false, errors, 'PHYSICAL_RESULT_INVALID:NATIVE_LIFECYCLE_COVERAGE_MUST_BE_FALSE');
  failIf(evidence.round01?.nativeLifecycleCoverage?.verifiedCount !== 5, errors, 'PHYSICAL_RESULT_INVALID:NATIVE_LIFECYCLE_VERIFIED_COUNT');
  failIf(evidence.round01?.nativeLifecycleCoverage?.blockedCount !== 33, errors, 'PHYSICAL_RESULT_INVALID:NATIVE_LIFECYCLE_BLOCKED_COUNT');
  failIf(evidence.round01?.nativeLifecycleCoverage?.expectedOperationIdsDigest !== 'sha256:2910478186c15430136050fbfc0c19ff19555538c25e701e5b0b288bea7c45ca', errors, 'PHYSICAL_RESULT_INVALID:NATIVE_LIFECYCLE_EXPECTED_DIGEST');
  failIf(evidence.round01?.nativeLifecycleCoverage?.resultOperationIdsDigest !== 'sha256:2910478186c15430136050fbfc0c19ff19555538c25e701e5b0b288bea7c45ca', errors, 'PHYSICAL_RESULT_INVALID:NATIVE_LIFECYCLE_RESULT_DIGEST');
  failIf(evidence.round01?.completedRoundReuseBindingOk !== false, errors, 'PHYSICAL_RESULT_INVALID:COMPLETED_ROUND_REUSE_BINDING_MUST_BE_FALSE');
  failIf(evidence.round01?.nativeMaterializationRootCountRepairObserved !== true, errors, 'PHYSICAL_RESULT_INVALID:NATIVE_MATERIALIZATION_REPAIR_NOT_OBSERVED');
  failIf(evidence.resultStatus?.plannedOperations !== 2000, errors, 'PHYSICAL_RESULT_INVALID:PLANNED_OPERATIONS');
  failIf(evidence.resultStatus?.positiveOperationCount !== 1960, errors, 'PHYSICAL_RESULT_INVALID:POSITIVE_OPERATIONS');
  failIf(evidence.resultStatus?.round01PlannedOperations !== 379, errors, 'PHYSICAL_RESULT_INVALID:ROUND01_RESULT_COUNT');
  failIf(evidence.resultStatus?.attemptedOperations !== 379, errors, 'PHYSICAL_RESULT_INVALID:ATTEMPTED_OPERATIONS');
  failIf(evidence.resultStatus?.reportedOperations !== 379, errors, 'PHYSICAL_RESULT_INVALID:REPORTED_OPERATIONS');
  failIf(evidence.resultStatus?.wordStatus !== 'PASS', errors, 'PHYSICAL_RESULT_INVALID:WORD_STATUS_MUST_BE_PASS_WITH_ORACLE_FAILURE');
  failIf(evidence.resultStatus?.sourceExportOk !== true, errors, 'PHYSICAL_RESULT_INVALID:SOURCE_EXPORT_REQUIRED');
  failIf(evidence.resultStatus?.electronOk !== true, errors, 'PHYSICAL_RESULT_INVALID:ELECTRON_OK_REQUIRED_FOR_FRESH_REPLAY');
  failIf(evidence.resultStatus?.productReturnApplyOk !== false, errors, 'PHYSICAL_RESULT_INVALID:PRODUCT_RETURN_APPLY_MUST_REMAIN_FALSE');
  failIf(evidence.resultStatus?.roundOracleGateOk !== false, errors, 'PHYSICAL_RESULT_INVALID:ROUND_ORACLE_GATE_MUST_REMAIN_FALSE');
  failIf(evidence.resultStatus?.terminalOperationAggregatePresent !== false, errors, 'PHYSICAL_RESULT_INVALID:TERMINAL_AGGREGATE_MUST_BE_ABSENT');
  failIf(evidence.resultStatus?.returnIntakeAuthenticated !== true, errors, 'PHYSICAL_RESULT_INVALID:RETURN_INTAKE_MUST_REMAIN_AUTHENTICATED_FOR_ORACLE_FAILURE');
  failIf(evidence.resultStatus?.returnIntakeStatus !== 'authenticated-return-ir-ready', errors, 'PHYSICAL_RESULT_INVALID:RETURN_INTAKE_STATUS');
  failIf(evidence.resultStatus?.returnedDocxReady !== true, errors, 'PHYSICAL_RESULT_INVALID:RETURNED_DOCX_READY_MUST_BE_TRUE_FOR_ORACLE_FAILURE');
  failIf(evidence.resultStatus?.falseAutoApplyCount !== 0, errors, 'FALSE_AUTO_APPLY_COUNT_NONZERO');
  failIf(evidence.resultStatus?.productReturnApplyFailure !== 'PRODUCT_RETURN_APPLY_NOT_GREEN', errors, 'PHYSICAL_RESULT_INVALID:PRODUCT_RETURN_APPLY_FAILURE_NOT_RECORDED');
  failIf(evidence.resultStatus?.completeRoundOracleGreen !== true, errors, 'PHYSICAL_RESULT_INVALID:RESULT_COMPLETE_ROUND_ORACLE_MUST_BE_GREEN');
  failIf(evidence.resultStatus?.nativeLifecycleVerifiedCount !== 5, errors, 'PHYSICAL_RESULT_INVALID:RESULT_NATIVE_LIFECYCLE_VERIFIED_COUNT');
  failIf(evidence.resultStatus?.nativeLifecycleBlockedCount !== 33, errors, 'PHYSICAL_RESULT_INVALID:RESULT_NATIVE_LIFECYCLE_BLOCKED_COUNT');
  failIf(evidence.returnedArtifactPresent !== true, errors, 'PHYSICAL_RESULT_INVALID:RETURNED_ARTIFACT_MUST_BE_PRESENT_AFTER_REPAIR');
  failIf(evidence.returnedArtifactSha256 !== evidence.returnedDocxSha256, errors, 'PHYSICAL_RESULT_INVALID:RETURNED_ARTIFACT_DIGEST_MISMATCH');
  const wordWindowDiagnostics = String(evidence.resultStatus?.wordWindowDiagnostics || '');
  failIf(!wordWindowDiagnostics.includes('RETURNED_READY_TRUE'), errors, 'PHYSICAL_RESULT_INVALID:RETURNED_READY_DIAGNOSTIC_NOT_RECORDED');
  failIf(!wordWindowDiagnostics.includes('COMPLETE_ROUND_ORACLE_GREEN_TRUE'), errors, 'PHYSICAL_RESULT_INVALID:COMPLETE_ROUND_ORACLE_GREEN_DIAGNOSTIC_NOT_RECORDED');
  failIf(!String(evidence.resultStatus?.wrapperError || '').includes('C5V2_COMPLETE_ROUND_ORACLE_GATE_FAILED'), errors, 'PHYSICAL_RESULT_INVALID:COMPLETE_ROUND_ORACLE_GATE_ERROR_NOT_RECORDED');
  failIf(!String(evidence.resultStatus?.wrapperError || '').includes('PRODUCT_RETURN_APPLY_NOT_GREEN'), errors, 'PHYSICAL_RESULT_INVALID:WRAPPER_PRODUCT_APPLY_GATE_NOT_RECORDED');
  failIf(!String(evidence.resultStatus?.wrapperError || '').includes('NATIVE_LIFECYCLE_VERIFICATION_NOT_GREEN'), errors, 'PHYSICAL_RESULT_INVALID:WRAPPER_NATIVE_LIFECYCLE_GATE_NOT_RECORDED');
  failIf(evidence.returnedPackageObservation?.modernMode15Ready !== true, errors, 'RETURNED_PACKAGE_OBSERVATION_INVALID:READY_MUST_BE_TRUE');
  failIf(evidence.returnedPackageObservation?.customDocumentPropertyCarrierSurvived !== true, errors, 'RETURNED_PACKAGE_OBSERVATION_INVALID:DOCUMENT_PROPERTY_CARRIER_MUST_SURVIVE');
  failIf(evidence.returnedPackageObservation?.customXmlCarrierSurvived !== true, errors, 'RETURNED_PACKAGE_OBSERVATION_INVALID:CUSTOM_XML_CARRIER_MUST_SURVIVE');
  failIf(evidence.returnedPackageObservation?.authorityReason !== 'RETURNED_DOCX_READY_BUT_APPLY_LIFECYCLE_REUSE_GATE_FAILED', errors, 'RETURNED_PACKAGE_OBSERVATION_INVALID:AUTHORITY_REASON');
  failIf(evidence.independentParserProbe?.ok !== false, errors, 'INDEPENDENT_PARSER_PROBE_INVALID:OK_MUST_BE_FALSE_AFTER_GATE_FAILURE');
  failIf(evidence.independentParserProbe?.status !== 'not-run-apply-lifecycle-reuse-gate-failed', errors, 'INDEPENDENT_PARSER_PROBE_INVALID:STATUS');
  failIf(evidence.independentParserProbe?.sourceMode !== 'RETURNED_WORD_ARTIFACT_READY_GATE_FAILED', errors, 'INDEPENDENT_PARSER_PROBE_INVALID:SOURCE_MODE');
  failIf(evidence.independentParserProbe?.canWriteManuscript !== false, errors, 'INDEPENDENT_PARSER_PROBE_INVALID:WRITE_AUTHORITY');
  failIf(evidence.independentParserProbe?.reviewCounts?.textRevisions !== 398, errors, 'INDEPENDENT_PARSER_PROBE_INVALID:TEXT_REVISION_COUNT');
  failIf(evidence.independentParserProbe?.reviewCounts?.commentThreads !== 54, errors, 'INDEPENDENT_PARSER_PROBE_INVALID:COMMENT_COUNT');
  failIf(evidence.independentParserProbe?.reviewCounts?.formattingDeltas !== 304, errors, 'INDEPENDENT_PARSER_PROBE_INVALID:FORMATTING_COUNT');
  failIf(evidence.independentParserProbe?.selectedCarrier !== 'RETURNED_READY_APPLY_LIFECYCLE_REUSE_GATE_BLOCKED_NOT_ROUTE_PASS', errors, 'INDEPENDENT_PARSER_PROBE_INVALID:CARRIER_MUST_REMAIN_NON_AUTHORITY_MARKER');
  failIf(evidence.independentParserProbe?.authorityVerified !== false, errors, 'INDEPENDENT_PARSER_PROBE_INVALID:AUTHORITY_VERIFIED');
  failIf(evidence.independentParserProbe?.authorityReason !== 'APPLY_LIFECYCLE_REUSE_GATE_FAILED', errors, 'INDEPENDENT_PARSER_PROBE_INVALID:AUTHORITY_REASON');
  failIf(evidence.independentParserProbe?.payloadProfileId !== '', errors, 'CURRENT_PROFILE_MUST_NOT_BE_CLAIMED_AFTER_ORACLE_FAILURE');
  failIf(evidence.independentParserProbe?.payloadProfileIdStale !== false, errors, 'STALE_PROFILE_BINDING_STILL_RECORDED');
}

function validateClassifications(classifications, errors) {
  if (!Array.isArray(classifications)) {
    errors.push('FAILURE_CLASSIFICATION_INVALID:NOT_ARRAY');
    return;
  }
  const byId = new Map(classifications.map((item) => [item.id, item]));
  for (const required of [
    'WORD_OBJECT_MODEL_WINDOW_REQUIREMENT_REPAIRED',
    'C5_RETURN_ARTIFACT_PUBLICATION_BLOCKER_REPAIRED',
    'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_BLOCKER',
    'C1_AUTH_REPAIR_PUBLISHED_SCOPED_ROUTE_REPLAY_REQUIRED',
    'C1_POST_AUTH_REPAIR_FULLBOOK_REPLAY_ATTEMPTED',
    'WORD_ACCESSIBILITY_WINDOW_REVIVED_DURING_CHUNK_008',
    'WORD_NATIVE_MATERIALIZATION_ROOT_COUNT_BLOCKER',
    'C1_WORD_ROUND01_COMPLETE_ROUND_ORACLE_OUTCOME_MISMATCH_REPAIRED',
    'C1_WORD_ROUND01_APPLY_LIFECYCLE_REUSE_GATE_BLOCKER',
    'RETURNED_DOCX_READY_BUT_APPLY_LIFECYCLE_REUSE_GATE_FAILED',
    'WORD_NATIVE_LIFECYCLE_REPLY_STATE_BLOCKER',
    'C5_STALE_PROVIDER_PROFILE_BINDING',
    'ORCHESTRATOR_PROGRESS_ROUND_ID_DEFECT_REPAIRED',
    'N2_NOT_REPAIRED_IN_THIS_CONTOUR',
  ]) {
    if (!byId.has(required)) errors.push(`FAILURE_CLASSIFICATION_MISSING:${required}`);
  }
  failIf(byId.get('ORCHESTRATOR_PROGRESS_ROUND_ID_DEFECT_REPAIRED')?.disposition !== 'REPAIRED_IN_SCOPE', errors, 'ORCHESTRATOR_FIX_NOT_RECORDED');
  failIf(byId.get('C5_STALE_PROVIDER_PROFILE_BINDING')?.disposition !== 'REPAIRED_IN_CURRENT_PROFILE_REPLAY', errors, 'STALE_PROFILE_REPAIR_NOT_RECORDED');
  failIf(byId.get('C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_BLOCKER')?.disposition !== 'REACHED_AUTHENTICATED_RETURN_BUT_APPLY_LIFECYCLE_REUSE_GATE_FAILED', errors, 'RETURN_INTAKE_AUTHENTICATION_REACHED_GATE_FAILED_NOT_RECORDED');
  failIf(byId.get('C1_AUTH_REPAIR_PUBLISHED_SCOPED_ROUTE_REPLAY_REQUIRED')?.disposition !== 'REPLAY_ATTEMPTED_BLOCKED_BY_APPLY_LIFECYCLE_REUSE_GATE', errors, 'C1_AUTH_REPAIR_REPLAY_ATTEMPT_NOT_RECORDED');
  failIf(byId.get('C1_POST_AUTH_REPAIR_FULLBOOK_REPLAY_ATTEMPTED')?.disposition !== 'EXECUTED_FAIL_CLOSED_NOT_ROUTE_PASS', errors, 'C1_FRESH_REPLAY_ATTEMPT_NOT_RECORDED');
  failIf(byId.get('WORD_ACCESSIBILITY_WINDOW_REVIVED_DURING_CHUNK_008')?.disposition !== 'SUPERSEDED_BY_READY_RETURN_NOT_ROUTE_PASS', errors, 'WORD_WINDOW_REVIVE_CONFIRMATION_NOT_RECORDED');
  failIf(byId.get('WORD_NATIVE_MATERIALIZATION_ROOT_COUNT_BLOCKER')?.disposition !== 'REPAIRED_CONFIRMED_NOT_ROUTE_PASS', errors, 'NATIVE_MATERIALIZATION_REPAIR_NOT_RECORDED');
  failIf(byId.get('C1_WORD_ROUND01_COMPLETE_ROUND_ORACLE_OUTCOME_MISMATCH_REPAIRED')?.disposition !== 'REPAIRED_CONFIRMED_NOT_ROUTE_PASS', errors, 'ROUND01_ORACLE_OUTCOME_REPAIR_NOT_RECORDED');
  failIf(byId.get('C1_WORD_ROUND01_APPLY_LIFECYCLE_REUSE_GATE_BLOCKER')?.disposition !== 'ACTIVE_BLOCKER_NOT_ROUTE_PASS', errors, 'ROUND01_APPLY_LIFECYCLE_REUSE_GATE_BLOCKER_NOT_RECORDED');
  failIf(byId.get('RETURNED_DOCX_READY_BUT_APPLY_LIFECYCLE_REUSE_GATE_FAILED')?.disposition !== 'FAIL_CLOSED_AUTHORITY_DENIED', errors, 'RETURNED_DOCX_READY_GATE_FAILURE_NOT_RECORDED');
  for (const [id, item] of byId) {
    if (item.disposition === 'PASS') errors.push(`FAILURE_CLASSIFICATION_FALSE_PASS:${id}`);
  }
}

function validateOracles(oracles, errors) {
  if (!isObject(oracles)) {
    errors.push('ORACLE_SET_INVALID');
    return;
  }
  for (const oracleName of [
    'semanticOracle',
    'structureOracle',
    'commentsOracle',
    'suggestionsOracle',
    'formatOracle',
    'recoveryOracle',
    'cleanupOracle',
  ]) {
    const oracle = oracles[oracleName];
    if (!isObject(oracle)) {
      errors.push(`ORACLE_MISSING:${oracleName}`);
      continue;
    }
    if (oracle.status === 'PASS') errors.push(`ORACLE_NOT_PASS_WHEN_ROUTE_BLOCKED:${oracleName}`);
  }
}

function validateCounters(receipt, errors) {
  for (const [key, value] of Object.entries(receipt.failureCounters || {})) {
    if (value !== 0) errors.push(`BLOCKED_COUNTER_NONZERO:${key}`);
  }
  failIf(receipt.authority?.userDocumentsAllowed !== false, errors, 'USER_DOCUMENT_COUNTER_NONZERO:ALLOWED');
  failIf(receipt.authority?.userDocumentsRead !== 0, errors, 'USER_DOCUMENT_COUNTER_NONZERO:READ');
  failIf(receipt.authority?.userDocumentsMutated !== 0, errors, 'USER_DOCUMENT_COUNTER_NONZERO:MUTATED');
  failIf(receipt.authority?.productRuntimeWiringChanged !== false, errors, 'PRODUCT_RUNTIME_SCOPE_ESCALATION');
  failIf(receipt.authority?.productNetworkRuntimeUsed !== false, errors, 'PRODUCT_NETWORK_SCOPE_ESCALATION');
}

export function validateC1Receipt(receipt) {
  const errors = [];
  exactKeys(receipt, RECEIPT_KEYS, 'receipt', errors);
  failIf(receipt.schemaVersion !== SCHEMA_VERSION, errors, 'SCHEMA_VERSION_INVALID');
  failIf(receipt.taskId !== TASK_ID, errors, 'TASK_ID_INVALID');
  failIf(receipt.status !== STATUS, errors, 'STATUS_INVALID');
  failIf(receipt.verdict !== VERDICT, errors, 'VERDICT_MUST_REMAIN_NEEDS_MORE_EVIDENCE');
  failIf(receipt.programVerdict !== PROGRAM_VERDICT, errors, 'PROGRAM_VERDICT_MUST_REMAIN_NEEDS_MORE_EVIDENCE');
  failIf(receipt.exactHead !== EXACT_HEAD || !isCommitSha(receipt.exactHead), errors, 'EXACT_HEAD_MISMATCH');
  validateRoute(receipt.route, errors);
  validateProvider(receipt.provider, errors);
  validateDenominator(receipt.denominator, errors);
  validatePhysicalEvidence(receipt.physicalEvidence, errors);
  validateClassifications(receipt.failureClassification, errors);
  validateOracles(receipt.oracles, errors);
  validateCounters(receipt, errors);
  failIf(receipt.hostileCorpus?.total < 16, errors, 'HOSTILE_CORPUS_INCOMPLETE');
  failIf(receipt.hostileCorpus?.survivors !== 0, errors, 'HOSTILE_CORPUS_SURVIVORS_NONZERO');
  failIf(receipt.semanticMutations?.total < 12, errors, 'SEMANTIC_MUTATION_CATALOG_INCOMPLETE');
  failIf(receipt.semanticMutations?.survivors !== 0, errors, 'SEMANTIC_MUTATION_SURVIVORS_NONZERO');
  failIf(receipt.nextSequentialContour !== NEXT_SEQUENTIAL_CONTOUR, errors, 'NEXT_CONTOUR_INVALID');
  return { ok: errors.length === 0, errors };
}

export function validateC1MatrixBinding(matrix, receipt) {
  const errors = [];
  const c1 = Array.isArray(matrix?.routeDenominator)
    ? matrix.routeDenominator.find((route) => route.routeId === 'C1')
    : null;
  if (!c1) {
    errors.push('MATRIX_C1_ROUTE_MISSING');
    return { ok: false, errors };
  }
  failIf(c1.routeVerdict !== 'BLOCKED', errors, 'MATRIX_C1_ROUTE_VERDICT_MUST_BE_BLOCKED');
  failIf(c1.accountingStatus !== 'FULL_BOOK_ATTEMPTED_BLOCKED', errors, 'MATRIX_C1_ACCOUNTING_STATUS_INVALID');
  failIf(c1.fullBookAccounting !== POST_AUTH_REPAIR_FULL_BOOK_ACCOUNTING, errors, 'MATRIX_C1_FULL_BOOK_ACCOUNTING_INVALID');
  failIf(!Array.isArray(c1.blockerEvidenceRefs) || !c1.blockerEvidenceRefs.includes('YALKEN_INTEROP_C1_WORD_FULLBOOK_ROUTE_RECEIPT_V1'), errors, 'MATRIX_C1_BLOCKER_EVIDENCE_REF_MISSING');
  failIf(!Array.isArray(c1.blockerEvidenceRefs) || !c1.blockerEvidenceRefs.includes('C1_WORD_ROUND01_APPLY_LIFECYCLE_REUSE_GATE_BLOCKER'), errors, 'MATRIX_C1_ROUND01_APPLY_LIFECYCLE_REUSE_GATE_BLOCKER_REF_MISSING');
  failIf(Array.isArray(c1.executedFullRouteEvidence) && c1.executedFullRouteEvidence.length !== 0, errors, 'MATRIX_C1_EXECUTED_FULL_ROUTE_EVIDENCE_MUST_REMAIN_EMPTY');
  failIf(c1.productMutationAuthority !== 'DENY_UNTIL_ROUTE_CONTOUR_PROVES_APPLY_AUTHORITY', errors, 'MATRIX_C1_PRODUCT_AUTHORITY_ESCALATION');
  failIf(matrix?.claimControls?.chainSaturationVerdict !== receipt.route.chainSaturationVerdict, errors, 'MATRIX_CHAIN_SATURATION_MISMATCH');
  return { ok: errors.length === 0, errors };
}

function tryReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function resolveExactHeadBinding(repoRoot = repoRootFromHere(), env = process.env) {
  const git = spawnSync('git', ['merge-base', '--is-ancestor', EXACT_HEAD, 'HEAD'], {
    cwd: repoRoot,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  if (git.status === 0) {
    return { ok: true, status: 'REACHABLE_FROM_CURRENT_HEAD', source: 'LOCAL_GIT_GRAPH' };
  }
  if (env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'pull_request' && env.GITHUB_EVENT_PATH) {
    const event = tryReadJson(env.GITHUB_EVENT_PATH);
    const baseSha = event?.pull_request?.base?.sha;
    if (baseSha === EXACT_HEAD) return { ok: true, status: 'MATCHES_PULL_REQUEST_BASE_SHA_IN_SHALLOW_CHECKOUT', source: 'GITHUB_PULL_REQUEST_EVENT' };
    return {
      ok: false,
      status: 'PULL_REQUEST_BASE_SHA_MISMATCH',
      source: 'GITHUB_PULL_REQUEST_EVENT',
      observedBaseSha: baseSha || 'MISSING',
      acceptedBaseShas: [EXACT_HEAD],
      staleRejectedBaseShas: [
        PRE_AUTH_REPAIR_ROUTE_HEAD,
        PRE_VISIBILITY_REPLAY_ROUTE_HEAD,
        PRE_WINDOW_REPAIR_ROUTE_HEAD,
        PRE_NATIVE_MATERIALIZATION_REPLAY_ROUTE_HEAD,
        PRE_ORACLE_OUTCOME_MISMATCH_REPAIR_ROUTE_HEAD,
      ],
    };
  }
  return { ok: false, status: 'NOT_REACHABLE_FROM_CURRENT_HEAD', source: 'LOCAL_GIT_GRAPH' };
}

export function verifyC1Route(options = {}) {
  const repoRoot = options.repoRoot || repoRootFromHere();
  const errors = [];
  const receipt = readC1Receipt(repoRoot);
  const matrix = readChainMatrix(repoRoot);
  const receiptReport = validateC1Receipt(receipt);
  errors.push(...receiptReport.errors);
  const matrixReport = validateC1MatrixBinding(matrix, receipt);
  errors.push(...matrixReport.errors);
  const receiptSha256 = sha256File(repoRoot, RECEIPT_PATH);
  let catalogIncludesContract = false;
  if (options.checkCatalog) {
    const catalog = readJsonAt(repoRoot, CATALOG_PATH);
    catalogIncludesContract = Array.isArray(catalog.contractBasenames) && catalog.contractBasenames.includes(CONTRACT_BASENAME);
    if (!catalogIncludesContract) errors.push(`CATALOG_CONTRACT_MISSING:${CONTRACT_BASENAME}`);
    if (catalog.currentTruthBinding?.interopC1WordFullBookRoute !== STATUS) errors.push('CATALOG_C1_BINDING_MISSING');
  }
  const exactHeadBinding = resolveExactHeadBinding(repoRoot, options.env || process.env);
  if (!exactHeadBinding.ok) errors.push(`EXACT_HEAD_BINDING_INVALID:${exactHeadBinding.status}`);
  return {
    ok: errors.length === 0,
    errors,
    exactHead: EXACT_HEAD,
    routeId: 'C1',
    routeVerdict: receipt.route?.routeVerdict || '',
    chainSaturationVerdict: receipt.route?.chainSaturationVerdict || '',
    receiptSha256,
    catalogIncludesContract,
    exactHeadBinding,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function runC1HostileCorpus() {
  const base = readC1Receipt();
  const cases = [
    ['route-pass', (r) => { r.route.routeVerdict = 'PASS'; }, 'ROUTE_VERDICT_MUST_BE_BLOCKED'],
    ['chain-pass', (r) => { r.route.chainSaturationVerdict = 'PASS'; }, 'CHAIN_SATURATION_ESCALATION'],
    ['word-build-launder', (r) => { r.provider.word.build = '16.111.26080215'; }, 'WORD_PROFILE_MISMATCH'],
    ['smoke-admitted', (r) => { r.denominator.fullBook.excerptOrSmokeEvidenceAdmitted = true; }, 'SMOKE_OR_EXCERPT_ADMITTED'],
    ['actual-route-count-launder', (r) => { r.denominator.route.actualRouteCount = 1; }, 'ACTUAL_ROUTE_MUST_REMAIN_ZERO'],
    ['word-status-fail-launder', (r) => { r.physicalEvidence.resultStatus.wordStatus = 'FAIL'; }, 'WORD_STATUS_MUST_BE_PASS_WITH_ORACLE_FAILURE'],
    ['product-return-apply-pass', (r) => { r.physicalEvidence.resultStatus.productReturnApplyOk = true; }, 'PRODUCT_RETURN_APPLY_MUST_REMAIN_FALSE'],
    ['terminal-aggregate-present', (r) => { r.physicalEvidence.resultStatus.terminalOperationAggregatePresent = true; }, 'TERMINAL_AGGREGATE_MUST_BE_ABSENT'],
    ['return-intake-unauthenticated-launder', (r) => { r.physicalEvidence.resultStatus.returnIntakeAuthenticated = false; }, 'RETURN_INTAKE_MUST_REMAIN_AUTHENTICATED_FOR_ORACLE_FAILURE'],
    ['oracle-pass', (r) => { r.oracles.semanticOracle.status = 'PASS'; }, 'ORACLE_NOT_PASS_WHEN_ROUTE_BLOCKED'],
    ['unknown-as-pass-counter', (r) => { r.failureCounters.unknownAsPass = 1; }, 'BLOCKED_COUNTER_NONZERO'],
    ['user-doc-read', (r) => { r.authority.userDocumentsRead = 1; }, 'USER_DOCUMENT_COUNTER_NONZERO'],
    ['parser-probe-launder', (r) => { r.physicalEvidence.independentParserProbe.ok = true; }, 'OK_MUST_BE_FALSE_AFTER_GATE_FAILURE'],
    ['current-profile-launder', (r) => { r.physicalEvidence.independentParserProbe.payloadProfileId = 'word-mac-16.112-26081010-product-review-export-c5v2-full-manuscript'; }, 'CURRENT_PROFILE_MUST_NOT_BE_CLAIMED_AFTER_ORACLE_FAILURE'],
    ['false-auto-apply', (r) => { r.physicalEvidence.resultStatus.falseAutoApplyCount = 1; }, 'FALSE_AUTO_APPLY_COUNT_NONZERO'],
    ['wrong-next-contour', (r) => { r.nextSequentialContour = 'C2_YALKEN_WORD_YALKEN_APPLY_WORD_FULL_REVERSE_CYCLE_V1'; }, 'NEXT_CONTOUR_INVALID'],
    ['returned-artifact-missing-after-repair', (r) => { r.physicalEvidence.returnedArtifactPresent = false; }, 'RETURNED_ARTIFACT_MUST_BE_PRESENT_AFTER_REPAIR'],
    ['returned-ready-false-launder', (r) => { r.physicalEvidence.resultStatus.returnedDocxReady = false; }, 'RETURNED_DOCX_READY_MUST_BE_TRUE_FOR_ORACLE_FAILURE'],
    ['complete-oracle-regression-launder', (r) => { r.physicalEvidence.round01.completeRoundOracleGreen = false; }, 'COMPLETE_ROUND_ORACLE_MUST_BE_GREEN_FOR_THIS_BLOCKER'],
  ];
  let killed = 0;
  const survivors = [];
  const reasonCounts = {};
  for (const [name, mutate, expected] of cases) {
    const mutated = clone(base);
    mutate(mutated);
    const report = validateC1Receipt(mutated);
    const killedCase = !report.ok && report.errors.some((error) => error.includes(expected));
    if (killedCase) {
      killed += 1;
      reasonCounts[expected] = (reasonCounts[expected] || 0) + 1;
    } else {
      survivors.push({ name, expected, errors: report.errors });
    }
  }
  return { total: cases.length, killed, survivors: survivors.length, survivorDetails: survivors, reasonCounts };
}

export function runC1SemanticMutationCatalog() {
  const base = readC1Receipt();
  const cases = [
    ['partial-run-as-full-book', (r) => { r.denominator.route.fullBookProcessed = true; }, 'FULL_ROUTE_NOT_PROVEN'],
    ['reported-operations-deflated', (r) => { r.physicalEvidence.resultStatus.reportedOperations = 336; }, 'REPORTED_OPERATIONS'],
    ['parser-write-authority-launder', (r) => { r.physicalEvidence.independentParserProbe.canWriteManuscript = true; }, 'WRITE_AUTHORITY'],
    ['source-authority-profile-tamper', (r) => { r.physicalEvidence.independentParserProbe.payloadProfileIdStale = true; }, 'STALE_PROFILE_BINDING_STILL_RECORDED'],
    ['carrier-authority-launder', (r) => { r.physicalEvidence.independentParserProbe.authorityVerified = true; }, 'AUTHORITY_VERIFIED'],
    ['product-network-launder', (r) => { r.authority.productNetworkRuntimeUsed = true; }, 'PRODUCT_NETWORK_SCOPE_ESCALATION'],
    ['product-wiring-launder', (r) => { r.authority.productRuntimeWiringChanged = true; }, 'PRODUCT_RUNTIME_SCOPE_ESCALATION'],
    ['provider-signature-launder', (r) => { r.provider.word.signature = 'UNKNOWN'; }, 'SIGNATURE'],
    ['process-cleanup-launder', (r) => { r.provider.word.processAfterCleanup = 'RUNNING'; }, 'PROCESS_AFTER_CLEANUP'],
    ['comment-oracle-pass-launder', (r) => { r.oracles.commentsOracle.status = 'PASS'; }, 'ORACLE_NOT_PASS_WHEN_ROUTE_BLOCKED'],
    ['semantic-mutation-survivor-launder', (r) => { r.semanticMutations.survivors = 1; }, 'SEMANTIC_MUTATION_SURVIVORS_NONZERO'],
    ['hostile-corpus-survivor-launder', (r) => { r.hostileCorpus.survivors = 1; }, 'HOSTILE_CORPUS_SURVIVORS_NONZERO'],
  ];
  let killed = 0;
  const survivors = [];
  for (const [name, mutate, expected] of cases) {
    const mutated = clone(base);
    mutate(mutated);
    const report = validateC1Receipt(mutated);
    const killedCase = !report.ok && report.errors.some((error) => error.includes(expected));
    if (killedCase) killed += 1;
    else survivors.push({ name, expected, errors: report.errors });
  }
  return { total: cases.length, killed, survivors: survivors.length, survivorDetails: survivors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = verifyC1Route({ checkCatalog: process.argv.includes('--check-catalog') });
  const hostile = runC1HostileCorpus();
  const mutations = runC1SemanticMutationCatalog();
  const ok = report.ok && hostile.survivors === 0 && mutations.survivors === 0;
  console.log([
    `C1_WORD_FULLBOOK_ROUTE_STATUS=${ok ? 'PASS' : 'FAIL'}`,
    `ROUTE_VERDICT=${report.routeVerdict}`,
    `CHAIN_SATURATION_VERDICT=${report.chainSaturationVerdict}`,
    `RECEIPT_SHA256=${report.receiptSha256}`,
    `HOSTILE=${hostile.killed}/${hostile.total}`,
    `MUTATIONS=${mutations.killed}/${mutations.total}`,
  ].join('\n'));
  if (!ok) {
    console.error(JSON.stringify({ report, hostile, mutations }, null, 2));
  }
  process.exit(ok ? 0 : 1);
}
