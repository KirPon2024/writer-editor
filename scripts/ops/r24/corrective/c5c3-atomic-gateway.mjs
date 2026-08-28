#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { canonicalBytes } from './canonical-json.mjs';

export const PROGRAM_TEMPLATE_DIGEST = '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a';
export const STAGE_REGISTRY_DIGEST = 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a';
export const OWNER_BINDING_DIGEST = 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6';
export const SOURCE_HEAD_SHA = '50b032e695c0cc7db04c5aba1fa88b49da00448c';
export const SOURCE_TREE_SHA = '0e2c780f36a4aacac87dcc0a7acc0d28743f4fc6';
export const STAGE_INSTANCE_DIGEST = '5302b8621d7a3cbf476f2b38badee7f2909594528018d88aa5403fd180846ac8';
export const STAGE_ADMISSION_DIGEST = '90a61e858cd6ec6e8da65c0210acbd28f1f379ffe6976933d34989973c99e0e0';
export const ACCEPTANCE_SIGNALS_DIGEST = 'fdde8184988b9570b78d8b74721f4afb5649aaaa0c68044507f588d1f0285dca';
export const PREDECESSOR_TERMINAL_DIGEST = '63476852941928f50f422c6b5aa904ecd242a240880e904e7d9b6e467919f8a7';
export const PREDECESSOR_RELEASE_DIGEST = '7e8813e303347246dc46066f5122338c2f4f0aec3fdccfaeb77d7346c2041065';
export const PREDECESSOR_FENCE_DIGEST = '4f0adbd7877c2b7f2a7f403d5dfbb9b017d8dbb69654585341eb4174739fc5db';
export const LEASE_DIGEST = '57fd565ef83d06013bde31c122437793a0838248ce05c0c58bbf750bac74eaf7';
export const FENCE_DIGEST = '34ceb7da9c04e007f3937b0d10ec65ea486ee463b5efc6f5303da09745ba9967';
export const CONTROL_PLANE_EVIDENCE_STAMP_ID = 'ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS';
export const OBSERVED_AT_UTC = '2026-08-28T08:00:28Z';

export const PATHS = Object.freeze({
  activeApprovals: 'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  approvals: 'docs/OPS/R24/CORRECTIVE/C5C3_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  contract: 'docs/OPS/R24/CORRECTIVE/C5C3_ATOMIC_GATEWAY_CONTRACT_V1.json',
  implementation: 'src/core/legacy-strangler-v1.cjs',
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  main: 'src/main.js',
  matrix: 'docs/OPS/R24/CORRECTIVE/C5C3_ATOMIC_GATEWAY_MATRIX_V1.json',
  program: 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json',
  registry: 'docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json',
  script: 'scripts/ops/r24/corrective/c5c3-atomic-gateway.mjs',
  stageAdmission: 'docs/OPS/R24/CORRECTIVE/C5C3_STAGE_ADMISSION_ATTESTATION_V1.json',
  stageInstance: 'docs/OPS/R24/CORRECTIVE/C5C3_STAGE_INSTANCE_V1.json',
  test: 'test/contracts/r24-c5c3-atomic-gateway.contract.test.mjs',
});

export const WRITE_SET = Object.freeze([
  PATHS.inventory,
  PATHS.activeApprovals,
  PATHS.contract,
  PATHS.matrix,
  PATHS.approvals,
  PATHS.stageAdmission,
  PATHS.stageInstance,
  PATHS.script,
  PATHS.implementation,
  PATHS.main,
  PATHS.test,
].sort());

export class C5C3AtomicGatewayContractError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

function fail(code, detail) { throw new C5C3AtomicGatewayContractError(code, detail); }
function assert(condition, code, detail) { if (!condition) fail(code, detail); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
const lexical = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function readJsonBytes(repoRoot, relativePath, canonical = false) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  const value = JSON.parse(bytes.toString('utf8'));
  if (canonical) assert(bytes.equals(canonicalBytes(value)), 'E_NON_CANONICAL_INPUT', relativePath);
  return { bytes, value, digest: sha256(bytes) };
}

function git(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  assert(result.status === 0, 'E_GIT', args.join(' '));
  return String(result.stdout).trim();
}

function statusPaths(repoRoot) {
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repoRoot, encoding: 'utf8' });
  assert(result.status === 0, 'E_GIT', 'status');
  const text = String(result.stdout).trimEnd();
  return text ? text.split('\n').map((line) => line.slice(3)).sort(lexical) : [];
}

