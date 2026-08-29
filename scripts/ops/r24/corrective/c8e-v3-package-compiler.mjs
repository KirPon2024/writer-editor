#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { compilePackageVerdict } from '../package-claim-compiler-v3.mjs';
import { buildInventory } from '../test-inventory.mjs';
import { canonicalBytes } from './canonical-json.mjs';

export const STAGE_ID = 'C8E';
export const OBSERVED_AT_UTC = '2026-08-29T04:28:22Z';
export const PROGRAM_TEMPLATE_DIGEST = '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a';
export const STAGE_REGISTRY_DIGEST = 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a';
export const TRUST_MODEL_DIGEST = '4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d';
export const OWNER_BINDING_DIGEST = 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6';
export const STAGE_INSTANCE_DIGEST = '6d6ea53145265bf31465b81b7d0f0dfd66fa5dce35c2edd859e217af92eca696';
export const STAGE_ADMISSION_DIGEST = 'aa9280ce97c979691762f640249b787da2b0dd6484c3b8fd33534b1ef2de8ed8';
export const ACCEPTANCE_SIGNALS_DIGEST = '41be732dd240e02f5c22820506dd1e95819a6e56b69735f617d98c34c4df8a7c';
export const WRITE_SET_DIGEST = '2e7745d7f573de705e1e3c91dfbbb9bd7fa65282582e17c52adf439de7573752';
export const SOURCE_HEAD_SHA = 'a044da92cc85cbe54a7261a4c7430c83d7e85dbd';
export const SOURCE_TREE_SHA = 'a0cd27dc14381c0c93f0c8fc5961814c8f77ae91';
export const PREDECESSOR_TERMINAL_DIGEST = '07c8ebd7c44e0c90bfd3bb3f7b04041aaec49c85fc14de79596ba22dd5a6e74c';
export const PREDECESSOR_CERTIFIED_DONE_RECEIPT_DIGEST = 'b3e3c3fcdaa544ebaeebb5939d6fc03b2b314966c5d0c2acf8e2aeb632b07458';
export const PREDECESSOR_LEASE_RELEASE_DIGEST = '72f0fbba583a9ead2212e440c876acb1334e352ca2c4622fe9d98b4b5b3275db';
export const LEASE_DIGEST = '803785702b853a839d247d475e2db9303f89a297315c11721b5a1db6de194975';
export const FENCE_DIGEST = '5b6cbc24228361af136fe094731e1adaa96c6702f6d39a85e065f84ed401026e';
export const FENCE_COUNTER = 49;
export const C8D_CONTRACT_DIGEST = 'cce00920aacf24e60490e583bd5098ca2d468cd741cbdc776d08f40569d45795';
export const C8D_EVIDENCE_DIGEST = '52900c2f40ff13f95f80cced44a776b79e2dfeaa6050c8a9f48f34474fcabe33';
export const C8D_SCRIPT_DIGEST = '39fd1a25864ac88e9135c4faad38da735cc0e0ed2fe58cba237a843e99bdfc7b';
export const V3_COMPILER_DIGEST = 'c79ee1641b5a4339eb1b8d6a76fb8f0075c9da718e2ab8b2ba22d7d89de56f0c';
export const PROGRAM_DAG_DIGEST = 'bf3f7e6e3871ebc5e5a4a83b6ded88db3ce6759df59b466b62cba1eea792be2e';
export const SCIENTIFIC_CONTRACTS_DIGEST = '840e408e8b21ff1e4da21f50d30b102ef1aedfcf9df0927c6aac848fdfd64468';
export const WORKFLOW_DIGEST = '3e81406269948b08aa95d40043046b624594dbb118291da051dfa2ea4200dc1c';
export const PACKAGE_JSON_DIGEST = '4fbc7196f596c36a5741411fd9c622ab2227749648f619deba3eb81027b5a39e';
export const C8D_TERMINAL_ARTIFACT_DIGEST = '6858abc1dbeb7db8937f498faef928d54f44f1c8bd73fca5ad37a0ccb3dc1545';
export const C8D_TERMINAL_RUN_ID = 33233687714;
export const C8D_TERMINAL_JOB_ID = 99050819829;
export const CONTROL_PLANE_EVIDENCE_STAMP_ID = 'ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS';

