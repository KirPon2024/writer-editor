'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ACK_OUTCOMES } = require('../../src/core/autosave-generation-v1.cjs');
const {
  SAVE_ACK_KINDS,
  DirtyAdmissionError,
  applySaveAck,
  classifySaveAck,
  deriveDirty,
} = require('../../src/core/dirty-admission-v1.cjs');

test('dirty is derived from admission coordinates, not a bare boolean', () => {
  assert.equal(deriveDirty({ latestEditGeneration: 0, ackedGeneration: 0 }), false);
  assert.equal(deriveDirty({ latestEditGeneration: 3, ackedGeneration: 3 }), false);
  assert.equal(deriveDirty({ latestEditGeneration: 4, ackedGeneration: 3 }), true);
  assert.throws(() => deriveDirty({ latestEditGeneration: 2, ackedGeneration: 3 }), (e) => e instanceof DirtyAdmissionError && e.code === 'E_ADMISSION_ACKED_AHEAD');
  assert.throws(() => deriveDirty({ latestEditGeneration: null, ackedGeneration: 0 }), (e) => e.code === 'E_ADMISSION_COORDINATE_INVALID');
});

test('ack classification: write success at exact generation is SAVED', () => {
  const ack = classifySaveAck({ writeSucceeded: true, ackOutcome: ACK_OUTCOMES.CLEAR_DIRTY, savedGeneration: 7, latestEditGeneration: 7 });
  assert.equal(ack.kind, SAVE_ACK_KINDS.SAVED);
  assert.equal(ack.savedGeneration, 7);
});

test('ack classification: stale capture is PROTECTED, never SAVED', () => {
  const ack = classifySaveAck({ writeSucceeded: true, ackOutcome: ACK_OUTCOMES.KEEP_DIRTY_STALE, savedGeneration: 7, latestEditGeneration: 8 });
  assert.equal(ack.kind, SAVE_ACK_KINDS.PROTECTED);
  assert.equal(ack.reason, 'STALE_GENERATION');
});

test('ack classification: unbound generation is AT_RISK', () => {
  const ack = classifySaveAck({ writeSucceeded: true, ackOutcome: ACK_OUTCOMES.KEEP_DIRTY_UNBOUND, savedGeneration: null, latestEditGeneration: 8 });
  assert.equal(ack.kind, SAVE_ACK_KINDS.AT_RISK);
  assert.equal(ack.reason, 'UNBOUND_GENERATION');
});

test('ack classification: failed write dominates every other signal', () => {
  const ack = classifySaveAck({ writeSucceeded: false, ackOutcome: ACK_OUTCOMES.CLEAR_DIRTY, savedGeneration: 7, latestEditGeneration: 7 });
  assert.equal(ack.kind, SAVE_ACK_KINDS.AT_RISK);
  assert.equal(ack.reason, 'WRITE_FAILED');
  assert.equal(ack.savedGeneration, null);
});

test('ack classification rejects invalid coordinates', () => {
  assert.throws(
    () => classifySaveAck({ writeSucceeded: true, ackOutcome: ACK_OUTCOMES.CLEAR_DIRTY, savedGeneration: null, latestEditGeneration: 7 }),
    (e) => e.code === 'E_ADMISSION_SAVED_GENERATION_INVALID',
  );
  assert.throws(
    () => classifySaveAck({ writeSucceeded: true, ackOutcome: ACK_OUTCOMES.CLEAR_DIRTY, savedGeneration: 7, latestEditGeneration: 'x' }),
    (e) => e.code === 'E_ADMISSION_COORDINATE_INVALID',
  );
});

test('applySaveAck advances the coordinate only on SAVED at current generation', () => {
  const state = { latestEditGeneration: 5, ackedGeneration: 2 };
  const saved = { kind: SAVE_ACK_KINDS.SAVED, savedGeneration: 5 };
  const next = applySaveAck(state, saved);
  assert.deepEqual(next, { latestEditGeneration: 5, ackedGeneration: 5 });
  assert.equal(deriveDirty(next), false);
});

test('applySaveAck refuses stale-as-saved, regression and unknown kinds', () => {
  const state = { latestEditGeneration: 5, ackedGeneration: 2 };
  assert.throws(() => applySaveAck(state, { kind: SAVE_ACK_KINDS.SAVED, savedGeneration: 4 }), (e) => e.code === 'E_SAVE_ACK_STALE_AS_SAVED');
  const same = applySaveAck({ latestEditGeneration: 5, ackedGeneration: 5 }, { kind: SAVE_ACK_KINDS.SAVED, savedGeneration: 5 });
  assert.deepEqual(same, { latestEditGeneration: 5, ackedGeneration: 5 }, 're-acking the current generation is idempotent');
  assert.throws(() => applySaveAck(state, { kind: 'BOGUS' }), (e) => e.code === 'E_SAVE_ACK_KIND_UNKNOWN');
  assert.throws(() => applySaveAck(state, null), (e) => e.code === 'E_SAVE_ACK_MISSING');
});

test('applySaveAck keeps the coordinate on PROTECTED and AT_RISK', () => {
  const state = { latestEditGeneration: 9, ackedGeneration: 4 };
  for (const ack of [
    { kind: SAVE_ACK_KINDS.PROTECTED, savedGeneration: 8 },
    { kind: SAVE_ACK_KINDS.AT_RISK, savedGeneration: null },
  ]) {
    const next = applySaveAck(state, ack);
    assert.deepEqual(next, state);
    assert.equal(deriveDirty(next), true);
  }
});