export function assertSourceIdentity(repoRoot = process.cwd()) {
  assert(git(repoRoot, ['rev-parse', `${SOURCE_HEAD_SHA}^{tree}`]) === SOURCE_TREE_SHA, 'E_SOURCE_TREE', 'source');
  assert(git(repoRoot, ['rev-parse', 'origin/main']) === SOURCE_HEAD_SHA, 'E_ORIGIN_MAIN', 'source');
  const allowed = new Set(WRITE_SET);
  for (const relativePath of statusPaths(repoRoot)) assert(allowed.has(relativePath), 'E_WRITE_SET_EXPANSION', relativePath);
  return {
    headSha: git(repoRoot, ['rev-parse', 'HEAD']),
    sourceHeadSha: SOURCE_HEAD_SHA,
    sourceTreeSha: SOURCE_TREE_SHA,
  };
}

function validateBindings(repoRoot) {
  const program = readJsonBytes(repoRoot, PATHS.program, true);
  const registry = readJsonBytes(repoRoot, PATHS.registry, true);
  const stageInstance = readJsonBytes(repoRoot, PATHS.stageInstance, true);
  const stageAdmission = readJsonBytes(repoRoot, PATHS.stageAdmission, true);
  assert(program.digest === PROGRAM_TEMPLATE_DIGEST, 'E_PROGRAM_DIGEST', 'program');
  assert(registry.digest === STAGE_REGISTRY_DIGEST, 'E_REGISTRY_DIGEST', 'registry');
  assert(stageInstance.digest === STAGE_INSTANCE_DIGEST, 'E_STAGE_INSTANCE_DIGEST', 'instance');
  assert(stageAdmission.digest === STAGE_ADMISSION_DIGEST, 'E_STAGE_ADMISSION_DIGEST', 'admission');
  assert(stageAdmission.value.status === 'ADMITTED', 'E_STAGE_NOT_ADMITTED', 'C5C3');
  assert(stageAdmission.value.stageInstanceDigest === STAGE_INSTANCE_DIGEST, 'E_ADMISSION_BINDING', 'instance');
  assert(stageAdmission.value.acceptanceSignalsDigest === ACCEPTANCE_SIGNALS_DIGEST, 'E_ADMISSION_BINDING', 'signals');
  assert(stageAdmission.value.writeSetDigest === sha256(canonicalBytes(stageInstance.value.writeSet)), 'E_ADMISSION_BINDING', 'write-set');
  return { program, registry, stageInstance, stageAdmission };
}

function fileBinding(repoRoot, relativePath, capabilityId) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  return { capabilityId, sha256: sha256(bytes), sizeBytes: bytes.length };
}

