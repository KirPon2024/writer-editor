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
export const SOURCE_HEAD_SHA = '042391c6cf55e6c2aa5fb3e659c5c13f87197fc9';
export const SOURCE_TREE_SHA = '17e5ae04302db605215e1fac2fedc2f4d8470c2c';
export const STAGE_INSTANCE_DIGEST = 'bb05ee05b0ac4112131b7ee47668cff637ac0a55f1f8044e0fd5cf96087bdda1';
export const STAGE_ADMISSION_DIGEST = '861b24362f9625209946e50f1661d71b4ce200a231320b683be3b68b19696794';
export const ACCEPTANCE_SIGNALS_DIGEST = 'fd6efbb6c55098164533c3407022160d5bfde72a2459d10e867de3d5116ee553';
export const PREDECESSOR_TERMINAL_DIGEST = 'e9912e04f8c96238e5134f5b1186f86424a503b223b4a26d17c80d1f19baeea7';
export const PREDECESSOR_RELEASE_DIGEST = 'bcf782448fc1ac4ff28a55a00e3c6310f2487d32f64eb94750cf0cef9ebe697b';
export const LEASE_DIGEST = 'b785eeb28c1f0e5d494daf1637d9fa8b67189e6dd1419f7e8975c987fd291890';
export const FENCE_DIGEST = 'ef70fb81589dbbb19b6dbd77ac1071d5834c8dd60875e0bd548768a5c914199b';
export const PREDECESSOR_FENCE_DIGEST = '35f2b3415b732c4499f152e88cea249563c82595ae73930c1733b07b4e9aba58';
export const WRITE_SET_DIGEST = '81e74247ae5586cd766cbe400b945e9f4f7217d08753ceb6b98d0815af03248f';
export const OBSERVED_AT_UTC = '2026-08-28T03:21:22.000Z';

export const PATHS = Object.freeze({
  activeApprovals: 'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  approvals: 'docs/OPS/R24/CORRECTIVE/C3_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  contract: 'docs/OPS/R24/CORRECTIVE/C3_EXECUTION_ENTRYPOINT_CONTRACT_V1.json',
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  matrix: 'docs/OPS/R24/CORRECTIVE/C3_CRASH_STALE_REVISION_OWNER_GATE_MATRIX_V1.json',
  program: 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json',
  receipt: 'docs/OPS/R24/CORRECTIVE/C3_FRESH_SELECTION_RECEIPT_V1.json',
  registry: 'docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json',
  script: 'scripts/ops/r24/corrective/c3-operational-entrypoint.mjs',
  stageAdmission: 'docs/OPS/R24/CORRECTIVE/C3_STAGE_ADMISSION_ATTESTATION_V1.json',
  stageInstance: 'docs/OPS/R24/CORRECTIVE/C3_STAGE_INSTANCE_V1.json',
  test: 'test/contracts/r24-c3-operational-entrypoint.contract.test.mjs'
});

export const WRITE_SET = Object.freeze([
  PATHS.inventory,
  PATHS.activeApprovals,
  PATHS.matrix,
  PATHS.contract,
  PATHS.receipt,
  PATHS.approvals,
  PATHS.stageAdmission,
  PATHS.stageInstance,
  PATHS.script,
  PATHS.test
].sort());

const NON_DELEGABLE_BOUNDARIES = new Set([
  'UNAVOIDABLE_DESTRUCTIVE_OR_IRREVERSIBLE_ACTION',
  'FORCE_PUSH_OR_PROTECTION_BYPASS',
  'RESET_CLEAN_STASH_OR_PRESERVED_WIP_LOSS',
  'CREDENTIAL_IDENTITY_OR_SECRET_ENTRY_OR_DISCLOSURE',
  'USER_WORD_OR_DRIVE_MUTATION',
  'SIGNING_NOTARIZATION_PUBLIC_DISTRIBUTION_OR_RELEASE',
  'PAYMENT',
  'EXTERNAL_EFFECT_OUTSIDE_EXACT_ADMITTED_PROGRAM'
]);

export class C3OperationalError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

