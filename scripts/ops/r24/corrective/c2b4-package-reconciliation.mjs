#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { canonicalBytes, canonicalize } from './canonical-json.mjs';

export const PROGRAM_TEMPLATE_DIGEST = '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a';
export const TRUST_MODEL_DIGEST = '4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d';
export const OWNER_BINDING_DIGEST = 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6';
export const C2B3C_TERMINAL_ATTESTATION_DIGEST = '860bb49c5ea6769a923eee92083e78a937bca4351119741532a7310771a039ff';
export const SOURCE_HEAD_SHA = 'ea06ded5071e189d5a278148552ab778501c00cc';
export const SOURCE_TREE_SHA = 'ad4bcf74a914b4a5f2f72ae0ba50f84286c20360';
export const STAGE_INSTANCE_DIGEST = '958d8e70bb04922edcd3562da868544a6a7b2ce31498c01ece29e97929e777d7';
export const STAGE_ADMISSION_DIGEST = '2678216d2ce691966cb45f7b8c273752daf2c8ca80d4589348643c8a4122210d';
export const OBSERVED_AT_UTC = '2026-08-28T02:45:21.000Z';

export const EXPECTED_DIGESTS = Object.freeze({
  packageManifest: 'a437bb4de86b12dd6027218f55ef55216e5b18c40b48fb33725ccc752c60e7ff',
  packageMutationReceipt: 'b2f37f8e9288fb6790b44df26cab59c5de5a3ca9e3e8229a5c6dc1ec62d7b95c',
  packageVerificationReceipt: 'e78402f9f71b88a4b4ce1a8cfaa2eff56b5d90343c83bbbc4c530fb62ecd01bc',
  planState: 'f037355e4f1d87107f1593927463d94fa3f7128038790616c4d5611cf42f12f9',
  planStateSourceReceipt: '982420769ae5531abab607ed076e7cd8d09e08a2907fc748fff80c78a45d83ed'
});

export const SOURCE_EVIDENCE_STAMP_IDS = Object.freeze([
  'ES-R24-PK0-PACKAGE-CONTENT-TRUST-POSTMERGE-EXACT-HEAD',
  'ES-R24-PK0-PACKAGE-CONTENT-TRUST-MUTANTS'
]);

export const PATHS = Object.freeze({
  activeApprovals: 'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  activeClaimSet: 'docs/OPS/R24/CORRECTIVE/C2B4_ACTIVE_CLAIM_SET_V1.json',
  approvals: 'docs/OPS/R24/CORRECTIVE/C2B4_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  contract: 'docs/OPS/R24/CORRECTIVE/C2B4_PACKAGE_RECONCILIATION_CONTRACT_V1.json',
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  packageManifest: 'docs/OPS/R24/PACKAGE_MANIFEST_R2_4.json',
  packageMutationReceipt: 'docs/OPS/R24/PACKAGE_MUTATION_RECEIPT_R2_4.json',
  packageVerificationReceipt: 'docs/OPS/R24/PACKAGE_VERIFICATION_RECEIPT_R2_4.json',
  planState: 'docs/OPS/R24/PLAN_STATE_R24.json',
  planStateSourceReceipt: 'docs/OPS/R24/PLAN_STATE_SOURCE_RECEIPT_R24.json',
  programTemplate: 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json',
  reconciliation: 'docs/OPS/R24/CORRECTIVE/C2B4_PACKAGE_RECONCILIATION_V1.json',
  script: 'scripts/ops/r24/corrective/c2b4-package-reconciliation.mjs',
  stageAdmission: 'docs/OPS/R24/CORRECTIVE/C2B4_STAGE_ADMISSION_ATTESTATION_V1.json',
  stageInstance: 'docs/OPS/R24/CORRECTIVE/C2B4_STAGE_INSTANCE_V1.json',
  test: 'test/contracts/r24-c2b4-package-reconciliation.contract.test.mjs'
});

export const WRITE_SET = Object.freeze([
  PATHS.inventory,
  PATHS.activeApprovals,
  PATHS.activeClaimSet,
  PATHS.approvals,
  PATHS.contract,
  PATHS.reconciliation,
  PATHS.stageAdmission,
  PATHS.stageInstance,
  PATHS.script,
  PATHS.test
].sort());

export class ReconciliationError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

