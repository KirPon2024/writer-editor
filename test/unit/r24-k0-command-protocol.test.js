'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BRIDGE_PROTOCOL_REGISTRY,
  OPERATION_CLASSES,
  CommandProtocolError,
  bridgeOperationClass,
  normalizeProtocolResult,
} = require('../../src/core/command-protocol-v1.cjs');

test('five operation classes stay distinct and frozen', () => {
  assert.deepEqual(Object.keys(OPERATION_CLASSES).sort(), ['BACKGROUND_JOB', 'COMMAND', 'EFFECT', 'EVENT', 'QUERY']);
  assert.ok(Object.isFrozen(OPERATION_CLASSES));
  const classes = new Set(Object.values(OPERATION_CLASSES));
  assert.equal(classes.size, 5);
});

test('bridge registry binds each channel to exactly one class and id field', () => {
  assert.equal(bridgeOperationClass('ui:command-bridge'), OPERATION_CLASSES.COMMAND);
  assert.equal(bridgeOperationClass('ui:workspace-query-bridge'), OPERATION_CLASSES.QUERY);
  assert.equal(bridgeOperationClass('ui:save-lifecycle-signal-bridge'), OPERATION_CLASSES.COMMAND);
  assert.throws(() => bridgeOperationClass('ui:bogus'), (e) => e instanceof CommandProtocolError && e.code === 'E_PROTOCOL_CHANNEL_UNKNOWN');
  assert.equal(BRIDGE_PROTOCOL_REGISTRY['ui:workspace-query-bridge'].idField, 'queryId');
  assert.notEqual(BRIDGE_PROTOCOL_REGISTRY['ui:command-bridge'].operationClass, BRIDGE_PROTOCOL_REGISTRY['ui:workspace-query-bridge'].operationClass);
});

test('success results pass through unchanged', () => {
  const ok = { ok: true, value: { scene: 'x' } };
  assert.equal(normalizeProtocolResult(ok), ok);
  const payloadOnly = { data: [1, 2, 3] };
  assert.equal(normalizeProtocolResult(payloadOnly), payloadOnly, 'handler payloads without ok flag are tolerated pass-through');
});

test('legacy refusal shapes normalize to one canonical contract', () => {
  const byReason = normalizeProtocolResult({ ok: false, reason: 'COMMAND_ID_NOT_ALLOWED' });
  assert.equal(byReason.ok, false);
  assert.equal(byReason.code, 'COMMAND_ID_NOT_ALLOWED');
  assert.equal(byReason.reason, 'COMMAND_ID_NOT_ALLOWED');

  const byErrorString = normalizeProtocolResult({ ok: false, error: 'QUERY_ID_NOT_ALLOWED' });
  assert.equal(byErrorString.code, 'QUERY_ID_NOT_ALLOWED');
  assert.equal(byErrorString.reason, 'QUERY_ID_NOT_ALLOWED');

  const byErrorObject = normalizeProtocolResult({ ok: false, error: { code: 'E_X', reason: 'human' } });
  assert.equal(byErrorObject.code, 'E_X');
  assert.equal(byErrorObject.reason, 'human');
  assert.deepEqual(byErrorObject.error, { code: 'E_X', reason: 'human' }, 'legacy error field preserved verbatim');
});

test('refusals without any code fail closed', () => {
  assert.throws(() => normalizeProtocolResult({ ok: false }), (e) => e.code === 'E_PROTOCOL_REFUSAL_CODE_MISSING');
  assert.throws(() => normalizeProtocolResult({ ok: false, reason: '' }), (e) => e.code === 'E_PROTOCOL_REFUSAL_CODE_MISSING');
  assert.throws(() => normalizeProtocolResult(null), (e) => e.code === 'E_PROTOCOL_RESULT_SHAPE');
  assert.throws(() => normalizeProtocolResult([{ ok: false }]), (e) => e.code === 'E_PROTOCOL_RESULT_SHAPE');
});

test('existing code wins over derived fields', () => {
  const result = normalizeProtocolResult({ ok: false, code: 'E_CANON', reason: 'legacy-reason' });
  assert.equal(result.code, 'E_CANON');
  assert.equal(result.reason, 'legacy-reason');
});
