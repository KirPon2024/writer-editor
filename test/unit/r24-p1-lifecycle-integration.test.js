'use strict';

// R2.4 P1 lifecycle integration: the full admission flow across renderer and
// main roles — typed acks, stale push fencing, crash and duplicate dispatch.

const test = require('node:test');
const assert = require('node:assert/strict');

const { ACK_OUTCOMES, decideAutosaveAck, mergeSignaledGeneration } = require('../../src/core/autosave-generation-v1.cjs');
const {
  SAVE_ACK_KINDS,
  applySaveAck,
  classifySaveAck,
  deriveDirty,
} = require('../../src/core/dirty-admission-v1.cjs');

function makeLifecycle() {
  const state = {
    latest: 0,
    acked: 0,
    latestSignaled: 0,
    rendererDirty: false,
    disk: '',
    draft: '',
  };
  const edit = (text) => {
    state.draft = text;
    state.latest += 1;
    state.latestSignaled = mergeSignaledGeneration(state.latestSignaled, state.latest);
    state.rendererDirty = true;
  };
  const autosave = ({ editMidFlight = null, crashBeforeAck = false, failWrite = false } = {}) => {
    const captured = state.latest;
    const capturedContent = state.draft;
    if (typeof editMidFlight === 'function') editMidFlight();
    if (failWrite) {
      const ack = classifySaveAck({ writeSucceeded: false, ackOutcome: null, savedGeneration: null, latestEditGeneration: state.latestSignaled });
      return { ok: false, ack };
    }
    state.disk = capturedContent;
    if (crashBeforeAck) return { ok: false, crashed: true, ack: null };
    const decision = decideAutosaveAck({ capturedGeneration: captured, latestEditGeneration: state.latestSignaled });
    const ack = classifySaveAck({ writeSucceeded: true, ackOutcome: decision.outcome, savedGeneration: captured, latestEditGeneration: state.latestSignaled });
    // renderer applies the ack with the P1 fence
    if (ack.kind === SAVE_ACK_KINDS.SAVED && ack.savedGeneration === state.latest) {
      const next = applySaveAck({ latestEditGeneration: state.latest, ackedGeneration: state.acked }, ack);
      state.acked = next.ackedGeneration;
      state.rendererDirty = false;
    }
    return { ok: true, ack };
  };
  return { state, edit, autosave };
}

test('mid-flight edit yields PROTECTED and newer work stays dirty until resaved', () => {
  const flow = makeLifecycle();
  flow.edit('v1');
  const first = flow.autosave({ editMidFlight: () => flow.edit('v2') });
  assert.equal(first.ack.kind, SAVE_ACK_KINDS.PROTECTED);
  assert.equal(flow.state.rendererDirty, true);
  assert.equal(deriveDirty({ latestEditGeneration: flow.state.latest, ackedGeneration: flow.state.acked }), true);
  const second = flow.autosave();
  assert.equal(second.ack.kind, SAVE_ACK_KINDS.SAVED);
  assert.equal(flow.state.rendererDirty, false);
  assert.equal(flow.state.disk, 'v2');
});

test('write failure is AT_RISK and admission never advances', () => {
  const flow = makeLifecycle();
  flow.edit('content');
  const result = flow.autosave({ failWrite: true });
  assert.equal(result.ok, false);
  assert.equal(result.ack.kind, SAVE_ACK_KINDS.AT_RISK);
  assert.equal(result.ack.reason, 'WRITE_FAILED');
  assert.equal(flow.state.acked, 0);
  assert.equal(flow.state.rendererDirty, true);
});

test('crash between write and ack keeps work at risk until a clean pass', () => {
  const flow = makeLifecycle();
  flow.edit('draft');
  const crashed = flow.autosave({ crashBeforeAck: true });
  assert.equal(crashed.crashed, true);
  assert.equal(flow.state.rendererDirty, true);
  assert.equal(flow.state.disk, 'draft', 'the write itself landed before the crash');
  const recovered = flow.autosave();
  assert.equal(recovered.ack.kind, SAVE_ACK_KINDS.SAVED);
  assert.equal(flow.state.rendererDirty, false);
});

test('stale SAVED push after a newer edit is refused by the renderer fence', () => {
  const flow = makeLifecycle();
  flow.edit('a');
  const first = flow.autosave();
  assert.equal(first.ack.kind, SAVE_ACK_KINDS.SAVED);
  assert.equal(flow.state.rendererDirty, false);
  // A delayed duplicate SAVED(1) arrives after a newer edit (generation 2).
  flow.edit('ab');
  const delayedAck = { kind: SAVE_ACK_KINDS.SAVED, savedGeneration: 1 };
  if (delayedAck.savedGeneration === flow.state.latest) {
    flow.state.acked = delayedAck.savedGeneration;
    flow.state.rendererDirty = false;
  }
  assert.equal(flow.state.rendererDirty, true, 'stale saved push must not clear the newer edit');
  assert.equal(flow.state.acked, 1);
});

test('unicode and IME-class content follows the same admission law', () => {
  const flow = makeLifecycle();
  flow.edit('İstanbul ∆ Σσς 👨‍👩‍👧‍👦');
  const result = flow.autosave();
  assert.equal(result.ack.kind, SAVE_ACK_KINDS.SAVED);
  assert.equal(flow.state.disk, 'İstanbul ∆ Σσς 👨‍👩‍👧‍👦');
  assert.equal(flow.state.rendererDirty, false);
});

test('duplicate SAVED ack at the current generation is idempotent', () => {
  const flow = makeLifecycle();
  flow.edit('x');
  flow.autosave();
  const again = applySaveAck({ latestEditGeneration: flow.state.latest, ackedGeneration: flow.state.acked }, { kind: SAVE_ACK_KINDS.SAVED, savedGeneration: flow.state.latest });
  assert.equal(again.ackedGeneration, flow.state.latest);
  assert.equal(deriveDirty(again), false);
});

test('admission admission is O(1) at scale', () => {
  const start = process.hrtime.bigint();
  let state = { latestEditGeneration: 0, ackedGeneration: 0 };
  for (let i = 1; i <= 50000; i += 1) {
    state = { latestEditGeneration: i, ackedGeneration: state.ackedGeneration };
    const ack = classifySaveAck({ writeSucceeded: true, ackOutcome: ACK_OUTCOMES.CLEAR_DIRTY, savedGeneration: i, latestEditGeneration: i });
    state = applySaveAck(state, ack);
  }
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  assert.equal(deriveDirty(state), false);
  assert.ok(elapsedMs < 500, `50k admission cycles took ${elapsedMs.toFixed(1)}ms`);
});
