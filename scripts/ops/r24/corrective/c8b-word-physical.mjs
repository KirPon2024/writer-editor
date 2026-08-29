#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { buildInventory } from '../test-inventory.mjs';
import { canonicalBytes } from './canonical-json.mjs';

export const STAGE_ID = 'C8B';
export const OBSERVED_AT_UTC = '2026-08-29T00:05:50Z';
export const PROGRAM_TEMPLATE_DIGEST = '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a';
export const STAGE_REGISTRY_DIGEST = 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a';
export const TRUST_MODEL_DIGEST = '4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d';
export const OWNER_BINDING_DIGEST = 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6';
export const STAGE_INSTANCE_DIGEST = 'c56804939a1a6d2234581e9c64f88de3336d352d99c4e44cbaf550041a063d1f';
export const STAGE_ADMISSION_DIGEST = 'db1e1febeeebcaa1551cd4287bcc2ae6a4a6c828fc725e7d58d41863306ac54c';
export const ACCEPTANCE_SIGNALS_DIGEST = '8ffaae42081c8e0ace98e1cb912894c1be1c8ef5d7bd880acccc125adc7d82b8';
export const WRITE_SET_DIGEST = 'da2edf023545c29ed4761ec50e7c79dd9c54b21e74a91a819c3502bcf1f3460b';
export const SOURCE_HEAD_SHA = 'f700a9fff675e89d77c805536e6e573207ab7d83';
export const SOURCE_TREE_SHA = '976e08b5381ce3f53158751b7db6897c7186bb5a';
export const PREDECESSOR_TERMINAL_DIGEST = 'c4b9349140a9dc33b664f166cf59b2ae9c00e3394a044b87ee6195adc554d66e';
export const PREDECESSOR_CERTIFIED_DONE_RECEIPT_DIGEST = '231640a9683b776f1edbd28197caea72240a4166832482e8fc49535e90eabe7c';
export const PREDECESSOR_LEASE_RELEASE_DIGEST = '4ef6143312208fd52b8cf8a01931993564ee4fdac964718f19d74795147c7010';
export const OWNER_WORD_DECISION_DIGEST = 'f90200890b6704498803cc286d02e869d5474bd114553d1c82a2597c7324409c';
export const CANARY_DIGEST = '6a8c36427046c0713a11bfc72c2e7679db563c12ad460bd2e8f86c85e1bb472d';
export const W0_TEST_DIGEST = 'b61c21e58ca083ea7e7f5926ac9e3f81c01144bfc6dc594301fffb80dfb6fb4d';
export const W0_MUTANTS_DIGEST = 'c850203caf366be7918ae9365736f60d589f9b5592b7977bdaea78fbd5a24487';
export const LEASE_DIGEST = '33355953d54f05f4c878d8cafc3fceebff3b94457664dfb75d8374bffc946f3b';
export const FENCE_DIGEST = '6157dade787f7dc7dc36c8a68b21e02d0320147c31b662e1e9ab237f7b5ee582';
export const FENCE_COUNTER = 46;
export const WORD_VERSION = '16.112';
export const WORD_BUILD = '16.112.26081010';
export const ELECTRON_VERSION = '41.10.3';
export const ELECTRON_ARCHIVE_BASENAME = 'electron-v41.10.3-darwin-arm64.zip';
export const ELECTRON_ARCHIVE_DIGEST = '8961cdb57c95c073ff4770bc9309953832f447575f1a91127010f7b4870884b3';
export const ELECTRON_ARCHIVE_SIZE_BYTES = 116554065;
export const CONTROL_PLANE_EVIDENCE_STAMP_ID = 'ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS';
export const T7_UUID = 'D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2';
export const SEALED_RAW_MANIFEST_DIGEST = 'f286fe31a50a798b01c0e9696500e1eec765129af5436410f3f09b5d410bb05d';
export const SEALED_CANARY_RESULT_DIGEST = '71b19d800f1620505352b3093111abe8510ae5cb5d5f2b31b467c95d63cc4892';
export const SEALED_CANARY_RESULT_SIZE_BYTES = 55978;
export const SEALED_RAW_RUN_CAPABILITY_ID = 'CAP_R24_C8B_RAW_RUN_02831A912D441046';

const T7_MOUNT = '/Volumes/T7-Secure';
const RAW_ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/r24-corrective-physical-evidence/c8b';
const CANONICAL_REPO = '/Volumes/T7-Secure/storage/yalken/canonical/writer-editor-codex';
const WORD_APP = '/Applications/Microsoft Word.app';
const HS_BINARY = '/opt/homebrew/bin/hs';
const LOCAL_LEASE = '/private/tmp/yalken-r24-corrective-canonical-writer.lock/lease-c8b-word-physical-v1.json';
const LOCAL_FENCE = '/private/tmp/yalken-r24-corrective-canonical-writer.lock/fence-c8b-word-physical-v1.json';
const WORD_COUNTS = Object.freeze({
  formatting: 0,
  reply_attempt: 0,
  root_comment: 4,
  state_attempt: 0,
  structural: 0,
  tracked_delete: 0,
  tracked_insert: 0,
  tracked_replace: 0,
});
export const ROOT_SEMANTIC_EXPECTED = Object.freeze({
  commandReceiptCount: 4,
  commentThreadCount: 4,
  identityJoinCount: 4,
  reopenedCanonicalCount: 4,
  rootApplied: 4,
  triangleGreen: true,
});
const LEXICAL = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export const PATHS = Object.freeze({
  activeApprovals: 'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  approvals: 'docs/OPS/R24/CORRECTIVE/C8B_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  canary: 'scripts/ops/rtk-word-c5v2-physical-canary.mjs',
  contract: 'docs/OPS/R24/CORRECTIVE/C8B_WORD_PHYSICAL_CONTRACT_V1.json',
  evidence: 'docs/OPS/R24/CORRECTIVE/C8B_WORD_PHYSICAL_EVIDENCE_V1.json',
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  ownerDecision: 'docs/OPS/R24/OWNER_GATE_DECISIONS/WORD_PHYSICAL_SESSION_AUTHORITY_W0_WORD_PHYSICAL_RECERTIFICATION_V1.json',
  program: 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json',
  registry: 'docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json',
  script: 'scripts/ops/r24/corrective/c8b-word-physical.mjs',
  stageAdmission: 'docs/OPS/R24/CORRECTIVE/C8B_STAGE_ADMISSION_ATTESTATION_V1.json',
  stageInstance: 'docs/OPS/R24/CORRECTIVE/C8B_STAGE_INSTANCE_V1.json',
  standing: 'docs/OPS/R24/CORRECTIVE/STANDING_AUTHORITY_BINDING_V1.json',
  test: 'test/contracts/r24-c8b-word-physical.contract.test.mjs',
  trust: 'docs/OPS/R24/CORRECTIVE/TERMINAL_ATTESTATION_TRUST_MODEL_V1.json',
  w0Mutants: 'test/unit/r24-w0-word-physical-mutants.test.js',
  w0Test: 'test/unit/r24-w0-word-physical-recertification.test.js',
});

export const WRITE_SET = Object.freeze([
  PATHS.inventory,
  PATHS.activeApprovals,
  PATHS.approvals,
  PATHS.stageAdmission,
  PATHS.stageInstance,
  PATHS.contract,
  PATHS.evidence,
  PATHS.script,
  PATHS.test,
].sort(LEXICAL));

export class C8BWordPhysicalError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

function fail(code, detail) { throw new C8BWordPhysicalError(code, detail); }
function assert(condition, code, detail) { if (!condition) fail(code, detail); }
export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function readJsonBytes(repoRoot, relativePath, canonical = false) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  const value = JSON.parse(bytes.toString('utf8'));
  if (canonical) assert(bytes.equals(canonicalBytes(value)), 'E_NON_CANONICAL_INPUT', relativePath);
  return { bytes, digest: sha256(bytes), value };
}

function git(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', timeout: 30000 });
  assert(result.status === 0, 'E_GIT', `${args.join(' ')}:${String(result.stderr || '').trim()}`);
  return String(result.stdout || '').trim();
}

function statusPaths(repoRoot) {
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repoRoot, encoding: 'utf8', timeout: 30000 });
  assert(result.status === 0, 'E_GIT', 'status');
  const output = String(result.stdout || '').trimEnd();
  return output ? output.split('\n').map((line) => line.slice(3)).sort(LEXICAL) : [];
}

function sameSet(actual, expected) {
  return JSON.stringify([...new Set(actual)].sort(LEXICAL)) === JSON.stringify([...new Set(expected)].sort(LEXICAL));
}

function sameCounts(actual, expected) {
  return sameSet(Object.keys(actual || {}), Object.keys(expected || {}))
    && Object.entries(expected || {}).every(([key, value]) => Number(actual?.[key]) === Number(value));
}