const LOCAL_LEASE = '/private/tmp/yalken-r24-corrective-canonical-writer.lock/lease-c8e-v3-package-compiler-v1.json';
const LOCAL_FENCE = '/private/tmp/yalken-r24-corrective-canonical-writer.lock/fence-c8e-v3-package-compiler-v1.json';
const LEXICAL = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export const PATHS = Object.freeze({
  activeApprovals: 'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  approvals: 'docs/OPS/R24/CORRECTIVE/C8E_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  c8dContract: 'docs/OPS/R24/CORRECTIVE/C8D_PK1_SECURITY_PACKAGE_CONTRACT_V1.json',
  c8dEvidence: 'docs/OPS/R24/CORRECTIVE/C8D_PK1_SECURITY_PACKAGE_EVIDENCE_V1.json',
  c8dScript: 'scripts/ops/r24/corrective/c8d-pk1-security-package.mjs',
  contract: 'docs/OPS/R24/CORRECTIVE/C8E_V3_PACKAGE_COMPILER_CONTRACT_V1.json',
  evidence: 'docs/OPS/R24/CORRECTIVE/C8E_V3_PACKAGE_COMPILER_EVIDENCE_V1.json',
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  package: 'package.json',
  program: 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json',
  programDag: 'docs/OPS/EVIDENCE/YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1/PROGRAM_DAG.json',
  registry: 'docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json',
  scientificContracts: 'docs/OPS/EVIDENCE/YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1/SCIENTIFIC_CONTRACTS.json',
  script: 'scripts/ops/r24/corrective/c8e-v3-package-compiler.mjs',
  stageAdmission: 'docs/OPS/R24/CORRECTIVE/C8E_STAGE_ADMISSION_ATTESTATION_V1.json',
  stageInstance: 'docs/OPS/R24/CORRECTIVE/C8E_STAGE_INSTANCE_V1.json',
  standing: 'docs/OPS/R24/CORRECTIVE/STANDING_AUTHORITY_BINDING_V1.json',
  test: 'test/contracts/r24-c8e-v3-package-compiler.contract.test.mjs',
  trust: 'docs/OPS/R24/CORRECTIVE/TERMINAL_ATTESTATION_TRUST_MODEL_V1.json',
  v3Compiler: 'scripts/ops/r24/package-claim-compiler-v3.mjs',
  workflow: '.github/workflows/rtk-required.yml',
});

export const WRITE_SET = Object.freeze([
  PATHS.inventory, PATHS.activeApprovals, PATHS.approvals, PATHS.stageAdmission,
  PATHS.stageInstance, PATHS.contract, PATHS.evidence, PATHS.script, PATHS.test,
].sort(LEXICAL));

const EXACT_SOURCE_INPUTS = Object.freeze([
  [PATHS.c8dContract, C8D_CONTRACT_DIGEST],
  [PATHS.c8dEvidence, C8D_EVIDENCE_DIGEST],
  [PATHS.c8dScript, C8D_SCRIPT_DIGEST],
  [PATHS.v3Compiler, V3_COMPILER_DIGEST],
  [PATHS.programDag, PROGRAM_DAG_DIGEST],
  [PATHS.scientificContracts, SCIENTIFIC_CONTRACTS_DIGEST],
  [PATHS.workflow, WORKFLOW_DIGEST],
  [PATHS.package, PACKAGE_JSON_DIGEST],
]);

