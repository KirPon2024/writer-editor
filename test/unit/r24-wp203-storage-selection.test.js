'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const decision = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'OPS', 'R24', 'OWNER_GATE_DECISIONS', 'STORAGE_AUTHORITY_ADR_R2_STORAGE_BAKEOFF_V1.json'), 'utf8'));
const {
  STORAGE_SELECTION_SCHEMA_VERSION,
  StorageSelectionError,
  selectStorageRecoveryPlan,
  verifyStorageSelection,
} = require(path.join(ROOT, 'src', 'core', 'storage-selection-v1.cjs'));

const HEAD = 'a'.repeat(40);
const dossier = () => ({
  schemaVersion: 'yalken.storageBakeoff.v1',
  headSha: HEAD,
  selection: 'DEFERRED_TO_WP-203',
  candidates: [
    { candidateId: 'atomic-file', admitted: true, filterCode: '', crashInjected: true, recoveredRevision: 8, tornStateDetected: false, recoveryReadable: true, readBack: 'rev:8', bytesWritten: 40 },
    { candidateId: 'append-ledger', admitted: true, filterCode: '', crashInjected: true, recoveredRevision: 5, tornStateDetected: true, recoveryReadable: true, readBack: 'rev:5', bytesWritten: 640 },
    { candidateId: 'hybrid', admitted: true, filterCode: '', crashInjected: true, recoveredRevision: 8, tornStateDetected: false, recoveryReadable: true, readBack: 'rev:8', bytesWritten: 180 },
    { candidateId: 'sqlite', admitted: false, filterCode: 'E_CANDIDATE_DEPENDENCY' },
  ],
});

test('owner-bound correctness and Pareto filters select atomic truth plus the bounded recovery ledger', () => {
  const selection = selectStorageRecoveryPlan({ dossier: dossier(), ownerDecision: decision, selectionHeadSha: HEAD });
  assert.equal(selection.schemaVersion, STORAGE_SELECTION_SCHEMA_VERSION);
  assert.deepEqual(selection.bakeoff.correctnessAcceptedIds, ['append-ledger', 'atomic-file', 'hybrid']);
  assert.deepEqual(selection.bakeoff.paretoFrontierIds, ['atomic-file']);
  assert.equal(selection.selectedPrimaryStorage.candidateId, 'atomic-file');
  assert.equal(selection.selectedRecoveryLedger.ledgerId, 'recovery-ledger-v1');
  assert.equal(selection.selectedRecoveryLedger.commitTruthCandidateId, 'atomic-file');
  assert.equal(selection.selectedRecoveryLedger.role, 'DERIVED_RECOVERY_EVIDENCE');
  assert.equal(verifyStorageSelection(selection), true);
  assert.equal(Object.isFrozen(selection), true);
  assert.equal(Object.isFrozen(selection.bakeoff.evaluations), true);
});

test('authority is revalidated before candidate evidence can be interpreted', () => {
  for (const mutate of [
    (value) => { value.decision = 'PENDING'; },
    (value) => { value.missionDigest = '0'.repeat(64); },
    (value) => { value.revocationEpoch = 1; },
    (value) => { value.authorizedScope.dependencyAdoption = true; },
    (value) => { value.authorizedScope.liveStoragePathChange = true; },
    (value) => { value.authorizedScope.userDataMigration = true; },
    (value) => { value.authorizedScope.destructiveStorageAction = true; },
  ]) {
    const changed = structuredClone(decision);
    mutate(changed);
    assert.throws(
      () => selectStorageRecoveryPlan({ dossier: dossier(), ownerDecision: changed, selectionHeadSha: HEAD }),
      (error) => error instanceof StorageSelectionError && error.code.startsWith('E_STORAGE_SELECTION_'),
    );
  }
});

test('candidate denominator and registry safety decisions cannot drift', () => {
  const missing = dossier();
  missing.candidates.pop();
  assert.throws(() => selectStorageRecoveryPlan({ dossier: missing, ownerDecision: decision, selectionHeadSha: HEAD }), (e) => e.code === 'E_STORAGE_SELECTION_CANDIDATE_DENOMINATOR');
  const duplicate = dossier();
  duplicate.candidates[3] = { ...duplicate.candidates[0] };
  assert.throws(() => selectStorageRecoveryPlan({ dossier: duplicate, ownerDecision: decision, selectionHeadSha: HEAD }), (e) => e.code === 'E_STORAGE_SELECTION_CANDIDATE_DENOMINATOR');
  const unsafePromoted = dossier();
  unsafePromoted.candidates[3] = { ...unsafePromoted.candidates[0], candidateId: 'sqlite' };
  assert.throws(() => selectStorageRecoveryPlan({ dossier: unsafePromoted, ownerDecision: decision, selectionHeadSha: HEAD }), (e) => e.code === 'E_STORAGE_SELECTION_SAFETY_FILTER_DRIFT');
});

test('correctness filtering runs before Pareto selection', () => {
  const brokenAtomic = dossier();
  brokenAtomic.candidates[0].readBack = 'rev:7';
  const selection = selectStorageRecoveryPlan({ dossier: brokenAtomic, ownerDecision: decision, selectionHeadSha: HEAD });
  assert.deepEqual(selection.bakeoff.correctnessAcceptedIds, ['append-ledger', 'hybrid']);
  assert.deepEqual(selection.bakeoff.paretoFrontierIds, ['hybrid']);
  assert.equal(selection.selectedPrimaryStorage.candidateId, 'hybrid');

  const noCorrect = dossier();
  for (const row of noCorrect.candidates) {
    if (row.admitted) row.recoveryReadable = false;
  }
  assert.throws(() => selectStorageRecoveryPlan({ dossier: noCorrect, ownerDecision: decision, selectionHeadSha: HEAD }), (e) => e.code === 'E_STORAGE_SELECTION_NO_CORRECT_CANDIDATE');
});

test('selection is exact-head bound, deterministic, and tamper evident', () => {
  const first = selectStorageRecoveryPlan({ dossier: dossier(), ownerDecision: decision, selectionHeadSha: HEAD });
  const secondInput = dossier();
  secondInput.candidates.reverse();
  const second = selectStorageRecoveryPlan({ dossier: secondInput, ownerDecision: decision, selectionHeadSha: HEAD });
  assert.equal(first.selectionDigest, second.selectionDigest);
  assert.throws(() => selectStorageRecoveryPlan({ dossier: dossier(), ownerDecision: decision, selectionHeadSha: 'b'.repeat(40) }), (e) => e.code === 'E_STORAGE_SELECTION_DOSSIER_BINDING');
  const tampered = structuredClone(first);
  tampered.selectedPrimaryStorage.candidateId = 'hybrid';
  assert.throws(() => verifyStorageSelection(tampered), (e) => e.code === 'E_STORAGE_SELECTION_RECEIPT_DIGEST');
});
