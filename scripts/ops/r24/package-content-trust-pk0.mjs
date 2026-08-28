#!/usr/bin/env node
// R2.4 PK0 - package content trust. This OPS-only verifier binds the Electron
// package content allowlist to a closed runtime file set without signing,
// notarization, release publication, unadmitted dependency mutation, or
// product runtime authority.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const PK0_STAGE_ID = 'PK0_PACKAGE_CONTENT_TRUST';
export const PK0_PROFILE_ID = 'PACKAGED_RELEASE_SECURITY';
export const PK0_SCHEMA_VERSION = 'yalken.r24.pk0.package-content-trust.v1';

export const PK0_REQUIRED_BUILD_FILES = Object.freeze([
  'package.json',
  'LICENSE',
  'NOTICE',
  'README.md',
  'SECURITY.md',
  'src/**/*',
  '!src/**/*.ts',
  '!src/contracts/**/*',
]);

export const PK0_REQUIRED_RUNTIME_FILES = Object.freeze([
  'package.json',
  'src/main.js',
  'src/preload.bundle.cjs',
  'src/renderer/index.html',
  'src/renderer/editor.bundle.js',
  'src/renderer/flags.js',
]);

export const PK0_FORBIDDEN_STAGED_PREFIXES = Object.freeze([
  '.github/',
  'docs/',
  'scripts/',
  'test/',
  'configs/',
]);

export const PK0_FORBIDDEN_STAGED_FILES = Object.freeze([
  'package-lock.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
]);

const RELEASE_READY_CLAIM = false;
const SIGNING_NOTARIZATION_CLAIM = false;
const DEPENDENCY_MUTATION_ALLOWED = false;
const PRODUCT_RUNTIME_MUTATION = false;
const RUNTIME_NETWORK_ACTIVATED = false;

export const C6D_DEPENDENCY_MUTATION_ADMISSION = Object.freeze({
  allowedChangedFiles: Object.freeze(['package-lock.json', 'package.json']),
  currentLockSha256: '54dc46b025c7f77d522bb861724dc7d8bdd752a29e3e6a55eb72f30b50047a6f',
  originalElectronRange: '^40.9.2',
  originalLockSha256: '441b7b14e6a395cc04bee04f51b17ce400a27c1530ec2483d5168ba15070e689',
  ownerAuthorityBindingDigest: 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6',
  releaseScope: 'DEPENDENCY_AUDIT_GATE_ONLY',
  schemaVersion: 'YALKEN_R24_C6D_PK0_DEPENDENCY_MUTATION_ADMISSION_V1',
  stageAdmissionDigest: '9f35217cc69b30f7032010d7c6965f54872e69ea9b8bec363a4f949a63cd7460',
  stageId: 'C6D',
  stageInstanceDigest: 'd43adf0bdf56e008f2ebfb2c87f2479eb1b86ae20de9859cfebcb343d6576723',
  status: 'ADMITTED_SECURITY_UPGRADE',
  targetElectronVersion: '41.10.3',
});

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

