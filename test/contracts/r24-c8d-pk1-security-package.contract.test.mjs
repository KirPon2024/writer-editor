import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  ACCEPTANCE_SIGNALS_DIGEST,
  C8C_ARTIFACT_TREE_DIGEST,
  C8C_RAW_MANIFEST_DIGEST,
  FENCE_COUNTER,
  OWNER_BINDING_DIGEST,
  PATHS,
  PREDECESSOR_TERMINAL_DIGEST,
  PROGRAM_TEMPLATE_DIGEST,
  SOURCE_HEAD_SHA,
  SOURCE_TREE_SHA,
  STAGE_ADMISSION_DIGEST,
  STAGE_INSTANCE_DIGEST,
  TRUST_MODEL_DIGEST,
  WRITE_SET,
  WRITE_SET_DIGEST,
  assertPathlessPublicEvidence,
  buildContract,
  buildEvidence,
  runProbe,
  sha256,
  validateBoundedDeltaObservation,
  validateContract,
  validateEvidence,
} from '../../scripts/ops/r24/corrective/c8d-pk1-security-package.mjs';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));

test('C8D StageAdmissionVerifier replay is byte-identical and fixed-runtime bound', () => {
  const result = spawnSync('node', [
    'scripts/ops/r24/corrective/stage-admission-verifier.mjs',
    PATHS.stageInstance,
    PATHS.registry,
    PATHS.program,
  ], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const expected = fs.readFileSync(path.join(repoRoot, PATHS.stageAdmission));
  assert.deepEqual(Buffer.from(result.stdout), expected);
  const instance = readJson(PATHS.stageInstance);
  const admission = readJson(PATHS.stageAdmission);
  assert.equal(sha256(fs.readFileSync(path.join(repoRoot, PATHS.stageInstance))), STAGE_INSTANCE_DIGEST);
  assert.equal(sha256(expected), STAGE_ADMISSION_DIGEST);
  assert.equal(instance.model, 'gpt-5.6-sol');
  assert.equal(instance.reasoningEffort, 'xhigh');
  assert.equal(admission.writeSetDigest, WRITE_SET_DIGEST);
  assert.equal(admission.acceptanceSignalsDigest, ACCEPTANCE_SIGNALS_DIGEST);
});

test('C8D exact write set and fixed authority contain no package or runtime mutation', () => {
  const instance = readJson(PATHS.stageInstance);
  assert.deepEqual(instance.writeSet.paths, WRITE_SET);
  assert.equal(instance.programTemplateDigest, PROGRAM_TEMPLATE_DIGEST);
  assert.equal(instance.ownerAuthorityBindingDigest, OWNER_BINDING_DIGEST);
  assert.equal(instance.predecessorTerminalDigest, PREDECESSOR_TERMINAL_DIGEST);
  assert.equal(instance.baseSha, SOURCE_HEAD_SHA);
  assert.equal(instance.treeSha, SOURCE_TREE_SHA);
  assert.equal(instance.writeSet.paths.some((entry) => entry === 'package.json' || entry === 'package-lock.json' || entry.startsWith('src/')), false);
});

test('C8D contract binds current C8C artifact and limits PASS to typed PK1 classification', () => {
  const contract = buildContract(repoRoot);
  assert.equal(validateContract(contract), true);
  assert.equal(contract.sourceBindings.c8cArtifactTreeDigest, C8C_ARTIFACT_TREE_DIGEST);
  assert.equal(contract.sourceBindings.c8cRawManifestDigest, C8C_RAW_MANIFEST_DIGEST);
  assert.equal(contract.claimCeiling.stageClassificationPassOnly, true);
  assert.equal(contract.claimCeiling.productionReleaseReady, false);
  assert.equal(contract.packageSecurityContract.profileVerdictCandidate, 'NOT_READY');
});

test('C8D evidence preserves stale legacy receipt truth without false DONE', () => {
  const contract = buildContract(repoRoot);
  const evidence = buildEvidence(repoRoot, contract);
  assert.equal(validateEvidence(evidence, contract), true);
  assert.equal(evidence.observations.pk1.pass, true);
  assert.equal(evidence.observations.pk1.profileVerdictCandidate, 'NOT_READY');
  assert.equal(evidence.observations.pk1.productionReleaseReady, false);
  assert.equal(evidence.observations.pk1.currentHeadPhysicalPackageProof, false);
  assert.deepEqual(evidence.observations.pk1.staleReceipts, ['c01', 'c02', 'c03', 'c04']);
  assert.ok(evidence.observations.pk1.blockers.includes('PHYSICAL_RECEIPTS_NOT_CURRENT_HEAD'));
  assert.notEqual(evidence.observations.pk1.appAsarSha256, evidence.observations.c8cArtifact.currentAppAsar.sha256);
});

test('C8D rejects release-ready, signing, and missing-staleness promotions', () => {
  const contract = buildContract(repoRoot);
  const evidence = buildEvidence(repoRoot, contract);
  for (const mutate of [
    (candidate) => { candidate.observations.pk1.productionReleaseReady = true; },
    (candidate) => { candidate.observations.safety.signing = true; },
    (candidate) => { candidate.observations.pk1.blockers = candidate.observations.pk1.blockers.filter((entry) => entry !== 'PHYSICAL_RECEIPTS_NOT_CURRENT_HEAD'); },
  ]) {
    const mutant = structuredClone(evidence);
    mutate(mutant);
    assert.throws(() => validateEvidence(mutant, contract));
  }
});

test('C8D public contract and evidence are pathless', () => {
  const contract = buildContract(repoRoot);
  const evidence = buildEvidence(repoRoot, contract);
  assert.equal(assertPathlessPublicEvidence(contract), true);
  assert.equal(assertPathlessPublicEvidence(evidence), true);
  const mutant = structuredClone(evidence);
  mutant.observations.c8cArtifact.rawManifest.localPath = '/Volumes/example/private';
  assert.throws(() => assertPathlessPublicEvidence(mutant));
});

test('C8D bounded delta rejects paths outside the admitted set', () => {
  assert.throws(() => validateBoundedDeltaObservation({
    candidateSha: 'a'.repeat(40),
    changedPaths: ['package.json'],
    commitCount: 1,
    sourceIsAncestor: true,
  }));
});

test('C8D mutation probes kill every false-claim mutant', () => {
  const result = runProbe(repoRoot);
  assert.equal(result.mutantsKilled, 8);
  assert.equal(result.mutantsTotal, 8);
  assert.equal(result.probeResults.every((entry) => entry.killed), true);
});

test('C8D fixed trust digest and fence counter remain explicit', () => {
  assert.equal(TRUST_MODEL_DIGEST, '4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d');
  assert.equal(FENCE_COUNTER, 48);
});
