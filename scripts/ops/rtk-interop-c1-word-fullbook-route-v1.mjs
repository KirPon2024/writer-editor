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
export const EXACT_HEAD = '1b8a23441ba29b6cac79a62a3b18ece031654e62';
export const RECOVERY_PARENT_HEAD = '2cb6a6f6199272a22d8da9d903ef11a6072befd9';
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
  failIf(evidence.resultStatus?.attemptedOperations !== 200, errors, 'PHYSICAL_RESULT_INVALID:ATTEMPTED_OPERATIONS');
  failIf(evidence.resultStatus?.reportedOperations !== 200, errors, 'PHYSICAL_RESULT_INVALID:REPORTED_OPERATIONS');
  failIf(evidence.resultStatus?.wordStatus !== 'PASS', errors, 'PHYSICAL_RESULT_INVALID:WORD_STATUS_MUST_BE_PASS_AFTER_ARTIFACT_REPAIR');
  failIf(evidence.resultStatus?.sourceExportOk !== true, errors, 'PHYSICAL_RESULT_INVALID:SOURCE_EXPORT_REQUIRED');
  failIf(evidence.resultStatus?.electronOk !== false, errors, 'PHYSICAL_RESULT_INVALID:ELECTRON_OK_MUST_REMAIN_FALSE');
  failIf(evidence.resultStatus?.productReturnApplyOk !== false, errors, 'PHYSICAL_RESULT_INVALID:PRODUCT_RETURN_APPLY_MUST_REMAIN_FALSE');
  failIf(evidence.resultStatus?.terminalOperationAggregatePresent !== false, errors, 'PHYSICAL_RESULT_INVALID:TERMINAL_AGGREGATE_MUST_BE_ABSENT');
  failIf(evidence.resultStatus?.returnIntakeAuthenticated !== false, errors, 'PHYSICAL_RESULT_INVALID:RETURN_INTAKE_MUST_REMAIN_UNAUTHENTICATED');
  failIf(evidence.resultStatus?.returnIntakeStatus !== 'legacy-unbound-review-preview', errors, 'PHYSICAL_RESULT_INVALID:RETURN_INTAKE_STATUS');
  failIf(evidence.resultStatus?.falseAutoApplyCount !== 0, errors, 'FALSE_AUTO_APPLY_COUNT_NONZERO');
  failIf(evidence.returnedArtifactPresent !== true, errors, 'PHYSICAL_RESULT_INVALID:RETURNED_ARTIFACT_MUST_BE_PRESENT_AFTER_REPAIR');
  failIf(evidence.returnedArtifactSha256 !== evidence.returnedDocxSha256, errors, 'PHYSICAL_RESULT_INVALID:RETURNED_ARTIFACT_DIGEST_MISMATCH');
  failIf(evidence.independentParserProbe?.ok !== true, errors, 'INDEPENDENT_PARSER_PROBE_INVALID:OK');
  failIf(evidence.independentParserProbe?.status !== 'returned-artifact-current-profile-bound-unauthenticated', errors, 'INDEPENDENT_PARSER_PROBE_INVALID:STATUS');
  failIf(evidence.independentParserProbe?.sourceMode !== 'RETURNED_WORD_ARTIFACT', errors, 'INDEPENDENT_PARSER_PROBE_INVALID:SOURCE_MODE');
  failIf(evidence.independentParserProbe?.canWriteManuscript !== false, errors, 'INDEPENDENT_PARSER_PROBE_INVALID:WRITE_AUTHORITY');
  failIf(evidence.independentParserProbe?.reviewCounts?.textRevisions !== 119, errors, 'INDEPENDENT_PARSER_PROBE_INVALID:TEXT_REVISION_COUNT');
  failIf(evidence.independentParserProbe?.reviewCounts?.commentThreads !== 30, errors, 'INDEPENDENT_PARSER_PROBE_INVALID:COMMENT_COUNT');
  failIf(evidence.independentParserProbe?.reviewCounts?.formattingDeltas !== 0, errors, 'INDEPENDENT_PARSER_PROBE_INVALID:FORMATTING_COUNT');
  failIf(evidence.independentParserProbe?.selectedCarrier !== 'customDocumentProperty:YRTK_C01_AUTH', errors, 'INDEPENDENT_PARSER_PROBE_INVALID:CARRIER');
  failIf(evidence.independentParserProbe?.authorityVerified !== false, errors, 'INDEPENDENT_PARSER_PROBE_INVALID:AUTHORITY_VERIFIED');
  failIf(evidence.independentParserProbe?.payloadProfileId !== 'word-mac-16.112-26081010-product-review-export-c5v2-full-manuscript', errors, 'CURRENT_PROFILE_BINDING_NOT_RECORDED');
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
    'WORD_NATIVE_LIFECYCLE_REPLY_STATE_BLOCKER',
    'C5_STALE_PROVIDER_PROFILE_BINDING',
    'ORCHESTRATOR_PROGRESS_ROUND_ID_DEFECT_REPAIRED',
    'N2_NOT_REPAIRED_IN_THIS_CONTOUR',
  ]) {
    if (!byId.has(required)) errors.push(`FAILURE_CLASSIFICATION_MISSING:${required}`);
  }
  failIf(byId.get('ORCHESTRATOR_PROGRESS_ROUND_ID_DEFECT_REPAIRED')?.disposition !== 'REPAIRED_IN_SCOPE', errors, 'ORCHESTRATOR_FIX_NOT_RECORDED');
  failIf(byId.get('C5_STALE_PROVIDER_PROFILE_BINDING')?.disposition !== 'REPAIRED_IN_CURRENT_PROFILE_REPLAY', errors, 'STALE_PROFILE_REPAIR_NOT_RECORDED');
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
  failIf(receipt.nextSequentialContour !== 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1', errors, 'NEXT_CONTOUR_INVALID');
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
  failIf(c1.fullBookAccounting !== 'FULL_BOOK_ATTEMPTED_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_BLOCKED_NOT_PROVEN', errors, 'MATRIX_C1_FULL_BOOK_ACCOUNTING_INVALID');
  failIf(!Array.isArray(c1.blockerEvidenceRefs) || !c1.blockerEvidenceRefs.includes('YALKEN_INTEROP_C1_WORD_FULLBOOK_ROUTE_RECEIPT_V1'), errors, 'MATRIX_C1_BLOCKER_EVIDENCE_REF_MISSING');
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
    if (baseSha === RECOVERY_PARENT_HEAD) {
      return {
        ok: true,
        status: 'MATCHES_RECOVERY_PARENT_SHA_IN_SHALLOW_CHECKOUT',
        source: 'GITHUB_PULL_REQUEST_EVENT',
        observedBaseSha: baseSha,
        historicalExactHead: EXACT_HEAD,
      };
    }
    return {
      ok: false,
      status: 'PULL_REQUEST_BASE_SHA_MISMATCH',
      source: 'GITHUB_PULL_REQUEST_EVENT',
      observedBaseSha: baseSha || 'MISSING',
      acceptedBaseShas: [EXACT_HEAD, RECOVERY_PARENT_HEAD],
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
    ['word-status-failure-launder', (r) => { r.physicalEvidence.resultStatus.wordStatus = 'FAIL'; }, 'WORD_STATUS_MUST_BE_PASS_AFTER_ARTIFACT_REPAIR'],
    ['product-return-apply-pass', (r) => { r.physicalEvidence.resultStatus.productReturnApplyOk = true; }, 'PRODUCT_RETURN_APPLY_MUST_REMAIN_FALSE'],
    ['terminal-aggregate-present', (r) => { r.physicalEvidence.resultStatus.terminalOperationAggregatePresent = true; }, 'TERMINAL_AGGREGATE_MUST_BE_ABSENT'],
    ['return-intake-authenticated', (r) => { r.physicalEvidence.resultStatus.returnIntakeAuthenticated = true; }, 'RETURN_INTAKE_MUST_REMAIN_UNAUTHENTICATED'],
    ['oracle-pass', (r) => { r.oracles.semanticOracle.status = 'PASS'; }, 'ORACLE_NOT_PASS_WHEN_ROUTE_BLOCKED'],
    ['unknown-as-pass-counter', (r) => { r.failureCounters.unknownAsPass = 1; }, 'BLOCKED_COUNTER_NONZERO'],
    ['user-doc-read', (r) => { r.authority.userDocumentsRead = 1; }, 'USER_DOCUMENT_COUNTER_NONZERO'],
    ['missing-parser-probe', (r) => { r.physicalEvidence.independentParserProbe.ok = false; }, 'INDEPENDENT_PARSER_PROBE_INVALID'],
    ['current-profile-not-recorded', (r) => { r.physicalEvidence.independentParserProbe.payloadProfileId = 'word-mac-latest-observed-16.111.x-product-review-export-c5v2-full-manuscript'; }, 'CURRENT_PROFILE_BINDING_NOT_RECORDED'],
    ['false-auto-apply', (r) => { r.physicalEvidence.resultStatus.falseAutoApplyCount = 1; }, 'FALSE_AUTO_APPLY_COUNT_NONZERO'],
    ['wrong-next-contour', (r) => { r.nextSequentialContour = 'C2_YALKEN_WORD_YALKEN_APPLY_WORD_FULL_REVERSE_CYCLE_V1'; }, 'NEXT_CONTOUR_INVALID'],
    ['returned-artifact-missing-after-repair', (r) => { r.physicalEvidence.returnedArtifactPresent = false; }, 'RETURNED_ARTIFACT_MUST_BE_PRESENT_AFTER_REPAIR'],
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
    ['reported-operations-deflated', (r) => { r.physicalEvidence.resultStatus.reportedOperations = 0; }, 'REPORTED_OPERATIONS'],
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
