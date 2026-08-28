import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  LANES,
  PATHS,
  SOURCE_HEAD_SHA,
  SOURCE_TREE_SHA,
  STAGE_ADMISSION_DIGEST,
  STAGE_INSTANCE_DIGEST,
  buildArtifacts,
  expectedPassResults,
  loadInputs,
  validateArtifacts
} from '../../scripts/ops/r24/corrective/c2b3a-e0-q0-recertification.mjs';
import { canonicalBytes } from '../../scripts/ops/r24/corrective/canonical-json.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));

function modifiedInputs(mutator) {
  const inputs = loadInputs(REPO_ROOT);
  mutator(inputs);
  return inputs;
}

test('C2B3A evaluates exactly E0 and Q0 on the externally certified C2B2 source snapshot', () => {
  const artifacts = buildArtifacts(loadInputs(REPO_ROOT), expectedPassResults());
  assert.equal(artifacts.contract.productionSnapshot.headSha, SOURCE_HEAD_SHA);
  assert.equal(artifacts.contract.productionSnapshot.treeSha, SOURCE_TREE_SHA);
  assert.deepEqual(artifacts.evaluation.lanes.map((entry) => entry.contourId), LANES.map((entry) => entry.contourId));
  assert.deepEqual(artifacts.evaluation.counts, {
    currentHeadPass: 2,
    falseDoneClaims: 0,
    lanes: 2,
    rawOrEffectiveMutations: 0,
    terminalCertifiedBeforeExternalAttestation: 0
  });
});

test('raw and effective E0 Q0 lifecycle states remain immutable historical DONE truth', () => {
  const { evaluation } = buildArtifacts(loadInputs(REPO_ROOT), expectedPassResults());
  for (const lane of evaluation.lanes) {
    assert.equal(lane.rawState, 'DONE');
    assert.equal(lane.effectiveState, 'DONE');
    assert.equal(lane.rawStateMutated, false);
    assert.equal(lane.effectiveStateMutated, false);
    assert.equal(lane.priorCertifiedState, 'DONE_UNCERTIFIED');
  }
});

test('lane receipts have exact denominators, zero skips, and stable mutation evidence without duration noise', () => {
  const { evaluation } = buildArtifacts(loadInputs(REPO_ROOT), expectedPassResults());
  assert.deepEqual(evaluation.lanes.map((entry) => entry.commandResult.suiteTap.tests), [106, 20]);
  for (const lane of evaluation.lanes) {
    const result = lane.commandResult;
    assert.equal(result.suiteTap.pass, result.suiteTap.tests);
    assert.equal(result.suiteTap.fail + result.suiteTap.cancelled + result.suiteTap.skipped + result.suiteTap.todo, 0);
    assert.deepEqual(result.mutationReceipt, {
      baseline: 'PASS',
      killed: 31,
      schemaVersion: 'yalken.r24-mutation-receipt.v1',
      score: 1,
      survived: [],
      total: 31
    });
    assert.equal(Object.hasOwn(result.mutationReceipt, 'durationMs'), false);
  }
});

test('every selected runner and test file is bound by normalized repo-relative path and exact bytes', () => {
  const { evaluation } = buildArtifacts(loadInputs(REPO_ROOT), expectedPassResults());
  for (const lane of evaluation.lanes) {
    assert.ok(lane.testFileEvidence.length > 1);
    for (const evidence of lane.testFileEvidence) {
      assert.equal(path.posix.normalize(evidence.repoRelativePath), evidence.repoRelativePath);
      const bytes = fs.readFileSync(path.join(REPO_ROOT, evidence.repoRelativePath));
      assert.equal(evidence.byteLength, bytes.length);
      assert.equal(evidence.sha256, digest(bytes));
    }
  }
});

test('omitting Q0 from the result denominator is rejected', () => {
  assert.throws(() => buildArtifacts(loadInputs(REPO_ROOT), expectedPassResults().slice(0, 1)), /E_RESULT_COUNT/);
});

test('a falsified E0 test denominator is rejected', () => {
  const results = expectedPassResults();
  results[0].suiteTap.tests -= 1;
  assert.throws(() => buildArtifacts(loadInputs(REPO_ROOT), results), /E_LANE_RESULT_DRIFT/);
});

test('a surviving mutation is rejected', () => {
  const results = expectedPassResults();
  results[1].mutationReceipt.survived.push('MUTANT');
  results[1].mutationReceipt.score = 0.9;
  assert.throws(() => buildArtifacts(loadInputs(REPO_ROOT), results), /E_LANE_RESULT_DRIFT/);
});

test('raw plan-state mutation is rejected', () => {
  const inputs = modifiedInputs((candidate) => {
    candidate.planState.value = clone(candidate.planState.value);
    candidate.planState.value.contours.E0_RUNNER_SAFETY_QUARANTINE.state = 'PENDING';
  });
  assert.throws(() => buildArtifacts(inputs, expectedPassResults()), /E_RAW_PLAN_STATE/);
});

test('execution-envelope state forgery is rejected', () => {
  const inputs = modifiedInputs((candidate) => {
    candidate.executionEnvelopes.value = clone(candidate.executionEnvelopes.value);
    candidate.executionEnvelopes.value.nodeEnvelopes.find((entry) => entry.nodeId === 'Q0_TOOLCHAIN_HYGIENE').state = 'DONE';
  });
  assert.throws(() => buildArtifacts(inputs, expectedPassResults()), /E_EXECUTION_ENVELOPE/);
});

test('self-certification before external terminal attestation is rejected', () => {
  const inputs = loadInputs(REPO_ROOT);
  const artifacts = buildArtifacts(inputs, expectedPassResults());
  const forged = clone(artifacts);
  forged.evaluation.lanes[0].stateAtArtifactTime = 'CERTIFIED_CURRENT';
  assert.throws(() => validateArtifacts(forged, inputs, expectedPassResults()), /E_ARTIFACT_SEMANTIC_DRIFT/);
});

test('append-only ledger predecessor and stage admission bindings are exact', () => {
  const inputs = loadInputs(REPO_ROOT);
  const { contract, ledger } = buildArtifacts(inputs, expectedPassResults());
  assert.equal(ledger.c2b2Predecessor.recertificationLedgerDigest, inputs.c2b2Ledger.digest);
  assert.equal(ledger.entries[0].predecessorEntryDigest, inputs.c2b2Ledger.value.entries.at(-1).entryDigest);
  assert.equal(ledger.entries[1].predecessorEntryDigest, ledger.entries[0].entryDigest);
  assert.equal(contract.sourceBindings.stageInstanceDigest, STAGE_INSTANCE_DIGEST);
  assert.equal(contract.sourceBindings.stageAdmissionAttestationDigest, STAGE_ADMISSION_DIGEST);
});

test('C2B3A deterministic artifact compilation preserves the immutable plan-state bytes', () => {
  const before = fs.readFileSync(path.join(REPO_ROOT, PATHS.planState));
  const artifacts = buildArtifacts(loadInputs(REPO_ROOT), expectedPassResults());
  for (const artifact of Object.values(artifacts)) {
    const bytes = canonicalBytes(artifact);
    assert.ok(bytes.equals(canonicalBytes(JSON.parse(bytes.toString('utf8')))));
  }
  const after = fs.readFileSync(path.join(REPO_ROOT, PATHS.planState));
  assert.ok(before.equals(after));
});
