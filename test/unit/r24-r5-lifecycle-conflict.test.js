'use strict';

// R2.4 R5 lifecycle/external conflict law: quit, suspend, crash recovery and
// external edit decisions are typed projections over dirty state, pending
// effects and disk divergence.

const test = require('node:test');
const assert = require('node:assert/strict');

const { SAVE_ACK_KINDS } = require('../../src/core/dirty-admission-v1.cjs');
const {
  LIFECYCLE_EVENTS,
  LIFECYCLE_DECISIONS,
  LIFECYCLE_REASONS,
  RECOVERY_ACTIONS,
  LifecycleConflictError,
  evaluateLifecycleBarrier,
} = require('../../src/core/lifecycle-conflict-v1.cjs');

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);

test('clean quit and suspend are allowed only with no pending effects or divergence', () => {
  const quit = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.QUIT,
    latestEditGeneration: 3,
    ackedGeneration: 3,
    committedDigest: DIGEST_A,
    observedDiskDigest: DIGEST_A,
  });
  assert.equal(quit.decision, LIFECYCLE_DECISIONS.ALLOW);
  assert.equal(quit.allowed, true);
  assert.equal(quit.reason, LIFECYCLE_REASONS.SAFE_TO_CLOSE);
  assert.deepEqual(quit.recoveryActions, [RECOVERY_ACTIONS.NO_ACTION]);

  const suspend = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.SUSPEND,
    latestEditGeneration: 0,
    ackedGeneration: 0,
  });
  assert.equal(suspend.reason, LIFECYCLE_REASONS.SAFE_TO_SUSPEND);
});

test('dirty authoring state blocks quit with save-before-close recovery choices', () => {
  const decision = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.QUIT,
    latestEditGeneration: 4,
    ackedGeneration: 3,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, LIFECYCLE_REASONS.UNSAVED_AUTHORING_WORK);
  assert.deepEqual(decision.recoveryActions, [RECOVERY_ACTIONS.SAVE_BEFORE_CLOSE, RECOVERY_ACTIONS.KEEP_OPEN]);
});

test('at-risk write acknowledgement dominates safe close claims', () => {
  const decision = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.SUSPEND,
    latestEditGeneration: 3,
    ackedGeneration: 3,
    saveAck: { kind: SAVE_ACK_KINDS.AT_RISK, reason: 'WRITE_FAILED' },
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, LIFECYCLE_REASONS.AT_RISK_WRITE_FAILURE);
  assert.deepEqual(decision.recoveryActions, [RECOVERY_ACTIONS.KEEP_OPEN, RECOVERY_ACTIONS.SAVE_BEFORE_CLOSE]);
});

test('pending outbox effects block lifecycle closure and crash success', () => {
  const decision = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.CRASH_RECOVERY,
    latestEditGeneration: 5,
    ackedGeneration: 5,
    pendingEffects: [
      { intentId: 'commit-1', effectId: 'effect-1', kind: 'fs.write', status: 'PENDING' },
      { intentId: 'commit-1', effectId: 'effect-2', kind: 'fs.notify', status: 'PENDING' },
    ],
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, LIFECYCLE_REASONS.PENDING_EFFECT_REPLAY_REQUIRED);
  assert.deepEqual(decision.pendingEffectIds, ['effect-1', 'effect-2']);
  assert.deepEqual(decision.recoveryActions, [RECOVERY_ACTIONS.REPLAY_PENDING_EFFECTS, RECOVERY_ACTIONS.KEEP_OPEN]);
});

test('external disk divergence blocks with fork compare and keep-draft choices', () => {
  const decision = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.EXTERNAL_EDIT,
    latestEditGeneration: 9,
    ackedGeneration: 9,
    committedDigest: DIGEST_A,
    observedDiskDigest: DIGEST_B,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, LIFECYCLE_REASONS.EXTERNAL_DIVERGENCE_DETECTED);
  assert.equal(decision.diverged, true);
  assert.deepEqual(decision.recoveryActions, [
    RECOVERY_ACTIONS.FORK_RECOVERY_COPY,
    RECOVERY_ACTIONS.COMPARE_EXTERNAL_EDIT,
    RECOVERY_ACTIONS.KEEP_AUTHORING_DRAFT,
  ]);
});

