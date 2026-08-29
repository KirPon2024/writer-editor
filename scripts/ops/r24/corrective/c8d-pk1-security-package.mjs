#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { buildInventory } from '../test-inventory.mjs';
import { evaluateRepositoryReleaseSecurityPhysical } from '../release-security-physical-pk1.mjs';
import { canonicalBytes } from './canonical-json.mjs';
import { verifySealedRawArtifacts } from './c8c-macos-artifact.mjs';

export const STAGE_ID = 'C8D';
export const OBSERVED_AT_UTC = '2026-08-29T03:18:00Z';
export const PROGRAM_TEMPLATE_DIGEST = '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a';
export const STAGE_REGISTRY_DIGEST = 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a';
export const TRUST_MODEL_DIGEST = '4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d';
export const OWNER_BINDING_DIGEST = 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6';
export const STAGE_INSTANCE_DIGEST = '03fb9fd8aa7991b74c240e9560258bbae2643aa0e6e65850f44849bdcd1acf9a';
export const STAGE_ADMISSION_DIGEST = 'b9ea68d0a608ffb9e681d10283e055b558e32d143d18ae09efe98bf2ac2d629e';
export const ACCEPTANCE_SIGNALS_DIGEST = '1c6610f5a29b0609b66971b7d6a4bad4b092f4da3c788e3392c2c34f0c35f665';
export const WRITE_SET_DIGEST = 'b6a29b9006232b9b181fcebacd425c95d92138d45c88d5ce8efcad86ccc5756c';
export const SOURCE_HEAD_SHA = '3617c2bfbc17398ecc42bdb2d55f2d54c4803b17';
export const SOURCE_TREE_SHA = '4bc565bf7a544c9864a5148c23416de10a889633';
export const PREDECESSOR_TERMINAL_DIGEST = '8f907fe61b10173ccb0b49f964b08157c472b73e7ee0dda3ea570821487df602';
export const PREDECESSOR_CERTIFIED_DONE_RECEIPT_DIGEST = 'c1ac5f2ee31f36ec95a9472b99af2cca0b9939ecfa8e8ba66e79990f94148656';
export const PREDECESSOR_LEASE_RELEASE_DIGEST = '205f480319f787e3c2a58ba95d265f5c4b349b1944fd770c4e3d532c4568759b';
export const PREDECESSOR_EVIDENCE_DIGEST = 'd28d4fc9e5c48e083230f0aa6a0af3873b5195aeb9856acfc17bbdf973ee99cd';
export const LEASE_DIGEST = 'a628943f000979a32186c1934c560c8fa25cc1b327c01e44382b7e531c5cfc0c';
export const FENCE_DIGEST = 'a2cc34a9e3f998e1e1b3e3c16cebd8b04f88fe5930eb9982770adcc18fbbf043';
export const FENCE_COUNTER = 48;
export const CONTROL_PLANE_EVIDENCE_STAMP_ID = 'ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS';
export const C8C_ARTIFACT_TREE_DIGEST = '255d5b241f3fc370f390ff356de5470bb9699d3734e185869467044be832cee1';
export const C8C_RAW_MANIFEST_DIGEST = '87b7db351c9d3a079488fb85218b443acf979d00be0d5f76c55d8dc5cad0105e';

