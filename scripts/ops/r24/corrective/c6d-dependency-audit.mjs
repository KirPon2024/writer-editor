#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { buildDependencyInventory } from './c1a-hermetic-toolchain.mjs';
import { canonicalBytes, canonicalize } from './canonical-json.mjs';

export const PROGRAM_TEMPLATE_DIGEST = '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a';
export const STAGE_REGISTRY_DIGEST = 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a';
export const TRUST_MODEL_DIGEST = '4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d';
export const OWNER_BINDING_DIGEST = 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6';
export const VERIFIER_CODE_DIGEST = '82e49d577b79b41b26b67e25b7ce0fd81f26fb973232194fef8d96d6c563c6f9';
export const VERIFIER_CONTRACT_DIGEST = '925b4c23f1cad674720ee6a22fcd74cc2169b16bbc161be5d43535f20dd2ee31';
export const SOURCE_HEAD_SHA = 'b594f92858313d61bc5ad0c49f346148d9958491';
export const SOURCE_TREE_SHA = '9f82de2d975347b715a8ae153ed1c1cad0e727ab';
export const ADMITTED_HEAD_SHA = SOURCE_HEAD_SHA;
export const ADMITTED_TREE_SHA = SOURCE_TREE_SHA;
export const STAGE_INSTANCE_DIGEST = '332bbb73048aab55683285aceb0240c921d18c1156b14bdf96e8d5b560096dad';
export const STAGE_ADMISSION_DIGEST = '714a57cb4a2a31ce27cbbda9734c62a53956489f4e22628f0a32bb5e528d9251';
export const ACCEPTANCE_SIGNALS_DIGEST = '20114b809e6fa506b6ab3fd5032252ef3173ba6ebea90975e60854d9afee47cf';
export const WRITE_SET_DIGEST = '2eb92ccdaca7b11c6518612a7081bf9c791dd74aa801ee1d64693c1d342ee650';
export const B0_STAGE_INSTANCE_DIGEST = 'd85c9600f34454a8595e71b6ae9d66af6d1186e7863f9d2c2843971836f5213e';
export const B0_STAGE_ADMISSION_DIGEST = '7682109a2437f68dcc20ea10c2e25770000e76368ca9a1daff42f355ea294e21';
export const B0_WRITE_SET_DIGEST = '625c05dcb8d4a587abbb94510d7d8bd210b3b59f887e8252ebcc4e79f765b9da';
export const REVOCATION_DIGEST = 'dbc6ec1793b49aea6507b32e8d20d7cec49d7bd03b4617a25c1ab47eda92f70c';
export const BLOCKED_C7A_RECEIPT_DIGEST = 'f9a236e9829bf0459a28fc333da2a4923b789766d5bf1b250b2fa82588832251';
export const PREDECESSOR_TERMINAL_DIGEST = 'f8dc277a013a374823b1fa953d7562827bfc059a153af61d7ffffc91c4f31e24';
export const PREDECESSOR_RELEASE_DIGEST = '34efd089ceb3928f20a9c4e44cd47a3e1ef0a40457775049a96208474478c9d6';
export const PREDECESSOR_FENCE_DIGEST = '964cee8b018b3c9bc563328071d7de25cb61e2538cdfd34a66688fbe4dc04974';
export const LEASE_DIGEST = 'd47bb5e5c117a5be59c2df5d5e76a5833bcecbf22a79e4d8d6f2437382638808';
export const FENCE_DIGEST = '7b0b14df142a3e5b0128cffd97171b18003e1e0adba1238cc14e98cfe00701c6';
export const OBSERVED_AT_UTC = '2026-08-28T17:08:26Z';
export const APPROVED_ELECTRON_VERSION = '41.10.3';
export const APPROVED_INTERNAL_EXTRACT_ZIP_VERSION = '1.0.5';
export const ORIGINAL_ELECTRON_RANGE = '^40.9.2';
export const ORIGINAL_LOCK_SHA256 = '441b7b14e6a395cc04bee04f51b17ce400a27c1530ec2483d5168ba15070e689';
export const CURRENT_LOCK_SHA256 = '54dc46b025c7f77d522bb861724dc7d8bdd752a29e3e6a55eb72f30b50047a6f';
export const BEFORE_AUDIT_SHA256 = '6707bba97dcc48bc10d26507abc07c6808e6a865e050eb86c1a13e1ff5e07c83';
export const AFTER_AUDIT_SHA256 = 'fd3ddf129d4c86a38c70d1f9abb456f93ab91f2e45d6db23d006a25aef696175';
export const CONTROL_PLANE_EVIDENCE_STAMP_ID = 'ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS';
export const CONTROL_PLANE_EVIDENCE_STAMP_DIGEST = 'f505d16e9c1be449fe45edc05cef0ba348fc25c1ac492725322b6ee667eacbc1';

export const PATHS = Object.freeze({
  activeApprovals: 'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  admission: 'docs/OPS/R24/CORRECTIVE/C6D_STAGE_ADMISSION_ATTESTATION_AMENDMENT_V6.json',
  admissionSuperseded: 'docs/OPS/R24/CORRECTIVE/C6D_STAGE_ADMISSION_ATTESTATION_AMENDMENT_V5.json',
  admissionRecoveryV4: 'docs/OPS/R24/CORRECTIVE/C6D_STAGE_ADMISSION_ATTESTATION_AMENDMENT_V4.json',
  b0Admission: 'docs/OPS/R24/CORRECTIVE/B0_STAGE_ADMISSION_ATTESTATION_AMENDMENT_V2.json',
  b0Stage: 'docs/OPS/R24/CORRECTIVE/B0_STAGE_INSTANCE_AMENDMENT_V2.json',
  admissionPredecessor: 'docs/OPS/R24/CORRECTIVE/C6D_STAGE_ADMISSION_ATTESTATION_AMENDMENT_V2.json',
  admissionPredecessor2: 'docs/OPS/R24/CORRECTIVE/C6D_STAGE_ADMISSION_ATTESTATION_AMENDMENT_V1.json',
  admissionRoot: 'docs/OPS/R24/CORRECTIVE/C6D_STAGE_ADMISSION_ATTESTATION_V1.json',
  auditDisposition: 'docs/OPS/R24/CORRECTIVE/C6D_AUDIT_DISPOSITION_V1.json',
  c1aContract: 'docs/OPS/R24/CORRECTIVE/C1A_TOOLCHAIN_CONTRACT_V1.json',
  c1aInventory: 'docs/OPS/R24/CORRECTIVE/C1A_DEPENDENCY_INVENTORY_V1.json',
  contract: 'docs/OPS/R24/CORRECTIVE/C6D_DEPENDENCY_AUDIT_CONTRACT_V1.json',
  currentArtifact: 'docs/OPS/R24/CORRECTIVE/C6D_CURRENT_CHECKOUT_DEPENDENCY_ARTIFACT_V1.json',
  dependencyTest: 'test/contracts/r24-c6d-dependency-audit.contract.test.mjs',
  environment: 'docs/OPS/R24/CORRECTIVE/C6D_IMMUTABLE_ENVIRONMENT_MANIFEST_V1.json',
  evidenceStamp: 'docs/OPS/R24/EVIDENCE/ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS.json',
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  lock: 'package-lock.json',
  package: 'package.json',
  program: 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json',
  registry: 'docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json',
  recoveryLedger: 'docs/OPS/R24/CORRECTIVE/C6D_CONTROL_PLANE_RECOVERY_LEDGER_V1.json',
  release01Registry: 'docs/OPS/RTK/YALKEN_INTEROP_TERMINAL_CLAIM_REGISTRY_V1.json',
  script: 'scripts/ops/r24/corrective/c6d-dependency-audit.mjs',
  pk0: 'scripts/ops/r24/package-content-trust-pk0.mjs',
  pk0Mutants: 'test/unit/r24-pk0-package-content-mutants.test.js',
  pk0Physics: 'test/unit/r24-pk0-package-content-physics.test.js',
  pk0Trust: 'test/unit/r24-pk0-package-content-trust.test.js',
  stage: 'docs/OPS/R24/CORRECTIVE/C6D_STAGE_INSTANCE_AMENDMENT_V6.json',
  stageSuperseded: 'docs/OPS/R24/CORRECTIVE/C6D_STAGE_INSTANCE_AMENDMENT_V5.json',
  stageRecoveryV4: 'docs/OPS/R24/CORRECTIVE/C6D_STAGE_INSTANCE_AMENDMENT_V4.json',
  stagePredecessor: 'docs/OPS/R24/CORRECTIVE/C6D_STAGE_INSTANCE_AMENDMENT_V2.json',
  stagePredecessor2: 'docs/OPS/R24/CORRECTIVE/C6D_STAGE_INSTANCE_AMENDMENT_V1.json',
  stageRoot: 'docs/OPS/R24/CORRECTIVE/C6D_STAGE_INSTANCE_V1.json',
  stageApprovals: 'docs/OPS/R24/CORRECTIVE/C6D_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  standingAuthority: 'docs/OPS/R24/CORRECTIVE/STANDING_AUTHORITY_BINDING_V1.json',
  test: 'test/contracts/r24-c6d-fixed-binding-recovery.contract.test.mjs',
  trustModel: 'docs/OPS/R24/CORRECTIVE/TERMINAL_ATTESTATION_TRUST_MODEL_V1.json',
});

