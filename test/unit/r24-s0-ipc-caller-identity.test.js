'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  IPC_FRAME_URL_MAX_BYTES,
  IPC_URL_CACHE_MAX_ENTRIES,
  IPC_URL_CACHE_TTL_MS,
  IpcCallerIdentityError,
  assertIpcCallerIdentity,
  createBoundedIpcUrlParseCache,
  evaluateIpcCallerIdentity,
  parseStructuredIpcFrameUrl,
  validateWorkerIntakeEnvelope,
} = require('../../src/core/ipc-caller-identity-v1.cjs');

const CHANNEL = 'file:open';
const SHELL_PATH = 'file:///Applications/yalken/renderer/index.html';
const SHELL_QUERY = Object.freeze({
  USE_TIPTAP: '1',
  PRODUCT_PROFILE: 'WRITER_LOCAL_V1',
  BRAND_IDENTITY: 'YALKEN_ORIGINAL_V1',
});
const SESSION = Object.freeze({ id: 'default' });

function shellUrl(query = SHELL_QUERY, hash = '') {
  const url = new URL(SHELL_PATH);
  for (const [key, value] of Object.entries(query)) url.searchParams.append(key, value);
  url.hash = hash;
  return url.href;
}

const EXPECTED_URL = shellUrl();

const goodEvent = () => ({
  sender: { id: 7, isDestroyed: () => false, session: SESSION },
  senderFrame: { url: EXPECTED_URL },
});

const policy = (overrides = {}) => ({
  expectedFrameUrl: () => EXPECTED_URL,
  resolveLiveCaller: () => ({
    senderId: 7,
    session: SESSION,
    currentUrl: EXPECTED_URL,
    allowedChannels: [CHANNEL],
  }),
  ...overrides,
});

const evaluate = (event = goodEvent(), policyValue = policy(), context = {}) => (
  evaluateIpcCallerIdentity(event, policyValue, { channel: CHANNEL, ...context })
);

test('genuine main-window caller passes and query ordering is structurally equivalent', () => {
  assert.equal(evaluate().ok, true);
  assert.equal(assertIpcCallerIdentity(goodEvent(), policy(), { channel: CHANNEL }), true);
  const reordered = goodEvent();
  reordered.senderFrame.url = shellUrl({
    BRAND_IDENTITY: SHELL_QUERY.BRAND_IDENTITY,
    USE_TIPTAP: SHELL_QUERY.USE_TIPTAP,
    PRODUCT_PROFILE: SHELL_QUERY.PRODUCT_PROFILE,
  });
  assert.equal(evaluate(reordered).ok, true);
});

test('missing event, policy, sender, frame, channel or live policy fail closed', () => {
  assert.equal(evaluateIpcCallerIdentity(null, policy(), { channel: CHANNEL }).code, 'E_IPC_EVENT_MISSING');
  assert.equal(evaluateIpcCallerIdentity(goodEvent(), null, { channel: CHANNEL }).code, 'E_IPC_POLICY_MISSING');
  assert.equal(evaluateIpcCallerIdentity({ senderFrame: { url: EXPECTED_URL } }, policy(), { channel: CHANNEL }).code, 'E_IPC_SENDER_MISSING');
  assert.equal(evaluateIpcCallerIdentity({ sender: goodEvent().sender }, policy(), { channel: CHANNEL }).code, 'E_IPC_FRAME_MISSING');
  assert.equal(evaluateIpcCallerIdentity(goodEvent(), policy()).code, 'E_IPC_CHANNEL_MISSING');
  assert.equal(evaluate(goodEvent(), { expectedFrameUrl: () => EXPECTED_URL }).code, 'E_IPC_POLICY_LIVE_CALLER_MISSING');
  assert.equal(evaluate(goodEvent(), { resolveLiveCaller: () => null }).code, 'E_IPC_POLICY_EXPECTED_URL_MISSING');
});

test('foreign, unavailable, malformed or destroyed live sender identity is refused', () => {
  const foreign = goodEvent();
  foreign.sender.id = 99;
  assert.equal(evaluate(foreign).code, 'E_IPC_SENDER_MISMATCH');
  assert.equal(evaluate(goodEvent(), policy({ resolveLiveCaller: () => null })).code, 'E_IPC_CALLER_WINDOW_UNAVAILABLE');
  assert.equal(evaluate(goodEvent(), policy({ resolveLiveCaller: () => ({}) })).code, 'E_IPC_LIVE_CALLER_SHAPE');
  const dead = goodEvent();
  dead.sender.isDestroyed = () => true;
  assert.equal(evaluate(dead).code, 'E_IPC_SENDER_DESTROYED');
});