export function validateBoundedDeltaObservation(observation) {
  const {
    candidateSha,
    changedPaths = [],
    commitCount,
    label = 'CANDIDATE',
    sourceHeadSha = SOURCE_HEAD_SHA,
    sourceIsAncestor,
  } = observation || {};
  assert(/^[0-9a-f]{40}$/u.test(candidateSha || '') && /^[0-9a-f]{40}$/u.test(sourceHeadSha || ''), 'E_DELTA_SHA', label);
  assert(sourceHeadSha === SOURCE_HEAD_SHA, 'E_DELTA_SOURCE_HEAD', sourceHeadSha);
  assert(sourceIsAncestor === true, 'E_SOURCE_HEAD_NOT_ANCESTOR', `${label}:${candidateSha}`);
  assert(Number.isInteger(commitCount) && commitCount >= 0 && commitCount <= 2, 'E_UNBOUNDED_DELTA', `${label}:${commitCount}`);
  assert(Array.isArray(changedPaths), 'E_DELTA_PATHS', label);
  if (candidateSha === sourceHeadSha) {
    assert(commitCount === 0 && changedPaths.length === 0, 'E_SOURCE_DELTA_NOT_EMPTY', label);
  } else {
    assert(commitCount >= 1, 'E_DESCENDANT_DELTA_EMPTY', label);
  }
  for (const relativePath of changedPaths) {
    assert(typeof relativePath === 'string'
      && relativePath.length > 0
      && relativePath === path.posix.normalize(relativePath)
      && !path.posix.isAbsolute(relativePath)
      && relativePath !== '..'
      && !relativePath.startsWith('../')
      && !relativePath.includes('\\'), 'E_DELTA_PATH_NORMALIZATION', String(relativePath));
    assert(WRITE_SET.includes(relativePath), 'E_WRITE_SET_DRIFT', `${label}:${relativePath}`);
  }
  assert(new Set(changedPaths).size === changedPaths.length, 'E_DELTA_PATH_DUPLICATE', label);
  return true;
}

function observeAndValidateDelta(repoRoot, candidateSha, label) {
  if (candidateSha === SOURCE_HEAD_SHA) {
    validateBoundedDeltaObservation({ candidateSha, changedPaths: [], commitCount: 0, label, sourceIsAncestor: true });
    return;
  }
  const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', SOURCE_HEAD_SHA, candidateSha], { cwd: repoRoot, encoding: 'utf8', timeout: 30000 });
  assert(ancestor.status === 0 || ancestor.status === 1, 'E_GIT', `merge-base:${label}:${String(ancestor.stderr || '').trim()}`);
  const changedPaths = git(repoRoot, ['diff', '--name-only', SOURCE_HEAD_SHA, candidateSha]).split('\n').filter(Boolean);
  validateBoundedDeltaObservation({
    candidateSha,
    changedPaths,
    commitCount: Number(git(repoRoot, ['rev-list', '--count', `${SOURCE_HEAD_SHA}..${candidateSha}`])),
    label,
    sourceIsAncestor: ancestor.status === 0,
  });
}

export function assertHeadContour(repoRoot = process.cwd()) {
  const currentHead = git(repoRoot, ['rev-parse', 'HEAD']);
  const originMainSha = git(repoRoot, ['rev-parse', 'origin/main']);
  assert(git(repoRoot, ['rev-parse', `${SOURCE_HEAD_SHA}^{tree}`]) === SOURCE_TREE_SHA, 'E_SOURCE_TREE', SOURCE_TREE_SHA);
  observeAndValidateDelta(repoRoot, currentHead, 'CURRENT_HEAD');
  observeAndValidateDelta(repoRoot, originMainSha, 'ORIGIN_MAIN');
  for (const relativePath of statusPaths(repoRoot)) assert(WRITE_SET.includes(relativePath), 'E_DIRTY_PATH_OUTSIDE_WRITE_SET', relativePath);
  return { currentHead, originMainSha, sourceHeadSha: SOURCE_HEAD_SHA, sourceTreeSha: SOURCE_TREE_SHA };
}

function assertOwnerDecision(decision) {
  const scope = decision.authorizedScope || {};
  assert(decision.decision === 'APPROVED' && decision.noSelfApproval === true, 'E_OWNER_DECISION', decision.decision);
  assert(scope.syntheticCorpusOnly === true && scope.wordPhysicalSession === true, 'E_OWNER_WORD_SCOPE', 'missing');
  for (const field of ['userDocuments', 'existingUserDriveFiles', 'safeApplyExpansion', 'parserAuthorityTransfer', 'providerEvidenceTransfer', 'dependencyAdoption', 'signing', 'notarization', 'publicDistribution', 'releaseAuthority', 'cloudAuthority', 'userDataMutation', 'destructiveOrIrreversibleAction']) {
    assert(scope[field] === false, 'E_OWNER_SCOPE_EXPANSION', field);
  }
}

export function validateBindings(repoRoot = process.cwd()) {
  const program = readJsonBytes(repoRoot, PATHS.program, true);
  const registry = readJsonBytes(repoRoot, PATHS.registry, true);
  const trust = readJsonBytes(repoRoot, PATHS.trust, true);
  const standing = readJsonBytes(repoRoot, PATHS.standing, true);
  const stage = readJsonBytes(repoRoot, PATHS.stageInstance, true);
  const admission = readJsonBytes(repoRoot, PATHS.stageAdmission, true);
  const decision = readJsonBytes(repoRoot, PATHS.ownerDecision);
  assert(program.digest === PROGRAM_TEMPLATE_DIGEST, 'E_PROGRAM_DIGEST', program.digest);
  assert(registry.digest === STAGE_REGISTRY_DIGEST, 'E_REGISTRY_DIGEST', registry.digest);
  assert(trust.digest === TRUST_MODEL_DIGEST, 'E_TRUST_DIGEST', trust.digest);
  assert(standing.digest === OWNER_BINDING_DIGEST, 'E_STANDING_DIGEST', standing.digest);
  assert(stage.digest === STAGE_INSTANCE_DIGEST, 'E_STAGE_INSTANCE_DIGEST', stage.digest);
  assert(admission.digest === STAGE_ADMISSION_DIGEST, 'E_STAGE_ADMISSION_DIGEST', admission.digest);
  assert(decision.digest === OWNER_WORD_DECISION_DIGEST, 'E_OWNER_DECISION_DIGEST', decision.digest);
  assertOwnerDecision(decision.value);
  assert(stage.value.stageId === STAGE_ID && admission.value.stageId === STAGE_ID, 'E_STAGE_ID', STAGE_ID);
  assert(stage.value.baseSha === SOURCE_HEAD_SHA && stage.value.headSha === SOURCE_HEAD_SHA && stage.value.treeSha === SOURCE_TREE_SHA, 'E_STAGE_SOURCE', STAGE_ID);
  assert(stage.value.predecessorTerminalDigest === PREDECESSOR_TERMINAL_DIGEST, 'E_PREDECESSOR_TERMINAL', STAGE_ID);
  assert(stage.value.predecessorCertifiedDoneReceiptDigest === PREDECESSOR_CERTIFIED_DONE_RECEIPT_DIGEST, 'E_PREDECESSOR_RECEIPT', STAGE_ID);
  assert(stage.value.predecessorLeaseReleaseDigest === PREDECESSOR_LEASE_RELEASE_DIGEST, 'E_PREDECESSOR_RELEASE', STAGE_ID);
  assert(stage.value.dependencies?.length === 1 && stage.value.dependencies[0]?.stageId === 'C8A'
    && stage.value.dependencies[0]?.status === 'CERTIFIED_DONE'
    && stage.value.dependencies[0]?.attestationDigest === PREDECESSOR_TERMINAL_DIGEST, 'E_C8A_DEPENDENCY', STAGE_ID);
  assert(sameSet(stage.value.writeSet.paths, WRITE_SET), 'E_WRITE_SET', STAGE_ID);
  assert(admission.value.status === 'ADMITTED' && admission.value.stageInstanceDigest === STAGE_INSTANCE_DIGEST, 'E_NOT_ADMITTED', STAGE_ID);
  assert(admission.value.acceptanceSignalsDigest === ACCEPTANCE_SIGNALS_DIGEST, 'E_ACCEPTANCE_DIGEST', STAGE_ID);
  assert(admission.value.writeSetDigest === WRITE_SET_DIGEST
    && admission.value.writeSetDigest === sha256(canonicalBytes(stage.value.writeSet)), 'E_WRITE_SET_DIGEST', STAGE_ID);
  assert(sha256(fs.readFileSync(path.join(repoRoot, PATHS.canary))) === CANARY_DIGEST, 'E_CANARY_DIGEST', PATHS.canary);
  assert(sha256(fs.readFileSync(path.join(repoRoot, PATHS.w0Test))) === W0_TEST_DIGEST, 'E_W0_TEST_DIGEST', PATHS.w0Test);
  assert(sha256(fs.readFileSync(path.join(repoRoot, PATHS.w0Mutants))) === W0_MUTANTS_DIGEST, 'E_W0_MUTANTS_DIGEST', PATHS.w0Mutants);
  return { admission, decision, program, registry, stage, standing, trust };
}

