import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { canonicalBytes } from '../../scripts/ops/r24/corrective/canonical-json.mjs';
import {
  CONTOURS,
  PATHS,
  buildArtifacts,
  checkArtifacts,
  expectedPassResults,
  loadInputs,
  validateArtifacts
} from '../../scripts/ops/r24/corrective/c2b2-current-head-recertification.mjs';

const repoRoot = process.cwd();
const clone = (value) => JSON.parse(JSON.stringify(value));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function expectTypedFailure(operation, code = 'E_ARTIFACT_SEMANTIC_DRIFT') {
  assert.throws(operation, (error) => error?.code === code || error?.code === 'E_ARTIFACT_SEMANTIC_DRIFT');
}

test('C2B2 evaluates exactly the four disputed CTR claim sets on the certified C2B1 source snapshot', () => {
  const artifacts = buildArtifacts(loadInputs(repoRoot), expectedPassResults());
  assert.deepEqual(artifacts.evaluation.contours.map((entry) => entry.contourId), [
    'WP-104_BOUNDARY_FALSIFICATION',
    'R2_STORAGE_BAKEOFF',
    'R3_DURABLE_RECOVERY_LEDGER',
    'R4_TRANSACTIONAL_INBOX_OUTBOX'
  ]);
  assert.deepEqual(artifacts.evaluation.counts, {
    currentHeadPass: 4,
    disputedContours: 4,
    falseDoneClaims: 0,
    rawOrEffectiveMutations: 0,
    terminalCertifiedBeforeExternalAttestation: 0
  });
});

test('all four raw and effective lifecycle states remain PENDING and never become false DONE', () => {
  const artifacts = buildArtifacts(loadInputs(repoRoot), expectedPassResults());
  for (const contour of artifacts.evaluation.contours) {
    assert.equal(contour.rawState, 'PENDING');
    assert.equal(contour.effectiveState, 'PENDING');
    assert.equal(contour.priorCertifiedState, 'PENDING_UNCERTIFIED');
    assert.equal(contour.rawStateMutated, false);
    assert.equal(contour.effectiveStateMutated, false);
    assert.equal(contour.stateAtArtifactTime, 'CURRENT_HEAD_PASS_AWAITING_EXTERNAL_TERMINAL_ATTESTATION');
  }
  assert.deepEqual(artifacts.contract.unprovenClaimPolicy, {
    falseDoneForbidden: true,
    rawOrEffectiveDone: 'DONE_UNCERTIFIED',
    rawOrEffectivePending: 'PENDING_UNCERTIFIED'
  });
});

test('test denominators and mutation receipts are exact with zero skips, failures, cancellation or todo', () => {
  const artifacts = buildArtifacts(loadInputs(repoRoot), expectedPassResults());
  const expectedTests = [13, 13, 12, 19];
  for (const [index, contour] of artifacts.evaluation.contours.entries()) {
    assert.equal(contour.commandResult.tests, expectedTests[index]);
    assert.equal(contour.commandResult.pass, expectedTests[index]);
    assert.equal(contour.commandResult.fail, 0);
    assert.equal(contour.commandResult.cancelled, 0);
    assert.equal(contour.commandResult.skipped, 0);
    assert.equal(contour.commandResult.todo, 0);
    assert.deepEqual(contour.commandResult.mutationReceipt, CONTOURS[index].expectedMutationReceipt);
  }
});

test('every source test file is bound by exact repo-relative path, byte length and digest', () => {
  const artifacts = buildArtifacts(loadInputs(repoRoot), expectedPassResults());
  for (const contour of artifacts.evaluation.contours) {
    assert.ok(contour.testFileEvidence.length >= 2);
    for (const evidence of contour.testFileEvidence) {
      const bytes = fs.readFileSync(path.join(repoRoot, evidence.repoRelativePath));
      assert.equal(evidence.byteLength, bytes.length);
      assert.equal(evidence.sha256, digest(bytes));
      assert.equal(path.isAbsolute(evidence.repoRelativePath), false);
    }
  }
});