const EXPECTED_BLOCKERS = Object.freeze([
  'APPLE_NOTARIZATION_NOT_READY',
  'DEVELOPER_ID_SIGNATURE_NOT_READY',
  'ELECTRON_FUSE_POLICY_NOT_PROVEN',
  'HARDENED_RUNTIME_NOT_PROVEN_FOR_DISTRIBUTION',
  'NON_MACOS_TARGETS_NOT_ACTIVATED',
  'PHYSICAL_RECEIPTS_NOT_CURRENT_HEAD',
  'PRODUCTION_RELEASE_PUBLICATION_NOT_AUTHORIZED',
]);
const EXPECTED_STALE_RECEIPTS = Object.freeze(['c01', 'c02', 'c03', 'c04']);
const LOCAL_LEASE = '/private/tmp/yalken-r24-corrective-canonical-writer.lock/lease-c8d-pk1-security-package-v1.json';
const LOCAL_FENCE = '/private/tmp/yalken-r24-corrective-canonical-writer.lock/fence-c8d-pk1-security-package-v1.json';
const LEXICAL = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export const PATHS = Object.freeze({
  activeApprovals: 'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  approvals: 'docs/OPS/R24/CORRECTIVE/C8D_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  c8cEvidence: 'docs/OPS/R24/CORRECTIVE/C8C_MACOS_ARTIFACT_EVIDENCE_V1.json',
  contract: 'docs/OPS/R24/CORRECTIVE/C8D_PK1_SECURITY_PACKAGE_CONTRACT_V1.json',
  evidence: 'docs/OPS/R24/CORRECTIVE/C8D_PK1_SECURITY_PACKAGE_EVIDENCE_V1.json',
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  package: 'package.json',
  pk1Script: 'scripts/ops/r24/release-security-physical-pk1.mjs',
  program: 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json',
  registry: 'docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json',
  script: 'scripts/ops/r24/corrective/c8d-pk1-security-package.mjs',
  stageAdmission: 'docs/OPS/R24/CORRECTIVE/C8D_STAGE_ADMISSION_ATTESTATION_V1.json',
  stageInstance: 'docs/OPS/R24/CORRECTIVE/C8D_STAGE_INSTANCE_V1.json',
  standing: 'docs/OPS/R24/CORRECTIVE/STANDING_AUTHORITY_BINDING_V1.json',
  test: 'test/contracts/r24-c8d-pk1-security-package.contract.test.mjs',
  trust: 'docs/OPS/R24/CORRECTIVE/TERMINAL_ATTESTATION_TRUST_MODEL_V1.json',
});

export const WRITE_SET = Object.freeze([
  PATHS.inventory, PATHS.activeApprovals, PATHS.approvals, PATHS.contract, PATHS.evidence,
  PATHS.stageAdmission, PATHS.stageInstance, PATHS.script, PATHS.test,
].sort(LEXICAL));

export class C8DPk1SecurityPackageError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.code = code; }
}
function fail(code, detail) { throw new C8DPk1SecurityPackageError(code, detail); }
function assert(condition, code, detail) { if (!condition) fail(code, detail); }
export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function isHex64(value) { return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value); }
function sameArray(actual, expected) { return JSON.stringify(actual) === JSON.stringify(expected); }

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

export function validateBoundedDeltaObservation(observation) {
  const { candidateSha, changedPaths = [], commitCount, sourceIsAncestor } = observation || {};
  assert(/^[0-9a-f]{40}$/u.test(candidateSha || ''), 'E_DELTA_SHA', String(candidateSha));
  assert(sourceIsAncestor === true, 'E_SOURCE_HEAD_NOT_ANCESTOR', candidateSha);
  assert(Number.isInteger(commitCount) && commitCount >= 0 && commitCount <= 2, 'E_UNBOUNDED_DELTA', String(commitCount));
  if (candidateSha === SOURCE_HEAD_SHA) assert(commitCount === 0 && changedPaths.length === 0, 'E_SOURCE_DELTA_NOT_EMPTY', candidateSha);
  else assert(commitCount >= 1, 'E_DESCENDANT_DELTA_EMPTY', candidateSha);
  for (const relativePath of changedPaths) {
    assert(relativePath === path.posix.normalize(relativePath) && !path.posix.isAbsolute(relativePath)
      && !relativePath.startsWith('../') && !relativePath.includes('\\') && WRITE_SET.includes(relativePath), 'E_WRITE_SET_DRIFT', relativePath);
  }
  assert(new Set(changedPaths).size === changedPaths.length, 'E_DELTA_PATH_DUPLICATE', candidateSha);
  return true;
}
function observeDelta(repoRoot, candidateSha) {
  if (candidateSha === SOURCE_HEAD_SHA) return validateBoundedDeltaObservation({ candidateSha, changedPaths: [], commitCount: 0, sourceIsAncestor: true });
  const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', SOURCE_HEAD_SHA, candidateSha], { cwd: repoRoot });
  return validateBoundedDeltaObservation({
    candidateSha,
    changedPaths: git(repoRoot, ['diff', '--name-only', SOURCE_HEAD_SHA, candidateSha]).split('\n').filter(Boolean),
    commitCount: Number(git(repoRoot, ['rev-list', '--count', `${SOURCE_HEAD_SHA}..${candidateSha}`])),
    sourceIsAncestor: ancestor.status === 0,
  });
}
export function assertHeadContour(repoRoot = process.cwd()) {
  const currentHead = git(repoRoot, ['rev-parse', 'HEAD']);
  const originMainSha = git(repoRoot, ['rev-parse', 'origin/main']);
  assert(git(repoRoot, ['rev-parse', `${SOURCE_HEAD_SHA}^{tree}`]) === SOURCE_TREE_SHA, 'E_SOURCE_TREE', SOURCE_TREE_SHA);
  observeDelta(repoRoot, currentHead);
  observeDelta(repoRoot, originMainSha);
  for (const relativePath of statusPaths(repoRoot)) assert(WRITE_SET.includes(relativePath), 'E_DIRTY_PATH_OUTSIDE_WRITE_SET', relativePath);
  return { currentHead, originMainSha };
}