function fileBinding(repoRoot, relativePath, capabilityId, role) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  return { capabilityId, role, sha256: sha256(bytes), sizeBytes: bytes.length };
}

export function assertPathlessPublicEvidence(value) {
  const visit = (candidate) => {
    if (typeof candidate === 'string') {
      assert(!candidate.includes('/Users/') && !candidate.includes('/Volumes/') && !candidate.includes('/private/') && !candidate.includes('\\'), 'E_PUBLIC_PATH_LEAK', candidate);
    } else if (Array.isArray(candidate)) candidate.forEach(visit);
    else if (candidate && typeof candidate === 'object') Object.values(candidate).forEach(visit);
  };
  visit(value);
  return true;
}

export function buildContract(repoRoot = process.cwd()) {
  validateBindings(repoRoot);
  const contract = {
    acceptanceSignals: {
      EXTERNAL_TERMINAL_ATTESTATION_VERIFIED: 'PENDING_POST_MERGE_EXTERNAL_C8B_ATTESTATION',
      FIXED_AUTHORITY_BINDING: true,
      FRESH_WORD_SESSION_WINDOW: true,
      LIFECYCLE_ROOT_OPERATIONS_PRESERVED: true,
      NO_USER_DOCS_OR_CREDENTIALS: true,
      OWNER_WORD_PHYSICAL_SESSION_AUTHORITY_BOUND: true,
      SYNTHETIC_DOCUMENT_ONLY: true,
      WORD_PHYSICAL_PASS: true,
    },
    boundedLedger: {
      familyCounts: WORD_COUNTS,
      lifecycleReplyStateApplicability: 'NOT_APPLICABLE_ZERO_DENOMINATOR',
      lifecycleRootRule: 'EVERY_ROOT_COMMENT_OPERATION_MUST_SURVIVE_WORD_SAVE_REOPEN_AND_PRODUCT_RETURN_INTAKE',
      operationCount: Object.values(WORD_COUNTS).reduce((sum, count) => sum + count, 0),
      rootSemanticOracleExpected: ROOT_SEMANTIC_EXPECTED,
      sceneCount: 2,
    },
    claimCeiling: 'C8B_SYNTHETIC_WORD_PHYSICAL_ENVELOPE_ONLY',
    nonClaims: ['NO_USER_DOCUMENT_QUALIFICATION', 'NO_NATIVE_REPLY_OR_STATE_CERTIFICATION', 'NO_SAFE_APPLY_EXPANSION', 'NO_SIGNING_NOTARIZATION_DISTRIBUTION_RELEASE', 'NO_WORD_PRODUCT_TERMINAL_PASS', 'NO_PROGRAM_DONE'],
    ownerAuthority: {
      capabilityId: 'CAP_R24_C8B_OWNER_WORD_PHYSICAL_DECISION',
      role: 'OWNER_APPROVED_SYNTHETIC_WORD_SESSION_AUTHORITY',
      sha256: OWNER_WORD_DECISION_DIGEST,
    },
    rawArtifactPolicy: {
      artifactRootCapabilityId: 'CAP_R24_C8B_STABLE_T7_RAW_ARTIFACT_ROOT',
      durableNonOverwritingRunDirectory: true,
      outsideEveryGitCheckout: true,
      publicEvidenceFields: ['CAPABILITY_ID', 'ROLE', 'SHA256', 'SIZE_BYTES'],
      rawArtifactsRetained: true,
      sealedCanaryResultRole: 'SEALED_SYNTHETIC_WORD_CANARY_RESULT',
    },
    localToolchain: {
      electronArchive: { capabilityId: 'CAP_R24_C8B_ELECTRON_ARCHIVE', role: 'IMMUTABLE_LOCAL_EXPORT_TOOLCHAIN_INPUT', sha256: ELECTRON_ARCHIVE_DIGEST, sizeBytes: ELECTRON_ARCHIVE_SIZE_BYTES },
      ephemeralExtractionOnly: true,
      repositoryDependencyMutation: false,
      version: ELECTRON_VERSION,
    },
    safetyBoundary: {
      credentialsRead: false,
      initialWordProcessCount: 0,
      initialWordDocumentCount: 0,
      processOwnership: 'QUIT_ONLY_WORD_PROCESS_STARTED_BY_THIS_RUN_AFTER_ZERO_DOCUMENTS_CONFIRMED',
      syntheticCorpusOnly: true,
      userDocumentsRead: 0,
      userDocumentsTouched: false,
      userDocumentsWritten: 0,
    },
    schemaVersion: 'YALKEN_R24_C8B_WORD_PHYSICAL_CONTRACT_V1',
    sourceBindings: {
      acceptanceSignalsDigest: ACCEPTANCE_SIGNALS_DIGEST,
      canary: fileBinding(repoRoot, PATHS.canary, 'CAP_R24_C8B_WORD_CANARY', 'EXISTING_PHYSICAL_WORD_RUNNER'),
      fenceCounter: FENCE_COUNTER,
      fenceDigest: FENCE_DIGEST,
      focusedTest: fileBinding(repoRoot, PATHS.test, 'CAP_R24_C8B_FOCUSED_TEST', 'INDEPENDENT_CONTRACT_TEST'),
      leaseDigest: LEASE_DIGEST,
      ownerAuthorityBindingDigest: OWNER_BINDING_DIGEST,
      ownerDecisionDigest: OWNER_WORD_DECISION_DIGEST,
      predecessorCertifiedDoneReceiptDigest: PREDECESSOR_CERTIFIED_DONE_RECEIPT_DIGEST,
      predecessorLeaseReleaseDigest: PREDECESSOR_LEASE_RELEASE_DIGEST,
      predecessorTerminalDigest: PREDECESSOR_TERMINAL_DIGEST,
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      sourceHeadSha: SOURCE_HEAD_SHA,
      sourceTreeSha: SOURCE_TREE_SHA,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
      stageRegistryDigest: STAGE_REGISTRY_DIGEST,
      testInventory: fileBinding(repoRoot, PATHS.inventory, 'CAP_R24_C8B_TEST_INVENTORY', 'CURRENT_TEST_INVENTORY'),
      trustModelDigest: TRUST_MODEL_DIGEST,
      w0Mutants: fileBinding(repoRoot, PATHS.w0Mutants, 'CAP_R24_C8B_W0_MUTANTS', 'WORD_PHYSICAL_MUTATION_TESTS'),
      w0Test: fileBinding(repoRoot, PATHS.w0Test, 'CAP_R24_C8B_W0_TEST', 'WORD_PHYSICAL_RECERTIFICATION_TESTS'),
      writeSetDigest: WRITE_SET_DIGEST,
    },
    stageId: STAGE_ID,
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    wordRuntime: { build: WORD_BUILD, platform: 'darwin-arm64', version: WORD_VERSION },
  };
  assertPathlessPublicEvidence(contract);
  return contract;
}

function readExactLocalLease() {
  for (const [filePath, digest, type] of [[LOCAL_LEASE, LEASE_DIGEST, 'lease'], [LOCAL_FENCE, FENCE_DIGEST, 'fence']]) {
    assert(fs.existsSync(filePath), 'E_LOCAL_LEASE_FENCE_MISSING', type);
    const bytes = fs.readFileSync(filePath);
    assert(sha256(bytes) === digest, 'E_LOCAL_LEASE_FENCE_DIGEST', type);
    const value = JSON.parse(bytes.toString('utf8'));
    assert(value.stageId === STAGE_ID && value.status === 'ACTIVE' && value.fencingCounter === FENCE_COUNTER && value.wip === 1, 'E_LOCAL_LEASE_FENCE_STATE', type);
  }
}

function findElectronArchive() {
  const cacheRoot = path.join(os.homedir(), 'Library', 'Caches', 'electron');
  const matches = [];
  const visit = (directory, depth) => {
    assert(depth <= 8, 'E_ELECTRON_ARCHIVE_DISCOVERY', 'depth');
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en-US'))) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(candidate, depth + 1);
      else if (entry.isFile() && entry.name === ELECTRON_ARCHIVE_BASENAME) matches.push(candidate);
    }
  };
  assert(fs.existsSync(cacheRoot), 'E_ELECTRON_ARCHIVE_MISSING', ELECTRON_ARCHIVE_BASENAME);
  visit(cacheRoot, 0);
  assert(matches.length === 1, 'E_ELECTRON_ARCHIVE_AMBIGUOUS', String(matches.length));
  const bytes = fs.readFileSync(matches[0]);
  assert(bytes.length === ELECTRON_ARCHIVE_SIZE_BYTES && sha256(bytes) === ELECTRON_ARCHIVE_DIGEST, 'E_ELECTRON_ARCHIVE_BINDING', ELECTRON_ARCHIVE_BASENAME);
  return matches[0];
}