function fail(code, detail) { throw new ReconciliationError(code, detail); }
function assert(condition, code, detail) { if (!condition) fail(code, detail); }
const clone = (value) => JSON.parse(JSON.stringify(value));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const lexical = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function run(repoRoot, command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024, timeout: 480000 });
  if (result.error) fail('E_COMMAND_EXECUTION', `${command}:${result.error.message}`);
  return result;
}

function git(repoRoot, args) {
  const result = run(repoRoot, 'git', args);
  assert(result.status === 0, 'E_GIT', `${args.join(' ')}:${String(result.stderr).trim()}`);
  return String(result.stdout).trim();
}

function statusPaths(repoRoot) {
  const result = run(repoRoot, 'git', ['status', '--porcelain=v1', '--untracked-files=all']);
  assert(result.status === 0, 'E_GIT', 'status');
  const text = String(result.stdout).trimEnd();
  return text ? text.split('\n').map((line) => line.slice(3)).sort(lexical) : [];
}

export function assertSourceIdentity(repoRoot = process.cwd()) {
  assert(git(repoRoot, ['rev-parse', `${SOURCE_HEAD_SHA}^{tree}`]) === SOURCE_TREE_SHA, 'E_SOURCE_TREE', SOURCE_HEAD_SHA);
  assert(run(repoRoot, 'git', ['merge-base', '--is-ancestor', SOURCE_HEAD_SHA, 'HEAD']).status === 0, 'E_SOURCE_ANCESTRY', git(repoRoot, ['rev-parse', 'HEAD']));
  const allowed = new Set(WRITE_SET);
  for (const relativePath of statusPaths(repoRoot)) assert(allowed.has(relativePath), 'E_WRITE_SET_EXPANSION', relativePath);
  return { currentHeadSha: git(repoRoot, ['rev-parse', 'HEAD']), currentTreeSha: git(repoRoot, ['rev-parse', 'HEAD^{tree}']), sourceHeadSha: SOURCE_HEAD_SHA, sourceTreeSha: SOURCE_TREE_SHA };
}

function readJsonBytes(repoRoot, relativePath, canonical = false) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  const value = JSON.parse(bytes.toString('utf8'));
  if (canonical) assert(bytes.equals(canonicalBytes(value)), 'E_NON_CANONICAL_INPUT', relativePath);
  return { bytes, digest: sha256(bytes), value };
}

export function loadInputs(repoRoot = process.cwd()) {
  return {
    packageManifest: readJsonBytes(repoRoot, PATHS.packageManifest),
    packageMutationReceipt: readJsonBytes(repoRoot, PATHS.packageMutationReceipt),
    packageVerificationReceipt: readJsonBytes(repoRoot, PATHS.packageVerificationReceipt),
    planState: readJsonBytes(repoRoot, PATHS.planState),
    planStateSourceReceipt: readJsonBytes(repoRoot, PATHS.planStateSourceReceipt),
    programTemplate: readJsonBytes(repoRoot, PATHS.programTemplate, true),
    repoRoot,
    stageAdmission: readJsonBytes(repoRoot, PATHS.stageAdmission, true),
    stageInstance: readJsonBytes(repoRoot, PATHS.stageInstance, true)
  };
}

