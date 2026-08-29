#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { buildInventory } from '../test-inventory.mjs';
import { canonicalBytes } from './canonical-json.mjs';

export const STAGE_ID = 'C8C';
export const OBSERVED_AT_UTC = '2026-08-29T01:42:40Z';
export const PROGRAM_TEMPLATE_DIGEST = '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a';
export const STAGE_REGISTRY_DIGEST = 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a';
export const TRUST_MODEL_DIGEST = '4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d';
export const OWNER_BINDING_DIGEST = 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6';
export const STAGE_INSTANCE_DIGEST = 'edc01f039b7614e4f8a85609a2f07dd4d16276840af2051708078a8915e42714';
export const STAGE_ADMISSION_DIGEST = 'e7c182a4b9e32b5374db1576503b917348c7d5f1616f20902637f15399b05606';
export const ACCEPTANCE_SIGNALS_DIGEST = '1244220757fed4ff2dc7780c7718ad0b3a016f0084c024bd0723d6a57d9273e7';
export const WRITE_SET_DIGEST = '4554c7dfbcbca0d132dedf23a70374828c577506a75000c8857f7b0f5cb622ad';
export const SOURCE_HEAD_SHA = 'e87cec7caed50eb7d552779a3dcdd9e5d71d9698';
export const SOURCE_TREE_SHA = '1a9d615e5e40df6d652c41c06d755614c26ca6ae';
export const PREDECESSOR_TERMINAL_DIGEST = 'd83dcb271ae1067e41bdaf82e1dc787905721edb4880350646a7e3b18ec6d7b8';
export const PREDECESSOR_CERTIFIED_DONE_RECEIPT_DIGEST = 'de3a5b3f03acb56977a3a05037bfad9a17eaf866d7c1e62e1d2be1e6fe69de36';
export const PREDECESSOR_LEASE_RELEASE_DIGEST = '02ddb470e945ce8846d027260fe54ae8a3c23f3d8af31d02b94765a83d407307';
export const PREDECESSOR_EVIDENCE_DIGEST = '90d52e4fc6d9521e051a3c3d76a5061e0f75c8384c83df67c04de98d093ee1b8';
export const PACKAGE_DIGEST = '4fbc7196f596c36a5741411fd9c622ab2227749648f619deba3eb81027b5a39e';
export const LOCKFILE_DIGEST = '54dc46b025c7f77d522bb861724dc7d8bdd752a29e3e6a55eb72f30b50047a6f';
export const AFTER_PACK_DIGEST = '1a067b26f08a48c3e0ffae9e09c542c4c08df7a0d81915f414516f6e0fe9719e';
export const ELECTRON_VERSION = '41.10.3';
export const ELECTRON_BUILDER_VERSION = '26.15.7';
export const ELECTRON_ARCHIVE_DIGEST = '8961cdb57c95c073ff4770bc9309953832f447575f1a91127010f7b4870884b3';
export const ELECTRON_ARCHIVE_SIZE_BYTES = 116554065;
export const LEASE_DIGEST = 'de4253208e9d8b42064e4581c099875b401b2e362bd85b4c076b8aadb3d7191a';
export const FENCE_DIGEST = '4c8656be4fbbb90ae00ccdf6e5f62a552afe5c66b8d48c565a0897b6db158a9f';
export const FENCE_COUNTER = 47;
export const T7_UUID = 'D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2';
export const CONTROL_PLANE_EVIDENCE_STAMP_ID = 'ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS';

const T7_MOUNT = '/Volumes/T7-Secure';
const RAW_ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/r24-corrective-physical-evidence/c8c';
const CANONICAL_REPO = '/Volumes/T7-Secure/storage/yalken/canonical/writer-editor-codex';
const LOCAL_LEASE = '/private/tmp/yalken-r24-corrective-canonical-writer.lock/lease-c8c-macos-artifact-v1.json';
const LOCAL_FENCE = '/private/tmp/yalken-r24-corrective-canonical-writer.lock/fence-c8c-macos-artifact-v1.json';
const RAW_MANIFEST_BASENAME = 'c8c-macos-artifact-manifest.json';
const LEXICAL = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export const PATHS = Object.freeze({
  activeApprovals: 'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  afterPack: 'scripts/after-pack.cjs',
  approvals: 'docs/OPS/R24/CORRECTIVE/C8C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  contract: 'docs/OPS/R24/CORRECTIVE/C8C_MACOS_ARTIFACT_CONTRACT_V1.json',
  evidence: 'docs/OPS/R24/CORRECTIVE/C8C_MACOS_ARTIFACT_EVIDENCE_V1.json',
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  lockfile: 'package-lock.json',
  package: 'package.json',
  predecessorEvidence: 'docs/OPS/R24/CORRECTIVE/C8B_WORD_PHYSICAL_EVIDENCE_V1.json',
  program: 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json',
  registry: 'docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json',
  script: 'scripts/ops/r24/corrective/c8c-macos-artifact.mjs',
  stageAdmission: 'docs/OPS/R24/CORRECTIVE/C8C_STAGE_ADMISSION_ATTESTATION_V1.json',
  stageInstance: 'docs/OPS/R24/CORRECTIVE/C8C_STAGE_INSTANCE_V1.json',
  standing: 'docs/OPS/R24/CORRECTIVE/STANDING_AUTHORITY_BINDING_V1.json',
  test: 'test/contracts/r24-c8c-macos-artifact.contract.test.mjs',
  trust: 'docs/OPS/R24/CORRECTIVE/TERMINAL_ATTESTATION_TRUST_MODEL_V1.json',
  wp307Integration: 'test/unit/r24-wp307-writer-local-profile-integration.test.js',
  wp307Mutants: 'test/unit/r24-wp307-writer-local-profile-mutants.test.js',
  wp307Test: 'test/unit/r24-wp307-writer-local-profile.test.js',
});

export const WRITE_SET = Object.freeze([
  PATHS.inventory,
  PATHS.activeApprovals,
  PATHS.approvals,
  PATHS.contract,
  PATHS.evidence,
  PATHS.stageAdmission,
  PATHS.stageInstance,
  PATHS.script,
  PATHS.test,
].sort(LEXICAL));

export class C8CMacosArtifactError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

function fail(code, detail) { throw new C8CMacosArtifactError(code, detail); }
function assert(condition, code, detail) { if (!condition) fail(code, detail); }
export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function isHex64(value) { return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value); }

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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 900000, ...options });
  return { ...result, stderrText: String(result.stderr || ''), stdoutText: String(result.stdout || '') };
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

