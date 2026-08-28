'use strict';

// R2.4 C6C/S0 implementation mutation suite. The mutants cover URL component
// admission, event/live equality, cache freshness/replay and handler ordering.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'ipc-caller-identity-v1.cjs');

function replaceOnce(source, find, replace, id) {
  const occurrences = source.split(find).length - 1;
  assert.equal(occurrences, 1, `mutant anchor must be unique: ${id}`);
  return source.replace(find, replace);
}

const MUTANTS = [
  {
    id: 'M01-starts-with-path-admission-restored',
    mutate: (source) => replaceOnce(
      source,
      "  if (left.pathname !== right.pathname) throw new IpcCallerIdentityError('E_IPC_FRAME_PATH_DENIED');",
      "  if (!left.pathname.startsWith(right.pathname)) throw new IpcCallerIdentityError('E_IPC_FRAME_PATH_DENIED');",
      'M01',
    ),
  },
  {
    id: 'M02-protocol-validation-removed',
    mutate: (source) => replaceOnce(
      replaceOnce(
        source,
        "  if (components.protocol !== 'file:') throw new IpcCallerIdentityError('E_IPC_FRAME_PROTOCOL_DENIED');",
        '  if (false) throw new IpcCallerIdentityError(\'E_IPC_FRAME_PROTOCOL_DENIED\');',
        'M02a',
      ),
      "  if (left.protocol !== right.protocol) throw new IpcCallerIdentityError('E_IPC_FRAME_PROTOCOL_DENIED');",
      '  if (false) throw new IpcCallerIdentityError(\'E_IPC_FRAME_PROTOCOL_DENIED\');',
      'M02b',
    ),
  },
  {
    id: 'M03-origin-authority-validation-removed',
    mutate: (source) => replaceOnce(
      replaceOnce(
        source,
        "  if (\n    components.origin !== 'null'\n    || components.username !== ''\n    || components.password !== ''\n    || components.hostname !== ''\n    || components.port !== ''\n  ) {\n    throw new IpcCallerIdentityError('E_IPC_FRAME_ORIGIN_DENIED');\n  }",
        '  if (false) { throw new IpcCallerIdentityError(\'E_IPC_FRAME_ORIGIN_DENIED\'); }',
        'M03a',
      ),
      "  if (\n    left.origin !== right.origin\n    || left.username !== right.username\n    || left.password !== right.password\n    || left.hostname !== right.hostname\n    || left.port !== right.port\n  ) throw new IpcCallerIdentityError('E_IPC_FRAME_ORIGIN_DENIED');",
      '  if (false) throw new IpcCallerIdentityError(\'E_IPC_FRAME_ORIGIN_DENIED\');',
      'M03b',
    ),
  },
  {
    id: 'M04-exact-path-validation-removed',
    mutate: (source) => replaceOnce(
      source,
      "  if (left.pathname !== right.pathname) throw new IpcCallerIdentityError('E_IPC_FRAME_PATH_DENIED');",
      '  if (false) throw new IpcCallerIdentityError(\'E_IPC_FRAME_PATH_DENIED\');',
      'M04',
    ),
  },
  {
    id: 'M05-query-value-validation-removed',
    mutate: (source) => replaceOnce(
      source,
      '    if (!rightQuery.has(key) || rightQuery.get(key) !== value) {',
      '    if (false) {',
      'M05',
    ),
  },
  {
    id: 'M06-hash-validation-removed',
    mutate: (source) => replaceOnce(
      replaceOnce(
        source,
        "  if (components.hash !== '') throw new IpcCallerIdentityError('E_IPC_FRAME_HASH_DENIED');",
        '  if (false) throw new IpcCallerIdentityError(\'E_IPC_FRAME_HASH_DENIED\');',
        'M06a',
      ),
      "  if (left.hash !== right.hash) throw new IpcCallerIdentityError('E_IPC_FRAME_HASH_DENIED');",
      '  if (false) throw new IpcCallerIdentityError(\'E_IPC_FRAME_HASH_DENIED\');',
      'M06b',
    ),
  },
  {
    id: 'M07-event-live-equality-removed',
    mutate: (source) => replaceOnce(
      source,
      '    assertSameStructuredUrl(eventUrl, liveUrl);',
      '    void eventUrl; void liveUrl;',
      'M07',
    ),
  },
  {
    id: 'M08-cached-authorization-verdict-replayed',
    mutate: (source) => replaceOnce(
      source,
      'function evaluateIpcCallerIdentity(event, policy, context = {}) {',
      "function evaluateIpcCallerIdentity(event, policy, context = {}) {\n  if (context.urlCache && context.urlCache.stats().hits > 0) return { ok: true, code: '' };",
      'M08',
    ),
  },
  {
    id: 'M09-live-resolver-skipped-on-cache-hit',
    mutate: (source) => replaceOnce(
      source,
      '    live = policy.resolveLiveCaller({ senderId: sender.id, channel });',
      "    live = context.urlCache && context.urlCache.stats().hits > 0\n      ? { senderId: sender.id, session: sender.session, currentUrl: policy.expectedFrameUrl(), allowedChannels: [channel] }\n      : policy.resolveLiveCaller({ senderId: sender.id, channel });",
      'M09',
    ),
  },
  {
    id: 'M10-session-revalidation-removed',
    mutate: (source) => replaceOnce(
      source,
      "  if (sender.session !== live.session) return fail('E_IPC_SESSION_MISMATCH');",
      "  if (false) return fail('E_IPC_SESSION_MISMATCH');",
      'M10',
    ),
  },
  {
    id: 'M11-live-channel-revalidation-removed',
    mutate: (source) => replaceOnce(
      source,
      "  if (!live.allowedChannels.includes(channel)) return fail('E_IPC_CHANNEL_NOT_ALLOWED');",
      "  if (false) return fail('E_IPC_CHANNEL_NOT_ALLOWED');",
      'M11',
    ),
  },
  {
    id: 'M13-cache-ttl-expiry-removed',
    mutate: (source) => replaceOnce(source, '      if (age >= 0 && age <= ttlMs) {', '      if (age >= 0) {', 'M13'),
  },
  {
    id: 'M14-cache-fifo-bound-removed',
    mutate: (source) => replaceOnce(source, '    while (entries.size > maxEntries) {', '    while (false) {', 'M14'),
  },
  {
    id: 'M15-validation-failure-cached',
    mutate: (source) => replaceOnce(
      source,
      '    const components = parseStructuredIpcFrameUrl(rawUrl);\n    validate(components);\n    entries.set(rawUrl, Object.freeze({ components, observedAt }));',
      '    const components = parseStructuredIpcFrameUrl(rawUrl);\n    entries.set(rawUrl, Object.freeze({ components, observedAt }));\n    validate(components);',
      'M15',
    ),
  },
  {
    id: 'M16-handler-identity-order-removed',
    mutate: (source) => {
      const anchor = '        assertIpcCallerIdentity(event, policy, { channel, urlCache });';
      const count = source.split(anchor).length - 1;
      assert.equal(count, 2, 'M16 handle/on anchors');
      return source.split(anchor).join('        void event;');
    },
  },
];

