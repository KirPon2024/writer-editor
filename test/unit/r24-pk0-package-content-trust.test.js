'use strict';

// R2.4 PK0 package content trust: model/contract proof for explicit package
// content admission and no release-profile promotion.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'scripts', 'ops', 'r24', 'package-content-trust-pk0.mjs');

async function loadModule() {
  return import(pathToFileURL(MODULE_PATH).href);
}

function programDagFixture() {
  return {
    stages: [
      {
        stageId: 'PK0_PACKAGE_CONTENT_TRUST',
        profile: 'PACKAGED_RELEASE_SECURITY',
        dependsOn: ['Q0_TOOLCHAIN_HYGIENE', 'SEC0_PATH_CAPABILITY'],
        status: 'PENDING',
        mutationAuthority: 'PACKAGE_MANIFEST_AND_BUILD_EVIDENCE',
        claimCeiling: 'PACKAGE_CONTENT_PROFILE_ONLY',
      },
    ],
  };
}

function scientificContractsFixture() {
  return {
    consistencyModels: [
      {
        consistencyModelId: 'CM_PACKAGE_RESOLVED_STAGED_ADMITTED_SET_R1',
        profileId: 'PACKAGED_RELEASE_SECURITY',
        law: 'Runtime-resolved files must be a subset of staged files, which must be a subset of explicitly admitted package files.',
      },
    ],
  };
}

function packageFixture(files) {
  return {
    name: 'craftsman',
    version: '1.0.2',
    dependencies: { '@tiptap/core': '^3.20.1' },
    devDependencies: { electron: '^40.9.2', 'electron-builder': '^26.8.1' },
    overrides: { plist: '3.1.1' },
    engines: { node: '>=20.19.0 <21.0.0', npm: '>=10.0.0 <11.0.0' },
    build: { files },
  };
}

function trackedFixture() {
  return [
    'package.json',
    'package-lock.json',
    'LICENSE',
    'NOTICE',
    'README.md',
    'SECURITY.md',
    'src/main.js',
    'src/preload.js',
    'src/preload.bundle.cjs',
    'src/core/ipc-envelope-v1.cjs',
    'src/core/contracts.ts',
    'src/contracts/core-state.contract.ts',
    'src/renderer/index.html',
    'src/renderer/editor.bundle.js',
    'src/renderer/editor.js',
    'src/renderer/flags.js',
    'docs/OPS/STATUS/CANON_STATUS.json',
    'scripts/ops/r24/scheduler.mjs',
    'test/unit/example.test.js',
  ];
}