function prepareEphemeralElectronRuntime() {
  const archivePath = findElectronArchive();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-r24-c8b-electron-'));
  const extractRoot = path.join(tempRoot, 'runtime');
  const overrideRoot = path.join(tempRoot, 'override');
  fs.mkdirSync(extractRoot);
  fs.mkdirSync(overrideRoot);
  const extracted = run('/usr/bin/ditto', ['-x', '-k', archivePath, extractRoot], { timeout: 120000 });
  assert(extracted.status === 0, 'E_ELECTRON_EXTRACT', extracted.stderrText.trim());
  const binary = path.join(extractRoot, 'Electron.app', 'Contents', 'MacOS', 'Electron');
  assert(fs.existsSync(binary), 'E_ELECTRON_BINARY', ELECTRON_VERSION);
  const launcher = path.join(overrideRoot, 'electron');
  fs.writeFileSync(launcher, `#!/bin/sh\nexec ${JSON.stringify(binary)} "$@"\n`, { encoding: 'utf8', mode: 0o700 });
  return { overrideRoot, tempRoot };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 900000, ...options });
  return { ...result, stderrText: String(result.stderr || ''), stdoutText: String(result.stdout || '') };
}

function wordPids() {
  const result = run('/usr/bin/pgrep', ['-x', 'Microsoft Word'], { timeout: 10000 });
  if (result.status === 1) return [];
  assert(result.status === 0, 'E_WORD_PROCESS_QUERY', result.stderrText.trim());
  return result.stdoutText.trim().split(/\s+/u).filter(Boolean).map(Number).filter(Number.isInteger).sort((a, b) => a - b);
}

function readWordRuntime() {
  const version = run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', path.join(WORD_APP, 'Contents', 'Info.plist')], { timeout: 15000 });
  const build = run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleVersion', path.join(WORD_APP, 'Contents', 'Info.plist')], { timeout: 15000 });
  assert(version.status === 0 && build.status === 0, 'E_WORD_RUNTIME', `${version.stderrText}:${build.stderrText}`);
  const actual = { version: version.stdoutText.trim(), build: build.stdoutText.trim() };
  assert(actual.version === WORD_VERSION && actual.build === WORD_BUILD, 'E_WORD_RUNTIME_IDENTITY', `${actual.version}:${actual.build}`);
  return actual;
}

function verifyT7AndArtifactRoot() {
  const info = run('/usr/sbin/diskutil', ['info', T7_MOUNT], { timeout: 30000 });
  assert(info.status === 0, 'E_T7_INFO', info.stderrText.trim());
  assert(info.stdoutText.includes(`Volume UUID:               ${T7_UUID}`), 'E_T7_UUID', 'mismatch');
  assert(/FileVault:\s+Yes/u.test(info.stdoutText), 'E_T7_ENCRYPTION', 'FileVault');
  assert(/Volume Read-Only:\s+No/u.test(info.stdoutText), 'E_T7_READ_ONLY', 'volume');
  fs.accessSync(T7_MOUNT, fs.constants.R_OK | fs.constants.W_OK);
  fs.mkdirSync(RAW_ARTIFACT_ROOT, { recursive: true });
  fs.accessSync(RAW_ARTIFACT_ROOT, fs.constants.R_OK | fs.constants.W_OK);
  const realRoot = fs.realpathSync(RAW_ARTIFACT_ROOT);
  const realMount = fs.realpathSync(T7_MOUNT);
  const relativeToMount = path.relative(realMount, realRoot);
  assert(relativeToMount && !relativeToMount.startsWith('..') && !path.isAbsolute(relativeToMount), 'E_RAW_ROOT_NOT_T7', 'root');
  const worktrees = git(CANONICAL_REPO, ['worktree', 'list', '--porcelain']).split('\n')
    .filter((line) => line.startsWith('worktree ')).map((line) => fs.realpathSync(line.slice(9)));
  for (const worktree of worktrees) {
    const relative = path.relative(worktree, realRoot);
    assert(relative.startsWith('..') || path.isAbsolute(relative), 'E_RAW_ROOT_IN_GIT_CHECKOUT', path.basename(worktree));
  }
  return { fileVault: true, uuid: T7_UUID, writable: true };
}

function hammerspoonAccessibilityState() {
  assert(fs.existsSync(HS_BINARY), 'E_HAMMERSPOON_BINARY', 'missing');
  const result = run(HS_BINARY, ['-t', '30', '-q', '-c', 'return hs.accessibilityState()'], { timeout: 35000 });
  assert(result.status === 0 && result.stdoutText.trim() === 'true', 'E_HAMMERSPOON_ACCESSIBILITY', `${result.status}:${result.stderrText.trim()}`);
  return true;
}

function quitStartedWordAfterZeroDocuments() {
  const beforeQuit = wordPids();
  if (beforeQuit.length === 0) return { documentCountBeforeQuit: 0, processCountAfterQuit: 0, processCountBeforeQuit: 0 };
  const appleScript = [
    'tell application "Microsoft Word"',
    '  set yDocumentCount to count of documents',
    'end tell',
    'if yDocumentCount is not 0 then error "C8B_WORD_DOCUMENTS_REMAIN:" & yDocumentCount number 9811',
    'tell application "Microsoft Word" to quit',
    'return "DOCUMENT_COUNT_BEFORE_QUIT=" & yDocumentCount',
  ].join('\n');
  const lua = [
    `local yScript = ${JSON.stringify(appleScript)}`,
    'local yOk, yResult, yDescriptor = hs.osascript.applescript(yScript)',
    'if yOk then return tostring(yResult or "") end',
    'error(tostring(yResult or yDescriptor or "C8B_WORD_GRACEFUL_QUIT_FAILED"))',
  ].join('\n');
  const quit = run(HS_BINARY, ['-t', '30', '-q', '-c', lua], { timeout: 35000 });
  assert(quit.status === 0 && quit.stdoutText.includes('DOCUMENT_COUNT_BEFORE_QUIT=0'), 'E_WORD_GRACEFUL_QUIT', `${quit.stderrText}:${quit.stdoutText}`);
  const deadline = Date.now() + 10000;
  let afterQuit = wordPids();
  while (afterQuit.length > 0 && Date.now() < deadline) afterQuit = wordPids();
  assert(afterQuit.length === 0, 'E_WORD_PROCESS_REMAINS', afterQuit.join(','));
  return { documentCountBeforeQuit: 0, processCountAfterQuit: 0, processCountBeforeQuit: beforeQuit.length };
}

function parseCanarySummary(stdout) {
  const trimmed = String(stdout || '').trim();
  try { return JSON.parse(trimmed); } catch {}
  const start = trimmed.indexOf('{');
  assert(start >= 0, 'E_CANARY_RESULT_MISSING', trimmed.slice(-1000));
  try { return JSON.parse(trimmed.slice(start)); } catch (error) { fail('E_CANARY_RESULT_PARSE', error.message); }
}

function walkRegularFiles(directory) {
  const out = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en-US'))) {
      const absolute = path.join(current, entry.name);
      assert(!entry.isSymbolicLink(), 'E_RAW_ARTIFACT_SYMLINK', entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) out.push(absolute);
      else fail('E_RAW_ARTIFACT_TYPE', entry.name);
    }
  };
  visit(directory);
  return out;
}

