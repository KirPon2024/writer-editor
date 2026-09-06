#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  EXPECTED_DENOMINATOR,
  EXPECTED_WORD_PROFILE,
  EXACT_HEAD as C1_PHYSICAL_HEAD,
  validateC1MatrixBinding,
  validateC1Receipt,
} from '../rtk-interop-c1-word-fullbook-route-v1.mjs';

export const STAGE_ID = 'WP-706_WORD_REPORT';
export const PROFILE_ID = 'WORD_ROUNDTRIP';
export const CLAIM_ID = 'CLM_WORD_ROUNDTRIP';
export const NEXT_STAGE_ID = 'WP-707_WORD_APPLY';
export const EXPECTED_SOURCE_DIGESTS = Object.freeze({
  c1Receipt: 'e92dc34711f44c36346904b96329f1605d4770b199ca4541574a1df9d6794b3e',
  c1Matrix: '9d1b42ea0036f61f7f4fb6883392976c76234a5810d55742ed7d7f762ed62fb5',
  c1Verifier: 'ae0abef568a6e8ed25ccd9f3f99919ca8cadc4cba6ed76b4f1e314589500f85d',
  v2EffectiveState: 'aade0b9376e15d0b1a9b8500e3e4dfa099e2ce4389ebbe9be0b8310ccef2c5bf',
});
export const FORBIDDEN_TRUE_FIELDS = Object.freeze([
  'routePassClaim',
  'productApplyAuthority',
  'safeApplyExpansion',
  'wordTerminalPass',
  'programPass',
  'userDocumentsTouched',
  'userDocumentsAllowed',
  'releaseReady',
  'productionReleaseReady',
  'runtimeNetworkActivated',
  'wordProcessInvocationRequested',
  'successorActivationRequested',
]);

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const fail = (code, errors, detail = '') => errors.push(detail ? `${code}:${detail}` : code);
const stableJson = value => Array.isArray(value)
  ? `[${value.map(stableJson).join(',')}]`
  : isObject(value)
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
    : JSON.stringify(value);

