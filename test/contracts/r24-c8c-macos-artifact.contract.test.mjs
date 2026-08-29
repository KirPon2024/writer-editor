import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  PATHS,
  SOURCE_HEAD_SHA,
  STAGE_ADMISSION_DIGEST,
  STAGE_INSTANCE_DIGEST,
  assertPathlessPublicEvidence,
  buildContract,
  validateArtifactReadback,
  validateBoundedDeltaObservation,
  validateEvidence,
  validateRawManifest,
  validateBindings,
  verifySealedRawArtifacts,
} from '../../scripts/ops/r24/corrective/c8c-macos-artifact.mjs';

const ROOT = process.cwd();

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function clone(value) {
  return structuredClone(value);
}

test('C8C admission binds the fixed authority, exact C8B base, and nine-path write set', () => {
  const bindings = validateBindings(ROOT);
  assert.equal(bindings.stage.digest, STAGE_INSTANCE_DIGEST);
  assert.equal(bindings.admission.digest, STAGE_ADMISSION_DIGEST);
  assert.equal(bindings.stage.value.baseSha, SOURCE_HEAD_SHA);
  assert.equal(bindings.stage.value.dependencies[0].stageId, 'C8B');
  assert.equal(bindings.stage.value.dependencies[0].status, 'CERTIFIED_DONE');
  assert.equal(bindings.stage.value.writeSet.paths.length, 9);
});

test('C8C contract permits only one unsigned local macOS directory artifact', () => {
  const contract = buildContract(ROOT);
  assert.equal(contract.artifactEnvelope.target, 'dir');
  assert.equal(contract.artifactEnvelope.architecture, 'arm64');
  assert.equal(contract.artifactEnvelope.cscIdentityAutoDiscovery, false);
  assert.equal(contract.safetyBoundary.signing, false);
  assert.equal(contract.safetyBoundary.notarization, false);
  assert.equal(contract.safetyBoundary.publicDistribution, false);
  assert.equal(contract.nonClaims.includes('NO_PROGRAM_DONE'), true);
  assert.equal(assertPathlessPublicEvidence(contract), true);
});

test('C8C evidence binds the sealed artifact bytes and proves the unsigned boundary', () => {
  const contract = buildContract(ROOT);
  const evidence = readJson(PATHS.evidence);
  assert.equal(validateEvidence(evidence, contract, evidence.observations.rawArtifacts.manifest.sha256), true);
  const sealed = verifySealedRawArtifacts(evidence);
  assert.equal(validateRawManifest(sealed.manifest), true);
  assert.equal(sealed.manifest.buildPolicy.signed, false);
  assert.equal(sealed.manifest.buildPolicy.notarized, false);
  assert.equal(sealed.manifest.buildPolicy.distributed, false);
  assert.equal(sealed.manifest.runCapabilityId, evidence.observations.rawArtifacts.runCapabilityId);
  assert.equal(sealed.manifest.artifactTreeDigest, evidence.observations.artifact.treeDigest);
  assert.equal(sealed.manifest.unsignedObservation.developerIdSignaturePresent, false);
  assert.equal(sealed.manifest.unsignedObservation.bundleVerificationPassed, false);
  assert.equal(['ADHOC_LINKER_ONLY', 'NONE'].includes(sealed.manifest.unsignedObservation.signatureMode), true);
});