function durableWriteExclusive(filePath, bytes) {
  const fd = fs.openSync(filePath, 'wx', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  const dirFd = fs.openSync(path.dirname(filePath), 'r');
  try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
}

function sealRawArtifacts(runDir, runId) {
  const manifestPath = path.join(runDir, 'c8b-pathless-manifest.json');
  assert(!fs.existsSync(manifestPath), 'E_RAW_MANIFEST_COLLISION', 'manifest');
  const regularFiles = walkRegularFiles(runDir);
  const files = regularFiles.map((filePath, index) => {
    const bytes = fs.readFileSync(filePath);
    return { capabilityId: `CAP_R24_C8B_RAW_FILE_${String(index + 1).padStart(4, '0')}`, role: 'RAW_SYNTHETIC_WORD_CANARY_ARTIFACT', sha256: sha256(bytes), sizeBytes: bytes.length };
  });
  const canaryIndex = regularFiles.findIndex((filePath) => path.basename(filePath) === 'canary-result.json');
  assert(canaryIndex >= 0, 'E_CANARY_RESULT_MISSING', 'raw');
  const manifest = {
    artifacts: files,
    runCapabilityId: `CAP_R24_C8B_RAW_RUN_${sha256(Buffer.from(runId, 'utf8')).slice(0, 16).toUpperCase()}`,
    schemaVersion: 'YALKEN_R24_C8B_RAW_ARTIFACT_MANIFEST_V1',
    sourceMetadata: { ownerDecisionDigest: OWNER_WORD_DECISION_DIGEST, sourceHeadSha: SOURCE_HEAD_SHA, sourceTreeSha: SOURCE_TREE_SHA, stageAdmissionDigest: STAGE_ADMISSION_DIGEST, stageInstanceDigest: STAGE_INSTANCE_DIGEST },
    syntheticOnly: true,
    totalBytes: files.reduce((sum, file) => sum + file.sizeBytes, 0),
    userDocumentsTouched: false,
  };
  const bytes = canonicalBytes(manifest);
  durableWriteExclusive(manifestPath, bytes);
  assert(fs.readFileSync(manifestPath).equals(bytes), 'E_RAW_MANIFEST_READBACK', 'bytes');
  return {
    artifactCount: files.length,
    durable: true,
    manifest: { capabilityId: 'CAP_R24_C8B_RAW_ARTIFACT_MANIFEST', role: 'DURABLE_PATHLESS_RAW_EVIDENCE_INDEX', sha256: sha256(bytes), sizeBytes: bytes.length },
    nonOverwriting: true,
    runCapabilityId: manifest.runCapabilityId,
    sealedCanaryResult: { capabilityId: 'CAP_R24_C8B_SEALED_CANARY_RESULT', role: 'SEALED_SYNTHETIC_WORD_CANARY_RESULT', sha256: files[canaryIndex].sha256, sizeBytes: files[canaryIndex].sizeBytes },
    totalBytes: manifest.totalBytes,
  };
}

export function validateRootSemanticOracle(oracle) {
  assert(oracle && typeof oracle === 'object' && !Array.isArray(oracle), 'E_ROOT_SEMANTIC_ORACLE', 'missing');
  assert(sameSet(Object.keys(oracle), Object.keys(ROOT_SEMANTIC_EXPECTED)), 'E_ROOT_SEMANTIC_ORACLE', 'fields');
  for (const [field, expected] of Object.entries(ROOT_SEMANTIC_EXPECTED)) {
    assert(oracle[field] === expected, 'E_ROOT_SEMANTIC_ORACLE', `${field}:${String(oracle[field])}`);
  }
  return true;
}

function assertCanaryGreen(summary, ledger) {
  assert(summary.headSha === SOURCE_HEAD_SHA && summary.originMainSha === SOURCE_HEAD_SHA, 'E_CANARY_GIT_IDENTITY', `${summary.headSha}:${summary.originMainSha}`);
  assert(summary.wordVersion === WORD_VERSION, 'E_CANARY_WORD_VERSION', summary.wordVersion);
  assert(summary.exportResult?.ok === true, 'E_CANARY_EXPORT', 'red');
  assert(summary.wordStatus === 'PASS', 'E_CANARY_WORD_STATUS', summary.wordStatus);
  assert(summary.nativeLifecycleVerification?.ok === true, 'E_CANARY_NATIVE_LIFECYCLE', JSON.stringify(summary.nativeLifecycleVerification));
  assert(summary.oracleProbe?.ok === true, 'E_CANARY_ORACLE', 'red');
  assert(summary.productReturnApply?.ok === true, 'E_CANARY_PRODUCT_RETURN', 'red');
  assert(Array.isArray(summary.productRouteGaps) && summary.productRouteGaps.length === 0, 'E_CANARY_ROUTE_GAPS', JSON.stringify(summary.productRouteGaps));
  assert(ledger.operationCount === Object.values(WORD_COUNTS).reduce((sum, count) => sum + count, 0), 'E_LEDGER_OPERATION_COUNT', String(ledger.operationCount));
  assert(sameCounts(ledger.familyCounts, WORD_COUNTS), 'E_LEDGER_COUNTS', JSON.stringify(ledger.familyCounts));
  const rootIds = new Set(ledger.operations.filter((operation) => operation.family === 'root_comment').map((operation) => operation.id));
  const lifecycle = ledger.operations.filter((operation) => ['reply_attempt', 'state_attempt'].includes(operation.family));
  assert(rootIds.size === WORD_COUNTS.root_comment && lifecycle.length === WORD_COUNTS.reply_attempt + WORD_COUNTS.state_attempt, 'E_LIFECYCLE_DENOMINATOR', `${rootIds.size}:${lifecycle.length}`);
  assert(lifecycle.every((operation) => rootIds.has(operation.targetRootOperationId)), 'E_LIFECYCLE_ROOT_BINDING', 'missing');
  const results = summary.nativeLifecycleVerification.results || [];
  assert(results.length === lifecycle.length && results.every((result) => result.status === 'SAFE_APPLY'), 'E_LIFECYCLE_NATIVE_RESULT', JSON.stringify(results));
  const commentProductPath = summary.productReturnApply?.activation?.commentProductPath || {};
  const semanticOracle = commentProductPath.semanticOracle || {};
  const rootSemanticOracle = {
    commandReceiptCount: semanticOracle.commandReceiptCount,
    commentThreadCount: summary.productReturnApply?.activation?.candidateSummary?.commentThreadCount,
    identityJoinCount: commentProductPath.sceneAuthorityIdentityJoin?.identityJoinCount,
    reopenedCanonicalCount: semanticOracle.reopenedCanonicalCount,
    rootApplied: semanticOracle.rootApplied,
    triangleGreen: semanticOracle.triangleGreen,
  };
  validateRootSemanticOracle(rootSemanticOracle);
  assert(summary.productReturnApply?.activation?.reviewGraphCounts?.commentThreads === ROOT_SEMANTIC_EXPECTED.commentThreadCount, 'E_ROOT_SEMANTIC_ORACLE', 'reviewGraphCounts.commentThreads');
  assert(commentProductPath.planSummary?.rootCommentCount === ROOT_SEMANTIC_EXPECTED.rootApplied
    && Array.isArray(commentProductPath.applyReceipts)
    && commentProductPath.applyReceipts.length === ROOT_SEMANTIC_EXPECTED.commandReceiptCount
    && commentProductPath.applyReceipts.every((receipt) => receipt.family === 'root_comment' && receipt.ok === true && receipt.status === 'applied'), 'E_ROOT_SEMANTIC_ORACLE', 'applyReceipts');
  return {
    lifecycleOperationCount: lifecycle.length,
    nativeVerifiedCount: Number(summary.nativeLifecycleVerification.verifiedCount),
    rootOperationCount: rootIds.size,
    rootSemanticOracle,
  };
}

export function runPhysicalCanary(repoRoot = process.cwd()) {
  assert(process.platform === 'darwin' && process.arch === 'arm64', 'E_PHYSICAL_HOST', `${process.platform}-${process.arch}`);
  readExactLocalLease();
  const mount = verifyT7AndArtifactRoot();
  const wordRuntime = readWordRuntime();
  assert(wordPids().length === 0, 'E_FRESH_WORD_SESSION', 'Microsoft Word already running');
  hammerspoonAccessibilityState();
  const beforeEntries = new Set(fs.readdirSync(RAW_ARTIFACT_ROOT));
  const sessionNonce = randomUUID();
  const runPrefix = `c8b-${sessionNonce.replaceAll('-', '')}`;
  const startedAtUtc = new Date().toISOString();
  const electronRuntime = prepareEphemeralElectronRuntime();
  let summary = null;
  let canaryFailure = null;
  let cleanup = null;
  let created = [];
  try {
    const executed = run(process.execPath, [
      path.join(repoRoot, PATHS.canary),
      '--scene-count', '2',
      '--family-counts-json', JSON.stringify(WORD_COUNTS),
      '--artifact-root', RAW_ARTIFACT_ROOT,
      '--run-prefix', runPrefix,
      '--accessibility-runner', 'hammerspoon',
    ], { cwd: repoRoot, env: { ...process.env, ELECTRON_OVERRIDE_DIST_PATH: electronRuntime.overrideRoot } });
    created = fs.readdirSync(RAW_ARTIFACT_ROOT).filter((entry) => !beforeEntries.has(entry) && entry.startsWith(`${runPrefix}-`));
    const resultPath = created.length === 1 ? path.join(RAW_ARTIFACT_ROOT, created[0], 'canary-result.json') : '';
    summary = resultPath && fs.existsSync(resultPath)
      ? JSON.parse(fs.readFileSync(resultPath, 'utf8'))
      : parseCanarySummary(executed.stdoutText);
    if (executed.status !== 0) {
      canaryFailure = `${executed.status}:${summary?.wordStatus || 'UNKNOWN'}:${JSON.stringify(summary?.productRouteGaps || [])}:${executed.stderrText.slice(-4000)}`;
    }
  } finally {
    cleanup = quitStartedWordAfterZeroDocuments();
    fs.rmSync(electronRuntime.tempRoot, { force: true, recursive: true });
  }
  assert(!canaryFailure, 'E_CANARY_EXECUTION', canaryFailure || 'unknown');
  assert(summary, 'E_CANARY_RESULT_MISSING', 'summary');
  assert(created.length === 1 && created[0] === summary.runId, 'E_RAW_RUN_IDENTITY', JSON.stringify(created));
  const runDir = path.join(RAW_ARTIFACT_ROOT, summary.runId);
  const realRoot = fs.realpathSync(RAW_ARTIFACT_ROOT);
  const realRun = fs.realpathSync(runDir);
  const relative = path.relative(realRoot, realRun);
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'E_RAW_RUN_ESCAPE', summary.runId);
  const ledger = JSON.parse(fs.readFileSync(path.join(runDir, 'canary-ledger.json'), 'utf8'));
  const lifecycle = assertCanaryGreen(summary, ledger);
  const rawArtifacts = sealRawArtifacts(runDir, summary.runId);
  return {
    cleanup,
    finishedAtUtc: new Date().toISOString(),
    lifecycle,
    mount,
    rawArtifacts,
    sessionNonceDigest: sha256(Buffer.from(sessionNonce, 'utf8')),
    startedAtUtc,
    summary: {
      headSha: summary.headSha,
      nativeLifecycleOk: summary.nativeLifecycleVerification.ok,
      operationAttempted: summary.wordOperationSummary?.attempted,
      operationReported: summary.wordOperationSummary?.reported,
      oracleOk: summary.oracleProbe.ok,
      originMainSha: summary.originMainSha,
      productReturnApplyOk: summary.productReturnApply.ok,
      routeGapCount: summary.productRouteGaps.length,
      sourceDocxSha256: String(summary.sourceDocxSha256 || '').replace(/^sha256:/u, ''),
      returnedDocxSha256: String(summary.returnedDocxSha256 || '').replace(/^sha256:/u, ''),
      wordStatus: summary.wordStatus,
      wordVersion: summary.wordVersion,
    },
    wordRuntime,
  };
}

