import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  computeMissionDigest,
  loadMissionContract,
  verifyApprovalReceipt,
  APPROVAL_RECEIPT_SCHEMA_VERSION,
} from '../mission-contract.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'r24-mission-'));

function validContract() {
  const contract = {
    schemaVersion: 'yalken.program-mission.r2.4',
    missionId: 'TEST-MISSION',
    revision: 1,
    ownerIntent: 'test mission intent',
    programId: 'TEST-PROGRAM',
    allowedProfilesBeforeRuntimeApproval: ['SHARED_ASSURANCE_BOOTSTRAP'],
    proposedProfilesAfterApproval: ['WRITER_TRUTH_FOUNDATION'],
    currentMutationScope: ['READ_ONLY_G0'],
    forbiddenScope: ['USER_DOCUMENTS', 'EXISTING_USER_DRIVE_FILES', 'SECRETS', 'PRODUCT_AI', 'CLOUD_TRUTH', 'EXECUTABLE_PLUGINS', 'SAFE_APPLY_WIDENING', 'SECOND_ACTIVE_CONTOUR'],
    deliveryIntent: { commit: true },
    terminalDefinition: 'evidence-bound verdict',
    approvalInvalidatesOnAnyChange: true,
    missionDigest: '0'.repeat(64),
    ownerIntentRecord: { source: 'TEST', captured: true, runtimeAuthority: false },
    ownerApproval: { status: 'REQUIRED_AT_FRESH_G0', approvedDigest: null, approvalArtifactRequired: true, noSelfApproval: true },
    controlPlaneAuthority: {
      status: 'PACKAGE_LEVEL_CONTROL_PLANE_CLOSED_RUNTIME_UNPROVEN',
      runtimeImplemented: false,
      ownerApprovalRequiredAfterAnyChange: true,
      closureDigest: 'a'.repeat(64),
      closureFiles: [
        { path: 'machine/AUTONOMY_CONTROL_PLANE_R2_4.json', sha256: 'b'.repeat(64) },
        { path: 'machine/OWNER_GATE_REGISTRY_R2_4.json', sha256: 'c'.repeat(64) },
        { path: 'machine/EXECUTION_ENVELOPES_R2_4.json', sha256: 'd'.repeat(64) },
        { path: 'schemas/autonomy-control-plane-r2_4.schema.json', sha256: 'e'.repeat(64) },
        { path: 'schemas/owner-gate-registry-r2_4.schema.json', sha256: 'f'.repeat(64) },
        { path: 'schemas/execution-envelopes-r2_4.schema.json', sha256: '0'.repeat(64) },
        { path: 'schemas/selection-receipt-r2_4.schema.json', sha256: '1'.repeat(64) },
        { path: 'schemas/mission-contract-r2_4.schema.json', sha256: '2'.repeat(64) },
      ],
    },
  };
  contract.missionDigest = computeMissionDigest(contract);
  return contract;
}

function approvalFor(digest, overrides = {}) {
  return {
    schemaVersion: APPROVAL_RECEIPT_SCHEMA_VERSION,
    missionDigest: digest,
    approvedDigest: digest,
    status: 'APPROVED',
    approvedBy: 'OWNER',
    approvedAtUtc: '2026-08-20T00:00:00Z',
    noSelfApproval: true,
    ...overrides,
  };
}

test('valid sealed-shape contract loads and digest recomputes exactly', () => {
  const dir = tmp();
  const file = path.join(dir, 'mission.json');
  const contract = validContract();
  fs.writeFileSync(file, JSON.stringify(contract));
  const loaded = loadMissionContract(file);
  assert.equal(loaded.digest, contract.missionDigest);
});

test('sealed contract schema rejects pre-approval tamper (status flip fails schema)', () => {
  const dir = tmp();
  const file = path.join(dir, 'mission.json');
  const contract = validContract();
  contract.ownerApproval.status = 'APPROVED';
  fs.writeFileSync(file, JSON.stringify(contract));
  assert.throws(() => loadMissionContract(file), (e) => e.code === 'E_MISSION_CONTRACT_SCHEMA');
});

test('digest invalid when declared digest does not match recomputed', () => {
  const dir = tmp();
  const file = path.join(dir, 'mission.json');
  const contract = validContract();
  contract.missionDigest = '9'.repeat(64);
  fs.writeFileSync(file, JSON.stringify(contract));
  assert.throws(() => loadMissionContract(file), (e) => e.code === 'E_MISSION_DIGEST_INVALID');
});

test('approval receipt happy path binds exact digest', () => {
  const contract = validContract();
  const receipt = approvalFor(contract.missionDigest);
  const result = verifyApprovalReceipt(contract, receipt, { expectedDigest: contract.missionDigest });
  assert.equal(result.approved, true);
});

test('approval negatives: every binding conjunct fails closed', () => {
  const contract = validContract();
  const digest = contract.missionDigest;
  const other = '5'.repeat(64);
  assert.throws(() => verifyApprovalReceipt(contract, null), (e) => e.code === 'E_MISSION_APPROVAL_MISSING');
  assert.throws(() => verifyApprovalReceipt(contract, approvalFor(digest, { schemaVersion: 'wrong' })), (e) => e.code === 'E_MISSION_APPROVAL_SCHEMA');
  assert.throws(() => verifyApprovalReceipt(contract, approvalFor(digest, { status: 'PENDING' })), (e) => e.code === 'E_MISSION_NOT_APPROVED');
  assert.throws(() => verifyApprovalReceipt(contract, approvalFor(digest, { approvedDigest: other })), (e) => e.code === 'E_MISSION_APPROVAL_BINDING_MISMATCH');
  assert.throws(() => verifyApprovalReceipt(contract, approvalFor(other, { approvedDigest: other })), (e) => e.code === 'E_MISSION_APPROVAL_BINDING_MISMATCH');
  assert.throws(() => verifyApprovalReceipt(contract, approvalFor(digest, { noSelfApproval: false })), (e) => e.code === 'E_MISSION_SELF_APPROVAL_LAW_MISSING');
  assert.throws(() => verifyApprovalReceipt(contract, approvalFor(digest, { approvedBy: '' })), (e) => e.code === 'E_MISSION_APPROVER_MISSING');
  assert.throws(() => verifyApprovalReceipt(contract, approvalFor(digest, { approvedAtUtc: 'not-a-date' })), (e) => e.code === 'E_MISSION_APPROVAL_TIME_INVALID');
  assert.throws(() => verifyApprovalReceipt(contract, approvalFor(digest), { expectedDigest: other }), (e) => e.code === 'E_MISSION_DIGEST_MISMATCH');
  const brokenLaw = validContract();
  brokenLaw.approvalInvalidatesOnAnyChange = true;
  const tampered = { ...brokenLaw, approvalInvalidatesOnAnyChange: false };
  assert.throws(() => verifyApprovalReceipt(tampered, approvalFor(digest)), (e) => e.code === 'E_MISSION_APPROVAL_INVALIDATION_LAW_MISSING');
  const upgraded = validContract();
  upgraded.ownerIntentRecord.runtimeAuthority = true;
  assert.throws(() => verifyApprovalReceipt(upgraded, approvalFor(digest)), (e) => e.code === 'E_MISSION_INTENT_UPGRADED_TO_AUTHORITY');
});
