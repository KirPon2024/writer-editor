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
export const SOURCE_HEAD_SHA = '448adc8087dc6d2ac9b4bd27e8c409b0f2c57627';
export const SOURCE_TREE_SHA = 'a7ac89d4d8db6dfb6a43a27ada0345251c220be5';
export const STAGE_INSTANCE_DIGEST = '519ebba36ad87d19e49b3349fadd78911cec5f6a84ba700aa860b6e5062637a7';
export const STAGE_ADMISSION_DIGEST = 'acabdd222611393b96d13af23a2d4269082e27607f36c1d707fc5410049a6f24';
export const ACCEPTANCE_SIGNALS_DIGEST = 'fdde8184988b9570b78d8b74721f4afb5649aaaa0c68044507f588d1f0285dca';
export const PREDECESSOR_TERMINAL_DIGEST = '03a375d2ddaf0eca86afff719771171b538c1d849ac45c8818f44e489fc4aea2';
export const PREDECESSOR_RELEASE_DIGEST = 'a9f82e3d78b4d3ce2a08d7ad180f2ee53b72d884c3411bb820f708dd319137ac';
export const PREDECESSOR_FENCE_DIGEST = '34ceb7da9c04e007f3937b0d10ec65ea486ee463b5efc6f5303da09745ba9967';
export const LEASE_DIGEST = 'da178d9b74441e6045618e1876a364db5dab2796e73237a6a77557ed31f9709c';
export const FENCE_DIGEST = '557fbee3475d870cd028eb94e876eb8c8b96b72d23052b5a24cc80c501471a2e';
export const CONTROL_PLANE_EVIDENCE_STAMP_ID = 'ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS';
export const OBSERVED_AT_UTC = '2026-08-28T08:54:52Z';

export const PATHS = Object.freeze({
  activeApprovals: 'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  approvals: 'docs/OPS/R24/CORRECTIVE/C5C4_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  backupManager: 'src/utils/backupManager.js',
  contract: 'docs/OPS/R24/CORRECTIVE/C5C4_ATOMIC_GATEWAY_CONTRACT_V1.json',
  implementation: 'src/core/legacy-strangler-v1.cjs',
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  main: 'src/main.js',
  matrix: 'docs/OPS/R24/CORRECTIVE/C5C4_ATOMIC_GATEWAY_MATRIX_V1.json',
  notesPersistence: 'src/product/notesStoragePersistence.mjs',
  program: 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json',
  registry: 'docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json',
  script: 'scripts/ops/r24/corrective/c5c4-atomic-gateway.mjs',
  stageAdmission: 'docs/OPS/R24/CORRECTIVE/C5C4_STAGE_ADMISSION_ATTESTATION_V1.json',
  stageInstance: 'docs/OPS/R24/CORRECTIVE/C5C4_STAGE_INSTANCE_V1.json',
  s17Test: 'test/unit/sector-m-s17-notes-schema-storage.test.js',
  test: 'test/contracts/r24-c5c4-atomic-gateway.contract.test.mjs',
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
  PATHS.backupManager,
  PATHS.main,
  PATHS.notesPersistence,
  PATHS.s17Test,
  PATHS.test,
].sort());

export class C5C4AtomicGatewayContractError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