export function buildEvidence(contract, receipt) {
  const evidence = {
    acceptanceSignals: {
      FIXED_AUTHORITY_BINDING: 'PASS',
      FRESH_WORD_SESSION_WINDOW: 'PASS',
      LIFECYCLE_ROOT_OPERATIONS_PRESERVED: 'PASS',
      NO_USER_DOCS_OR_CREDENTIALS: 'PASS',
      OWNER_WORD_PHYSICAL_SESSION_AUTHORITY_BOUND: 'PASS',
      SYNTHETIC_DOCUMENT_ONLY: 'PASS',
      WORD_PHYSICAL_PASS: 'PASS',
    },
    contractDigest: sha256(canonicalBytes(contract)),
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    execution: {
      finishedAtUtc: receipt.finishedAtUtc,
      freshWordSession: true,
      sessionNonceDigest: receipt.sessionNonceDigest,
      startedAtUtc: receipt.startedAtUtc,
      wordDocumentCountBeforeRun: 0,
      wordDocumentCountBeforeQuit: receipt.cleanup.documentCountBeforeQuit,
      wordProcessCountAfterQuit: receipt.cleanup.processCountAfterQuit,
      wordProcessCountBeforeRun: 0,
    },
    externalTerminalAttestation: { required: true, status: 'AWAITING_POST_MERGE_EXTERNAL_C8B_ATTESTATION' },
    observations: {
      git: { headSha: receipt.summary.headSha, originMainSha: receipt.summary.originMainSha },
      lifecycle: receipt.lifecycle,
      mount: receipt.mount,
      operations: { attempted: receipt.summary.operationAttempted, familyCounts: WORD_COUNTS, reported: receipt.summary.operationReported },
      rawArtifacts: receipt.rawArtifacts,
      roundTrip: {
        nativeLifecycleOk: receipt.summary.nativeLifecycleOk,
        oracleOk: receipt.summary.oracleOk,
        productReturnApplyOk: receipt.summary.productReturnApplyOk,
        routeGapCount: receipt.summary.routeGapCount,
        sourceDocxSha256: receipt.summary.sourceDocxSha256,
        returnedDocxSha256: receipt.summary.returnedDocxSha256,
        wordStatus: receipt.summary.wordStatus,
      },
      safety: { credentialsRead: false, syntheticCorpusOnly: true, userDocumentsRead: 0, userDocumentsTouched: false, userDocumentsWritten: 0 },
      wordRuntime: receipt.wordRuntime,
    },
    schemaVersion: 'YALKEN_R24_C8B_WORD_PHYSICAL_EVIDENCE_V1',
    sourceBindings: { ownerDecisionDigest: OWNER_WORD_DECISION_DIGEST, programTemplateDigest: PROGRAM_TEMPLATE_DIGEST, sourceHeadSha: SOURCE_HEAD_SHA, sourceTreeSha: SOURCE_TREE_SHA, stageAdmissionDigest: STAGE_ADMISSION_DIGEST, stageInstanceDigest: STAGE_INSTANCE_DIGEST },
    stageId: STAGE_ID,
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
  };
  validateEvidence(evidence, contract);
  assertPathlessPublicEvidence(evidence);
  return evidence;
}

function isHex64(value) { return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value); }