export function hashCanonicalValue(value) {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

export function normalizeRepoPath(value) {
  const normalized = String(value || '').replaceAll('\\', '/').replace(/^\.\/+/u, '').trim();
  if (
    normalized === ''
    || normalized.startsWith('/')
    || normalized.includes('\0')
    || normalized.split('/').some((part) => part === '..')
  ) {
    return '';
  }
  return normalized;
}

function uniqSorted(values) {
  return [...new Set(values.map(normalizeRepoPath).filter(Boolean))].sort();
}

function isForbiddenStagedFile(filePath) {
  return PK0_FORBIDDEN_STAGED_FILES.includes(filePath)
    || PK0_FORBIDDEN_STAGED_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

function patternMatches(pattern, filePath) {
  if (pattern === filePath) return true;
  if (pattern === '**/*') return true;
  if (pattern.endsWith('/**/*')) {
    const prefix = pattern.slice(0, -4);
    return filePath.startsWith(prefix);
  }
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return filePath.startsWith(prefix);
  }
  if (pattern.startsWith('**/*.')) {
    return filePath.endsWith(pattern.slice(4));
  }
  const deepSuffix = pattern.match(/^(.+)\/\*\*\/\*\.(.+)$/u);
  if (deepSuffix) {
    return filePath.startsWith(`${deepSuffix[1]}/`) && filePath.endsWith(`.${deepSuffix[2]}`);
  }
  return false;
}

export function normalizePackageBuildFiles(packageJson) {
  const files = packageJson?.build?.files;
  if (!Array.isArray(files)) return [];
  return files.map((entry) => String(entry || '').trim()).filter(Boolean);
}

export function resolveStagedPackageFiles({ trackedFiles, buildFiles }) {
  const positive = buildFiles.filter((pattern) => !pattern.startsWith('!'));
  const negative = buildFiles.filter((pattern) => pattern.startsWith('!')).map((pattern) => pattern.slice(1));
  const files = uniqSorted(trackedFiles);
  return files.filter((filePath) => (
    positive.some((pattern) => patternMatches(pattern, filePath))
    && !negative.some((pattern) => patternMatches(pattern, filePath))
  ));
}

function findImplicitlyBroadPatterns(buildFiles) {
  return buildFiles.filter((pattern) => ['**/*', '*', '**'].includes(pattern));
}

function validateProgramBinding(programDag, scientificContracts) {
  const stages = Array.isArray(programDag?.stages) ? programDag.stages : [];
  const stage = stages.find((row) => row?.stageId === PK0_STAGE_ID);
  const consistencyModels = Array.isArray(scientificContracts?.consistencyModels)
    ? scientificContracts.consistencyModels
    : [];
  const consistency = consistencyModels.find((row) => row?.consistencyModelId === 'CM_PACKAGE_RESOLVED_STAGED_ADMITTED_SET_R1');
  const errors = [];
  if (!stage) errors.push('PK0_STAGE_MISSING');
  if (stage && stage.profile !== PK0_PROFILE_ID) errors.push('PK0_PROFILE_MISMATCH');
  if (stage && stage.mutationAuthority !== 'PACKAGE_MANIFEST_AND_BUILD_EVIDENCE') errors.push('PK0_AUTHORITY_MISMATCH');
  if (stage && stage.claimCeiling !== 'PACKAGE_CONTENT_PROFILE_ONLY') errors.push('PK0_CLAIM_CEILING_MISMATCH');
  if (!consistency) errors.push('PK0_CONSISTENCY_MODEL_MISSING');
  if (consistency && !String(consistency.law || '').includes('Runtime-resolved files must be a subset of staged files')) {
    errors.push('PK0_CONSISTENCY_LAW_MISMATCH');
  }
  return { ok: errors.length === 0, stage, consistency, errors };
}

export function validateDependencyMutationAdmission(candidate) {
  return candidate
    && typeof candidate === 'object'
    && !Array.isArray(candidate)
    && hashCanonicalValue(candidate) === hashCanonicalValue(C6D_DEPENDENCY_MUTATION_ADMISSION);
}

function exactElectronOnlyUpgrade(packageJson, baselinePackageJson) {
  const currentDev = { ...(packageJson?.devDependencies || {}) };
  const baselineDev = { ...(baselinePackageJson?.devDependencies || {}) };
  const currentElectron = currentDev.electron;
  const baselineElectron = baselineDev.electron;
  delete currentDev.electron;
  delete baselineDev.electron;
  return baselineElectron === C6D_DEPENDENCY_MUTATION_ADMISSION.originalElectronRange
    && currentElectron === C6D_DEPENDENCY_MUTATION_ADMISSION.targetElectronVersion
    && hashCanonicalValue(currentDev) === hashCanonicalValue(baselineDev);
}

function validatePackageDependencies({
  packageJson,
  baselinePackageJson = null,
  changedFiles = [],
  dependencyMutationAdmission = null,
}) {
  const errors = [];
  const changed = new Set(uniqSorted(changedFiles));
  const admissionValid = validateDependencyMutationAdmission(dependencyMutationAdmission);
  if (changed.has('pnpm-lock.yaml') || changed.has('pnpm-workspace.yaml')) {
    errors.push('PK0_LOCKFILE_OR_WORKSPACE_MUTATION_FORBIDDEN');
  }
  if (changed.has('package-lock.json') && !admissionValid) errors.push('PK0_LOCKFILE_OR_WORKSPACE_MUTATION_FORBIDDEN');
  if (admissionValid) {
    const outsideAdmission = [...changed].filter((filePath) => (
      (filePath === 'package.json'
        || filePath === 'package-lock.json'
        || filePath === 'pnpm-lock.yaml'
        || filePath === 'pnpm-workspace.yaml')
      && !C6D_DEPENDENCY_MUTATION_ADMISSION.allowedChangedFiles.includes(filePath)
    ));
    if (outsideAdmission.length > 0) errors.push('PK0_DEPENDENCY_ADMISSION_WRITE_SET_EXPANSION');
  }
  if (baselinePackageJson) {
    for (const key of ['dependencies', 'devDependencies', 'overrides', 'engines']) {
      if (hashCanonicalValue(packageJson?.[key] || {}) !== hashCanonicalValue(baselinePackageJson?.[key] || {})) {
        const exactAdmittedElectronUpgrade = key === 'devDependencies'
          && admissionValid
          && exactElectronOnlyUpgrade(packageJson, baselinePackageJson);
        if (!exactAdmittedElectronUpgrade) errors.push(`PK0_${key.toUpperCase()}_MUTATION_FORBIDDEN`);
      }
    }
  }
  return { admissionValid, ok: errors.length === 0, errors };
}

export function evaluatePackageContentTrust(input = {}) {
  const packageJson = input.packageJson || {};
  const trackedFiles = uniqSorted(input.trackedFiles || []);
  const runtimeResolvedFiles = uniqSorted(input.runtimeResolvedFiles || PK0_REQUIRED_RUNTIME_FILES);
  const changedFiles = uniqSorted(input.changedFiles || []);
  const buildFiles = normalizePackageBuildFiles(packageJson);
  const stagedFiles = resolveStagedPackageFiles({ trackedFiles, buildFiles });
  const staged = new Set(stagedFiles);
  const tracked = new Set(trackedFiles);
  const errors = [];

  if (hashCanonicalValue(buildFiles) !== hashCanonicalValue(PK0_REQUIRED_BUILD_FILES)) {
    errors.push('PK0_BUILD_FILES_MANIFEST_MISMATCH');
  }
  for (const pattern of findImplicitlyBroadPatterns(buildFiles)) {
    errors.push(`PK0_BROAD_PACKAGE_GLOB_FORBIDDEN:${pattern}`);
  }

  const missingRuntime = runtimeResolvedFiles.filter((filePath) => !staged.has(filePath));
  const missingTrackedRuntime = runtimeResolvedFiles.filter((filePath) => !tracked.has(filePath));
  if (missingRuntime.length > 0) errors.push('PK0_RUNTIME_RESOLVED_NOT_STAGED');
  if (missingTrackedRuntime.length > 0) errors.push('PK0_RUNTIME_RESOLVED_NOT_TRACKED');

  const forbiddenStaged = stagedFiles.filter(isForbiddenStagedFile);
  if (forbiddenStaged.length > 0) errors.push('PK0_FORBIDDEN_FILE_STAGED');

  const unadmittedStaged = stagedFiles.filter((filePath) => (
    !buildFiles.filter((pattern) => !pattern.startsWith('!')).some((pattern) => patternMatches(pattern, filePath))
  ));
  if (unadmittedStaged.length > 0) errors.push('PK0_STAGED_FILE_NOT_EXPLICITLY_ADMITTED');

  const programBinding = validateProgramBinding(input.programDag, input.scientificContracts);
  if (!programBinding.ok) errors.push(...programBinding.errors);

  const dependencyBinding = validatePackageDependencies({
    packageJson,
    baselinePackageJson: input.baselinePackageJson || null,
    changedFiles,
    dependencyMutationAdmission: input.dependencyMutationAdmission || null,
  });
  if (!dependencyBinding.ok) errors.push(...dependencyBinding.errors);

  const externalClaims = input.externalClaims && typeof input.externalClaims === 'object' && !Array.isArray(input.externalClaims)
    ? input.externalClaims
    : {};
  if (externalClaims.releaseReady === true || RELEASE_READY_CLAIM === true) errors.push('PK0_RELEASE_READY_CLAIM_FORBIDDEN');
  if (externalClaims.signingPass === true || externalClaims.notarizationPass === true || SIGNING_NOTARIZATION_CLAIM === true) {
    errors.push('PK0_SIGNING_NOTARIZATION_CLAIM_FORBIDDEN');
  }
  if (externalClaims.dependencyMutation === true || DEPENDENCY_MUTATION_ALLOWED === true) errors.push('PK0_DEPENDENCY_MUTATION_FORBIDDEN');
  if (externalClaims.productRuntimeMutation === true || PRODUCT_RUNTIME_MUTATION === true) errors.push('PK0_PRODUCT_RUNTIME_MUTATION_FORBIDDEN');
  if (externalClaims.runtimeNetworkActivated === true || RUNTIME_NETWORK_ACTIVATED === true) errors.push('PK0_RUNTIME_NETWORK_FORBIDDEN');

  const subsetLaw = {
    runtimeResolvedSubsetOfStaged: missingRuntime.length === 0,
    stagedSubsetOfAdmitted: unadmittedStaged.length === 0,
    stagedForbiddenFileCount: forbiddenStaged.length,
  };

  const value = {
    schemaVersion: PK0_SCHEMA_VERSION,
    stageId: PK0_STAGE_ID,
    profileId: PK0_PROFILE_ID,
    state: errors.length === 0 ? 'ready' : 'blocked',
    pass: errors.length === 0,
    errors: [...new Set(errors)].sort(),
    programBinding: {
      stageId: PK0_STAGE_ID,
      profileId: PK0_PROFILE_ID,
      claimCeiling: 'PACKAGE_CONTENT_PROFILE_ONLY',
      programVerdictContribution: false,
      releaseReadyClaim: false,
      signingNotarizationClaim: false,
    },
    authority: {
      packageManifestMutation: true,
      buildEvidenceOnly: true,
      productRuntimeMutation: false,
      dependencyMutation: false,
      admittedDependencyAuditException: dependencyBinding.admissionValid,
      lockfileMutation: false,
      runtimeNetworkActivated: false,
      releasePublication: false,
      releaseReadyClaim: false,
      signingNotarizationClaim: false,
      wordOrGoogleClaim: false,
      programScalarPass: false,
    },
    packageManifest: {
      files: buildFiles,
      filesHash: hashCanonicalValue(buildFiles),
      requiredFilesHash: hashCanonicalValue(PK0_REQUIRED_BUILD_FILES),
    },
    sets: {
      trackedCount: trackedFiles.length,
      stagedCount: stagedFiles.length,
      runtimeResolvedCount: runtimeResolvedFiles.length,
      runtimeResolvedFiles,
      missingRuntime,
      missingTrackedRuntime,
      forbiddenStaged,
      unadmittedStaged,
      stagedFilesHash: hashCanonicalValue(stagedFiles),
    },
    subsetLaw,
  };

  return errors.length === 0 ? { ok: true, value } : { ok: false, error: { code: 'E_R24_PK0_PACKAGE_CONTENT_TRUST', value } };
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function gitLsFiles({ cwd = process.cwd() } = {}) {
  const result = spawnSync('git', ['ls-files'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10000,
  });
  if (result.status !== 0) {
    throw new Error(`git ls-files failed: ${String(result.stderr || '').trim()}`);
  }
  return String(result.stdout || '').split(/\r?\n/u).filter(Boolean);
}

export function gitChangedFiles({ cwd = process.cwd() } = {}) {
  const commands = [
    ['diff', '--name-only', 'origin/main...HEAD', '--'],
    ['diff', '--name-only', 'HEAD', '--'],
  ];
  const changed = [];
  for (const args of commands) {
    const result = spawnSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10000,
    });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${String(result.stderr || '').trim()}`);
    }
    changed.push(...String(result.stdout || '').split(/\r?\n/u).filter(Boolean));
  }
  return uniqSorted(changed);
}

function gitShowJson({ cwd, revisionPath }) {
  const result = spawnSync('git', ['show', revisionPath], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10000,
  });
  if (result.status !== 0) throw new Error(`git show failed: ${revisionPath}`);
  return JSON.parse(String(result.stdout));
}

function readC6DDependencyAdmission(root) {
  const files = {
    stage: ['docs/OPS/R24/CORRECTIVE/C6D_STAGE_INSTANCE_AMENDMENT_V1.json', C6D_DEPENDENCY_MUTATION_ADMISSION.stageInstanceDigest],
    admission: ['docs/OPS/R24/CORRECTIVE/C6D_STAGE_ADMISSION_ATTESTATION_AMENDMENT_V1.json', C6D_DEPENDENCY_MUTATION_ADMISSION.stageAdmissionDigest],
    disposition: ['docs/OPS/R24/CORRECTIVE/C6D_AUDIT_DISPOSITION_V1.json', null],
  };
  const values = {};
  for (const [role, [relativePath, expectedDigest]] of Object.entries(files)) {
    const bytes = fs.readFileSync(path.join(root, relativePath));
    const value = JSON.parse(bytes.toString('utf8'));
    if (bytes.toString('utf8') !== `${stableJson(value)}\n`) return null;
    if (expectedDigest && crypto.createHash('sha256').update(bytes).digest('hex') !== expectedDigest) return null;
    values[role] = value;
  }
  if (values.stage.stageId !== 'C6D' || values.admission.status !== 'ADMITTED') return null;
  if (values.admission.stageInstanceDigest !== C6D_DEPENDENCY_MUTATION_ADMISSION.stageInstanceDigest) return null;
  if (values.disposition.decisions?.dependencyAudit !== 'PASS') return null;
  if (values.disposition.currentAudit?.high !== 0 || values.disposition.currentAudit?.critical !== 0) return null;
  if (values.disposition.sourceBindings?.lockfileSha256 !== C6D_DEPENDENCY_MUTATION_ADMISSION.currentLockSha256) return null;
  return C6D_DEPENDENCY_MUTATION_ADMISSION;
}

export function evaluateRepositoryPackageContentTrust({ repoRoot = process.cwd(), baselinePackageJson = null } = {}) {
  const root = path.resolve(repoRoot);
  return evaluatePackageContentTrust({
    packageJson: readJson(path.join(root, 'package.json')),
    baselinePackageJson: baselinePackageJson || gitShowJson({ cwd: root, revisionPath: 'origin/main:package.json' }),
    trackedFiles: gitLsFiles({ cwd: root }),
    changedFiles: gitChangedFiles({ cwd: root }),
    dependencyMutationAdmission: readC6DDependencyAdmission(root),
    programDag: readJson(path.join(root, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'PROGRAM_DAG.json')),
    scientificContracts: readJson(path.join(root, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'SCIENTIFIC_CONTRACTS.json')),
  });
}

function main() {
  const result = evaluateRepositoryPackageContentTrust();
  const receipt = result.ok ? result.value : result.error.value;
  console.log(`R24_PK0_PACKAGE_CONTENT_TRUST_RECEIPT=${JSON.stringify({
    pass: receipt.pass,
    stageId: receipt.stageId,
    profileId: receipt.profileId,
    state: receipt.state,
    errors: receipt.errors,
    stagedCount: receipt.sets.stagedCount,
    runtimeResolvedCount: receipt.sets.runtimeResolvedCount,
    filesHash: receipt.packageManifest.filesHash,
    stagedFilesHash: receipt.sets.stagedFilesHash,
    releaseReadyClaim: receipt.authority.releaseReadyClaim,
    signingNotarizationClaim: receipt.authority.signingNotarizationClaim,
  })}`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main();
}