const SHELL_URL = 'file:///app/index.html?USE_TIPTAP=1&PRODUCT_PROFILE=WRITER_LOCAL_V1&BRAND_IDENTITY=YALKEN_ORIGINAL_V1';
const SESSION = Object.freeze({ id: 'session-a' });
const CHANNELS = Object.freeze(['x', 'y']);

function killOracle(module) {
  const {
    IPC_URL_CACHE_MAX_ENTRIES,
    IPC_URL_CACHE_TTL_MS,
    IpcCallerIdentityError,
    createBoundedIpcUrlParseCache,
    createGuardedIpcRegistration,
    evaluateIpcCallerIdentity,
  } = module;
  let live = { senderId: 7, session: SESSION, currentUrl: SHELL_URL, allowedChannels: [...CHANNELS] };
  const policy = {
    expectedFrameUrl: () => SHELL_URL,
    resolveLiveCaller: () => live,
  };
  const context = (urlCache) => ({ channel: 'x', ...(urlCache ? { urlCache } : {}) });
  const genuine = () => ({ sender: { id: 7, isDestroyed: () => false, session: SESSION }, senderFrame: { url: SHELL_URL } });
  const evaluateUrl = (url) => {
    const event = genuine();
    event.senderFrame.url = url;
    return evaluateIpcCallerIdentity(event, policy, context());
  };

  assert.equal(evaluateIpcCallerIdentity(genuine(), policy, context()).ok, true);
  assert.equal(evaluateUrl(SHELL_URL.replace('/index.html?', '/index.html/extra/index.html?')).code, 'E_IPC_FRAME_PATH_DENIED');
  assert.equal(evaluateUrl(SHELL_URL.replace('file:///', 'https://evil.example/')).code, 'E_IPC_FRAME_PROTOCOL_DENIED');
  assert.equal(evaluateUrl(SHELL_URL.replace('file:///', 'file://evil.example/')).code, 'E_IPC_FRAME_ORIGIN_DENIED');
  assert.equal(evaluateUrl(SHELL_URL.replace('/index.html?', '/foreign/index.html?')).code, 'E_IPC_FRAME_PATH_DENIED');
  assert.equal(evaluateUrl(SHELL_URL.replace('USE_TIPTAP=1', 'USE_TIPTAP=0')).code, 'E_IPC_FRAME_QUERY_DENIED');
  assert.equal(evaluateUrl(`${SHELL_URL}#top`).code, 'E_IPC_FRAME_HASH_DENIED');

  const sharedCache = createBoundedIpcUrlParseCache();
  assert.equal(evaluateIpcCallerIdentity(genuine(), policy, context(sharedCache)).ok, true);
  live = { ...live, session: { id: 'rotated' } };
  assert.equal(evaluateIpcCallerIdentity(genuine(), policy, context(sharedCache)).code, 'E_IPC_SESSION_MISMATCH');
  live = { senderId: 7, session: SESSION, currentUrl: SHELL_URL, allowedChannels: [] };
  assert.equal(evaluateIpcCallerIdentity(genuine(), policy, context(sharedCache)).code, 'E_IPC_CHANNEL_NOT_ALLOWED');
  live = null;
  assert.equal(evaluateIpcCallerIdentity(genuine(), policy, context(sharedCache)).code, 'E_IPC_CALLER_WINDOW_UNAVAILABLE');
  live = { senderId: 7, session: SESSION, currentUrl: SHELL_URL, allowedChannels: [...CHANNELS] };

  let now = 0;
  const cache = createBoundedIpcUrlParseCache({ maxEntries: IPC_URL_CACHE_MAX_ENTRIES, ttlMs: IPC_URL_CACHE_TTL_MS, now: () => now });
  const first = cache.resolve('file:///tmp/first.html');
  now = IPC_URL_CACHE_TTL_MS + 1;
  assert.notStrictEqual(cache.resolve('file:///tmp/first.html'), first);
  for (let index = 0; index <= IPC_URL_CACHE_MAX_ENTRIES; index += 1) cache.resolve(`file:///tmp/${index}.html`);
  assert.equal(cache.size(), IPC_URL_CACHE_MAX_ENTRIES);
  const beforeRejected = cache.size();
  assert.throws(
    () => cache.resolve('file:///tmp/rejected.html', () => { throw new IpcCallerIdentityError('E_REJECTED'); }),
    (error) => error.code === 'E_REJECTED',
  );
  assert.equal(cache.size(), beforeRejected);

  const handlers = new Map();
  const ipc = { handle: (channel, handler) => handlers.set(channel, handler), on: (channel, handler) => handlers.set(channel, handler) };
  const guarded = createGuardedIpcRegistration(ipc, policy);
  let calls = 0;
  guarded.on('x', () => { calls += 1; });
  guarded.handle('y', () => { calls += 10; });
  const foreign = genuine();
  foreign.sender.id = 99;
  assert.throws(() => handlers.get('x')(foreign), (error) => error instanceof IpcCallerIdentityError);
  assert.throws(() => handlers.get('y')(foreign), (error) => error instanceof IpcCallerIdentityError);
  handlers.get('x')(genuine());
  handlers.get('y')(genuine());
  assert.equal(calls, 11);
}

test('C6C/S0 law module: all structured URL, freshness and replay mutants are killed', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  killOracle(require(MODULE_PATH));
  const results = [];
  for (const mutant of MUTANTS) {
    const mutated = mutant.mutate(source);
    assert.notEqual(mutated, source, `mutant must alter source: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-c6c-s0-mutant-'));
    const target = path.join(dir, 'ipc-caller-identity-v1.cjs');
    fs.writeFileSync(target, mutated);
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
  const survived = results.filter((result) => !result.killed);
  console.log(`R24_C6C_S0_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((item) => item.id), score: results.length ? (results.length - survived.length) / results.length : 0 })}`);
  assert.equal(results.length, 15, 'M12 is the main-process wiring mutant in WP-101');
  assert.deepEqual(survived, []);
});