export function validateEvidence(evidence, contract) {
  assert(evidence?.schemaVersion === 'YALKEN_R24_C8B_WORD_PHYSICAL_EVIDENCE_V1', 'E_EVIDENCE_SCHEMA', 'schema');
  assert(evidence.stageId === STAGE_ID && evidence.status === 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION', 'E_EVIDENCE_STATUS', evidence.status);
  assert(evidence.contractDigest === sha256(canonicalBytes(contract)), 'E_CONTRACT_BINDING', evidence.contractDigest);
  for (const signal of ['FIXED_AUTHORITY_BINDING', 'FRESH_WORD_SESSION_WINDOW', 'LIFECYCLE_ROOT_OPERATIONS_PRESERVED', 'NO_USER_DOCS_OR_CREDENTIALS', 'OWNER_WORD_PHYSICAL_SESSION_AUTHORITY_BOUND', 'SYNTHETIC_DOCUMENT_ONLY', 'WORD_PHYSICAL_PASS']) {
    assert(evidence.acceptanceSignals?.[signal] === 'PASS', 'E_ACCEPTANCE_SIGNAL', signal);
  }
  const execution = evidence.execution || {};
  const started = Date.parse(execution.startedAtUtc);
  const finished = Date.parse(execution.finishedAtUtc);
  assert(Number.isFinite(started) && Number.isFinite(finished) && finished >= started && finished - started <= 900000, 'E_EXECUTION_TIME', `${started}:${finished}`);
  assert(execution.freshWordSession === true && execution.wordProcessCountBeforeRun === 0 && execution.wordDocumentCountBeforeRun === 0, 'E_FRESH_WORD_SESSION', 'pre');
  assert(execution.wordDocumentCountBeforeQuit === 0 && execution.wordProcessCountAfterQuit === 0, 'E_WORD_CLEANUP', 'post');
  assert(isHex64(execution.sessionNonceDigest), 'E_SESSION_NONCE', execution.sessionNonceDigest);
  const observations = evidence.observations || {};
  assert(observations.git?.headSha === SOURCE_HEAD_SHA && observations.git?.originMainSha === SOURCE_HEAD_SHA, 'E_GIT_BINDING', 'head');
  assert(observations.wordRuntime?.version === WORD_VERSION && observations.wordRuntime?.build === WORD_BUILD, 'E_WORD_RUNTIME_IDENTITY', JSON.stringify(observations.wordRuntime));
  assert(observations.mount?.uuid === T7_UUID && observations.mount?.fileVault === true && observations.mount?.writable === true, 'E_T7_BINDING', 'mount');
  assert(observations.safety?.syntheticCorpusOnly === true && observations.safety?.userDocumentsTouched === false
    && observations.safety?.userDocumentsRead === 0 && observations.safety?.userDocumentsWritten === 0
    && observations.safety?.credentialsRead === false, 'E_USER_DOCUMENT_BOUNDARY', 'safety');
  assert(sameCounts(observations.operations?.familyCounts, WORD_COUNTS), 'E_LEDGER_COUNTS', JSON.stringify(observations.operations?.familyCounts));
  assert(observations.operations?.attempted === contract.boundedLedger.operationCount && observations.operations?.reported === contract.boundedLedger.operationCount, 'E_OPERATION_DENOMINATOR', `${observations.operations?.attempted}:${observations.operations?.reported}`);
  assert(observations.lifecycle?.rootOperationCount === WORD_COUNTS.root_comment
    && observations.lifecycle?.lifecycleOperationCount === WORD_COUNTS.reply_attempt + WORD_COUNTS.state_attempt
    && observations.lifecycle?.nativeVerifiedCount === observations.lifecycle?.lifecycleOperationCount, 'E_LIFECYCLE_ROOT_PRESERVATION', JSON.stringify(observations.lifecycle));
  validateRootSemanticOracle(observations.lifecycle?.rootSemanticOracle);
  const roundTrip = observations.roundTrip || {};
  assert(roundTrip.wordStatus === 'PASS' && roundTrip.nativeLifecycleOk === true && roundTrip.oracleOk === true
    && roundTrip.productReturnApplyOk === true && roundTrip.routeGapCount === 0, 'E_WORD_PHYSICAL', JSON.stringify(roundTrip));
  assert(isHex64(roundTrip.sourceDocxSha256) && isHex64(roundTrip.returnedDocxSha256), 'E_DOCX_DIGEST', 'missing');
  const raw = observations.rawArtifacts || {};
  assert(raw.durable === true && raw.nonOverwriting === true && Number.isInteger(raw.artifactCount) && raw.artifactCount > 0
    && Number.isInteger(raw.totalBytes) && raw.totalBytes > 0, 'E_RAW_ARTIFACT_PRESERVATION', 'manifest');
  assert(/^CAP_R24_C8B_RAW_RUN_[A-F0-9]{16}$/u.test(raw.runCapabilityId || ''), 'E_RAW_RUN_CAPABILITY', raw.runCapabilityId);
  assert(raw.manifest?.capabilityId === 'CAP_R24_C8B_RAW_ARTIFACT_MANIFEST'
    && raw.manifest?.role === 'DURABLE_PATHLESS_RAW_EVIDENCE_INDEX'
    && isHex64(raw.manifest?.sha256) && Number.isInteger(raw.manifest?.sizeBytes) && raw.manifest.sizeBytes > 0, 'E_RAW_MANIFEST_BINDING', 'manifest');
  assert(raw.sealedCanaryResult?.capabilityId === 'CAP_R24_C8B_SEALED_CANARY_RESULT'
    && raw.sealedCanaryResult?.role === contract.rawArtifactPolicy?.sealedCanaryResultRole
    && isHex64(raw.sealedCanaryResult?.sha256)
    && Number.isInteger(raw.sealedCanaryResult?.sizeBytes)
    && raw.sealedCanaryResult.sizeBytes > 0, 'E_SEALED_CANARY_BINDING', 'result');
  assert(evidence.sourceBindings?.ownerDecisionDigest === OWNER_WORD_DECISION_DIGEST, 'E_OWNER_DECISION_BINDING', 'digest');
  assertPathlessPublicEvidence(evidence);
  return true;
}

function writeCanonical(repoRoot, relativePath, value) {
  fs.writeFileSync(path.join(repoRoot, relativePath), canonicalBytes(value));
}

function approvedPaths() {
  return [PATHS.contract, PATHS.evidence, PATHS.inventory, PATHS.script, PATHS.stageAdmission, PATHS.stageInstance, PATHS.test].sort(LEXICAL);
}

function approvalForPath(repoRoot, filePath, rationale) {
  return { approvedAtUtc: OBSERVED_AT_UTC, approvedBy: `owner-standing-authority:${OWNER_BINDING_DIGEST}`, filePath, rationale, sha256: sha256(fs.readFileSync(path.join(repoRoot, filePath))) };
}

function buildStageApprovals(repoRoot) {
  const rationale = `C8B synthetic-only Microsoft Word physical envelope under StageInstance ${STAGE_INSTANCE_DIGEST}; owner Word-session authority, fresh-process fence, exact lifecycle-root binding, durable pathless raw evidence, fixed authority, no user documents, no credential access, and no signing, distribution, release, terminal Word, or Program DONE expansion remain fail-closed.`;
  return { approvals: approvedPaths().map((filePath) => approvalForPath(repoRoot, filePath, rationale)), evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID], version: 'v1.0' };
}

function isOwnApproval(entry) {
  return entry?.approvedAtUtc === OBSERVED_AT_UTC && typeof entry.rationale === 'string' && entry.rationale.startsWith('C8B synthetic-only Microsoft Word physical envelope under StageInstance ');
}

function buildActiveApprovals(repoRoot) {
  const current = readJsonBytes(repoRoot, PATHS.activeApprovals).value;
  assert(Array.isArray(current.approvals) && current.version === 'v1.0', 'E_ACTIVE_APPROVAL_SCHEMA', 'C1C');
  const paths = [...approvedPaths(), PATHS.approvals].sort(LEXICAL);
  const superseded = new Set(paths);
  const preserved = current.approvals.filter((entry) => !isOwnApproval(entry) && !superseded.has(entry.filePath));
  const rationale = `C8B current synthetic Word physical evidence under StageInstance ${STAGE_INSTANCE_DIGEST}; exact write set, fixed authority, owner physical-session decision, lifecycle-root preservation, durable pathless raw artifacts, zero user-document access, and no release or Program DONE expansion.`;
  return { approvals: [...preserved, ...paths.map((filePath) => approvalForPath(repoRoot, filePath, rationale))], evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID], version: current.version };
}

function result(contract, evidence, mode, extra = {}) {
  return {
    contractDigest: sha256(canonicalBytes(contract)),
    evidenceDigest: sha256(canonicalBytes(evidence)),
    mode,
    rawArtifactManifestDigest: evidence.observations.rawArtifacts.manifest.sha256,
    stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
    stageId: STAGE_ID,
    stageInstanceDigest: STAGE_INSTANCE_DIGEST,
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    wordBuild: evidence.observations.wordRuntime.build,
    wordVersion: evidence.observations.wordRuntime.version,
    ...extra,
  };
}