export function assertPathlessPublicEvidence(value) {
  const visit = (candidate) => {
    if (typeof candidate === 'string') assert(!candidate.includes('/Users/') && !candidate.includes('/Volumes/') && !candidate.includes('/private/') && !candidate.includes('\\'), 'E_PUBLIC_PATH_LEAK', candidate);
    else if (Array.isArray(candidate)) candidate.forEach(visit);
    else if (candidate && typeof candidate === 'object') Object.values(candidate).forEach(visit);
  };
  visit(value);
  return true;
}

function validateBindings(repoRoot) {
  const fixed = [[PATHS.program, PROGRAM_TEMPLATE_DIGEST], [PATHS.registry, STAGE_REGISTRY_DIGEST], [PATHS.trust, TRUST_MODEL_DIGEST], [PATHS.standing, OWNER_BINDING_DIGEST], [PATHS.stageInstance, STAGE_INSTANCE_DIGEST], [PATHS.stageAdmission, STAGE_ADMISSION_DIGEST], [PATHS.c8cEvidence, PREDECESSOR_EVIDENCE_DIGEST]];
  for (const [relativePath, digest] of fixed) assert(readJsonBytes(repoRoot, relativePath, true).digest === digest, 'E_FIXED_BINDING', relativePath);
  const instance = readJsonBytes(repoRoot, PATHS.stageInstance, true).value;
  const admission = readJsonBytes(repoRoot, PATHS.stageAdmission, true).value;
  assert(instance.stageId === STAGE_ID && admission.stageId === STAGE_ID && admission.status === 'ADMITTED', 'E_STAGE_BINDING', STAGE_ID);
  assert(admission.stageInstanceDigest === STAGE_INSTANCE_DIGEST && admission.writeSetDigest === WRITE_SET_DIGEST
    && admission.acceptanceSignalsDigest === ACCEPTANCE_SIGNALS_DIGEST, 'E_ADMISSION_BINDING', STAGE_ID);
  const lease = JSON.parse(fs.readFileSync(LOCAL_LEASE, 'utf8'));
  const fence = JSON.parse(fs.readFileSync(LOCAL_FENCE, 'utf8'));
  assert(sha256(fs.readFileSync(LOCAL_LEASE)) === LEASE_DIGEST && sha256(fs.readFileSync(LOCAL_FENCE)) === FENCE_DIGEST, 'E_LEASE_FENCE_DIGEST', STAGE_ID);
  assert(lease.status === 'ACTIVE' && fence.status === 'ACTIVE' && lease.fencingCounter === FENCE_COUNTER && fence.fencingCounter === FENCE_COUNTER
    && lease.stageAdmissionDigest === STAGE_ADMISSION_DIGEST && fence.stageAdmissionDigest === STAGE_ADMISSION_DIGEST, 'E_LEASE_FENCE_STATE', STAGE_ID);
  const c8cEvidence = readJsonBytes(repoRoot, PATHS.c8cEvidence, true).value;
  assert(c8cEvidence.observations?.artifact?.treeDigest === C8C_ARTIFACT_TREE_DIGEST
    && c8cEvidence.observations?.rawArtifacts?.manifest?.sha256 === C8C_RAW_MANIFEST_DIGEST, 'E_C8C_ARTIFACT_BINDING', STAGE_ID);
  return c8cEvidence;
}