function fail(code, detail) { throw new C3OperationalError(code, detail); }
function assert(condition, code, detail) { if (!condition) fail(code, detail); }
function isPlainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
const clone = (value) => JSON.parse(JSON.stringify(value));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const lexical = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function run(repoRoot, command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024, timeout: 480000 });
  if (result.error) fail('E_COMMAND_EXECUTION', command);
  return result;
}

function git(repoRoot, args) {
  const result = run(repoRoot, 'git', args);
  assert(result.status === 0, 'E_GIT', args[0]);
  return String(result.stdout).trim();
}

function statusPaths(repoRoot) {
  const result = run(repoRoot, 'git', ['status', '--porcelain=v1', '--untracked-files=all']);
  assert(result.status === 0, 'E_GIT', 'status');
  const text = String(result.stdout).trimEnd();
  return text ? text.split('\n').map((line) => line.slice(3)).sort(lexical) : [];
}

export function assertSourceIdentity(repoRoot = process.cwd()) {
  assert(git(repoRoot, ['rev-parse', `${SOURCE_HEAD_SHA}^{tree}`]) === SOURCE_TREE_SHA, 'E_SOURCE_TREE', 'source');
  assert(run(repoRoot, 'git', ['merge-base', '--is-ancestor', SOURCE_HEAD_SHA, 'HEAD']).status === 0, 'E_SOURCE_ANCESTRY', 'head');
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
    program: readJsonBytes(repoRoot, PATHS.program, true),
    registry: readJsonBytes(repoRoot, PATHS.registry, true),
    stageAdmission: readJsonBytes(repoRoot, PATHS.stageAdmission, true),
    stageInstance: readJsonBytes(repoRoot, PATHS.stageInstance, true)
  };
}

function validateInputs(inputs) {
  assert(inputs.program.digest === PROGRAM_TEMPLATE_DIGEST, 'E_PROGRAM_DIGEST', 'program');
  assert(inputs.registry.digest === STAGE_REGISTRY_DIGEST, 'E_REGISTRY_DIGEST', 'registry');
  assert(inputs.stageInstance.digest === STAGE_INSTANCE_DIGEST, 'E_STAGE_INSTANCE_DIGEST', 'instance');
  assert(inputs.stageAdmission.digest === STAGE_ADMISSION_DIGEST, 'E_STAGE_ADMISSION_DIGEST', 'admission');
  assert(inputs.stageAdmission.value.status === 'ADMITTED', 'E_STAGE_NOT_ADMITTED', 'C3');
  assert(inputs.stageAdmission.value.stageInstanceDigest === STAGE_INSTANCE_DIGEST, 'E_ADMISSION_BINDING', 'instance');
  assert(inputs.stageAdmission.value.acceptanceSignalsDigest === ACCEPTANCE_SIGNALS_DIGEST, 'E_ADMISSION_BINDING', 'signals');
  assert(inputs.stageInstance.value.baseSha === SOURCE_HEAD_SHA && inputs.stageInstance.value.headSha === SOURCE_HEAD_SHA && inputs.stageInstance.value.treeSha === SOURCE_TREE_SHA, 'E_STAGE_IDENTITY', 'source');
}

export const EXPECTED_SNAPSHOT = deepFreeze({
  schemaVersion: 'YALKEN_R24_C3_OPERATIONAL_SNAPSHOT_V1',
  observedAtUtc: OBSERVED_AT_UTC,
  ownerBoundary: null,
  exactIdentity: { baseSha: SOURCE_HEAD_SHA, headSha: SOURCE_HEAD_SHA, treeSha: SOURCE_TREE_SHA },
  stage: { stageId: 'C3', stageInstanceDigest: STAGE_INSTANCE_DIGEST, stageAdmissionDigest: STAGE_ADMISSION_DIGEST, writeSetDigest: WRITE_SET_DIGEST },
  lease: { digest: LEASE_DIGEST, headSha: SOURCE_HEAD_SHA, oneWriter: true, predecessorReleaseDigest: PREDECESSOR_RELEASE_DIGEST, status: 'ACTIVE', treeSha: SOURCE_TREE_SHA, wip: 1, writeSetDigest: WRITE_SET_DIGEST },
  fence: { digest: FENCE_DIGEST, fencingCounter: 14, leaseDigest: LEASE_DIGEST, oneWriter: true, predecessorFenceDigest: PREDECESSOR_FENCE_DIGEST, predecessorReleaseDigest: PREDECESSOR_RELEASE_DIGEST, status: 'ACTIVE', wip: 1 },
  graph: { eligibleNodes: ['C3'], selectedNode: 'C3', dependencies: [{ stageId: 'C2B4', status: 'CERTIFIED_DONE', attestationDigest: PREDECESSOR_TERMINAL_DIGEST }] }
});