test('crash recovery and external edit with clean identity are allow projections', () => {
  const recovery = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.CRASH_RECOVERY,
    latestEditGeneration: 1,
    ackedGeneration: 1,
    committedDigest: DIGEST_A,
    observedDiskDigest: DIGEST_A,
  });
  assert.equal(recovery.allowed, true);
  assert.equal(recovery.reason, LIFECYCLE_REASONS.RECOVERY_CLEAN);

  const external = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.EXTERNAL_EDIT,
    latestEditGeneration: 1,
    ackedGeneration: 1,
    committedDigest: DIGEST_A,
    observedDiskDigest: DIGEST_A,
  });
  assert.equal(external.allowed, true);
  assert.equal(external.reason, LIFECYCLE_REASONS.EXTERNAL_EDIT_NO_DIVERGENCE);
});

test('invalid event, generation, digest and pending effect inputs fail closed', () => {
  assert.throws(
    () => evaluateLifecycleBarrier({ eventKind: 'POWER_OFF', latestEditGeneration: 0, ackedGeneration: 0 }),
    (e) => e instanceof LifecycleConflictError && e.code === 'E_LIFECYCLE_EVENT_UNKNOWN',
  );
  assert.throws(
    () => evaluateLifecycleBarrier({ eventKind: LIFECYCLE_EVENTS.QUIT, latestEditGeneration: 0, ackedGeneration: 1 }),
    (e) => e.code === 'E_LIFECYCLE_DIRTY_COORDINATE_INVALID',
  );
  assert.throws(
    () => evaluateLifecycleBarrier({ eventKind: LIFECYCLE_EVENTS.QUIT, latestEditGeneration: 0, ackedGeneration: 0, committedDigest: DIGEST_A }),
    (e) => e.code === 'E_LIFECYCLE_DIGEST_PAIR_REQUIRED',
  );
  assert.throws(
    () => evaluateLifecycleBarrier({ eventKind: LIFECYCLE_EVENTS.QUIT, latestEditGeneration: 0, ackedGeneration: 0, committedDigest: 'nope', observedDiskDigest: DIGEST_A }),
    (e) => e.code === 'E_LIFECYCLE_DIGEST_INVALID',
  );
  assert.throws(
    () => evaluateLifecycleBarrier({
      eventKind: LIFECYCLE_EVENTS.QUIT,
      latestEditGeneration: 0,
      ackedGeneration: 0,
      pendingEffects: [
        { intentId: 'i-1', effectId: 'e-1', status: 'PENDING' },
        { intentId: 'i-2', effectId: 'e-1', status: 'PENDING' },
      ],
    }),
    (e) => e.code === 'E_LIFECYCLE_PENDING_EFFECT_DUPLICATE',
  );
  assert.throws(
    () => evaluateLifecycleBarrier({
      eventKind: LIFECYCLE_EVENTS.QUIT,
      latestEditGeneration: 0,
      ackedGeneration: 0,
      pendingEffects: [{ intentId: 'i-1', effectId: 'e-1', status: 'PUBLISHED' }],
    }),
    (e) => e.code === 'E_LIFECYCLE_PENDING_EFFECT_STATUS',
  );
});

test('barrier evaluation is linear in pending effect count', () => {
  const pendingEffects = Array.from({ length: 20000 }, (_, index) => ({
    intentId: 'intent-1',
    effectId: `effect-${index}`,
    status: 'PENDING',
  }));
  const start = process.hrtime.bigint();
  const decision = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.QUIT,
    latestEditGeneration: 1,
    ackedGeneration: 1,
    pendingEffects,
  });
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  assert.equal(decision.pendingEffectCount, 20000);
  assert.equal(decision.reason, LIFECYCLE_REASONS.PENDING_EFFECT_REPLAY_REQUIRED);
  assert.ok(elapsedMs < 1000, `20k pending effects took ${elapsedMs.toFixed(1)}ms`);
});