export class C8EV3PackageCompilerError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.code = code; }
}
function fail(code, detail) { throw new C8EV3PackageCompilerError(code, detail); }
function assert(condition, code, detail) { if (!condition) fail(code, detail); }
export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function isHex64(value) { return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value); }
function sameArray(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

function readJsonBytes(repoRoot, relativePath, canonical = false) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  const value = JSON.parse(bytes.toString('utf8'));
  if (canonical) assert(bytes.equals(canonicalBytes(value)), 'E_NON_CANONICAL_INPUT', relativePath);
  return { bytes, digest: sha256(bytes), value };
}
function git(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 30000 });
  assert(result.status === 0, 'E_GIT', `${args.join(' ')}:${String(result.stderr || '').trim()}`);
  return String(result.stdout || '').trim();
}
function gitBytes(repoRoot, revision, relativePath) {
  const result = spawnSync('git', ['show', `${revision}:${relativePath}`], { cwd: repoRoot, encoding: null, maxBuffer: 16 * 1024 * 1024, timeout: 30000 });
  assert(result.status === 0, 'E_GIT_SOURCE_READ', relativePath);
  return Buffer.from(result.stdout);
}
function statusPaths(repoRoot) {
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30000,
  });
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
  const fixed = [
    [PATHS.program, PROGRAM_TEMPLATE_DIGEST], [PATHS.registry, STAGE_REGISTRY_DIGEST],
    [PATHS.trust, TRUST_MODEL_DIGEST], [PATHS.standing, OWNER_BINDING_DIGEST],
    [PATHS.stageInstance, STAGE_INSTANCE_DIGEST], [PATHS.stageAdmission, STAGE_ADMISSION_DIGEST],
  ];
  for (const [relativePath, digest] of fixed) assert(readJsonBytes(repoRoot, relativePath, true).digest === digest, 'E_FIXED_BINDING', relativePath);
  for (const [relativePath, digest] of EXACT_SOURCE_INPUTS) {
    const sourceBytes = gitBytes(repoRoot, SOURCE_HEAD_SHA, relativePath);
    const currentBytes = fs.readFileSync(path.join(repoRoot, relativePath));
    assert(sha256(sourceBytes) === digest && currentBytes.equals(sourceBytes), 'E_EXACT_SOURCE_INPUT_DRIFT', relativePath);
  }
  const instance = readJsonBytes(repoRoot, PATHS.stageInstance, true).value;
  const admission = readJsonBytes(repoRoot, PATHS.stageAdmission, true).value;
  assert(instance.stageId === STAGE_ID && admission.stageId === STAGE_ID && admission.status === 'ADMITTED', 'E_STAGE_BINDING', STAGE_ID);
  assert(admission.stageInstanceDigest === STAGE_INSTANCE_DIGEST && admission.writeSetDigest === WRITE_SET_DIGEST
    && admission.acceptanceSignalsDigest === ACCEPTANCE_SIGNALS_DIGEST, 'E_ADMISSION_BINDING', STAGE_ID);
  const leaseBytes = fs.readFileSync(LOCAL_LEASE);
  const fenceBytes = fs.readFileSync(LOCAL_FENCE);
  const lease = JSON.parse(leaseBytes);
  const fence = JSON.parse(fenceBytes);
  assert(sha256(leaseBytes) === LEASE_DIGEST && sha256(fenceBytes) === FENCE_DIGEST, 'E_LEASE_FENCE_DIGEST', STAGE_ID);
  assert(lease.status === 'ACTIVE' && fence.status === 'ACTIVE' && lease.fencingCounter === FENCE_COUNTER && fence.fencingCounter === FENCE_COUNTER
    && lease.stageAdmissionDigest === STAGE_ADMISSION_DIGEST && fence.stageAdmissionDigest === STAGE_ADMISSION_DIGEST, 'E_LEASE_FENCE_STATE', STAGE_ID);
  const c8dContract = readJsonBytes(repoRoot, PATHS.c8dContract, true).value;
  const c8dEvidence = readJsonBytes(repoRoot, PATHS.c8dEvidence, true).value;
  assert(c8dContract.stageId === 'C8D' && c8dContract.packageSecurityContract?.profileVerdictCandidate === 'NOT_READY', 'E_C8D_CONTRACT_BINDING', STAGE_ID);
  assert(c8dEvidence.stageId === 'C8D' && c8dEvidence.acceptanceSignals?.PK1_SECURITY_PACKAGE_PASS === 'PASS'
    && c8dEvidence.observations?.pk1?.profileVerdictCandidate === 'NOT_READY'
    && c8dEvidence.observations?.pk1?.productionReleaseReady === false, 'E_C8D_EVIDENCE_BINDING', STAGE_ID);
  return { c8dContract, c8dEvidence };
}