function blocked(blockerClass, recoveryCondition, affectedCapabilityIds = ['CAP_R24_C3_OPERATIONAL_ADMISSION']) {
  return deepFreeze({
    schemaVersion: 'YALKEN_R24_C3_BLOCKED_NODE_RECEIPT_V1',
    status: 'BLOCKED_NODE',
    node: 'C3',
    blockerClass,
    affectedCapabilityIds,
    ownerActionUnavoidable: false,
    recoveryCondition,
    sourceHeadDigest: SOURCE_HEAD_SHA,
    sourceTreeDigest: SOURCE_TREE_SHA
  });
}

function ownerGate(boundary) {
  return deepFreeze({
    schemaVersion: 'YALKEN_R24_C3_OWNER_GATE_V1',
    status: 'OWNER_GATE',
    node: 'C3',
    blockerClass: boundary,
    affectedCapabilityIds: ['CAP_R24_C3_NON_DELEGABLE_BOUNDARY'],
    ownerActionUnavoidable: true,
    recoveryCondition: 'OWNER_EXPLICITLY_RESOLVES_EXACT_NON_DELEGABLE_BOUNDARY',
    sourceHeadDigest: SOURCE_HEAD_SHA,
    sourceTreeDigest: SOURCE_TREE_SHA
  });
}

function equalCanonical(left, right) { return canonicalBytes(left).equals(canonicalBytes(right)); }

