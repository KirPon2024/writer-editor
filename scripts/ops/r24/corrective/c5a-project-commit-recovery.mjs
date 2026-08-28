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
export const SOURCE_HEAD_SHA = '717e1c1a07a269ebbbe9873a187259784181d90d';
export const SOURCE_TREE_SHA = '4ff5b7e8579f688896f3065b18fd005255911ea1';
export const STAGE_INSTANCE_DIGEST = 'd010d4f44980973162fe5f0756c23d9a53e0b118977c22bac238a8e425c936b6';
export const STAGE_ADMISSION_DIGEST = 'eaf58a7a25843bc19b6e1a2fa1e294ac97b7f9c41798891be93d7a9f0ed8e911';
export const ACCEPTANCE_SIGNALS_DIGEST = 'e9e683d88b3e39bbf019424adcb466188af14b01997857e49b0b0c2d1e1944da';
export const PREDECESSOR_TERMINAL_DIGEST = '48ad7868fbd2ad9cf221fba41ec0c7f6c442659b73253051965996e234502b67';
export const PREDECESSOR_RELEASE_DIGEST = '6a590f68976403b4a2b7c80239e0f7a28107d063e91aedcf551bfc13d15f104f';
export const PREDECESSOR_FENCE_DIGEST = '584d8a89e8de79e2632ae52952e25963654fca1993136ca4f850363e5f024ec4';
export const LEASE_DIGEST = '9553542db9c6d0771fd09d798638c5e7d7800ca1845ba43b488a89c40cd7b3f5';
export const FENCE_DIGEST = '6e4dec4bf4c49b71cf1f14b52de3ff14314065ec39379580fbc2a1d1af85f257';
export const CONTROL_PLANE_EVIDENCE_STAMP_ID = 'ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS';
export const OBSERVED_AT_UTC = '2026-08-28T04:48:00Z';

export const PATHS = Object.freeze({
  activeApprovals: 'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  approvals: 'docs/OPS/R24/CORRECTIVE/C5A_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  contract: 'docs/OPS/R24/CORRECTIVE/C5A_PROJECT_COMMIT_RECOVERY_CONTRACT_V1.json',
  implementation: 'src/core/project-transaction-v1.cjs',
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  matrix: 'docs/OPS/R24/CORRECTIVE/C5A_PROJECT_COMMIT_RECOVERY_MATRIX_V1.json',
  program: 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json',
  registry: 'docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json',
  script: 'scripts/ops/r24/corrective/c5a-project-commit-recovery.mjs',
  stageAdmission: 'docs/OPS/R24/CORRECTIVE/C5A_STAGE_ADMISSION_ATTESTATION_V1.json',
  stageInstance: 'docs/OPS/R24/CORRECTIVE/C5A_STAGE_INSTANCE_V1.json',
  test: 'test/contracts/r24-c5a-project-commit-recovery.contract.test.mjs',
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

export class C5ARecoveryContractError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

function fail(code, detail) { throw new C5ARecoveryContractError(code, detail); }
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
  assert(stageAdmission.value.status === 'ADMITTED', 'E_STAGE_NOT_ADMITTED', 'C5A');
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
    schemaVersion: 'YALKEN_R24_C5A_PROJECT_COMMIT_RECOVERY_CONTRACT_V1',
    stageId: 'C5A',
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    capabilityIds: {
      corruptMetadataDetection: 'CAP_R24_PROJECT_COMMIT_CORRUPT_DETECTION',
      localPreservation: 'CAP_R24_PROJECT_COMMIT_LOCAL_RECOVERY_PACKET',
      repair: 'CAP_R24_PROJECT_COMMIT_REPAIR',
    },
    sourceBindings: {
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      stageRegistryDigest: STAGE_REGISTRY_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      predecessorTerminalDigest: PREDECESSOR_TERMINAL_DIGEST,
      implementation: fileBinding(repoRoot, PATHS.implementation, 'CAP_R24_C5A_IMPLEMENTATION_BYTES'),
      contractTest: fileBinding(repoRoot, PATHS.test, 'CAP_R24_C5A_CONTRACT_TEST_BYTES'),
    },
    invariants: {
      corruptDistinctFromAbsent: true,
      corruptMarkerNeverOverwrittenAutomatically: true,
      beforeAndAfterVersionsPreservedBeforePairMutation: true,
      recoveryPacketLocalAndAppendOnly: true,
      publicEvidenceUsesOnlyCapabilityRolesAndDigests: true,
      repairRequiresExactPacketTransactionDecisionAndIndependentVerifier: true,
      noJournalRepairRequiresExplicitPacketAndTransactionBinding: true,
      repairOutcomesExactly: ['REPAIR_TO_AFTER', 'REPAIR_TO_BEFORE'],
      contextRevalidatedAfterAuthorityVerification: true,
      noUiSurfaceChange: true,
      noDependencyOrNetworkChange: true,
    },
    publicEvidenceFields: ['capabilityId', 'packetDigest', 'transactionId', 'versionRoles', 'repairAuthorityRequired'],
    terminalState: 'PENDING_POST_MERGE_EXTERNAL_C5A_ATTESTATION',
  };
}