export function validateBoundedDeltaObservation(observation) {
  const { candidateSha, changedPaths = [], commitCount, label = 'CANDIDATE', sourceHeadSha = SOURCE_HEAD_SHA, sourceIsAncestor } = observation || {};
  assert(/^[0-9a-f]{40}$/u.test(candidateSha || '') && /^[0-9a-f]{40}$/u.test(sourceHeadSha || ''), 'E_DELTA_SHA', label);
  assert(sourceHeadSha === SOURCE_HEAD_SHA, 'E_DELTA_SOURCE_HEAD', sourceHeadSha);
  assert(sourceIsAncestor === true, 'E_SOURCE_HEAD_NOT_ANCESTOR', `${label}:${candidateSha}`);
  assert(Number.isInteger(commitCount) && commitCount >= 0 && commitCount <= 2, 'E_UNBOUNDED_DELTA', `${label}:${commitCount}`);
  assert(Array.isArray(changedPaths), 'E_DELTA_PATHS', label);
  if (candidateSha === sourceHeadSha) assert(commitCount === 0 && changedPaths.length === 0, 'E_SOURCE_DELTA_NOT_EMPTY', label);
  else assert(commitCount >= 1, 'E_DESCENDANT_DELTA_EMPTY', label);
  for (const relativePath of changedPaths) {
    assert(typeof relativePath === 'string' && relativePath.length > 0
      && relativePath === path.posix.normalize(relativePath) && !path.posix.isAbsolute(relativePath)
      && relativePath !== '..' && !relativePath.startsWith('../') && !relativePath.includes('\\'), 'E_DELTA_PATH_NORMALIZATION', String(relativePath));
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
  assert(ancestor.status === 0 || ancestor.status === 1, 'E_GIT', `merge-base:${label}`);
  validateBoundedDeltaObservation({
    candidateSha,
    changedPaths: git(repoRoot, ['diff', '--name-only', SOURCE_HEAD_SHA, candidateSha]).split('\n').filter(Boolean),
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

function fileBinding(repoRoot, relativePath, capabilityId, role) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  return { capabilityId, role, sha256: sha256(bytes), sizeBytes: bytes.length };
}

export function validateBindings(repoRoot = process.cwd()) {
  const program = readJsonBytes(repoRoot, PATHS.program, true);
  const registry = readJsonBytes(repoRoot, PATHS.registry, true);
  const trust = readJsonBytes(repoRoot, PATHS.trust, true);
  const standing = readJsonBytes(repoRoot, PATHS.standing, true);
  const stage = readJsonBytes(repoRoot, PATHS.stageInstance, true);
  const admission = readJsonBytes(repoRoot, PATHS.stageAdmission, true);
  const predecessor = readJsonBytes(repoRoot, PATHS.predecessorEvidence, true);
  assert(program.digest === PROGRAM_TEMPLATE_DIGEST, 'E_PROGRAM_DIGEST', program.digest);
  assert(registry.digest === STAGE_REGISTRY_DIGEST, 'E_REGISTRY_DIGEST', registry.digest);
  assert(trust.digest === TRUST_MODEL_DIGEST, 'E_TRUST_DIGEST', trust.digest);
  assert(standing.digest === OWNER_BINDING_DIGEST, 'E_STANDING_DIGEST', standing.digest);
  assert(stage.digest === STAGE_INSTANCE_DIGEST, 'E_STAGE_INSTANCE_DIGEST', stage.digest);
  assert(admission.digest === STAGE_ADMISSION_DIGEST, 'E_STAGE_ADMISSION_DIGEST', admission.digest);
  assert(predecessor.digest === PREDECESSOR_EVIDENCE_DIGEST, 'E_C8B_EVIDENCE_DIGEST', predecessor.digest);
  assert(stage.value.stageId === STAGE_ID && admission.value.stageId === STAGE_ID, 'E_STAGE_ID', STAGE_ID);
  assert(stage.value.baseSha === SOURCE_HEAD_SHA && stage.value.headSha === SOURCE_HEAD_SHA && stage.value.treeSha === SOURCE_TREE_SHA, 'E_STAGE_SOURCE', STAGE_ID);
  assert(stage.value.predecessorTerminalDigest === PREDECESSOR_TERMINAL_DIGEST, 'E_PREDECESSOR_TERMINAL', STAGE_ID);
  assert(stage.value.predecessorCertifiedDoneReceiptDigest === PREDECESSOR_CERTIFIED_DONE_RECEIPT_DIGEST, 'E_PREDECESSOR_RECEIPT', STAGE_ID);
  assert(stage.value.predecessorLeaseReleaseDigest === PREDECESSOR_LEASE_RELEASE_DIGEST, 'E_PREDECESSOR_RELEASE', STAGE_ID);
  assert(stage.value.dependencies?.length === 1 && stage.value.dependencies[0]?.stageId === 'C8B'
    && stage.value.dependencies[0]?.status === 'CERTIFIED_DONE'
    && stage.value.dependencies[0]?.attestationDigest === PREDECESSOR_TERMINAL_DIGEST, 'E_C8B_DEPENDENCY', STAGE_ID);
  assert(predecessor.value.stageId === 'C8B' && predecessor.value.status === 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION', 'E_C8B_EVIDENCE_STATE', predecessor.value.status);
  assert(sameSet(stage.value.writeSet.paths, WRITE_SET), 'E_WRITE_SET', STAGE_ID);
  assert(admission.value.status === 'ADMITTED' && admission.value.stageInstanceDigest === STAGE_INSTANCE_DIGEST, 'E_NOT_ADMITTED', STAGE_ID);
  assert(admission.value.acceptanceSignalsDigest === ACCEPTANCE_SIGNALS_DIGEST, 'E_ACCEPTANCE_DIGEST', STAGE_ID);
  assert(admission.value.writeSetDigest === WRITE_SET_DIGEST
    && admission.value.writeSetDigest === sha256(canonicalBytes(stage.value.writeSet)), 'E_WRITE_SET_DIGEST', STAGE_ID);
  assert(sha256(fs.readFileSync(path.join(repoRoot, PATHS.package))) === PACKAGE_DIGEST, 'E_PACKAGE_DIGEST', PATHS.package);
  assert(sha256(fs.readFileSync(path.join(repoRoot, PATHS.lockfile))) === LOCKFILE_DIGEST, 'E_LOCKFILE_DIGEST', PATHS.lockfile);
  assert(sha256(fs.readFileSync(path.join(repoRoot, PATHS.afterPack))) === AFTER_PACK_DIGEST, 'E_AFTER_PACK_DIGEST', PATHS.afterPack);
  return { admission, predecessor, program, registry, stage, standing, trust };
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
  const cacheRoot = path.join(process.env.HOME || '', 'Library', 'Caches', 'electron');
  const matches = [];
  const visit = (directory, depth) => {
    assert(depth <= 8, 'E_ELECTRON_ARCHIVE_DISCOVERY', 'depth');
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => LEXICAL(a.name, b.name))) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(candidate, depth + 1);
      else if (entry.isFile() && entry.name === `electron-v${ELECTRON_VERSION}-darwin-arm64.zip`) matches.push(candidate);
    }
  };
  assert(fs.existsSync(cacheRoot), 'E_ELECTRON_ARCHIVE_MISSING', ELECTRON_VERSION);
  visit(cacheRoot, 0);
  assert(matches.length === 1, 'E_ELECTRON_ARCHIVE_AMBIGUOUS', String(matches.length));
  const bytes = fs.readFileSync(matches[0]);
  assert(bytes.length === ELECTRON_ARCHIVE_SIZE_BYTES && sha256(bytes) === ELECTRON_ARCHIVE_DIGEST, 'E_ELECTRON_ARCHIVE_BINDING', ELECTRON_VERSION);
  return matches[0];
}

function verifyT7AndArtifactRoot() {
  const info = run('/usr/sbin/diskutil', ['info', T7_MOUNT], { timeout: 30000 });
  assert(info.status === 0, 'E_T7_INFO', info.stderrText.trim());
  assert(info.stdoutText.includes(`Volume UUID:               ${T7_UUID}`), 'E_T7_UUID', 'mismatch');
  assert(/FileVault:\s+Yes/u.test(info.stdoutText), 'E_T7_ENCRYPTION', 'FileVault');
  assert(/Volume Read-Only:\s+No/u.test(info.stdoutText), 'E_T7_READ_ONLY', 'volume');
  fs.accessSync(T7_MOUNT, fs.constants.R_OK | fs.constants.W_OK);
  fs.mkdirSync(RAW_ARTIFACT_ROOT, { recursive: true, mode: 0o700 });
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

function durableWriteExclusive(filePath, bytes) {
  const fd = fs.openSync(filePath, 'wx', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  const dirFd = fs.openSync(path.dirname(filePath), 'r');
  try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
}

function normalizedInternalPath(root, absolutePath) {
  const relative = path.relative(root, absolutePath).split(path.sep).join('/');
  assert(relative && relative === path.posix.normalize(relative) && !path.posix.isAbsolute(relative)
    && relative !== '..' && !relative.startsWith('../') && !relative.includes('\\'), 'E_ARTIFACT_PATH_NORMALIZATION', relative);
  return relative;
}

function walkArtifact(root) {
  const files = [];
  const symlinks = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => LEXICAL(a.name, b.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = normalizedInternalPath(root, absolute);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        const bytes = fs.readFileSync(absolute);
        files.push({ artifactRelativePath: relative, mode: (fs.lstatSync(absolute).mode & 0o777).toString(8).padStart(4, '0'), sha256: sha256(bytes), sizeBytes: bytes.length });
      } else if (entry.isSymbolicLink()) {
        const linkTarget = fs.readlinkSync(absolute);
        assert(!path.isAbsolute(linkTarget) && !linkTarget.includes('\\'), 'E_ARTIFACT_SYMLINK_ESCAPE', relative);
        const resolved = path.resolve(path.dirname(absolute), linkTarget);
        const relation = path.relative(root, resolved);
        assert(relation !== '..' && !relation.startsWith(`..${path.sep}`) && !path.isAbsolute(relation), 'E_ARTIFACT_SYMLINK_ESCAPE', relative);
        symlinks.push({ artifactRelativePath: relative, linkTarget, linkTargetSha256: sha256(Buffer.from(linkTarget, 'utf8')) });
      } else fail('E_ARTIFACT_SPECIAL_FILE', relative);
    }
  };
  visit(root);
  return { files, symlinks };
}

function makeArtifactImmutable(root) {
  const directories = [];
  const visit = (directory) => {
    directories.push(directory);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        const mode = fs.lstatSync(absolute).mode & 0o111 ? 0o555 : 0o444;
        fs.chmodSync(absolute, mode);
        const fd = fs.openSync(absolute, 'r');
        try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      } else if (!entry.isSymbolicLink()) fail('E_ARTIFACT_SPECIAL_FILE', entry.name);
    }
  };
  visit(root);
  for (const directory of directories.reverse()) fs.chmodSync(directory, 0o555);
}

