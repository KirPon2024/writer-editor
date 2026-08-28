'use strict';

// R2.4 WP-101 IPC admission: full privileged denominator through the
// sender/frame/origin/session/capability gateway.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const {
  IpcCallerIdentityError,
  IPC_CHANNEL_CAPABILITY_CLASSES,
  createCapabilityBoundRegistration,
  createGuardedIpcRegistration,
  evaluateIpcCallerIdentity,
} = require(path.join(ROOT, 'src', 'core', 'ipc-caller-identity-v1.cjs'));

const SHELL_URL = 'file:///app/index.html?USE_TIPTAP=1&PRODUCT_PROFILE=WRITER_LOCAL_V1&BRAND_IDENTITY=YALKEN_ORIGINAL_V1';
const SHARED_SESSION = { partition: 'persist:default' };
const CREATE_NODE_CHANNEL = 'ui:create-node';

const policyWithSession = {
  expectedFrameUrl: () => SHELL_URL,
  resolveLiveCaller: () => ({
    senderId: 7,
    session: SHARED_SESSION,
    currentUrl: SHELL_URL,
    allowedChannels: [CREATE_NODE_CHANNEL],
  }),
};

function makeEvent(overrides = {}) {
  return {
    sender: { id: 7, isDestroyed: () => false, session: SHARED_SESSION },
    senderFrame: { url: SHELL_URL },
    ...overrides,
  };
}

test('session dimension: matching session passes, foreign session is a typed refusal', () => {
  assert.equal(evaluateIpcCallerIdentity(makeEvent(), policyWithSession, { channel: CREATE_NODE_CHANNEL }).ok, true);
  const foreign = makeEvent({ sender: { id: 7, isDestroyed: () => false, session: { partition: 'persist:other' } } });
  const verdict = evaluateIpcCallerIdentity(foreign, policyWithSession, { channel: CREATE_NODE_CHANNEL });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, 'E_IPC_SESSION_MISMATCH');
  const noSession = makeEvent({ sender: { id: 7, isDestroyed: () => false, session: undefined } });
  assert.equal(evaluateIpcCallerIdentity(noSession, policyWithSession, { channel: CREATE_NODE_CHANNEL }).ok, false, 'a caller without the session is refused when the policy binds one');
});

test('capability dimension: unbound channel fails closed at registration with a typed code', () => {
  const fake = { handle() {}, on() {} };
  const bound = createCapabilityBoundRegistration(fake, { 'file:open': 'fs.read' });
  assert.throws(
    () => bound.handle('ui:create-node', () => {}),
    (e) => e instanceof IpcCallerIdentityError && e.code === 'E_IPC_CHANNEL_CAPABILITY_UNBOUND',
  );
  assert.throws(
    () => bound.on('dirty-changed', () => {}),
    (e) => e.code === 'E_IPC_CHANNEL_CAPABILITY_UNBOUND',
  );
  assert.equal(bound.capabilityClassOf('file:open'), 'fs.read');
  assert.equal(bound.capabilityClassOf(' file:open '), 'fs.read', 'channel names normalize');
  assert.equal(bound.capabilityClassOf('unknown'), '');
});

test('capability map validation: unknown class, empty channel and empty map are typed refusals', () => {
  const fake = { handle() {}, on() {} };
  assert.throws(
    () => createCapabilityBoundRegistration(fake, { 'file:open': 'fs.everything' }),
    (e) => e.code === 'E_IPC_CAPABILITY_CLASS_UNKNOWN',
  );
  assert.throws(
    () => createCapabilityBoundRegistration(fake, { '': 'fs.read' }),
    (e) => e.code === 'E_IPC_CAPABILITY_CHANNEL_EMPTY',
  );
  assert.throws(
    () => createCapabilityBoundRegistration(fake, {}),
    (e) => e.code === 'E_IPC_CAPABILITY_MAP_EMPTY',
  );
  assert.throws(
    () => createCapabilityBoundRegistration(fake, null),
    (e) => e.code === 'E_IPC_CAPABILITY_MAP_SHAPE',
  );
});

test('composed gateway: identity still runs first at dispatch under a capability-bound registration', () => {
  const registrations = new Map();
  const fakeIpc = {
    handle(channel, handler) { registrations.set(channel, handler); },
    on(channel, handler) { registrations.set(channel, handler); },
  };
  const guarded = createGuardedIpcRegistration(fakeIpc, policyWithSession);
  const bound = createCapabilityBoundRegistration(guarded, { 'ui:create-node': 'project.mutation' });
  let calls = 0;
  bound.handle('ui:create-node', () => { calls += 1; return { ok: true }; });
  const handler = registrations.get('ui:create-node');
  assert.equal(typeof handler, 'function');
  assert.throws(() => handler(makeEvent({
    sender: { id: 31337, isDestroyed: () => false, session: SHARED_SESSION },
    senderFrame: { url: 'https://evil.example/' },
  })), (e) => e instanceof IpcCallerIdentityError);
  assert.equal(calls, 0, 'forged caller never reaches the handler under the bound gateway');
  handler(makeEvent());
  assert.equal(calls, 1);
});

