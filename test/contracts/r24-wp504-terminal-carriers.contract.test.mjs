import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { verifyWp504CandidateBoundSuccessor, verifyWp504TerminalCarriers, verifyWp504TerminalRecord } from '../../scripts/ops/r24/wp504-terminal-verifier.mjs';

const load = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

test('WP-504 terminal carriers form one acyclic 30-row conditional delivery chain', () => {
  const result = verifyWp504TerminalCarriers();
  assert.equal(result.status, 'PASS');
  assert.equal(result.schemaVersion, 'YALKEN_R24_WP504_TERMINAL_CARRIERS_VERIFICATION_V1');
  assert.equal(result.localPassedRows, 26);
  assert.equal(result.externalPredicateRows, 4);
  assert.equal(result.currentLease.fencingCounter, 68);
  assert.equal(result.currentLease.status, 'ACTIVE');
  assert.equal(result.currentLease.wip, 1);
  assert.equal(result.targetLease.status, 'RELEASED');
  assert.equal(result.targetLease.wip, 0);
  assert.equal(result.programDone, false);
});

test('WP-504 frozen registry is verified from its exact Git object, not mutable descendant bytes', () => {
  const registry = load('docs/OPS/R24/CORRECTIVE/AUDIT_R2_CARRIER_REGISTRY_V22.json');
  const inventory = registry.carriers.find((binding) => binding.path === 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json');
  assert.notEqual(sha256(fs.readFileSync(inventory.path)), inventory.sha256);
  assert.equal(verifyWp504CandidateBoundSuccessor().carrierRegistryVerifiedCount, 19);
  assert.throws(
    () => verifyWp504CandidateBoundSuccessor({ carrierRegistryEvaluationSha: 'd6c478c1b68a009e01116077a11892b6bf45daf8' }),
    /E_WP504_V3_CARRIER_REGISTRY_OBJECT/u,
  );
});

test('WP-504 candidate-bound successor closes the exact 35-row conditional chain', () => {
  const result = verifyWp504CandidateBoundSuccessor();
  assert.equal(result.status, 'PASS');
  assert.equal(result.schemaVersion, 'YALKEN_R24_WP504_CANDIDATE_BOUND_TERMINAL_VERIFICATION_V1');
  assert.equal(result.localPassedRows, 31);
  assert.equal(result.externalPredicateRows, 4);
  assert.equal(result.currentLease.fencingCounter, 69);
  assert.equal(result.currentLease.status, 'ACTIVE');
  assert.equal(result.currentLease.wip, 1);
  assert.equal(result.targetLease.status, 'RELEASED');
  assert.equal(result.targetLease.wip, 0);
  assert.equal(result.carrierRegistryEvaluationSha, '4f484b7ddb0ad2fa78614f930b4a8d8ded60201e');
  assert.equal(result.carrierRegistryEvaluationTree, 'baa79829b5e2363845e826c507cda817e9c4b1f8');
  assert.equal(result.carrierRegistryVerifiedCount, 19);
  assert.equal(result.programDone, false);
});

test('WP-504 distinguishes owner source bytes from compiled program bytes', () => {
  const matrix = load('docs/OPS/R24/CORRECTIVE/WP504_ACCEPTANCE_MATRIX_V1.json');
  assert.equal(matrix.sourcePlanRoles.externalSourcePlanDigest, '1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a');
  assert.equal(matrix.sourcePlanRoles.compiledProgramFileDigest, 'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a');
  assert.notEqual(matrix.sourcePlanRoles.externalSourcePlanDigest, matrix.sourcePlanRoles.compiledProgramFileDigest);
});

test('WP-504 conditional receipt preclaims no provider identity', () => {
  const receipt = load('docs/OPS/R24/CORRECTIVE/WP504_TERMINAL_RECEIPT_V1.json');
  assert.equal(receipt.status, 'CONDITIONAL_CERTIFIED_DONE_PENDING_EXTERNAL_DELIVERY');
  assert.deepEqual(receipt.externalDeliveryPredicates.map((row) => row.id), [
    'CANDIDATE_CI_GREEN_AT_EXACT_PR_HEAD',
    'NORMAL_PROTECTED_MERGE',
    'OPS_VECTOR_CLOSE_GREEN_AT_EXACT_MERGE',
    'EXACT_POSTMERGE_CI_GREEN_AT_EXACT_MERGE',
  ]);
  assert.ok(receipt.externalDeliveryPredicates.every((row) => row.status === 'REQUIRED_NOT_PRECLAIMED' && row.providerIdentity === null));
});

test('WP-504 acceptance denominator rejects missing, failed, pending and conflated records', () => {
  const base = load('docs/OPS/R24/CORRECTIVE/WP504_ACCEPTANCE_MATRIX_V1.json');
  const mutants = [
    [(subject) => { subject.rows.pop(); }, /E_WP504_RECORD_DENOMINATOR/],
    [(subject) => { subject.rows[0].status = 'FAIL'; }, /E_WP504_RECORD_LOCAL_PASS|E_WP504_RECORD_PENDING_OR_FAIL/],
    [(subject) => { subject.rows[0].status = 'PENDING'; }, /E_WP504_RECORD_LOCAL_PASS|E_WP504_RECORD_PENDING_OR_FAIL/],
    [(subject) => { subject.sourcePlanRoles.compiledProgramFileDigest = subject.sourcePlanRoles.externalSourcePlanDigest; }, /E_WP504_COMPILED_PROGRAM|E_WP504_SOURCE_ROLES_CONFLATED/],
    [(subject) => { subject.programDone = true; }, /E_WP504_RECORD_STATE/],
  ];
  for (const [mutate, expected] of mutants) {
    const subject = structuredClone(base);
    mutate(subject);
    assert.throws(() => verifyWp504TerminalRecord(subject), expected);
  }
});

test('WP-504 protected-WIP proof keeps the seven dirty identities and complete denominator', () => {
  const release = load('docs/OPS/R24/CORRECTIVE/WP504_LEASE_RELEASE_V1.json');
  assert.equal(release.protectedWipProof.completeDenominator, 254);
  assert.equal(release.protectedWipProof.dirtyDenominator, 7);
  assert.equal(release.protectedWipProof.entriesExact, true);
  assert.equal(release.protectedWipProof.protectedDirtySetExact, true);
  assert.equal(release.protectedWipProof.excludedTaskWorktreeIdentitiesExact, true);
});

test('WP-504 design review binds the rendered responsive evidence without widening product authority', () => {
  const supplement = load('docs/OPS/R24/CORRECTIVE/WP504_TERMINAL_SUPPLEMENT_V1.json');
  assert.equal(supplement.designReview.audit.status, 'PASS_AFTER_ONE_IN_SCOPE_FIX');
  assert.equal(supplement.designReview.heuristic.usabilityScore, 94);
  assert.equal(supplement.designReview.finalize.status, 'BLOCKED_NO_BRIEF');
  assert.equal(supplement.designReview.finalize.blockingForWp504Terminal, false);
  assert.equal(supplement.nextGraphNodeStarted, false);
  assert.equal(supplement.programDone, false);
});
