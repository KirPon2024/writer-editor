'use strict';

// R2.4 S0 implementation mutation suite for the IPC caller identity law.
// Every mutant sabotages one enforcement conjunct; the kill oracle replays
// the law's probes. Survivors fail this suite.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'ipc-caller-identity-v1.cjs');

const MUTANTS = [
  {
    id: 'sender-mismatch-ignored',
    find: 'if (sender.id !== expectedId) return { ok: false, code: \'E_IPC_SENDER_MISMATCH\' };',
    replace: "if (false) return { ok: false, code: 'E_IPC_SENDER_MISMATCH' };",
  },
  {
    id: 'frame-origin-check-removed',
    find: 'if (!prefixes.some((prefix) => frame.url.startsWith(prefix))) {',
    replace: 'if (false) {',
  },
  {
    id: 'destroyed-check-removed',
    find: "if (typeof sender.isDestroyed === 'function' && sender.isDestroyed()) {",
    replace: 'if (false) {',
  },
  {
    id: 'session-mismatch-ignored',
    find: 'if (expectedSession !== undefined && sender.session !== expectedSession) {',
    replace: 'if (false) {',
  },
  {
    id: 'envelope-depth-ignored',
    find: "if (depth > maxDepth) throw new IpcCallerIdentityError('E_WORKER_ENVELOPE_DEPTH');",
    replace: "if (false) throw new IpcCallerIdentityError('E_WORKER_ENVELOPE_DEPTH');",
  },
  {
    id: 'factory-handle-guard-removed',
    find: "    handle(channel, handler) {\n      ipcMainLike.handle(channel, (event, ...args) => {\n        assertIpcCallerIdentity(event, policy);",
    replace: "    handle(channel, handler) {\n      ipcMainLike.handle(channel, (event, ...args) => {\n        void event;",
  },
  {
    id: 'factory-on-guard-removed',
    find: "    on(channel, handler) {\n      ipcMainLike.on(channel, (event, ...args) => {\n        assertIpcCallerIdentity(event, policy);",
    replace: "    on(channel, handler) {\n      ipcMainLike.on(channel, (event, ...args) => {\n        void event;",
  },
];

const SHELL_PREFIX = 'file:///app/index.html';

function killOracle(module) {
  const {
    IpcCallerIdentityError,
    evaluateIpcCallerIdentity,
    validateWorkerIntakeEnvelope,
    createGuardedIpcRegistration,
  } = module;
  const policy = { expectedSenderId: () => 7, allowedFrameUrlPrefixes: () => [SHELL_PREFIX], expectedSessionId: () => 's' };
  const genuine = { sender: { id: 7, isDestroyed: () => false, session: 's' }, senderFrame: { url: SHELL_PREFIX } };
  assert.equal(evaluateIpcCallerIdentity(genuine, policy).ok, true);
  const badId = { sender: { id: 9, isDestroyed: () => false, session: 's' }, senderFrame: { url: SHELL_PREFIX } };
  assert.equal(evaluateIpcCallerIdentity(badId, policy).code, 'E_IPC_SENDER_MISMATCH');
  const badOrigin = { sender: { id: 7, isDestroyed: () => false, session: 's' }, senderFrame: { url: 'https://evil.example' } };
  assert.equal(evaluateIpcCallerIdentity(badOrigin, policy).code, 'E_IPC_FRAME_ORIGIN_DENIED');
  const dead = { sender: { id: 7, isDestroyed: () => true, session: 's' }, senderFrame: { url: SHELL_PREFIX } };
  assert.equal(evaluateIpcCallerIdentity(dead, policy).code, 'E_IPC_SENDER_DESTROYED');
  const badSession = { sender: { id: 7, isDestroyed: () => false, session: 'other' }, senderFrame: { url: SHELL_PREFIX } };
  assert.equal(evaluateIpcCallerIdentity(badSession, policy).code, 'E_IPC_SESSION_MISMATCH');
  const deep = {};
  let cursor = deep;
  for (let i = 0; i < 10; i += 1) { cursor.next = {}; cursor = cursor.next; }
  assert.throws(() => validateWorkerIntakeEnvelope(deep), (e) => e instanceof IpcCallerIdentityError);
  const handlers = new Map();
  const ipc = {
    handle: (ch, h) => handlers.set(ch, h),
    on: (ch, h) => handlers.set(ch, h),
  };
  const guarded = createGuardedIpcRegistration(ipc, policy);
  let calls = 0;
  guarded.on('x', () => { calls += 1; });
  guarded.handle('y', () => { calls += 10; });
  const onHandler = handlers.get('x');
  const handleHandler = handlers.get('y');
  assert.throws(() => onHandler(badId), (e) => e instanceof IpcCallerIdentityError);
  assert.throws(() => handleHandler(badId), (e) => e instanceof IpcCallerIdentityError);
  onHandler(genuine);
  handleHandler(genuine);
  assert.equal(calls, 11);
}

test('S0 law module: all implementation mutants are executed and killed', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-s0-mutant-'));
    const target = path.join(dir, 'ipc-caller-identity-v1.cjs');
    fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
    let killed = false;
    let detail = '';
    try {
      killOracle(require(target));
      detail = 'survived';
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    }
    results.push({ id: mutant.id, killed, detail });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const survived = results.filter((r) => !r.killed);
  console.log(`R24_S0_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((s) => s.id), score: results.length ? (results.length - survived.length) / results.length : 0 })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