export function sha256Json(value) {
  return crypto.createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

export function compileWordReport(input = {}) {
  const errors = [];
  const {
    executableProgram,
    scientificContracts,
    v2EffectiveState,
    c1Receipt,
    c1Matrix,
    sourceDigests,
    repoState,
    expectedHeadSha,
    expectedOriginMainSha,
    claimRequest = {},
  } = input;

  if (!isObject(executableProgram) || !Array.isArray(executableProgram.nodes)) fail('E_R24_WP706_PROGRAM', errors);
  if (!isObject(scientificContracts) || !Array.isArray(scientificContracts.claims)) fail('E_R24_WP706_SCIENTIFIC_CONTRACTS', errors);
  if (!isObject(v2EffectiveState)) fail('E_R24_WP706_V2_STATE', errors);
  if (!isObject(c1Receipt)) fail('E_R24_WP706_C1_RECEIPT', errors);
  if (!isObject(c1Matrix)) fail('E_R24_WP706_C1_MATRIX', errors);
  if (errors.length) return { ok: false, code: errors[0], errors };

  if (!isObject(repoState) || repoState.headSha !== expectedHeadSha) fail('E_R24_WP706_EXACT_HEAD_MISMATCH', errors);
  if (expectedOriginMainSha && repoState?.originMainSha !== expectedOriginMainSha) fail('E_R24_WP706_ORIGIN_MAIN_MISMATCH', errors);
  if (!/^[0-9a-f]{40}$/u.test(repoState?.treeSha || '')) fail('E_R24_WP706_TREE_IDENTITY', errors);
  if (repoState?.dirty !== false) fail('E_R24_WP706_WORKTREE_DIRTY', errors);
  for (const [name, digest] of Object.entries(EXPECTED_SOURCE_DIGESTS)) {
    if (sourceDigests?.[name] !== digest) fail('E_R24_WP706_SOURCE_DIGEST', errors, name);
  }

  const node = executableProgram.nodes.find(row => row.id === STAGE_ID);
  const expectedDependencies = ['WP-705_NEGOTIATION_CORPUS', 'V2_WORD_CLAIM_COMPILER', 'WP-207_WRITER_REFINEMENT', 'W0_WORD_PHYSICAL_RECERTIFICATION'];
  if (!node || node.state !== 'PENDING' || node.profile !== 'WORD_INTERCHANGE') fail('E_R24_WP706_NODE_CONTRACT', errors);
  if (stableJson(node?.dependsOn) !== stableJson(expectedDependencies)) fail('E_R24_WP706_DEPENDENCIES', errors);
  if (node?.outcome !== 'Disposable full-book report-only replay and harness qualification') fail('E_R24_WP706_OUTCOME', errors);
  if (node?.ownerGate !== null || node?.mutationAuthority !== 'WORD_INTERCHANGE_BOUNDED_CONTOUR') fail('E_R24_WP706_AUTHORITY', errors);

  const claim = scientificContracts.claims.find(row => row.claimId === CLAIM_ID);
  if (!claim || claim.profileId !== PROFILE_ID || claim.currentVerdict !== 'BLOCKED') fail('E_R24_WP706_WORD_CONTRACT_BLOCKED_REQUIRED', errors);
  if (stableJson(claim?.cannotPromote) !== stableJson(['SAFE_APPLY_WIDENING', 'USER_DOCUMENT_ACCESS', 'GOOGLE_EVIDENCE_TRANSFER'])) {
    fail('E_R24_WP706_CANNOT_PROMOTE', errors);
  }
  if (v2EffectiveState.stageId !== 'V2_WORD_CLAIM_COMPILER'
    || v2EffectiveState.targetGraph?.transition?.to !== 'DONE'
    || v2EffectiveState.wordProfileVerdict !== 'BLOCKED'
    || v2EffectiveState.wordProfileTerminalPass !== false
    || v2EffectiveState.programDone !== false) {
    fail('E_R24_WP706_V2_PREDECESSOR_STATE', errors);
  }

  const receiptReport = validateC1Receipt(c1Receipt);
  const matrixReport = validateC1MatrixBinding(c1Matrix, c1Receipt);
  if (!receiptReport.ok) fail('E_R24_WP706_C1_RECEIPT_INVALID', errors, receiptReport.errors[0] || 'UNKNOWN');
  if (!matrixReport.ok) fail('E_R24_WP706_C1_MATRIX_INVALID', errors, matrixReport.errors[0] || 'UNKNOWN');
  const physical = c1Receipt.physicalEvidence;
  if (c1Receipt.exactHead !== C1_PHYSICAL_HEAD) fail('E_R24_WP706_C1_PHYSICAL_HEAD', errors);
  if (c1Receipt.route?.routeVerdict !== 'BLOCKED' || c1Receipt.verdict !== 'NEEDS_MORE_EVIDENCE') fail('E_R24_WP706_ROUTE_BLOCKED_REQUIRED', errors);
  if (physical?.stageResult?.operationCount !== 2000 || physical?.round01?.plannedOperationCount !== 379) fail('E_R24_WP706_OPERATION_DENOMINATOR', errors);
  if (physical?.round01?.completeRoundOracleGreen !== true
    || physical?.round01?.productReturnApplyGreen !== false
    || physical?.round01?.nativeLifecycleVerificationGreen !== false
    || physical?.round01?.completedRoundReuseBindingOk !== false) {
    fail('E_R24_WP706_BLOCKER_VECTOR', errors);
  }
  if (physical?.round01?.productReturnApply?.expectedOperationCount !== 105
    || physical?.round01?.productReturnApply?.matchedOperationCount !== 0
    || physical?.round01?.nativeLifecycleCoverage?.verifiedCount !== 0
    || physical?.round01?.nativeLifecycleCoverage?.blockedCount !== 38) {
    fail('E_R24_WP706_BLOCKER_COUNTS', errors);
  }
  if (c1Receipt.authority?.syntheticArtifactsOnly !== true
    || c1Receipt.authority?.userDocumentsRead !== 0
    || c1Receipt.authority?.userDocumentsMutated !== 0
    || c1Receipt.provider?.word?.processAfterCleanup !== 'NOT_RUNNING') {
    fail('E_R24_WP706_SAFETY_BOUNDARY', errors);
  }

  const promoted = FORBIDDEN_TRUE_FIELDS.find(field => claimRequest?.[field] === true);
  if (promoted) fail('E_R24_WP706_PROMOTION_FORBIDDEN', errors, promoted);
  if (claimRequest?.profileVerdict === 'PASS' || claimRequest?.programVerdict === 'PASS' || claimRequest?.globalScalarPass === true) {
    fail('E_R24_WP706_SCALAR_PASS_FORBIDDEN', errors);
  }
  if (claimRequest?.profiles && stableJson(claimRequest.profiles) !== stableJson([PROFILE_ID])) fail('E_R24_WP706_PROFILE_IMPORT_FORBIDDEN', errors);

  if (errors.length) return { ok: false, code: errors[0].split(':')[0], errors };
  const report = {
    schemaVersion: 'YALKEN_R24_WP706_WORD_REPORT_OBSERVED_V1',
    stageId: STAGE_ID,
    status: 'WP706_REPORT_ONLY_HARNESS_QUALIFIED_BLOCKED',
    nodeVerdict: 'DONE_AFTER_REQUIRED_DELIVERY',
    profileId: PROFILE_ID,
    profileVerdict: 'BLOCKED',
    programVerdict: 'NEEDS_MORE_EVIDENCE',
    programDone: false,
    evaluationIdentity: {
      headSha: repoState.headSha,
      originMainSha: repoState.originMainSha,
      treeSha: repoState.treeSha,
    },
    physicalSource: {
      evidenceRole: 'COMMITTED_HISTORICAL_DISPOSABLE_PROVIDER_BLOCKER_EVIDENCE',
      freshProviderExecutionByWp706: false,
      physicalHeadSha: c1Receipt.exactHead,
      wordVersion: c1Receipt.provider.word.version,
      wordBuild: c1Receipt.provider.word.build,
      corpusId: c1Receipt.denominator.fullBook.corpusId,
      targetWords: c1Receipt.denominator.fullBook.targetWords,
      sceneCount: c1Receipt.denominator.fullBook.sceneCount,
      plannedLedgerOperations: physical.stageResult.operationCount,
      round01AttemptedOperations: physical.resultStatus.attemptedOperations,
      completeRoundSemanticOracleGreen: physical.round01.completeRoundOracleGreen,
      routeCompleted: false,
    },
    blockerVector: {
      exactTextOperationIds: { matched: 0, expected: 105 },
      productReturnApplyGreen: false,
      formattingApplyCode: physical.round01.productReturnApply.formattingApplyCode,
      nativeLifecycle: { verified: 0, blocked: 38 },
      completedRoundReuseBindingOk: false,
    },
    harnessQualification: {
      reportOnly: true,
      receiptContractValid: true,
      matrixBindingValid: true,
      denominatorClosed: true,
      zeroDenominatorFails: true,
      skipsFailRequiredEvidence: true,
      expectedFullBookDenominatorDigest: sha256Json(EXPECTED_DENOMINATOR),
      expectedWordProfileDigest: sha256Json(EXPECTED_WORD_PROFILE),
    },
    authority: {
      wordProcessInvoked: false,
      productMutationAuthority: false,
      productApplyAuthority: false,
      safeApplyExpansion: false,
      routePassClaim: false,
      wordTerminalPass: false,
      userDocumentsAllowed: false,
      userDocumentsRead: 0,
      userDocumentsMutated: 0,
      runtimeNetworkActivated: false,
    },
    successor: {
      stageId: NEXT_STAGE_ID,
      graphDerived: true,
      activated: false,
      ownerGateRequired: 'WORD_MULTI_SCENE_SEPARATE_ADR',
    },
    nonClaims: [
      'NO_FRESH_WORD_PROVIDER_EXECUTION_BY_WP706',
      'NO_WORD_PRODUCT_TERMINAL_PASS',
      'NO_ROUTE_PASS',
      'NO_PRODUCT_APPLY_AUTHORITY',
      'NO_SAFE_APPLY_EXPANSION',
      'NO_USER_DOCUMENT_AUTHORITY',
      'NO_SUCCESSOR_ACTIVATION',
      'NO_RELEASE_READINESS',
      'NO_PROGRAM_DONE',
    ],
  };
  return { ok: true, code: 'R24_WP706_WORD_REPORT_COMPILED', report };
}

export function verifyObservedReport(observed, input) {
  const result = compileWordReport(input);
  if (!result.ok) return result;
  if (stableJson(observed) !== stableJson(result.report)) {
    return { ok: false, code: 'E_R24_WP706_OBSERVED_REPORT_DRIFT', errors: ['E_R24_WP706_OBSERVED_REPORT_DRIFT'] };
  }
  return { ok: true, code: 'R24_WP706_OBSERVED_REPORT_VERIFIED', reportDigest: sha256Json(observed) };
}

function repoRootFromHere() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}
function readJson(root, relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}
function fileDigest(root, relative) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');
}
function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}
export function repositoryInput(root = repoRootFromHere()) {
  const paths = {
    executableProgram: 'docs/OPS/R24/EXECUTABLE_PROGRAM_R2_4.json',
    scientificContracts: 'docs/OPS/EVIDENCE/YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1/SCIENTIFIC_CONTRACTS.json',
    v2EffectiveState: 'docs/OPS/R24/CORRECTIVE/V2_EFFECTIVE_STATE_V1.json',
    c1Receipt: 'docs/OPS/RTK/YALKEN_INTEROP_C1_WORD_FULLBOOK_ROUTE_RECEIPT_V1.json',
    c1Matrix: 'docs/OPS/RTK/YALKEN_INTEROP_CHAIN_MATRIX_V1.json',
    c1Verifier: 'scripts/ops/rtk-interop-c1-word-fullbook-route-v1.mjs',
  };
  return {
    executableProgram: readJson(root, paths.executableProgram),
    scientificContracts: readJson(root, paths.scientificContracts),
    v2EffectiveState: readJson(root, paths.v2EffectiveState),
    c1Receipt: readJson(root, paths.c1Receipt),
    c1Matrix: readJson(root, paths.c1Matrix),
    sourceDigests: {
      c1Receipt: fileDigest(root, paths.c1Receipt),
      c1Matrix: fileDigest(root, paths.c1Matrix),
      c1Verifier: fileDigest(root, paths.c1Verifier),
      v2EffectiveState: fileDigest(root, paths.v2EffectiveState),
    },
    repoState: {
      headSha: git(root, ['rev-parse', 'HEAD']),
      originMainSha: git(root, ['rev-parse', 'origin/main']),
      treeSha: git(root, ['rev-parse', 'HEAD^{tree}']),
      dirty: git(root, ['status', '--porcelain=v1', '--untracked-files=all']) !== '',
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const root = repoRootFromHere();
  const input = repositoryInput(root);
  input.expectedHeadSha = input.repoState.headSha;
  input.expectedOriginMainSha = input.repoState.originMainSha;
  if (process.argv.includes('--allow-dirty-evaluation')) input.repoState.dirty = false;
  const observedPath = path.join(root, 'docs/OPS/R24/CORRECTIVE/WP706_WORD_REPORT_OBSERVED_V1.json');
  const result = process.argv.includes('--verify-observed')
    ? verifyObservedReport(JSON.parse(fs.readFileSync(observedPath, 'utf8')), input)
    : compileWordReport(input);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