test('live session and channel are revalidated on every dispatch', () => {
  const event = goodEvent();
  event.sender.session = undefined;
  assert.equal(evaluate(event).code, 'E_IPC_SESSION_MISSING');
  const foreign = goodEvent();
  foreign.sender.session = { id: 'other' };
  assert.equal(evaluate(foreign).code, 'E_IPC_SESSION_MISMATCH');
  assert.equal(evaluate(goodEvent(), policy({
    resolveLiveCaller: () => ({ senderId: 7, session: SESSION, currentUrl: EXPECTED_URL, allowedChannels: ['file:save'] }),
  })).code, 'E_IPC_CHANNEL_NOT_ALLOWED');
});

test('protocol and file authority are validated structurally', () => {
  for (const url of [
    'https://evil.example/index.html?USE_TIPTAP=1&PRODUCT_PROFILE=WRITER_LOCAL_V1&BRAND_IDENTITY=YALKEN_ORIGINAL_V1',
    'http://localhost/index.html?USE_TIPTAP=1&PRODUCT_PROFILE=WRITER_LOCAL_V1&BRAND_IDENTITY=YALKEN_ORIGINAL_V1',
    'data:text/html,hello',
    'about:blank',
  ]) {
    const event = goodEvent();
    event.senderFrame.url = url;
    assert.equal(evaluate(event).code, 'E_IPC_FRAME_PROTOCOL_DENIED', url);
  }
  const hosted = goodEvent();
  hosted.senderFrame.url = EXPECTED_URL.replace('file:///', 'file://evil.example/');
  assert.equal(evaluate(hosted).code, 'E_IPC_FRAME_ORIGIN_DENIED');
});

test('exact canonical pathname rejects suffix, subpath and traversal spellings', () => {
  for (const [url, codes] of [
    [EXPECTED_URL.replace('/index.html?', '/index.html.evil?'), ['E_IPC_FRAME_PATH_DENIED']],
    [EXPECTED_URL.replace('/index.html?', '/index.html/extra?'), ['E_IPC_FRAME_PATH_DENIED']],
    [EXPECTED_URL.replace('/index.html?', '/sibling.html?'), ['E_IPC_FRAME_PATH_DENIED']],
    [EXPECTED_URL.replace('/index.html?', '/x/../index.html?'), ['E_IPC_FRAME_URL_NON_CANONICAL']],
    [EXPECTED_URL.replace('/index.html?', '/%2e%2e/renderer/index.html?'), ['E_IPC_FRAME_URL_NON_CANONICAL', 'E_IPC_FRAME_PATH_DENIED']],
    [EXPECTED_URL.replace('/index.html?', '/x%2Findex.html?'), ['E_IPC_FRAME_PATH_DENIED']],
    [EXPECTED_URL.replace('/index.html?', '/x%5Cindex.html?'), ['E_IPC_FRAME_URL_BACKSLASH']],
  ]) {
    const event = goodEvent();
    event.senderFrame.url = url;
    assert.ok(codes.includes(evaluate(event).code), `${url} => ${evaluate(event).code}`);
  }
});

test('query keys are exact, unique, bounded and value-bound', () => {
  const vectors = [
    shellUrl({ USE_TIPTAP: '1', PRODUCT_PROFILE: 'WRITER_LOCAL_V1' }),
    shellUrl({ ...SHELL_QUERY, EXTRA: '1' }),
    shellUrl({ ...SHELL_QUERY, USE_TIPTAP: '0' }),
    shellUrl({ ...SHELL_QUERY, BRAND_IDENTITY: 'x'.repeat(129) }),
    `${EXPECTED_URL}&USE_TIPTAP=1`,
  ];
  for (const url of vectors) {
    const event = goodEvent();
    event.senderFrame.url = url;
    assert.equal(evaluate(event).code, 'E_IPC_FRAME_QUERY_DENIED', url);
  }
});

