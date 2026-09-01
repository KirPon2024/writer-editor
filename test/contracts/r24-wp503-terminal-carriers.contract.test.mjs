import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { verifyWp503TerminalCarriers } from '../../scripts/ops/r24/wp503-terminal-verifier.mjs';

const load = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));

test('WP-503 terminal carriers form an acyclic exact-byte chain with a closed 25-row denominator', () => {
  const result = verifyWp503TerminalCarriers();
  assert.equal(result.status, 'PASS');
  assert.equal(result.evidenceStampDenominator, 7);
  assert.equal(result.localPassedRows, 21);
  assert.equal(result.externalPredicateRows, 4);
  assert.equal(result.currentLease.status, 'ACTIVE');
  assert.equal(result.currentLease.wip, 1);
  assert.equal(result.targetLease.status, 'RELEASED');
  assert.equal(result.targetLease.wip, 0);
  assert.match(result.terminalSupplementDigest, /^[0-9a-f]{64}$/u);
  assert.equal(result.programDone, false);
});

test('WP-503 does not preclaim future PR, merge, ops-vector-close or postmerge provider identities', () => {
  const receipt = load('docs/OPS/R24/CORRECTIVE/WP503_TERMINAL_RECEIPT_V1.json');
  assert.equal(receipt.status, 'CONDITIONAL_CERTIFIED_DONE_PENDING_EXTERNAL_DELIVERY');
  assert.deepEqual(receipt.externalDeliveryPredicates.map((row) => row.id), [
    'CANDIDATE_CI_GREEN_AT_EXACT_PR_HEAD',
    'NORMAL_PROTECTED_MERGE',
    'OPS_VECTOR_CLOSE_GREEN_AT_EXACT_MERGE',
    'EXACT_POSTMERGE_CI_GREEN_AT_EXACT_MERGE',
  ]);
  assert.ok(receipt.externalDeliveryPredicates.every((row) => row.status === 'REQUIRED_NOT_PRECLAIMED' && row.providerIdentity === null));
  assert.equal(receipt.singleTerminalPrRule, 'SINGLE_TERMINAL_PR_RULE_V1');
});

test('WP-503 source-plan roles and WP-502 external predecessor remain distinct and exact', () => {
  const receipt = load('docs/OPS/R24/CORRECTIVE/WP503_TERMINAL_RECEIPT_V1.json');
  assert.equal(receipt.sourcePlanRoles.externalSourcePlanDigest, '1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a');
  assert.equal(receipt.sourcePlanRoles.compiledProgramFileDigest, 'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a');
  assert.notEqual(receipt.sourcePlanRoles.externalSourcePlanDigest, receipt.sourcePlanRoles.compiledProgramFileDigest);
  assert.equal(receipt.predecessors.wp502ExternalTerminalReceiptDigest, '9a5b58d2b29336508090d8a5f9e02ee61e4b6e22d7ba5ea137f6b45a7901a687');
  assert.equal(receipt.predecessors.wp502ExternalVerificationDigest, '26105a4c0b8aba232eb538fcb21e96eb5b6247b3cd7f26ad481d9b02b4dcea72');
  assert.equal(receipt.predecessorCorrections.pr1776.candidateSha, '77354cfe994588dc1771f3eded29d1e7e68d703f');
  assert.equal(receipt.predecessorCorrections.pr1777.candidateSha, 'bf3d21072879d276ca3489b0bbead780fb39f596');
});

test('WP-503 protected-WIP before and after carriers preserve the complete privacy-safe entry set', () => {
  const before = load('docs/OPS/R24/CORRECTIVE/WP503_PROTECTED_WIP_BEFORE_V1.json');
  const after = load('docs/OPS/R24/CORRECTIVE/WP503_PROTECTED_WIP_AFTER_V1.json');
  assert.equal(before.completeDenominator, 252);
  assert.equal(after.completeDenominator, 252);
  assert.equal(before.dirtyDenominator, 7);
  assert.equal(after.dirtyDenominator, 7);
  assert.equal(before.snapshotSha256, after.snapshotSha256);
  assert.deepEqual(after.entries, before.entries);
  assert.deepEqual(after.protectedDirtySet, before.protectedDirtySet);
});

test('WP-503 tracked renderer bundle and RELEASE01 successor are explicitly admitted and externally checkable', () => {
  const instance = load('docs/OPS/R24/CORRECTIVE/WP503_MAIN_PRODUCT_STAGE_INSTANCE_V6.json');
  assert.ok(instance.operations.modifyPaths.includes('src/renderer/editor.bundle.js'));
  assert.ok(instance.acceptanceSignals.includes('TRACKED_RENDERER_BUNDLE_EXACT_BUILD'));
  assert.ok(instance.acceptanceSignals.includes('POST_AUDIT_TOOLCHAIN_TRACKED_BUNDLE_SUCCESSOR'));
  assert.ok(instance.acceptanceSignals.includes('WP307_EDITOR_WORDING_HASH_SUCCESSOR'));
  assert.ok(instance.acceptanceSignals.includes('RTK_RELEASE01_WORDING_SURFACE_SUCCESSOR'));
  assert.ok(instance.acceptanceSignals.includes('POST_AUDIT_CERTIFICATION_CHAIN_SUCCESSOR'));
  assert.ok(instance.operations.modifyPaths.includes('test/contracts/rtk-release01-terminal-claims.contract.test.js'));
  assert.ok(instance.operations.createPaths.includes('docs/OPS/R24/CORRECTIVE/WP503_RELEASE01_WORDING_SURFACE_SUCCESSOR_V1.json'));
  assert.ok(instance.operations.modifyPaths.includes('scripts/ops/r24/corrective/post-audit-certification-set.mjs'));
  assert.ok(instance.operations.createPaths.includes('docs/OPS/R24/CORRECTIVE/WP503_POST_AUDIT_CERTIFICATION_SUCCESSOR_V1.json'));
});
