'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SHADOW_ADVICE,
  ShadowAuthorityError,
  createShadowAuthorityCell,
} = require('../../src/core/shadow-authority-cell-v1.cjs');

test('cell requires a real per-project identity', () => {
  assert.throws(() => createShadowAuthorityCell({}), (e) => e instanceof ShadowAuthorityError && e.code === 'E_SHADOW_PROJECT_IDENTITY_REQUIRED');
  assert.throws(() => createShadowAuthorityCell({ projectId: '' }), (e) => e.code === 'E_SHADOW_PROJECT_IDENTITY_REQUIRED');
});

test('advice classes map the admission question exactly', () => {
  const cell = createShadowAuthorityCell({ projectId: 'proj-a' });
  assert.equal(cell.shadowEvaluateWriteAdmission({ capturedGeneration: 5, latestEditGeneration: 5 }).advice, SHADOW_ADVICE.WOULD_CLEAR);
  assert.equal(cell.shadowEvaluateWriteAdmission({ capturedGeneration: 5, latestEditGeneration: 6 }).advice, SHADOW_ADVICE.WOULD_KEEP_STALE);
  assert.equal(cell.shadowEvaluateWriteAdmission({ capturedGeneration: 9, latestEditGeneration: 8 }).advice, SHADOW_ADVICE.WOULD_REJECT_REGRESSION);
  assert.equal(cell.shadowEvaluateWriteAdmission({ capturedGeneration: null, latestEditGeneration: 8 }).advice, SHADOW_ADVICE.WOULD_KEEP_UNBOUND);
});

test('observation is monotonic and never regresses', () => {
  const cell = createShadowAuthorityCell({ projectId: 'proj-a' });
  assert.equal(cell.recordObservation(4), 4);
  assert.equal(cell.recordObservation(2), 4, 'older observation never moves the coordinate backwards');
  assert.equal(cell.recordObservation(9), 9);
  assert.throws(() => cell.recordObservation(-1), (e) => e.code === 'E_SHADOW_GENERATION_INVALID');
});

test('unbound coordinate evaluation uses the recorded observation and fails closed when empty', () => {
  const cell = createShadowAuthorityCell({ projectId: 'proj-a' });
  assert.throws(() => cell.shadowEvaluateWriteAdmission({ capturedGeneration: 1 }), (e) => e.code === 'E_SHADOW_COORDINATE_UNBOUND');
  cell.recordObservation(7);
  assert.equal(cell.shadowEvaluateWriteAdmission({ capturedGeneration: 7 }).advice, SHADOW_ADVICE.WOULD_CLEAR);
});

test('promotion is always typed refused, and the cell has no bus surface', () => {
  const cell = createShadowAuthorityCell({ projectId: 'proj-a' });
  assert.throws(() => cell.promoteToAuthority(), (e) => e instanceof ShadowAuthorityError && e.code === 'E_SHADOW_PROMOTION_DENIED');
  assert.equal(cell.on, undefined);
  assert.equal(cell.emit, undefined);
  assert.equal(cell.subscribe, undefined);
  assert.equal(cell.publish, undefined);
  assert.ok(Object.isFrozen(cell), 'the cell surface is frozen');
});

test('per-project cells are isolated, never a shared god object', () => {
  const a = createShadowAuthorityCell({ projectId: 'proj-a' });
  const b = createShadowAuthorityCell({ projectId: 'proj-b' });
  a.recordObservation(10);
  assert.equal(b.shadowSnapshot().observedLatestGeneration, null);
  assert.notEqual(a, b);
});

test('snapshot is an immutable advisory view', () => {
  const cell = createShadowAuthorityCell({ projectId: 'proj-a' });
  cell.recordObservation(3);
  cell.shadowEvaluateWriteAdmission({ capturedGeneration: 2, latestEditGeneration: 3 });
  const snapshot = cell.shadowSnapshot();
  assert.equal(snapshot.mode, 'SHADOW_ONLY');
  assert.equal(snapshot.observedLatestGeneration, 3);
  assert.equal(snapshot.lastAdvice.advice, SHADOW_ADVICE.WOULD_KEEP_STALE);
  assert.ok(Object.isFrozen(snapshot));
});
