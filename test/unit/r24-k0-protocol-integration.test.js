'use strict';

// R2.4 K0 integration: the protocol normalizer on the guarded bridge path and
// the full-denominator source contract over main.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  bridgeOperationClass,
  normalizeProtocolResult,
  OPERATION_CLASSES,
} = require('../../src/core/command-protocol-v1.cjs');
const { createGuardedIpcRegistration } = require('../../src/core/ipc-caller-identity-v1.cjs');
const { validateIpcEnvelope, createEnvelope } = require('../../src/core/ipc-envelope-v1.cjs');

const SHELL_URL = 'file:///app/index.html?USE_TIPTAP=1&PRODUCT_PROFILE=WRITER_LOCAL_V1&BRAND_IDENTITY=YALKEN_ORIGINAL_V1';
const SHARED_SESSION = Object.freeze({ partition: 'default' });

test('end-to-end bridge shape: caller fence, envelope law, then unified protocol refusal', async () => {
  const ipc = {
    handlers: new Map(),
    handle(channel, handler) { this.handlers.set(channel, handler); },
    on() {},
  };
  const policy = {
    expectedFrameUrl: () => SHELL_URL,
    resolveLiveCaller: () => ({ senderId: 1, session: SHARED_SESSION, currentUrl: SHELL_URL, allowedChannels: ['ui:command-bridge'] }),
  };
  const guarded = createGuardedIpcRegistration(ipc, policy);
  const guardedProtocolHandle = (channel, handler) => guarded.handle(channel, async (event, request) => {
    const verdict = validateIpcEnvelope(request, channel);
    if (!verdict.ok) return normalizeProtocolResult({ ok: false, error: verdict.code });
    return normalizeProtocolResult(await handler(event, request));
  });
  guardedProtocolHandle('ui:command-bridge', async () => ({ ok: false, reason: 'COMMAND_ID_NOT_ALLOWED' }));

  const genuine = { sender: { id: 1, isDestroyed: () => false, session: SHARED_SESSION }, senderFrame: { url: SHELL_URL } };
  const handler = ipc.handlers.get('ui:command-bridge');

  let forgedCode = '';
  try {
    await handler({ sender: { id: 9, isDestroyed: () => false, session: SHARED_SESSION }, senderFrame: { url: SHELL_URL } }, createEnvelope('ui:command-bridge', 'x', {}));
  } catch (error) {
    forgedCode = error && error.code ? error.code : '';
  }
  assert.equal(forgedCode, 'E_IPC_SENDER_MISMATCH');

  const unframed = await handler(genuine, { route: 'command.bus', commandId: 'x', payload: {} });
  assert.equal(unframed.ok, false);
  assert.equal(unframed.code, 'E_ENVELOPE_VERSION');
  assert.equal(unframed.reason, 'E_ENVELOPE_VERSION');

  const refused = await handler(genuine, createEnvelope('ui:command-bridge', 'x', {}));
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'COMMAND_ID_NOT_ALLOWED');
  assert.equal(refused.reason, 'COMMAND_ID_NOT_ALLOWED');
});

test('operation class law holds on the registry for all three channels', () => {
  assert.equal(bridgeOperationClass('ui:command-bridge'), OPERATION_CLASSES.COMMAND);
  assert.equal(bridgeOperationClass('ui:workspace-query-bridge'), OPERATION_CLASSES.QUERY);
  assert.notEqual(bridgeOperationClass('ui:workspace-query-bridge'), bridgeOperationClass('ui:command-bridge'));
});

test('full denominator: all three bridge registrations use the protocol wrapper', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'main.js'), 'utf8');
  for (const channel of ['ui:command-bridge', 'ui:workspace-query-bridge', 'ui:save-lifecycle-signal-bridge']) {
    assert.ok(main.includes(`guardedProtocolHandle('${channel}'`), `protocol wrapper for ${channel}`);
  }
  assert.ok(main.includes("require('./core/command-protocol-v1.cjs')"));
  assert.ok(main.includes('return normalizeProtocolResult(result);'));
});

test('protocol normalization is O(1) at scale', () => {
  const start = process.hrtime.bigint();
  for (let i = 0; i < 100000; i += 1) {
    normalizeProtocolResult({ ok: false, reason: `E_${i % 7}` });
  }
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  assert.ok(elapsedMs < 500, `100k normalizations took ${elapsedMs.toFixed(1)}ms`);
});