test('PK0 accepts exact build.files manifest and proves runtime/staged/admitted subset law', async () => {
  const module = await loadModule();
  const result = module.evaluatePackageContentTrust({
    packageJson: packageFixture(module.PK0_REQUIRED_BUILD_FILES),
    trackedFiles: trackedFixture(),
    programDag: programDagFixture(),
    scientificContracts: scientificContractsFixture(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.stageId, 'PK0_PACKAGE_CONTENT_TRUST');
  assert.equal(result.value.profileId, 'PACKAGED_RELEASE_SECURITY');
  assert.equal(result.value.programBinding.claimCeiling, 'PACKAGE_CONTENT_PROFILE_ONLY');
  assert.equal(result.value.subsetLaw.runtimeResolvedSubsetOfStaged, true);
  assert.equal(result.value.subsetLaw.stagedSubsetOfAdmitted, true);
  assert.equal(result.value.sets.forbiddenStaged.length, 0);
  assert.equal(result.value.sets.missingRuntime.length, 0);
  assert.equal(result.value.authority.releaseReadyClaim, false);
  assert.equal(result.value.authority.signingNotarizationClaim, false);
  assert.equal(result.value.authority.releasePublication, false);
  assert.equal(result.value.authority.dependencyMutation, false);
  assert.equal(result.value.authority.productRuntimeMutation, false);
  assert.equal(result.value.authority.runtimeNetworkActivated, false);
  assert.equal(result.value.sets.runtimeResolvedFiles.includes('src/preload.bundle.cjs'), true);
  assert.equal(result.value.sets.runtimeResolvedFiles.includes('src/renderer/editor.bundle.js'), true);
});

test('PK0 rejects broad globs, forbidden staged files, missing runtime entries, and release promotion', async () => {
  const module = await loadModule();
  const broad = module.evaluatePackageContentTrust({
    packageJson: packageFixture(['**/*']),
    trackedFiles: trackedFixture(),
    programDag: programDagFixture(),
    scientificContracts: scientificContractsFixture(),
  });
  assert.equal(broad.ok, false);
  assert.equal(broad.error.value.errors.includes('PK0_BUILD_FILES_MANIFEST_MISMATCH'), true);
  assert.equal(broad.error.value.errors.some((code) => code.startsWith('PK0_BROAD_PACKAGE_GLOB_FORBIDDEN')), true);
  assert.equal(broad.error.value.errors.includes('PK0_FORBIDDEN_FILE_STAGED'), true);

  const missing = module.evaluatePackageContentTrust({
    packageJson: packageFixture(module.PK0_REQUIRED_BUILD_FILES),
    trackedFiles: trackedFixture().filter((file) => file !== 'src/preload.bundle.cjs'),
    programDag: programDagFixture(),
    scientificContracts: scientificContractsFixture(),
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.error.value.errors.includes('PK0_RUNTIME_RESOLVED_NOT_STAGED'), true);
  assert.equal(missing.error.value.errors.includes('PK0_RUNTIME_RESOLVED_NOT_TRACKED'), true);

  const promoted = module.evaluatePackageContentTrust({
    packageJson: packageFixture(module.PK0_REQUIRED_BUILD_FILES),
    trackedFiles: trackedFixture(),
    programDag: programDagFixture(),
    scientificContracts: scientificContractsFixture(),
    externalClaims: { releaseReady: true, signingPass: true, notarizationPass: true },
  });
  assert.equal(promoted.ok, false);
  assert.equal(promoted.error.value.errors.includes('PK0_RELEASE_READY_CLAIM_FORBIDDEN'), true);
  assert.equal(promoted.error.value.errors.includes('PK0_SIGNING_NOTARIZATION_CLAIM_FORBIDDEN'), true);
});

test('PK0 rejects dependency, lockfile, program binding, and consistency-law drift', async () => {
  const module = await loadModule();
  const packageJson = packageFixture(module.PK0_REQUIRED_BUILD_FILES);
  const baselinePackageJson = packageFixture(module.PK0_REQUIRED_BUILD_FILES);
  packageJson.dependencies.leftpad = '1.0.0';

  const dependencyDrift = module.evaluatePackageContentTrust({
    packageJson,
    baselinePackageJson,
    trackedFiles: trackedFixture(),
    changedFiles: ['package-lock.json'],
    programDag: programDagFixture(),
    scientificContracts: scientificContractsFixture(),
  });
  assert.equal(dependencyDrift.ok, false);
  assert.equal(dependencyDrift.error.value.errors.includes('PK0_LOCKFILE_OR_WORKSPACE_MUTATION_FORBIDDEN'), true);
  assert.equal(dependencyDrift.error.value.errors.includes('PK0_DEPENDENCIES_MUTATION_FORBIDDEN'), true);

  const programDrift = module.evaluatePackageContentTrust({
    packageJson: packageFixture(module.PK0_REQUIRED_BUILD_FILES),
    trackedFiles: trackedFixture(),
    programDag: { stages: [{ stageId: 'PK0_PACKAGE_CONTENT_TRUST', profile: 'WRITER_CORE' }] },
    scientificContracts: { consistencyModels: [] },
  });
  assert.equal(programDrift.ok, false);
  assert.equal(programDrift.error.value.errors.includes('PK0_PROFILE_MISMATCH'), true);
  assert.equal(programDrift.error.value.errors.includes('PK0_AUTHORITY_MISMATCH'), true);
  assert.equal(programDrift.error.value.errors.includes('PK0_CLAIM_CEILING_MISMATCH'), true);
  assert.equal(programDrift.error.value.errors.includes('PK0_CONSISTENCY_MODEL_MISSING'), true);
});

test('PK0 admits only the exact owner-bound C6D Electron security upgrade', async () => {
  const module = await loadModule();
  const baselinePackageJson = packageFixture(module.PK0_REQUIRED_BUILD_FILES);
  const packageJson = packageFixture(module.PK0_REQUIRED_BUILD_FILES);
  packageJson.devDependencies.electron = '41.10.3';

  const admitted = module.evaluatePackageContentTrust({
    packageJson,
    baselinePackageJson,
    trackedFiles: trackedFixture(),
    changedFiles: ['package.json', 'package-lock.json'],
    dependencyMutationAdmission: module.C6D_DEPENDENCY_MUTATION_ADMISSION,
    programDag: programDagFixture(),
    scientificContracts: scientificContractsFixture(),
  });
  assert.equal(admitted.ok, true, admitted.ok ? '' : JSON.stringify(admitted.error.value.errors));
  assert.equal(admitted.value.authority.dependencyMutation, false);
  assert.equal(admitted.value.authority.admittedDependencyAuditException, true);

  const forged = structuredClone(module.C6D_DEPENDENCY_MUTATION_ADMISSION);
  forged.currentLockSha256 = '0'.repeat(64);
  const forgedResult = module.evaluatePackageContentTrust({
    packageJson,
    baselinePackageJson,
    trackedFiles: trackedFixture(),
    changedFiles: ['package.json', 'package-lock.json'],
    dependencyMutationAdmission: forged,
    programDag: programDagFixture(),
    scientificContracts: scientificContractsFixture(),
  });
  assert.equal(forgedResult.ok, false);
  assert.equal(forgedResult.error.value.errors.includes('PK0_LOCKFILE_OR_WORKSPACE_MUTATION_FORBIDDEN'), true);
  assert.equal(forgedResult.error.value.errors.includes('PK0_DEVDEPENDENCIES_MUTATION_FORBIDDEN'), true);

  const expanded = structuredClone(packageJson);
  expanded.devDependencies.unapproved = '1.0.0';
  const expandedResult = module.evaluatePackageContentTrust({
    packageJson: expanded,
    baselinePackageJson,
    trackedFiles: trackedFixture(),
    changedFiles: ['package.json', 'package-lock.json'],
    dependencyMutationAdmission: module.C6D_DEPENDENCY_MUTATION_ADMISSION,
    programDag: programDagFixture(),
    scientificContracts: scientificContractsFixture(),
  });
  assert.equal(expandedResult.ok, false);
  assert.equal(expandedResult.error.value.errors.includes('PK0_DEVDEPENDENCIES_MUTATION_FORBIDDEN'), true);

  const workspaceResult = module.evaluatePackageContentTrust({
    packageJson,
    baselinePackageJson,
    trackedFiles: trackedFixture(),
    changedFiles: ['package.json', 'package-lock.json', 'pnpm-workspace.yaml'],
    dependencyMutationAdmission: module.C6D_DEPENDENCY_MUTATION_ADMISSION,
    programDag: programDagFixture(),
    scientificContracts: scientificContractsFixture(),
  });
  assert.equal(workspaceResult.ok, false);
  assert.equal(workspaceResult.error.value.errors.includes('PK0_LOCKFILE_OR_WORKSPACE_MUTATION_FORBIDDEN'), true);
  assert.equal(workspaceResult.error.value.errors.includes('PK0_DEPENDENCY_ADMISSION_WRITE_SET_EXPANSION'), true);
});

test('PK0 admits only the exact owner-bound post-audit Node and npm successor', async () => {
  const module = await loadModule();
  const baselinePackageJson = packageFixture(module.PK0_REQUIRED_BUILD_FILES);
  baselinePackageJson.devDependencies.electron = '41.10.3';
  const packageJson = structuredClone(baselinePackageJson);
  packageJson.packageManager = 'npm@10.9.0';
  packageJson.engines = { node: '>=22.12.0 <23.0.0', npm: '>=10.9.0 <11.0.0' };

  const admitted = module.evaluatePackageContentTrust({
    packageJson,
    baselinePackageJson,
    trackedFiles: trackedFixture(),
    changedFiles: ['package.json', 'package-lock.json'],
    dependencyMutationAdmission: module.POST_AUDIT_TOOLCHAIN_MUTATION_ADMISSION,
    programDag: programDagFixture(),
    scientificContracts: scientificContractsFixture(),
  });
  assert.equal(admitted.ok, true, admitted.ok ? '' : JSON.stringify(admitted.error.value.errors));
  assert.equal(admitted.value.authority.admittedDependencyAuditException, true);

  const wrongEngine = structuredClone(packageJson);
  wrongEngine.engines.node = '>=22.0.0 <23.0.0';
  const wrongEngineResult = module.evaluatePackageContentTrust({
    packageJson: wrongEngine,
    baselinePackageJson,
    trackedFiles: trackedFixture(),
    changedFiles: ['package.json', 'package-lock.json'],
    dependencyMutationAdmission: module.POST_AUDIT_TOOLCHAIN_MUTATION_ADMISSION,
    programDag: programDagFixture(),
    scientificContracts: scientificContractsFixture(),
  });
  assert.equal(wrongEngineResult.ok, false);
  assert.equal(wrongEngineResult.error.value.errors.includes('PK0_ENGINES_MUTATION_FORBIDDEN'), true);

  const wrongPackageManager = structuredClone(packageJson);
  wrongPackageManager.packageManager = 'npm@10.8.2';
  const wrongPackageManagerResult = module.evaluatePackageContentTrust({
    packageJson: wrongPackageManager,
    baselinePackageJson,
    trackedFiles: trackedFixture(),
    changedFiles: ['package.json', 'package-lock.json'],
    dependencyMutationAdmission: module.POST_AUDIT_TOOLCHAIN_MUTATION_ADMISSION,
    programDag: programDagFixture(),
    scientificContracts: scientificContractsFixture(),
  });
  assert.equal(wrongPackageManagerResult.ok, false);
  assert.equal(wrongPackageManagerResult.error.value.errors.includes('PK0_PACKAGEMANAGER_MUTATION_FORBIDDEN'), true);

  const dependencyExpansion = structuredClone(packageJson);
  dependencyExpansion.dependencies.unapproved = '1.0.0';
  const dependencyExpansionResult = module.evaluatePackageContentTrust({
    packageJson: dependencyExpansion,
    baselinePackageJson,
    trackedFiles: trackedFixture(),
    changedFiles: ['package.json', 'package-lock.json'],
    dependencyMutationAdmission: module.POST_AUDIT_TOOLCHAIN_MUTATION_ADMISSION,
    programDag: programDagFixture(),
    scientificContracts: scientificContractsFixture(),
  });
  assert.equal(dependencyExpansionResult.ok, false);
  assert.equal(dependencyExpansionResult.error.value.errors.includes('PK0_DEPENDENCIES_MUTATION_FORBIDDEN'), true);

  const crossStageElectron = structuredClone(packageJson);
  crossStageElectron.devDependencies.electron = '^40.9.2';
  const crossStageElectronResult = module.evaluatePackageContentTrust({
    packageJson: crossStageElectron,
    baselinePackageJson,
    trackedFiles: trackedFixture(),
    changedFiles: ['package.json', 'package-lock.json'],
    dependencyMutationAdmission: module.POST_AUDIT_TOOLCHAIN_MUTATION_ADMISSION,
    programDag: programDagFixture(),
    scientificContracts: scientificContractsFixture(),
  });
  assert.equal(crossStageElectronResult.ok, false);
  assert.equal(crossStageElectronResult.error.value.errors.includes('PK0_DEVDEPENDENCIES_MUTATION_FORBIDDEN'), true);
});

test('PK0 admits only the exact WP702 security override transition and rejects forged or expanded scope', async () => {
  const module = await loadModule();
  const baselinePackageJson = packageFixture(module.PK0_REQUIRED_BUILD_FILES);
  baselinePackageJson.devDependencies.electron = '41.10.3';
  baselinePackageJson.packageManager = 'npm@10.9.0';
  baselinePackageJson.engines = { node: '>=22.12.0 <23.0.0', npm: '>=10.9.0 <11.0.0' };
  baselinePackageJson.overrides = {
    '@xmldom/xmldom': '0.9.10',
    'linkify-it': '5.0.2',
    picomatch: '4.0.4',
    plist: '3.1.1',
    tar: '7.5.22',
  };
  const packageJson = structuredClone(baselinePackageJson);
  packageJson.overrides['@xmldom/xmldom'] = '0.9.12';
  packageJson.overrides['fast-uri'] = '4.1.4';

  const admitted = module.evaluatePackageContentTrust({
    packageJson,
    baselinePackageJson,
    trackedFiles: trackedFixture(),
    changedFiles: ['package-lock.json', 'package.json'],
    dependencyMutationAdmission: module.WP702_DEPENDENCY_SECURITY_MUTATION_ADMISSION,
    programDag: programDagFixture(),
    scientificContracts: scientificContractsFixture(),
  });
  assert.equal(admitted.ok, true, admitted.ok ? '' : JSON.stringify(admitted.error.value.errors));
  assert.equal(admitted.value.authority.dependencyMutation, false);
  assert.equal(admitted.value.authority.admittedDependencyAuditException, true);

  const forgedAdmission = structuredClone(module.WP702_DEPENDENCY_SECURITY_MUTATION_ADMISSION);
  forgedAdmission.stageAdmissionDigest = '0'.repeat(64);
  const forged = module.evaluatePackageContentTrust({
    packageJson,
    baselinePackageJson,
    trackedFiles: trackedFixture(),
    changedFiles: ['package-lock.json', 'package.json'],
    dependencyMutationAdmission: forgedAdmission,
    programDag: programDagFixture(),
    scientificContracts: scientificContractsFixture(),
  });
  assert.equal(forged.ok, false);
  assert.equal(forged.error.value.errors.includes('PK0_LOCKFILE_OR_WORKSPACE_MUTATION_FORBIDDEN'), true);
  assert.equal(forged.error.value.errors.includes('PK0_OVERRIDES_MUTATION_FORBIDDEN'), true);

  const expanded = structuredClone(packageJson);
  expanded.overrides.tar = '7.5.23';
  const expandedResult = module.evaluatePackageContentTrust({
    packageJson: expanded,
    baselinePackageJson,
    trackedFiles: trackedFixture(),
    changedFiles: ['package-lock.json', 'package.json'],
    dependencyMutationAdmission: module.WP702_DEPENDENCY_SECURITY_MUTATION_ADMISSION,
    programDag: programDagFixture(),
    scientificContracts: scientificContractsFixture(),
  });
  assert.equal(expandedResult.ok, false);
  assert.equal(expandedResult.error.value.errors.includes('PK0_OVERRIDES_MUTATION_FORBIDDEN'), true);

  const dependencyExpansion = structuredClone(packageJson);
  dependencyExpansion.dependencies.unapproved = '1.0.0';
  const dependencyExpansionResult = module.evaluatePackageContentTrust({
    packageJson: dependencyExpansion,
    baselinePackageJson,
    trackedFiles: trackedFixture(),
    changedFiles: ['package-lock.json', 'package.json'],
    dependencyMutationAdmission: module.WP702_DEPENDENCY_SECURITY_MUTATION_ADMISSION,
    programDag: programDagFixture(),
    scientificContracts: scientificContractsFixture(),
  });
  assert.equal(dependencyExpansionResult.ok, false);
  assert.equal(dependencyExpansionResult.error.value.errors.includes('PK0_DEPENDENCIES_MUTATION_FORBIDDEN'), true);
});