export function evaluateOperationalAdmission(snapshot = EXPECTED_SNAPSHOT) {
  if (!isPlainObject(snapshot)) return blocked('INVALID_OPERATIONAL_SNAPSHOT', 'RECOMPILE_CANONICAL_OPERATIONAL_SNAPSHOT');
  if (snapshot.ownerBoundary !== null) {
    if (NON_DELEGABLE_BOUNDARIES.has(snapshot.ownerBoundary)) return ownerGate(snapshot.ownerBoundary);
    return blocked('ROUTINE_LOCAL_ACTION_FENCE', 'RECOVER_LOCALLY_OR_GRAPH_SELECT_INDEPENDENT_ADMITTED_NODE');
  }
  if (!isPlainObject(snapshot.exactIdentity) || snapshot.exactIdentity.baseSha !== SOURCE_HEAD_SHA || snapshot.exactIdentity.headSha !== SOURCE_HEAD_SHA || snapshot.exactIdentity.treeSha !== SOURCE_TREE_SHA) {
    return blocked('STALE_OR_AMBIGUOUS_REVISION', 'RECOMPILE_STAGE_INSTANCE_AT_FRESH_EXACT_BASE_HEAD_TREE');
  }
  if (!isPlainObject(snapshot.stage) || snapshot.stage.stageId !== 'C3' || snapshot.stage.stageInstanceDigest !== STAGE_INSTANCE_DIGEST || snapshot.stage.stageAdmissionDigest !== STAGE_ADMISSION_DIGEST || snapshot.stage.writeSetDigest !== WRITE_SET_DIGEST) {
    return blocked('STAGE_ADMISSION_BINDING_MISMATCH', 'REVERIFY_EXACT_STAGE_INSTANCE_AND_ADMISSION');
  }
  const lease = snapshot.lease;
  if (!isPlainObject(lease) || lease.digest !== LEASE_DIGEST || lease.status !== 'ACTIVE' || lease.wip !== 1 || lease.oneWriter !== true || lease.headSha !== SOURCE_HEAD_SHA || lease.treeSha !== SOURCE_TREE_SHA || lease.writeSetDigest !== WRITE_SET_DIGEST || lease.predecessorReleaseDigest !== PREDECESSOR_RELEASE_DIGEST) {
    return blocked('LEASE_OR_WIP_MISMATCH', 'ACQUIRE_ONE_FRESH_NON_OVERLAPPING_LEASE_AFTER_EXACT_REVALIDATION');
  }
  const fence = snapshot.fence;
  if (!isPlainObject(fence) || fence.digest !== FENCE_DIGEST || fence.status !== 'ACTIVE' || fence.wip !== 1 || fence.oneWriter !== true || fence.fencingCounter !== 14 || fence.leaseDigest !== LEASE_DIGEST || fence.predecessorFenceDigest !== PREDECESSOR_FENCE_DIGEST || fence.predecessorReleaseDigest !== PREDECESSOR_RELEASE_DIGEST) {
    return blocked('CRASH_OR_STALE_FENCE', 'ISSUE_FRESH_MONOTONIC_FENCE_WITHOUT_REUSING_STALE_AUTHORITY');
  }
  const graph = snapshot.graph;
  const expectedDependency = [{ stageId: 'C2B4', status: 'CERTIFIED_DONE', attestationDigest: PREDECESSOR_TERMINAL_DIGEST }];
  if (!isPlainObject(graph) || !equalCanonical(graph.eligibleNodes, ['C3']) || graph.selectedNode !== 'C3') {
    return blocked('GRAPH_SELECTION_NOT_UNIQUE', 'RECOMPUTE_HIGHEST_PRIORITY_ELIGIBLE_NON_CONFLICTING_NODE');
  }
  if (!equalCanonical(graph.dependencies, expectedDependency)) {
    return blocked('DEPENDENCY_NOT_EXTERNALLY_CERTIFIED', 'VERIFY_CURRENT_IMMUTABLE_DEPENDENCY_ATTESTATION');
  }
  const snapshotDigest = sha256(canonicalBytes(snapshot));
  return deepFreeze({
    schemaVersion: 'YALKEN_R24_C3_FRESH_SELECTION_RECEIPT_V1',
    status: 'SELECTED',
    selectionCapabilityId: 'CAP_R24_C3_GRAPH_SELECTION_0001',
    roles: ['OPERATIONAL_ENTRYPOINT', 'GRAPH_SELECTOR', 'LEASE_FENCE_VALIDATOR'],
    selectedNode: 'C3',
    eligibleNodes: ['C3'],
    sourceBaseDigest: SOURCE_HEAD_SHA,
    sourceHeadDigest: SOURCE_HEAD_SHA,
    sourceTreeDigest: SOURCE_TREE_SHA,
    programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
    stageRegistryDigest: STAGE_REGISTRY_DIGEST,
    stageInstanceDigest: STAGE_INSTANCE_DIGEST,
    stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
    acceptanceSignalsDigest: ACCEPTANCE_SIGNALS_DIGEST,
    predecessorTerminalAttestationDigest: PREDECESSOR_TERMINAL_DIGEST,
    predecessorReleaseDigest: PREDECESSOR_RELEASE_DIGEST,
    leaseDigest: LEASE_DIGEST,
    fenceDigest: FENCE_DIGEST,
    fencingCounter: 14,
    oneWriter: true,
    wip: 1,
    snapshotDigest,
    selectedAtUtc: OBSERVED_AT_UTC,
    immutable: true,
    publicReceiptPathPolicy: 'PATHLESS_CAPABILITY_IDS_ROLES_AND_DIGESTS_ONLY',
    externalTerminalAttestationRequired: true,
    leaseReleaseRequired: true
  });
}