function validateInputs(inputs) {
  assert(inputs.programTemplate.digest === PROGRAM_TEMPLATE_DIGEST, 'E_PROGRAM_DIGEST', inputs.programTemplate.digest);
  assert(inputs.stageInstance.digest === STAGE_INSTANCE_DIGEST, 'E_STAGE_INSTANCE_DIGEST', inputs.stageInstance.digest);
  assert(inputs.stageAdmission.digest === STAGE_ADMISSION_DIGEST, 'E_STAGE_ADMISSION_DIGEST', inputs.stageAdmission.digest);
  assert(inputs.stageAdmission.value.stageInstanceDigest === STAGE_INSTANCE_DIGEST && inputs.stageAdmission.value.status === 'ADMITTED', 'E_STAGE_NOT_ADMITTED', 'C2B4');
  for (const [name, digest] of Object.entries(EXPECTED_DIGESTS)) assert(inputs[name].digest === digest, 'E_SOURCE_DIGEST', name);
  const manifest = inputs.packageManifest.value;
  assert(manifest.closedWorld === true && manifest.verifierReadOnly === true && manifest.fileCount === 307, 'E_PACKAGE_MANIFEST', 'closed-world');
  assert(manifest.treeDigest === '2178ae0676cfbf0d6027d2c8efb74116a99135f6658ba04aac408170f1c9a295', 'E_PACKAGE_TREE_DIGEST', manifest.treeDigest);
  const mutation = inputs.packageMutationReceipt.value;
  assert(mutation.status === 'PASS' && mutation.total === 138 && mutation.killed === 138 && mutation.survived === 0, 'E_PACKAGE_MUTATION', canonicalize(mutation));
  assert(mutation.claimCeiling === 'PACKAGE_AND_PLAN_ORACLE_ONLY' && mutation.productRepositoryImplementationMutantsExecuted === 0, 'E_MUTATION_CLASS_CONFLATION', mutation.claimCeiling);
  const verification = inputs.packageVerificationReceipt.value;
  assert(verification.status === 'PASS' && verification.checks === 4628 && verification.failures === 0 && verification.claimCeiling === 'PACKAGE_AND_PLAN_ONLY', 'E_PACKAGE_VERIFICATION', canonicalize(verification));
  const source = inputs.planStateSourceReceipt.value;
  assert(source.currentPlanState?.sha256 === inputs.planState.digest && source.fullDenominator?.nodeCount === 109, 'E_CURRENT_SOURCE_RECEIPT', source.currentPlanState?.sha256);
  const contours = inputs.planState.value.contours;
  assert(contours.R24C0_SEMANTIC_PACKAGE_CLOSURE?.state === 'DONE', 'E_GRAPH_STATE', 'R24C0');
  assert(contours.PK0_PACKAGE_CONTENT_TRUST?.state === 'DONE', 'E_GRAPH_STATE', 'PK0');
  assert(contours.PK1_RELEASE_SECURITY_PHYSICAL?.state === 'BLOCKED_TYPED', 'E_GRAPH_STATE', 'PK1');
  assert(contours.V3_PACKAGE_CLAIM_COMPILER?.state === 'BLOCKED_TYPED', 'E_GRAPH_STATE', 'V3');
}

function tapNumber(stdout, key) {
  const matches = [...stdout.matchAll(new RegExp(`^# ${key} (\\d+)$`, 'gmu'))];
  assert(matches.length > 0, 'E_TAP_MARKER_MISSING', key);
  return Number(matches.at(-1)[1]);
}

function parseJsonMarker(stdout, marker) {
  const match = stdout.match(new RegExp(`^# ${marker}=(\\{.*\\})$`, 'mu'));
  assert(match, 'E_RESULT_MARKER_MISSING', marker);
  return JSON.parse(match[1]);
}

function runSuite(repoRoot, command, expectedTests) {
  const result = run(repoRoot, 'npm', ['run', '-s', command]);
  const stdout = String(result.stdout || '');
  assert(result.status === 0, 'E_ACCEPTANCE_COMMAND_FAILED', command);
  const tap = { cancelled: tapNumber(stdout, 'cancelled'), fail: tapNumber(stdout, 'fail'), pass: tapNumber(stdout, 'pass'), skipped: tapNumber(stdout, 'skipped'), tests: tapNumber(stdout, 'tests'), todo: tapNumber(stdout, 'todo') };
  assert(tap.tests === expectedTests && tap.pass === expectedTests && tap.fail + tap.cancelled + tap.skipped + tap.todo === 0, 'E_TEST_DENOMINATOR', command);
  return { stdout, tap };
}