function receiptCapability(key, read, receipt) {
  return {
    bytes: read.bytes,
    capabilityId: `CAP_R24_C8D_LEGACY_PHYSICAL_RECEIPT_${key.toUpperCase()}`,
    headSha: receipt?.git?.headSha || receipt?.headSha || receipt?.exactHeadSha || 'UNKNOWN',
    role: 'LEGACY_PHYSICAL_RECEIPT_INPUT',
    sha256: read.sha256,
  };
}

function observePk1(repoRoot, c8cEvidence) {
  const result = evaluateRepositoryReleaseSecurityPhysical({ repoRoot, expectedHeadSha: SOURCE_HEAD_SHA });
  assert(result.ok === true, 'E_PK1_CLASSIFIER', JSON.stringify(result.error?.value?.errors || []));
  const value = result.value;
  assert(value.pass === true && value.state === 'ready_for_package_claim_compiler'
    && value.profileVerdictCandidate === 'NOT_READY' && value.stageClosureKind === 'TYPED_RELEASE_SECURITY_NOT_READY_CLASSIFICATION', 'E_PK1_VERDICT', value.profileVerdictCandidate);
  assert(sameArray(value.blockers, EXPECTED_BLOCKERS) && sameArray(value.releaseReadiness.staleReceipts, EXPECTED_STALE_RECEIPTS), 'E_PK1_TYPED_BLOCKERS', JSON.stringify(value.blockers));
  assert(value.releaseReadiness.productionReleaseReady === false && value.releaseReadiness.currentHeadPhysicalPackageProof === false
    && value.authority.releaseReadyClaim === false && value.authority.signingPassClaim === false && value.authority.notarizationPassClaim === false
    && value.authority.fusePassClaim === false && value.authority.programScalarPass === false, 'E_FALSE_DONE_PROMOTION', STAGE_ID);
  assert(value.authority.productRuntimeMutation === false && value.authority.dependencyMutation === false
    && value.authority.lockfileMutation === false && value.authority.runtimeNetworkActivated === false
    && value.authority.signingCredentialUse === false && value.authority.notarizationCredentialUse === false
    && value.authority.releasePublication === false, 'E_EXTERNAL_EFFECT_BOUNDARY', STAGE_ID);
  const sealed = verifySealedRawArtifacts(c8cEvidence);
  const appAsar = sealed.manifest.files.find((entry) => entry.artifactRelativePath.endsWith('/Contents/Resources/app.asar'));
  assert(appAsar && isHex64(appAsar.sha256), 'E_C8C_APP_ASAR_BINDING', 'app.asar');
  assert(appAsar.sha256 !== value.evidence.appAsarSha256, 'E_STALE_RECEIPT_NOT_DISTINGUISHED', appAsar.sha256);
  const capabilities = Object.entries(value.evidence.receiptFiles).sort(([left], [right]) => LEXICAL(left, right)).map(([key, read]) => {
    const file = readJsonBytes(repoRoot, read.path).value;
    return receiptCapability(key, { bytes: read.bytes, sha256: read.sha256 }, file);
  });
  return { capabilities, currentAppAsarDigest: appAsar.sha256, value };
}