function buildContract() {
  return {
    schemaVersion: 'YALKEN_R24_C3_EXECUTION_ENTRYPOINT_CONTRACT_V1',
    stageId: 'C3',
    programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
    stageRegistryDigest: STAGE_REGISTRY_DIGEST,
    stageInstanceDigest: STAGE_INSTANCE_DIGEST,
    stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
    sourceIdentity: { baseSha: SOURCE_HEAD_SHA, headSha: SOURCE_HEAD_SHA, treeSha: SOURCE_TREE_SHA },
    invariants: {
      admissionAttestationRequired: true,
      actualHeadTreeAndBaseAmendmentsRequired: true,
      leaseAndFenceRequired: true,
      wip: 1,
      writerCount: 1,
      graphSelectedNodeOnly: true,
      externalTerminalAttestationRequired: true,
      leaseReleasedAfterTerminalCertification: true,
      freshImmutableSelectionReceipt: true,
      staleRevisionFailsClosed: true,
      crashCannotReuseFence: true,
      routineFailureIsLocalActionFence: true,
      ownerGateOnlyForNonDelegableBoundary: true
    },
    publicReceiptPolicy: { localRecoveryPathsOnly: true, publicAbsolutePathsForbidden: true, permittedFields: ['PATHLESS_CAPABILITY_IDS', 'ROLES', 'DIGESTS'] },
    nonClaims: ['NO_PRODUCT_TRUTH_MUTATION', 'NO_FUTURE_STAGE_EXECUTION', 'NO_PROGRAM_DONE', 'NO_RELEASE_OR_PUBLICATION_AUTHORITY']
  };
}

function buildMatrix() {
  return {
    schemaVersion: 'YALKEN_R24_C3_CRASH_STALE_REVISION_OWNER_GATE_MATRIX_V1',
    stageId: 'C3',
    vectors: [
      { vectorId: 'C3-V01', mutation: 'NONE', expectedStatus: 'SELECTED' },
      { vectorId: 'C3-V02', mutation: 'STALE_HEAD', expectedStatus: 'BLOCKED_NODE', expectedBlockerClass: 'STALE_OR_AMBIGUOUS_REVISION', ownerActionUnavoidable: false },
      { vectorId: 'C3-V03', mutation: 'STALE_TREE', expectedStatus: 'BLOCKED_NODE', expectedBlockerClass: 'STALE_OR_AMBIGUOUS_REVISION', ownerActionUnavoidable: false },
      { vectorId: 'C3-V04', mutation: 'CRASH_REUSED_FENCE', expectedStatus: 'BLOCKED_NODE', expectedBlockerClass: 'CRASH_OR_STALE_FENCE', ownerActionUnavoidable: false },
      { vectorId: 'C3-V05', mutation: 'WIP_TWO', expectedStatus: 'BLOCKED_NODE', expectedBlockerClass: 'LEASE_OR_WIP_MISMATCH', ownerActionUnavoidable: false },
      { vectorId: 'C3-V06', mutation: 'MULTIPLE_ELIGIBLE_NODES', expectedStatus: 'BLOCKED_NODE', expectedBlockerClass: 'GRAPH_SELECTION_NOT_UNIQUE', ownerActionUnavoidable: false },
      { vectorId: 'C3-V07', mutation: 'UNCERTIFIED_DEPENDENCY', expectedStatus: 'BLOCKED_NODE', expectedBlockerClass: 'DEPENDENCY_NOT_EXTERNALLY_CERTIFIED', ownerActionUnavoidable: false },
      { vectorId: 'C3-V08', mutation: 'ROUTINE_NETWORK_FAILURE', expectedStatus: 'BLOCKED_NODE', expectedBlockerClass: 'ROUTINE_LOCAL_ACTION_FENCE', ownerActionUnavoidable: false },
      { vectorId: 'C3-V09', mutation: 'CREDENTIAL_BOUNDARY', expectedStatus: 'OWNER_GATE', expectedBlockerClass: 'CREDENTIAL_IDENTITY_OR_SECRET_ENTRY_OR_DISCLOSURE', ownerActionUnavoidable: true }
    ],
    verdict: 'CRASH_STALE_REVISION_AND_OWNER_GATE_BOUNDARIES_DETERMINISTIC'
  };
}

export function buildArtifacts(inputs = loadInputs()) {
  validateInputs(inputs);
  const receipt = evaluateOperationalAdmission(EXPECTED_SNAPSHOT);
  assert(receipt.status === 'SELECTED', 'E_DEFAULT_SELECTION', receipt.status);
  return { contract: buildContract(), matrix: buildMatrix(), receipt };
}