export function validateRawManifest(manifest) {
  assert(manifest?.schemaVersion === 'YALKEN_R24_C8C_RAW_MACOS_ARTIFACT_MANIFEST_V1', 'E_RAW_MANIFEST_SCHEMA', 'schema');
  assert(manifest.stageId === STAGE_ID, 'E_RAW_MANIFEST_STAGE', manifest.stageId);
  assert(/^CAP_R24_C8C_RAW_RUN_[A-F0-9]{16}$/u.test(manifest.runCapabilityId || ''), 'E_RAW_RUN_CAPABILITY', manifest.runCapabilityId);
  const policy = manifest.buildPolicy || {};
  assert(policy.target === 'dir' && policy.architecture === 'arm64' && policy.cscIdentityAutoDiscovery === false, 'E_BUILD_POLICY', JSON.stringify(policy));
  assert(policy.signed === false, 'E_SIGNING_BOUNDARY', String(policy.signed));
  assert(policy.notarized === false, 'E_NOTARIZATION_BOUNDARY', String(policy.notarized));
  assert(policy.distributed === false, 'E_DISTRIBUTION_BOUNDARY', String(policy.distributed));
  assert(policy.credentialsRead === false && policy.networkUsed === false && policy.userDataTouched === false, 'E_EXTERNAL_EFFECT_BOUNDARY', JSON.stringify(policy));
  assert(manifest.unsignedObservation?.bundleVerificationPassed === false
    && manifest.unsignedObservation?.developerIdSignaturePresent === false
    && manifest.unsignedObservation?.signingAuthorityCount === 0
    && manifest.unsignedObservation?.teamIdentifierPresent === false
    && ['ADHOC_LINKER_ONLY', 'NONE'].includes(manifest.unsignedObservation?.signatureMode), 'E_UNSIGNED_OBSERVATION', JSON.stringify(manifest.unsignedObservation));
  assert(Array.isArray(manifest.files) && manifest.files.length > 0 && Array.isArray(manifest.symlinks), 'E_RAW_ARTIFACT_SET', 'missing');
  const allPaths = [...manifest.files, ...manifest.symlinks].map((entry) => entry.artifactRelativePath);
  assert(new Set(allPaths).size === allPaths.length, 'E_ARTIFACT_PATH_DUPLICATE', 'manifest');
  for (const entries of [manifest.files, manifest.symlinks]) {
    const paths = entries.map((entry) => entry.artifactRelativePath);
    assert(JSON.stringify(paths) === JSON.stringify([...paths].sort(LEXICAL)), 'E_ARTIFACT_ORDER', 'manifest');
  }
  for (const relativePath of allPaths) {
    assert(typeof relativePath === 'string' && relativePath === path.posix.normalize(relativePath) && !path.posix.isAbsolute(relativePath)
      && relativePath !== '..' && !relativePath.startsWith('../') && !relativePath.includes('\\')
      && !relativePath.includes('/Users/') && !relativePath.includes('/Volumes/') && !relativePath.includes('/private/'), 'E_ARTIFACT_PATH_LEAK', String(relativePath));
  }
  for (const file of manifest.files) {
    assert(isHex64(file.sha256) && Number.isInteger(file.sizeBytes) && file.sizeBytes >= 0, 'E_ARTIFACT_FILE_BINDING', file.artifactRelativePath);
    assert(/^(0444|0555)$/u.test(file.mode || ''), 'E_ARTIFACT_MODE', `${file.artifactRelativePath}:${file.mode}`);
  }
  for (const link of manifest.symlinks) {
    assert(typeof link.linkTarget === 'string' && !path.isAbsolute(link.linkTarget) && !link.linkTarget.includes('\\')
      && isHex64(link.linkTargetSha256) && link.linkTargetSha256 === sha256(Buffer.from(link.linkTarget, 'utf8')), 'E_ARTIFACT_SYMLINK', link.artifactRelativePath);
  }
  assert(manifest.sourceMetadata?.sourceHeadSha === SOURCE_HEAD_SHA && manifest.sourceMetadata?.sourceTreeSha === SOURCE_TREE_SHA
    && manifest.sourceMetadata?.stageInstanceDigest === STAGE_INSTANCE_DIGEST && manifest.sourceMetadata?.stageAdmissionDigest === STAGE_ADMISSION_DIGEST
    && manifest.sourceMetadata?.packageDigest === PACKAGE_DIGEST && manifest.sourceMetadata?.lockfileDigest === LOCKFILE_DIGEST, 'E_RAW_SOURCE_BINDING', 'source');
  const totalBytes = manifest.files.reduce((sum, file) => sum + file.sizeBytes, 0);
  assert(manifest.totalBytes === totalBytes && manifest.artifactCount === manifest.files.length + manifest.symlinks.length, 'E_ARTIFACT_TOTALS', `${manifest.artifactCount}:${manifest.totalBytes}`);
  assert(isHex64(manifest.artifactTreeDigest)
    && manifest.artifactTreeDigest === sha256(canonicalBytes({ files: manifest.files, symlinks: manifest.symlinks })), 'E_ARTIFACT_TREE_DIGEST', manifest.artifactTreeDigest);
  return true;
}