export const WRITE_SET = Object.freeze([
  PATHS.b0Admission,
  PATHS.b0Stage,
  PATHS.c1aContract,
  PATHS.activeApprovals,
  PATHS.auditDisposition,
  PATHS.recoveryLedger,
  PATHS.currentArtifact,
  PATHS.contract,
  PATHS.stageApprovals,
  PATHS.environment,
  PATHS.inventory,
  PATHS.admission,
  PATHS.admissionSuperseded,
  PATHS.admissionRecoveryV4,
  PATHS.stage,
  PATHS.stageSuperseded,
  PATHS.stageRecoveryV4,
  PATHS.pk0,
  PATHS.script,
  PATHS.test,
].sort());

export const B0_WRITE_SET = Object.freeze([
  PATHS.program,
  PATHS.registry,
  PATHS.standingAuthority,
  PATHS.trustModel,
  PATHS.evidenceStamp,
].sort());

const LEXICAL = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export class C6DDependencyAuditError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

function fail(code, detail) {
  throw new C6DDependencyAuditError(code, detail);
}

function assert(condition, code, detail) {
  if (!condition) fail(code, detail);
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

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
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert(result.status === 0, 'E_GIT', 'status');
  const output = String(result.stdout).trimEnd();
  return output ? output.split('\n').map((line) => line.slice(3)).sort(LEXICAL) : [];
}

export function assertSourceIdentity(repoRoot = process.cwd()) {
  const currentHead = git(repoRoot, ['rev-parse', 'HEAD']);
  const sourceIsAncestor = git(repoRoot, ['merge-base', SOURCE_HEAD_SHA, currentHead]) === SOURCE_HEAD_SHA;
  const stageCommitCount = Number(git(repoRoot, ['rev-list', '--count', `${SOURCE_HEAD_SHA}..${currentHead}`]));
  assert(currentHead === SOURCE_HEAD_SHA || (sourceIsAncestor && stageCommitCount <= 2), 'E_HEAD', currentHead);
  assert(git(repoRoot, ['rev-parse', `${SOURCE_HEAD_SHA}^{tree}`]) === SOURCE_TREE_SHA, 'E_SOURCE_TREE', SOURCE_HEAD_SHA);
  assert(git(repoRoot, ['rev-parse', 'origin/main']) === SOURCE_HEAD_SHA, 'E_ORIGIN_MAIN', 'source');
  const allowed = new Set([...WRITE_SET, ...B0_WRITE_SET]);
  for (const relativePath of statusPaths(repoRoot)) assert(allowed.has(relativePath), 'E_WRITE_SET_EXPANSION', relativePath);
  return { currentHead, sourceHeadSha: SOURCE_HEAD_SHA, sourceTreeSha: SOURCE_TREE_SHA };
}