function writeCanonical(repoRoot, relativePath, value) { fs.writeFileSync(path.join(repoRoot, relativePath), canonicalBytes(value)); }
function approvedPaths() { return [PATHS.contract, PATHS.inventory, PATHS.matrix, PATHS.receipt, PATHS.script, PATHS.stageAdmission, PATHS.stageInstance, PATHS.test].sort(lexical); }
function approvalForPath(repoRoot, filePath, rationale) { return { approvedAtUtc: OBSERVED_AT_UTC, approvedBy: `owner-standing-authority:${OWNER_BINDING_DIGEST}`, filePath, rationale, sha256: sha256(fs.readFileSync(path.join(repoRoot, filePath))) }; }
function buildStageApprovals(repoRoot) { const rationale = 'C3 exact admitted operational entrypoint under the owner-approved control plane bound to ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS; no product, future-stage, release, publication, or Program DONE promotion.'; return { approvals: approvedPaths().map((filePath) => approvalForPath(repoRoot, filePath, rationale)), version: 'v1.0' }; }
function isOwnApproval(entry) { return entry?.approvedAtUtc === OBSERVED_AT_UTC && typeof entry.rationale === 'string' && entry.rationale.startsWith('C3 exact admitted operational entrypoint under StageInstance '); }
function buildActiveApprovals(repoRoot) { const current = readJsonBytes(repoRoot, PATHS.activeApprovals).value; assert(Array.isArray(current.approvals) && current.version === 'v1.0', 'E_ACTIVE_APPROVAL_SCHEMA', 'C1C'); const paths = [...approvedPaths(), PATHS.approvals].sort(lexical); const superseded = new Set(paths); const base = current.approvals.filter((entry) => !isOwnApproval(entry) && !superseded.has(entry.filePath)); const rationale = `C3 exact admitted operational entrypoint under StageInstance ${STAGE_INSTANCE_DIGEST}; one writer, WIP=1, exact-head, lease/fence, graph selection, and non-delegable owner gates remain fail-closed.`; return { approvals: [...base, ...paths.map((filePath) => approvalForPath(repoRoot, filePath, rationale))], version: current.version }; }
function assertExpectedFile(repoRoot, relativePath, value) { assert(fs.readFileSync(path.join(repoRoot, relativePath)).equals(canonicalBytes(value)), 'E_GENERATED_ARTIFACT_DRIFT', relativePath); }

function compileResult(artifacts) {
  return {
    schemaVersion: 'YALKEN_R24_C3_OPERATIONAL_ENTRYPOINT_RESULT_V1',
    stageId: 'C3',
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    selectionReceiptDigest: sha256(canonicalBytes(artifacts.receipt)),
    signals: {
      ADMISSION_ATTESTATION_REQUIRED: true,
      ACTUAL_HEAD_TREE_AND_BASE_AMENDMENTS_REQUIRED: true,
      LEASE_AND_FENCE_REQUIRED: true,
      WIP_ONE_ENFORCED: true,
      GRAPH_SELECTED_NODE_ONLY: true,
      FRESH_IMMUTABLE_SELECTION_RECEIPT: true,
      CRASH_STALE_REVISION_OWNER_GATE_TESTS_PASS: true,
      EXTERNAL_TERMINAL_ATTESTATION_REQUIRED: 'PENDING_POST_MERGE_EXTERNAL_C3_ATTESTATION',
      LEASE_RELEASED: 'PENDING_POST_TERMINAL_CERTIFICATION'
    }
  };
}

export function writeArtifacts(repoRoot = process.cwd()) {
  assertSourceIdentity(repoRoot);
  const artifacts = buildArtifacts(loadInputs(repoRoot));
  writeCanonical(repoRoot, PATHS.contract, artifacts.contract);
  writeCanonical(repoRoot, PATHS.matrix, artifacts.matrix);
  writeCanonical(repoRoot, PATHS.receipt, artifacts.receipt);
  writeCanonical(repoRoot, PATHS.approvals, buildStageApprovals(repoRoot));
  writeCanonical(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  return compileResult(artifacts);
}

export function checkArtifacts(repoRoot = process.cwd()) {
  assertSourceIdentity(repoRoot);
  const artifacts = buildArtifacts(loadInputs(repoRoot));
  assertExpectedFile(repoRoot, PATHS.contract, artifacts.contract);
  assertExpectedFile(repoRoot, PATHS.matrix, artifacts.matrix);
  assertExpectedFile(repoRoot, PATHS.receipt, artifacts.receipt);
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