export function buildContract(repoRoot = process.cwd()) {
  const c8cEvidence = validateBindings(repoRoot);
  const observation = observePk1(repoRoot, c8cEvidence);
  const inventoryDigest = sha256(canonicalBytes(buildInventory(repoRoot)));
  const contract = {
    acceptanceContract: {
      C8C_CERTIFIED_DEPENDENCY: true,
      CURRENT_C8C_ARTIFACT_BINDING: true,
      FIXED_AUTHORITY_BINDING: true,
      NO_SIGN_NOTARIZE_DISTRIBUTE: true,
      PK1_SECURITY_PACKAGE_PASS: true,
      STALE_LEGACY_PHYSICAL_RECEIPTS_EXPLICIT: true,
      TYPED_NOT_READY_WITHOUT_FALSE_DONE: true,
    },
    claimCeiling: {
      currentHeadLegacyPhysicalPass: false,
      developerIdSigningPass: false,
      fusePass: false,
      hardenedRuntimePass: false,
      notarizationPass: false,
      productionDistributionPass: false,
      productionReleaseReady: false,
      programDone: false,
      stageClassificationPassOnly: true,
    },
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    packageSecurityContract: {
      classifierStageId: 'PK1_RELEASE_SECURITY_PHYSICAL',
      expectedBlockers: EXPECTED_BLOCKERS,
      expectedStaleReceipts: EXPECTED_STALE_RECEIPTS,
      profileId: 'PACKAGED_RELEASE_SECURITY',
      profileVerdictCandidate: 'NOT_READY',
      stageClosureKind: 'TYPED_RELEASE_SECURITY_NOT_READY_CLASSIFICATION',
    },
    schemaVersion: 'YALKEN_R24_C8D_PK1_SECURITY_PACKAGE_CONTRACT_V1',
    sourceBindings: {
      c8cArtifactTreeDigest: C8C_ARTIFACT_TREE_DIGEST,
      c8cCurrentAppAsarDigest: observation.currentAppAsarDigest,
      c8cEvidenceDigest: PREDECESSOR_EVIDENCE_DIGEST,
      c8cRawManifestDigest: C8C_RAW_MANIFEST_DIGEST,
      currentTestInventoryDigest: inventoryDigest,
      ownerAuthorityBindingDigest: OWNER_BINDING_DIGEST,
      predecessorCertifiedDoneReceiptDigest: PREDECESSOR_CERTIFIED_DONE_RECEIPT_DIGEST,
      predecessorLeaseReleaseDigest: PREDECESSOR_LEASE_RELEASE_DIGEST,
      predecessorTerminalDigest: PREDECESSOR_TERMINAL_DIGEST,
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      sourceHeadSha: SOURCE_HEAD_SHA,
      sourceTreeSha: SOURCE_TREE_SHA,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
    },
    stageId: STAGE_ID,
    status: 'ACTIVE_CONTRACT',
  };
  validateContract(contract);
  return contract;
}

export function validateContract(contract) {
  assert(contract?.schemaVersion === 'YALKEN_R24_C8D_PK1_SECURITY_PACKAGE_CONTRACT_V1' && contract.stageId === STAGE_ID && contract.status === 'ACTIVE_CONTRACT', 'E_CONTRACT_SCHEMA', STAGE_ID);
  for (const signal of ['C8C_CERTIFIED_DEPENDENCY', 'CURRENT_C8C_ARTIFACT_BINDING', 'FIXED_AUTHORITY_BINDING', 'NO_SIGN_NOTARIZE_DISTRIBUTE', 'PK1_SECURITY_PACKAGE_PASS', 'STALE_LEGACY_PHYSICAL_RECEIPTS_EXPLICIT', 'TYPED_NOT_READY_WITHOUT_FALSE_DONE']) assert(contract.acceptanceContract?.[signal] === true, 'E_ACCEPTANCE_SIGNAL', signal);
  assert(contract.packageSecurityContract?.profileVerdictCandidate === 'NOT_READY'
    && sameArray(contract.packageSecurityContract.expectedBlockers, EXPECTED_BLOCKERS)
    && sameArray(contract.packageSecurityContract.expectedStaleReceipts, EXPECTED_STALE_RECEIPTS), 'E_TYPED_NOT_READY_CONTRACT', STAGE_ID);
  assert(Object.entries(contract.claimCeiling || {}).every(([key, value]) => key === 'stageClassificationPassOnly' ? value === true : value === false), 'E_CLAIM_CEILING', STAGE_ID);
  const bindings = contract.sourceBindings || {};
  assert(bindings.programTemplateDigest === PROGRAM_TEMPLATE_DIGEST && bindings.ownerAuthorityBindingDigest === OWNER_BINDING_DIGEST
    && bindings.sourceHeadSha === SOURCE_HEAD_SHA && bindings.sourceTreeSha === SOURCE_TREE_SHA
    && bindings.stageInstanceDigest === STAGE_INSTANCE_DIGEST && bindings.stageAdmissionDigest === STAGE_ADMISSION_DIGEST
    && bindings.predecessorTerminalDigest === PREDECESSOR_TERMINAL_DIGEST && bindings.c8cArtifactTreeDigest === C8C_ARTIFACT_TREE_DIGEST
    && bindings.c8cRawManifestDigest === C8C_RAW_MANIFEST_DIGEST && isHex64(bindings.c8cCurrentAppAsarDigest)
    && isHex64(bindings.currentTestInventoryDigest), 'E_SOURCE_BINDING', STAGE_ID);
  assertPathlessPublicEvidence(contract);
  return true;
}

