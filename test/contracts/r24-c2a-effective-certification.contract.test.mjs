import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  PATHS,
  checkArtifacts,
  compileCertificationState,
  createGitOracle,
  loadArtifacts
} from '../../scripts/ops/r24/corrective/c2a-effective-certification.mjs';
import { canonicalBytes, sha256 } from '../../scripts/ops/r24/corrective/canonical-json.mjs';

const REPO_ROOT = process.cwd();
const clone = (value) => structuredClone(value);
const fixture = () => loadArtifacts(REPO_ROOT);
const compile = (artifacts, gitOracle = createGitOracle(REPO_ROOT)) => compileCertificationState({
  ...artifacts,
  gitOracle,
  repoRoot: REPO_ROOT
});

test('C2A semantic oracle compiles immutable raw, effective, and certified state', () => {
  const result = checkArtifacts(REPO_ROOT);
  assert.equal(result.status, 'PASS');
  assert.equal(result.counts.historicalReceipts, 37);
  assert.equal(result.counts.rawDoneHistoricalClaims, 33);
  assert.equal(result.counts.rawPendingHistoricalClaims, 4);
  assert.equal(result.counts.certifiedHistoricalClaims, 0);
  assert.equal(result.counts.doneUncertifiedHistoricalClaims, 33);
  assert.equal(result.counts.certifiedControlStages, 4);
  assert.equal(result.signals.ALL_CERTIFICATION_MUTANTS_KILLED, 'REQUIRES_EXECUTED_TEST_ORACLE');
  assert.equal(result.signals.EXTERNAL_TERMINAL_ATTESTATION_VERIFIED, 'REQUIRES_POST_MERGE_EXTERNAL_C2A_ATTESTATION');
  assert.equal(Object.entries(result.signals).filter(([, value]) => value === true).length, 6);
});

test('all generated C2A JSON artifacts use exact deterministic canonical bytes', () => {
  for (const relativePath of [PATHS.contract, PATHS.ledger, PATHS.historical, PATHS.current, PATHS.bindings, PATHS.approvals]) {
    const bytes = fs.readFileSync(path.join(REPO_ROOT, relativePath));
    assert.deepEqual(bytes, canonicalBytes(JSON.parse(bytes.toString('utf8'))), relativePath);
  }
});

test('raw receipt mutation is killed without rewriting immutable history', () => {
  const artifacts = fixture();
  artifacts.historical = clone(artifacts.historical);
  artifacts.historical.receipts[0].rawStates.mergeState = 'WAITING';
  assert.throws(() => compile(artifacts), /E_(HISTORY_SET_DIGEST|RAW_RECEIPT_FIELD_MISMATCH)/u);
});

test('correction ledger reorder mutant is killed', () => {
  const artifacts = fixture();
  artifacts.ledger = clone(artifacts.ledger);
  artifacts.ledger.corrections.reverse();
  assert.throws(() => compile(artifacts), /E_LEDGER_REORDER/u);
});

test('correction ledger predecessor forgery mutant is killed', () => {
  const artifacts = fixture();
  artifacts.ledger = clone(artifacts.ledger);
  artifacts.ledger.corrections[1].predecessorEntryDigest = '0'.repeat(64);
  assert.throws(() => compile(artifacts), /E_LEDGER_PREDECESSOR/u);
});

test('historical and current certification set conflation mutant is killed', () => {
  const artifacts = fixture();
  artifacts.historical = clone(artifacts.historical);
  artifacts.historical.receipts[0].externalArtifactDigest = `sha256:${'0'.repeat(64)}`;
  artifacts.historical.rawReceiptSetDigest = canonicalDigest(artifacts.historical.receipts);
  assert.throws(() => compile(artifacts), /E_HISTORY_CURRENT_CONFLATION/u);
});

test('stale or mismatched external attestation mutant is killed', () => {
  const artifacts = fixture();
  artifacts.current = clone(artifacts.current);
  artifacts.current.certifications[0].status = 'STALE';
  artifacts.current.currentCertificationSetDigest = '0'.repeat(64);
  assert.throws(() => compile(artifacts), /E_CURRENT_SET_DIGEST|E_CURRENT_ATTESTATION_STALE/u);
});

test('evaluation tree mismatch mutant is killed against actual Git', () => {
  const artifacts = fixture();
  artifacts.current = clone(artifacts.current);
  artifacts.current.certifications[0].evaluationTreeSha = '0'.repeat(40);
  artifacts.current.currentCertificationSetDigest = canonicalDigest(artifacts.current.certifications);
  assert.throws(() => compile(artifacts), /E_GIT_TREE_MISMATCH/u);
});

test('production reachability mutant is killed by the Git ancestry oracle', () => {
  const artifacts = fixture();
  const realOracle = createGitOracle(REPO_ROOT);
  const rejectedSha = artifacts.current.certifications[0].evaluationSha;
  const mutantOracle = {
    ...realOracle,
    isAncestor(ancestor, descendant) {
      if (ancestor === rejectedSha) return false;
      return realOracle.isAncestor(ancestor, descendant);
    }
  };
  assert.throws(() => compile(artifacts, mutantOracle), /E_GIT_NOT_REACHABLE/u);
});

test('missing successor claim binding mutant is killed', () => {
  const artifacts = fixture();
  artifacts.bindings = clone(artifacts.bindings);
  artifacts.bindings.historicalBindings.pop();
  assert.throws(() => compile(artifacts), /E_SUCCESSOR_BINDING_MISSING/u);
});

test('all historical claims remain non-certified while current control stages are certified', () => {
  const artifacts = fixture();
  assert.equal(artifacts.bindings.historicalBindings.some((entry) => entry.certifiedState === 'CERTIFIED_DONE'), false);
  assert.equal(artifacts.bindings.controlStageBindings.every((entry) => entry.certifiedState === 'CERTIFIED_DONE'), true);
  assert.deepEqual(artifacts.current.certifications.map((entry) => entry.stageId), ['B0', 'C1A', 'C1B', 'C1C']);
});

test('pre-v2 unreplayable baseline is preserved as raw history without certification authority', () => {
  const artifacts = fixture();
  assert.equal(artifacts.historical.immutablePlanState.replayBaseline.classification, 'ADOPTED_PRE_V2_UNREPLAYABLE_HISTORY');
  assert.equal(artifacts.ledger.corrections.some((entry) => entry.targetSelector === 'PLAN_STATE_REPLAY_BASELINE_ADOPTED_PRE_V2_UNREPLAYABLE_HISTORY'), true);
});

function canonicalDigest(value) {
  return sha256(canonicalBytes(value));
}