function buildObservedPk1Evidence() {
  return {
    artifact: { digest: C8D_TERMINAL_ARTIFACT_DIGEST, name: 'r24-terminal-attestation-C8D' },
    candidate: {
      implementationCandidateSha: '7fca2f11fb313d9055b1d414732daad1ba6a8f4a',
      profileId: 'PACKAGED_RELEASE_SECURITY',
      script: 'test:r24-pk1',
      stageId: 'PK1_RELEASE_SECURITY_PHYSICAL',
    },
    counts: { denominator: 1, exitCode: 0, failed: 0, passed: 1, skipped: 0 },
    evidenceClass: 'INDEPENDENT_EXACT_HEAD',
    fixture: { digest: C8D_EVIDENCE_DIGEST, name: 'C8D_PK1_SECURITY_PACKAGE_EVIDENCE_V1' },
    headSha: SOURCE_HEAD_SHA,
    job: { conclusion: 'success', id: String(C8D_TERMINAL_JOB_ID), name: 'terminal-attestation' },
    postmerge: { conclusion: 'success', digest: PREDECESSOR_TERMINAL_DIGEST, headSha: SOURCE_HEAD_SHA, required: true },
    profileVerdictCandidate: 'NOT_READY',
    run: { attempt: 1, conclusion: 'success', headSha: SOURCE_HEAD_SHA, id: String(C8D_TERMINAL_RUN_ID) },
    schema: { digest: C8D_CONTRACT_DIGEST, name: 'YALKEN_R24_C8D_PK1_SECURITY_PACKAGE_CONTRACT_V1' },
    source: 'OBSERVED_EVIDENCE_STAMP_V2',
    stageClosureKind: 'TYPED_RELEASE_SECURITY_NOT_READY_CLASSIFICATION',
    stageId: 'PK1_RELEASE_SECURITY_PHYSICAL',
    status: 'SUCCESS',
    step: { conclusion: 'success', name: 'Verify exact identities' },
    survivor: { conclusion: 'success', digest: PREDECESSOR_TERMINAL_DIGEST, headSha: SOURCE_HEAD_SHA, required: true },
    tool: { digest: C8D_SCRIPT_DIGEST, name: 'c8d-pk1-security-package' },
    treeSha: SOURCE_TREE_SHA,
  };
}

function compileExactSource(repoRoot) {
  const gateEvidence = [buildObservedPk1Evidence()];
  const result = compilePackageVerdict({
    expectedHeadSha: SOURCE_HEAD_SHA,
    expectedOriginMainSha: SOURCE_HEAD_SHA,
    gateEvidence,
    now: OBSERVED_AT_UTC,
    packageJson: JSON.parse(gitBytes(repoRoot, SOURCE_HEAD_SHA, PATHS.package)),
    program: JSON.parse(gitBytes(repoRoot, SOURCE_HEAD_SHA, PATHS.programDag)),
    repoState: { dirty: false, headSha: SOURCE_HEAD_SHA, originMainSha: SOURCE_HEAD_SHA, treeSha: SOURCE_TREE_SHA },
    scientificContracts: JSON.parse(gitBytes(repoRoot, SOURCE_HEAD_SHA, PATHS.scientificContracts)),
    workflowText: gitBytes(repoRoot, SOURCE_HEAD_SHA, PATHS.workflow).toString('utf8'),
  });
  assert(result.ok === true && result.verdict === 'PASS' && result.code === 'R24_V3_PACKAGE_PROFILE_VERDICT_COMPILED', 'E_V3_COMPILER', JSON.stringify(result));
  assert(result.profileVerdict?.currentVerdict === 'NOT_READY' && result.profileVerdict?.profileVerdictCandidate === 'NOT_READY'
    && result.programVerdict === 'NEEDS_MORE_EVIDENCE' && result.globalScalarPassForbidden === true, 'E_V3_FALSE_DONE', STAGE_ID);
  assert(result.releaseSecurityProfile?.productionReleaseReady === false && result.releaseSecurityProfile?.signingPassClaim === false
    && result.releaseSecurityProfile?.notarizationPassClaim === false && result.releaseSecurityProfile?.currentHeadPhysicalPackagePass === false,
  'E_V3_RELEASE_PROMOTION', STAGE_ID);
  const inputManifest = {
    c8dCertifiedDoneReceiptDigest: PREDECESSOR_CERTIFIED_DONE_RECEIPT_DIGEST,
    c8dContractDigest: C8D_CONTRACT_DIGEST,
    c8dEvidenceDigest: C8D_EVIDENCE_DIGEST,
    c8dLeaseReleaseDigest: PREDECESSOR_LEASE_RELEASE_DIGEST,
    c8dTerminalAttestationBytesDigest: PREDECESSOR_TERMINAL_DIGEST,
    gateEvidence,
    packageJsonDigest: PACKAGE_JSON_DIGEST,
    programDagDigest: PROGRAM_DAG_DIGEST,
    scientificContractsDigest: SCIENTIFIC_CONTRACTS_DIGEST,
    sourceHeadSha: SOURCE_HEAD_SHA,
    sourceTreeSha: SOURCE_TREE_SHA,
    v3CompilerDigest: V3_COMPILER_DIGEST,
    workflowDigest: WORKFLOW_DIGEST,
  };
  return {
    gateEvidence,
    inputDigest: sha256(canonicalBytes(inputManifest)),
    inputManifest,
    outputDigest: sha256(canonicalBytes(result)),
    result,
  };
}

