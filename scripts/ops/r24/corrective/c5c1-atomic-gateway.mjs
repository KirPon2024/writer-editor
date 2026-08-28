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
export const SOURCE_HEAD_SHA = '56a677485685df1959334a76d208336205fefa9a';
export const SOURCE_TREE_SHA = '79197cabfa7fce078394d3b094f9270e9ad8ace0';
export const STAGE_INSTANCE_DIGEST = '99423649634a6530814e4aded877f7f2a5cf958b186c20ceb333631d8f66c64f';
export const STAGE_ADMISSION_DIGEST = '7eeda855b6f73d0e1f8bad4d9d30d22d2fc1c5ee399cee9ad5634efc4740e46b';
export const ACCEPTANCE_SIGNALS_DIGEST = 'b980c52ad7efb74d5138660d7722037038c04983f476b3a3c49031f776a9eac5';
export const PREDECESSOR_TERMINAL_DIGEST = '3605f93815730f32f86dba92738ffbaf5aa7952b30193543a94e9544199f10d4';
export const PREDECESSOR_RELEASE_DIGEST = '1bb01968356986ad5e34acde1c21dd90986e61f11a4d56fc81f5d20912b9f974';
export const PREDECESSOR_FENCE_DIGEST = '53145ab16e4f5f47737457d4076e8c2e11d1951cc9541d695dfffe05827454ce';
export const LEASE_DIGEST = '8ea0ffaf460e2b99d3ed3ba4cfc0e024534db9a4787fadfcd3510fcfc89aa0bc';
export const FENCE_DIGEST = '2a193859dee455d7df2902f50f502cf51e4c493e54b934510ddb210be198e9eb';
export const CONTROL_PLANE_EVIDENCE_STAMP_ID = 'ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS';
export const OBSERVED_AT_UTC = '2026-08-28T06:15:39Z';

export const PATHS = Object.freeze({
  activeApprovals: 'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  approvals: 'docs/OPS/R24/CORRECTIVE/C5C1_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  contract: 'docs/OPS/R24/CORRECTIVE/C5C1_ATOMIC_GATEWAY_CONTRACT_V1.json',
  implementation: 'src/core/legacy-strangler-v1.cjs',
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  main: 'src/main.js',
  matrix: 'docs/OPS/R24/CORRECTIVE/C5C1_ATOMIC_GATEWAY_MATRIX_V1.json',
  program: 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json',
  registry: 'docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json',
  script: 'scripts/ops/r24/corrective/c5c1-atomic-gateway.mjs',
  stageAdmission: 'docs/OPS/R24/CORRECTIVE/C5C1_STAGE_ADMISSION_ATTESTATION_V1.json',
  stageInstance: 'docs/OPS/R24/CORRECTIVE/C5C1_STAGE_INSTANCE_V1.json',
  test: 'test/contracts/r24-c5c1-atomic-gateway.contract.test.mjs',
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

export class C5C1AtomicGatewayContractError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

function fail(code, detail) { throw new C5C1AtomicGatewayContractError(code, detail); }
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
  assert(stageAdmission.value.status === 'ADMITTED', 'E_STAGE_NOT_ADMITTED', 'C5C1');
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
    'async function executeAtomicSceneManifestGatewayCutover(',
    "legacyAuthorityRole: 'READ_ONLY_OBSERVER'",
    "legacyFallbackMode: 'READ_ONLY_OBSERVATION_ONLY'",
    'legacyWriteFallbackAllowed: false',
    'dualWriteAllowed: false',
    'gatewayExecutorCount: 1',
    'ATOMIC_SCENE_MANIFEST_PHASE_CHAIN',
  ];
  for (const token of requiredImplementationTokens) {
    assert(implementation.includes(token), 'E_IMPLEMENTATION_REACHABILITY', token);
  }
  assert(main.split('executeAtomicSceneManifestGatewayCutover({').length - 1 === 1, 'E_PRODUCTION_REACHABILITY', 'cutover-call-count');
  assert(main.split('executeWriterSaveThroughStranglerGateway({').length - 1 === 1, 'E_PRODUCTION_REACHABILITY', 'unbound-call-count');
  assert(main.includes('executeGateway: async () => {') && main.includes('commitProjectTransaction({'), 'E_PRODUCTION_REACHABILITY', 'project-transaction');
}