export function validateArtifactReadback(manifest, observed) {
  validateRawManifest(manifest);
  assert(canonicalBytes({ files: observed.files, symlinks: observed.symlinks }).equals(canonicalBytes({ files: manifest.files, symlinks: manifest.symlinks })), 'E_ARTIFACT_BYTE_DRIFT', 'readback');
  return true;
}

function locateSingleApp(artifactRoot) {
  const apps = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name.endsWith('.app')) apps.push(absolute);
      else if (entry.isDirectory()) visit(absolute);
    }
  };
  visit(artifactRoot);
  assert(apps.length === 1 && path.basename(apps[0]) === 'Yalken.app', 'E_APP_BUNDLE_IDENTITY', apps.map((appPath) => path.basename(appPath)).join(','));
  return apps[0];
}

function verifyUnsignedApp(appPath) {
  const result = run('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath], { timeout: 120000 });
  assert(result.status !== 0, 'E_SIGNING_BOUNDARY', 'codesign verification unexpectedly passed');
  const details = run('/usr/bin/codesign', ['--display', '--verbose=4', appPath], { timeout: 30000 });
  const combined = `${details.stdoutText}\n${details.stderrText}`;
  const authorityCount = [...combined.matchAll(/^Authority=.+$/gmu)].length;
  const teamIdentifierPresent = /^TeamIdentifier=(?!not set$).+$/mu.test(combined);
  const signatureMode = /^Signature=adhoc$/mu.test(combined) ? 'ADHOC_LINKER_ONLY' : details.status !== 0 ? 'NONE' : 'UNKNOWN';
  assert(authorityCount === 0 && teamIdentifierPresent === false && ['ADHOC_LINKER_ONLY', 'NONE'].includes(signatureMode), 'E_SIGNING_BOUNDARY', combined.slice(-1000));
  return {
    bundleVerificationPassed: false,
    developerIdSignaturePresent: false,
    signatureMode,
    signingAuthorityCount: authorityCount,
    teamIdentifierPresent,
  };
}

function buildRawManifest(artifactRoot, runCapabilityId, unsignedObservation) {
  const observed = walkArtifact(artifactRoot);
  const manifest = {
    artifactCount: observed.files.length + observed.symlinks.length,
    artifactTreeDigest: sha256(canonicalBytes(observed)),
    buildPolicy: {
      architecture: 'arm64',
      credentialsRead: false,
      cscIdentityAutoDiscovery: false,
      distributed: false,
      networkUsed: false,
      notarized: false,
      signed: false,
      target: 'dir',
      userDataTouched: false,
    },
    files: observed.files,
    runCapabilityId,
    schemaVersion: 'YALKEN_R24_C8C_RAW_MACOS_ARTIFACT_MANIFEST_V1',
    sourceMetadata: {
      afterPackDigest: AFTER_PACK_DIGEST,
      electronBuilderVersion: ELECTRON_BUILDER_VERSION,
      electronVersion: ELECTRON_VERSION,
      lockfileDigest: LOCKFILE_DIGEST,
      packageDigest: PACKAGE_DIGEST,
      sourceHeadSha: SOURCE_HEAD_SHA,
      sourceTreeSha: SOURCE_TREE_SHA,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
    },
    stageId: STAGE_ID,
    symlinks: observed.symlinks,
    totalBytes: observed.files.reduce((sum, file) => sum + file.sizeBytes, 0),
    unsignedObservation,
  };
  validateRawManifest(manifest);
  return manifest;
}

export function buildContract(repoRoot = process.cwd()) {
  validateBindings(repoRoot);
  const contract = {
    acceptanceSignals: {
      ARTIFACT_HASH_BOUND: true,
      ARTIFACT_OUTSIDE_GIT_CHECKOUT: true,
      C8B_CERTIFIED_DEPENDENCY: true,
      EXTERNAL_TERMINAL_ATTESTATION_VERIFIED: 'PENDING_POST_MERGE_EXTERNAL_C8C_ATTESTATION',
      FIXED_AUTHORITY_BINDING: true,
      IMMUTABLE_LOCAL_MACOS_ARTIFACT: true,
      NO_SIGN_NOTARIZE_DISTRIBUTE: true,
      SYNTHETIC_LOCAL_BUILD_ONLY: true,
    },
    artifactEnvelope: {
      architecture: 'arm64',
      artifactManifestRole: 'IMMUTABLE_MACOS_DIRECTORY_ARTIFACT_MANIFEST',
      artifactRootCapabilityId: 'CAP_R24_C8C_STABLE_T7_RAW_ARTIFACT_ROOT',
      builder: 'electron-builder',
      cscIdentityAutoDiscovery: false,
      durableNonOverwritingRunDirectory: true,
      manifestFields: ['ARTIFACT_INTERNAL_RELATIVE_PATH', 'BYTE_LENGTH', 'FILE_MODE', 'SHA256'],
      outsideEveryGitCheckout: true,
      productName: 'Yalken',
      publicEvidenceFields: ['CAPABILITY_ID', 'ROLE', 'SHA256', 'SIZE_BYTES'],
      target: 'dir',
    },
    claimCeiling: 'C8C_UNSIGNED_LOCAL_MACOS_DIRECTORY_ARTIFACT_ENVELOPE_ONLY',
    nonClaims: ['NO_SIGNING', 'NO_NOTARIZATION', 'NO_DISTRIBUTION', 'NO_INSTALLATION', 'NO_RELEASE', 'NO_USER_DATA_QUALIFICATION', 'NO_PROGRAM_DONE'],
    safetyBoundary: {
      credentialsRead: false,
      dependencyMutation: false,
      networkUsed: false,
      notarization: false,
      packageOrWorkflowMutation: false,
      publicDistribution: false,
      signing: false,
      userDataTouched: false,
    },
    schemaVersion: 'YALKEN_R24_C8C_MACOS_ARTIFACT_CONTRACT_V1',
    sourceBindings: {
      acceptanceSignalsDigest: ACCEPTANCE_SIGNALS_DIGEST,
      afterPack: fileBinding(repoRoot, PATHS.afterPack, 'CAP_R24_C8C_AFTER_PACK', 'PACKAGE_HARDENING_HOOK'),
      electronArchive: { capabilityId: 'CAP_R24_C8C_ELECTRON_ARCHIVE', role: 'IMMUTABLE_LOCAL_BUILD_INPUT', sha256: ELECTRON_ARCHIVE_DIGEST, sizeBytes: ELECTRON_ARCHIVE_SIZE_BYTES },
      fenceCounter: FENCE_COUNTER,
      fenceDigest: FENCE_DIGEST,
      focusedTest: fileBinding(repoRoot, PATHS.test, 'CAP_R24_C8C_FOCUSED_TEST', 'INDEPENDENT_CONTRACT_TEST'),
      leaseDigest: LEASE_DIGEST,
      lockfile: fileBinding(repoRoot, PATHS.lockfile, 'CAP_R24_C8C_LOCKFILE', 'DEPENDENCY_GRAPH'),
      ownerAuthorityBindingDigest: OWNER_BINDING_DIGEST,
      package: fileBinding(repoRoot, PATHS.package, 'CAP_R24_C8C_PACKAGE_CONFIG', 'PACKAGE_BUILD_CONFIGURATION'),
      predecessorCertifiedDoneReceiptDigest: PREDECESSOR_CERTIFIED_DONE_RECEIPT_DIGEST,
      predecessorEvidenceDigest: PREDECESSOR_EVIDENCE_DIGEST,
      predecessorLeaseReleaseDigest: PREDECESSOR_LEASE_RELEASE_DIGEST,
      predecessorTerminalDigest: PREDECESSOR_TERMINAL_DIGEST,
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      sourceHeadSha: SOURCE_HEAD_SHA,
      sourceTreeSha: SOURCE_TREE_SHA,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
      stageRegistryDigest: STAGE_REGISTRY_DIGEST,
      testInventory: fileBinding(repoRoot, PATHS.inventory, 'CAP_R24_C8C_TEST_INVENTORY', 'CURRENT_TEST_INVENTORY'),
      trustModelDigest: TRUST_MODEL_DIGEST,
      wp307Integration: fileBinding(repoRoot, PATHS.wp307Integration, 'CAP_R24_C8C_WP307_INTEGRATION', 'EXISTING_LOCAL_PROFILE_INTEGRATION_TEST'),
      wp307Mutants: fileBinding(repoRoot, PATHS.wp307Mutants, 'CAP_R24_C8C_WP307_MUTANTS', 'EXISTING_LOCAL_PROFILE_MUTATION_TEST'),
      wp307Test: fileBinding(repoRoot, PATHS.wp307Test, 'CAP_R24_C8C_WP307_TEST', 'EXISTING_LOCAL_PROFILE_UNIT_TEST'),
      writeSetDigest: WRITE_SET_DIGEST,
    },
    stageId: STAGE_ID,
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
  };
  assertPathlessPublicEvidence(contract);
  return contract;
}

function buildEvidence(contract, receipt) {
  const evidence = {
    acceptanceSignals: {
      ARTIFACT_HASH_BOUND: 'PASS',
      ARTIFACT_OUTSIDE_GIT_CHECKOUT: 'PASS',
      C8B_CERTIFIED_DEPENDENCY: 'PASS',
      FIXED_AUTHORITY_BINDING: 'PASS',
      IMMUTABLE_LOCAL_MACOS_ARTIFACT: 'PASS',
      NO_SIGN_NOTARIZE_DISTRIBUTE: 'PASS',
      SYNTHETIC_LOCAL_BUILD_ONLY: 'PASS',
    },
    contractDigest: sha256(canonicalBytes(contract)),
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    execution: {
      finishedAtUtc: receipt.finishedAtUtc,
      runNonceDigest: receipt.runNonceDigest,
      startedAtUtc: receipt.startedAtUtc,
    },
    externalTerminalAttestation: { required: true, status: 'AWAITING_POST_MERGE_EXTERNAL_C8C_ATTESTATION' },
    observations: {
      artifact: receipt.artifact,
      build: receipt.build,
      git: receipt.git,
      mount: receipt.mount,
      rawArtifacts: receipt.rawArtifacts,
      safety: {
        credentialsRead: false,
        dependencyMutation: false,
        networkUsed: false,
        notarization: false,
        packageOrWorkflowMutation: false,
        publicDistribution: false,
        signing: false,
        userDataTouched: false,
      },
    },
    schemaVersion: 'YALKEN_R24_C8C_MACOS_ARTIFACT_EVIDENCE_V1',
    sourceBindings: {
      ownerAuthorityBindingDigest: OWNER_BINDING_DIGEST,
      predecessorTerminalDigest: PREDECESSOR_TERMINAL_DIGEST,
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      sourceHeadSha: SOURCE_HEAD_SHA,
      sourceTreeSha: SOURCE_TREE_SHA,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
    },
    stageId: STAGE_ID,
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
  };
  validateEvidence(evidence, contract, receipt.rawArtifacts.manifest.sha256);
  assertPathlessPublicEvidence(evidence);
  return evidence;
}

export function validateEvidence(evidence, contract, expectedRawManifestDigest = null) {
  assert(evidence?.schemaVersion === 'YALKEN_R24_C8C_MACOS_ARTIFACT_EVIDENCE_V1', 'E_EVIDENCE_SCHEMA', 'schema');
  assert(evidence.stageId === STAGE_ID && evidence.status === 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION', 'E_EVIDENCE_STATUS', evidence.status);
  assert(evidence.contractDigest === sha256(canonicalBytes(contract)), 'E_CONTRACT_BINDING', evidence.contractDigest);
  for (const signal of ['ARTIFACT_HASH_BOUND', 'ARTIFACT_OUTSIDE_GIT_CHECKOUT', 'C8B_CERTIFIED_DEPENDENCY', 'FIXED_AUTHORITY_BINDING', 'IMMUTABLE_LOCAL_MACOS_ARTIFACT', 'NO_SIGN_NOTARIZE_DISTRIBUTE', 'SYNTHETIC_LOCAL_BUILD_ONLY']) {
    assert(evidence.acceptanceSignals?.[signal] === 'PASS', 'E_ACCEPTANCE_SIGNAL', signal);
  }
  const started = Date.parse(evidence.execution?.startedAtUtc);
  const finished = Date.parse(evidence.execution?.finishedAtUtc);
  assert(Number.isFinite(started) && Number.isFinite(finished) && finished >= started && finished - started <= 900000, 'E_EXECUTION_TIME', `${started}:${finished}`);
  assert(isHex64(evidence.execution?.runNonceDigest), 'E_RUN_NONCE', evidence.execution?.runNonceDigest);
  const observations = evidence.observations || {};
  assert(observations.git?.headSha === SOURCE_HEAD_SHA && observations.git?.originMainSha === SOURCE_HEAD_SHA, 'E_GIT_BINDING', 'source execution');
  assert(observations.mount?.uuid === T7_UUID && observations.mount?.fileVault === true && observations.mount?.writable === true, 'E_T7_BINDING', 'mount');
  assert(observations.build?.target === 'dir' && observations.build?.architecture === 'arm64'
    && observations.build?.cscIdentityAutoDiscovery === false && observations.build?.exitCode === 0, 'E_BUILD_RESULT', JSON.stringify(observations.build));
  const artifact = observations.artifact || {};
  assert(artifact.productName === 'Yalken' && isHex64(artifact.treeDigest)
    && artifact.bundleVerificationPassed === false && artifact.developerIdSignaturePresent === false
    && ['ADHOC_LINKER_ONLY', 'NONE'].includes(artifact.signatureMode)
    && artifact.signingAuthorityCount === 0 && artifact.teamIdentifierPresent === false, 'E_UNSIGNED_ARTIFACT', JSON.stringify(artifact));
  const raw = observations.rawArtifacts || {};
  assert(raw.durable === true && raw.nonOverwriting === true && raw.outsideEveryGitCheckout === true && raw.immutableReadback === true
    && Number.isInteger(raw.artifactCount) && raw.artifactCount > 0 && Number.isInteger(raw.totalBytes) && raw.totalBytes > 0, 'E_RAW_ARTIFACT_PRESERVATION', 'raw');
  assert(/^CAP_R24_C8C_RAW_RUN_[A-F0-9]{16}$/u.test(raw.runCapabilityId || ''), 'E_RAW_RUN_CAPABILITY', raw.runCapabilityId);
  assert(raw.manifest?.capabilityId === 'CAP_R24_C8C_RAW_ARTIFACT_MANIFEST'
    && raw.manifest?.role === 'IMMUTABLE_MACOS_DIRECTORY_ARTIFACT_MANIFEST'
    && isHex64(raw.manifest?.sha256) && Number.isInteger(raw.manifest?.sizeBytes) && raw.manifest.sizeBytes > 0, 'E_RAW_MANIFEST_BINDING', 'manifest');
  if (expectedRawManifestDigest !== null) assert(raw.manifest.sha256 === expectedRawManifestDigest, 'E_RAW_MANIFEST_BINDING', raw.manifest.sha256);
  assert(raw.artifact?.capabilityId === 'CAP_R24_C8C_MACOS_DIRECTORY_ARTIFACT'
    && raw.artifact?.role === 'IMMUTABLE_UNSIGNED_MACOS_DIRECTORY_ARTIFACT'
    && raw.artifact?.sha256 === artifact.treeDigest && Number.isInteger(raw.artifact?.sizeBytes) && raw.artifact.sizeBytes === raw.totalBytes, 'E_ARTIFACT_PUBLIC_BINDING', 'artifact');
  const safety = observations.safety || {};
  for (const field of ['credentialsRead', 'dependencyMutation', 'networkUsed', 'notarization', 'packageOrWorkflowMutation', 'publicDistribution', 'signing', 'userDataTouched']) {
    assert(safety[field] === false, field === 'signing' ? 'E_SIGNING_BOUNDARY' : field === 'notarization' ? 'E_NOTARIZATION_BOUNDARY' : field === 'publicDistribution' ? 'E_DISTRIBUTION_BOUNDARY' : 'E_EXTERNAL_EFFECT_BOUNDARY', field);
  }
  assert(evidence.sourceBindings?.ownerAuthorityBindingDigest === OWNER_BINDING_DIGEST
    && evidence.sourceBindings?.predecessorTerminalDigest === PREDECESSOR_TERMINAL_DIGEST
    && evidence.sourceBindings?.programTemplateDigest === PROGRAM_TEMPLATE_DIGEST
    && evidence.sourceBindings?.sourceHeadSha === SOURCE_HEAD_SHA && evidence.sourceBindings?.sourceTreeSha === SOURCE_TREE_SHA
    && evidence.sourceBindings?.stageAdmissionDigest === STAGE_ADMISSION_DIGEST
    && evidence.sourceBindings?.stageInstanceDigest === STAGE_INSTANCE_DIGEST, 'E_SOURCE_BINDING', 'evidence');
  assertPathlessPublicEvidence(evidence);
  return true;
}

function sealArtifactRun(runDir, artifactRoot, runCapabilityId, unsignedObservation) {
  makeArtifactImmutable(artifactRoot);
  const manifest = buildRawManifest(artifactRoot, runCapabilityId, unsignedObservation);
  const manifestBytes = canonicalBytes(manifest);
  const manifestPath = path.join(runDir, RAW_MANIFEST_BASENAME);
  durableWriteExclusive(manifestPath, manifestBytes);
  assert(fs.readFileSync(manifestPath).equals(manifestBytes), 'E_RAW_MANIFEST_READBACK', 'bytes');
  validateArtifactReadback(manifest, walkArtifact(artifactRoot));
  fs.chmodSync(manifestPath, 0o444);
  fs.chmodSync(runDir, 0o555);
  return {
    artifact: { capabilityId: 'CAP_R24_C8C_MACOS_DIRECTORY_ARTIFACT', role: 'IMMUTABLE_UNSIGNED_MACOS_DIRECTORY_ARTIFACT', sha256: manifest.artifactTreeDigest, sizeBytes: manifest.totalBytes },
    artifactCount: manifest.artifactCount,
    durable: true,
    immutableReadback: true,
    manifest: { capabilityId: 'CAP_R24_C8C_RAW_ARTIFACT_MANIFEST', role: 'IMMUTABLE_MACOS_DIRECTORY_ARTIFACT_MANIFEST', sha256: sha256(manifestBytes), sizeBytes: manifestBytes.length },
    nonOverwriting: true,
    outsideEveryGitCheckout: true,
    runCapabilityId,
    totalBytes: manifest.totalBytes,
  };
}

export function runPhysicalBuild(repoRoot = process.cwd()) {
  assert(process.platform === 'darwin' && process.arch === 'arm64', 'E_PHYSICAL_HOST', `${process.platform}-${process.arch}`);
  readExactLocalLease();
  const gitObservation = assertHeadContour(repoRoot);
  assert(gitObservation.currentHead === SOURCE_HEAD_SHA && gitObservation.originMainSha === SOURCE_HEAD_SHA, 'E_RUN_REQUIRES_EXACT_SOURCE_HEAD', `${gitObservation.currentHead}:${gitObservation.originMainSha}`);
  const mount = verifyT7AndArtifactRoot();
  const electronArchivePath = findElectronArchive();
  const nonce = randomUUID();
  const runCapabilityId = `CAP_R24_C8C_RAW_RUN_${sha256(Buffer.from(nonce, 'utf8')).slice(0, 16).toUpperCase()}`;
  const runDir = path.join(RAW_ARTIFACT_ROOT, `c8c-${nonce.replaceAll('-', '')}`);
  fs.mkdirSync(runDir, { mode: 0o700 });
  const artifactRoot = path.join(runDir, 'artifact');
  const startedAtUtc = new Date().toISOString();
  const builder = path.join(repoRoot, 'node_modules', '.bin', 'electron-builder');
  assert(fs.existsSync(builder), 'E_BUILDER_MISSING', ELECTRON_BUILDER_VERSION);
  const environment = {
    ALL_PROXY: 'http://127.0.0.1:9',
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    ELECTRON_GET_USE_PROXY: 'true',
    HOME: process.env.HOME,
    HTTPS_PROXY: 'http://127.0.0.1:9',
    HTTP_PROXY: 'http://127.0.0.1:9',
    LANG: 'en_US.UTF-8',
    NO_PROXY: '',
    PATH: process.env.PATH,
    TMPDIR: '/private/tmp',
    npm_config_offline: 'true',
  };
  const built = run(builder, [
    '--mac',
    'dir',
    '--arm64',
    `--config.directories.output=${artifactRoot}`,
    `--config.electronDist=${electronArchivePath}`,
  ], { cwd: repoRoot, env: environment });
  assert(built.status === 0, 'E_BUILD_EXECUTION', `${built.status}:${built.stderrText.slice(-4000)}:${built.stdoutText.slice(-4000)}`);
  const appPath = locateSingleApp(artifactRoot);
  const unsignedObservation = verifyUnsignedApp(appPath);
  const rawArtifacts = sealArtifactRun(runDir, artifactRoot, runCapabilityId, unsignedObservation);
  return {
    artifact: { productName: 'Yalken', treeDigest: rawArtifacts.artifact.sha256, ...unsignedObservation },
    build: { architecture: 'arm64', cscIdentityAutoDiscovery: false, electronBuilderVersion: ELECTRON_BUILDER_VERSION, electronVersion: ELECTRON_VERSION, exitCode: 0, target: 'dir' },
    finishedAtUtc: new Date().toISOString(),
    git: { headSha: gitObservation.currentHead, originMainSha: gitObservation.originMainSha },
    mount,
    rawArtifacts,
    runNonceDigest: sha256(Buffer.from(nonce, 'utf8')),
    startedAtUtc,
  };
}

function locateSealedRun(manifestDigest) {
  verifyT7AndArtifactRoot();
  const candidates = [];
  for (const entry of fs.readdirSync(RAW_ARTIFACT_ROOT, { withFileTypes: true }).sort((a, b) => LEXICAL(a.name, b.name))) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const manifestPath = path.join(RAW_ARTIFACT_ROOT, entry.name, RAW_MANIFEST_BASENAME);
    if (!fs.existsSync(manifestPath)) continue;
    const bytes = fs.readFileSync(manifestPath);
    if (sha256(bytes) === manifestDigest) candidates.push({ bytes, runDir: path.dirname(manifestPath) });
  }
  assert(candidates.length === 1, 'E_SEALED_RAW_RUN_AMBIGUOUS', String(candidates.length));
  return candidates[0];
}

export function verifySealedRawArtifacts(evidence) {
  const digest = evidence?.observations?.rawArtifacts?.manifest?.sha256;
  assert(isHex64(digest), 'E_RAW_MANIFEST_BINDING', String(digest));
  const located = locateSealedRun(digest);
  const manifest = JSON.parse(located.bytes.toString('utf8'));
  assert(located.bytes.equals(canonicalBytes(manifest)), 'E_NON_CANONICAL_INPUT', 'raw-manifest');
  validateRawManifest(manifest);
  const artifactRoot = path.join(located.runDir, 'artifact');
  const realRun = fs.realpathSync(located.runDir);
  const realRoot = fs.realpathSync(RAW_ARTIFACT_ROOT);
  const relation = path.relative(realRoot, realRun);
  assert(relation && !relation.startsWith('..') && !path.isAbsolute(relation), 'E_RAW_RUN_ESCAPE', 'run');
  validateArtifactReadback(manifest, walkArtifact(artifactRoot));
  assert((fs.lstatSync(located.runDir).mode & 0o222) === 0 && (fs.lstatSync(path.join(located.runDir, RAW_MANIFEST_BASENAME)).mode & 0o222) === 0, 'E_RAW_ARTIFACT_MUTABLE', 'seal');
  assert(manifest.runCapabilityId === evidence.observations.rawArtifacts.runCapabilityId
    && manifest.artifactCount === evidence.observations.rawArtifacts.artifactCount
    && manifest.totalBytes === evidence.observations.rawArtifacts.totalBytes
    && manifest.artifactTreeDigest === evidence.observations.artifact.treeDigest, 'E_RAW_PUBLIC_BINDING', 'manifest');
  return { manifest, manifestDigest: digest };
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
  const rationale = `C8C unsigned local macOS directory artifact envelope under StageInstance ${STAGE_INSTANCE_DIGEST}; immutable raw byte manifest, pathless public evidence, fixed C8B dependency, and no signing, notarization, distribution, credentials, network, user data, dependency, package, workflow, release, or Program DONE expansion remain fail-closed.`;
  return { approvals: approvedPaths().map((filePath) => approvalForPath(repoRoot, filePath, rationale)), evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID], version: 'v1.0' };
}