export function buildContract(repoRoot = process.cwd()) {
  validateBindings(repoRoot);
  const compiled = compileExactSource(repoRoot);
  const inventoryDigest = sha256(canonicalBytes(buildInventory(repoRoot)));
  const contract = {
    acceptanceContract: {
      C8D_CERTIFIED_DEPENDENCY: true,
      FIXED_AUTHORITY_BINDING: true,
      PACKAGE_INPUT_OUTPUT_DIGESTS_BOUND: true,
      TYPED_NOT_READY_WITHOUT_FALSE_DONE: true,
      V3_PACKAGE_COMPILER_PASS: true,
    },
    claimCeiling: {
      currentHeadPhysicalPackagePass: false,
      developerIdSigningPass: false,
      notarizationPass: false,
      productionDistributionPass: false,
      productionReleaseReady: false,
      programDone: false,
      profileCompilerPassOnly: true,
    },
    compilerContract: {
      claimCeiling: 'PROFILE_VERDICT_ONLY',
      compiledProfileId: 'PACKAGED_RELEASE_SECURITY',
      compilerCode: 'R24_V3_PACKAGE_PROFILE_VERDICT_COMPILED',
      expectedProfileVerdict: 'NOT_READY',
      expectedProgramVerdict: 'NEEDS_MORE_EVIDENCE',
      inputDigest: compiled.inputDigest,
      outputDigest: compiled.outputDigest,
      sourceStageId: 'C8D',
    },
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    schemaVersion: 'YALKEN_R24_C8E_V3_PACKAGE_COMPILER_CONTRACT_V1',
    sourceBindings: {
      c8dCertifiedDoneReceiptDigest: PREDECESSOR_CERTIFIED_DONE_RECEIPT_DIGEST,
      c8dContractDigest: C8D_CONTRACT_DIGEST,
      c8dEvidenceDigest: C8D_EVIDENCE_DIGEST,
      c8dLeaseReleaseDigest: PREDECESSOR_LEASE_RELEASE_DIGEST,
      c8dTerminalDigest: PREDECESSOR_TERMINAL_DIGEST,
      currentTestInventoryDigest: inventoryDigest,
      ownerAuthorityBindingDigest: OWNER_BINDING_DIGEST,
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      sourceHeadSha: SOURCE_HEAD_SHA,
      sourceTreeSha: SOURCE_TREE_SHA,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
      v3CompilerDigest: V3_COMPILER_DIGEST,
    },
    stageId: STAGE_ID,
    status: 'ACTIVE_CONTRACT',
  };
  validateContract(contract);
  return contract;
}

export function validateContract(contract) {
  assert(contract?.schemaVersion === 'YALKEN_R24_C8E_V3_PACKAGE_COMPILER_CONTRACT_V1' && contract.stageId === STAGE_ID
    && contract.status === 'ACTIVE_CONTRACT', 'E_CONTRACT_SCHEMA', STAGE_ID);
  for (const signal of ['C8D_CERTIFIED_DEPENDENCY', 'FIXED_AUTHORITY_BINDING', 'PACKAGE_INPUT_OUTPUT_DIGESTS_BOUND', 'TYPED_NOT_READY_WITHOUT_FALSE_DONE', 'V3_PACKAGE_COMPILER_PASS']) {
    assert(contract.acceptanceContract?.[signal] === true, 'E_ACCEPTANCE_SIGNAL', signal);
  }
  assert(contract.compilerContract?.compiledProfileId === 'PACKAGED_RELEASE_SECURITY'
    && contract.compilerContract?.expectedProfileVerdict === 'NOT_READY'
    && contract.compilerContract?.expectedProgramVerdict === 'NEEDS_MORE_EVIDENCE'
    && contract.compilerContract?.claimCeiling === 'PROFILE_VERDICT_ONLY'
    && isHex64(contract.compilerContract?.inputDigest) && isHex64(contract.compilerContract?.outputDigest), 'E_COMPILER_CONTRACT', STAGE_ID);
  assert(Object.entries(contract.claimCeiling || {}).every(([key, value]) => key === 'profileCompilerPassOnly' ? value === true : value === false), 'E_CLAIM_CEILING', STAGE_ID);
  const bindings = contract.sourceBindings || {};
  assert(bindings.programTemplateDigest === PROGRAM_TEMPLATE_DIGEST && bindings.ownerAuthorityBindingDigest === OWNER_BINDING_DIGEST
    && bindings.sourceHeadSha === SOURCE_HEAD_SHA && bindings.sourceTreeSha === SOURCE_TREE_SHA
    && bindings.stageInstanceDigest === STAGE_INSTANCE_DIGEST && bindings.stageAdmissionDigest === STAGE_ADMISSION_DIGEST
    && bindings.c8dTerminalDigest === PREDECESSOR_TERMINAL_DIGEST && bindings.c8dCertifiedDoneReceiptDigest === PREDECESSOR_CERTIFIED_DONE_RECEIPT_DIGEST
    && bindings.c8dLeaseReleaseDigest === PREDECESSOR_LEASE_RELEASE_DIGEST && bindings.v3CompilerDigest === V3_COMPILER_DIGEST
    && isHex64(bindings.currentTestInventoryDigest), 'E_SOURCE_BINDING', STAGE_ID);
  assertPathlessPublicEvidence(contract);
  return true;
}

