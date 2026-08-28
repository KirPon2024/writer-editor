import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  EXPECTED_DIGESTS,
  PATHS,
  SOURCE_HEAD_SHA,
  SOURCE_TREE_SHA,
  buildArtifacts,
  expectedAcceptance,
  loadInputs
} from '../../scripts/ops/r24/corrective/c2b4-package-reconciliation.mjs';
import { canonicalBytes } from '../../scripts/ops/r24/corrective/canonical-json.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const clone = (value) => JSON.parse(JSON.stringify(value));

function modifiedInputs(mutator) {
  const inputs = loadInputs(REPO_ROOT);
  mutator(inputs);
  return inputs;
}

test('C2B4 emits every admitted reconciliation signal without local terminal self-certification', () => {
  const { reconciliation } = buildArtifacts(loadInputs(REPO_ROOT), expectedAcceptance());
  assert.deepEqual(reconciliation.signals, {
    ACTIVE_CLAIM_SET_BOUND: true,
    CURRENT_SOURCE_RECEIPT_BOUND: true,
    EXTERNAL_TERMINAL_ATTESTATION_VERIFIED: 'REQUIRES_POST_MERGE_EXTERNAL_C2B4_ATTESTATION',
    GRAPH_PACKAGE_CONTRADICTIONS_CLOSED: true,
    MUTATION_COUNTS_RECONCILED: true,
    R24C0_PACKAGE_DIGESTS_RECONCILED: true
  });
  assert.equal(reconciliation.programDone, false);
});

test('sealed package manifest and receipts are exact-digest historical evidence only', () => {
  const { reconciliation } = buildArtifacts(loadInputs(REPO_ROOT), expectedAcceptance());
  assert.equal(reconciliation.packageDigestReconciliation.manifestDigest, EXPECTED_DIGESTS.packageManifest);
  assert.equal(reconciliation.packageDigestReconciliation.mutationReceiptDigest, EXPECTED_DIGESTS.packageMutationReceipt);
  assert.equal(reconciliation.packageDigestReconciliation.verificationReceiptDigest, EXPECTED_DIGESTS.packageVerificationReceipt);
  assert.match(reconciliation.packageDigestReconciliation.classification, /HISTORICAL_SEALED_PACKAGE_AND_PLAN_ORACLE_ONLY_NOT_CURRENT_RELEASE/);
});

test('graph contradictions preserve raw history while current certified dispositions fail closed', () => {
  const { reconciliation } = buildArtifacts(loadInputs(REPO_ROOT), expectedAcceptance());
  const rows = new Map(reconciliation.graphReconciliation.map((row) => [row.contourId, row]));
  assert.equal(rows.get('R24C0_SEMANTIC_PACKAGE_CLOSURE').rawState, 'DONE');
  assert.match(rows.get('R24C0_SEMANTIC_PACKAGE_CLOSURE').currentCertifiedDisposition, /UNCERTIFIED_CURRENT/);
  assert.equal(rows.get('PK1_RELEASE_SECURITY_PHYSICAL').currentCertifiedDisposition, 'NOT_READY_SEPARATE_PHYSICAL_ENVELOPE_REQUIRED');
  assert.equal(rows.get('V3_PACKAGE_CLAIM_COMPILER').currentCertifiedDisposition, 'NOT_READY_NO_PROGRAM_OR_RELEASE_PROMOTION');
});

test('mutation denominators remain distinct and the sealed 138 never becomes implementation coverage', () => {
  const { reconciliation } = buildArtifacts(loadInputs(REPO_ROOT), expectedAcceptance());
  const mutation = reconciliation.mutationCountReconciliation;
  assert.equal(mutation.aggregationForbidden, true);
  assert.equal(mutation.productRepositoryImplementationMutantsClaimedBySealedReceipt, 0);
  assert.deepEqual(mutation.classes.map((entry) => [entry.classId, entry.total, entry.killed, entry.survived]), [
    ['SEALED_PACKAGE_AND_PLAN_ORACLE_MUTANTS', 138, 138, 0],
    ['PK0_IMPLEMENTATION_MUTANTS', 7, 7, 0],
    ['PK1_CLASSIFIER_MUTANTS', 8, 8, 0],
    ['V3_COMPILER_MUTANTS', 9, 9, 0]
  ]);
});

