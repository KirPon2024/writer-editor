#!/usr/bin/env node
// R2.4 PK0 - package content trust. This OPS-only verifier binds the Electron
// package content allowlist to a closed runtime file set without signing,
// notarization, release publication, dependency mutation, or product runtime
// authority.
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
  'src/preload.js',
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

function validatePackageDependencies({ packageJson, baselinePackageJson = null, changedFiles = [] }) {
  const errors = [];
  const changed = new Set(uniqSorted(changedFiles));
  if (changed.has('package-lock.json') || changed.has('pnpm-lock.yaml') || changed.has('pnpm-workspace.yaml')) {
    errors.push('PK0_LOCKFILE_OR_WORKSPACE_MUTATION_FORBIDDEN');
  }
  if (baselinePackageJson) {
    for (const key of ['dependencies', 'devDependencies', 'overrides', 'engines']) {
      if (hashCanonicalValue(packageJson?.[key] || {}) !== hashCanonicalValue(baselinePackageJson?.[key] || {})) {
        errors.push(`PK0_${key.toUpperCase()}_MUTATION_FORBIDDEN`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
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
  const result = spawnSync('git', ['diff', '--name-only', 'HEAD', '--'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10000,
  });
  if (result.status !== 0) {
    throw new Error(`git diff --name-only failed: ${String(result.stderr || '').trim()}`);
  }
  return String(result.stdout || '').split(/\r?\n/u).filter(Boolean);
}

export function evaluateRepositoryPackageContentTrust({ repoRoot = process.cwd(), baselinePackageJson = null } = {}) {
  const root = path.resolve(repoRoot);
  return evaluatePackageContentTrust({
    packageJson: readJson(path.join(root, 'package.json')),
    baselinePackageJson,
    trackedFiles: gitLsFiles({ cwd: root }),
    changedFiles: gitChangedFiles({ cwd: root }),
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
