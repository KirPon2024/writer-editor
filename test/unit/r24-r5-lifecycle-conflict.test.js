'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SAVE_ACK_KINDS } = require('../../src/core/dirty-admission-v1.cjs');
const {
  LIFECYCLE_EVENTS,
  LIFECYCLE_REASONS,
  RECOVERY_ACTIONS,
  OUTBOX_OBSERVATION_SOURCES,
  LifecycleConflictError,
  createSaveReceipt,
  createDetachedOutboxObservation,
  createFreshOutboxObservation,
  evaluateLifecycleBarrier,
} = require('../../src/core/lifecycle-conflict-v1.cjs');

const SUBJECT = 'project:p1/document:d1';
const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const savedAck = (generation) => ({ kind: SAVE_ACK_KINDS.SAVED, reason: '', savedGeneration: generation, latestEditGeneration: generation });
const saveReceipt = (generation, ack = savedAck(generation), subjectId = SUBJECT) => createSaveReceipt({ subjectId, observationGeneration: generation, ack });
const detached = (generation, subjectId = SUBJECT) => createDetachedOutboxObservation({ subjectId, observationGeneration: generation });
const freshOutbox = (generation, pendingEffects = []) => createFreshOutboxObservation({
  subjectId: SUBJECT,
  observationGeneration: generation,
  inboxOutbox: {
    replay: () => ({
      schemaVersion: 'yalken.transactionalInboxOutbox.v1',
      outboxDigest: 'c'.repeat(64),
      effects: pendingEffects.map(({ effectId, intentId }) => ({ effectId, intentId, status: 'PENDING' })),
    }),
    pendingEffects: () => pendingEffects,
  },
});
const disk = (generation, committedDigest = DIGEST_A, observedDiskDigest = DIGEST_A, p3Classification = 'NEW_COMMITTED', overrides = {}) => ({
  schemaVersion: 'yalken.lifecycleDiskObservation.v1',
  subjectId: SUBJECT,
  observationGeneration: generation,
  committedDigest,
  observedDiskDigest,
  p3Classification,
  ...overrides,
});

test('clean quit and suspend require exact save and outbox receipts', () => {
  for (const eventKind of [LIFECYCLE_EVENTS.QUIT, LIFECYCLE_EVENTS.SUSPEND]) {
    const decision = evaluateLifecycleBarrier({
      eventKind,
      subjectId: SUBJECT,
      latestEditGeneration: 3,
      ackedGeneration: 3,
      saveReceipt: saveReceipt(3),
      outboxObservation: detached(3),
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.reason, eventKind === LIFECYCLE_EVENTS.QUIT ? LIFECYCLE_REASONS.SAFE_TO_CLOSE : LIFECYCLE_REASONS.SAFE_TO_SUSPEND);
    assert.deepEqual(decision.activeHazards, []);
  }
});

test('missing wrong-subject and stale evidence return typed blocked decisions', () => {
  const missing = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.QUIT,
    subjectId: SUBJECT,
    latestEditGeneration: 2,
    ackedGeneration: 2,
  });
  assert.equal(missing.reason, LIFECYCLE_REASONS.EVIDENCE_UNAVAILABLE);

  const wrongSubject = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.QUIT,
    subjectId: SUBJECT,
    latestEditGeneration: 2,
    ackedGeneration: 2,
    saveReceipt: saveReceipt(2, savedAck(2), 'project:other'),
    outboxObservation: detached(2),
  });
  assert.equal(wrongSubject.reason, LIFECYCLE_REASONS.EVIDENCE_UNAVAILABLE);

  const stale = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.QUIT,
    subjectId: SUBJECT,
    latestEditGeneration: 2,
    ackedGeneration: 2,
    saveReceipt: saveReceipt(1, savedAck(1)),
    outboxObservation: detached(2),
  });
  assert.equal(stale.reason, LIFECYCLE_REASONS.EVIDENCE_UNAVAILABLE);
});

test('malformed unknown and stale SAVED acknowledgements cannot authorize quit', () => {
  for (const ack of [
    { kind: 'MYSTERY' },
    { kind: SAVE_ACK_KINDS.SAVED, savedGeneration: 1, latestEditGeneration: 2 },
    { kind: SAVE_ACK_KINDS.SAVED, reason: '', savedGeneration: 2, latestEditGeneration: 99 },
    { kind: SAVE_ACK_KINDS.SAVED, reason: 'FORGED', savedGeneration: 2, latestEditGeneration: 2 },
    { kind: SAVE_ACK_KINDS.PROTECTED, reason: 'STALE_GENERATION', savedGeneration: 1, latestEditGeneration: 2 },
  ]) {
    const decision = evaluateLifecycleBarrier({
      eventKind: LIFECYCLE_EVENTS.QUIT,
      subjectId: SUBJECT,
      latestEditGeneration: 2,
      ackedGeneration: 2,
      saveReceipt: saveReceipt(2, ack),
      outboxObservation: detached(2),
    });
    assert.equal(decision.allowed, false);
    assert.ok([LIFECYCLE_REASONS.EVIDENCE_UNAVAILABLE, LIFECYCLE_REASONS.AT_RISK_WRITE_FAILURE].includes(decision.reason));
  }
});

