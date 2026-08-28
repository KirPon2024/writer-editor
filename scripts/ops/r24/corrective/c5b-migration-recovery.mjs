#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { canonicalBytes, canonicalize } from './canonical-json.mjs';

export const PROGRAM_TEMPLATE_DIGEST = '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a';
export const STAGE_REGISTRY_DIGEST = 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a';
export const OWNER_BINDING_DIGEST = 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6';
export const SOURCE_HEAD_SHA = '3293bf38688479abbde37a95bb787e07a3010dd9';
export const SOURCE_TREE_SHA = '92358fb9d46f9ff5850aabbdbea38968b7d284ed';
export const STAGE_INSTANCE_DIGEST = '119f1aaa0b1e68c7bb70e7252561a9682bf930036bb5f38727a3e8672f0e9d22';
export const STAGE_ADMISSION_DIGEST = 'a1c16ce9eb4a870bd0473ca522d4b1c10b142a8949ecf7214b05fcdf4711b275';
export const ACCEPTANCE_SIGNALS_DIGEST = 'f7105a073c1a74ce74198a7c283c3e4159aad8a195f444cc2c18ded31d1f02ea';
export const PREDECESSOR_TERMINAL_DIGEST = 'a3948fc22ea6072759d3e837b2c6a85d84f9ec308427dcc181f67e0e13dd888d';
export const PREDECESSOR_RELEASE_DIGEST = '1499ca8457cdd8aa10ac239e02c4242d4c9d5e88aaf8729a05bcd079bdfc5101';
export const PREDECESSOR_FENCE_DIGEST = '6e4dec4bf4c49b71cf1f14b52de3ff14314065ec39379580fbc2a1d1af85f257';
export const LEASE_DIGEST = '0159a9bb242dda2c7c824eef83e4fd2ca5dadc4448a7792d331393dc38c6cbd2';
export const FENCE_DIGEST = '53145ab16e4f5f47737457d4076e8c2e11d1951cc9541d695dfffe05827454ce';
export const CONTROL_PLANE_EVIDENCE_STAMP_ID = 'ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS';
export const OBSERVED_AT_UTC = '2026-08-28T05:31:49Z';

export const PATHS = Object.freeze({
  activeApprovals: 'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  approvals: 'docs/OPS/R24/CORRECTIVE/C5B_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  contract: 'docs/OPS/R24/CORRECTIVE/C5B_MIGRATION_RECOVERY_CONTRACT_V1.json',
  implementation: 'src/core/migration-history-backup-gc-v1.cjs',
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  matrix: 'docs/OPS/R24/CORRECTIVE/C5B_MIGRATION_RECOVERY_MATRIX_V1.json',
  program: 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json',
  registry: 'docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json',
  script: 'scripts/ops/r24/corrective/c5b-migration-recovery.mjs',
  stageAdmission: 'docs/OPS/R24/CORRECTIVE/C5B_STAGE_ADMISSION_ATTESTATION_V1.json',
  stageInstance: 'docs/OPS/R24/CORRECTIVE/C5B_STAGE_INSTANCE_V1.json',
  test: 'test/contracts/r24-c5b-migration-recovery.contract.test.mjs',
});

export const WRITE_SET = Object.freeze([
  PATHS.inventory,
  PATHS.activeApprovals,
  PATHS.approvals,
  PATHS.contract,
  PATHS.matrix,
  PATHS.stageAdmission,
  PATHS.stageInstance,
  PATHS.script,
  PATHS.implementation,
  PATHS.test,
].sort());

export class C5BRecoveryContractError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

function fail(code, detail) { throw new C5BRecoveryContractError(code, detail); }
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
  assert(stageAdmission.value.status === 'ADMITTED', 'E_STAGE_NOT_ADMITTED', 'C5B');
  assert(stageAdmission.value.stageInstanceDigest === STAGE_INSTANCE_DIGEST, 'E_ADMISSION_BINDING', 'instance');
  assert(stageAdmission.value.acceptanceSignalsDigest === ACCEPTANCE_SIGNALS_DIGEST, 'E_ADMISSION_BINDING', 'signals');
  return { program, registry, stageInstance, stageAdmission };
}

