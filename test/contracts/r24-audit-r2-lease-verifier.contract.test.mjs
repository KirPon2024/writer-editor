import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canonicalBytes } from '../../scripts/ops/r24/corrective/canonical-json.mjs';
import { sha256 } from '../../scripts/ops/r24/corrective/audit-r1-corrections.mjs';
import { validateLedger } from '../../scripts/ops/r24/corrective/audit-r2-lease-verifier.mjs';

const load = () => JSON.parse(fs.readFileSync('docs/OPS/R24/CORRECTIVE/AUDIT_R2_LEASE_FENCE_LEDGER_V1.json', 'utf8'));
const rehash = (ledger, type) => {
  const record = ledger.events.find((item) => item.payload.eventType === type);
  record.digest = sha256(canonicalBytes(record.payload));
  return record;
};
test('ledger independently recomputes predecessor release, lease, fence and admission bytes', () => {
  const result = validateLedger(load());
  assert.equal(result.status, 'ACTIVE');
  assert.equal(result.highestEffectiveFencingCounter, 54);
});
test('arbitrary event digest is rejected', () => {
  const ledger = load();
  ledger.events[1].digest = '0'.repeat(64);
  assert.throws(() => validateLedger(ledger), (error) => error.code === 'E_LEDGER_EVENT_DIGEST');
});
test('arbitrary or stale fencing counter is rejected after rehash', () => {
  const ledger = load();
  const acquire = ledger.events.find((item) => item.payload.eventType === 'LEASE_ACQUIRE');
  acquire.payload.fencingCounter = 53;
  acquire.digest = sha256(canonicalBytes(acquire.payload));
  assert.throws(() => validateLedger(ledger), (error) => ['E_LEASE_ACQUIRE_BINDING','E_FENCE_BINDING'].includes(error.code));
});
test('admission binding cannot substitute StageInstance, admission or write-set digests', () => {
  for (const field of ['stageInstanceDigest','stageAdmissionDigest','writeSetDigest']) {
    const ledger = load();
    const binding = ledger.events.find((item) => item.payload.eventType === 'ADMISSION_BINDING');
    binding.payload[field] = '1'.repeat(64);
    binding.digest = sha256(canonicalBytes(binding.payload));
    ledger.effectiveState.admissionBindingEventDigest = binding.digest;
    assert.throws(() => validateLedger(ledger), (error) => error.code.startsWith('E_BOUND_'));
  }
});
test('closure fails without an exact RELEASE event and RELEASED WIP zero', () => {
  assert.throws(() => validateLedger(load(), { requireReleased:true }), (error) => error.code === 'E_RELEASE_MISSING');
  const ledger = load();
  const acquire = ledger.events.find((item) => item.payload.eventType === 'LEASE_ACQUIRE');
  const fence = ledger.events.find((item) => item.payload.eventType === 'FENCE_ADVANCE');
  const payload = {schemaVersion:'AUDIT_R2_LEASE_EVENT_V1',eventType:'RELEASE',authority:'AUDIT_ROUND_2_FINAL_CORRECTION_BRIEF',writerTaskId:'01a04c8d-a686-7a43-b378-1af1eebc5fbb',fencingCounter:54,leaseAcquisitionEventDigest:acquire.digest,fenceEventDigest:fence.digest,status:'RELEASED',wip:1,unpreservedWip:0,releaseReason:'TERMINAL_CLOSURE',programDoneClaimed:false,wp400MutationStarted:false,observedAtUtc:'2026-08-29T17:00:00Z'};
  ledger.events.push({payload,digest:sha256(canonicalBytes(payload))});
  ledger.effectiveState.status = 'RELEASED';
  ledger.effectiveState.wip = 0;
  assert.throws(() => validateLedger(ledger, { requireReleased:true }), (error) => error.code === 'E_RELEASE_STATE');
});