function isOwnApproval(entry) {
  return entry?.approvedAtUtc === OBSERVED_AT_UTC && typeof entry.rationale === 'string' && entry.rationale.startsWith('C8C unsigned local macOS directory artifact envelope under StageInstance ');
}

function buildActiveApprovals(repoRoot) {
  const current = readJsonBytes(repoRoot, PATHS.activeApprovals).value;
  assert(Array.isArray(current.approvals) && current.version === 'v1.0', 'E_ACTIVE_APPROVAL_SCHEMA', 'C1C');
  const paths = [...approvedPaths(), PATHS.approvals].sort(LEXICAL);
  const superseded = new Set(paths);
  const preserved = current.approvals.filter((entry) => !isOwnApproval(entry) && !superseded.has(entry.filePath));
  const rationale = `C8C current unsigned local macOS directory artifact envelope under StageInstance ${STAGE_INSTANCE_DIGEST}; exact write set, immutable raw artifact bytes, pathless public evidence, fixed authority and C8B dependency, with release authority explicitly absent.`;
  return { approvals: [...preserved, ...paths.map((filePath) => approvalForPath(repoRoot, filePath, rationale))], evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID], version: current.version };
}

function result(contract, evidence, mode, extra = {}) {
  return {
    artifactTreeDigest: evidence.observations.artifact.treeDigest,
    contractDigest: sha256(canonicalBytes(contract)),
    evidenceDigest: sha256(canonicalBytes(evidence)),
    mode,
    rawArtifactManifestDigest: evidence.observations.rawArtifacts.manifest.sha256,
    stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
    stageId: STAGE_ID,
    stageInstanceDigest: STAGE_INSTANCE_DIGEST,
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    ...extra,
  };
}

