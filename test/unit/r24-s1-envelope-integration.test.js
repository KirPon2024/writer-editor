'use strict';

// R2.4 S1 integration: the envelope law driving a bridge-shaped dispatch and
// the full-denominator source contracts over main.js and preload.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createEnvelope,
  validateIpcEnvelope,
  withTimeoutBudget,
} = require('../../src/core/ipc-envelope-v1.cjs');

const CHANNELS = ['ui:command-bridge', 'ui:workspace-query-bridge', 'ui:save-lifecycle-signal-bridge'];
const ID_FIELDS = { 'ui:command-bridge': 'commandId', 'ui:workspace-query-bridge': 'queryId', 'ui:save-lifecycle-signal-bridge': 'signalId' };

test('both sides: createEnvelope output validates on the receiving side for all three bridges', () => {
  for (const channel of CHANNELS) {
    const idField = ID_FIELDS[channel];
    const envelope = createEnvelope(channel, `${idField}.test`, { sample: 'payload' });
    const verdict = validateIpcEnvelope(envelope, channel);
    assert.equal(verdict.ok, true, `${channel}: ${JSON.stringify(verdict)}`);
  }
});

test('a bridge-shaped dispatch refuses unframed payloads before interpretation', () => {
  const dispatchLog = [];
  const fakeHandler = (request) => {
    const verdict = validateIpcEnvelope(request, 'ui:command-bridge');
    if (!verdict.ok) return { ok: false, reason: verdict.code };
    dispatchLog.push(request.commandId);
    return { ok: true };
  };
  const legacy = { route: 'command.bus', commandId: 'cmd.project.new', payload: {} };
  assert.equal(fakeHandler(legacy).ok, false);
  assert.equal(dispatchLog.length, 0, 'unframed request never reaches interpretation');
  const framed = createEnvelope('ui:command-bridge', 'cmd.project.new', {});
  assert.equal(fakeHandler(framed).ok, true);
  assert.deepEqual(dispatchLog, ['cmd.project.new']);
});

test('timeout discards a late bridge result even when the invoke eventually resolves', async () => {
  const order = [];
  const invoke = () => new Promise((resolve) => setTimeout(() => {
    order.push('late-resolve');
    resolve({ ok: true });
  }, 50));
  await assert.rejects(
    withTimeoutBudget(invoke, { timeoutMs: 10, correlationId: 'corr-x' }),
    (e) => e.code === 'E_BRIDGE_TIMEOUT',
  );
  order.push('caller-moved-on');
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(order, ['caller-moved-on', 'late-resolve'], 'late result applied after caller moved on is discarded');
});

test('full denominator: every preload send to the three bridges is framed by createEnvelope', () => {
  const preload = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'preload.js'), 'utf8');
  const sends = preload.match(/ipcRenderer\.invoke\((UI_COMMAND_BRIDGE_CHANNEL|WORKSPACE_QUERY_BRIDGE_CHANNEL|SAVE_LIFECYCLE_SIGNAL_BRIDGE_CHANNEL)/g) || [];
  assert.ok(sends.length >= 5, `expected >=5 bridge sends, got ${sends.length}`);
  const framed = preload.match(/ipcRenderer\.invoke\((UI_COMMAND_BRIDGE_CHANNEL|WORKSPACE_QUERY_BRIDGE_CHANNEL|SAVE_LIFECYCLE_SIGNAL_BRIDGE_CHANNEL), envelope/g) || [];
  const framedDirect = preload.match(/ipcRenderer\.invoke\(SAVE_LIFECYCLE_SIGNAL_BRIDGE_CHANNEL, createEnvelope/g) || [];
  assert.equal(sends.length, framed.length + framedDirect.length, `unframed bridge sends: ${sends.length - framed.length - framedDirect.length}`);
  assert.ok(preload.includes("require('./core/ipc-envelope-v1.cjs')"));
});

test('full denominator: all three main-side bridge handlers validate the envelope first', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'main.js'), 'utf8');
  for (const channel of CHANNELS) {
    const handlerIdx = main.indexOf(`guardedHandle('${channel}'`);
    assert.ok(handlerIdx !== -1, channel);
    const validateIdx = main.indexOf(`validateIpcEnvelope(request, '${channel}')`, handlerIdx);
    assert.ok(validateIdx !== -1 && validateIdx - handlerIdx < 400, `envelope validation must head the handler: ${channel}`);
  }
});

test('envelope validation cost stays bounded on adversarial payloads', () => {
  const hostile = framedHostile();
  function framedHostile() {
    const payload = {};
    let cursor = payload;
    for (let i = 0; i < 7; i += 1) {
      cursor.children = [];
      for (let j = 0; j < 30; j += 1) cursor.children.push({ value: `x${j}` });
      cursor = cursor.children[0];
    }
    return createEnvelope('ui:command-bridge', 'cmd.project.new', payload);
  }
  const start = process.hrtime.bigint();
  for (let i = 0; i < 200; i += 1) validateIpcEnvelope(hostile, 'ui:command-bridge');
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  assert.ok(elapsedMs < 500, `200 hostile validations took ${elapsedMs.toFixed(1)}ms`);
});
