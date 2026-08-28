'use strict';

// R2.4 S0 integration: the guarded registration factory over a fake ipcMain,
// forged versus genuine dispatch, plus the full-denominator source contract
// that no raw ipcMain registration remains in main.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createGuardedIpcRegistration,
  IpcCallerIdentityError,
} = require('../../src/core/ipc-caller-identity-v1.cjs');

const SHELL_URL = 'file:///Applications/yalken/renderer/index.html?USE_TIPTAP=1&PRODUCT_PROFILE=WRITER_LOCAL_V1&BRAND_IDENTITY=YALKEN_ORIGINAL_V1';
const SESSION = Object.freeze({ id: 'default' });
const CHANNELS = Object.freeze(['privileged:write', 'privileged:notify', 'x']);

function fakeIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle(channel, handler) { handlers.set(`handle:${channel}`, handler); },
    on(channel, handler) { handlers.set(`on:${channel}`, handler); },
    dispatch(kind, channel, event, ...args) {
      const handler = handlers.get(`${kind}:${channel}`);
      if (!handler) throw new Error('no handler');
      return handler(event, ...args);
    },
  };
}

const policy = {
  expectedFrameUrl: () => SHELL_URL,
  resolveLiveCaller: () => ({ senderId: 7, session: SESSION, currentUrl: SHELL_URL, allowedChannels: [...CHANNELS] }),
};

const genuine = () => ({
  sender: { id: 7, isDestroyed: () => false, session: SESSION },
  senderFrame: { url: SHELL_URL },
});

const forged = () => ({
  sender: { id: 31337, isDestroyed: () => false, session: SESSION },
  senderFrame: { url: 'https://evil.example/payload' },
});

test('guarded handle and on execute the handler only for genuine callers', () => {
  const ipc = fakeIpcMain();
  const guarded = createGuardedIpcRegistration(ipc, policy);
  let calls = 0;
  guarded.handle(' privileged:write ', (event, payload) => { calls += 1; return { ok: true, echo: payload }; });
  guarded.on('privileged:notify', () => { calls += 1; });

  const okResult = ipc.dispatch('handle', ' privileged:write ', genuine(), { a: 1 });
  assert.equal(okResult.ok, true);
  assert.equal(calls, 1);
  ipc.dispatch('on', 'privileged:notify', genuine());
  assert.equal(calls, 2);

  assert.throws(
    () => ipc.dispatch('handle', ' privileged:write ', forged(), { a: 2 }),
    (e) => e instanceof IpcCallerIdentityError && e.code === 'E_IPC_SENDER_MISMATCH',
  );
  assert.throws(
    () => ipc.dispatch('on', 'privileged:notify', forged()),
    (e) => e instanceof IpcCallerIdentityError,
  );
  assert.equal(calls, 2, 'forged callers never reach the handler body');
});

test('factory rejects a malformed ipcMain', () => {
  assert.throws(() => createGuardedIpcRegistration({}, policy), (e) => e.code === 'E_IPC_MAIN_SHAPE');
  assert.throws(() => createGuardedIpcRegistration(null, policy), (e) => e.code === 'E_IPC_MAIN_SHAPE');
});

test('guard adds negligible per-dispatch cost', () => {
  const ipc = fakeIpcMain();
  const guarded = createGuardedIpcRegistration(ipc, policy);
  guarded.on('x', () => {});
  const event = genuine();
  const start = process.hrtime.bigint();
  for (let i = 0; i < 50000; i += 1) ipc.dispatch('on', 'x', event);
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  assert.ok(elapsedMs < 500, `50k guarded dispatches took ${elapsedMs.toFixed(1)}ms`);
});

test('full denominator: main.js registers every privileged channel through the guarded factory only', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'main.js'), 'utf8');
  const rawHandle = (source.match(/ipcMain\.handle\(/g) || []).length;
  const rawOn = (source.match(/ipcMain\.on\(/g) || []).length;
  assert.equal(rawHandle, 0, 'no raw ipcMain.handle registration may remain in main.js');
  assert.equal(rawOn, 0, 'no raw ipcMain.on registration may remain in main.js');
  const guardedHandle = (source.match(/guardedHandle\(/g) || []).length;
  const guardedOn = (source.match(/guardedOn\(/g) || []).length;
  const protocolHandle = (source.match(/guardedProtocolHandle\(/g) || []).length;
  assert.ok(guardedHandle + protocolHandle >= 21, `guarded handle call sites ${guardedHandle}+${protocolHandle} >= 21`);
  assert.ok(guardedOn >= 9, `guardedOn call sites ${guardedOn} >= 9`);
  assert.ok(source.includes('createGuardedIpcRegistration(ipcMain, IPC_CALLER_IDENTITY_POLICY)'));
});

test('full denominator: worker intake validates the envelope before interpretation', () => {
  const worker = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'main', 'rtkDocxReturnIntakeWorker.cjs'), 'utf8');
  const validateIdx = worker.indexOf('validateWorkerIntakeEnvelope(message)');
  const unwrapIdx = worker.indexOf('unwrapParentPortMessage(message)');
  assert.ok(validateIdx !== -1 && unwrapIdx !== -1);
  assert.ok(validateIdx < unwrapIdx, 'envelope validation must precede unwrap/interpretation');
  assert.ok(worker.includes("require('../core/ipc-caller-identity-v1.cjs')"));
});