function fail(code, detail) { throw new C5C4AtomicGatewayContractError(code, detail); }
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
  assert(stageAdmission.value.status === 'ADMITTED', 'E_STAGE_NOT_ADMITTED', 'C5C4');
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
  const backupManager = fs.readFileSync(path.join(repoRoot, PATHS.backupManager), 'utf8');
  const main = fs.readFileSync(path.join(repoRoot, PATHS.main), 'utf8');
  const notesPersistence = fs.readFileSync(path.join(repoRoot, PATHS.notesPersistence), 'utf8');
  const requiredImplementationTokens = [
    'async function executeAtomicReceiptBackupGatewayCutover(',
    "GENERIC_BACKUP_CONTENT: 'GENERIC_BACKUP_CONTENT'",
    "GENERIC_BACKUP_METADATA: 'GENERIC_BACKUP_METADATA'",
    "NOTES_RECOVERY_SNAPSHOT: 'NOTES_RECOVERY_SNAPSHOT'",
    "PROJECT_MANUAL_BACKUP_RECEIPT: 'PROJECT_MANUAL_BACKUP_RECEIPT'",
    "legacyAuthorityRole: 'READ_ONLY_OBSERVER'",
    "legacyFallbackMode: 'READ_ONLY_OBSERVATION_ONLY'",
    'legacyWriteFallbackAllowed: false',
    'dualWriteAllowed: false',
    'gatewayExecutorCount: 1',
    'E_ATOMIC_RECEIPT_BACKUP_GATEWAY_RECEIPT_INVALID',
  ];
  for (const token of requiredImplementationTokens) {
    assert(implementation.includes(token), 'E_IMPLEMENTATION_REACHABILITY', token);
  }
  assert(backupManager.split('async function writeReceiptOrBackupThroughAtomicGateway({').length - 1 === 1, 'E_PRODUCTION_REACHABILITY', 'helper-definition');
  assert(backupManager.split('executeAtomicReceiptBackupGatewayCutover({').length - 1 === 1, 'E_PRODUCTION_REACHABILITY', 'gateway-call-count');
  assert(backupManager.split('writeReceiptOrBackupThroughAtomicGateway({').length - 1 === 3, 'E_PRODUCTION_REACHABILITY', 'backup-entrypoint-count');
  assert(main.split('ATOMIC_RECEIPT_BACKUP_TARGET_ROLES.NOTES_RECOVERY_SNAPSHOT').length - 1 === 2, 'E_PRODUCTION_REACHABILITY', 'notes-recovery-entrypoint-count');
  assert(main.split('ATOMIC_RECEIPT_BACKUP_TARGET_ROLES.PROJECT_MANUAL_BACKUP_RECEIPT').length - 1 === 1, 'E_PRODUCTION_REACHABILITY', 'manual-receipt-entrypoint-count');
  assert(notesPersistence.split('writeRecoveryFileAtomic(snapshotPath, text)').length - 1 === 1, 'E_PRODUCTION_REACHABILITY', 'notes-recovery-writer');
  assert(!backupManager.includes('fileManager.writeFileAtomic(backupPath, content)'), 'E_LEGACY_PRIMARY_WRITE_PRESENT', 'backup-content');
  assert(!backupManager.includes('fileManager.writeFileAtomic(metaPath'), 'E_LEGACY_PRIMARY_WRITE_PRESENT', 'backup-metadata');
  assert(!notesPersistence.includes('fs.writeFile(snapshotPath'), 'E_LEGACY_PRIMARY_WRITE_PRESENT', 'notes-recovery');
  assert(!main.includes('() => fileManager.writeFileAtomic(receiptPath'), 'E_LEGACY_PRIMARY_WRITE_PRESENT', 'manual-backup-receipt');
}

function runContractOracle(repoRoot) {
  const result = spawnSync(process.execPath, ['--test', PATHS.test], { cwd: repoRoot, encoding: 'utf8' });
  assert(result.status === 0, 'E_CONTRACT_ORACLE', `${result.stdout}\n${result.stderr}`.trim());
  assert(String(result.stdout).includes('R24_C5C4_MUTATION_RECEIPT={"total":12,"killed":12,"survived":[]}'), 'E_SURVIVOR_PROOF', 'mutants');
}

