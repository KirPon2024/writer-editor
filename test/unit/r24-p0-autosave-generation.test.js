'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ACK_OUTCOMES,
  AutosaveGenerationError,
  createEditGenerationTracker,
  decideAutosaveAck,
  mergeSignaledGeneration,
  normalizeEditGeneration,
} = require('../../src/core/autosave-generation-v1.cjs');

test('tracker is monotonic per session and starts at zero by default', () => {
  const tracker = createEditGenerationTracker();
  assert.equal(tracker.current(), 0);
  assert.equal(tracker.bump(), 1);
  assert.equal(tracker.bump(), 2);
  assert.equal(tracker.current(), 2);
  const seeded = createEditGenerationTracker(41);
  assert.equal(seeded.current(), 41);
  assert.equal(seeded.bump(), 42);
  assert.throws(() => createEditGenerationTracker(-1), (e) => e instanceof AutosaveGenerationError && e.code === 'E_GENERATION_INITIAL_INVALID');
  assert.throws(() => createEditGenerationTracker(1.5), (e) => e.code === 'E_GENERATION_INITIAL_INVALID');
});

test('normalization admits only non-negative integers', () => {
  assert.equal(normalizeEditGeneration(0), 0);
  assert.equal(normalizeEditGeneration(7), 7);
  assert.equal(normalizeEditGeneration(-1), null);
  assert.equal(normalizeEditGeneration(1.5), null);
  assert.equal(normalizeEditGeneration('3'), null);
  assert.equal(normalizeEditGeneration(null), null);
  assert.equal(normalizeEditGeneration(undefined), null);
  assert.equal(normalizeEditGeneration(NaN), null);
});

test('ack clears only when captured equals latest', () => {
  const clear = decideAutosaveAck({ capturedGeneration: 5, latestEditGeneration: 5 });
  assert.equal(clear.outcome, ACK_OUTCOMES.CLEAR_DIRTY);
  const zero = decideAutosaveAck({ capturedGeneration: 0, latestEditGeneration: 0 });
  assert.equal(zero.outcome, ACK_OUTCOMES.CLEAR_DIRTY);
});

test('stale ack can never clear newer work', () => {
  const stale = decideAutosaveAck({ capturedGeneration: 5, latestEditGeneration: 6 });
  assert.equal(stale.outcome, ACK_OUTCOMES.KEEP_DIRTY_STALE);
  assert.equal(stale.capturedGeneration, 5);
  assert.equal(stale.latestEditGeneration, 6);
});

test('unbound ack (missing or invalid generation) never clears', () => {
  for (const bad of [null, undefined, -1, 1.5, '9', NaN]) {
    const ack = decideAutosaveAck({ capturedGeneration: bad, latestEditGeneration: 3 });
    assert.equal(ack.outcome, ACK_OUTCOMES.KEEP_DIRTY_UNBOUND, `bad=${String(bad)}`);
    assert.equal(ack.capturedGeneration, null);
  }
});

test('captured ahead of latest is a typed regression, never a clear', () => {
  assert.throws(
    () => decideAutosaveAck({ capturedGeneration: 9, latestEditGeneration: 8 }),
    (e) => e instanceof AutosaveGenerationError && e.code === 'E_GENERATION_REGRESSION',
  );
});

test('invalid latest coordinate is a typed failure', () => {
  assert.throws(
    () => decideAutosaveAck({ capturedGeneration: 1, latestEditGeneration: -2 }),
    (e) => e.code === 'E_GENERATION_LATEST_INVALID',
  );
  assert.throws(
    () => decideAutosaveAck({ capturedGeneration: 1, latestEditGeneration: 'x' }),
    (e) => e.code === 'E_GENERATION_LATEST_INVALID',
  );
});

test('signaled generation merges monotonically and tolerates unbound signals', () => {
  assert.equal(mergeSignaledGeneration(0, 3), 3);
  assert.equal(mergeSignaledGeneration(3, 2), 3);
  assert.equal(mergeSignaledGeneration(3, 3), 3);
  assert.equal(mergeSignaledGeneration(3, null), 3);
  assert.equal(mergeSignaledGeneration(3, 'bogus'), 3);
  assert.throws(() => mergeSignaledGeneration(-1, 3), (e) => e.code === 'E_GENERATION_LATEST_INVALID');
});
