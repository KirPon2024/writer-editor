import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { canonicalBytes } from '../../scripts/ops/r24/corrective/canonical-json.mjs';
import {
  PATHS,
  buildArtifacts,
  checkArtifacts,
  loadInputs,
  validateArtifacts
} from '../../scripts/ops/r24/corrective/c2b1-affected-claim-invalidation.mjs';

const repoRoot = process.cwd();
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));

function expectTypedFailure(operation, code) {
  assert.throws(operation, (error) => error?.code === code || error?.code === 'E_ARTIFACT_SEMANTIC_DRIFT');
}

test('C2B1 compiles all eight mandatory defect classes and all 37 historical claims', () => {
  const artifacts = buildArtifacts(loadInputs(repoRoot));
  assert.equal(artifacts.map.defects.length, 8);
  assert.deepEqual(artifacts.map.defects.map((entry) => entry.defectClass), [
    'WP-201',
    'MIGRATION',
    'TEXT_FOLD',
    'WRITER_HOME',
    'IPC',
    'STALE_OR_MUTABLE_EVIDENCE',
    'CI_OMISSION',
    'NON_HERMETIC_BUILD'
  ]);
  assert.deepEqual(artifacts.map.counts, {
    affectedByAtLeastOneDefect: 37,
    historicalClaims: 37,
    independentProofExceptions: 0,
    invalidatedDoneClaims: 33,
    rawDoneClaims: 33,
    rawPendingClaims: 4
  });
});

test('domain defect closures have exact deterministic affected-claim denominators', () => {
  const artifacts = buildArtifacts(loadInputs(repoRoot));
  const counts = Object.fromEntries(artifacts.map.defects.map((entry) => [entry.defectClass, entry.affectedClaimCount]));
  assert.deepEqual(counts, {
    'WP-201': 16,
    MIGRATION: 21,
    TEXT_FOLD: 22,
    WRITER_HOME: 9,
    IPC: 36,
    STALE_OR_MUTABLE_EVIDENCE: 37,
    CI_OMISSION: 37,
    NON_HERMETIC_BUILD: 37
  });
});

test('raw and effective lifecycle state remain unchanged while done certification authority is invalidated', () => {
  const artifacts = buildArtifacts(loadInputs(repoRoot));
  for (const claim of artifacts.map.claims) {
    assert.equal(claim.rawStateMutated, false);
    assert.equal(claim.effectiveStateMutated, false);
    assert.equal(claim.rawState, claim.effectiveState);
    if (claim.rawState === 'DONE') {
      assert.equal(claim.certifiedStateBefore, 'DONE_UNCERTIFIED');
      assert.equal(claim.certifiedStateAfter, 'DONE_UNCERTIFIED_INVALIDATED');
      assert.equal(claim.invalidationDisposition, 'CERTIFICATION_AUTHORITY_INVALIDATED');
    } else {
      assert.equal(claim.certifiedStateBefore, 'PENDING_UNCERTIFIED');
      assert.equal(claim.certifiedStateAfter, 'PENDING_UNCERTIFIED');
      assert.equal(claim.invalidationDisposition, 'NO_DONE_CLAIM_TO_INVALIDATE');
    }
  }
});

test('independent-proof exception set is explicit and empty without matching current external proof', () => {
  const artifacts = buildArtifacts(loadInputs(repoRoot));
  assert.deepEqual(artifacts.map.independentProofExceptions, []);
  assert.ok(artifacts.map.defects.every((entry) => entry.independentProofExceptions.length === 0));
  assert.ok(artifacts.map.claims.every((entry) => entry.independentProofException === null));
});

test('omitting a mandatory defect class mutant is killed', () => {
  const inputs = loadInputs(repoRoot);
  const artifacts = buildArtifacts(inputs);
  const mutant = clone(artifacts);
  mutant.map.defects = mutant.map.defects.filter((entry) => entry.defectClass !== 'IPC');
  expectTypedFailure(() => validateArtifacts(mutant, inputs), 'E_ARTIFACT_SEMANTIC_DRIFT');
});

test('omitting one affected dependent claim mutant is killed', () => {
  const inputs = loadInputs(repoRoot);
  const artifacts = buildArtifacts(inputs);
  const mutant = clone(artifacts);
  const wp201 = mutant.map.defects.find((entry) => entry.defectClass === 'WP-201');
  wp201.affectedClaimIds.pop();
  wp201.affectedClaimCount -= 1;
  expectTypedFailure(() => validateArtifacts(mutant, inputs), 'E_ARTIFACT_SEMANTIC_DRIFT');
});