test('C8C bounded delta validator admits only source or two-commit write-set descendants', () => {
  assert.equal(validateBoundedDeltaObservation({ candidateSha: SOURCE_HEAD_SHA, changedPaths: [], commitCount: 0, sourceIsAncestor: true }), true);
  assert.equal(validateBoundedDeltaObservation({ candidateSha: 'a'.repeat(40), changedPaths: [PATHS.contract, PATHS.evidence], commitCount: 2, sourceIsAncestor: true }), true);
  assert.throws(() => validateBoundedDeltaObservation({ candidateSha: 'a'.repeat(40), changedPaths: [PATHS.contract], commitCount: 3, sourceIsAncestor: true }), /E_UNBOUNDED_DELTA/u);
  assert.throws(() => validateBoundedDeltaObservation({ candidateSha: 'a'.repeat(40), changedPaths: ['package.json'], commitCount: 1, sourceIsAncestor: true }), /E_WRITE_SET_DRIFT/u);
  assert.throws(() => validateBoundedDeltaObservation({ candidateSha: 'a'.repeat(40), changedPaths: [PATHS.contract], commitCount: 1, sourceIsAncestor: false }), /E_SOURCE_HEAD_NOT_ANCESTOR/u);
});

test('C8C raw manifest rejects artifact drift, path leaks, and release authority', () => {
  const evidence = readJson(PATHS.evidence);
  const sealed = verifySealedRawArtifacts(evidence);
  const observed = { files: sealed.manifest.files, symlinks: sealed.manifest.symlinks };
  const byteDrift = clone(sealed.manifest);
  byteDrift.files[0].sha256 = '0'.repeat(64);
  assert.throws(() => validateArtifactReadback(byteDrift, observed), /E_ARTIFACT_TREE_DIGEST|E_ARTIFACT_BYTE_DRIFT/u);
  const pathLeak = clone(sealed.manifest);
  pathLeak.files[0].artifactRelativePath = '/Volumes/example/Yalken';
  assert.throws(() => validateRawManifest(pathLeak), /E_ARTIFACT_PATH_LEAK/u);
  for (const field of ['signed', 'notarized', 'distributed']) {
    const releaseMutant = clone(sealed.manifest);
    releaseMutant.buildPolicy[field] = true;
    assert.throws(() => validateRawManifest(releaseMutant), /E_SIGNING_BOUNDARY|E_NOTARIZATION_BOUNDARY|E_DISTRIBUTION_BOUNDARY/u);
  }
});

test('C8C evidence rejects stale heads, raw-manifest drift, and public path leakage', () => {
  const contract = buildContract(ROOT);
  const evidence = readJson(PATHS.evidence);
  const stale = clone(evidence);
  stale.observations.git.headSha = '0'.repeat(40);
  assert.throws(() => validateEvidence(stale, contract), /E_GIT_BINDING/u);
  const rawDrift = clone(evidence);
  rawDrift.observations.rawArtifacts.manifest.sha256 = '0'.repeat(64);
  assert.throws(() => validateEvidence(rawDrift, contract, evidence.observations.rawArtifacts.manifest.sha256), /E_RAW_MANIFEST_BINDING/u);
  const pathLeak = clone(evidence);
  pathLeak.observations.rawArtifacts.runCapabilityId = '/private/example';
  assert.throws(() => validateEvidence(pathLeak, contract), /E_RAW_RUN_CAPABILITY|E_PUBLIC_PATH_LEAK/u);
});

test('C8C runner source hard-codes unsigned local-only build policy', () => {
  const source = fs.readFileSync(path.join(ROOT, PATHS.script), 'utf8');
  for (const token of [
    "'--mac',",
    "'dir',",
    "'--arm64',",
    '--config.electronDist=',
    "CSC_IDENTITY_AUTO_DISCOVERY: 'false'",
    'HOME: process.env.HOME',
    "npm_config_offline: 'true'",
    'verifyUnsignedApp',
    'apps.map((appPath) => path.basename(appPath))',
    'durableWriteExclusive',
    'validateArtifactReadback',
    'E_RAW_ROOT_IN_GIT_CHECKOUT',
  ]) assert.equal(source.includes(token), true, `missing physical artifact fence: ${token}`);
  for (const forbidden of ['...process.env', 'CSC_LINK:', '--publish always', '--publish=always', 'notarytool', 'force-push']) {
    assert.equal(source.includes(forbidden), false, `forbidden release authority: ${forbidden}`);
  }
});
