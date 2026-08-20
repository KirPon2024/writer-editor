#!/usr/bin/env node
// R2.4 E0 — single-writer lease with durable monotonic fencing token.
// Law: one writer per contour; state updates require exact expectedRevision
// and the current fencing token; an expired writer cannot continue after a
// new lease; takeover requires read-only reconciliation evidence first.
import fs from 'node:fs';
import { casUpdate, readPlanState, initPlanState } from './plan-state.mjs';
import { R24Error } from './canonical-json.mjs';

const requireString = (value, code) => {
  if (typeof value !== 'string' || value.length === 0) throw new R24Error(code);
  return value;
};

const requireIsoNow = (now) => {
  const ms = Date.parse(now);
  if (!Number.isFinite(ms)) throw new R24Error('E_CLOCK_INVALID', String(now));
  return ms;
};

export function reconcileLease(filePath, { contourId, now }) {
  requireString(contourId, 'E_CONTOUR_ID_REQUIRED');
  const nowMs = requireIsoNow(now);
  if (!fs.existsSync(filePath)) return { leaseState: 'NONE', lease: null, reconciledAt: now };
  const state = readPlanState(filePath);
  const lease = state.leases[contourId] || null;
  if (!lease) return { leaseState: 'NONE', lease: null, reconciledAt: now };
  const expired = nowMs >= Date.parse(lease.expiresAt);
  return { leaseState: expired ? 'EXPIRED' : 'ACTIVE', lease, reconciledAt: now };
}

export function acquireLease(filePath, {
  contourId,
  writerId,
  missionId,
  ttlMs,
  now,
  expectedRevision,
  idempotencyKey = null,
}) {
  requireString(contourId, 'E_CONTOUR_ID_REQUIRED');
  requireString(writerId, 'E_WRITER_ID_REQUIRED');
  requireString(missionId, 'E_MISSION_ID_REQUIRED');
  if (!Number.isInteger(ttlMs) || ttlMs <= 0) throw new R24Error('E_LEASE_TTL_INVALID');
  const nowMs = requireIsoNow(now);
  initPlanState(filePath);
  return casUpdate(filePath, {
    expectedRevision,
    idempotencyKey,
    mutate: (draft) => {
      const existing = draft.leases[contourId] || null;
      if (existing && nowMs < Date.parse(existing.expiresAt) && existing.writerId !== writerId) {
        throw new R24Error('E_LEASE_ACTIVE', `${contourId} held by ${existing.writerId} until ${existing.expiresAt}`);
      }
      // Re-acquire by the same live writer extends the lease; fencing stays monotonic.
      draft.fencingCounter += 1;
      const lease = {
        contourId,
        writerId,
        missionId,
        leaseRevision: (existing ? existing.leaseRevision : 0) + 1,
        fencingToken: draft.fencingCounter,
        acquiredAt: existing && existing.writerId === writerId ? existing.acquiredAt : now,
        heartbeatAt: now,
        expiresAt: new Date(nowMs + ttlMs).toISOString(),
      };
      draft.leases[contourId] = lease;
      return { lease };
    },
  });
}

export function assertLeaseCurrent(state, { contourId, writerId, fencingToken, now }) {
  const lease = state.leases[contourId];
  if (!lease) throw new R24Error('E_LEASE_MISSING', contourId);
  if (lease.writerId !== writerId) throw new R24Error('E_LEASE_WRITER_MISMATCH', contourId);
  if (!Number.isInteger(fencingToken) || fencingToken !== lease.fencingToken) {
    throw new R24Error('E_FENCE_STALE', `${contourId} presented=${String(fencingToken)} current=${lease.fencingToken}`);
  }
  if (requireIsoNow(now) >= Date.parse(lease.expiresAt)) throw new R24Error('E_LEASE_EXPIRED', contourId);
  return lease;
}

export function heartbeatLease(filePath, { contourId, writerId, fencingToken, ttlMs, now, expectedRevision }) {
  requireString(contourId, 'E_CONTOUR_ID_REQUIRED');
  const nowMs = requireIsoNow(now);
  if (!Number.isInteger(ttlMs) || ttlMs <= 0) throw new R24Error('E_LEASE_TTL_INVALID');
  return casUpdate(filePath, {
    expectedRevision,
    mutate: (draft) => {
      const lease = assertLeaseCurrent(draft, { contourId, writerId, fencingToken, now });
      lease.heartbeatAt = now;
      lease.expiresAt = new Date(nowMs + ttlMs).toISOString();
      return { lease };
    },
  });
}

export function releaseLease(filePath, { contourId, writerId, fencingToken, now, expectedRevision }) {
  requireString(contourId, 'E_CONTOUR_ID_REQUIRED');
  return casUpdate(filePath, {
    expectedRevision,
    mutate: (draft) => {
      assertLeaseCurrent(draft, { contourId, writerId, fencingToken, now });
      delete draft.leases[contourId];
      return { released: contourId };
    },
  });
}

// Takeover is legal only with fresh read-only reconciliation proving the
// prior lease expired. A reconcile report naming ACTIVE is a hard stop;
// passing a fabricated or stale report fails closed.
export function takeoverLease(filePath, {
  contourId,
  writerId,
  missionId,
  ttlMs,
  now,
  expectedRevision,
  reconcile,
}) {
  requireString(contourId, 'E_CONTOUR_ID_REQUIRED');
  requireString(writerId, 'E_WRITER_ID_REQUIRED');
  if (!reconcile || reconcile.leaseState !== 'EXPIRED' || !reconcile.lease || reconcile.lease.contourId !== contourId) {
    throw new R24Error('E_BLIND_TAKEOVER_FORBIDDEN', contourId);
  }
  const nowMs = requireIsoNow(now);
  if (nowMs < Date.parse(reconcile.lease.expiresAt)) throw new R24Error('E_TAKEOVER_STALE_RECONCILE', contourId);
  initPlanState(filePath);
  return casUpdate(filePath, {
    expectedRevision,
    mutate: (draft) => {
      const existing = draft.leases[contourId] || null;
      if (!existing) throw new R24Error('E_TAKEOVER_NO_LEASE', contourId);
      if (nowMs < Date.parse(existing.expiresAt)) throw new R24Error('E_TAKEOVER_LEASE_ACTIVE', contourId);
      if (existing.fencingToken !== reconcile.lease.fencingToken) throw new R24Error('E_TAKEOVER_STALE_RECONCILE', contourId);
      draft.fencingCounter += 1;
      const lease = {
        contourId,
        writerId,
        missionId,
        leaseRevision: existing.leaseRevision + 1,
        fencingToken: draft.fencingCounter,
        acquiredAt: now,
        heartbeatAt: now,
        expiresAt: new Date(nowMs + ttlMs).toISOString(),
        takeoverOf: existing.fencingToken,
      };
      draft.leases[contourId] = lease;
      return { lease };
    },
  });
}