export function buildEvidence(repoRoot, contract) {
  validateBindings(repoRoot);
  const compiled = compileExactSource(repoRoot);
  const evidence = {
    acceptanceSignals: {
      C8D_CERTIFIED_DEPENDENCY: 'PASS',
      FIXED_AUTHORITY_BINDING: 'PASS',
      PACKAGE_INPUT_OUTPUT_DIGESTS_BOUND: 'PASS',
      TYPED_NOT_READY_WITHOUT_FALSE_DONE: 'PASS',
      V3_PACKAGE_COMPILER_PASS: 'PASS',
    },
    contractDigest: sha256(canonicalBytes(contract)),
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    externalTerminalAttestation: { required: true, status: 'AWAITING_POST_MERGE_EXTERNAL_C8E_ATTESTATION' },
    observations: {
      compiler: {
        code: compiled.result.code,
        currentVerdict: compiled.result.profileVerdict.currentVerdict,
        globalScalarPassForbidden: compiled.result.globalScalarPassForbidden,
        inputDigest: compiled.inputDigest,
        outputDigest: compiled.outputDigest,
        profileId: compiled.result.profileVerdict.profileId,
        programVerdict: compiled.result.programVerdict,
        requiredStageCount: compiled.result.profileVerdict.requiredStageCount,
        result: compiled.result.verdict,
      },
      inputCapabilities: [
        { capabilityId: 'CAP_R24_C8E_C8D_TERMINAL', role: 'CERTIFIED_C8D_TERMINAL_ATTESTATION', sha256: PREDECESSOR_TERMINAL_DIGEST },
        { capabilityId: 'CAP_R24_C8E_C8D_CONTRACT', role: 'C8D_PK1_CONTRACT_INPUT', sha256: C8D_CONTRACT_DIGEST },
        { capabilityId: 'CAP_R24_C8E_C8D_EVIDENCE', role: 'C8D_PK1_OBSERVED_EVIDENCE_INPUT', sha256: C8D_EVIDENCE_DIGEST },
        { capabilityId: 'CAP_R24_C8E_V3_COMPILER', role: 'V3_PACKAGE_COMPILER_INPUT', sha256: V3_COMPILER_DIGEST },
      ],
      safety: {
        credentialsRead: false,
        dependencyMutation: false,
        lockfileMutation: false,
        notarization: false,
        packageOrWorkflowMutation: false,
        productRuntimeMutation: false,
        profileEvidenceTransfer: false,
        publicDistribution: false,
        runtimeNetworkActivated: false,
        signing: false,
        userDataTouched: false,
      },
    },
    schemaVersion: 'YALKEN_R24_C8E_V3_PACKAGE_COMPILER_EVIDENCE_V1',
    sourceBindings: contract.sourceBindings,
    stageId: STAGE_ID,
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
  };
  validateEvidence(evidence, contract);
  return evidence;
}

