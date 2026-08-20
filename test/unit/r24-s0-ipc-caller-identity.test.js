'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  IpcCallerIdentityError,
  assertIpcCallerIdentity,
  evaluateIpcCallerIdentity,
  validateWorkerIntakeEnvelope,
} = require('../../src/core/ipc-caller-identity-v1.cjs');

const SHELL_PREFIX = 'file:///Applications/yalken/renderer/index.html';

const goodEvent = () => ({
  sender: { id: 7, isDestroyed: () => false, session: { id: 'default' } },
  senderFrame: { url: `${SHELL_PREFIX}?v=1` },
});

const policy = (overrides = {}) => ({
  expectedSenderId: () => 7,
  allowedFrameUrlPrefixes: () => [SHELL_PREFIX],
  ...overrides,
});

test('genuine main-window caller passes', () => {
  const verdict = evaluateIpcCallerIdentity(goodEvent(), policy());
  assert.equal(verdict.ok, true);
  assert.equal(assertIpcCallerIdentity(goodEvent(), policy()), true);
});

test('missing event, policy or sender fail closed with typed codes', () => {
  assert.equal(evaluateIpcCallerIdentity(null, policy()).code, 'E_IPC_EVENT_MISSING');
  assert.equal(evaluateIpcCallerIdentity(goodEvent(), null).code, 'E_IPC_POLICY_MISSING');
  const noSender = { senderFrame: { url: SHELL_PREFIX } };
  assert.equal(evaluateIpcCallerIdentity(noSender, policy()).code, 'E_IPC_SENDER_MISSING');
});

test('foreign or unavailable sender identity is refused', () => {
  const foreign = goodEvent();
  foreign.sender.id = 99;
  assert.equal(evaluateIpcCallerIdentity(foreign, policy()).code, 'E_IPC_SENDER_MISMATCH');
  assert.equal(evaluateIpcCallerIdentity(goodEvent(), policy({ expectedSenderId: () => null })).code, 'E_IPC_CALLER_WINDOW_UNAVAILABLE');
  assert.equal(evaluateIpcCallerIdentity(goodEvent(), policy({ expectedSenderId: () => 1.5 })).code, 'E_IPC_POLICY_SENDER_ID_SHAPE');
});

test('destroyed sender is refused', () => {
  const dead = goodEvent();
  dead.sender.isDestroyed = () => true;
  assert.equal(evaluateIpcCallerIdentity(dead, policy()).code, 'E_IPC_SENDER_DESTROYED');
});

test('frame origin law: remote, data, about and missing frames are refused', () => {
  for (const url of ['https://evil.example/x', 'http://localhost:8080/index.html', 'data:text/html,<b>x</b>', 'about:blank', 'file:///etc/passwd']) {
    const event = goodEvent();
    event.senderFrame.url = url;
    assert.equal(evaluateIpcCallerIdentity(event, policy()).code, 'E_IPC_FRAME_ORIGIN_DENIED', url);
  }
  const noFrame = goodEvent();
  delete noFrame.senderFrame;
  assert.equal(evaluateIpcCallerIdentity(noFrame, policy()).code, 'E_IPC_FRAME_MISSING');
  assert.equal(evaluateIpcCallerIdentity(goodEvent(), policy({ allowedFrameUrlPrefixes: () => [] })).code, 'E_IPC_POLICY_PREFIXES_MISSING');
});

test('shell URL with query and hash passes the prefix law', () => {
  const event = goodEvent();
  event.senderFrame.url = `${SHELL_PREFIX}?scene=1#top`;
  assert.equal(evaluateIpcCallerIdentity(event, policy()).ok, true);
});

test('session binding enforced only when declared', () => {
  const sharedSession = { id: 'default' };
  const bound = policy({ expectedSessionId: () => sharedSession });
  const event = goodEvent();
  event.sender.session = sharedSession;
  assert.equal(evaluateIpcCallerIdentity(event, bound).ok, true);
  const mismatched = goodEvent();
  mismatched.sender.session = { id: 'other' };
  assert.equal(evaluateIpcCallerIdentity(mismatched, bound).code, 'E_IPC_SESSION_MISMATCH');
});

test('worker envelope law admits plain bounded payloads', () => {
  assert.equal(validateWorkerIntakeEnvelope({ op: 'intake', data: { text: 'x'.repeat(1000), list: [1, 2, 3] } }), true);
});

test('worker envelope law fails closed on shape, depth, breadth, cycle and size', () => {
  assert.throws(() => validateWorkerIntakeEnvelope(null), (e) => e instanceof IpcCallerIdentityError && e.code === 'E_WORKER_ENVELOPE_SHAPE');
  assert.throws(() => validateWorkerIntakeEnvelope([1, 2]), (e) => e.code === 'E_WORKER_ENVELOPE_SHAPE');
  const deep = {};
  let cursor = deep;
  for (let i = 0; i < 10; i += 1) { cursor.next = {}; cursor = cursor.next; }
  assert.throws(() => validateWorkerIntakeEnvelope(deep), (e) => e.code === 'E_WORKER_ENVELOPE_DEPTH');
  const wide = {};
  for (let i = 0; i < 100; i += 1) wide[`k${i}`] = i;
  assert.throws(() => validateWorkerIntakeEnvelope(wide), (e) => e.code === 'E_WORKER_ENVELOPE_BREADTH');
  const cyc = { a: 1 };
  cyc.self = cyc;
  assert.throws(() => validateWorkerIntakeEnvelope(cyc), (e) => e.code === 'E_WORKER_ENVELOPE_CYCLE');
  const big = { data: 'x'.repeat(5 * 1024 * 1024) };
  assert.throws(() => validateWorkerIntakeEnvelope(big), (e) => e.code === 'E_WORKER_ENVELOPE_BYTES');
});
