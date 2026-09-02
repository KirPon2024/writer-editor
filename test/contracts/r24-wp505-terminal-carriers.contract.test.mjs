import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORRECTIVE = path.join(ROOT, 'docs/OPS/R24/CORRECTIVE');
const EVIDENCE = path.join(ROOT, 'docs/OPS/R24/EVIDENCE');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const read = (base, name) => JSON.parse(fs.readFileSync(path.join(base, name), 'utf8'));
const digestFile = (relative) => sha256(fs.readFileSync(path.join(ROOT, relative)));
const SOURCE = '1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a';
const PROGRAM = 'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a';

function assertSourceRoles(value) {
  assert.equal(value.sourcePlanRoles.externalSourcePlanDigest, SOURCE);
  assert.equal(value.sourcePlanRoles.compiledProgramFileDigest, PROGRAM);
  assert.equal(value.sourcePlanRoles.rolesDistinct, true);
  assert.notEqual(SOURCE, PROGRAM);
}

test('WP-505 terminal carriers form one acyclic exact-byte conditional delivery chain', () => {
  const authority = read(CORRECTIVE, 'WP505_MAIN_PRODUCT_OWNER_AUTHORITY_AMENDMENT_V1.json');
  const instance = read(CORRECTIVE, 'WP505_MAIN_PRODUCT_STAGE_INSTANCE_V1.json');
  const admission = read(CORRECTIVE, 'WP505_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json');
  const registry = read(CORRECTIVE, 'WP505_CARRIER_REGISTRY_V1.json');
  const acceptance = read(CORRECTIVE, 'WP505_ACCEPTANCE_MATRIX_V1.json');
  const effective = read(CORRECTIVE, 'WP505_EFFECTIVE_STATE_V1.json');
  const stageRegistry = read(CORRECTIVE, 'WP505_STAGE_REGISTRY_V1.json');
  const lease = read(CORRECTIVE, 'WP505_LEASE_RELEASE_V1.json');
  const terminal = read(CORRECTIVE, 'WP505_TERMINAL_RECEIPT_V1.json');
  const supplement = read(CORRECTIVE, 'WP505_TERMINAL_SUPPLEMENT_V1.json');
  for (const carrier of [registry, acceptance, effective, stageRegistry, lease, terminal, supplement]) assertSourceRoles(carrier);
  assert.equal(admission.authorityDigest, digestFile('docs/OPS/R24/CORRECTIVE/WP505_MAIN_PRODUCT_OWNER_AUTHORITY_AMENDMENT_V1.json'));
  assert.equal(admission.stageInstanceDigest, digestFile('docs/OPS/R24/CORRECTIVE/WP505_MAIN_PRODUCT_STAGE_INSTANCE_V1.json'));
  assert.equal(authority.stageId, 'WP-505_REGISTER_AND_ASK');
  assert.equal(instance.lease.fencingCounter, 70);
  for (const carrier of registry.carriers) assert.equal(digestFile(carrier.path), carrier.sha256, carrier.path);
  assert.equal(acceptance.bindings.carrierRegistryDigest, digestFile('docs/OPS/R24/CORRECTIVE/WP505_CARRIER_REGISTRY_V1.json'));
  assert.equal(effective.bindings.acceptanceMatrixDigest, digestFile('docs/OPS/R24/CORRECTIVE/WP505_ACCEPTANCE_MATRIX_V1.json'));
  assert.equal(stageRegistry.bindings.effectiveStateDigest, digestFile('docs/OPS/R24/CORRECTIVE/WP505_EFFECTIVE_STATE_V1.json'));
  assert.equal(lease.bindings.stageRegistryDigest, digestFile('docs/OPS/R24/CORRECTIVE/WP505_STAGE_REGISTRY_V1.json'));
  assert.equal(terminal.bindings.leaseReleaseDigest, digestFile('docs/OPS/R24/CORRECTIVE/WP505_LEASE_RELEASE_V1.json'));
  assert.equal(supplement.bindings.terminalReceiptDigest, digestFile('docs/OPS/R24/CORRECTIVE/WP505_TERMINAL_RECEIPT_V1.json'));
});