test('omitting one disputed contour mutant is killed', () => {
  const inputs = loadInputs(repoRoot);
  const results = expectedPassResults();
  const artifacts = buildArtifacts(inputs, results);
  const mutant = clone(artifacts);
  mutant.evaluation.contours.pop();
  mutant.evaluation.counts.disputedContours = 3;
  mutant.evaluation.counts.currentHeadPass = 3;
  expectTypedFailure(() => validateArtifacts(mutant, inputs, results));
});

test('turning one current-head PASS into a synthetic failure or success mismatch is killed', () => {
  const inputs = loadInputs(repoRoot);
  const results = expectedPassResults();
  const artifacts = buildArtifacts(inputs, results);
  const mutant = clone(artifacts);
  mutant.evaluation.contours[0].commandResult.fail = 1;
  mutant.evaluation.contours[0].commandResult.pass = 12;
  expectTypedFailure(() => validateArtifacts(mutant, inputs, results));
});

test('self-certifying a contour before external terminal attestation is killed', () => {
  const inputs = loadInputs(repoRoot);
  const results = expectedPassResults();
  const artifacts = buildArtifacts(inputs, results);
  const mutant = clone(artifacts);
  mutant.evaluation.contours[0].stateAtArtifactTime = 'CERTIFIED_CURRENT';
  mutant.evaluation.counts.terminalCertifiedBeforeExternalAttestation = 1;
  expectTypedFailure(() => validateArtifacts(mutant, inputs, results));
});

test('raw lifecycle mutation mutant is killed', () => {
  const inputs = loadInputs(repoRoot);
  const results = expectedPassResults();
  const artifacts = buildArtifacts(inputs, results);
  const mutant = clone(artifacts);
  mutant.evaluation.contours[0].rawState = 'DONE';
  mutant.evaluation.contours[0].rawStateMutated = true;
  mutant.evaluation.counts.rawOrEffectiveMutations = 1;
  expectTypedFailure(() => validateArtifacts(mutant, inputs, results));
});

test('append-only recertification ledger predecessor forgery mutant is killed', () => {
  const inputs = loadInputs(repoRoot);
  const results = expectedPassResults();
  const artifacts = buildArtifacts(inputs, results);
  const mutant = clone(artifacts);
  mutant.ledger.entries[0].predecessorEntryDigest = '0'.repeat(64);
  expectTypedFailure(() => validateArtifacts(mutant, inputs, results));
});

test('unproven DONE policy weakening mutant is killed', () => {
  const inputs = loadInputs(repoRoot);
  const results = expectedPassResults();
  const artifacts = buildArtifacts(inputs, results);
  const mutant = clone(artifacts);
  mutant.contract.unprovenClaimPolicy.rawOrEffectiveDone = 'DONE';
  mutant.contract.unprovenClaimPolicy.falseDoneForbidden = false;
  expectTypedFailure(() => validateArtifacts(mutant, inputs, results));
});

test('generated C2B2 artifacts use exact deterministic canonical bytes', () => {
  for (const relativePath of [PATHS.contract, PATHS.evaluation, PATHS.ledger, PATHS.approvals]) {
    const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
    assert.ok(bytes.equals(canonicalBytes(JSON.parse(bytes.toString('utf8')))), relativePath);
  }
});

test('C2B2 deterministic check preserves every immutable raw receipt byte', () => {
  const immutablePaths = CONTOURS.map((entry) => entry.receiptPath);
  const before = Object.fromEntries(immutablePaths.map((relativePath) => [relativePath, digest(fs.readFileSync(path.join(repoRoot, relativePath)))]));
  const result = checkArtifacts(repoRoot, { results: expectedPassResults() });
  const after = Object.fromEntries(immutablePaths.map((relativePath) => [relativePath, digest(fs.readFileSync(path.join(repoRoot, relativePath)))]));
  assert.equal(result.status, 'PASS');
  assert.deepEqual(after, before);
});