test('fresh crash evidence allows only clean R4 and P3 observations', () => {
  const clean = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.CRASH_RECOVERY,
    subjectId: SUBJECT,
    latestEditGeneration: 4,
    ackedGeneration: 4,
    outboxObservation: freshOutbox(4),
    diskObservation: disk(4),
  });
  assert.equal(clean.allowed, true);
  assert.equal(clean.reason, LIFECYCLE_REASONS.RECOVERY_CLEAN);

  const forgedFresh = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.CRASH_RECOVERY,
    subjectId: SUBJECT,
    latestEditGeneration: 4,
    ackedGeneration: 4,
    outboxObservation: {
      schemaVersion: 'yalken.lifecycleOutboxObservation.v1',
      subjectId: SUBJECT,
      observationGeneration: 4,
      source: OUTBOX_OBSERVATION_SOURCES.R4_FRESH_REOPEN,
      outboxDigest: 'c'.repeat(64),
      pendingEffects: [],
    },
    diskObservation: disk(4),
  });
  assert.equal(forgedFresh.reason, LIFECYCLE_REASONS.EVIDENCE_UNAVAILABLE);

  const detachedCrash = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.CRASH_RECOVERY,
    subjectId: SUBJECT,
    latestEditGeneration: 4,
    ackedGeneration: 4,
    outboxObservation: detached(4),
    diskObservation: disk(4),
  });
  assert.equal(detachedCrash.reason, LIFECYCLE_REASONS.EVIDENCE_UNAVAILABLE);

  for (const classification of ['RESUMABLE_PREPARED', 'PARTIAL_CORRUPTION_DETECTED', 'ROLLBACK_REQUIRED']) {
    const blocked = evaluateLifecycleBarrier({
      eventKind: LIFECYCLE_EVENTS.CRASH_RECOVERY,
      subjectId: SUBJECT,
      latestEditGeneration: 4,
      ackedGeneration: 4,
      outboxObservation: freshOutbox(4),
      diskObservation: disk(4, DIGEST_A, DIGEST_A, classification),
    });
    assert.equal(blocked.reason, LIFECYCLE_REASONS.PROJECT_RECOVERY_REQUIRED);
  }
});

test('external edit requires exact disk observation and detects divergence', () => {
  const missing = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.EXTERNAL_EDIT,
    subjectId: SUBJECT,
    latestEditGeneration: 5,
    ackedGeneration: 5,
    outboxObservation: detached(5),
  });
  assert.equal(missing.reason, LIFECYCLE_REASONS.EVIDENCE_UNAVAILABLE);

  const diverged = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.EXTERNAL_EDIT,
    subjectId: SUBJECT,
    latestEditGeneration: 5,
    ackedGeneration: 5,
    outboxObservation: detached(5),
    diskObservation: disk(5, DIGEST_A, DIGEST_B),
  });
  assert.equal(diverged.reason, LIFECYCLE_REASONS.EXTERNAL_DIVERGENCE_DETECTED);
  assert.deepEqual(diverged.recoveryActions, [
    RECOVERY_ACTIONS.FORK_RECOVERY_COPY,
    RECOVERY_ACTIONS.COMPARE_EXTERNAL_EDIT,
    RECOVERY_ACTIONS.KEEP_AUTHORING_DRAFT,
  ]);

  const residue = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.EXTERNAL_EDIT,
    subjectId: SUBJECT,
    latestEditGeneration: 5,
    ackedGeneration: 5,
    outboxObservation: detached(5),
    diskObservation: disk(5, DIGEST_A, DIGEST_A, 'RESUMABLE_PREPARED'),
  });
  assert.equal(residue.reason, LIFECYCLE_REASONS.PROJECT_RECOVERY_REQUIRED);
});