const EXPECTED_CHANNELS = [
  'file:open', 'file:save', 'file:save-as',
  'u:cmd:project:export:docxMin:v1',
  'm:cmd:project:import:markdownV1:v1', 'm:cmd:project:export:markdownV1:v1',
  'm:cmd:project:flow:open:v1', 'm:cmd:project:flow:save:v1',
  'ui:create-node', 'ui:delete-node', 'ui:move-node', 'ui:rename-node', 'ui:reorder-node',
  'ui:get-collab-scope-local', 'ui:get-project-tree', 'ui:open-document', 'ui:open-section',
  'ui:request-autosave',
  'ui:command-bridge', 'ui:workspace-query-bridge', 'ui:save-lifecycle-signal-bridge',
  'ui:window-minimize', 'ui:set-theme', 'ui:set-font', 'ui:set-font-size', 'ui:font-size',
  'editor:text-response', 'editor:snapshot-response', 'dirty-changed', 'editor:paste-focus-state',
];

function scanAdmissionWiring(mainSource) {
  const violations = [];
  if (!mainSource.includes('createGuardedIpcRegistration(ipcMain, IPC_CALLER_IDENTITY_POLICY)')) {
    violations.push({ law: 'S0_FACTORY', detail: 'pinned guarded factory call missing' });
  }
  if (!mainSource.includes('createCapabilityBoundRegistration(GUARDED_IPC_REGISTRATION, IPC_CHANNEL_CAPABILITY_CLASS)')) {
    violations.push({ law: 'CAPABILITY_WRAP', detail: 'capability-bound registration wrap missing' });
  }
  if (!mainSource.includes('resolveLiveCaller: () => {')) {
    violations.push({ law: 'LIVE_CALLER_BINDING', detail: 'live policy does not resolve one dispatch-time caller snapshot' });
  }
  if (!mainSource.includes('const shell = mainWindow.webContents;')) {
    violations.push({ law: 'MAIN_WINDOW_ONLY', detail: 'live policy is not bound to mainWindow.webContents' });
  }
  if (!mainSource.includes('expectedFrameUrl: getExpectedIpcShellUrl')) {
    violations.push({ law: 'STRUCTURED_URL_BINDING', detail: 'live policy does not bind the exact expected shell URL' });
  }
  if (mainSource.includes('webContents.getAllWebContents')) {
    violations.push({ law: 'GENERIC_WEBCONTENTS_ENUMERATION', detail: 'generic webContents enumeration remains' });
  }
  const mapStart = mainSource.indexOf('const IPC_CHANNEL_CAPABILITY_CLASS = Object.freeze({');
  const mapEnd = mapStart === -1 ? -1 : mainSource.indexOf('});', mapStart);
  const mapBody = mapStart === -1 || mapEnd === -1 ? '' : mainSource.slice(mapStart, mapEnd);
  const bound = new Set([...mapBody.matchAll(/'([^']+)':\s*'([a-z.]+)'/gu)].map((m) => m[1]));
  for (const channel of EXPECTED_CHANNELS) {
    if (!bound.has(channel)) violations.push({ law: 'CAPABILITY_DENOMINATOR', detail: `channel unbound: ${channel}` });
  }
  for (const cls of [...mapBody.matchAll(/':\s*'([a-z.]+)'/gu)].map((m) => m[1])) {
    if (!IPC_CHANNEL_CAPABILITY_CLASSES.includes(cls)) violations.push({ law: 'CAPABILITY_CLASS', detail: `unknown class: ${cls}` });
  }
  return { violations, denominator: EXPECTED_CHANNELS.length };
}

test('full privileged denominator: all 30 registrations are capability-bound and session-bound in the live wiring', () => {
  const mainSource = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  const { violations, denominator } = scanAdmissionWiring(mainSource);
  console.log(`R24_WP101_DENOMINATOR=${JSON.stringify({ registrations: denominator, violations: violations.length })}`);
  assert.equal(denominator, 30, 'full privileged denominator');
  assert.deepEqual(violations, []);
});

module.exports = { scanAdmissionWiring, EXPECTED_CHANNELS };