test('WP-505 acceptance denominator is closed and preclaims no external provider identity', () => {
  const acceptance = read(CORRECTIVE, 'WP505_ACCEPTANCE_MATRIX_V1.json');
  const terminal = read(CORRECTIVE, 'WP505_TERMINAL_RECEIPT_V1.json');
  const lease = read(CORRECTIVE, 'WP505_LEASE_RELEASE_V1.json');
  assert.equal(acceptance.rowCount, acceptance.rows.length);
  assert.equal(acceptance.localPassedRowCount + acceptance.externalPredicateRowCount, acceptance.rowCount);
  assert.equal(acceptance.failedRowCount, 0);
  assert.equal(acceptance.pendingRowCount, 0);
  assert.equal(acceptance.rows.filter((row) => row.status === 'PASS').length, acceptance.localPassedRowCount);
  assert.equal(acceptance.rows.filter((row) => row.status === 'REQUIRED_EXTERNAL_PREDICATE').length, acceptance.externalPredicateRowCount);
  assert.equal(terminal.externalDeliveryPredicates.length, acceptance.externalPredicateRowCount);
  for (const predicate of terminal.externalDeliveryPredicates) {
    assert.equal(predicate.status, 'REQUIRED_NOT_PRECLAIMED');
    assert.equal(predicate.providerIdentity, null);
  }
  assert.deepEqual(lease.currentLease, { fencingCounter: 70, status: 'ACTIVE', wip: 1, predecessorReleaseDigest: 'ee469e4a70fbaf7701ab110e94da4e8e3f6632a98d69e55280a81abe388b7156' });
  assert.deepEqual(lease.targetLease, { fencingCounter: 70, status: 'RELEASED', wip: 0, transition: 'ACTIVE_WIP_1_TO_RELEASED_WIP_0' });
  assert.equal(terminal.nextGraphNodeStarted, false);
  assert.equal(terminal.programDone, false);
});

test('WP-505 evidence closes four local classes and leaves independent exact-head external', () => {
  const names = [
    'ES-R24-WP-505-REGISTER-ASK-MODEL.json',
    'ES-R24-WP-505-REGISTER-ASK-CONTRACT.json',
    'ES-R24-WP-505-REGISTER-ASK-INTEGRATION.json',
    'ES-R24-WP-505-REGISTER-ASK-MUTANTS.json',
  ];
  const stamps = names.map((name) => read(EVIDENCE, name));
  assert.deepEqual(stamps.map((stamp) => stamp.test.evidenceClass), ['MODEL', 'CONTRACT', 'INTEGRATION', 'IMPLEMENTATION_MUTANTS']);
  for (const stamp of stamps) {
    assert.equal(stamp.schemaVersion, 'EvidenceStampV2');
    assert.equal(stamp.claim.verdict, 'PASS');
    assert.equal(stamp.test.failed, 0);
    assert.equal(stamp.test.skipped, 0);
    assertSourceRoles(stamp.artifact);
  }
  const acceptance = read(CORRECTIVE, 'WP505_ACCEPTANCE_MATRIX_V1.json');
  assert.equal(acceptance.rows.find((row) => row.id === 'INDEPENDENT_EXACT_HEAD').status, 'REQUIRED_EXTERNAL_PREDICATE');
});

test('WP-505 hostile terminal mutations fail the acceptance and lease laws', () => {
  const acceptance = structuredClone(read(CORRECTIVE, 'WP505_ACCEPTANCE_MATRIX_V1.json'));
  acceptance.rows[0].status = 'PENDING';
  assert.notEqual(acceptance.rows.filter((row) => row.status === 'PASS').length, acceptance.localPassedRowCount);
  const lease = structuredClone(read(CORRECTIVE, 'WP505_LEASE_RELEASE_V1.json'));
  lease.targetLease.wip = 1;
  assert.notDeepEqual(lease.targetLease, { fencingCounter: 70, status: 'RELEASED', wip: 0, transition: 'ACTIVE_WIP_1_TO_RELEASED_WIP_0' });
  const terminal = structuredClone(read(CORRECTIVE, 'WP505_TERMINAL_RECEIPT_V1.json'));
  terminal.externalDeliveryPredicates[0].providerIdentity = { runId: 1 };
  assert.notEqual(terminal.externalDeliveryPredicates[0].providerIdentity, null);
});