export function executeAcceptance(repoRoot = process.cwd()) {
  const pk0 = runSuite(repoRoot, 'test:r24-pk0', 6);
  const pk1 = runSuite(repoRoot, 'test:r24-pk1', 7);
  const v3 = runSuite(repoRoot, 'test:r24-v3', 10);
  const pk0Mutation = parseJsonMarker(pk0.stdout, 'R24_PK0_MUTATION_RECEIPT');
  const pk0Physical = parseJsonMarker(pk0.stdout, 'R24_PK0_REPOSITORY_PHYSICAL_RECEIPT');
  const pk1Mutation = parseJsonMarker(pk1.stdout, 'R24_PK1_MUTATION_RECEIPT');
  const pk1Physical = parseJsonMarker(pk1.stdout, 'R24_PK1_REPOSITORY_PHYSICAL_RECEIPT');
  const v3Compiler = parseJsonMarker(v3.stdout, 'R24_V3_COMPILER_RECEIPT');
  const v3Mutation = parseJsonMarker(v3.stdout, 'R24_V3_MUTATION_RECEIPT');
  assert(pk0Mutation.total === 7 && pk0Mutation.killed === 7 && pk0Mutation.survived.length === 0, 'E_PK0_MUTATION', canonicalize(pk0Mutation));
  assert(pk0Physical.pass === true && pk0Physical.releaseReadyClaim === false && pk0Physical.signingNotarizationClaim === false, 'E_PK0_PHYSICAL', canonicalize(pk0Physical));
  assert(pk1Mutation.total === 8 && pk1Mutation.killed === 8 && pk1Mutation.survived.length === 0, 'E_PK1_MUTATION', canonicalize(pk1Mutation));
  assert(pk1Physical.pass === true && pk1Physical.profileVerdictCandidate === 'NOT_READY', 'E_PK1_PHYSICAL', canonicalize(pk1Physical));
  assert(['productionReleaseReady','signingPass','notarizationPass','fusePass','hardenedRuntimePass','runtimeNetworkActivated'].every((field) => pk1Physical[field] === false), 'E_RELEASE_PROMOTION', canonicalize(pk1Physical));
  assert(canonicalize(pk1Physical.staleReceipts) === canonicalize(['c01','c02','c03','c04']), 'E_STALE_RECEIPT_CLASS', canonicalize(pk1Physical.staleReceipts));
  assert(v3Compiler.verdict === 'PASS' && v3Compiler.currentVerdict === 'NOT_READY' && v3Compiler.requiredStageCount === 1, 'E_V3_VERDICT', canonicalize(v3Compiler));
  assert(v3Mutation.total === 9 && v3Mutation.killed === 9 && v3Mutation.survived.length === 0, 'E_V3_MUTATION', canonicalize(v3Mutation));
  return {
    mutationClasses: [
      { classId: 'PK0_IMPLEMENTATION_MUTANTS', killed: 7, survived: 0, total: 7 },
      { classId: 'PK1_CLASSIFIER_MUTANTS', killed: 8, survived: 0, total: 8 },
      { classId: 'V3_COMPILER_MUTANTS', killed: 9, survived: 0, total: 9 }
    ],
    normalizedCurrentClaims: {
      packageContentTrust: 'PASS_BOUNDED_NO_RELEASE',
      packagedReleaseSecurity: 'NOT_READY',
      programVerdict: 'NEEDS_MORE_EVIDENCE',
      releasePublication: false,
      runtimeNetworkActivated: false,
      signingOrNotarizationPass: false
    },
    suites: [
      { command: 'npm run -s test:r24-pk0', suiteTap: pk0.tap },
      { command: 'npm run -s test:r24-pk1', suiteTap: pk1.tap },
      { command: 'npm run -s test:r24-v3', suiteTap: v3.tap }
    ]
  };
}

export function expectedAcceptance() {
  const clean = (tests) => ({ cancelled: 0, fail: 0, pass: tests, skipped: 0, tests, todo: 0 });
  return {
    mutationClasses: [
      { classId: 'PK0_IMPLEMENTATION_MUTANTS', killed: 7, survived: 0, total: 7 },
      { classId: 'PK1_CLASSIFIER_MUTANTS', killed: 8, survived: 0, total: 8 },
      { classId: 'V3_COMPILER_MUTANTS', killed: 9, survived: 0, total: 9 }
    ],
    normalizedCurrentClaims: { packageContentTrust: 'PASS_BOUNDED_NO_RELEASE', packagedReleaseSecurity: 'NOT_READY', programVerdict: 'NEEDS_MORE_EVIDENCE', releasePublication: false, runtimeNetworkActivated: false, signingOrNotarizationPass: false },
    suites: [
      { command: 'npm run -s test:r24-pk0', suiteTap: clean(6) },
      { command: 'npm run -s test:r24-pk1', suiteTap: clean(7) },
      { command: 'npm run -s test:r24-v3', suiteTap: clean(10) }
    ]
  };
}

