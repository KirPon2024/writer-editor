'use strict';

// R2.4 PK0 physical/repository proof: evaluate the real package manifest and
// tracked file universe from this exact checkout. No package build, signing,
// notarization, or publication is performed here.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'scripts', 'ops', 'r24', 'package-content-trust-pk0.mjs');

async function loadModule() {
  return import(pathToFileURL(MODULE_PATH).href);
}

test('PK0 repository package content trust passes on the real tracked file set', async () => {
  const module = await loadModule();
  const result = module.evaluateRepositoryPackageContentTrust({ repoRoot: ROOT });
  const receipt = result.ok ? result.value : result.error.value;

  console.log(`R24_PK0_REPOSITORY_PHYSICAL_RECEIPT=${JSON.stringify({
    pass: receipt.pass,
    stageId: receipt.stageId,
    profileId: receipt.profileId,
    stagedCount: receipt.sets.stagedCount,
    runtimeResolvedCount: receipt.sets.runtimeResolvedCount,
    filesHash: receipt.packageManifest.filesHash,
    stagedFilesHash: receipt.sets.stagedFilesHash,
    releaseReadyClaim: receipt.authority.releaseReadyClaim,
    signingNotarizationClaim: receipt.authority.signingNotarizationClaim,
  })}`);

  assert.equal(result.ok, true, JSON.stringify(receipt.errors));
  assert.deepEqual(receipt.packageManifest.files, module.PK0_REQUIRED_BUILD_FILES);
  assert.equal(receipt.packageManifest.filesHash, receipt.packageManifest.requiredFilesHash);
  assert.equal(receipt.subsetLaw.runtimeResolvedSubsetOfStaged, true);
  assert.equal(receipt.subsetLaw.stagedSubsetOfAdmitted, true);
  assert.equal(receipt.sets.forbiddenStaged.length, 0);
  assert.equal(receipt.sets.unadmittedStaged.length, 0);
  assert.equal(receipt.sets.missingRuntime.length, 0);
  assert.equal(receipt.sets.missingTrackedRuntime.length, 0);
  assert.equal(receipt.authority.releasePublication, false);
  assert.equal(receipt.authority.admittedDependencyAuditException, true);
  assert.equal(receipt.authority.releaseReadyClaim, false);
  assert.equal(receipt.authority.signingNotarizationClaim, false);
  assert.equal(receipt.authority.wordOrGoogleClaim, false);
  assert.equal(receipt.authority.programScalarPass, false);
});

test('PK0 package manifest excludes repository, CI, test, docs and lockfile surfaces from app content', async () => {
  const module = await loadModule();
  const result = module.evaluateRepositoryPackageContentTrust({ repoRoot: ROOT });
  const receipt = result.ok ? result.value : result.error.value;
  const staged = receipt.sets;
  assert.equal(result.ok, true, JSON.stringify(receipt.errors));

  for (const filePath of [
    'package-lock.json',
    '.github/workflows/rtk-required.yml',
    'scripts/ops/r24/package-content-trust-pk0.mjs',
    'test/unit/r24-pk0-package-content-trust.test.js',
    'docs/OPS/EVIDENCE/YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1/PROGRAM_DAG.json',
  ]) {
    assert.equal(staged.forbiddenStaged.includes(filePath), false);
  }
  assert.equal(receipt.packageManifest.files.includes('src/**/*'), true);
  assert.equal(receipt.packageManifest.files.includes('**/*'), false);
  assert.equal(receipt.packageManifest.files.includes('package-lock.json'), false);
});