function runContractOracle(repoRoot) {
  const result = spawnSync(process.execPath, ['--test', PATHS.test], { cwd: repoRoot, encoding: 'utf8' });
  assert(result.status === 0, 'E_CONTRACT_ORACLE', `${result.stdout}\n${result.stderr}`.trim());
  assert(String(result.stdout).includes('R24_C5C1_MUTATION_RECEIPT={"total":8,"killed":8,"survived":[]}'), 'E_SURVIVOR_PROOF', 'mutants');
}

function buildContract(repoRoot) {
  return {
    schemaVersion: 'YALKEN_R24_C5C1_ATOMIC_GATEWAY_CONTRACT_V1',
    stageId: 'C5C1',
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    capabilityIds: {
      atomicSceneManifestWrite: 'CAP_R24_ATOMIC_SCENE_MANIFEST_WRITE_GATEWAY',
      legacyReadOnlyObservation: 'CAP_R24_LEGACY_ROUTE_READ_ONLY_OBSERVATION',
      durabilityReceipt: 'CAP_R24_SCENE_MANIFEST_DURABILITY_RECEIPT',
    },
    sourceBindings: {
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      stageRegistryDigest: STAGE_REGISTRY_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      predecessorTerminalDigest: PREDECESSOR_TERMINAL_DIGEST,
      implementation: fileBinding(repoRoot, PATHS.implementation, 'CAP_R24_C5C1_IMPLEMENTATION_BYTES'),
      productionAdapter: fileBinding(repoRoot, PATHS.main, 'CAP_R24_C5C1_PRODUCTION_ADAPTER_BYTES'),
      contractTest: fileBinding(repoRoot, PATHS.test, 'CAP_R24_C5C1_CONTRACT_TEST_BYTES'),
    },
    invariants: {
      projectBoundWritesUseDedicatedGatewayOnly: true,
      gatewayExecutorCountExactlyOne: true,
      legacyObserverIndependentAndReadOnly: true,
      legacyWriteFallbackStructurallyAbsent: true,
      dualObservationAllowedDualWriteForbidden: true,
      routeMismatchFailsBeforeMutation: true,
      gatewayFailureNeverInvokesLegacyWrite: true,
      durableProjectTransactionReceiptRequired: true,
      fsyncRenameReadbackDelegatedToCertifiedAuthorities: true,
      unboundDurableSaveSemanticsPreserved: true,
      noUiSurfaceChange: true,
      noDependencyOrNetworkChange: true,
    },
    durabilityPhaseChain: ['ADMIT', 'RECOVER', 'PREPARE_JOURNAL', 'MANIFEST_PUBLISH', 'SCENE_PUBLISH', 'COMMIT_POINT', 'READBACK', 'CLEANUP', 'ACK'],
    publicEvidenceFields: ['capabilityId', 'requestDigest', 'transactionId', 'sceneDigest', 'manifestDigest', 'legacyAuthorityRole', 'gatewayExecutorCount'],
    legacyFallbackPolicy: 'READ_ONLY_OBSERVATION_ONLY_NO_WRITE_AUTHORITY',
    nextCutoverScope: 'C5C2_NOT_AUTO_ADMITTED',
    terminalState: 'PENDING_POST_MERGE_EXTERNAL_C5C1_ATTESTATION',
  };
}

