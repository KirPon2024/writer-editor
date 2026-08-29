import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  ACCEPTANCE_SIGNALS_DIGEST,
  ENVELOPES,
  FENCE_COUNTER,
  OWNER_BINDING_DIGEST,
  PATHS,
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
  buildEvaluation,
  buildLedger,
  runProbe,
  sha256,
  validateCandidateDelta,
  validateContract,
  validateEvaluation,
  validateLedger,
  validateTransferPath,
} from '../../scripts/ops/r24/corrective/c8z-umbrella-current-head-recertification.mjs';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));

test('C8Z StageAdmissionVerifier replay is byte-identical and fixed-runtime bound', () => {
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

test('C8Z exact write set excludes product, package and workflow mutation', () => {
  const instance = readJson(PATHS.stageInstance);
  assert.deepEqual(instance.writeSet.paths, WRITE_SET);
  assert.equal(instance.programTemplateDigest, PROGRAM_TEMPLATE_DIGEST);
  assert.equal(instance.ownerAuthorityBindingDigest, OWNER_BINDING_DIGEST);
  assert.equal(instance.baseSha, SOURCE_HEAD_SHA);
  assert.equal(instance.treeSha, SOURCE_TREE_SHA);
  assert.equal(instance.writeSet.paths.some((entry) => entry === 'package.json' || entry === 'package-lock.json'
    || entry.startsWith('src/') || entry.startsWith('.github/')), false);
});

test('C8Z contract recertifies exactly five immutable envelopes at current head', () => {
  const contract = buildContract(repoRoot);
  assert.equal(validateContract(contract), true);
  assert.deepEqual(contract.envelopes.map((entry) => entry.stageId), ['C8A', 'C8B', 'C8C', 'C8D', 'C8E']);
  assert.equal(contract.envelopes.every((entry) => entry.status === 'CURRENT_HEAD_RECERTIFIED'
    && entry.certification.status === 'VERIFIED' && entry.transfer.sourceIsAncestor === true), true);
  assert.equal(contract.envelopes.every((entry) => entry.artifacts.length === 6), true);
  assert.equal(ENVELOPES.length, 5);
});

test('C8Z evaluation and append-only ledger preserve exact current and historical sets', () => {
  const contract = buildContract(repoRoot);
  const evaluation = buildEvaluation(repoRoot, contract);
  const ledger = buildLedger(contract, evaluation);
  assert.equal(validateEvaluation(evaluation, contract), true);
  assert.equal(validateLedger(ledger), true);
  assert.equal(evaluation.claim.envelopeCount, 5);
  assert.equal(evaluation.claim.envelopePassCount, 5);
  assert.equal(evaluation.testInventory.requiredSkips, 0);
  assert.equal(evaluation.testInventory.unexplainedSkips, 0);
  assert.equal(ledger.appendOnly, true);
  assert.equal(ledger.historicalReceiptsRemainImmutable, true);
});

test('C8Z rejects skip, release promotion, global PASS and program DONE', () => {
  const contract = buildContract(repoRoot);
  const evaluation = buildEvaluation(repoRoot, contract);
  for (const mutate of [
    (candidate) => { candidate.envelopes[0].status = 'SKIPPED'; },
    (candidate) => { candidate.claimCeiling.productionReleaseReady = true; },
    (candidate) => { candidate.claimCeiling.programVerdict = 'PASS'; },
    (candidate) => { candidate.claimCeiling.programDone = true; },
  ]) {
    const mutant = structuredClone(contract);
    mutate(mutant);
    assert.throws(() => validateContract(mutant));
  }
  const evaluationMutant = structuredClone(evaluation);
  evaluationMutant.claim.programVerdict = 'PASS';
  assert.throws(() => validateEvaluation(evaluationMutant, contract));
});

test('C8Z permits only successor envelope paths in historical transfer', () => {
  assert.equal(validateTransferPath('C8A', 'docs/OPS/R24/CORRECTIVE/C8B_STAGE_INSTANCE_V1.json'), true);
  assert.equal(validateTransferPath('C8C', 'scripts/ops/r24/corrective/c8e-v3-package-compiler.mjs'), true);
  assert.equal(validateTransferPath('C8D', PATHS.inventory), true);
  assert.throws(() => validateTransferPath('C8A', 'src/renderer/editor.js'));
  assert.throws(() => validateTransferPath('C8C', 'package.json'));
  assert.throws(() => validateTransferPath('C8E', 'docs/OPS/R24/CORRECTIVE/C8A_PHYSICAL_A11Y_PERFORMANCE_CONTRACT_V1.json'));
});

test('C8Z candidate delta rejects any path outside the exact admitted set', () => {
  assert.throws(() => validateCandidateDelta({
    candidateSha: 'a'.repeat(40),
    changedPaths: ['package.json'],
    commitCount: 1,
    sourceIsAncestor: true,
  }));
});

test('C8Z public contract, evaluation and ledger contain no local absolute paths', () => {
  const contract = buildContract(repoRoot);
  const evaluation = buildEvaluation(repoRoot, contract);
  const ledger = buildLedger(contract, evaluation);
  assert.equal(assertPathlessPublicEvidence(contract), true);
  assert.equal(assertPathlessPublicEvidence(evaluation), true);
  assert.equal(assertPathlessPublicEvidence(ledger), true);
  const mutant = structuredClone(evaluation);
  mutant.localPath = '/private/example';
  assert.throws(() => assertPathlessPublicEvidence(mutant));
});

test('C8Z mutation probes kill every umbrella false-claim mutant', () => {
  const result = runProbe(repoRoot);
  assert.equal(result.mutantsKilled, 9);
  assert.equal(result.mutantsTotal, 9);
  assert.equal(result.probeResults.every((entry) => entry.killed), true);
});

test('C8Z fixed trust digest and counter-fence remain explicit', () => {
  assert.equal(TRUST_MODEL_DIGEST, '4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d');
  assert.equal(FENCE_COUNTER, 50);
});