function buildContract(inputs) {
  return {
    canonicalSerialization: { digest: 'SHA-256_EXACT_BYTES', encoding: 'UTF-8', lineEnding: 'LF', objectKeys: 'LEXICOGRAPHIC_ASCENDING_RECURSIVE', trailingNewline: true },
    claimRules: { archivedPackageIsCurrentRelease: false, mutationClassAggregationForbidden: true, programDoneForbidden: true, releasePublicationRequiresSeparatePhysicalEnvelope: true },
    compilerId: 'YALKEN_R24_C2B4_PACKAGE_RECONCILIATION_COMPILER_V1',
    compilerPath: PATHS.script,
    c2b3cTerminalDependency: { evaluationSha: SOURCE_HEAD_SHA, evaluationTreeSha: SOURCE_TREE_SHA, externalArtifactDigest: 'sha256:36e4543a79dbafdc7c9fff6da63122d9bb5bf9f3a9b32af5eb82d2e8f0bf50a5', externalArtifactId: 9672329994, externalRunId: 33136785829, status: 'VERIFIED', terminalAttestationBytesDigest: C2B3C_TERMINAL_ATTESTATION_DIGEST, trustModelDigest: TRUST_MODEL_DIGEST },
    ownerAuthorityBindingDigest: OWNER_BINDING_DIGEST,
    productionSnapshot: { headSha: SOURCE_HEAD_SHA, treeSha: SOURCE_TREE_SHA },
    programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
    schemaVersion: 'YALKEN_R24_C2B4_PACKAGE_RECONCILIATION_CONTRACT_V1',
    sourceBindings: { packageManifestDigest: inputs.packageManifest.digest, packageMutationReceiptDigest: inputs.packageMutationReceipt.digest, packageVerificationReceiptDigest: inputs.packageVerificationReceipt.digest, planStateDigest: inputs.planState.digest, planStateSourceReceiptDigest: inputs.planStateSourceReceipt.digest, stageAdmissionAttestationDigest: inputs.stageAdmission.digest, stageInstanceDigest: inputs.stageInstance.digest },
    stageId: 'C2B4'
  };
}

function buildReconciliation(inputs, acceptance, contract) {
  const contours = inputs.planState.value.contours;
  return {
    activeCurrentEvidence: clone(acceptance),
    externalTerminalAttestation: { required: true, status: 'AWAITING_POST_MERGE_EXTERNAL_C2B4_ATTESTATION' },
    graphReconciliation: [
      { contourId: 'R24C0_SEMANTIC_PACKAGE_CLOSURE', currentCertifiedDisposition: 'DONE_HISTORICAL_PACKAGE_CLOSURE_UNCERTIFIED_CURRENT', historicalHeadSha: contours.R24C0_SEMANTIC_PACKAGE_CLOSURE.headSha, rawState: contours.R24C0_SEMANTIC_PACKAGE_CLOSURE.state },
      { contourId: 'PK0_PACKAGE_CONTENT_TRUST', currentCertifiedDisposition: 'PASS_BOUNDED_CURRENT_REPOSITORY_CONTENT_NO_RELEASE', historicalHeadSha: contours.PK0_PACKAGE_CONTENT_TRUST.headSha, rawState: contours.PK0_PACKAGE_CONTENT_TRUST.state },
      { contourId: 'PK1_RELEASE_SECURITY_PHYSICAL', currentCertifiedDisposition: 'NOT_READY_SEPARATE_PHYSICAL_ENVELOPE_REQUIRED', historicalHeadSha: null, rawState: contours.PK1_RELEASE_SECURITY_PHYSICAL.state },
      { contourId: 'V3_PACKAGE_CLAIM_COMPILER', currentCertifiedDisposition: 'NOT_READY_NO_PROGRAM_OR_RELEASE_PROMOTION', historicalHeadSha: null, rawState: contours.V3_PACKAGE_CLAIM_COMPILER.state }
    ],
    mutationCountReconciliation: {
      aggregationForbidden: true,
      classes: [
        { claimCeiling: 'PACKAGE_AND_PLAN_ORACLE_ONLY', classId: 'SEALED_PACKAGE_AND_PLAN_ORACLE_MUTANTS', killed: 138, survived: 0, total: 138 },
        ...clone(acceptance.mutationClasses)
      ],
      productRepositoryImplementationMutantsClaimedBySealedReceipt: 0
    },
    packageDigestReconciliation: {
      classification: 'HISTORICAL_SEALED_PACKAGE_AND_PLAN_ORACLE_ONLY_NOT_CURRENT_RELEASE',
      manifestDigest: inputs.packageManifest.digest,
      manifestFileCount: inputs.packageManifest.value.fileCount,
      manifestTreeDigest: inputs.packageManifest.value.treeDigest,
      mutationReceiptDigest: inputs.packageMutationReceipt.digest,
      verificationChecks: inputs.packageVerificationReceipt.value.checks,
      verificationReceiptDigest: inputs.packageVerificationReceipt.digest
    },
    productionSnapshot: clone(contract.productionSnapshot),
    programDone: false,
    programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
    schemaVersion: 'YALKEN_R24_C2B4_PACKAGE_RECONCILIATION_V1',
    signals: { ACTIVE_CLAIM_SET_BOUND: true, CURRENT_SOURCE_RECEIPT_BOUND: true, EXTERNAL_TERMINAL_ATTESTATION_VERIFIED: 'REQUIRES_POST_MERGE_EXTERNAL_C2B4_ATTESTATION', GRAPH_PACKAGE_CONTRADICTIONS_CLOSED: true, MUTATION_COUNTS_RECONCILED: true, R24C0_PACKAGE_DIGESTS_RECONCILED: true },
    sourceBindings: clone(contract.sourceBindings),
    sourceEvidenceStampIds: [...SOURCE_EVIDENCE_STAMP_IDS],
    sourceReceiptBinding: { currentPlanStateDigest: inputs.planState.digest, fullNodeDenominator: inputs.planStateSourceReceipt.value.fullDenominator.nodeCount, receiptDigest: inputs.planStateSourceReceipt.digest, receiptMatchesCurrentPlanState: true },
    stageId: 'C2B4'
  };
}