test('raw done rewrite mutant is killed', () => {
  const inputs = loadInputs(repoRoot);
  const artifacts = buildArtifacts(inputs);
  const mutant = clone(artifacts);
  const claim = mutant.map.claims.find((entry) => entry.rawState === 'DONE');
  claim.rawState = 'PENDING';
  claim.rawStateMutated = true;
  expectTypedFailure(() => validateArtifacts(mutant, inputs), 'E_ARTIFACT_SEMANTIC_DRIFT');
});

test('fabricated independent-proof exception mutant is killed', () => {
  const inputs = loadInputs(repoRoot);
  const artifacts = buildArtifacts(inputs);
  const mutant = clone(artifacts);
  mutant.map.independentProofExceptions.push({
    claimId: mutant.map.claims[0].claimId,
    proofDigest: '0'.repeat(64),
    status: 'VERIFIED'
  });
  mutant.map.claims[0].independentProofException = '0'.repeat(64);
  expectTypedFailure(() => validateArtifacts(mutant, inputs), 'E_ARTIFACT_SEMANTIC_DRIFT');
});

test('reversed dependency graph mutant is killed by affected-claim denominator', () => {
  const baselineInputs = loadInputs(repoRoot);
  const baselineArtifacts = buildArtifacts(baselineInputs);
  const mutantProgram = clone(baselineInputs.executableProgram.value);
  const wp202 = mutantProgram.nodes.find((entry) => entry.id === 'WP-202_LEGACY_STRANGLER');
  wp202.dependsOn = wp202.dependsOn.filter((entry) => entry !== 'WP-201_PROJECT_TRANSACTION');
  const mutantInputs = {
    ...baselineInputs,
    executableProgram: { ...baselineInputs.executableProgram, value: mutantProgram }
  };
  expectTypedFailure(() => validateArtifacts(baselineArtifacts, mutantInputs), 'E_AFFECTED_COUNT');
});

test('append-only ledger predecessor forgery mutant is killed', () => {
  const inputs = loadInputs(repoRoot);
  const artifacts = buildArtifacts(inputs);
  const mutant = clone(artifacts);
  mutant.ledger.entries[0].predecessorEntryDigest = '0'.repeat(64);
  expectTypedFailure(() => validateArtifacts(mutant, inputs), 'E_ARTIFACT_SEMANTIC_DRIFT');
});

test('CI omission and non-hermetic build invalidate every historical claim', () => {
  const artifacts = buildArtifacts(loadInputs(repoRoot));
  for (const defectClass of ['CI_OMISSION', 'NON_HERMETIC_BUILD']) {
    const defect = artifacts.map.defects.find((entry) => entry.defectClass === defectClass);
    assert.equal(defect.affectedClaimCount, 37);
    assert.equal(defect.independentProofExceptions.length, 0);
    assert.equal(defect.invalidatedDoneClaimCount, 33);
  }
});

test('source evidence references resolve for every claim without publishing local paths', () => {
  const artifacts = buildArtifacts(loadInputs(repoRoot));
  assert.ok(artifacts.map.claims.every((entry) => entry.sourceEvidenceStampId.startsWith('ES-R24-')));
  assert.ok(artifacts.map.defects.every((entry) => entry.pathlessCapabilityIds.every((id) => id.startsWith('CAP_R24_REPRO_'))));
  assert.equal(JSON.stringify(artifacts).includes('/private/'), false);
  assert.equal(JSON.stringify(artifacts).includes('/Volumes/'), false);
  assert.equal(JSON.stringify(artifacts).includes('/Users/'), false);
});

test('generated C2B1 artifacts use exact deterministic canonical bytes', () => {
  for (const relativePath of [PATHS.contract, PATHS.map, PATHS.ledger, PATHS.approvals]) {
    const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
    assert.ok(bytes.equals(canonicalBytes(JSON.parse(bytes.toString('utf8')))), relativePath);
  }
});

test('C2B1 check preserves every immutable C2A source byte', () => {
  const immutablePaths = [PATHS.c2aBindings, PATHS.c2aCurrent, PATHS.c2aHistorical, PATHS.c2aLedger];
  const before = Object.fromEntries(immutablePaths.map((relativePath) => [relativePath, digest(fs.readFileSync(path.join(repoRoot, relativePath)))]));
  const result = checkArtifacts(repoRoot);
  const after = Object.fromEntries(immutablePaths.map((relativePath) => [relativePath, digest(fs.readFileSync(path.join(repoRoot, relativePath)))]));
  assert.equal(result.status, 'PASS');
  assert.deepEqual(after, before);
});