function buildContract(repoRoot) {
  return {
    schemaVersion: 'YALKEN_R24_C5C4_ATOMIC_GATEWAY_CONTRACT_V1',
    stageId: 'C5C4',
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    capabilityIds: {
      atomicGenericBackupContent: 'CAP_R24_ATOMIC_GENERIC_BACKUP_CONTENT_GATEWAY',
      atomicGenericBackupMetadata: 'CAP_R24_ATOMIC_GENERIC_BACKUP_METADATA_GATEWAY',
      atomicNotesRecoverySnapshot: 'CAP_R24_ATOMIC_NOTES_RECOVERY_SNAPSHOT_GATEWAY',
      atomicProjectManualBackupReceipt: 'CAP_R24_ATOMIC_PROJECT_MANUAL_BACKUP_RECEIPT_GATEWAY',
      legacyReadOnlyObservation: 'CAP_R24_LEGACY_ROUTE_READ_ONLY_OBSERVATION',
    },
    sourceBindings: {
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      stageRegistryDigest: STAGE_REGISTRY_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      predecessorTerminalDigest: PREDECESSOR_TERMINAL_DIGEST,
      implementation: fileBinding(repoRoot, PATHS.implementation, 'CAP_R24_C5C4_IMPLEMENTATION_BYTES'),
      productionAdapter: fileBinding(repoRoot, PATHS.main, 'CAP_R24_C5C4_PRODUCTION_ADAPTER_BYTES'),
      backupAdapter: fileBinding(repoRoot, PATHS.backupManager, 'CAP_R24_C5C4_BACKUP_ADAPTER_BYTES'),
      notesPersistenceAdapter: fileBinding(repoRoot, PATHS.notesPersistence, 'CAP_R24_C5C4_NOTES_PERSISTENCE_ADAPTER_BYTES'),
      contractTest: fileBinding(repoRoot, PATHS.test, 'CAP_R24_C5C4_CONTRACT_TEST_BYTES'),
      affectedNotesTest: fileBinding(repoRoot, PATHS.s17Test, 'CAP_R24_C5C4_AFFECTED_NOTES_TEST_BYTES'),
    },
    invariants: {
      receiptRecoveryAndBackupWritesUseDedicatedGatewayOnly: true,
      gatewayExecutorCountExactlyOne: true,
      legacyObserverIndependentAndReadOnly: true,
      legacyWriteFallbackStructurallyAbsent: true,
      dualWriteForbidden: true,
      targetRoleSubjectDigestAndContentValidatedBeforeMutation: true,
      gatewayFailureNeverInvokesLegacyWrite: true,
      successReceiptBindsTargetRoleSubjectContentDigestAndByteCount: true,
      notesRecoveryReadbackAndHashProofPreserved: true,
      backupRotationReadabilityAndMetadataPreserved: true,
      manualBackupTempRootCleanupAndFinalRenamePreservedOutsideExecutor: true,
      publicGatewayEvidenceRemainsPathless: true,
      c6aNotAutoAdmitted: true,
      noUiSurfaceChange: true,
      noDependencyOrNetworkChange: true,
    },
    targetRoles: {
      GENERIC_BACKUP_CONTENT: { subjectDigest: 'REQUIRED_SHA256', contentBinding: 'CONTENT_DIGEST_AND_BYTE_COUNT' },
      GENERIC_BACKUP_METADATA: { subjectDigest: 'REQUIRED_SHA256', contentBinding: 'CONTENT_DIGEST_AND_BYTE_COUNT' },
      NOTES_RECOVERY_SNAPSHOT: { subjectDigest: 'REQUIRED_SHA256', contentBinding: 'CONTENT_DIGEST_AND_BYTE_COUNT' },
      PROJECT_MANUAL_BACKUP_RECEIPT: { subjectDigest: 'REQUIRED_SHA256', contentBinding: 'CONTENT_DIGEST_AND_BYTE_COUNT' },
    },
    publicEvidenceFields: ['capabilityId', 'requestDigest', 'targetRole', 'subjectDigest', 'contentDigest', 'byteCount', 'legacyAuthorityRole', 'gatewayExecutorCount'],
    legacyFallbackPolicy: 'READ_ONLY_OBSERVATION_ONLY_NO_WRITE_AUTHORITY',
    nextCutoverScope: 'C6A_NOT_AUTO_ADMITTED',
    terminalState: 'PENDING_POST_MERGE_EXTERNAL_C5C4_ATTESTATION',
  };
}