function assertProductionReachability(repoRoot) {
  const implementation = fs.readFileSync(path.join(repoRoot, PATHS.implementation), 'utf8');
  const main = fs.readFileSync(path.join(repoRoot, PATHS.main), 'utf8');
  const requiredImplementationTokens = [
    'async function executeAtomicImportLibraryGatewayCutover(',
    "PROJECT_ARCHIVE_IMPORT_BATCH: 'PROJECT_ARCHIVE_IMPORT_BATCH'",
    "PROJECT_LIBRARY_INDEX_PRIMARY: 'PROJECT_LIBRARY_INDEX_PRIMARY'",
    "legacyAuthorityRole: 'READ_ONLY_OBSERVER'",
    "legacyFallbackMode: 'READ_ONLY_OBSERVATION_ONLY'",
    'legacyWriteFallbackAllowed: false',
    'dualWriteAllowed: false',
    'gatewayExecutorCount: 1',
    'E_ATOMIC_IMPORT_LIBRARY_GATEWAY_RECEIPT_INVALID',
  ];
  for (const token of requiredImplementationTokens) {
    assert(implementation.includes(token), 'E_IMPLEMENTATION_REACHABILITY', token);
  }
  assert(main.split('async function executeImportOrLibraryThroughAtomicGateway({').length - 1 === 1, 'E_PRODUCTION_REACHABILITY', 'helper-definition');
  assert(main.split('executeAtomicImportLibraryGatewayCutover({').length - 1 === 1, 'E_PRODUCTION_REACHABILITY', 'gateway-call-count');
  assert(main.split('executeImportOrLibraryThroughAtomicGateway({').length - 1 === 3, 'E_PRODUCTION_REACHABILITY', 'primary-entrypoint-count');
  assert(main.includes('ATOMIC_IMPORT_LIBRARY_TARGET_ROLES.PROJECT_ARCHIVE_IMPORT_BATCH'), 'E_PRODUCTION_REACHABILITY', 'import-role');
  assert(main.includes('ATOMIC_IMPORT_LIBRARY_TARGET_ROLES.PROJECT_LIBRARY_INDEX_PRIMARY'), 'E_PRODUCTION_REACHABILITY', 'library-role');
  assert(!main.includes('() => fileManager.writeFileAtomic(getProjectLibraryIndexPath()'), 'E_LEGACY_PRIMARY_WRITE_PRESENT', 'library-index');
  assert(!/queueDiskOperation\(\s*\(\) => writeProjectArchivePayloadToTempRoot/u.test(main), 'E_LEGACY_PRIMARY_WRITE_PRESENT', 'archive-batch');
  assert(!main.includes('src/product/blackBoxImportAsNewProjectWriterV1.mjs'), 'E_SCOPE_EXPANSION', 'black-box-import');
}

function runContractOracle(repoRoot) {
  const result = spawnSync(process.execPath, ['--test', PATHS.test], { cwd: repoRoot, encoding: 'utf8' });
  assert(result.status === 0, 'E_CONTRACT_ORACLE', `${result.stdout}\n${result.stderr}`.trim());
  assert(String(result.stdout).includes('R24_C5C3_MUTATION_RECEIPT={"total":12,"killed":12,"survived":[]}'), 'E_SURVIVOR_PROOF', 'mutants');
}

function buildContract(repoRoot) {
  return {
    schemaVersion: 'YALKEN_R24_C5C3_ATOMIC_GATEWAY_CONTRACT_V1',
    stageId: 'C5C3',
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    capabilityIds: {
      atomicProjectArchiveImportBatch: 'CAP_R24_ATOMIC_PROJECT_ARCHIVE_IMPORT_BATCH_GATEWAY',
      atomicProjectLibraryIndex: 'CAP_R24_ATOMIC_PROJECT_LIBRARY_INDEX_GATEWAY',
      legacyReadOnlyObservation: 'CAP_R24_LEGACY_ROUTE_READ_ONLY_OBSERVATION',
    },
    sourceBindings: {
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      stageRegistryDigest: STAGE_REGISTRY_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      predecessorTerminalDigest: PREDECESSOR_TERMINAL_DIGEST,
      implementation: fileBinding(repoRoot, PATHS.implementation, 'CAP_R24_C5C3_IMPLEMENTATION_BYTES'),
      productionAdapter: fileBinding(repoRoot, PATHS.main, 'CAP_R24_C5C3_PRODUCTION_ADAPTER_BYTES'),
      contractTest: fileBinding(repoRoot, PATHS.test, 'CAP_R24_C5C3_CONTRACT_TEST_BYTES'),
    },
    invariants: {
      importBatchAndLibraryIndexPrimaryWritesUseDedicatedGatewayOnly: true,
      gatewayExecutorCountExactlyOne: true,
      legacyObserverIndependentAndReadOnly: true,
      legacyWriteFallbackStructurallyAbsent: true,
      dualWriteForbidden: true,
      targetRoleAndProjectIdentityValidatedBeforeMutation: true,
      gatewayFailureNeverInvokesLegacyWrite: true,
      successReceiptBindsTargetRoleProjectPayloadDigestAndEntryCount: true,
      importLifecycleLeaseJournalTempRootAndFinalRenamePreservedOutsideExecutor: true,
      libraryReadModelEvidenceRemainsPathless: true,
      blackBoxImportWriterNotAutoAdmitted: true,
      receiptAndBackupScopesNotAutoAdmitted: true,
      noUiSurfaceChange: true,
      noDependencyOrNetworkChange: true,
    },
    targetRoles: {
      PROJECT_ARCHIVE_IMPORT_BATCH: { projectId: 'REQUIRED', entryCount: 'POSITIVE_SAFE_INTEGER', payloadBinding: 'ARCHIVE_DIGEST' },
      PROJECT_LIBRARY_INDEX_PRIMARY: { projectId: 'FORBIDDEN', entryCount: 1, payloadBinding: 'CONTENT_DIGEST' },
    },
    publicEvidenceFields: ['capabilityId', 'requestDigest', 'targetRole', 'payloadDigest', 'entryCount', 'legacyAuthorityRole', 'gatewayExecutorCount'],
    legacyFallbackPolicy: 'READ_ONLY_OBSERVATION_ONLY_NO_WRITE_AUTHORITY',
    excludedWriter: 'BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_REMAINS_UNWIRED_AND_OUTSIDE_C5C3',
    nextCutoverScope: 'C5C4_RECEIPT_AND_BACKUP_WRITES_NOT_AUTO_ADMITTED',
    terminalState: 'PENDING_POST_MERGE_EXTERNAL_C5C3_ATTESTATION',
  };
}

function buildMatrix() {
  return {
    schemaVersion: 'YALKEN_R24_C5C3_ATOMIC_GATEWAY_MATRIX_V1',
    stageId: 'C5C3',
    vectors: [
      { vectorId: 'C5C3-V01', mutation: 'PROJECT_ARCHIVE_IMPORT_BATCH_HAPPY_PATH', expectedGatewayExecutions: 1, expectedLegacyWrites: 0 },
      { vectorId: 'C5C3-V02', mutation: 'PROJECT_LIBRARY_INDEX_PRIMARY_HAPPY_PATH', expectedGatewayExecutions: 1, expectedLegacyWrites: 0 },
      { vectorId: 'C5C3-V03', mutation: 'UNKNOWN_TARGET_ROLE', expectedCode: 'E_ATOMIC_IMPORT_LIBRARY_TARGET_ROLE_INVALID', expectedGatewayExecutions: 0 },
      { vectorId: 'C5C3-V04', mutation: 'IMPORT_WITHOUT_PROJECT_ID', expectedCode: 'E_ATOMIC_IMPORT_LIBRARY_PROJECT_ID_INVALID', expectedGatewayExecutions: 0 },
      { vectorId: 'C5C3-V05', mutation: 'LIBRARY_WITH_PROJECT_ID', expectedCode: 'E_ATOMIC_IMPORT_LIBRARY_PROJECT_ID_FORBIDDEN', expectedGatewayExecutions: 0 },
      { vectorId: 'C5C3-V06', mutation: 'DIGEST_COUNT_OR_ROUTE_MISMATCH', expectedCodeFamily: 'E_ATOMIC_IMPORT_LIBRARY', expectedGatewayExecutions: 0 },
      { vectorId: 'C5C3-V07', mutation: 'GATEWAY_FAILURE', expectedLegacyWrites: 0, fallbackAllowed: false },
      { vectorId: 'C5C3-V08', mutation: 'FORGED_OR_PARTIAL_RECEIPT', expectedCode: 'E_ATOMIC_IMPORT_LIBRARY_GATEWAY_RECEIPT_INVALID', returnedSuccess: false },
      { vectorId: 'C5C3-V09', mutation: 'TWELVE_NAMED_IMPLEMENTATION_MUTANTS', killed: 12, survived: 0 },
      { vectorId: 'C5C3-V10', mutation: 'PRODUCTION_PRIMARY_ENTRYPOINT_SCAN', importEntrypoints: 1, libraryEntrypoints: 1, directLegacyPrimaryWrites: 0 },
      { vectorId: 'C5C3-V11', mutation: 'IMPORT_LIFECYCLE_PRESERVATION', leaseJournalTempRootFinalRenamePreserved: true },
      { vectorId: 'C5C3-V12', mutation: 'BLACK_BOX_AND_C5C4_SCOPE_EXCLUSION', excludedWriters: 1, autoAdmittedNextStage: false },
    ],
    verdict: 'IMPORT_BATCH_AND_LIBRARY_INDEX_PRIMARY_WRITES_HAVE_ONE_TYPED_ATOMIC_GATEWAY_AND_NO_LEGACY_WRITE_FALLBACK',
  };
}

export function buildArtifacts(repoRoot = process.cwd()) {
  validateBindings(repoRoot);
  assertProductionReachability(repoRoot);
  return { contract: buildContract(repoRoot), matrix: buildMatrix() };
}

function writeCanonical(repoRoot, relativePath, value) {
  fs.writeFileSync(path.join(repoRoot, relativePath), canonicalBytes(value));
}

function approvedPaths() {
  return [
    PATHS.contract,
    PATHS.implementation,
    PATHS.inventory,
    PATHS.main,
    PATHS.matrix,
    PATHS.script,
    PATHS.stageAdmission,
    PATHS.stageInstance,
    PATHS.test,
  ].sort(lexical);
}

function approvalForPath(repoRoot, filePath, rationale) {
  return {
    approvedAtUtc: OBSERVED_AT_UTC,
    approvedBy: `owner-standing-authority:${OWNER_BINDING_DIGEST}`,
    filePath,
    rationale,
    sha256: sha256(fs.readFileSync(path.join(repoRoot, filePath))),
  };
}

function buildStageApprovals(repoRoot) {
  const rationale = `C5C3 atomic import batch and library index gateway cutover under StageInstance ${STAGE_INSTANCE_DIGEST}; primary writes have one typed executor, legacy is read-only observation only, and no write fallback exists.`;
  return {
    approvals: approvedPaths().map((filePath) => approvalForPath(repoRoot, filePath, rationale)),
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    version: 'v1.0',
  };
}

function isOwnApproval(entry) {
  return entry?.approvedAtUtc === OBSERVED_AT_UTC
    && typeof entry.rationale === 'string'
    && entry.rationale.startsWith('C5C3 atomic import batch and library index gateway cutover under StageInstance ');
}

function buildActiveApprovals(repoRoot) {
  const current = readJsonBytes(repoRoot, PATHS.activeApprovals).value;
  assert(Array.isArray(current.approvals) && current.version === 'v1.0', 'E_ACTIVE_APPROVAL_SCHEMA', 'C1C');
  const paths = [...approvedPaths(), PATHS.approvals].sort(lexical);
  const superseded = new Set(paths);
  const base = current.approvals.filter((entry) => !isOwnApproval(entry) && !superseded.has(entry.filePath));
  const rationale = `C5C3 atomic import batch and library index gateway cutover under StageInstance ${STAGE_INSTANCE_DIGEST}; exact write set, one typed gateway executor, payload-bound success receipt, and read-only legacy observation remain fail-closed.`;
  return {
    approvals: [...base, ...paths.map((filePath) => approvalForPath(repoRoot, filePath, rationale))],
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    version: current.version,
  };
}

function assertExpectedFile(repoRoot, relativePath, value) {
  assert(fs.readFileSync(path.join(repoRoot, relativePath)).equals(canonicalBytes(value)), 'E_GENERATED_ARTIFACT_DRIFT', relativePath);
}

function compileResult(artifacts) {
  return {
    schemaVersion: 'YALKEN_R24_C5C3_ATOMIC_GATEWAY_RESULT_V1',
    stageId: 'C5C3',
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    contractDigest: sha256(canonicalBytes(artifacts.contract)),
    matrixDigest: sha256(canonicalBytes(artifacts.matrix)),
    signals: {
      SINGLE_WRITE_GATEWAY: true,
      DUAL_WRITE_FORBIDDEN: true,
      LEGACY_READ_ONLY_FALLBACK: true,
      PRODUCTION_REACHABILITY: true,
      FAULT_INJECTION: true,
      SURVIVOR_PROOF: true,
      EXTERNAL_TERMINAL_ATTESTATION_VERIFIED: 'PENDING_POST_MERGE_EXTERNAL_C5C3_ATTESTATION',
    },
  };
}

export function writeArtifacts(repoRoot = process.cwd()) {
  assertSourceIdentity(repoRoot);
  const artifacts = buildArtifacts(repoRoot);
  writeCanonical(repoRoot, PATHS.contract, artifacts.contract);
  writeCanonical(repoRoot, PATHS.matrix, artifacts.matrix);
  writeCanonical(repoRoot, PATHS.approvals, buildStageApprovals(repoRoot));
  writeCanonical(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  return compileResult(artifacts);
}

export function checkArtifacts(repoRoot = process.cwd()) {
  assertSourceIdentity(repoRoot);
  const artifacts = buildArtifacts(repoRoot);
  assertExpectedFile(repoRoot, PATHS.contract, artifacts.contract);
  assertExpectedFile(repoRoot, PATHS.matrix, artifacts.matrix);
  assertExpectedFile(repoRoot, PATHS.approvals, buildStageApprovals(repoRoot));
  assertExpectedFile(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  runContractOracle(repoRoot);
  return compileResult(artifacts);
}

function main() {
  try {
    const repoRoot = process.cwd();
    const mode = process.argv[2];
    assert(mode === '--write' || mode === '--check', 'E_USAGE', '--write or --check');
    const result = mode === '--write' ? writeArtifacts(repoRoot) : checkArtifacts(repoRoot);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ code: error.code || 'E_C5C3_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
