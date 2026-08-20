'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ENVELOPE_VERSION,
  IpcEnvelopeError,
  createEnvelope,
  validateIpcEnvelope,
  withTimeoutBudget,
} = require('../../src/core/ipc-envelope-v1.cjs');

const CHANNEL = 'ui:command-bridge';

const framed = (overrides = {}) => ({
  v: 1,
  correlationId: 'corr-test-123456',
  issuedAt: '2026-08-20T00:00:00Z',
  route: 'command.bus',
  commandId: 'cmd.project.new',
  payload: { a: 1 },
  ...overrides,
});

test('valid envelope passes', () => {
  const verdict = validateIpcEnvelope(framed(), CHANNEL);
  assert.equal(verdict.ok, true, JSON.stringify(verdict));
});

test('every envelope conjunct fails closed when violated', () => {
  assert.equal(validateIpcEnvelope(null, CHANNEL).code, 'E_ENVELOPE_SHAPE');
  assert.equal(validateIpcEnvelope([], CHANNEL).code, 'E_ENVELOPE_SHAPE');
  assert.equal(validateIpcEnvelope(framed(), 'ui:bogus').code, 'E_ENVELOPE_CHANNEL_UNKNOWN');
  assert.equal(validateIpcEnvelope(framed({ v: 2 }), CHANNEL).code, 'E_ENVELOPE_VERSION');
  assert.equal(validateIpcEnvelope(framed({ v: '1' }), CHANNEL).code, 'E_ENVELOPE_VERSION');
  assert.equal(validateIpcEnvelope(framed({ correlationId: 'short' }), CHANNEL).code, 'E_ENVELOPE_CORRELATION_ID');
  assert.equal(validateIpcEnvelope(framed({ correlationId: 42 }), CHANNEL).code, 'E_ENVELOPE_CORRELATION_ID');
  assert.equal(validateIpcEnvelope(framed({ issuedAt: 'not-a-date' }), CHANNEL).code, 'E_ENVELOPE_ISSUED_AT');
  assert.equal(validateIpcEnvelope(framed({ commandId: '' }), CHANNEL).code, 'E_ENVELOPE_IDENTITY_MISSING');
  assert.equal(validateIpcEnvelope(framed({ payload: null }), CHANNEL).code, 'E_ENVELOPE_PAYLOAD_SHAPE');
});

test('property limit: unknown top-level keys are refused', () => {
  const verdict = validateIpcEnvelope(framed({ sneaky: true }), CHANNEL);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, 'E_ENVELOPE_KEY_UNKNOWN');
  assert.equal(verdict.detail, 'sneaky');
});

test('payload depth, breadth and byte budgets fail closed', () => {
  const deep = { payload: {} };
  let cursor = framed().payload;
  const root = framed({ payload: cursor });
  for (let i = 0; i < 12; i += 1) { cursor.next = {}; cursor = cursor.next; }
  assert.equal(validateIpcEnvelope(root, CHANNEL).code, 'E_ENVELOPE_DEPTH');

  const wide = {};
  for (let i = 0; i < 300; i += 1) wide[`k${i}`] = i;
  assert.equal(validateIpcEnvelope(framed({ payload: wide }), CHANNEL).code, 'E_ENVELOPE_BREADTH');

  const big = { data: 'x'.repeat(2 * 1024 * 1024) };
  assert.equal(validateIpcEnvelope(framed({ payload: big }), CHANNEL).code, 'E_ENVELOPE_BYTES');
});

test('createEnvelope frames version, correlation and identity', () => {
  const env = createEnvelope(CHANNEL, 'cmd.project.new', { x: 1 });
  assert.equal(env.v, ENVELOPE_VERSION);
  assert.equal(env.commandId, 'cmd.project.new');
  assert.equal(env.route, 'command.bus');
  assert.ok(env.correlationId.length >= 8);
  assert.ok(Number.isFinite(Date.parse(env.issuedAt)));
  assert.equal(validateIpcEnvelope(env, CHANNEL).ok, true);
  assert.throws(() => createEnvelope('ui:bogus', 'x', {}), (e) => e instanceof IpcEnvelopeError && e.code === 'E_ENVELOPE_CHANNEL_UNKNOWN');
});

test('timeout budget resolves inside the budget and rejects after it with discard', async () => {
  const fast = await withTimeoutBudget(() => Promise.resolve('done'), { timeoutMs: 1000, correlationId: 'c-1' });
  assert.equal(fast, 'done');

  let lateValue = null;
  await assert.rejects(
    withTimeoutBudget(() => new Promise((resolve) => setTimeout(() => {
      lateValue = 'late';
      resolve('late');
    }, 60)), { timeoutMs: 20, correlationId: 'c-2' }),
    (e) => e instanceof IpcEnvelopeError && e.code === 'E_BRIDGE_TIMEOUT',
  );
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(lateValue, 'late', 'underlying invoke completed late but its result was discarded');
  assert.throws(() => withTimeoutBudget(null, { timeoutMs: 10 }), (e) => e.code === 'E_BRIDGE_INVOKE_REQUIRED');
  assert.throws(() => withTimeoutBudget(() => 1, { timeoutMs: 0 }), (e) => e.code === 'E_BRIDGE_TIMEOUT_BUDGET_INVALID');
});
