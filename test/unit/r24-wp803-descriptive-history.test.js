'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { fixture } = require('../fixtures/r24-wp803-descriptive-history-fixtures.js');
const modulePromise = import('../../src/core/descriptive-history-v1.mjs');

test('WP803 describes add/delete/net/touched operations and sessions without an effort score', async t => {
  const { input } = await fixture(t); const { buildPulseDescriptiveHistory: build } = await modulePromise;
  const p = build(input);
  assert.deepEqual(p.rows.map(r => [r.added.value, r.deleted.value, r.net.value, r.touched.value, r.sessions.value]), [[20, 5, 15, 25, 1], [0, 8, -8, 8, 0], [9, null, null, null, null]]);
  assert.deepEqual(p.rows.map(r => r.sceneEdits.value), [2, 1, null]);
  assert.equal(Object.hasOwn(p, 'productivityScore'), false);
});
test('WP803 keeps explicit tasks and phase distinct from ledger observations', async t => {
  const { input } = await fixture(t); const { buildPulseDescriptiveHistory: build } = await modulePromise; const p = build(input);
  assert.deepEqual(p.rows.map(r => r.declaredTasks.value), [3, 0, null]);
  assert.deepEqual(p.rows.map(r => r.manualPhase.value), ['REVISING', null, null]);
  assert.equal(p.rows[0].declaredTasks.origin, 'EXPLICIT_LOCAL_DECLARATION');
  assert.equal(p.rows[0].added.origin, 'LEDGER_AGGREGATE');
  assert.equal(p.rows[0].net.origin, 'DERIVED_FROM_RECORDED_ADD_DELETE');
  assert.equal(p.rows[2].manualPhase.origin, null);
});
test('WP803 exposes partial denominators and never converts omitted measurements to zero', async t => {
  const { input } = await fixture(t); const { buildPulseDescriptiveHistory: build } = await modulePromise; const p = build(input);
  assert.deepEqual(p.summary.added, { status: 'COMPLETE', value: 29, observedSubtotal: 29, recordedRows: 3, totalRows: 3 });
  assert.deepEqual(p.summary.deleted, { status: 'PARTIAL', value: null, observedSubtotal: 13, recordedRows: 2, totalRows: 3 });
  assert.deepEqual(p.summary.net, { status: 'PARTIAL', value: null, observedSubtotal: 7, recordedRows: 2, totalRows: 3 });
  assert.deepEqual(p.summary.touched, { status: 'PARTIAL', value: null, observedSubtotal: 33, recordedRows: 2, totalRows: 3 });
  assert.equal(p.rows[1].added.status, 'RECORDED'); assert.equal(p.rows[2].deleted.status, 'NOT_RECORDED');
});
test('WP803 returns an immutable isolated and deterministic projection', async t => {
  const { input } = await fixture(t); const { buildPulseDescriptiveHistory: build, assertPulseDescriptiveHistoryCurrent: current } = await modulePromise;
  const p = build(input); assert.deepEqual(p, build(input));
  assert.throws(() => { p.rows[0].added.value = 999; }, TypeError);
  input.declarationSnapshot.entries[0].manualPhase = 'DRAFTING'; assert.equal(p.rows[0].manualPhase.value, 'REVISING');
  assert.deepEqual(current(JSON.parse(JSON.stringify(p)), input.currentIdentity), p);
  assert.ok(Object.isFrozen(current(p, input.currentIdentity).rows[0]));
});
test('WP803 empty history has a zero denominator and no invented session', async t => {
  const { input } = await fixture(t, []); const { buildPulseDescriptiveHistory: build } = await modulePromise; const p = build(input);
  assert.equal(p.rows.length, 0); assert.deepEqual(p.summary.sessions, { status: 'COMPLETE', value: 0, observedSubtotal: 0, recordedRows: 0, totalRows: 0 });
});
test('WP803 absent declarations remain unrecorded and manual phases are explicitly enumerated', async t => {
  const { input } = await fixture(t); const { buildPulseDescriptiveHistory: build, PULSE_MANUAL_PHASES } = await modulePromise;
  input.declarationSnapshot.entries = []; const empty = build(input); assert.equal(empty.summary.declaredTasks.status, 'NOT_RECORDED');
  assert.ok(empty.rows.every(r => r.manualPhase.value === null));
  for (const phase of PULSE_MANUAL_PHASES) {
    input.declarationSnapshot.entries = [{ sequence: 1, entryDigest: input.ledgerSnapshot.entries[0].entryDigest, declaredTaskCount: null, manualPhase: phase }];
    assert.equal(build(input).rows[0].manualPhase.value, phase);
  }
});
test('WP803 accepts maximum declared count and rejects unsafe, negative or fractional counts', async t => {
  const { input } = await fixture(t); const { buildPulseDescriptiveHistory: build } = await modulePromise;
  input.declarationSnapshot.entries[0].declaredTaskCount = 1e9; assert.equal(build(input).rows[0].declaredTasks.value, 1e9);
  for (const value of [-1, 1.1, 1e9 + 1, NaN, Infinity, '1']) { input.declarationSnapshot.entries[0].declaredTaskCount = value; assert.throws(() => build(input), /E_WP803_DECLARED_TASK_COUNT/u); }
});

test('WP803 descriptive counts remain valid when an unrelated rate formula would overflow', async t => {
  const inputs = [1, 2, 3].map(n => ({ sourceRevisionOrdinal: n, generation: n, aggregates: [{ metricId: 'WORDS_ADDED_COUNT', value: 1e9 }, { metricId: 'WORDS_DELETED_COUNT', value: 0 }, ...(n === 1 ? [{ metricId: 'ACTIVE_WRITING_SECONDS', value: 1 }] : [])] }));
  const { input } = await fixture(t, inputs); const { buildPulseDescriptiveHistory: build } = await modulePromise;
  assert.equal(build(input).summary.added.value, 3e9); assert.equal(build(input).summary.touched.value, 3e9);
});