export function validateEvidence(evidence, contract) {
  validateContract(contract);
  assert(evidence?.schemaVersion === 'YALKEN_R24_C8E_V3_PACKAGE_COMPILER_EVIDENCE_V1' && evidence.stageId === STAGE_ID, 'E_EVIDENCE_SCHEMA', STAGE_ID);
  assert(evidence.contractDigest === sha256(canonicalBytes(contract)), 'E_CONTRACT_DIGEST', STAGE_ID);
  for (const signal of ['C8D_CERTIFIED_DEPENDENCY', 'FIXED_AUTHORITY_BINDING', 'PACKAGE_INPUT_OUTPUT_DIGESTS_BOUND', 'TYPED_NOT_READY_WITHOUT_FALSE_DONE', 'V3_PACKAGE_COMPILER_PASS']) {
    assert(evidence.acceptanceSignals?.[signal] === 'PASS', 'E_EVIDENCE_SIGNAL', signal);
  }
  const compiler = evidence.observations?.compiler || {};
  assert(compiler.result === 'PASS' && compiler.code === 'R24_V3_PACKAGE_PROFILE_VERDICT_COMPILED'
    && compiler.profileId === 'PACKAGED_RELEASE_SECURITY' && compiler.currentVerdict === 'NOT_READY'
    && compiler.programVerdict === 'NEEDS_MORE_EVIDENCE' && compiler.globalScalarPassForbidden === true
    && compiler.requiredStageCount === 1, 'E_COMPILER_EVIDENCE', STAGE_ID);
  assert(compiler.inputDigest === contract.compilerContract.inputDigest && compiler.outputDigest === contract.compilerContract.outputDigest,
    'E_INPUT_OUTPUT_DIGEST_BINDING', STAGE_ID);
  const safety = evidence.observations?.safety || {};
  assert(Object.values(safety).every((value) => value === false), 'E_EXTERNAL_EFFECT_BOUNDARY', STAGE_ID);
  assert(sameArray(evidence.sourceBindings, contract.sourceBindings), 'E_EVIDENCE_SOURCE_BINDING', STAGE_ID);
  assert(evidence.externalTerminalAttestation?.required === true
    && evidence.externalTerminalAttestation?.status === 'AWAITING_POST_MERGE_EXTERNAL_C8E_ATTESTATION', 'E_TERMINAL_STATE', STAGE_ID);
  assertPathlessPublicEvidence(evidence);
  return true;
}

function approvalEntry(filePath, bytes) {
  return {
    approvedAtUtc: OBSERVED_AT_UTC,
    approvedBy: `owner-standing-authority:${OWNER_BINDING_DIGEST}`,
    filePath,
    rationale: `C8E bounded V3 package compiler envelope under StageInstance ${STAGE_INSTANCE_DIGEST}; exact C8D observed input and V3 output digests are bound while NOT_READY, NEEDS_MORE_EVIDENCE, no profile transfer, no signing, notarization, distribution, release, physical-pass, dependency, workflow, product-runtime, or Program DONE promotion remain fail-closed.`,
    sha256: sha256(bytes),
  };
}
function buildApprovals(repoRoot, inventoryBytes, contractBytes, evidenceBytes) {
  const entries = [
    [PATHS.inventory, inventoryBytes],
    [PATHS.contract, contractBytes],
    [PATHS.evidence, evidenceBytes],
    [PATHS.stageAdmission, fs.readFileSync(path.join(repoRoot, PATHS.stageAdmission))],
    [PATHS.stageInstance, fs.readFileSync(path.join(repoRoot, PATHS.stageInstance))],
    [PATHS.script, fs.readFileSync(path.join(repoRoot, PATHS.script))],
    [PATHS.test, fs.readFileSync(path.join(repoRoot, PATHS.test))],
  ].map(([filePath, bytes]) => approvalEntry(filePath, bytes)).sort((left, right) => LEXICAL(left.filePath, right.filePath));
  return { approvals: entries, evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID], version: 'v1.0' };
}
function buildActiveApprovals(repoRoot, inventoryBytes, contractBytes, evidenceBytes, approvalsBytes) {
  const active = readJsonBytes(repoRoot, PATHS.activeApprovals, true).value;
  const c8ePaths = new Set([PATHS.inventory, PATHS.approvals, PATHS.contract, PATHS.evidence, PATHS.stageAdmission, PATHS.stageInstance, PATHS.script, PATHS.test]);
  const retained = (active.approvals || []).filter((entry) => !c8ePaths.has(entry.filePath));
  const additions = [
    [PATHS.inventory, inventoryBytes], [PATHS.approvals, approvalsBytes], [PATHS.contract, contractBytes], [PATHS.evidence, evidenceBytes],
    [PATHS.stageAdmission, fs.readFileSync(path.join(repoRoot, PATHS.stageAdmission))],
    [PATHS.stageInstance, fs.readFileSync(path.join(repoRoot, PATHS.stageInstance))],
    [PATHS.script, fs.readFileSync(path.join(repoRoot, PATHS.script))],
    [PATHS.test, fs.readFileSync(path.join(repoRoot, PATHS.test))],
  ].map(([filePath, bytes]) => approvalEntry(filePath, bytes));
  return { ...active, approvals: [...retained, ...additions] };
}

