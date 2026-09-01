import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { verifyWp502TerminalCarriers } from '../../scripts/ops/r24/wp502-terminal-verifier.mjs';

const load = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

test('WP-502 terminal carriers form an acyclic exact-byte chain with a closed 20-row denominator', () => {
  const result = verifyWp502TerminalCarriers();
  assert.equal(result.status, 'PASS');
  assert.equal(result.evidenceStampDenominator, 7);
  assert.equal(result.localPassedRows, 16);
  assert.equal(result.externalPredicateRows, 4);
  assert.equal(result.currentLease.status, 'ACTIVE');
  assert.equal(result.currentLease.wip, 1);
  assert.equal(result.targetLease.status, 'RELEASED');
  assert.equal(result.targetLease.wip, 0);
  assert.equal(result.programDone, false);
});

test('WP-502 does not preclaim future PR, merge, ops-vector-close or postmerge provider identities', () => {
  const receipt = load('docs/OPS/R24/CORRECTIVE/WP502_TERMINAL_RECEIPT_V1.json');
  assert.equal(receipt.status, 'CONDITIONAL_CERTIFIED_DONE_PENDING_EXTERNAL_DELIVERY');
  assert.deepEqual(receipt.externalDeliveryPredicates.map((row) => row.id), [
    'CANDIDATE_CI_GREEN_AT_EXACT_PR_HEAD',
    'NORMAL_PROTECTED_MERGE',
    'OPS_VECTOR_CLOSE_GREEN_AT_EXACT_MERGE',
    'EXACT_POSTMERGE_CI_GREEN_AT_EXACT_MERGE',
  ]);
  assert.ok(receipt.externalDeliveryPredicates.every((row) => row.status === 'REQUIRED_NOT_PRECLAIMED' && row.providerIdentity === null));
  assert.equal(receipt.singleTerminalPrRule, 'SINGLE_TERMINAL_PR_RULE_V1');
  assert.equal(receipt.programDone, false);
});

test('WP-502 source-plan roles and predecessor identities remain distinct and exact', () => {
  const receipt = load('docs/OPS/R24/CORRECTIVE/WP502_TERMINAL_RECEIPT_V1.json');
  assert.equal(receipt.sourcePlanRoles.externalSourcePlanDigest, '1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a');
  assert.equal(receipt.sourcePlanRoles.compiledProgramFileDigest, 'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a');
  assert.notEqual(receipt.sourcePlanRoles.externalSourcePlanDigest, receipt.sourcePlanRoles.compiledProgramFileDigest);
  assert.equal(receipt.predecessors.wp501FinalTerminalReceiptDigest, 'f087f11d70cce4a83aa152f09b537fe0240394bcf8f252df62e3b83793d29234');
  assert.equal(receipt.predecessorCorrections.pr1776.candidateSha, '77354cfe994588dc1771f3eded29d1e7e68d703f');
  assert.equal(receipt.predecessorCorrections.pr1777.candidateSha, 'bf3d21072879d276ca3489b0bbead780fb39f596');
});

test('WP-502 protected-WIP before and after carriers preserve the complete privacy-safe entry set', () => {
  const beforePath = 'docs/OPS/R24/CORRECTIVE/WP502_PROTECTED_WIP_BEFORE_V1.json';
  const afterPath = 'docs/OPS/R24/CORRECTIVE/WP502_PROTECTED_WIP_AFTER_V1.json';
  const before = load(beforePath), after = load(afterPath);
  assert.equal(before.completeDenominator, 252);
  assert.equal(after.completeDenominator, 252);
  assert.equal(before.dirtyDenominator, 7);
  assert.equal(after.dirtyDenominator, 7);
  assert.deepEqual(after.entries, before.entries);
  assert.deepEqual(after.protectedDirtySet, before.protectedDirtySet);
  assert.equal(hash(fs.readFileSync(beforePath)), '569ec2a9cc9cd02fdece8503b531787b31b48f74752a3c4cbd2e22a1553ffd7b');
});