export function runAndWrite(repoRoot = process.cwd()) {
  assertHeadContour(repoRoot);
  validateBindings(repoRoot);
  writeCanonical(repoRoot, PATHS.inventory, buildInventory(repoRoot));
  const contract = buildContract(repoRoot);
  const receipt = runPhysicalBuild(repoRoot);
  const evidence = buildEvidence(contract, receipt);
  writeCanonical(repoRoot, PATHS.contract, contract);
  writeCanonical(repoRoot, PATHS.evidence, evidence);
  writeCanonical(repoRoot, PATHS.approvals, buildStageApprovals(repoRoot));
  writeCanonical(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  return result(contract, evidence, 'RUN_AND_WRITE');
}

export function checkCurrent(repoRoot = process.cwd()) {
  assertHeadContour(repoRoot);
  validateBindings(repoRoot);
  const inventory = buildInventory(repoRoot);
  assert(canonicalBytes(inventory).equals(fs.readFileSync(path.join(repoRoot, PATHS.inventory))), 'E_INVENTORY_STALE', PATHS.inventory);
  const contract = buildContract(repoRoot);
  assert(canonicalBytes(contract).equals(fs.readFileSync(path.join(repoRoot, PATHS.contract))), 'E_CONTRACT_STALE', PATHS.contract);
  const evidence = readJsonBytes(repoRoot, PATHS.evidence, true).value;
  validateEvidence(evidence, contract, evidence.observations?.rawArtifacts?.manifest?.sha256);
  verifySealedRawArtifacts(evidence);
  assert(canonicalBytes(buildStageApprovals(repoRoot)).equals(fs.readFileSync(path.join(repoRoot, PATHS.approvals))), 'E_STAGE_APPROVALS_STALE', PATHS.approvals);
  assert(canonicalBytes(buildActiveApprovals(repoRoot)).equals(fs.readFileSync(path.join(repoRoot, PATHS.activeApprovals))), 'E_ACTIVE_APPROVALS_STALE', PATHS.activeApprovals);
  return result(contract, evidence, 'CHECK');
}

export function runProbe(repoRoot = process.cwd()) {
  const contract = buildContract(repoRoot);
  const evidence = readJsonBytes(repoRoot, PATHS.evidence, true).value;
  const sealed = verifySealedRawArtifacts(evidence);
  const mutants = [
    ['STALE_HEAD', () => validateBoundedDeltaObservation({ candidateSha: 'a'.repeat(40), changedPaths: [PATHS.contract], commitCount: 1, sourceIsAncestor: false })],
    ['ARTIFACT_DRIFT', () => {
      const mutant = structuredClone(sealed.manifest);
      mutant.files[0].sha256 = '0'.repeat(64);
      validateArtifactReadback(mutant, { files: sealed.manifest.files, symlinks: sealed.manifest.symlinks });
    }],
    ['PATH_LEAK', () => {
      const mutant = structuredClone(sealed.manifest);
      mutant.files[0].artifactRelativePath = '/Volumes/example/Yalken';
      validateRawManifest(mutant);
    }],
    ['SIGNING', () => {
      const mutant = structuredClone(sealed.manifest);
      mutant.buildPolicy.signed = true;
      validateRawManifest(mutant);
    }],
    ['NOTARIZATION', () => {
      const mutant = structuredClone(sealed.manifest);
      mutant.buildPolicy.notarized = true;
      validateRawManifest(mutant);
    }],
    ['DISTRIBUTION', () => {
      const mutant = structuredClone(sealed.manifest);
      mutant.buildPolicy.distributed = true;
      validateRawManifest(mutant);
    }],
    ['RAW_MANIFEST_DRIFT', () => {
      const mutant = structuredClone(evidence);
      mutant.observations.rawArtifacts.manifest.sha256 = '0'.repeat(64);
      validateEvidence(mutant, contract, sealed.manifestDigest);
    }],
  ];
  const results = mutants.map(([id, invoke]) => {
    try { invoke(); } catch (error) { return { errorCode: error.code || 'UNKNOWN', id, killed: true }; }
    return { errorCode: null, id, killed: false };
  });
  assert(results.every((entry) => entry.killed), 'E_PROBE_SURVIVOR', JSON.stringify(results.filter((entry) => !entry.killed)));
  return result(contract, evidence, 'PROBE', { mutantsKilled: results.length, mutantsTotal: results.length, probeResults: results });
}

function main() {
  try {
    const mode = process.argv[2] || '--check';
    assert(['--run', '--check', '--probe'].includes(mode), 'E_USAGE', '--run | --check | --probe');
    const output = mode === '--run' ? runAndWrite(process.cwd()) : mode === '--probe' ? runProbe(process.cwd()) : checkCurrent(process.cwd());
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message || String(error)}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