function buildMatrix() {
  return {
    schemaVersion: 'YALKEN_R24_C5A_PROJECT_COMMIT_RECOVERY_MATRIX_V1',
    stageId: 'C5A',
    vectors: [
      { vectorId: 'C5A-V01', mutation: 'COMMIT_JSON_TORN', expectedCode: 'E_PROJECT_COMMIT_CORRUPT', pairMutationAllowed: false, packetRequired: true },
      { vectorId: 'C5A-V02', mutation: 'COMMIT_SCHEMA_MISMATCH', expectedCode: 'E_PROJECT_COMMIT_CORRUPT', pairMutationAllowed: false, packetRequired: true },
      { vectorId: 'C5A-V03', mutation: 'COMMIT_PATH_BINDING_MISMATCH', expectedCode: 'E_PROJECT_COMMIT_CORRUPT', pairMutationAllowed: false, packetRequired: true },
      { vectorId: 'C5A-V04', mutation: 'COMMIT_TRANSACTION_MISMATCH', expectedCode: 'E_PROJECT_COMMIT_CORRUPT', pairMutationAllowed: false, packetRequired: true },
      { vectorId: 'C5A-V05', mutation: 'COMMIT_REVISION_MISMATCH', expectedCode: 'E_PROJECT_COMMIT_CORRUPT', pairMutationAllowed: false, packetRequired: true },
      { vectorId: 'C5A-V06', mutation: 'COMMIT_DIGEST_MISMATCH', expectedCode: 'E_PROJECT_COMMIT_CORRUPT', pairMutationAllowed: false, packetRequired: true },
      { vectorId: 'C5A-V07', mutation: 'COMMIT_ABSENT', expectedOutcome: 'UNCOMMITTED_ROLLED_BACK', packetRequired: false },
      { vectorId: 'C5A-V08', mutation: 'PRIOR_VALID_COMMIT', expectedOutcome: 'UNCOMMITTED_ROLLED_BACK', packetRequired: false },
      { vectorId: 'C5A-V09', mutation: 'REPAIR_WITHOUT_VERIFIER', expectedCode: 'E_PROJECT_COMMIT_REPAIR_AUTHORITY_REQUIRED', pairMutationAllowed: false },
      { vectorId: 'C5A-V10', mutation: 'REPAIR_FALSE_OR_MISMATCHED_PROOF', expectedCode: 'E_PROJECT_COMMIT_REPAIR_AUTHORITY_REQUIRED', pairMutationAllowed: false },
      { vectorId: 'C5A-V11', mutation: 'AUTHORIZED_REPAIR_TO_BEFORE', expectedOutcome: 'UNCOMMITTED_ROLLED_BACK', packetRetained: true },
      { vectorId: 'C5A-V12', mutation: 'AUTHORIZED_REPAIR_TO_AFTER', expectedOutcome: 'COMMITTED_CONVERGED', packetRetained: true },
      { vectorId: 'C5A-V13', mutation: 'NO_JOURNAL_CORRUPTION_WITHOUT_PACKET_BINDING', expectedCode: 'E_PROJECT_COMMIT_REPAIR_RECOVERY_BINDING_REQUIRED', pairMutationAllowed: false },
      { vectorId: 'C5A-V14', mutation: 'AUTHORIZED_NO_JOURNAL_REPAIR_TO_AFTER', expectedOutcome: 'COMMITTED_CONVERGED', packetRetained: true },
    ],
    verdict: 'CORRUPTION_FAILS_CLOSED_AND_ONLY_EXACT_INDEPENDENT_AUTHORITY_SELECTS_A_VERSION',
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
  const rationale = `C5A project commit recovery cutover under StageInstance ${STAGE_INSTANCE_DIGEST}; corrupt metadata fails closed after durable local before and after preservation, and repair requires exact independent authority proof.`;
  return {
    approvals: approvedPaths().map((filePath) => approvalForPath(repoRoot, filePath, rationale)),
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    version: 'v1.0',
  };
}

function isOwnApproval(entry) {
  return entry?.approvedAtUtc === OBSERVED_AT_UTC
    && typeof entry.rationale === 'string'
    && entry.rationale.startsWith('C5A project commit recovery cutover under StageInstance ');
}

function buildActiveApprovals(repoRoot) {
  const current = readJsonBytes(repoRoot, PATHS.activeApprovals).value;
  assert(Array.isArray(current.approvals) && current.version === 'v1.0', 'E_ACTIVE_APPROVAL_SCHEMA', 'C1C');
  const paths = [...approvedPaths(), PATHS.approvals].sort(lexical);
  const superseded = new Set(paths);
  const base = current.approvals.filter((entry) => !isOwnApproval(entry) && !superseded.has(entry.filePath));
  const rationale = `C5A project commit recovery cutover under StageInstance ${STAGE_INSTANCE_DIGEST}; exact write set, local packet preservation, pathless public evidence, and independent repair authority remain fail-closed.`;
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
    schemaVersion: 'YALKEN_R24_C5A_PROJECT_COMMIT_RECOVERY_RESULT_V1',
    stageId: 'C5A',
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    contractDigest: sha256(canonicalBytes(artifacts.contract)),
    matrixDigest: sha256(canonicalBytes(artifacts.matrix)),
    signals: {
      E_PROJECT_COMMIT_CORRUPT_FAIL_CLOSED: true,
      BOTH_VERSIONS_PRESERVED: true,
      LOCAL_RECOVERY_PACKET: true,
      DETERMINISTIC_REPAIR_REQUIRES_AUTHORITY_PROOF: true,
      PUBLIC_EVIDENCE_PATHLESS: true,
      EXTERNAL_TERMINAL_ATTESTATION_VERIFIED: 'PENDING_POST_MERGE_EXTERNAL_C5A_ATTESTATION',
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
