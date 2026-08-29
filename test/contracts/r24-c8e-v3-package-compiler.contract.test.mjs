import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  ACCEPTANCE_SIGNALS_DIGEST,
  C8D_CONTRACT_DIGEST,
  C8D_EVIDENCE_DIGEST,
  C8D_TERMINAL_RUN_ID,
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
  V3_COMPILER_DIGEST,
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
} from '../../scripts/ops/r24/corrective/c8e-v3-package-compiler.mjs';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));

test('C8E StageAdmissionVerifier replay is byte-identical and fixed-runtime bound', () => {
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

test('C8E exact write set and fixed authority contain no package runtime or workflow mutation', () => {
  const instance = readJson(PATHS.stageInstance);
  assert.deepEqual(instance.writeSet.paths, WRITE_SET);
  assert.equal(instance.programTemplateDigest, PROGRAM_TEMPLATE_DIGEST);
  assert.equal(instance.ownerAuthorityBindingDigest, OWNER_BINDING_DIGEST);
  assert.equal(instance.predecessorTerminalDigest, PREDECESSOR_TERMINAL_DIGEST);
  assert.equal(instance.baseSha, SOURCE_HEAD_SHA);
  assert.equal(instance.treeSha, SOURCE_TREE_SHA);
  assert.equal(instance.writeSet.paths.some((entry) => entry === 'package.json' || entry === 'package-lock.json'
    || entry.startsWith('src/') || entry.startsWith('.github/')), false);
});

test('C8E contract binds C8D input and exact V3 output without false DONE', () => {
  const contract = buildContract(repoRoot);
  assert.equal(validateContract(contract), true);
  assert.equal(contract.sourceBindings.c8dContractDigest, C8D_CONTRACT_DIGEST);
  assert.equal(contract.sourceBindings.c8dEvidenceDigest, C8D_EVIDENCE_DIGEST);
  assert.equal(contract.sourceBindings.v3CompilerDigest, V3_COMPILER_DIGEST);
  assert.equal(contract.compilerContract.expectedProfileVerdict, 'NOT_READY');
  assert.equal(contract.compilerContract.expectedProgramVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(contract.claimCeiling.profileCompilerPassOnly, true);
  assert.equal(contract.claimCeiling.productionReleaseReady, false);
  assert.equal(contract.claimCeiling.programDone, false);
});

test('C8E evidence carries one observed exact-head PK1 input and digest-bound compiler output', () => {
  const contract = buildContract(repoRoot);
  const evidence = buildEvidence(repoRoot, contract);
  assert.equal(validateEvidence(evidence, contract), true);
  assert.equal(evidence.observations.compiler.result, 'PASS');
  assert.equal(evidence.observations.compiler.currentVerdict, 'NOT_READY');
  assert.equal(evidence.observations.compiler.programVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(evidence.observations.compiler.requiredStageCount, 1);
  assert.equal(evidence.observations.compiler.inputDigest, contract.compilerContract.inputDigest);
  assert.equal(evidence.observations.compiler.outputDigest, contract.compilerContract.outputDigest);
  assert.equal(C8D_TERMINAL_RUN_ID, 33233687714);
});

test('C8E rejects input/output drift, global pass, signing, and profile-transfer promotion', () => {
  const contract = buildContract(repoRoot);
  const evidence = buildEvidence(repoRoot, contract);
  for (const mutate of [
    (candidate) => { candidate.observations.compiler.inputDigest = '0'.repeat(64); },
    (candidate) => { candidate.observations.compiler.outputDigest = '0'.repeat(64); },
    (candidate) => { candidate.observations.compiler.programVerdict = 'PASS'; },
    (candidate) => { candidate.observations.safety.signing = true; },
    (candidate) => { candidate.observations.safety.profileEvidenceTransfer = true; },
  ]) {
    const mutant = structuredClone(evidence);
    mutate(mutant);
    assert.throws(() => validateEvidence(mutant, contract));
  }
});

test('C8E contract and evidence are pathless public surfaces', () => {
  const contract = buildContract(repoRoot);
  const evidence = buildEvidence(repoRoot, contract);
  assert.equal(assertPathlessPublicEvidence(contract), true);
  assert.equal(assertPathlessPublicEvidence(evidence), true);
  const mutant = structuredClone(evidence);
  mutant.observations.localPath = '/Volumes/example/private';
  assert.throws(() => assertPathlessPublicEvidence(mutant));
});

test('C8E bounded delta rejects paths outside the admitted set', () => {
  assert.throws(() => validateBoundedDeltaObservation({
    candidateSha: 'a'.repeat(40),
    changedPaths: ['package.json'],
    commitCount: 1,
    sourceIsAncestor: true,
  }));
});

test('C8E mutation probes kill every false-claim mutant', () => {
  const result = runProbe(repoRoot);
  assert.equal(result.mutantsKilled, 8);
  assert.equal(result.mutantsTotal, 8);
  assert.equal(result.probeResults.every((entry) => entry.killed), true);
});

test('C8E fixed trust digest and fence counter remain explicit', () => {
  assert.equal(TRUST_MODEL_DIGEST, '4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d');
  assert.equal(FENCE_COUNTER, 49);
});