export function buildEvidence(repoRoot, contract) {
  const c8cEvidence = validateBindings(repoRoot);
  const observation = observePk1(repoRoot, c8cEvidence);
  const value = observation.value;
  const evidence = {
    acceptanceSignals: {
      C8C_CERTIFIED_DEPENDENCY: 'PASS', CURRENT_C8C_ARTIFACT_BINDING: 'PASS', FIXED_AUTHORITY_BINDING: 'PASS',
      NO_SIGN_NOTARIZE_DISTRIBUTE: 'PASS', PK1_SECURITY_PACKAGE_PASS: 'PASS', STALE_LEGACY_PHYSICAL_RECEIPTS_EXPLICIT: 'PASS',
      TYPED_NOT_READY_WITHOUT_FALSE_DONE: 'PASS',
    },
    contractDigest: sha256(canonicalBytes(contract)),
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    externalTerminalAttestation: { required: true, status: 'AWAITING_POST_MERGE_EXTERNAL_C8D_ATTESTATION' },
    observations: {
      c8cArtifact: {
        artifactTree: { capabilityId: 'CAP_R24_C8D_C8C_ARTIFACT_TREE', role: 'CERTIFIED_UNSIGNED_MACOS_ARTIFACT_TREE', sha256: C8C_ARTIFACT_TREE_DIGEST },
        currentAppAsar: { capabilityId: 'CAP_R24_C8D_C8C_CURRENT_APP_ASAR', role: 'CURRENT_C8C_APP_ASAR', sha256: observation.currentAppAsarDigest },
        rawManifest: { capabilityId: 'CAP_R24_C8D_C8C_RAW_MANIFEST', role: 'CERTIFIED_IMMUTABLE_ARTIFACT_MANIFEST', sha256: C8C_RAW_MANIFEST_DIGEST },
      },
      legacyPhysicalReceipts: observation.capabilities,
      pk1: {
        appAsarSha256: value.evidence.appAsarSha256,
        blockers: value.blockers,
        currentHeadPhysicalPackageProof: value.releaseReadiness.currentHeadPhysicalPackageProof,
        errors: value.errors,
        pass: value.pass,
        productionReleaseReady: value.releaseReadiness.productionReleaseReady,
        profileVerdictCandidate: value.profileVerdictCandidate,
        staleReceipts: value.releaseReadiness.staleReceipts,
        stageClosureKind: value.stageClosureKind,
        state: value.state,
      },
      safety: {
        credentialsRead: false, dependencyMutation: false, lockfileMutation: false, notarization: false,
        packageOrWorkflowMutation: false, productRuntimeMutation: false, publicDistribution: false,
        runtimeNetworkActivated: false, signing: false, userDataTouched: false,
      },
    },
    schemaVersion: 'YALKEN_R24_C8D_PK1_SECURITY_PACKAGE_EVIDENCE_V1',
    sourceBindings: contract.sourceBindings,
    stageId: STAGE_ID,
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
  };
  validateEvidence(evidence, contract);
  return evidence;
}