test('hash, malformed, control, backslash and over-byte URLs have typed refusals', () => {
  const hashed = goodEvent();
  hashed.senderFrame.url = `${EXPECTED_URL}#top`;
  assert.equal(evaluate(hashed).code, 'E_IPC_FRAME_HASH_DENIED');
  const vectors = [
    ['not a url', 'E_IPC_FRAME_URL_INVALID'],
    [`${EXPECTED_URL}\n`, 'E_IPC_FRAME_URL_CONTROL'],
    [EXPECTED_URL.replace('renderer/index.html', 'renderer\\index.html'), 'E_IPC_FRAME_URL_BACKSLASH'],
    [`${SHELL_PATH}?${'x'.repeat(IPC_FRAME_URL_MAX_BYTES)}`, 'E_IPC_FRAME_URL_BYTES'],
  ];
  for (const [url, code] of vectors) {
    const event = goodEvent();
    event.senderFrame.url = url;
    assert.equal(evaluate(event).code, code, url.slice(0, 100));
  }
});

test('parsed component records are deeply immutable', () => {
  const parsed = parseStructuredIpcFrameUrl(EXPECTED_URL);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.queryEntries), true);
  assert.equal(parsed.pathname, '/Applications/yalken/renderer/index.html');
  assert.throws(() => { parsed.pathname = '/etc/passwd'; }, TypeError);
  assert.throws(() => { parsed.queryEntries[0][1] = 'mutated'; }, TypeError);
});

test('parse-only cache is FIFO bounded, TTL bounded and never retains failures', () => {
  let now = 0;
  const cache = createBoundedIpcUrlParseCache({ maxEntries: IPC_URL_CACHE_MAX_ENTRIES, ttlMs: IPC_URL_CACHE_TTL_MS, now: () => now });
  const first = cache.resolve(EXPECTED_URL);
  assert.strictEqual(cache.resolve(EXPECTED_URL), first);
  assert.equal(cache.stats().hits, 1);
  for (let index = 0; index < IPC_URL_CACHE_MAX_ENTRIES; index += 1) {
    cache.resolve(`file:///tmp/${index}.html`);
  }
  assert.equal(cache.size(), IPC_URL_CACHE_MAX_ENTRIES);
  assert.equal(cache.stats().evictions, 1);
  now = IPC_URL_CACHE_TTL_MS + 1;
  cache.resolve('file:///tmp/127.html');
  assert.equal(cache.stats().expirations, 1);
  const beforeFailure = cache.size();
  assert.throws(() => cache.resolve('not a url'), (error) => error.code === 'E_IPC_FRAME_URL_INVALID');
  assert.equal(cache.size(), beforeFailure);
  assert.throws(
    () => cache.resolve('file:///tmp/rejected.html', () => { throw new IpcCallerIdentityError('E_TEST_REJECTED'); }),
    (error) => error.code === 'E_TEST_REJECTED',
  );
  assert.equal(cache.size(), beforeFailure);
});

test('cache replay cannot preserve session, channel, window or URL authority', () => {
  let live = { senderId: 7, session: SESSION, currentUrl: EXPECTED_URL, allowedChannels: [CHANNEL] };
  const livePolicy = policy({ resolveLiveCaller: () => live });
  const cache = createBoundedIpcUrlParseCache();
  assert.equal(evaluate(goodEvent(), livePolicy, { urlCache: cache }).ok, true);
  assert.ok(cache.stats().hits > 0);
  live = { ...live, session: { id: 'rotated' } };
  assert.equal(evaluate(goodEvent(), livePolicy, { urlCache: cache }).code, 'E_IPC_SESSION_MISMATCH');
  live = { ...live, session: SESSION, allowedChannels: [] };
  assert.equal(evaluate(goodEvent(), livePolicy, { urlCache: cache }).code, 'E_IPC_CHANNEL_NOT_ALLOWED');
  live = null;
  assert.equal(evaluate(goodEvent(), livePolicy, { urlCache: cache }).code, 'E_IPC_CALLER_WINDOW_UNAVAILABLE');
  live = { senderId: 7, session: SESSION, currentUrl: EXPECTED_URL.replace('index.html?', 'other.html?'), allowedChannels: [CHANNEL] };
  assert.equal(evaluate(goodEvent(), livePolicy, { urlCache: cache }).code, 'E_IPC_FRAME_PATH_DENIED');
});

test('cache configuration cannot exceed the admitted bounds', () => {
  assert.throws(() => createBoundedIpcUrlParseCache({ maxEntries: 129 }), (error) => error.code === 'E_IPC_URL_CACHE_MAX_ENTRIES');
  assert.throws(() => createBoundedIpcUrlParseCache({ ttlMs: 1001 }), (error) => error.code === 'E_IPC_URL_CACHE_TTL');
  assert.throws(() => createBoundedIpcUrlParseCache({ now: 1 }), (error) => error.code === 'E_IPC_URL_CACHE_CLOCK');
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