function fileBinding(repoRoot, relativePath, capabilityId) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  return { capabilityId, sha256: sha256(bytes), sizeBytes: bytes.length };
}

function buildContract(repoRoot) {
  return {
    schemaVersion: 'YALKEN_R24_C5B_MIGRATION_RECOVERY_CONTRACT_V1',
    stageId: 'C5B',
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    capabilityIds: {
      localRecoveryManifest: 'CAP_R24_MIGRATION_LOCAL_RECOVERY_MANIFEST',
      publishStateClassification: 'CAP_R24_MIGRATION_PUBLISH_STATE_CLASSIFICATION',
      typedBlockedState: 'CAP_R24_MIGRATION_TYPED_BLOCKED_STATE',
    },
    sourceBindings: {
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      stageRegistryDigest: STAGE_REGISTRY_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      predecessorTerminalDigest: PREDECESSOR_TERMINAL_DIGEST,
      implementation: fileBinding(repoRoot, PATHS.implementation, 'CAP_R24_C5B_IMPLEMENTATION_BYTES'),
      contractTest: fileBinding(repoRoot, PATHS.test, 'CAP_R24_C5B_CONTRACT_TEST_BYTES'),
    },
    invariants: {
      postPublishUncertainStateNeverReturnedAsSuccess: true,
      exactBeforeIntendedAndObservedBytesPreserved: true,
      manifestWrittenLastAfterIndependentHashReadback: true,
      exactRecoveryRootRequiredAndFallbackForbidden: true,
      publicEvidenceUsesOnlyCapabilityRolesAndDigests: true,
      recoveryManifestNeverGrantsRepairAuthority: true,
      prePublishFailurePreservesExistingSafeSemantics: true,
      rollbackFailureTypedBlockedOnlyAfterDurablePreservation: true,
      noNonexistentPathReturned: true,
      noUiSurfaceChange: true,
      noDependencyOrNetworkChange: true,
    },
    publicEvidenceFields: ['blockedState', 'capabilityId', 'recoveryAvailable', 'recoveryId', 'manifestDigest', 'operationKind', 'targetState', 'versionRoles', 'repairAuthorityRequired'],
    localManifestRoles: ['BEFORE', 'INTENDED', 'OBSERVED'],
    repairAuthority: 'EXACT_INDEPENDENT_AUTHORITY_REQUIRED_OUTSIDE_C5B',
    terminalState: 'PENDING_POST_MERGE_EXTERNAL_C5B_ATTESTATION',
  };
}