export function validateEvidence(evidence, contract) {
  assert(evidence?.schemaVersion === 'YALKEN_R24_C8D_PK1_SECURITY_PACKAGE_EVIDENCE_V1' && evidence.stageId === STAGE_ID
    && evidence.status === 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION', 'E_EVIDENCE_SCHEMA', STAGE_ID);
  assert(evidence.contractDigest === sha256(canonicalBytes(contract)), 'E_CONTRACT_BINDING', evidence.contractDigest);
  assert(Object.values(evidence.acceptanceSignals || {}).every((value) => value === 'PASS'), 'E_ACCEPTANCE_SIGNAL', STAGE_ID);
  const pk1 = evidence.observations?.pk1 || {};
  assert(pk1.pass === true && pk1.state === 'ready_for_package_claim_compiler' && pk1.profileVerdictCandidate === 'NOT_READY'
    && pk1.productionReleaseReady === false && pk1.currentHeadPhysicalPackageProof === false
    && sameArray(pk1.blockers, EXPECTED_BLOCKERS) && sameArray(pk1.staleReceipts, EXPECTED_STALE_RECEIPTS) && pk1.errors.length === 0, 'E_PK1_EVIDENCE', STAGE_ID);
  assert(pk1.appAsarSha256 !== evidence.observations.c8cArtifact?.currentAppAsar?.sha256, 'E_STALE_RECEIPT_NOT_DISTINGUISHED', pk1.appAsarSha256);
  assert(evidence.observations.c8cArtifact?.artifactTree?.sha256 === contract.sourceBindings.c8cArtifactTreeDigest
    && evidence.observations.c8cArtifact?.currentAppAsar?.sha256 === contract.sourceBindings.c8cCurrentAppAsarDigest
    && evidence.observations.c8cArtifact?.rawManifest?.sha256 === contract.sourceBindings.c8cRawManifestDigest, 'E_C8C_ARTIFACT_BINDING', STAGE_ID);
  const safety = evidence.observations?.safety || {};
  assert(Object.values(safety).every((value) => value === false), 'E_EXTERNAL_EFFECT_BOUNDARY', STAGE_ID);
  assert(sameArray(evidence.sourceBindings, contract.sourceBindings), 'E_SOURCE_BINDING', STAGE_ID);
  assertPathlessPublicEvidence(evidence);
  return true;
}

function writeCanonical(repoRoot, relativePath, value) { fs.writeFileSync(path.join(repoRoot, relativePath), canonicalBytes(value)); }
function approvedPaths() { return [PATHS.contract, PATHS.evidence, PATHS.inventory, PATHS.script, PATHS.stageAdmission, PATHS.stageInstance, PATHS.test].sort(LEXICAL); }
function approvalForPath(repoRoot, filePath, rationale) {
  return { approvedAtUtc: OBSERVED_AT_UTC, approvedBy: `owner-standing-authority:${OWNER_BINDING_DIGEST}`, filePath, rationale, sha256: sha256(fs.readFileSync(path.join(repoRoot, filePath))) };
}
function buildStageApprovals(repoRoot) {
  const rationale = `C8D bounded PK1 security-package classifier envelope under StageInstance ${STAGE_INSTANCE_DIGEST}; PASS is limited to typed classification while NOT_READY, stale legacy physical receipts, unsigned C8C artifact truth, and no signing, notarization, distribution, credential, dependency, package, workflow, release, or Program DONE expansion remain fail-closed.`;
  return { approvals: approvedPaths().map((filePath) => approvalForPath(repoRoot, filePath, rationale)), evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID], version: 'v1.0' };
}
function isOwnApproval(entry) { return entry?.approvedAtUtc === OBSERVED_AT_UTC && typeof entry.rationale === 'string' && entry.rationale.startsWith('C8D bounded PK1 security-package classifier envelope under StageInstance '); }
function buildActiveApprovals(repoRoot) {
  const current = readJsonBytes(repoRoot, PATHS.activeApprovals).value;
  assert(Array.isArray(current.approvals) && current.version === 'v1.0', 'E_ACTIVE_APPROVAL_SCHEMA', 'C1C');
  const paths = [...approvedPaths(), PATHS.approvals].sort(LEXICAL);
  const superseded = new Set(paths);
  const preserved = current.approvals.filter((entry) => !isOwnApproval(entry) && !superseded.has(entry.filePath));
  const rationale = `C8D current PK1 security-package classification under StageInstance ${STAGE_INSTANCE_DIGEST}; exact write set and C8C artifact are bound, legacy receipt staleness and NOT_READY remain explicit, and release authority remains absent.`;
  return { approvals: [...preserved, ...paths.map((filePath) => approvalForPath(repoRoot, filePath, rationale))], evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID], version: current.version };
}
function result(contract, evidence, mode, extra = {}) {
  return { contractDigest: sha256(canonicalBytes(contract)), evidenceDigest: sha256(canonicalBytes(evidence)), mode,
    pk1Verdict: evidence.observations.pk1.profileVerdictCandidate, stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
    stageId: STAGE_ID, stageInstanceDigest: STAGE_INSTANCE_DIGEST, status: evidence.status, ...extra };
}