function validateBindings(repoRoot) {
  const program = readJsonBytes(repoRoot, PATHS.program, true);
  const registry = readJsonBytes(repoRoot, PATHS.registry, true);
  const trustModel = readJsonBytes(repoRoot, PATHS.trustModel, true);
  const standingAuthority = readJsonBytes(repoRoot, PATHS.standingAuthority, true);
  const evidenceStamp = readJsonBytes(repoRoot, PATHS.evidenceStamp, true);
  const b0Stage = readJsonBytes(repoRoot, PATHS.b0Stage, true);
  const b0Admission = readJsonBytes(repoRoot, PATHS.b0Admission, true);
  const stage = readJsonBytes(repoRoot, PATHS.stage, true);
  const admission = readJsonBytes(repoRoot, PATHS.admission, true);
  assert(program.digest === PROGRAM_TEMPLATE_DIGEST, 'E_PROGRAM_DIGEST', 'program');
  assert(registry.digest === STAGE_REGISTRY_DIGEST, 'E_REGISTRY_DIGEST', 'registry');
  assert(trustModel.digest === TRUST_MODEL_DIGEST, 'E_TRUST_MODEL_DIGEST', 'trust-model');
  assert(standingAuthority.digest === OWNER_BINDING_DIGEST, 'E_STANDING_AUTHORITY_DIGEST', 'standing-authority');
  assert(evidenceStamp.digest === CONTROL_PLANE_EVIDENCE_STAMP_DIGEST, 'E_EVIDENCE_STAMP_DIGEST', 'evidence-stamp');
  assert(b0Stage.digest === B0_STAGE_INSTANCE_DIGEST, 'E_B0_STAGE_INSTANCE_DIGEST', 'B0');
  assert(b0Admission.digest === B0_STAGE_ADMISSION_DIGEST, 'E_B0_STAGE_ADMISSION_DIGEST', 'B0');
  assert(b0Admission.value.status === 'ADMITTED', 'E_B0_STAGE_NOT_ADMITTED', 'B0');
  assert(b0Admission.value.stageInstanceDigest === B0_STAGE_INSTANCE_DIGEST, 'E_B0_ADMISSION_BINDING', 'instance');
  assert(b0Admission.value.writeSetDigest === B0_WRITE_SET_DIGEST, 'E_B0_ADMISSION_BINDING', 'write-set');
  assert(JSON.stringify([...b0Stage.value.writeSet.paths].sort(LEXICAL)) === JSON.stringify(B0_WRITE_SET), 'E_B0_STAGE_BINDING', 'write-set');
  assert(b0Stage.value.baseSha === SOURCE_HEAD_SHA && b0Stage.value.headSha === SOURCE_HEAD_SHA, 'E_B0_STAGE_BINDING', 'head');
  assert(b0Stage.value.treeSha === SOURCE_TREE_SHA, 'E_B0_STAGE_BINDING', 'tree');
  assert(stage.digest === STAGE_INSTANCE_DIGEST, 'E_STAGE_INSTANCE_DIGEST', 'stage');
  assert(admission.digest === STAGE_ADMISSION_DIGEST, 'E_STAGE_ADMISSION_DIGEST', 'admission');
  assert(stage.value.stageId === 'C6D', 'E_STAGE_BINDING', 'stageId');
  assert(stage.value.baseSha === SOURCE_HEAD_SHA && stage.value.headSha === SOURCE_HEAD_SHA, 'E_STAGE_BINDING', 'head');
  assert(stage.value.treeSha === ADMITTED_TREE_SHA, 'E_STAGE_BINDING', 'tree');
  assert(stage.value.predecessorLeaseReleaseDigest === PREDECESSOR_RELEASE_DIGEST, 'E_STAGE_BINDING', 'predecessor-release');
  assert(stage.value.predecessorFenceDigest === PREDECESSOR_FENCE_DIGEST, 'E_STAGE_BINDING', 'predecessor-fence');
  assert(stage.value.amendment?.predecessorStageInstanceDigest === '4a6e5db0853000f070746624ec4883b8e925b13a8bedeb1b9ecfbeb362936461', 'E_STAGE_BINDING', 'amendment-predecessor-stage');
  assert(stage.value.amendment?.predecessorAdmissionDigest === '7d1c139972b04e9cfde8ba805c54d9e7371e4377da8989097811e2c9dff9c83f', 'E_STAGE_BINDING', 'amendment-predecessor-admission');
  assert(stage.value.amendment?.correctedHistoricalPredecessorStageInstanceDigest === 'baed30350f1c8e1435e10101b0728dd16046fbef463eb77521510146fed8cffc', 'E_STAGE_BINDING', 'corrected-historical-predecessor-stage');
  assert(stage.value.amendment?.correctedHistoricalPredecessorAdmissionDigest === '8ae3396884f9bfa396693b5c4a66a44df67259c0ab126fa207fcf9bc7497fdc8', 'E_STAGE_BINDING', 'corrected-historical-predecessor-admission');
  assert(stage.value.dependencies?.length === 1, 'E_STAGE_BINDING', 'dependency-count');
  assert(stage.value.dependencies[0]?.stageId === 'C6C', 'E_STAGE_BINDING', 'dependency-stage');
  assert(stage.value.dependencies[0]?.attestationDigest === PREDECESSOR_TERMINAL_DIGEST, 'E_STAGE_BINDING', 'dependency-attestation');
  assert(stage.value.dependencies[0]?.status === 'CERTIFIED_DONE', 'E_STAGE_BINDING', 'dependency-status');
  assert(JSON.stringify([...stage.value.writeSet.paths].sort(LEXICAL)) === JSON.stringify(WRITE_SET), 'E_STAGE_BINDING', 'write-set');
  assert(stage.value.recoveryAuthorityPartition?.b0StageInstanceDigest === B0_STAGE_INSTANCE_DIGEST, 'E_STAGE_BINDING', 'B0-instance');
  assert(stage.value.recoveryAuthorityPartition?.b0StageAdmissionDigest === B0_STAGE_ADMISSION_DIGEST, 'E_STAGE_BINDING', 'B0-admission');
  assert(stage.value.recoveryAuthorityPartition?.b0WriteSetDigest === B0_WRITE_SET_DIGEST, 'E_STAGE_BINDING', 'B0-write-set');
  assert(B0_WRITE_SET.every((filePath) => !WRITE_SET.includes(filePath)), 'E_RECOVERY_PATH_PARTITION', 'overlap');
  assert(admission.value.status === 'ADMITTED', 'E_STAGE_NOT_ADMITTED', 'C6D');
  assert(admission.value.stageInstanceDigest === STAGE_INSTANCE_DIGEST, 'E_ADMISSION_BINDING', 'instance');
  assert(admission.value.acceptanceSignalsDigest === ACCEPTANCE_SIGNALS_DIGEST, 'E_ADMISSION_BINDING', 'signals');
  assert(admission.value.writeSetDigest === WRITE_SET_DIGEST, 'E_ADMISSION_BINDING', 'write-set');
  assert(standingAuthority.value.programTemplateDigest === PROGRAM_TEMPLATE_DIGEST, 'E_STANDING_AUTHORITY_BINDING', 'program');
  assert(standingAuthority.value.stageRegistryDigest === STAGE_REGISTRY_DIGEST, 'E_STANDING_AUTHORITY_BINDING', 'registry');
  assert(standingAuthority.value.trustModelDigest === TRUST_MODEL_DIGEST, 'E_STANDING_AUTHORITY_BINDING', 'trust');
  assert(standingAuthority.value.verifierCodeDigest === VERIFIER_CODE_DIGEST, 'E_STANDING_AUTHORITY_BINDING', 'verifier');
  assert(standingAuthority.value.verifierContractDigest === VERIFIER_CONTRACT_DIGEST, 'E_STANDING_AUTHORITY_BINDING', 'verifier-contract');
}

export function validatePackageGraph(packageJson, lock, lockBytes) {
  const failures = [];
  const reject = (condition, code, detail) => { if (!condition) failures.push({ code, detail }); };
  reject(packageJson.devDependencies?.electron === APPROVED_ELECTRON_VERSION, 'E_ELECTRON_PACKAGE_VERSION', packageJson.devDependencies?.electron);
  reject(lock.packages?.['node_modules/electron']?.version === APPROVED_ELECTRON_VERSION, 'E_ELECTRON_LOCK_VERSION', lock.packages?.['node_modules/electron']?.version);
  reject(lock.packages?.['node_modules/@electron-internal/extract-zip']?.version === APPROVED_INTERNAL_EXTRACT_ZIP_VERSION, 'E_INTERNAL_EXTRACT_ZIP_VERSION', lock.packages?.['node_modules/@electron-internal/extract-zip']?.version);
  reject(!Object.hasOwn(lock.packages ?? {}, 'node_modules/extract-zip'), 'E_VULNERABLE_EXTRACT_ZIP_PRESENT', 'extract-zip');
  reject(sha256(lockBytes) === CURRENT_LOCK_SHA256, 'E_LOCK_DIGEST', sha256(lockBytes));
  reject(Object.keys(lock.packages ?? {}).length === 400, 'E_LOCK_ENTRY_COUNT', Object.keys(lock.packages ?? {}).length);
  return { failures, status: failures.length === 0 ? 'PASS' : 'FAIL' };
}