test('compound hazards expose full set and divergence suppresses save or replay authority', () => {
  const pending = [{ intentId: 'i1', effectId: 'e1', status: 'PENDING' }];
  const atRisk = { kind: SAVE_ACK_KINDS.AT_RISK, reason: 'WRITE_FAILED', savedGeneration: null, latestEditGeneration: 7 };
  const decision = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.EXTERNAL_EDIT,
    subjectId: SUBJECT,
    latestEditGeneration: 7,
    ackedGeneration: 6,
    saveReceipt: saveReceipt(7, atRisk),
    outboxObservation: freshOutbox(7, pending),
    diskObservation: disk(7, DIGEST_A, DIGEST_B),
  });
  assert.deepEqual(decision.activeHazards, ['EXTERNAL_DIVERGENCE', 'SAVE_NOT_CURRENT', 'PENDING_EFFECTS', 'UNSAVED_AUTHORING']);
  assert.equal(decision.reason, LIFECYCLE_REASONS.EXTERNAL_DIVERGENCE_DETECTED);
  assert.equal(decision.recoveryActions.includes(RECOVERY_ACTIONS.SAVE_BEFORE_CLOSE), false);
  assert.equal(decision.recoveryActions.includes(RECOVERY_ACTIONS.REPLAY_PENDING_EFFECTS), false);
});

test('pending effects and dirty state remain typed when stronger hazards are absent', () => {
  const pending = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.EXTERNAL_EDIT,
    subjectId: SUBJECT,
    latestEditGeneration: 3,
    ackedGeneration: 3,
    outboxObservation: freshOutbox(3, [{ intentId: 'i1', effectId: 'e1', status: 'PENDING' }]),
    diskObservation: disk(3),
  });
  assert.equal(pending.reason, LIFECYCLE_REASONS.PENDING_EFFECT_REPLAY_REQUIRED);

  const dirty = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.EXTERNAL_EDIT,
    subjectId: SUBJECT,
    latestEditGeneration: 3,
    ackedGeneration: 2,
    outboxObservation: detached(3),
    diskObservation: disk(3),
  });
  assert.equal(dirty.reason, LIFECYCLE_REASONS.UNSAVED_AUTHORING_WORK);
});

test('invalid event generation digest and effect shapes fail closed', () => {
  assert.throws(() => evaluateLifecycleBarrier({ eventKind: 'POWER_OFF', subjectId: SUBJECT, latestEditGeneration: 0, ackedGeneration: 0 }), (e) => e instanceof LifecycleConflictError && e.code === 'E_LIFECYCLE_EVENT_UNKNOWN');
  assert.throws(() => evaluateLifecycleBarrier({ eventKind: LIFECYCLE_EVENTS.QUIT, subjectId: SUBJECT, latestEditGeneration: 0, ackedGeneration: 1 }), (e) => e.code === 'E_LIFECYCLE_DIRTY_COORDINATE_INVALID');
  assert.throws(() => evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.EXTERNAL_EDIT,
    subjectId: SUBJECT,
    latestEditGeneration: 0,
    ackedGeneration: 0,
    outboxObservation: detached(0),
    diskObservation: disk(0, 'nope', DIGEST_A),
  }), (e) => e.code === 'E_LIFECYCLE_DIGEST_INVALID');
  assert.throws(() => evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.EXTERNAL_EDIT,
    subjectId: SUBJECT,
    latestEditGeneration: 0,
    ackedGeneration: 0,
    outboxObservation: createFreshOutboxObservation({
      subjectId: SUBJECT,
      observationGeneration: 0,
      inboxOutbox: {
        replay: () => ({
          schemaVersion: 'yalken.transactionalInboxOutbox.v1',
          outboxDigest: 'c'.repeat(64),
          effects: [
            { intentId: 'i1', effectId: 'e1', status: 'PENDING' },
            { intentId: 'i2', effectId: 'e1', status: 'PENDING' },
          ],
        }),
        pendingEffects: () => [
          { intentId: 'i1', effectId: 'e1', status: 'PENDING' },
          { intentId: 'i2', effectId: 'e1', status: 'PENDING' },
        ],
      },
    }),
    diskObservation: disk(0),
  }), (e) => e.code === 'E_LIFECYCLE_PENDING_EFFECT_DUPLICATE');
});

test('barrier evaluation remains linear in a closed 20k effect denominator', () => {
  const effects = Array.from({ length: 20000 }, (_, index) => ({ intentId: 'i1', effectId: 'e' + index, status: 'PENDING' }));
  const start = process.hrtime.bigint();
  const decision = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.EXTERNAL_EDIT,
    subjectId: SUBJECT,
    latestEditGeneration: 1,
    ackedGeneration: 1,
    outboxObservation: freshOutbox(1, effects),
    diskObservation: disk(1),
  });
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  assert.equal(decision.pendingEffectCount, 20000);
  assert.ok(elapsedMs < 1000, '20k pending effects took ' + elapsedMs.toFixed(1) + 'ms');
});