export function runAndWrite(repoRoot = process.cwd()) {
  assertHeadContour(repoRoot);
  validateBindings(repoRoot);
  writeCanonical(repoRoot, PATHS.inventory, buildInventory(repoRoot));
  const contract = buildContract(repoRoot);
  const evidence = buildEvidence(repoRoot, contract);
  writeCanonical(repoRoot, PATHS.contract, contract);
  writeCanonical(repoRoot, PATHS.evidence, evidence);
  writeCanonical(repoRoot, PATHS.approvals, buildStageApprovals(repoRoot));
  writeCanonical(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  return result(contract, evidence, 'WRITE');
}
export function checkCurrent(repoRoot = process.cwd()) {
  assertHeadContour(repoRoot);
  validateBindings(repoRoot);
  const inventory = buildInventory(repoRoot);
  assert(canonicalBytes(inventory).equals(fs.readFileSync(path.join(repoRoot, PATHS.inventory))), 'E_INVENTORY_STALE', PATHS.inventory);
  const contract = buildContract(repoRoot);
  assert(canonicalBytes(contract).equals(fs.readFileSync(path.join(repoRoot, PATHS.contract))), 'E_CONTRACT_STALE', PATHS.contract);
  const evidence = readJsonBytes(repoRoot, PATHS.evidence, true).value;
  validateEvidence(evidence, contract);
  assert(canonicalBytes(buildStageApprovals(repoRoot)).equals(fs.readFileSync(path.join(repoRoot, PATHS.approvals))), 'E_STAGE_APPROVALS_STALE', PATHS.approvals);
  assert(canonicalBytes(buildActiveApprovals(repoRoot)).equals(fs.readFileSync(path.join(repoRoot, PATHS.activeApprovals))), 'E_ACTIVE_APPROVALS_STALE', PATHS.activeApprovals);
  return result(contract, evidence, 'CHECK');
}
export function runProbe(repoRoot = process.cwd()) {
  const contract = buildContract(repoRoot);
  const evidence = readJsonBytes(repoRoot, PATHS.evidence, true).value;
  const mutants = [
    ['FALSE_RELEASE_READY', (mutant) => { mutant.observations.pk1.productionReleaseReady = true; }],
    ['FALSE_CURRENT_HEAD_PHYSICAL', (mutant) => { mutant.observations.pk1.currentHeadPhysicalPackageProof = true; }],
    ['DROP_STALE_BLOCKER', (mutant) => { mutant.observations.pk1.blockers = mutant.observations.pk1.blockers.filter((entry) => entry !== 'PHYSICAL_RECEIPTS_NOT_CURRENT_HEAD'); }],
    ['CURRENT_ARTIFACT_DRIFT', (mutant) => { mutant.observations.c8cArtifact.currentAppAsar.sha256 = '0'.repeat(64); }],
    ['SIGNING', (mutant) => { mutant.observations.safety.signing = true; }],
    ['NOTARIZATION', (mutant) => { mutant.observations.safety.notarization = true; }],
    ['DISTRIBUTION', (mutant) => { mutant.observations.safety.publicDistribution = true; }],
    ['PROGRAM_DONE', (mutant) => { mutant.sourceBindings.programDone = true; }],
  ];
  const probeResults = mutants.map(([id, mutate]) => {
    const mutant = structuredClone(evidence);
    mutate(mutant);
    try { validateEvidence(mutant, contract); } catch (error) { return { errorCode: error.code || 'UNKNOWN', id, killed: true }; }
    return { errorCode: null, id, killed: false };
  });
  assert(probeResults.every((entry) => entry.killed), 'E_PROBE_SURVIVOR', JSON.stringify(probeResults.filter((entry) => !entry.killed)));
  return result(contract, evidence, 'PROBE', { mutantsKilled: probeResults.length, mutantsTotal: probeResults.length, probeResults });
}

function main() {
  try {
    const mode = process.argv[2] || '--check';
    assert(['--write', '--check', '--probe'].includes(mode), 'E_USAGE', '--write | --check | --probe');
    const output = mode === '--write' ? runAndWrite(process.cwd()) : mode === '--probe' ? runProbe(process.cwd()) : checkCurrent(process.cwd());
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message || String(error)}\n`);
    process.exitCode = 1;
  }
}
if (import.meta.url === `file://${process.argv[1]}`) main();