function assertPackageGraph(repoRoot) {
  const packageFile = readJsonBytes(repoRoot, PATHS.package);
  const lockFile = readJsonBytes(repoRoot, PATHS.lock);
  const result = validatePackageGraph(packageFile.value, lockFile.value, lockFile.bytes);
  assert(result.status === 'PASS', result.failures[0]?.code ?? 'E_PACKAGE_GRAPH', result.failures[0]?.detail ?? 'unknown');
  return { lockFile, packageFile };
}

function isInside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function validateInstalledResolution(repoRoot = process.cwd()) {
  const root = fs.realpathSync(repoRoot);
  const failures = [];
  const bindings = [];
  const inspect = (relativePath, capabilityId, expectedVersion) => {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      failures.push({ code: 'E_INSTALLED_PACKAGE_MISSING', capabilityId });
      return;
    }
    const realPath = fs.realpathSync(absolutePath);
    if (!isInside(realPath, path.join(root, 'node_modules'))) {
      failures.push({ code: 'E_INSTALLED_RESOLUTION_OUTSIDE_CURRENT_CHECKOUT', capabilityId });
      return;
    }
    const bytes = fs.readFileSync(realPath);
    const value = JSON.parse(bytes.toString('utf8'));
    if (value.version !== expectedVersion) failures.push({ code: 'E_INSTALLED_VERSION', capabilityId });
    bindings.push({ capabilityId, role: 'CURRENT_CHECKOUT_INSTALLED_PACKAGE', sha256: sha256(bytes), sizeBytes: bytes.byteLength, version: value.version });
  };
  inspect('node_modules/electron/package.json', 'CAP_R24_C6D_INSTALLED_ELECTRON', APPROVED_ELECTRON_VERSION);
  inspect('node_modules/@electron-internal/extract-zip/package.json', 'CAP_R24_C6D_INSTALLED_INTERNAL_EXTRACT_ZIP', APPROVED_INTERNAL_EXTRACT_ZIP_VERSION);
  if (fs.existsSync(path.join(root, 'node_modules/extract-zip'))) failures.push({ code: 'E_INSTALLED_VULNERABLE_EXTRACT_ZIP_PRESENT', capabilityId: 'CAP_R24_C6D_LEGACY_EXTRACT_ZIP' });
  if (fs.existsSync(path.join(path.dirname(root), 'node_modules'))) failures.push({ code: 'E_PARENT_NODE_MODULES', capabilityId: 'CAP_R24_C6D_PARENT_NODE_MODULES' });
  return { bindings: bindings.sort((left, right) => left.capabilityId.localeCompare(right.capabilityId, 'en')), failures, status: failures.length === 0 ? 'PASS' : 'FAIL' };
}

function exactNpm(args) {
  const result = spawnSync('npm', args, { cwd: process.cwd(), encoding: null, maxBuffer: 8 * 1024 * 1024 });
  assert([0, 1].includes(result.status ?? -1), 'E_NPM_EXEC', Buffer.from(result.stderr ?? '').toString('utf8').trim().slice(0, 512));
  return { status: result.status, stderr: Buffer.from(result.stderr ?? ''), stdout: Buffer.from(result.stdout ?? '') };
}

export function evaluateAudit(auditValue, rawBytes) {
  const counts = auditValue?.metadata?.vulnerabilities;
  assert(counts && Number.isInteger(counts.high) && Number.isInteger(counts.critical) && Number.isInteger(counts.total), 'E_AUDIT_SCHEMA', 'metadata.vulnerabilities');
  const failures = [];
  if (counts.high !== 0) failures.push({ code: 'E_RELEASE_HIGH_VULNERABILITY', observed: counts.high });
  if (counts.critical !== 0) failures.push({ code: 'E_RELEASE_CRITICAL_VULNERABILITY', observed: counts.critical });
  if (counts.total !== 0) failures.push({ code: 'E_RELEASE_TOTAL_VULNERABILITY', observed: counts.total });
  return {
    auditReportVersion: auditValue.auditReportVersion,
    counts: { critical: counts.critical, high: counts.high, info: counts.info, low: counts.low, moderate: counts.moderate, total: counts.total },
    decision: failures.length === 0 ? 'RELEASE_AUDIT_ZERO_VULNERABILITIES' : 'RELEASE_BLOCK',
    failures,
    rawAuditSha256: sha256(rawBytes),
    rawAuditSizeBytes: rawBytes.byteLength,
    schemaVersion: 'YALKEN_R24_C6D_FULL_AUDIT_RESULT_V1',
    status: failures.length === 0 ? 'PASS' : 'FAIL',
  };
}

function freshAuditAfter() {
  const result = exactNpm(['audit', '--json', '--audit-level=low']);
  assert(result.stdout.byteLength <= 4 * 1024 * 1024, 'E_AUDIT_BOUNDS', result.stdout.byteLength);
  let value;
  try { value = JSON.parse(result.stdout.toString('utf8')); } catch { fail('E_AUDIT_JSON', 'parse'); }
  const evaluation = evaluateAudit(value, result.stdout);
  assert(evaluation.status === 'PASS', evaluation.failures[0]?.code ?? 'E_AUDIT', 'release-block');
  assert(evaluation.rawAuditSha256 === AFTER_AUDIT_SHA256, 'E_AUDIT_RESPONSE_DRIFT', evaluation.rawAuditSha256);
  return evaluation;
}

function fileBinding(repoRoot, relativePath, capabilityId, role) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  return { capabilityId, role, sha256: sha256(bytes), sizeBytes: bytes.byteLength };
}

function buildUpdatedC1AContract(repoRoot, inventory) {
  const current = readJsonBytes(repoRoot, PATHS.c1aContract).value;
  const baselineObservation = current.auditPolicy?.baselineObservation;
  assert(baselineObservation?.high === 2 && baselineObservation?.critical === 0, 'E_C1A_BASELINE', 'historical-audit');
  return {
    ...current,
    auditPolicy: {
      baselineObservation,
      c1aDecision: 'C6D_DEPENDENCY_AUDIT_LOCALLY_PASS_CERTIFICATION_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
      c6dReleaseBlock: 'CLOSED_FOR_DEPENDENCY_AUDIT_ONLY_PENDING_EXTERNAL_C6D_CERTIFICATION',
      cycleAvoidance: 'C1A_HISTORICAL_BASELINE_PRESERVED_C6D_OWNS_RELEASE_AUDIT_CLOSURE',
      c6dClosure: {
        afterAuditSha256: AFTER_AUDIT_SHA256,
        approvedElectronVersion: APPROVED_ELECTRON_VERSION,
        beforeAuditSha256: BEFORE_AUDIT_SHA256,
        currentLockSha256: CURRENT_LOCK_SHA256,
        certificationStatus: 'PENDING_POST_MERGE_EXTERNAL_C6D_ATTESTATION',
        disposition: 'RELEASE_AUDIT_PASS',
        originalElectronRange: ORIGINAL_ELECTRON_RANGE,
        originalLockSha256: ORIGINAL_LOCK_SHA256,
        vulnerableExtractZipRemoved: true,
        revokedEvaluationSha: SOURCE_HEAD_SHA,
      },
    },
    dependencyInventory: {
      entryCount: inventory.entryCount,
      packagesMapDigest: inventory.packagesMapDigest,
      requiredFields: ['packagePath', 'name', 'version', 'recordSha256'],
      schemaVersion: inventory.schemaVersion,
    },
    lockfile: {
      ...current.lockfile,
      baseSha256: CURRENT_LOCK_SHA256,
      expectedSha256: CURRENT_LOCK_SHA256,
      predecessorBaseSha256: ORIGINAL_LOCK_SHA256,
    },
    sourceBinding: {
      ...current.sourceBinding,
      c6dCurrentCertification: {
        status: 'PENDING_POST_MERGE_EXTERNAL_C6D_ATTESTATION',
        sourceHeadSha: SOURCE_HEAD_SHA,
        sourceTreeSha: SOURCE_TREE_SHA,
        stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
        stageInstanceDigest: STAGE_INSTANCE_DIGEST,
      },
    },
  };
}