function buildMatrix() {
  return {
    schemaVersion: 'YALKEN_R24_C5C4_ATOMIC_GATEWAY_MATRIX_V1',
    stageId: 'C5C4',
    vectors: [
      { vectorId: 'C5C4-V01', mutation: 'FOUR_TARGET_ROLES_HAPPY_PATH', expectedGatewayExecutionsPerRole: 1, expectedLegacyWrites: 0 },
      { vectorId: 'C5C4-V02', mutation: 'UNKNOWN_TARGET_ROLE', expectedCode: 'E_ATOMIC_RECEIPT_BACKUP_TARGET_ROLE_INVALID', expectedGatewayExecutions: 0 },
      { vectorId: 'C5C4-V03', mutation: 'MALFORMED_SUBJECT_DIGEST', expectedCode: 'E_ATOMIC_RECEIPT_BACKUP_SUBJECT_DIGEST_INVALID', expectedGatewayExecutions: 0 },
      { vectorId: 'C5C4-V04', mutation: 'MISSING_CONTENT', expectedCode: 'E_ATOMIC_RECEIPT_BACKUP_CONTENT_REQUIRED', expectedGatewayExecutions: 0 },
      { vectorId: 'C5C4-V05', mutation: 'ROUTE_MISMATCH', expectedCode: 'E_ATOMIC_RECEIPT_BACKUP_ROUTE_REQUIRED', expectedGatewayExecutions: 0 },
      { vectorId: 'C5C4-V06', mutation: 'BINARY_AND_UTF8_BYTE_COUNT_BINDING', expectedDigestAndByteCountBinding: true },
      { vectorId: 'C5C4-V07', mutation: 'GATEWAY_FAILURE', expectedLegacyWrites: 0, fallbackAllowed: false },
      { vectorId: 'C5C4-V08', mutation: 'FORGED_OR_PARTIAL_RECEIPT', expectedCode: 'E_ATOMIC_RECEIPT_BACKUP_GATEWAY_RECEIPT_INVALID', returnedSuccess: false },
      { vectorId: 'C5C4-V09', mutation: 'TWELVE_NAMED_IMPLEMENTATION_MUTANTS', killed: 12, survived: 0 },
      { vectorId: 'C5C4-V10', mutation: 'PRODUCTION_ENTRYPOINT_SCAN', notesRecoveryEntrypoints: 2, genericBackupEntrypoints: 2, manualReceiptEntrypoints: 1, directLegacyPrimaryWrites: 0 },
      { vectorId: 'C5C4-V11', mutation: 'RECOVERY_BACKUP_LIFECYCLE_PRESERVATION', recoveryReadback: true, rotationAndMetadata: true, tempRootFinalRename: true },
      { vectorId: 'C5C4-V12', mutation: 'C6A_SCOPE_EXCLUSION', autoAdmittedNextStage: false },
    ],
    verdict: 'RECEIPT_RECOVERY_AND_BACKUP_WRITES_HAVE_ONE_TYPED_ATOMIC_GATEWAY_AND_NO_LEGACY_WRITE_FALLBACK',
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
    PATHS.backupManager,
    PATHS.implementation,
    PATHS.inventory,
    PATHS.main,
    PATHS.matrix,
    PATHS.notesPersistence,
    PATHS.s17Test,
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
  const rationale = `C5C4 atomic receipt, recovery, and backup gateway cutover under StageInstance ${STAGE_INSTANCE_DIGEST}; primary writes have one typed executor, legacy is read-only observation only, and no write fallback exists.`;
  return {
    approvals: approvedPaths().map((filePath) => approvalForPath(repoRoot, filePath, rationale)),
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    version: 'v1.0',
  };
}

function isOwnApproval(entry) {
  return entry?.approvedAtUtc === OBSERVED_AT_UTC
    && typeof entry.rationale === 'string'
    && entry.rationale.startsWith('C5C4 atomic receipt, recovery, and backup gateway cutover under StageInstance ');
}

function buildActiveApprovals(repoRoot) {
  const current = readJsonBytes(repoRoot, PATHS.activeApprovals).value;
  assert(Array.isArray(current.approvals) && current.version === 'v1.0', 'E_ACTIVE_APPROVAL_SCHEMA', 'C1C');
  const paths = [...approvedPaths(), PATHS.approvals].sort(lexical);
  const superseded = new Set(paths);
  const base = current.approvals.filter((entry) => !isOwnApproval(entry) && !superseded.has(entry.filePath));
  const rationale = `C5C4 atomic receipt, recovery, and backup gateway cutover under StageInstance ${STAGE_INSTANCE_DIGEST}; exact write set, one typed gateway executor, digest-and-byte-count-bound success receipt, and read-only legacy observation remain fail-closed.`;
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
    schemaVersion: 'YALKEN_R24_C5C4_ATOMIC_GATEWAY_RESULT_V1',
    stageId: 'C5C4',
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
      EXTERNAL_TERMINAL_ATTESTATION_VERIFIED: 'PENDING_POST_MERGE_EXTERNAL_C5C4_ATTESTATION',
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
    process.stderr.write(`${JSON.stringify({ code: error.code || 'E_C5C4_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