test('current source receipt binds the full denominator and exact current plan-state bytes', () => {
  const { reconciliation } = buildArtifacts(loadInputs(REPO_ROOT), expectedAcceptance());
  assert.equal(reconciliation.sourceReceiptBinding.currentPlanStateDigest, EXPECTED_DIGESTS.planState);
  assert.equal(reconciliation.sourceReceiptBinding.receiptDigest, EXPECTED_DIGESTS.planStateSourceReceipt);
  assert.equal(reconciliation.sourceReceiptBinding.receiptMatchesCurrentPlanState, true);
  assert.equal(reconciliation.sourceReceiptBinding.fullNodeDenominator, 109);
});

test('active claim set keeps package release and Program verdicts non-PASS', () => {
  const { activeClaimSet } = buildArtifacts(loadInputs(REPO_ROOT), expectedAcceptance());
  const claims = new Map(activeClaimSet.claims.map((entry) => [entry.claimId, entry]));
  assert.equal(claims.get('PACKAGED_RELEASE_SECURITY').claimState, 'NOT_READY');
  assert.equal(claims.get('PROGRAM').claimState, 'NEEDS_MORE_EVIDENCE');
  assert.ok(activeClaimSet.claims.every((entry) => entry.currentReleaseClaim === false));
  assert.ok(activeClaimSet.nonClaims.includes('NO_RELEASE_PUBLICATION'));
});

test('current PK0 PK1 and V3 acceptance denominators are exact with zero required skips', () => {
  const { reconciliation } = buildArtifacts(loadInputs(REPO_ROOT), expectedAcceptance());
  assert.deepEqual(reconciliation.activeCurrentEvidence.suites.map((entry) => entry.suiteTap.tests), [6, 7, 10]);
  for (const suite of reconciliation.activeCurrentEvidence.suites) {
    assert.equal(suite.suiteTap.pass, suite.suiteTap.tests);
    assert.equal(suite.suiteTap.fail + suite.suiteTap.cancelled + suite.suiteTap.skipped + suite.suiteTap.todo, 0);
  }
});

test('package manifest semantic drift is rejected even if a caller retains the old digest field', () => {
  const inputs = modifiedInputs((candidate) => {
    candidate.packageManifest.value = clone(candidate.packageManifest.value);
    candidate.packageManifest.value.fileCount = 306;
  });
  assert.throws(() => buildArtifacts(inputs, expectedAcceptance()), /E_PACKAGE_MANIFEST/);
});

test('sealed mutation receipt cannot be promoted into product implementation mutant coverage', () => {
  const inputs = modifiedInputs((candidate) => {
    candidate.packageMutationReceipt.value = clone(candidate.packageMutationReceipt.value);
    candidate.packageMutationReceipt.value.productRepositoryImplementationMutantsExecuted = 138;
  });
  assert.throws(() => buildArtifacts(inputs, expectedAcceptance()), /E_MUTATION_CLASS_CONFLATION/);
});

test('raw PK1 graph promotion is rejected instead of being normalized to release readiness', () => {
  const inputs = modifiedInputs((candidate) => {
    candidate.planState.value = clone(candidate.planState.value);
    candidate.planState.value.contours.PK1_RELEASE_SECURITY_PHYSICAL.state = 'DONE';
  });
  assert.throws(() => buildArtifacts(inputs, expectedAcceptance()), /E_GRAPH_STATE/);
});

test('release publication or signing promotion fails normalized acceptance binding', () => {
  const acceptance = expectedAcceptance();
  acceptance.normalizedCurrentClaims.releasePublication = true;
  acceptance.normalizedCurrentClaims.signingOrNotarizationPass = true;
  assert.throws(() => buildArtifacts(loadInputs(REPO_ROOT), acceptance), /E_ACCEPTANCE_DRIFT/);
});

test('deterministic artifact compilation preserves plan state and binds the certified source snapshot', () => {
  const before = fs.readFileSync(path.join(REPO_ROOT, PATHS.planState));
  const artifacts = buildArtifacts(loadInputs(REPO_ROOT), expectedAcceptance());
  assert.equal(artifacts.contract.productionSnapshot.headSha, SOURCE_HEAD_SHA);
  assert.equal(artifacts.contract.productionSnapshot.treeSha, SOURCE_TREE_SHA);
  for (const artifact of Object.values(artifacts)) {
    const bytes = canonicalBytes(artifact);
    assert.ok(bytes.equals(canonicalBytes(JSON.parse(bytes.toString('utf8')))));
  }
  assert.ok(before.equals(fs.readFileSync(path.join(REPO_ROOT, PATHS.planState))));
});