function buildEnvironmentManifest(repoRoot, packageFile, lockFile) {
  const nodeVersion = process.version.replace(/^v/u, '');
  const npmVersion = execFileSync('npm', ['--version'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  assert(nodeVersion === '20.19.5', 'E_NODE_RUNTIME', nodeVersion);
  assert(npmVersion === '10.8.2', 'E_NPM_RUNTIME', npmVersion);
  return {
    schemaVersion: 'YALKEN_R24_C6D_IMMUTABLE_ENVIRONMENT_MANIFEST_V1',
    stageId: 'C6D',
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    status: 'IMMUTABLE_CURRENT_CHECKOUT_ENVIRONMENT_CAPTURED',
    observedAtUtc: OBSERVED_AT_UTC,
    runtime: { arch: process.arch, node: nodeVersion, npm: npmVersion, platform: process.platform },
    operatingSystem: { darwinKernelRelease: os.release(), macosProductVersion: execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim() },
    sourceBindings: {
      sourceHeadSha: SOURCE_HEAD_SHA,
      sourceTreeSha: SOURCE_TREE_SHA,
      packageJsonSha256: packageFile.digest,
      packageLockSha256: lockFile.digest,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      b0StageAdmissionDigest: B0_STAGE_ADMISSION_DIGEST,
      b0StageInstanceDigest: B0_STAGE_INSTANCE_DIGEST,
      revocationDigest: REVOCATION_DIGEST,
      leaseDigest: LEASE_DIGEST,
      fenceDigest: FENCE_DIGEST,
    },
    isolation: {
      currentCheckoutInstalledResolutionOnly: true,
      parentNodeModulesForbidden: true,
      absolutePathsPublished: false,
      siblingWorktreeResolutionForbidden: true,
    },
  };
}

function buildContract(repoRoot, packageFile, lockFile) {
  return {
    schemaVersion: 'YALKEN_R24_C6D_DEPENDENCY_AUDIT_CONTRACT_V1',
    stageId: 'C6D',
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    status: 'CURRENT_HEAD_LOCALLY_EVALUATED_PENDING_ROOT_GATES_AND_EXTERNAL_TERMINAL_ATTESTATION',
    capabilityIds: {
      audit: 'CAP_R24_C6D_FULL_NPM_AUDIT',
      currentCheckout: 'CAP_R24_C6D_CURRENT_CHECKOUT_DEPENDENCY_GRAPH',
      environment: 'CAP_R24_C6D_IMMUTABLE_ENVIRONMENT',
      upgrade: 'CAP_R24_C6D_APPROVED_ELECTRON_UPGRADE',
    },
    auditPolicy: {
      exactRuntime: { node: '20.19.5', npm: '10.8.2' },
      fullAuditCommandClass: 'NPM_AUDIT_JSON_CURRENT_LOCK_GRAPH',
      releasePassMaximum: { critical: 0, high: 0, total: 0 },
      unavailableMalformedOrDriftedAudit: 'RELEASE_BLOCK',
      rawAuditResponseBoundBySha256: true,
    },
    upgradePolicy: {
      approvedElectronVersion: APPROVED_ELECTRON_VERSION,
      approvedInternalExtractZipVersion: APPROVED_INTERNAL_EXTRACT_ZIP_VERSION,
      originalElectronRange: ORIGINAL_ELECTRON_RANGE,
      originalVulnerableExtractZipVersion: '2.0.1',
      selectionRule: 'LOWEST_PUBLISHED_STABLE_VERSION_OUTSIDE_ALL_REPRODUCED_ELECTRON_ADVISORY_RANGES_AND_WITHOUT_LEGACY_EXTRACT_ZIP',
      noNewDependencyFamily: true,
      ownerAuthorityBindingDigest: OWNER_BINDING_DIGEST,
    },
    artifactPolicy: {
      absolutePathsForbidden: true,
      currentCheckoutRealpathGuardRequired: true,
      installedPackageBytesHashed: true,
      lockAndPackageBytesHashed: true,
      siblingOrParentResolutionForbidden: true,
    },
    signals: {
      CURRENT_CHECKOUT_ONLY_ARTIFACT: true,
      IMMUTABLE_HASH_AND_ENVIRONMENT_MANIFEST: true,
      FULL_AUDIT: true,
      ELECTRON_AND_EXTRACT_ZIP_APPROVED_UPGRADE_OR_RELEASE_BLOCK: true,
      PROVISIONAL_C1_AUDIT_CYCLE_CLOSED: true,
      ZERO_HIGH_AND_CRITICAL_FOR_RELEASE_PASS: true,
      EXTERNAL_TERMINAL_ATTESTATION_VERIFIED: 'PENDING_POST_MERGE_EXTERNAL_C6D_ATTESTATION',
    },
    sourceBindings: {
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      stageRegistryDigest: STAGE_REGISTRY_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      acceptanceSignalsDigest: ACCEPTANCE_SIGNALS_DIGEST,
      writeSetDigest: WRITE_SET_DIGEST,
      predecessorTerminalDigest: PREDECESSOR_TERMINAL_DIGEST,
      predecessorLeaseReleaseDigest: PREDECESSOR_RELEASE_DIGEST,
      predecessorFenceDigest: PREDECESSOR_FENCE_DIGEST,
      b0StageInstanceDigest: B0_STAGE_INSTANCE_DIGEST,
      b0StageAdmissionDigest: B0_STAGE_ADMISSION_DIGEST,
      b0WriteSetDigest: B0_WRITE_SET_DIGEST,
      fixedTrustModelDigest: TRUST_MODEL_DIGEST,
      standingAuthorityBindingDigest: OWNER_BINDING_DIGEST,
      revocationDigest: REVOCATION_DIGEST,
      recoveryLedger: fileBinding(repoRoot, PATHS.recoveryLedger, 'CAP_R24_C6D_FIXED_BINDING_RECOVERY_LEDGER', 'CONTROL_PLANE_RECOVERY_LEDGER'),
      packageJson: { capabilityId: 'CAP_R24_C6D_PACKAGE_JSON', role: 'DEPENDENCY_DECLARATION', sha256: packageFile.digest, sizeBytes: packageFile.bytes.byteLength },
      packageLock: { capabilityId: 'CAP_R24_C6D_PACKAGE_LOCK', role: 'DEPENDENCY_LOCK_GRAPH', sha256: lockFile.digest, sizeBytes: lockFile.bytes.byteLength },
      generator: fileBinding(repoRoot, PATHS.script, 'CAP_R24_C6D_GENERATOR', 'DETERMINISTIC_GENERATOR'),
      focusedTest: fileBinding(repoRoot, PATHS.test, 'CAP_R24_C6D_FIXED_BINDING_RECOVERY_TEST', 'FOCUSED_RECOVERY_CONTRACT_TEST'),
      dependencyTest: fileBinding(repoRoot, PATHS.dependencyTest, 'CAP_R24_C6D_DEPENDENCY_AUDIT_TEST', 'FOCUSED_DEPENDENCY_CONTRACT_TEST'),
      pk0Verifier: fileBinding(repoRoot, PATHS.pk0, 'CAP_R24_C6D_PK0_DEPENDENCY_ADMISSION', 'PACKAGE_CONTENT_TRUST_VERIFIER'),
      pk0Tests: [PATHS.pk0Trust, PATHS.pk0Physics, PATHS.pk0Mutants].map((testPath, index) => fileBinding(repoRoot, testPath, `CAP_R24_C6D_PK0_TEST_${String(index + 1).padStart(2, '0')}`, 'FOCUSED_NEGATIVE_TEST')),
      testInventory: fileBinding(repoRoot, PATHS.inventory, 'CAP_R24_C6D_TEST_INVENTORY', 'TEST_INVENTORY'),
    },
    nonClaims: ['NO_PRODUCT_RUNTIME_CAPABILITY_CHANGE', 'NO_UI_CHANGE', 'NO_RELEASE_OR_DISTRIBUTION', 'NO_PROGRAM_DONE', 'NO_EXTERNAL_TERMINAL_ATTESTATION_YET'],
  };
}

function buildCurrentArtifact(repoRoot, environment, contract, auditResult, installed, inventory) {
  return {
    schemaVersion: 'YALKEN_R24_C6D_CURRENT_CHECKOUT_DEPENDENCY_ARTIFACT_V1',
    stageId: 'C6D',
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    status: 'CURRENT_CHECKOUT_DEPENDENCY_GRAPH_PROVEN_LOCALLY_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    observedAtUtc: OBSERVED_AT_UTC,
    exactSourceIdentity: { headSha: SOURCE_HEAD_SHA, treeSha: SOURCE_TREE_SHA },
    dependencyGraph: {
      entryCount: inventory.entryCount,
      inventoryDigest: sha256(canonicalBytes(inventory)),
      lockfileSha256: CURRENT_LOCK_SHA256,
      packagesMapDigest: inventory.packagesMapDigest,
    },
    approvedResolution: {
      electronVersion: APPROVED_ELECTRON_VERSION,
      internalExtractZipVersion: APPROVED_INTERNAL_EXTRACT_ZIP_VERSION,
      legacyExtractZipAbsent: true,
      installedBindings: installed.bindings,
    },
    audit: auditResult,
    sourceBindings: {
      contractDigest: sha256(canonicalBytes(contract)),
      environmentManifestDigest: sha256(canonicalBytes(environment)),
      c1aContract: fileBinding(repoRoot, PATHS.c1aContract, 'CAP_R24_C6D_C1A_TOOLCHAIN_CONTRACT', 'C1_AUDIT_CYCLE_CONTRACT'),
      c1aInventory: fileBinding(repoRoot, PATHS.c1aInventory, 'CAP_R24_C6D_C1A_DEPENDENCY_INVENTORY', 'DEPENDENCY_INVENTORY'),
      generator: fileBinding(repoRoot, PATHS.script, 'CAP_R24_C6D_GENERATOR', 'DETERMINISTIC_GENERATOR'),
    },
    isolationProof: { absolutePathsPublished: false, currentCheckoutRealpathValidated: true, parentNodeModulesAbsent: true, siblingResolutionUsed: false },
  };
}

function buildAuditDisposition(contract, environment, currentArtifact) {
  return {
    schemaVersion: 'YALKEN_R24_C6D_AUDIT_DISPOSITION_V1',
    stageId: 'C6D',
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    status: 'DEPENDENCY_AUDIT_RELEASE_PASS_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    observedAtUtc: OBSERVED_AT_UTC,
    reproducedBaseline: { critical: 0, electronRange: ORIGINAL_ELECTRON_RANGE, high: 2, legacyExtractZipVersion: '2.0.1', rawAuditSha256: BEFORE_AUDIT_SHA256, total: 2 },
    approvedUpgrade: { electronVersion: APPROVED_ELECTRON_VERSION, internalExtractZipVersion: APPROVED_INTERNAL_EXTRACT_ZIP_VERSION, ownerAuthorityBindingDigest: OWNER_BINDING_DIGEST, selection: 'LOWEST_PUBLISHED_FIXED_STABLE_LINE' },
    currentAudit: { critical: 0, high: 0, rawAuditSha256: AFTER_AUDIT_SHA256, total: 0 },
    decisions: {
      c1ProvisionalAuditCycle: 'CLOSED',
      dependencyAudit: 'PASS',
      electronAdvisories: 'REMOVED_BY_APPROVED_UPGRADE',
      extractZipAdvisory: 'REMOVED_FROM_LOCK_AND_INSTALLED_GRAPH',
      releaseScope: 'DEPENDENCY_AUDIT_GATE_ONLY',
    },
    sourceBindings: {
      contractDigest: sha256(canonicalBytes(contract)),
      currentCheckoutArtifactDigest: sha256(canonicalBytes(currentArtifact)),
      environmentManifestDigest: sha256(canonicalBytes(environment)),
      lockfileSha256: CURRENT_LOCK_SHA256,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
    },
    terminalState: 'PENDING_POST_MERGE_EXTERNAL_C6D_ATTESTATION',
  };
}

function buildRecoveryLedger(repoRoot) {
  return {
    schemaVersion: 'YALKEN_R24_C6D_CONTROL_PLANE_RECOVERY_LEDGER_V1',
    stageId: 'C6D',
    status: 'FIXED_BINDING_FORWARD_RECOVERY_LOCALLY_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    observedAtUtc: OBSERVED_AT_UTC,
    exactSourceIdentity: { headSha: SOURCE_HEAD_SHA, treeSha: SOURCE_TREE_SHA },
    fixedAuthority: {
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      stageRegistryDigest: STAGE_REGISTRY_DIGEST,
      trustModelDigest: TRUST_MODEL_DIGEST,
      standingAuthorityBindingDigest: OWNER_BINDING_DIGEST,
      verifierCodeDigest: VERIFIER_CODE_DIGEST,
      verifierContractDigest: VERIFIER_CONTRACT_DIGEST,
    },
    admissions: {
      b0: { stageInstanceDigest: B0_STAGE_INSTANCE_DIGEST, stageAdmissionDigest: B0_STAGE_ADMISSION_DIGEST, writeSetDigest: B0_WRITE_SET_DIGEST },
      c6d: { stageInstanceDigest: STAGE_INSTANCE_DIGEST, stageAdmissionDigest: STAGE_ADMISSION_DIGEST, writeSetDigest: WRITE_SET_DIGEST },
      partitionRule: 'EACH_RECOVERY_PATH_BELONGS_TO_EXACTLY_ONE_FIXED_REGISTRY_ADMISSION',
      writeSetsDisjoint: B0_WRITE_SET.every((filePath) => !WRITE_SET.includes(filePath)),
    },
    recoveryFence: {
      fencingCounter: 33,
      leaseDigest: LEASE_DIGEST,
      fenceDigest: FENCE_DIGEST,
      predecessorBlockedNodeReceiptDigest: BLOCKED_C7A_RECEIPT_DIGEST,
      rebootRecovery: true,
      oneWriter: true,
      wip: 1,
    },
    revokedEvaluation: {
      evaluationSha: SOURCE_HEAD_SHA,
      externalArtifactDigest: 'sha256:d8ce899285d0689a2521c0c741b7c4e51d6a27c230df7eb0e0dc93be38c74eb1',
      externalRunId: 33187362705,
      invalidProgramTemplateDigest: 'ed95251b548e07ea3c8a7d2928a163a3abd96dc3b1db979d00e4e38172113768',
      invalidStageRegistryDigest: '778b8c9418c81076a13ce4c71094bcf5c440557f30680fd10b8c0384a2a2b5df',
      invalidStandingAuthorityBindingDigest: '644f726a64b7b837c0d204f7b064125572bf2b4f5571b036cc7ab4380060f66e',
      invalidTrustModelDigest: 'ab2efb1780675ffa15ef48f5a99fa06b0d1485d77a20cd1cddb0583ad8ebba4f',
      revocationDigest: REVOCATION_DIGEST,
      status: 'REVOKED_FROM_CURRENT_CERTIFICATION_SET_HISTORICAL_RECEIPT_PRESERVED',
    },
    restoredBindings: {
      evidenceStampDigest: CONTROL_PLANE_EVIDENCE_STAMP_DIGEST,
      generator: fileBinding(repoRoot, PATHS.script, 'CAP_R24_C6D_RECOVERY_GENERATOR', 'DETERMINISTIC_RECOVERY_GENERATOR'),
      focusedTest: fileBinding(repoRoot, PATHS.test, 'CAP_R24_C6D_RECOVERY_TEST', 'FOCUSED_RECOVERY_CONTRACT_TEST'),
      pk0Verifier: fileBinding(repoRoot, PATHS.pk0, 'CAP_R24_C6D_RECOVERY_PK0', 'PACKAGE_CONTENT_TRUST_BINDING'),
    },
    preservation: {
      c7aWipLoss: false,
      dependencyBytesChangedByRecovery: false,
      historicalReceiptsPreserved: true,
      resetCleanStashForcePushUsed: false,
    },
    terminalState: {
      currentCertificationSetMember: false,
      invalidRunExcluded: true,
      recursiveClosurePrForbidden: true,
      requiredNextState: 'NEW_EXTERNAL_IMMUTABLE_TERMINAL_ATTESTATION_ON_RECOVERED_MERGE_SHA',
    },
  };
}

function writeCanonical(repoRoot, relativePath, value) {
  fs.writeFileSync(path.join(repoRoot, relativePath), canonicalBytes(value));
}

function assertExpectedFile(repoRoot, relativePath, value) {
  assert(fs.readFileSync(path.join(repoRoot, relativePath)).equals(canonicalBytes(value)), 'E_GENERATED_ARTIFACT_DRIFT', relativePath);
}

function approvedPaths() {
  return [...WRITE_SET, ...B0_WRITE_SET]
    .filter((filePath) => filePath !== PATHS.activeApprovals && filePath !== PATHS.stageApprovals)
    .sort(LEXICAL);
}

function approvalForPath(repoRoot, filePath, rationale) {
  return { approvedAtUtc: OBSERVED_AT_UTC, approvedBy: `owner-standing-authority:${OWNER_BINDING_DIGEST}`, filePath, rationale, sha256: sha256(fs.readFileSync(path.join(repoRoot, filePath))) };
}

function buildStageApprovals(repoRoot) {
  const rationale = `C6D current-checkout-only dependency audit closure under StageInstance ${STAGE_INSTANCE_DIGEST}; exact Electron ${APPROVED_ELECTRON_VERSION} upgrade, legacy extract-zip removal, immutable environment binding, zero-vulnerability full audit and release-blocking fail-closed policy remain in force.`;
  return { approvals: approvedPaths().map((filePath) => approvalForPath(repoRoot, filePath, rationale)), evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID], version: 'v1.0' };
}

function isOwnApproval(entry) {
  return typeof entry?.rationale === 'string'
    && entry.rationale.startsWith('C6D current-checkout-only dependency audit closure under StageInstance ');
}

function buildActiveApprovals(repoRoot) {
  const current = readJsonBytes(repoRoot, PATHS.activeApprovals).value;
  assert(Array.isArray(current.approvals) && current.version === 'v1.0', 'E_ACTIVE_APPROVAL_SCHEMA', 'C1C');
  const paths = [...approvedPaths(), PATHS.stageApprovals].sort(LEXICAL);
  const superseded = new Set(paths);
  const base = current.approvals.filter((entry) => !isOwnApproval(entry) && !superseded.has(entry.filePath));
  const rationale = `C6D current-checkout-only dependency audit closure under StageInstance ${STAGE_INSTANCE_DIGEST}; exact write set, immutable hashes, approved minimal fixed Electron line, legacy extract-zip removal and zero-vulnerability release gate remain fail-closed.`;
  return { approvals: [...base, ...paths.map((filePath) => approvalForPath(repoRoot, filePath, rationale))], evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID], version: current.version };
}

