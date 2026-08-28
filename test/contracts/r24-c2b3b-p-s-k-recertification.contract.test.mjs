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
} from '../../scripts/ops/r24/corrective/c2b3b-p-s-k-recertification.mjs';
import { canonicalBytes } from '../../scripts/ops/r24/corrective/canonical-json.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));

function modifiedInputs(mutator) {
  const inputs = loadInputs(REPO_ROOT);
  mutator(inputs);
  return inputs;
}

test('C2B3B evaluates exactly P0 P1 P2 P3 S0 S1 and K0 on the externally certified C2B3A source snapshot', () => {
  const artifacts = buildArtifacts(loadInputs(REPO_ROOT), expectedPassResults());
  assert.equal(artifacts.contract.productionSnapshot.headSha, SOURCE_HEAD_SHA);
  assert.equal(artifacts.contract.productionSnapshot.treeSha, SOURCE_TREE_SHA);
  assert.deepEqual(artifacts.evaluation.lanes.map((entry) => entry.contourId), LANES.map((entry) => entry.contourId));
  assert.deepEqual(artifacts.evaluation.counts, {
    currentHeadPass: 7,
    falseDoneClaims: 0,
    lanes: 7,
    rawOrEffectiveMutations: 0,
    terminalCertifiedBeforeExternalAttestation: 0,
    tests: 96
  });
});

test('raw and effective P S K lifecycle states remain immutable historical DONE truth', () => {
  const { evaluation } = buildArtifacts(loadInputs(REPO_ROOT), expectedPassResults());
  for (const lane of evaluation.lanes) {
    assert.equal(lane.rawState, 'DONE');
    assert.equal(lane.effectiveState, 'DONE');
    assert.equal(lane.rawStateMutated, false);
    assert.equal(lane.effectiveStateMutated, false);
    assert.equal(lane.priorCertifiedState, 'DONE_UNCERTIFIED');
  }
});

test('all seven lane receipts close exact denominators with zero skipped required evidence', () => {
  const { evaluation } = buildArtifacts(loadInputs(REPO_ROOT), expectedPassResults());
  assert.deepEqual(evaluation.lanes.map((entry) => entry.commandResult.suiteTap.tests), [15, 17, 12, 12, 15, 14, 11]);
  for (const lane of evaluation.lanes) {
    const tap = lane.commandResult.suiteTap;
    assert.equal(tap.pass, tap.tests);
    assert.equal(tap.fail + tap.cancelled + tap.skipped + tap.todo, 0);
  }
});

test('every selected package command and test file is bound by normalized repo-relative path and exact bytes', () => {
  const { evaluation } = buildArtifacts(loadInputs(REPO_ROOT), expectedPassResults());
  for (const lane of evaluation.lanes) {
    assert.equal(lane.testFileEvidence.length, 4);
    for (const evidence of lane.testFileEvidence) {
      assert.equal(path.posix.normalize(evidence.repoRelativePath), evidence.repoRelativePath);
      const bytes = fs.readFileSync(path.join(REPO_ROOT, evidence.repoRelativePath));
      assert.equal(evidence.byteLength, bytes.length);
      assert.equal(evidence.sha256, digest(bytes));
    }
  }
});

test('omitting K0 from the result denominator is rejected', () => {
  assert.throws(() => buildArtifacts(loadInputs(REPO_ROOT), expectedPassResults().slice(0, -1)), /E_RESULT_COUNT/);
});

test('a falsified P1 test denominator is rejected', () => {
  const results = expectedPassResults();
  results[1].suiteTap.tests -= 1;
  assert.throws(() => buildArtifacts(loadInputs(REPO_ROOT), results), /E_LANE_RESULT_DRIFT/);
});

test('a skipped required S1 test is rejected', () => {
  const results = expectedPassResults();
  results[5].suiteTap.pass -= 1;
  results[5].suiteTap.skipped = 1;
  assert.throws(() => buildArtifacts(loadInputs(REPO_ROOT), results), /E_LANE_RESULT_DRIFT/);
});

test('raw plan-state mutation is rejected', () => {
  const inputs = modifiedInputs((candidate) => {
    candidate.planState.value = clone(candidate.planState.value);
    candidate.planState.value.contours.P0_AUTOSAVE_GENERATION.state = 'PENDING';
  });
  assert.throws(() => buildArtifacts(inputs, expectedPassResults()), /E_RAW_PLAN_STATE/);
});

test('execution-envelope state forgery is rejected', () => {
  const inputs = modifiedInputs((candidate) => {
    candidate.executionEnvelopes.value = clone(candidate.executionEnvelopes.value);
    candidate.executionEnvelopes.value.nodeEnvelopes.find((entry) => entry.nodeId === 'K0_COMMAND_PROTOCOL').state = 'DONE';
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
  assert.equal(ledger.c2b3aPredecessor.recertificationLedgerDigest, inputs.c2b3aLedger.digest);
  assert.equal(ledger.entries[0].predecessorEntryDigest, inputs.c2b3aLedger.value.entries.at(-1).entryDigest);
  for (let index = 1; index < ledger.entries.length; index += 1) {
    assert.equal(ledger.entries[index].predecessorEntryDigest, ledger.entries[index - 1].entryDigest);
  }
  assert.equal(contract.sourceBindings.stageInstanceDigest, STAGE_INSTANCE_DIGEST);
  assert.equal(contract.sourceBindings.stageAdmissionAttestationDigest, STAGE_ADMISSION_DIGEST);
});

test('C2B3B deterministic artifact compilation preserves the immutable plan-state bytes', () => {
  const before = fs.readFileSync(path.join(REPO_ROOT, PATHS.planState));
  const artifacts = buildArtifacts(loadInputs(REPO_ROOT), expectedPassResults());
  for (const artifact of Object.values(artifacts)) {
    const bytes = canonicalBytes(artifact);
    assert.ok(bytes.equals(canonicalBytes(JSON.parse(bytes.toString('utf8')))));
  }
  const after = fs.readFileSync(path.join(REPO_ROOT, PATHS.planState));
  assert.ok(before.equals(after));
});