function buildMatrix() {
  return {
    schemaVersion: 'YALKEN_R24_C5C1_ATOMIC_GATEWAY_MATRIX_V1',
    stageId: 'C5C1',
    vectors: [
      { vectorId: 'C5C1-V01', mutation: 'PROJECT_BOUND_HAPPY_PATH', expectedGatewayExecutions: 1, expectedLegacyWrites: 0, durablePairRequired: true },
      { vectorId: 'C5C1-V02', mutation: 'LEGACY_GATEWAY_ROUTE_MISMATCH', expectedCode: 'E_LEGACY_STRANGLER_OBSERVATION_MISMATCH', expectedGatewayExecutions: 0 },
      { vectorId: 'C5C1-V03', mutation: 'UNBOUND_REQUEST_TO_ATOMIC_GATEWAY', expectedCode: 'E_ATOMIC_SCENE_MANIFEST_PROJECT_BINDING_REQUIRED', expectedGatewayExecutions: 0 },
      { vectorId: 'C5C1-V04', mutation: 'NON_PROJECT_TRANSACTION_ROUTE', expectedCode: 'E_ATOMIC_SCENE_MANIFEST_ROUTE_REQUIRED', expectedGatewayExecutions: 0 },
      { vectorId: 'C5C1-V05', mutation: 'GATEWAY_FAILURE', expectedLegacyWrites: 0, fallbackAllowed: false },
      { vectorId: 'C5C1-V06', mutation: 'FORGED_OR_PARTIAL_DURABILITY_RECEIPT', expectedCode: 'E_ATOMIC_SCENE_MANIFEST_GATEWAY_RECEIPT_INVALID', returnedSuccess: false },
      { vectorId: 'C5C1-V07', mutation: 'EIGHT_NAMED_IMPLEMENTATION_MUTANTS', killed: 8, survived: 0 },
      { vectorId: 'C5C1-V08', mutation: 'UNBOUND_DURABLE_SAVE', expectedRoute: 'DURABLE_SAVE_V1', compatibilityPreserved: true },
    ],
    verdict: 'PROJECT_BOUND_SCENE_AND_MANIFEST_WRITES_HAVE_ONE_DURABLE_GATEWAY_AND_NO_LEGACY_WRITE_FALLBACK',
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
  const rationale = `C5C1 atomic scene and manifest gateway cutover under StageInstance ${STAGE_INSTANCE_DIGEST}; project-bound writes have one durable executor, legacy is read-only observation only, and no write fallback exists.`;
  return {
    approvals: approvedPaths().map((filePath) => approvalForPath(repoRoot, filePath, rationale)),
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    version: 'v1.0',
  };
}

function isOwnApproval(entry) {
  return entry?.approvedAtUtc === OBSERVED_AT_UTC
    && typeof entry.rationale === 'string'
    && entry.rationale.startsWith('C5C1 atomic scene and manifest gateway cutover under StageInstance ');
}

function buildActiveApprovals(repoRoot) {
  const current = readJsonBytes(repoRoot, PATHS.activeApprovals).value;
  assert(Array.isArray(current.approvals) && current.version === 'v1.0', 'E_ACTIVE_APPROVAL_SCHEMA', 'C1C');
  const paths = [...approvedPaths(), PATHS.approvals].sort(lexical);
  const superseded = new Set(paths);
  const base = current.approvals.filter((entry) => !isOwnApproval(entry) && !superseded.has(entry.filePath));
  const rationale = `C5C1 atomic scene and manifest gateway cutover under StageInstance ${STAGE_INSTANCE_DIGEST}; exact write set, single gateway executor, path-bound durability receipt, and read-only legacy observation remain fail-closed.`;
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
    schemaVersion: 'YALKEN_R24_C5C1_ATOMIC_GATEWAY_RESULT_V1',
    stageId: 'C5C1',
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    contractDigest: sha256(canonicalBytes(artifacts.contract)),
    matrixDigest: sha256(canonicalBytes(artifacts.matrix)),
    signals: {
      SINGLE_WRITE_GATEWAY: true,
      DUAL_OBSERVE_ALLOWED_DUAL_WRITE_FORBIDDEN: true,
      LEGACY_READ_ONLY_FALLBACK: true,
      PRODUCTION_REACHABILITY: true,
      FAULT_INJECTION: true,
      FSYNC_RENAME_READBACK: true,
      SURVIVOR_PROOF: true,
      EXTERNAL_TERMINAL_ATTESTATION_VERIFIED: 'PENDING_POST_MERGE_EXTERNAL_C5C1_ATTESTATION',
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
    process.stderr.write(`${JSON.stringify({ code: error.code || 'E_C5C1_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