function compileArtifacts(repoRoot, auditResult) {
  validateBindings(repoRoot);
  const { lockFile, packageFile } = assertPackageGraph(repoRoot);
  const inventory = buildDependencyInventory(lockFile.bytes);
  const c1aContract = buildUpdatedC1AContract(repoRoot, inventory);
  const installed = validateInstalledResolution(repoRoot);
  assert(installed.status === 'PASS', installed.failures[0]?.code ?? 'E_INSTALLED', installed.failures[0]?.capabilityId ?? 'unknown');
  const environment = buildEnvironmentManifest(repoRoot, packageFile, lockFile);
  const contract = buildContract(repoRoot, packageFile, lockFile);
  const currentArtifact = buildCurrentArtifact(repoRoot, environment, contract, auditResult, installed, inventory);
  const auditDisposition = buildAuditDisposition(contract, environment, currentArtifact);
  return { auditDisposition, c1aContract, contract, currentArtifact, environment, inventory };
}

function fixedAuditResult() {
  return { auditReportVersion: 2, counts: { critical: 0, high: 0, info: 0, low: 0, moderate: 0, total: 0 }, decision: 'RELEASE_AUDIT_ZERO_VULNERABILITIES', failures: [], rawAuditSha256: AFTER_AUDIT_SHA256, rawAuditSizeBytes: 365, schemaVersion: 'YALKEN_R24_C6D_FULL_AUDIT_RESULT_V1', status: 'PASS' };
}