function buildArtifacts(repoRoot) {
  validateBindings(repoRoot);
  assertHeadContour(repoRoot);
  const inventoryBytes = canonicalBytes(buildInventory(repoRoot));
  const contract = buildContract(repoRoot);
  const contractBytes = canonicalBytes(contract);
  const evidenceBytes = canonicalBytes(buildEvidence(repoRoot, contract));
  const approvalsBytes = canonicalBytes(buildApprovals(repoRoot, inventoryBytes, contractBytes, evidenceBytes));
  const activeApprovalsBytes = canonicalBytes(buildActiveApprovals(repoRoot, inventoryBytes, contractBytes, evidenceBytes, approvalsBytes));
  return { activeApprovalsBytes, approvalsBytes, contractBytes, evidenceBytes, inventoryBytes };
}
function writeArtifacts(repoRoot, artifacts) {
  for (const [relativePath, bytes] of [
    [PATHS.inventory, artifacts.inventoryBytes], [PATHS.contract, artifacts.contractBytes], [PATHS.evidence, artifacts.evidenceBytes],
    [PATHS.approvals, artifacts.approvalsBytes], [PATHS.activeApprovals, artifacts.activeApprovalsBytes],
  ]) fs.writeFileSync(path.join(repoRoot, relativePath), bytes);
}
function checkArtifacts(repoRoot, artifacts) {
  for (const [relativePath, bytes] of [
    [PATHS.inventory, artifacts.inventoryBytes], [PATHS.contract, artifacts.contractBytes], [PATHS.evidence, artifacts.evidenceBytes],
    [PATHS.approvals, artifacts.approvalsBytes], [PATHS.activeApprovals, artifacts.activeApprovalsBytes],
  ]) assert(fs.readFileSync(path.join(repoRoot, relativePath)).equals(bytes), 'E_GENERATED_DRIFT', relativePath);
  return true;
}

export function runProbe(repoRoot = process.cwd()) {
  const contract = buildContract(repoRoot);
  const evidence = buildEvidence(repoRoot, contract);
  const mutants = [
    (candidate) => { candidate.observations.compiler.currentVerdict = 'PASS'; },
    (candidate) => { candidate.observations.compiler.programVerdict = 'PASS'; },
    (candidate) => { candidate.observations.compiler.globalScalarPassForbidden = false; },
    (candidate) => { candidate.observations.compiler.inputDigest = '0'.repeat(64); },
    (candidate) => { candidate.observations.compiler.outputDigest = '0'.repeat(64); },
    (candidate) => { candidate.observations.safety.signing = true; },
    (candidate) => { candidate.observations.safety.profileEvidenceTransfer = true; },
    (candidate) => { candidate.externalTerminalAttestation.status = 'VERIFIED'; },
  ];
  const probeResults = mutants.map((mutate, index) => {
    const candidate = structuredClone(evidence);
    mutate(candidate);
    try { validateEvidence(candidate, contract); return { id: `C8E_MUTANT_${index + 1}`, killed: false }; }
    catch { return { id: `C8E_MUTANT_${index + 1}`, killed: true }; }
  });
  assert(probeResults.every((entry) => entry.killed), 'E_MUTANT_SURVIVED', JSON.stringify(probeResults));
  return { mutantsKilled: probeResults.length, mutantsTotal: probeResults.length, probeResults };
}

function main() {
  const repoRoot = process.cwd();
  const mode = process.argv[2] || '--check';
  if (mode === '--probe') {
    process.stdout.write(`${JSON.stringify({ decision: 'C8E_MUTATION_PROBE_PASS', ...runProbe(repoRoot) })}\n`);
    return;
  }
  const artifacts = buildArtifacts(repoRoot);
  if (mode === '--write') writeArtifacts(repoRoot, artifacts);
  else if (mode !== '--check') fail('E_MODE', mode);
  checkArtifacts(repoRoot, mode === '--write' ? buildArtifacts(repoRoot) : artifacts);
  process.stdout.write(`${JSON.stringify({
    contractDigest: sha256(artifacts.contractBytes),
    decision: mode === '--write' ? 'C8E_ARTIFACTS_WRITTEN' : 'C8E_ARTIFACTS_CURRENT',
    evidenceDigest: sha256(artifacts.evidenceBytes),
    stageId: STAGE_ID,
  })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main();
