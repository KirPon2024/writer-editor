#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';
import { canonicalBytes, canonicalize, readCanonicalJson } from './canonical-json.mjs';
import { assert, assertClosedObject, assertHex, sha256 } from './audit-r1-corrections.mjs';

const EVENT_KEYS = Object.freeze({
  PREDECESSOR_RELEASE: ['admissionIntentDigest','authority','eventType','fencingCounter','observedAtUtc','priorBindingCarrierDigest','priorFenceDigest','priorLeaseDigest','schemaVersion','transition','unpreservedWip','wipPreserved','writerTaskId'].filter((key) => key !== 'admissionIntentDigest'),
  LEASE_ACQUIRE: ['admissionIntentDigest','authority','baseSha','branch','eventType','fencingCounter','observedAtUtc','oneWriter','predecessorReleaseEventDigest','schemaVersion','status','treeSha','wip','writerTaskId'],
  FENCE_ADVANCE: ['authority','eventType','fencingCounter','leaseAcquisitionEventDigest','observedAtUtc','previousFenceDigest','previousFencingCounter','schemaVersion','status','writerTaskId'],
  ADMISSION_BINDING: ['authority','eventType','fenceEventDigest','fencingCounter','leaseAcquisitionEventDigest','observedAtUtc','schemaVersion','stageAdmissionDigest','stageInstanceDigest','status','writeSetDigest','writerTaskId'],
  RELEASE: ['authority','eventType','fenceEventDigest','fencingCounter','leaseAcquisitionEventDigest','observedAtUtc','programDoneClaimed','releaseReason','schemaVersion','status','unpreservedWip','wip','wp400MutationStarted','writerTaskId'],
});
const TOP_KEYS = ['authority','closureRule','effectiveState','events','highestEffectiveFencingCounter','importedLegacyClaim','ownerAuthorityBindingDigest','schemaVersion'];