export function runAndWrite(repoRoot = process.cwd()) {
  assertHeadContour(repoRoot);
  validateBindings(repoRoot);
  writeCanonical(repoRoot, PATHS.inventory, buildInventory(repoRoot));
  const contract = buildContract(repoRoot);
  const evidence = buildEvidence(contract, runPhysicalCanary(repoRoot));
  writeCanonical(repoRoot, PATHS.contract, contract);
  writeCanonical(repoRoot, PATHS.evidence, evidence);
  writeCanonical(repoRoot, PATHS.approvals, buildStageApprovals(repoRoot));
  writeCanonical(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  return result(contract, evidence, 'RUN_AND_WRITE');
}

function readSealedPhysicalReceipt(repoRoot) {
  readExactLocalLease();
  assert(wordPids().length === 0, 'E_FRESH_WORD_SESSION', 'Microsoft Word already running during sealed rebind');
  const mount = verifyT7AndArtifactRoot();
  const previous = readJsonBytes(repoRoot, PATHS.evidence, true).value;
  assert(previous.observations?.rawArtifacts?.manifest?.sha256 === SEALED_RAW_MANIFEST_DIGEST, 'E_RAW_MANIFEST_BINDING', 'previous');
  assert(previous.observations?.rawArtifacts?.runCapabilityId === SEALED_RAW_RUN_CAPABILITY_ID, 'E_RAW_RUN_CAPABILITY', previous.observations?.rawArtifacts?.runCapabilityId);
  const candidates = [];
  for (const entry of fs.readdirSync(RAW_ARTIFACT_ROOT, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, 'en-US'))) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const runDir = path.join(RAW_ARTIFACT_ROOT, entry.name);
    const manifestPath = path.join(runDir, 'c8b-pathless-manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifestBytes = fs.readFileSync(manifestPath);
    if (sha256(manifestBytes) === SEALED_RAW_MANIFEST_DIGEST) candidates.push({ manifestBytes, runDir });
  }
  assert(candidates.length === 1, 'E_SEALED_RAW_RUN_AMBIGUOUS', String(candidates.length));
  const { manifestBytes, runDir } = candidates[0];
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  assert(manifestBytes.equals(canonicalBytes(manifest)), 'E_NON_CANONICAL_INPUT', 'sealed-raw-manifest');
  assert(manifest.runCapabilityId === SEALED_RAW_RUN_CAPABILITY_ID
    && manifest.syntheticOnly === true
    && manifest.userDocumentsTouched === false
    && manifest.sourceMetadata?.ownerDecisionDigest === OWNER_WORD_DECISION_DIGEST
    && manifest.sourceMetadata?.sourceHeadSha === SOURCE_HEAD_SHA
    && manifest.sourceMetadata?.sourceTreeSha === SOURCE_TREE_SHA
    && manifest.sourceMetadata?.stageAdmissionDigest === STAGE_ADMISSION_DIGEST
    && manifest.sourceMetadata?.stageInstanceDigest === STAGE_INSTANCE_DIGEST, 'E_SEALED_RAW_SOURCE_BINDING', 'manifest');
  const artifactPaths = walkRegularFiles(runDir).filter((filePath) => path.basename(filePath) !== 'c8b-pathless-manifest.json');
  const observedArtifacts = artifactPaths.map((filePath, index) => {
    const bytes = fs.readFileSync(filePath);
    return { capabilityId: `CAP_R24_C8B_RAW_FILE_${String(index + 1).padStart(4, '0')}`, role: 'RAW_SYNTHETIC_WORD_CANARY_ARTIFACT', sha256: sha256(bytes), sizeBytes: bytes.length };
  });
  assert(canonicalBytes(observedArtifacts).equals(canonicalBytes(manifest.artifacts)), 'E_RAW_ARTIFACT_READBACK', 'sealed-run');
  assert(manifest.totalBytes === observedArtifacts.reduce((sum, artifact) => sum + artifact.sizeBytes, 0), 'E_RAW_ARTIFACT_PRESERVATION', 'totalBytes');
  const canaryPath = path.join(runDir, 'canary-result.json');
  const canaryBytes = fs.readFileSync(canaryPath);
  assert(canaryBytes.length === SEALED_CANARY_RESULT_SIZE_BYTES && sha256(canaryBytes) === SEALED_CANARY_RESULT_DIGEST, 'E_SEALED_CANARY_BINDING', 'bytes');
  assert(observedArtifacts.some((artifact) => artifact.sha256 === SEALED_CANARY_RESULT_DIGEST && artifact.sizeBytes === SEALED_CANARY_RESULT_SIZE_BYTES), 'E_SEALED_CANARY_BINDING', 'manifest');
  const summary = JSON.parse(canaryBytes.toString('utf8'));
  const ledger = JSON.parse(fs.readFileSync(path.join(runDir, 'canary-ledger.json'), 'utf8'));
  const lifecycle = assertCanaryGreen(summary, ledger);
  const rawArtifacts = {
    artifactCount: manifest.artifacts.length,
    durable: true,
    manifest: { capabilityId: 'CAP_R24_C8B_RAW_ARTIFACT_MANIFEST', role: 'DURABLE_PATHLESS_RAW_EVIDENCE_INDEX', sha256: SEALED_RAW_MANIFEST_DIGEST, sizeBytes: manifestBytes.length },
    nonOverwriting: true,
    runCapabilityId: SEALED_RAW_RUN_CAPABILITY_ID,
    sealedCanaryResult: { capabilityId: 'CAP_R24_C8B_SEALED_CANARY_RESULT', role: 'SEALED_SYNTHETIC_WORD_CANARY_RESULT', sha256: SEALED_CANARY_RESULT_DIGEST, sizeBytes: SEALED_CANARY_RESULT_SIZE_BYTES },
    totalBytes: manifest.totalBytes,
  };
  const previousRawShape = structuredClone(rawArtifacts);
  delete previousRawShape.sealedCanaryResult;
  assert(canonicalBytes(previous.observations.rawArtifacts).equals(canonicalBytes(previousRawShape)), 'E_RAW_PUBLIC_BINDING', 'previous');
  const wordRuntime = readWordRuntime();
  return {
    cleanup: {
      documentCountBeforeQuit: previous.execution.wordDocumentCountBeforeQuit,
      processCountAfterQuit: previous.execution.wordProcessCountAfterQuit,
    },
    finishedAtUtc: previous.execution.finishedAtUtc,
    lifecycle,
    mount,
    rawArtifacts,
    sessionNonceDigest: previous.execution.sessionNonceDigest,
    startedAtUtc: previous.execution.startedAtUtc,
    summary: {
      headSha: summary.headSha,
      nativeLifecycleOk: summary.nativeLifecycleVerification.ok,
      operationAttempted: summary.wordOperationSummary?.attempted,
      operationReported: summary.wordOperationSummary?.reported,
      oracleOk: summary.oracleProbe.ok,
      originMainSha: summary.originMainSha,
      productReturnApplyOk: summary.productReturnApply.ok,
      routeGapCount: summary.productRouteGaps.length,
      sourceDocxSha256: String(summary.sourceDocxSha256 || '').replace(/^sha256:/u, ''),
      returnedDocxSha256: String(summary.returnedDocxSha256 || '').replace(/^sha256:/u, ''),
      wordStatus: summary.wordStatus,
      wordVersion: summary.wordVersion,
    },
    wordRuntime,
  };
}

export function rebindSealedArtifacts(repoRoot = process.cwd()) {
  assertHeadContour(repoRoot);
  validateBindings(repoRoot);
  const receipt = readSealedPhysicalReceipt(repoRoot);
  writeCanonical(repoRoot, PATHS.inventory, buildInventory(repoRoot));
  const contract = buildContract(repoRoot);
  const evidence = buildEvidence(contract, receipt);
  writeCanonical(repoRoot, PATHS.contract, contract);
  writeCanonical(repoRoot, PATHS.evidence, evidence);
  writeCanonical(repoRoot, PATHS.approvals, buildStageApprovals(repoRoot));
  writeCanonical(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  return result(contract, evidence, 'REBIND_SEALED_NO_WORD');
}

export function checkArtifacts(repoRoot = process.cwd()) {
  assertHeadContour(repoRoot);
  validateBindings(repoRoot);
  assert(fs.readFileSync(path.join(repoRoot, PATHS.inventory)).equals(canonicalBytes(buildInventory(repoRoot))), 'E_INVENTORY_DRIFT', PATHS.inventory);
  const contract = buildContract(repoRoot);
  assert(fs.readFileSync(path.join(repoRoot, PATHS.contract)).equals(canonicalBytes(contract)), 'E_CONTRACT_DRIFT', PATHS.contract);
  const evidence = readJsonBytes(repoRoot, PATHS.evidence, true).value;
  validateEvidence(evidence, contract);
  assert(fs.readFileSync(path.join(repoRoot, PATHS.approvals)).equals(canonicalBytes(buildStageApprovals(repoRoot))), 'E_STAGE_APPROVAL_DRIFT', PATHS.approvals);
  assert(fs.readFileSync(path.join(repoRoot, PATHS.activeApprovals)).equals(canonicalBytes(buildActiveApprovals(repoRoot))), 'E_ACTIVE_APPROVAL_DRIFT', PATHS.activeApprovals);
  return result(contract, evidence, 'CHECK');
}

export function probeArtifacts(repoRoot = process.cwd()) {
  assertHeadContour(repoRoot);
  validateBindings(repoRoot);
  const contract = buildContract(repoRoot);
  const evidence = readJsonBytes(repoRoot, PATHS.evidence, true).value;
  const mutants = [
    ['USER_DOCUMENT', (copy) => { copy.observations.safety.userDocumentsTouched = true; }, 'E_USER_DOCUMENT_BOUNDARY'],
    ['STALE_HEAD', (copy) => { copy.observations.git.headSha = '0'.repeat(40); }, 'E_GIT_BINDING'],
    ['ROOT_LOSS', (copy) => { copy.observations.lifecycle.rootOperationCount = 1; }, 'E_LIFECYCLE_ROOT_PRESERVATION'],
    ['ROOT_SEMANTIC_ORACLE', (copy) => { copy.observations.lifecycle.rootSemanticOracle.triangleGreen = false; }, 'E_ROOT_SEMANTIC_ORACLE'],
    ['NATIVE_LIFECYCLE_RED', (copy) => { copy.observations.roundTrip.nativeLifecycleOk = false; }, 'E_WORD_PHYSICAL'],
    ['OWNER_DECISION_DRIFT', (copy) => { copy.sourceBindings.ownerDecisionDigest = '0'.repeat(64); }, 'E_OWNER_DECISION_BINDING'],
    ['PATH_LEAK', (copy) => { copy.observations.rawArtifacts.runCapabilityId = '/Users/example/Documents'; }, 'E_RAW_RUN_CAPABILITY'],
    ['RAW_MANIFEST_DRIFT', (copy) => { copy.observations.rawArtifacts.manifest.sha256 = '0'.repeat(63); }, 'E_RAW_MANIFEST_BINDING'],
  ];
  const killed = [];
  for (const [id, mutate, code] of mutants) {
    const copy = structuredClone(evidence);
    mutate(copy);
    let actual = '';
    try { validateEvidence(copy, contract); } catch (error) { actual = error.code || ''; }
    assert(actual === code, 'E_MUTANT_SURVIVED', `${id}:${actual}:${code}`);
    killed.push(id);
  }
  return result(contract, evidence, 'NEGATIVE_PROBE_NO_GUI', { mutantCount: mutants.length, mutantKillCount: killed.length, mutantsKilled: killed });
}

function main() {
  try {
    const mode = process.argv[2];
    assert(['--run', '--rebind-sealed', '--check', '--probe'].includes(mode), 'E_USAGE', '--run | --rebind-sealed | --check | --probe');
    const output = mode === '--run' ? runAndWrite()
      : mode === '--rebind-sealed' ? rebindSealedArtifacts()
        : mode === '--check' ? checkArtifacts() : probeArtifacts();
    process.stdout.write(canonicalBytes(output));
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ code: error.code || 'E_C8B_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
