'use strict';

// R2.4 WP-102 operation classes: the class registry is closed and distinct,
// and cross-class injection is refused at every bridge.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const {
  BRIDGE_PROTOCOL_REGISTRY,
  OPERATION_CLASSES,
  CommandProtocolError,
  bridgeOperationClass,
} = require(path.join(ROOT, 'src', 'core', 'command-protocol-v1.cjs'));

test('operation classes are closed, distinct and frozen', () => {
  const values = Object.values(OPERATION_CLASSES);
  assert.deepEqual([...values].sort(), ['BACKGROUND_JOB', 'COMMAND', 'EFFECT', 'EVENT', 'QUERY']);
  assert.equal(new Set(values).size, 5, 'classes never collapse into one another');
  assert.equal(Object.isFrozen(OPERATION_CLASSES), true);
  assert.equal(Object.isFrozen(BRIDGE_PROTOCOL_REGISTRY), true);
});

test('bridge registry binds each payload channel to exactly one class and id field', () => {
  assert.equal(bridgeOperationClass('ui:command-bridge'), 'COMMAND');
  assert.equal(bridgeOperationClass('ui:workspace-query-bridge'), 'QUERY');
  assert.equal(bridgeOperationClass('ui:save-lifecycle-signal-bridge'), 'COMMAND');
  for (const channel of Object.keys(BRIDGE_PROTOCOL_REGISTRY)) {
    assert.equal(typeof BRIDGE_PROTOCOL_REGISTRY[channel].idField, 'string');
  }
  assert.throws(() => bridgeOperationClass('ui:unknown-bridge'), (e) => e instanceof CommandProtocolError && e.code === 'E_PROTOCOL_CHANNEL_UNKNOWN');
});

test('cross-class injection: command ids and query ids ride disjoint allowlists', () => {
  const mainSource = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');

  const bridgeStart = mainSource.indexOf('const UI_COMMAND_BRIDGE_ALLOWED_COMMAND_IDS = new Set([');
  assert.notEqual(bridgeStart, -1);
  const bridgeEnd = mainSource.indexOf(']);', bridgeStart);
  const commandIds = new Set([...mainSource.slice(bridgeStart, bridgeEnd).matchAll(/'([^']+)'/gu)].map((m) => m[1]));
  assert.equal(commandIds.size > 0, true, 'zero denominator forbidden');

  const queryStart = mainSource.indexOf('const WORKSPACE_QUERY_BRIDGE_HANDLERS = new Map([');
  assert.notEqual(queryStart, -1);
  const queryEnd = mainSource.indexOf(']);', queryStart);
  const queryIds = new Set([...mainSource.slice(queryStart, queryEnd).matchAll(/^\s*\[([A-Z0-9_]+),/gmu)].map((m) => m[1]));
  assert.equal(queryIds.size > 0, true, 'zero query denominator forbidden');

  const signalStart = mainSource.indexOf('const SAVE_LIFECYCLE_SIGNAL_BRIDGE_ALLOWED_SIGNAL_IDS = new Set([');
  assert.notEqual(signalStart, -1);
  const signalEnd = mainSource.indexOf(']);', signalStart);
  const signalIds = new Set([...mainSource.slice(signalStart, signalEnd).matchAll(/'([^']+)'/gu)].map((m) => m[1]));

  for (const id of commandIds) {
    assert.equal(id.startsWith('query.'), false, `command bridge admits a query-class id: ${id}`);
    assert.equal(signalIds.has(id), false, `command id also registered as signal: ${id}`);
  }
  for (const id of signalIds) {
    assert.equal(commandIds.has(id), false, `signal id also admitted as command: ${id}`);
    assert.equal(id.startsWith('signal.'), true, `signal bridge admits a non-signal id: ${id}`);
  }
  console.log(`R24_WP102_CLASSES=${JSON.stringify({ commandIds: commandIds.size, queryHandlers: queryIds.size, signalIds: signalIds.size })}`);
});

test('class pollution hostile payloads carry no class authority', () => {
  // A payload that claims a class never changes the bridge's bound class.
  assert.equal(bridgeOperationClass('ui:workspace-query-bridge'), 'QUERY');
  const forged = { channel: 'ui:workspace-query-bridge', operationClass: 'COMMAND' };
  assert.equal(bridgeOperationClass(forged.channel), 'QUERY', 'payload-supplied class is ignored');
});
