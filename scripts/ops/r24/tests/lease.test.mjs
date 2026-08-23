import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { initPlanState, readPlanState } from '../plan-state.mjs';
import {
  acquireLease,
  assertLeaseCurrent,
  heartbeatLease,
  releaseLease,
  reconcileLease,
  takeoverLease,
} from '../lease.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'r24-lease-'));
const T0 = '2026-08-20T00:00:00Z';
const T1 = '2026-08-20T00:00:30Z';
const T2 = '2026-08-20T00:02:00Z';

test('acquire, heartbeat, release round-trip with monotonic fencing', () => {
  const dir = tmp();
  const file = path.join(dir, 'plan.json');
  initPlanState(file);
  const acquired = acquireLease(file, {
    contourId: 'C1', writerId: 'W1', missionId: 'M1', ttlMs: 60000, now: T0, expectedRevision: 0,
  });
  const lease = acquired.result.lease;
  assert.equal(lease.fencingToken, 1);
  assert.equal(lease.writerId, 'W1');
  const heartbeat = heartbeatLease(file, {
    contourId: 'C1', writerId: 'W1', fencingToken: 1, ttlMs: 120000, now: T1, expectedRevision: acquired.revision,
  });
  assert.equal(heartbeat.result.lease.heartbeatAt, T1);
  const released = releaseLease(file, {
    contourId: 'C1', writerId: 'W1', fencingToken: 1, now: T1, expectedRevision: heartbeat.revision,
  });
  assert.equal(released.result.released, 'C1');
  assert.equal(readPlanState(file).leases.C1, undefined);
});

test('second writer is refused while a live lease exists', () => {
  const dir = tmp();
  const file = path.join(dir, 'plan.json');
  initPlanState(file);
  const acquired = acquireLease(file, {
    contourId: 'C1', writerId: 'W1', missionId: 'M1', ttlMs: 60000, now: T0, expectedRevision: 0,
  });
  assert.throws(
    () => acquireLease(file, {
      contourId: 'C1', writerId: 'W2', missionId: 'M1', ttlMs: 60000, now: T1, expectedRevision: acquired.revision,
    }),
    (e) => e.code === 'E_LEASE_ACTIVE',
  );
});

test('stale fencing token and writer mismatch fail closed', () => {
  const dir = tmp();
  const file = path.join(dir, 'plan.json');
  initPlanState(file);
  acquireLease(file, {
    contourId: 'C1', writerId: 'W1', missionId: 'M1', ttlMs: 60000, now: T0, expectedRevision: 0,
  });
  const state = readPlanState(file);
  assert.throws(
    () => assertLeaseCurrent(state, { contourId: 'C1', writerId: 'W1', fencingToken: 999, now: T1 }),
    (e) => e.code === 'E_FENCE_STALE',
  );
  assert.throws(
    () => assertLeaseCurrent(state, { contourId: 'C1', writerId: 'W2', fencingToken: 1, now: T1 }),
    (e) => e.code === 'E_LEASE_WRITER_MISMATCH',
  );
  assert.throws(
    () => assertLeaseCurrent(state, { contourId: 'C1', writerId: 'W1', fencingToken: 1, now: '2026-08-20T01:00:00Z' }),
    (e) => e.code === 'E_LEASE_EXPIRED',
  );
  assert.throws(
    () => assertLeaseCurrent(state, { contourId: 'NOPE', writerId: 'W1', fencingToken: 1, now: T1 }),
    (e) => e.code === 'E_LEASE_MISSING',
  );
});

test('expired writer cannot continue; takeover requires read-only reconcile', () => {
  const dir = tmp();
  const file = path.join(dir, 'plan.json');
  initPlanState(file);
  const acquired = acquireLease(file, {
    contourId: 'C1', writerId: 'W1', missionId: 'M1', ttlMs: 30000, now: T0, expectedRevision: 0,
  });
  assert.throws(
    () => takeoverLease(file, {
      contourId: 'C1', writerId: 'W2', missionId: 'M1', ttlMs: 60000, now: T2, expectedRevision: acquired.revision, reconcile: null,
    }),
    (e) => e.code === 'E_BLIND_TAKEOVER_FORBIDDEN',
  );
  const reconcile = reconcileLease(file, { contourId: 'C1', now: T2 });
  assert.equal(reconcile.leaseState, 'EXPIRED');
  const taken = takeoverLease(file, {
    contourId: 'C1', writerId: 'W2', missionId: 'M1', ttlMs: 60000, now: T2, expectedRevision: acquired.revision, reconcile,
  });
  assert.equal(taken.result.lease.writerId, 'W2');
  assert.equal(taken.result.lease.fencingToken, 2);
  assert.equal(taken.result.lease.takeoverOf, 1);
  const state = readPlanState(file);
  assert.throws(
    () => assertLeaseCurrent(state, { contourId: 'C1', writerId: 'W1', fencingToken: 1, now: T2 }),
    (e) => e.code === 'E_LEASE_WRITER_MISMATCH',
  );
});

test('fabricated reconcile report against live lease is refused', () => {
  const dir = tmp();
  const file = path.join(dir, 'plan.json');
  initPlanState(file);
  const acquired = acquireLease(file, {
    contourId: 'C1', writerId: 'W1', missionId: 'M1', ttlMs: 60000, now: T0, expectedRevision: 0,
  });
  const fakeReconcile = { leaseState: 'EXPIRED', lease: { ...acquired.result.lease, expiresAt: T0 } };
  assert.throws(
    () => takeoverLease(file, {
      contourId: 'C1', writerId: 'W2', missionId: 'M1', ttlMs: 60000, now: T1, expectedRevision: acquired.revision, reconcile: fakeReconcile,
    }),
    (e) => e.code === 'E_TAKEOVER_LEASE_ACTIVE',
  );
});

test('lease acquire is idempotent under duplicate dispatch key', () => {
  const dir = tmp();
  const file = path.join(dir, 'plan.json');
  initPlanState(file);
  const first = acquireLease(file, {
    contourId: 'C1', writerId: 'W1', missionId: 'M1', ttlMs: 60000, now: T0, expectedRevision: 0, idempotencyKey: 'acq-1',
  });
  const second = acquireLease(file, {
    contourId: 'C1', writerId: 'W1', missionId: 'M1', ttlMs: 60000, now: T0, expectedRevision: 0, idempotencyKey: 'acq-1',
  });
  assert.equal(second.duplicate, true);
  assert.equal(readPlanState(file).leases.C1.fencingToken, 1);
  assert.equal(readPlanState(file).revision, 1);
});
