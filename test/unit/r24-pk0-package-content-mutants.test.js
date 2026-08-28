'use strict';

// R2.4 PK0 mutation proof: each mutant weakens exactly one package-content
// trust guard and the oracle must kill every mutant.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'scripts', 'ops', 'r24', 'package-content-trust-pk0.mjs');

const MUTANTS = Object.freeze([
  {
    id: 'release-ready-claim-promoted',
    find: 'const RELEASE_READY_CLAIM = false;',
    replace: 'const RELEASE_READY_CLAIM = true;',
  },
  {
    id: 'signing-notarization-claim-promoted',
    find: 'const SIGNING_NOTARIZATION_CLAIM = false;',
    replace: 'const SIGNING_NOTARIZATION_CLAIM = true;',
  },
  {
    id: 'dependency-mutation-allowed',
    find: 'const DEPENDENCY_MUTATION_ALLOWED = false;',
    replace: 'const DEPENDENCY_MUTATION_ALLOWED = true;',
  },
  {
    id: 'forged-c6d-dependency-admission-accepted',
    find: '    && hashCanonicalValue(candidate) === hashCanonicalValue(C6D_DEPENDENCY_MUTATION_ADMISSION);',
    replace: '    && true;',
  },
  {
    id: 'runtime-subset-missing-disabled',
    find: 'const missingRuntime = runtimeResolvedFiles.filter((filePath) => !staged.has(filePath));',
    replace: 'const missingRuntime = runtimeResolvedFiles.filter((filePath) => false && !staged.has(filePath));',
  },
  {
    id: 'build-files-mismatch-disabled',
    find: '  if (hashCanonicalValue(buildFiles) !== hashCanonicalValue(PK0_REQUIRED_BUILD_FILES)) {',
    replace: '  if (false && hashCanonicalValue(buildFiles) !== hashCanonicalValue(PK0_REQUIRED_BUILD_FILES)) {',
  },
  {
    id: 'broad-glob-detection-disabled',
    find: "  for (const pattern of findImplicitlyBroadPatterns(buildFiles)) {",
    replace: "  for (const pattern of []) {",
  },
  {
    id: 'forbidden-staged-detection-disabled',
    find: '  const forbiddenStaged = stagedFiles.filter(isForbiddenStagedFile);',
    replace: '  const forbiddenStaged = [];',
  },
]);

async function importModule(modulePath) {
  return import(`${pathToFileURL(modulePath).href}?t=${Date.now()}-${Math.random()}`);
}

function programDagFixture() {
  return {
    stages: [
      {
        stageId: 'PK0_PACKAGE_CONTENT_TRUST',
        profile: 'PACKAGED_RELEASE_SECURITY',
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
        law: 'Runtime-resolved files must be a subset of staged files, which must be a subset of explicitly admitted package files.',
      },
    ],
  };
}

function packageFixture(files, module) {
  return {
    dependencies: { '@tiptap/core': '^3.20.1' },
    devDependencies: { electron: '^40.9.2' },
    overrides: {},
    engines: { node: '>=20.19.0 <21.0.0' },
    build: { files: files || module.PK0_REQUIRED_BUILD_FILES },
  };
}

function trackedFixture(extra = []) {
  return [
    'package.json',
    'LICENSE',
    'NOTICE',
    'README.md',
    'SECURITY.md',
    'src/main.js',
    'src/preload.js',
    'src/preload.bundle.cjs',
    'src/renderer/index.html',
    'src/renderer/editor.bundle.js',
    'src/renderer/flags.js',
    ...extra,
  ];
}

function evaluate(module, overrides = {}) {
  return module.evaluatePackageContentTrust({
    packageJson: overrides.packageJson || packageFixture(null, module),
    trackedFiles: overrides.trackedFiles || trackedFixture(),
    runtimeResolvedFiles: overrides.runtimeResolvedFiles,
    programDag: programDagFixture(),
    scientificContracts: scientificContractsFixture(),
    externalClaims: overrides.externalClaims,
  });
}

async function killOracle(module) {
  const normal = evaluate(module);
  assert.equal(normal.ok, true, normal.ok ? '' : JSON.stringify(normal.error.value.errors));
  assert.equal(normal.value.authority.releaseReadyClaim, false);
  assert.equal(normal.value.authority.signingNotarizationClaim, false);
  assert.equal(normal.value.authority.dependencyMutation, false);

  const upgraded = packageFixture(null, module);
  upgraded.devDependencies.electron = '41.10.3';
  const forgedAdmission = structuredClone(module.C6D_DEPENDENCY_MUTATION_ADMISSION);
  forgedAdmission.currentLockSha256 = '0'.repeat(64);
  const forged = module.evaluatePackageContentTrust({
    packageJson: upgraded,
    baselinePackageJson: packageFixture(null, module),
    trackedFiles: trackedFixture(),
    changedFiles: ['package.json', 'package-lock.json'],
    dependencyMutationAdmission: forgedAdmission,
    programDag: programDagFixture(),
    scientificContracts: scientificContractsFixture(),
  });
  assert.equal(forged.ok, false, 'forged C6D admission must remain denied');

  const missingRuntime = evaluate(module, {
    trackedFiles: trackedFixture().filter((filePath) => filePath !== 'src/preload.bundle.cjs'),
  });
  assert.equal(missingRuntime.ok, false);
  assert.equal(missingRuntime.error.value.errors.includes('PK0_RUNTIME_RESOLVED_NOT_STAGED'), true);

  const manifestMismatch = evaluate(module, {
    packageJson: packageFixture([...module.PK0_REQUIRED_BUILD_FILES, 'src/main.js'], module),
  });
  assert.equal(manifestMismatch.ok, false);
  assert.equal(manifestMismatch.error.value.errors.includes('PK0_BUILD_FILES_MANIFEST_MISMATCH'), true);

  const broad = evaluate(module, {
    packageJson: packageFixture(['**/*'], module),
  });
  assert.equal(broad.ok, false);
  assert.equal(broad.error.value.errors.some((code) => code.startsWith('PK0_BROAD_PACKAGE_GLOB_FORBIDDEN')), true);

  const forbidden = evaluate(module, {
    packageJson: packageFixture([...module.PK0_REQUIRED_BUILD_FILES, 'docs/**/*'], module),
    trackedFiles: trackedFixture(['docs/OPS/STATUS/CANON_STATUS.json']),
  });
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.error.value.errors.includes('PK0_FORBIDDEN_FILE_STAGED'), true);
}

function materializeMutant(source, mutant) {
  const occurrences = source.split(mutant.find).length - 1;
  assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-pk0-mutant-')));
  const modulePath = path.join(dir, 'package-content-trust-pk0.mjs');
  fs.writeFileSync(modulePath, source.replace(mutant.find, mutant.replace));
  return { dir, modulePath };
}

test('PK0 package content trust mutants are executed and killed', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  await killOracle(await importModule(MODULE_PATH));

  const results = [];
  for (const mutant of MUTANTS) {
    const { dir, modulePath } = materializeMutant(source, mutant);
    let killed = false;
    let detail = '';
    try {
      await killOracle(await importModule(modulePath));
      detail = 'survived';
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    }
    results.push({ id: mutant.id, killed, detail });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const survived = results.filter((result) => !result.killed);
  console.log(`R24_PK0_MUTATION_RECEIPT=${JSON.stringify({
    total: results.length,
    killed: results.length - survived.length,
    survived: survived.map((result) => result.id),
    score: results.length ? (results.length - survived.length) / results.length : 0,
  })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