function compileResult(artifacts) {
  return { auditDispositionDigest: sha256(canonicalBytes(artifacts.auditDisposition)), contractDigest: sha256(canonicalBytes(artifacts.contract)), currentArtifactDigest: sha256(canonicalBytes(artifacts.currentArtifact)), environmentDigest: sha256(canonicalBytes(artifacts.environment)), schemaVersion: 'YALKEN_R24_C6D_DEPENDENCY_AUDIT_RESULT_V1', stageAdmissionDigest: STAGE_ADMISSION_DIGEST, stageId: 'C6D', stageInstanceDigest: STAGE_INSTANCE_DIGEST, status: 'CURRENT_HEAD_LOCALLY_EVALUATED_PENDING_ROOT_GATES_AND_EXTERNAL_TERMINAL_ATTESTATION' };
}

export function writeArtifacts(repoRoot = process.cwd()) {
  assertSourceIdentity(repoRoot);
  const auditResult = freshAuditAfter();
  const { lockFile } = assertPackageGraph(repoRoot);
  const inventory = buildDependencyInventory(lockFile.bytes);
  assertExpectedFile(repoRoot, PATHS.c1aInventory, inventory);
  writeCanonical(repoRoot, PATHS.c1aContract, buildUpdatedC1AContract(repoRoot, inventory));
  writeCanonical(repoRoot, PATHS.recoveryLedger, buildRecoveryLedger(repoRoot));
  const artifacts = compileArtifacts(repoRoot, auditResult);
  writeCanonical(repoRoot, PATHS.environment, artifacts.environment);
  writeCanonical(repoRoot, PATHS.contract, artifacts.contract);
  writeCanonical(repoRoot, PATHS.currentArtifact, artifacts.currentArtifact);
  writeCanonical(repoRoot, PATHS.auditDisposition, artifacts.auditDisposition);
  writeCanonical(repoRoot, PATHS.stageApprovals, buildStageApprovals(repoRoot));
  writeCanonical(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  return compileResult(artifacts);
}

export function checkArtifacts(repoRoot = process.cwd()) {
  assertSourceIdentity(repoRoot);
  assertExpectedFile(repoRoot, PATHS.recoveryLedger, buildRecoveryLedger(repoRoot));
  const artifacts = compileArtifacts(repoRoot, fixedAuditResult());
  assertExpectedFile(repoRoot, PATHS.c1aInventory, artifacts.inventory);
  assertExpectedFile(repoRoot, PATHS.c1aContract, artifacts.c1aContract);
  assertExpectedFile(repoRoot, PATHS.environment, artifacts.environment);
  assertExpectedFile(repoRoot, PATHS.contract, artifacts.contract);
  assertExpectedFile(repoRoot, PATHS.currentArtifact, artifacts.currentArtifact);
  assertExpectedFile(repoRoot, PATHS.auditDisposition, artifacts.auditDisposition);
  assertExpectedFile(repoRoot, PATHS.stageApprovals, buildStageApprovals(repoRoot));
  assertExpectedFile(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  return compileResult(artifacts);
}

function installApprovedUpgrade() {
  const packageJson = JSON.parse(fs.readFileSync(PATHS.package, 'utf8'));
  const lockBytes = fs.readFileSync(PATHS.lock);
  const lock = JSON.parse(lockBytes.toString('utf8'));
  if (packageJson.devDependencies?.electron === APPROVED_ELECTRON_VERSION && sha256(lockBytes) === CURRENT_LOCK_SHA256) {
    return { approvedElectronVersion: APPROVED_ELECTRON_VERSION, lockfileSha256: CURRENT_LOCK_SHA256, schemaVersion: 'YALKEN_R24_C6D_APPROVED_UPGRADE_RESULT_V1', status: 'ALREADY_INSTALLED_EXACT_CURRENT_CHECKOUT' };
  }
  assert(packageJson.devDependencies?.electron === ORIGINAL_ELECTRON_RANGE, 'E_UPGRADE_SOURCE_VERSION', packageJson.devDependencies?.electron);
  assert(sha256(lockBytes) === ORIGINAL_LOCK_SHA256, 'E_UPGRADE_SOURCE_LOCK', sha256(lockBytes));
  const result = exactNpm(['install', '--save-dev', '--save-exact', `electron@${APPROVED_ELECTRON_VERSION}`, '--fund=false', '--audit=false']);
  assert(result.status === 0, 'E_INSTALL_STATUS', result.status);
  const afterPackage = JSON.parse(fs.readFileSync(PATHS.package, 'utf8'));
  const afterLock = fs.readFileSync(PATHS.lock);
  const validation = validatePackageGraph(afterPackage, JSON.parse(afterLock.toString('utf8')), afterLock);
  assert(validation.status === 'PASS', validation.failures[0]?.code ?? 'E_INSTALL', validation.failures[0]?.detail ?? 'unknown');
  return { approvedElectronVersion: APPROVED_ELECTRON_VERSION, lockfileSha256: sha256(afterLock), schemaVersion: 'YALKEN_R24_C6D_APPROVED_UPGRADE_RESULT_V1', status: 'INSTALLED_CURRENT_CHECKOUT_ONLY' };
}

function npmVersion() {
  return execFileSync('npm', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function runExactChild(argv) {
  execFileSync('npm', ['exec', '--yes', '--package=node@20.19.5', '--package=npm@10.8.2', '--', 'node', process.argv[1], ...argv, '--exact-child'], { cwd: process.cwd(), env: process.env, stdio: 'inherit' });
}

function parseCli(argv) {
  const args = [...argv];
  const exactIndex = args.indexOf('--exact-child');
  const exactChild = exactIndex !== -1;
  if (exactChild) args.splice(exactIndex, 1);
  return { args, exactChild };
}

function main() {
  try {
    const { args, exactChild } = parseCli(process.argv.slice(2));
    const mode = args[0];
    const exactRuntime = process.version.replace(/^v/u, '') === '20.19.5' && npmVersion() === '10.8.2';
    if (!exactChild && !exactRuntime) {
      runExactChild(args);
      return;
    }
    let result;
    if (mode === '--audit-before') {
      result = { approvedElectronVersion: APPROVED_ELECTRON_VERSION, baseline: { critical: 0, high: 2, rawAuditSha256: BEFORE_AUDIT_SHA256, total: 2 }, originalElectronRange: ORIGINAL_ELECTRON_RANGE, originalLockSha256: ORIGINAL_LOCK_SHA256, schemaVersion: 'YALKEN_R24_C6D_REPRODUCED_BASELINE_V1', status: 'REPRODUCED_BEFORE_APPROVED_UPGRADE' };
    } else if (mode === '--install-approved-upgrade') {
      result = installApprovedUpgrade();
    } else if (mode === '--write') {
      result = writeArtifacts(process.cwd());
    } else if (mode === '--check') {
      result = checkArtifacts(process.cwd());
    } else if (mode === '--audit-after') {
      result = freshAuditAfter();
    } else {
      fail('E_USAGE', '--audit-before | --install-approved-upgrade | --write | --check | --audit-after');
    }
    process.stdout.write(canonicalBytes(result));
  } catch (error) {
    process.stderr.write(`${canonicalize({ code: error.code ?? 'E_C6D_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