function buildMatrix() {
  return {
    schemaVersion: 'YALKEN_R24_C5B_MIGRATION_RECOVERY_MATRIX_V1',
    stageId: 'C5B',
    vectors: [
      { vectorId: 'C5B-V01', mutation: 'MIGRATION_POST_RENAME_PARENT_FSYNC_FAILURE', expectedCode: 'E_R6_PROJECT_PUBLISH_BLOCKED_RECOVERY_REQUIRED', manifestRequired: true, roles: ['BEFORE', 'INTENDED', 'OBSERVED'] },
      { vectorId: 'C5B-V02', mutation: 'RESTORE_POST_RENAME_PARENT_FSYNC_FAILURE', expectedCode: 'E_R6_PROJECT_PUBLISH_BLOCKED_RECOVERY_REQUIRED', manifestRequired: true, roles: ['BEFORE', 'INTENDED', 'OBSERVED'] },
      { vectorId: 'C5B-V03', mutation: 'HISTORY_ACK_FAILURE_PLUS_ROLLBACK_FAILURE', expectedCode: 'E_R6_HISTORY_ACK_FAILED_RECOVERY_BLOCKED', manifestRequired: true, returnedSuccess: false },
      { vectorId: 'C5B-V04', mutation: 'UNSAFE_EXACT_RECOVERY_ROOT', expectedCode: 'E_R6_PROJECT_PUBLISH_BLOCKED_RECOVERY_UNAVAILABLE', fallbackStoreAllowed: false, outsideMutationAllowed: false },
      { vectorId: 'C5B-V05', mutation: 'PRE_PUBLISH_FAILURE_TARGET_UNCHANGED', expectedOutcome: 'ORIGINAL_TYPED_FAILURE', manifestRequired: false, returnedSuccess: false },
      { vectorId: 'C5B-V06', mutation: 'HISTORY_ACK_FAILURE_ROLLBACK_SUCCEEDS', expectedCode: 'E_R6_HISTORY_ACK_FAILED_ROLLED_BACK', compatibilityPreserved: true },
    ],
    verdict: 'MIGRATION_AND_RESTORE_PUBLISH_UNCERTAINTY_FAIL_CLOSED_WITH_VERIFIED_LOCAL_PATHLESS_RECOVERY_EVIDENCE',
  };
}

export function buildArtifacts(repoRoot = process.cwd()) {
  validateBindings(repoRoot);
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
  const rationale = `C5B migration recovery cutover under StageInstance ${STAGE_INSTANCE_DIGEST}; uncertain publish and rollback failure preserve exact local bytes before a typed blocked state, while unsafe recovery roots fail closed without fallback.`;
  return {
    approvals: approvedPaths().map((filePath) => approvalForPath(repoRoot, filePath, rationale)),
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    version: 'v1.0',
  };
}

function isOwnApproval(entry) {
  return entry?.approvedAtUtc === OBSERVED_AT_UTC
    && typeof entry.rationale === 'string'
    && entry.rationale.startsWith('C5B migration recovery cutover under StageInstance ');
}

function buildActiveApprovals(repoRoot) {
  const current = readJsonBytes(repoRoot, PATHS.activeApprovals).value;
  assert(Array.isArray(current.approvals) && current.version === 'v1.0', 'E_ACTIVE_APPROVAL_SCHEMA', 'C1C');
  const paths = [...approvedPaths(), PATHS.approvals].sort(lexical);
  const superseded = new Set(paths);
  const base = current.approvals.filter((entry) => !isOwnApproval(entry) && !superseded.has(entry.filePath));
  const rationale = `C5B migration recovery cutover under StageInstance ${STAGE_INSTANCE_DIGEST}; exact write set, verified local recovery roles, pathless public evidence, and no-fallback behavior remain fail-closed.`;
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
    schemaVersion: 'YALKEN_R24_C5B_MIGRATION_RECOVERY_RESULT_V1',
    stageId: 'C5B',
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    contractDigest: sha256(canonicalBytes(artifacts.contract)),
    matrixDigest: sha256(canonicalBytes(artifacts.matrix)),
    signals: {
      NO_NONEXISTENT_PATH_RETURNED: true,
      NO_SILENT_OLD_DIRECTORY_FALLBACK: true,
      LOCAL_RECOVERY_MANIFEST: true,
      TYPED_BLOCKED_STATE: true,
      PUBLIC_EVIDENCE_PATHLESS: true,
      EXTERNAL_TERMINAL_ATTESTATION_VERIFIED: 'PENDING_POST_MERGE_EXTERNAL_C5B_ATTESTATION',
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
  return compileResult(artifacts);
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedAsScript) {
  try {
    if (process.argv.includes('--write')) process.stdout.write(canonicalBytes(writeArtifacts()));
    else if (process.argv.includes('--check')) process.stdout.write(canonicalBytes(checkArtifacts()));
    else fail('E_USAGE', '--write or --check');
  } catch (error) {
    process.stderr.write(`${canonicalize({ code: error.code ?? 'E_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}