function buildActiveClaimSet(reconciliation) {
  return {
    claims: [
      { claimId: 'SEALED_PACKAGE_AND_PLAN_ORACLE', claimState: 'HISTORICAL_PASS_AT_BOUND_DIGEST', currentReleaseClaim: false },
      { claimId: 'CURRENT_REPOSITORY_PACKAGE_CONTENT_TRUST', claimState: 'PASS_BOUNDED_NO_RELEASE', currentReleaseClaim: false },
      { claimId: 'PACKAGED_RELEASE_SECURITY', claimState: 'NOT_READY', currentReleaseClaim: false },
      { claimId: 'PROGRAM', claimState: 'NEEDS_MORE_EVIDENCE', currentReleaseClaim: false }
    ],
    nonClaims: ['NO_PROGRAM_DONE','NO_PRODUCTION_RELEASE_READY','NO_SIGNING_PASS','NO_NOTARIZATION_PASS','NO_FUSE_PASS','NO_HARDENED_RUNTIME_PASS','NO_RELEASE_PUBLICATION','NO_RUNTIME_NETWORK_ACTIVATION','NO_PRODUCT_RUNTIME_MUTATION','NO_DEPENDENCY_OR_LOCKFILE_MUTATION'],
    programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
    schemaVersion: 'YALKEN_R24_C2B4_ACTIVE_CLAIM_SET_V1',
    sourceReconciliationDigest: sha256(canonicalBytes(reconciliation)),
    stageId: 'C2B4',
    status: 'BOUND_PENDING_EXTERNAL_TERMINAL_ATTESTATION'
  };
}

export function buildArtifacts(inputs = loadInputs(), acceptance = expectedAcceptance()) {
  validateInputs(inputs);
  assert(canonicalBytes(acceptance).equals(canonicalBytes(expectedAcceptance())), 'E_ACCEPTANCE_DRIFT', 'normalized acceptance');
  const contract = buildContract(inputs);
  const reconciliation = buildReconciliation(inputs, acceptance, contract);
  const activeClaimSet = buildActiveClaimSet(reconciliation);
  return { activeClaimSet, contract, reconciliation };
}

function compileResult(artifacts) {
  return { decision: 'C2B4_PACKAGE_GRAPH_DIGEST_MUTATION_AND_ACTIVE_CLAIMS_RECONCILED_PENDING_EXTERNAL_TERMINAL_ATTESTATION', schemaVersion: 'YALKEN_R24_C2B4_PACKAGE_RECONCILIATION_RESULT_V1', signals: clone(artifacts.reconciliation.signals), status: 'CURRENT_HEAD_EVALUATED' };
}

