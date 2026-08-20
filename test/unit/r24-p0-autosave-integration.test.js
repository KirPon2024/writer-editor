'use strict';

// R2.4 P0 integration harness: models the real main/renderer autosave flow
// (capture -> disk write -> acknowledgement) against the generation law and
// proves the failure classes the law must govern.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ACK_OUTCOMES,
  createEditGenerationTracker,
  decideAutosaveAck,
  mergeSignaledGeneration,
} = require('../../src/core/autosave-generation-v1.cjs');

// Minimal faithful harness of the wired flow: the renderer owns the tracker,
// main mirrors the latest signaled generation, and autosave captures a
// snapshot, writes, then acknowledges under the law.
function makeFlowHarness() {
  const renderer = createEditGenerationTracker();
  const state = {
    dirty: false,
    latestSignaled: 0,
    diskContent: '',
    rendererContent: '',
    ackLog: [],
  };
  return {
    state,
    edit(text) {
      state.rendererContent = text;
      renderer.bump();
      state.dirty = true;
      state.latestSignaled = mergeSignaledGeneration(state.latestSignaled, renderer.current());
    },
    // capture occurs at request time; write latency is when new edits can land
    autoSavePass({ editMidFlight = null, crashBeforeAck = false } = {}) {
      const capturedGeneration = renderer.current();
      const capturedContent = state.rendererContent;
      if (typeof editMidFlight === 'function') editMidFlight();
      state.diskContent = capturedContent;
      if (crashBeforeAck) return { acked: false, crashed: true };
      const ack = decideAutosaveAck({
        capturedGeneration,
        latestEditGeneration: state.latestSignaled,
      });
      state.ackLog.push(ack.outcome);
      if (ack.outcome === ACK_OUTCOMES.CLEAR_DIRTY) state.dirty = false;
      return { acked: ack.outcome === ACK_OUTCOMES.CLEAR_DIRTY, outcome: ack.outcome, crashed: false };
    },
  };
}

test('edit between capture and ack keeps newer work dirty and the next pass saves it', () => {
  const flow = makeFlowHarness();
  flow.edit('chapter one');
  const first = flow.autoSavePass({ editMidFlight: () => flow.edit('chapter one plus new sentence') });
  assert.equal(first.outcome, ACK_OUTCOMES.KEEP_DIRTY_STALE);
  assert.equal(flow.state.dirty, true, 'stale ack must not clear the dirty mark');
  assert.equal(flow.state.diskContent, 'chapter one', 'disk holds the captured generation content');

  const second = flow.autoSavePass();
  assert.equal(second.outcome, ACK_OUTCOMES.CLEAR_DIRTY);
  assert.equal(flow.state.dirty, false);
  assert.equal(flow.state.diskContent, 'chapter one plus new sentence');
});

test('crash between write and ack leaves dirty set and recovery resaves', () => {
  const flow = makeFlowHarness();
  flow.edit('draft text');
  const crashed = flow.autoSavePass({ crashBeforeAck: true });
  assert.equal(crashed.crashed, true);
  assert.equal(flow.state.dirty, true, 'no ack reached the dirty mark after crash');
  const recovered = flow.autoSavePass();
  assert.equal(recovered.outcome, ACK_OUTCOMES.CLEAR_DIRTY);
  assert.equal(flow.state.dirty, false);
});

test('quiet capture clears immediately and duplicate quiet pass is a no-op class', () => {
  const flow = makeFlowHarness();
  flow.edit('stable');
  const first = flow.autoSavePass();
  assert.equal(first.outcome, ACK_OUTCOMES.CLEAR_DIRTY);
  assert.equal(flow.state.dirty, false);
  const again = flow.autoSavePass();
  assert.equal(again.outcome, ACK_OUTCOMES.CLEAR_DIRTY);
  assert.deepEqual(flow.state.ackLog, [ACK_OUTCOMES.CLEAR_DIRTY, ACK_OUTCOMES.CLEAR_DIRTY]);
});

test('unicode, IME-like and astral edits bind the same generation law', () => {
  const flow = makeFlowHarness();
  flow.edit('Текст с кириллицей и İstanbul');
  flow.edit('Текст с кириллицей и İstanbul — 👨‍👩‍👧‍👦 emoji');
  const first = flow.autoSavePass({ editMidFlight: () => flow.edit('Τον ελληνικό Σσ ς') });
  assert.equal(first.outcome, ACK_OUTCOMES.KEEP_DIRTY_STALE);
  const second = flow.autoSavePass();
  assert.equal(second.outcome, ACK_OUTCOMES.CLEAR_DIRTY);
  assert.equal(flow.state.diskContent, 'Τον ελληνικό Σσ ς');
});

test('ack decision is O(1) and stays inside a tight budget at scale', () => {
  const start = process.hrtime.bigint();
  let acc = 0;
  for (let i = 0; i < 100000; i += 1) {
    acc += decideAutosaveAck({ capturedGeneration: i, latestEditGeneration: i }).outcome.length;
  }
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  assert.ok(acc > 0);
  assert.ok(elapsedMs < 250, `100k ack decisions took ${elapsedMs.toFixed(1)}ms`);
});

test('out-of-order older signal never regresses the latest coordinate', () => {
  const flow = makeFlowHarness();
  flow.edit('a');
  flow.edit('ab');
  const latestBefore = flow.state.latestSignaled;
  flow.state.latestSignaled = mergeSignaledGeneration(flow.state.latestSignaled, 1);
  assert.equal(flow.state.latestSignaled, latestBefore);
  const pass = flow.autoSavePass();
  assert.equal(pass.outcome, ACK_OUTCOMES.CLEAR_DIRTY);
});