export function validateLedger(ledger, { root = process.cwd(), requireReleased = false } = {}) {
  assertClosedObject(ledger, TOP_KEYS, TOP_KEYS, 'leaseLedger');
  assert(ledger.schemaVersion === 'AUDIT_R2_LEASE_FENCE_LEDGER_V1', 'E_LEDGER_SCHEMA', ledger.schemaVersion);
  assert(ledger.authority === 'AUDIT_ROUND_2_FINAL_CORRECTION_BRIEF', 'E_LEDGER_AUTHORITY', ledger.authority);
  assert(ledger.ownerAuthorityBindingDigest === 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6', 'E_OWNER_BINDING_MISMATCH', ledger.ownerAuthorityBindingDigest);
  assertClosedObject(ledger.importedLegacyClaim, ['carrierDigest','carrierPath','fenceDigest','fencingCounter','leaseDigest','status'], ['carrierDigest','carrierPath','fenceDigest','fencingCounter','leaseDigest','status'], 'importedLegacyClaim');
  assert(ledger.importedLegacyClaim.fencingCounter === 53 && ledger.importedLegacyClaim.status === 'ACTIVE_DIGEST_ONLY_UNVERIFIED', 'E_LEGACY_STATE', ledger.importedLegacyClaim.status);
  const priorBytes = fs.readFileSync(`${root}/${ledger.importedLegacyClaim.carrierPath}`);
  assert(sha256(priorBytes) === ledger.importedLegacyClaim.carrierDigest, 'E_LEGACY_CARRIER_DIGEST', ledger.importedLegacyClaim.carrierDigest);
  assert(Array.isArray(ledger.events) && ledger.events.length >= 4, 'E_LEDGER_EVENT_COUNT', ledger.events?.length);
  const byType = new Map();
  for (const [index, record] of ledger.events.entries()) {
    assertClosedObject(record, ['digest','payload'], ['digest','payload'], `events.${index}`);
    const event = record.payload;
    assert(EVENT_KEYS[event.eventType], 'E_LEDGER_EVENT_TYPE', event.eventType);
    assertClosedObject(event, EVENT_KEYS[event.eventType], EVENT_KEYS[event.eventType], `events.${index}.payload`);
    assert(event.schemaVersion === 'AUDIT_R2_LEASE_EVENT_V1', 'E_LEDGER_EVENT_SCHEMA', event.eventType);
    assert(record.digest === sha256(canonicalBytes(event)), 'E_LEDGER_EVENT_DIGEST', event.eventType);
    assert(!byType.has(event.eventType), 'E_LEDGER_EVENT_DUPLICATE', event.eventType);
    byType.set(event.eventType, record);
  }
  const release53 = byType.get('PREDECESSOR_RELEASE');
  const acquire = byType.get('LEASE_ACQUIRE');
  const fence = byType.get('FENCE_ADVANCE');
  const binding = byType.get('ADMISSION_BINDING');
  assert(release53 && acquire && fence && binding, 'E_LEDGER_REQUIRED_EVENT_MISSING', 'predecessor/acquire/fence/binding');
  assert(release53.payload.fencingCounter === 53 && release53.payload.priorLeaseDigest === ledger.importedLegacyClaim.leaseDigest && release53.payload.priorFenceDigest === ledger.importedLegacyClaim.fenceDigest, 'E_PREDECESSOR_RELEASE_BINDING', 'counter53');
  assert(acquire.payload.fencingCounter === 54 && acquire.payload.predecessorReleaseEventDigest === release53.digest && acquire.payload.oneWriter === true && acquire.payload.wip === 1 && acquire.payload.status === 'ACTIVE', 'E_LEASE_ACQUIRE_BINDING', 'counter54');
  assert(fence.payload.fencingCounter === 54 && fence.payload.previousFencingCounter === 53 && fence.payload.leaseAcquisitionEventDigest === acquire.digest && fence.payload.status === 'ENFORCED', 'E_FENCE_BINDING', 'counter54');
  assert(binding.payload.fencingCounter === 54 && binding.payload.leaseAcquisitionEventDigest === acquire.digest && binding.payload.fenceEventDigest === fence.digest && binding.payload.status === 'ACTIVE_ADMISSION_BOUND', 'E_ADMISSION_BINDING', 'counter54');
  for (const key of ['stageAdmissionDigest','stageInstanceDigest','writeSetDigest']) assertHex(binding.payload[key], 64, key);
  const instanceBytes = fs.readFileSync(`${root}/docs/OPS/R24/CORRECTIVE/AUDIT_R2_FINAL_CORRECTION_STAGE_INSTANCE_V1.json`);
  const admissionBytes = fs.readFileSync(`${root}/docs/OPS/R24/CORRECTIVE/AUDIT_R2_FINAL_CORRECTION_STAGE_ADMISSION_ATTESTATION_V1.json`);
  const instance = JSON.parse(instanceBytes);
  assert(sha256(instanceBytes) === binding.payload.stageInstanceDigest, 'E_BOUND_INSTANCE_DIGEST', binding.payload.stageInstanceDigest);
  assert(sha256(admissionBytes) === binding.payload.stageAdmissionDigest, 'E_BOUND_ADMISSION_DIGEST', binding.payload.stageAdmissionDigest);
  assert(sha256(canonicalBytes(instance.writeSet)) === binding.payload.writeSetDigest, 'E_BOUND_WRITE_SET_DIGEST', binding.payload.writeSetDigest);
  assert(ledger.highestEffectiveFencingCounter === 54, 'E_HIGHEST_FENCE_COUNTER', ledger.highestEffectiveFencingCounter);
  assertClosedObject(ledger.effectiveState, ['admissionBindingEventDigest','fenceEventDigest','fencingCounter','leaseEventDigest','status','wip','writerTaskId'], ['admissionBindingEventDigest','fenceEventDigest','fencingCounter','leaseEventDigest','status','wip','writerTaskId'], 'effectiveState');
  assert(ledger.effectiveState.leaseEventDigest === acquire.digest && ledger.effectiveState.fenceEventDigest === fence.digest && ledger.effectiveState.admissionBindingEventDigest === binding.digest, 'E_EFFECTIVE_DIGEST_BINDING', 'effectiveState');
  const terminalRelease = byType.get('RELEASE');
  if (requireReleased) {
    assert(terminalRelease, 'E_RELEASE_MISSING', 'RELEASE');
    assert(terminalRelease.payload.fencingCounter === 54 && terminalRelease.payload.leaseAcquisitionEventDigest === acquire.digest && terminalRelease.payload.fenceEventDigest === fence.digest && terminalRelease.payload.status === 'RELEASED' && terminalRelease.payload.wip === 0 && terminalRelease.payload.unpreservedWip === 0 && terminalRelease.payload.wp400MutationStarted === false && terminalRelease.payload.programDoneClaimed === false, 'E_RELEASE_STATE', 'RELEASE');
    assert(ledger.effectiveState.status === 'RELEASED' && ledger.effectiveState.wip === 0, 'E_EFFECTIVE_RELEASE_STATE', ledger.effectiveState.status);
  } else assert(ledger.effectiveState.status === 'ACTIVE' && ledger.effectiveState.wip === 1 && !terminalRelease, 'E_EFFECTIVE_ACTIVE_STATE', ledger.effectiveState.status);
  return { status: requireReleased ? 'RELEASED' : 'ACTIVE', highestEffectiveFencingCounter: 54, leaseDigest: acquire.digest, fenceDigest: fence.digest, admissionBindingDigest: binding.digest, releaseDigest: terminalRelease?.digest ?? null };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const mode = process.argv[2];
    const file = process.argv[3];
    assert(['--check-active','--check-release'].includes(mode) && file, 'E_USAGE', '--check-active|--check-release ledger.json');
    const result = validateLedger(readCanonicalJson(file).value, { requireReleased: mode === '--check-release' });
    process.stdout.write(`${canonicalize(result)}\n`);
  } catch (error) {
    process.stderr.write(`${canonicalize({code:error.code ?? 'E_UNTYPED',message:error.message})}\n`);
    process.exitCode = 1;
  }
}