function writeCanonical(repoRoot, relativePath, value) { fs.writeFileSync(path.join(repoRoot, relativePath), canonicalBytes(value)); }
function approvedPaths() { return [PATHS.activeClaimSet, PATHS.contract, PATHS.inventory, PATHS.reconciliation, PATHS.script, PATHS.stageAdmission, PATHS.stageInstance, PATHS.test].sort(lexical); }
function approvalForPath(repoRoot, filePath, rationale) { return { approvedAtUtc: OBSERVED_AT_UTC, approvedBy: `owner-standing-authority:${OWNER_BINDING_DIGEST}`, filePath, rationale, sha256: sha256(fs.readFileSync(path.join(repoRoot, filePath))) }; }
function buildStageApprovals(repoRoot) { const rationale = `C2B4 exact admitted package, graph, digest, mutation-class, current-source, and active-claim reconciliation bound to ${SOURCE_EVIDENCE_STAMP_IDS[0]}; no release, signing, publication, dependency, product truth, or Program DONE promotion.`; return { approvals: approvedPaths().map((filePath) => approvalForPath(repoRoot, filePath, rationale)), version: 'v1.0' }; }
function isOwnApproval(entry) { return entry?.approvedAtUtc === OBSERVED_AT_UTC && typeof entry.rationale === 'string' && entry.rationale.startsWith('C2B4 exact admitted package reconciliation under StageInstance '); }
function buildActiveApprovals(repoRoot) { const current = readJsonBytes(repoRoot, PATHS.activeApprovals).value; assert(Array.isArray(current.approvals) && current.version === 'v1.0', 'E_ACTIVE_APPROVAL_SCHEMA', PATHS.activeApprovals); const paths = [...approvedPaths(), PATHS.approvals].sort(lexical); const superseded = new Set(paths); const base = current.approvals.filter((entry) => !isOwnApproval(entry) && !superseded.has(entry.filePath)); const rationale = `C2B4 exact admitted package reconciliation under StageInstance ${STAGE_INSTANCE_DIGEST}; active claims remain bounded and release promotion is forbidden.`; return { approvals: [...base, ...paths.map((filePath) => approvalForPath(repoRoot, filePath, rationale))], version: current.version }; }

function assertExpectedFile(repoRoot, relativePath, value) { assert(fs.readFileSync(path.join(repoRoot, relativePath)).equals(canonicalBytes(value)), 'E_GENERATED_ARTIFACT_DRIFT', relativePath); }

export function writeArtifacts(repoRoot = process.cwd(), options = {}) {
  assertSourceIdentity(repoRoot);
  const artifacts = buildArtifacts(loadInputs(repoRoot), options.acceptance ?? executeAcceptance(repoRoot));
  writeCanonical(repoRoot, PATHS.contract, artifacts.contract);
  writeCanonical(repoRoot, PATHS.reconciliation, artifacts.reconciliation);
  writeCanonical(repoRoot, PATHS.activeClaimSet, artifacts.activeClaimSet);
  writeCanonical(repoRoot, PATHS.approvals, buildStageApprovals(repoRoot));
  writeCanonical(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  return compileResult(artifacts);
}

export function checkArtifacts(repoRoot = process.cwd(), options = {}) {
  assertSourceIdentity(repoRoot);
  const artifacts = buildArtifacts(loadInputs(repoRoot), options.acceptance ?? executeAcceptance(repoRoot));
  assertExpectedFile(repoRoot, PATHS.contract, artifacts.contract);
  assertExpectedFile(repoRoot, PATHS.reconciliation, artifacts.reconciliation);
  assertExpectedFile(repoRoot, PATHS.activeClaimSet, artifacts.activeClaimSet);
  assertExpectedFile(repoRoot, PATHS.approvals, buildStageApprovals(repoRoot));
  assertExpectedFile(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  return compileResult(artifacts);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    if (process.argv.includes('--write')) process.stdout.write(canonicalBytes(writeArtifacts()));
    else if (process.argv.includes('--check')) process.stdout.write(canonicalBytes(checkArtifacts()));
    else fail('E_USAGE', '--write or --check');
  } catch (error) {
    process.stderr.write(`${canonicalize({ code: error.code ?? 'E_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}
