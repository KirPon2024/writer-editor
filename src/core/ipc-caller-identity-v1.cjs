// R2.4 S0_IPC_CALLER_IDENTITY — caller identity law for privileged IPC and
// utility-process intake. Every privileged entry point proves its event's
// sender, frame, session, live channel admission and exact structured shell
// URL before any handler body runs. The bounded cache stores parsed URL
// components only; it never stores or replays an authorization verdict.
'use strict';

const { performance } = require('node:perf_hooks');

const IPC_URL_CACHE_MAX_ENTRIES = 128;
const IPC_URL_CACHE_TTL_MS = 1000;
const IPC_FRAME_URL_MAX_BYTES = 4096;
const IPC_FRAME_QUERY_VALUE_MAX_BYTES = 128;
const IPC_SHELL_QUERY_KEYS = Object.freeze([
  'BRAND_IDENTITY',
  'PRODUCT_PROFILE',
  'USE_TIPTAP',
]);

class IpcCallerIdentityError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.detail = detail;
  }
}

const isObjectRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const fail = (code, detail = '') => ({ ok: false, code, ...(detail ? { detail } : {}) });

function cloneFrozenUrlComponents(parsed) {
  const queryEntries = Object.freeze(
    [...parsed.searchParams.entries()].map(([key, value]) => Object.freeze([key, value])),
  );
  return Object.freeze({
    href: parsed.href,
    protocol: parsed.protocol,
    origin: parsed.origin,
    username: parsed.username,
    password: parsed.password,
    hostname: parsed.hostname,
    port: parsed.port,
    pathname: parsed.pathname,
    queryEntries,
    hash: parsed.hash,
  });
}

function parseStructuredIpcFrameUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) {
    throw new IpcCallerIdentityError('E_IPC_FRAME_URL_INVALID');
  }
  const byteLength = Buffer.byteLength(rawUrl, 'utf8');
  if (byteLength > IPC_FRAME_URL_MAX_BYTES) {
    throw new IpcCallerIdentityError('E_IPC_FRAME_URL_BYTES', `${byteLength}>${IPC_FRAME_URL_MAX_BYTES}`);
  }
  if (/[\u0000-\u001F\u007F]/u.test(rawUrl)) {
    throw new IpcCallerIdentityError('E_IPC_FRAME_URL_CONTROL');
  }
  if (rawUrl.includes('\\') || /%5c/iu.test(rawUrl)) {
    throw new IpcCallerIdentityError('E_IPC_FRAME_URL_BACKSLASH');
  }
  if (/%2f/iu.test(rawUrl)) {
    throw new IpcCallerIdentityError('E_IPC_FRAME_PATH_DENIED');
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new IpcCallerIdentityError('E_IPC_FRAME_URL_INVALID');
  }
  if (parsed.href !== rawUrl) {
    throw new IpcCallerIdentityError('E_IPC_FRAME_URL_NON_CANONICAL');
  }
  return cloneFrozenUrlComponents(parsed);
}

function normalizeCacheOptions(options = {}) {
  const maxEntries = options.maxEntries === undefined ? IPC_URL_CACHE_MAX_ENTRIES : options.maxEntries;
  const ttlMs = options.ttlMs === undefined ? IPC_URL_CACHE_TTL_MS : options.ttlMs;
  const now = options.now === undefined ? () => performance.now() : options.now;
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > IPC_URL_CACHE_MAX_ENTRIES) {
    throw new IpcCallerIdentityError('E_IPC_URL_CACHE_MAX_ENTRIES', String(maxEntries));
  }
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > IPC_URL_CACHE_TTL_MS) {
    throw new IpcCallerIdentityError('E_IPC_URL_CACHE_TTL', String(ttlMs));
  }
  if (typeof now !== 'function') throw new IpcCallerIdentityError('E_IPC_URL_CACHE_CLOCK');
  return { maxEntries, ttlMs, now };
}

function createBoundedIpcUrlParseCache(options = {}) {
  const { maxEntries, ttlMs, now } = normalizeCacheOptions(options);
  const entries = new Map();
  let hits = 0;
  let misses = 0;
  let evictions = 0;
  let expirations = 0;

  const readNow = () => {
    const value = now();
    if (!Number.isFinite(value)) throw new IpcCallerIdentityError('E_IPC_URL_CACHE_CLOCK');
    return value;
  };

  function resolve(rawUrl, validate = () => true) {
    if (typeof validate !== 'function') throw new IpcCallerIdentityError('E_IPC_URL_CACHE_VALIDATOR');
    const observedAt = readNow();
    const cached = entries.get(rawUrl);
    if (cached) {
      const age = observedAt - cached.observedAt;
      if (age >= 0 && age <= ttlMs) {
        try {
          validate(cached.components);
        } catch (error) {
          entries.delete(rawUrl);
          throw error;
        }
        hits += 1;
        return cached.components;
      }
      entries.delete(rawUrl);
      expirations += 1;
    }

    misses += 1;
    const components = parseStructuredIpcFrameUrl(rawUrl);
    validate(components);
    entries.set(rawUrl, Object.freeze({ components, observedAt }));
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;
      entries.delete(oldest);
      evictions += 1;
    }
    return components;
  }

  return Object.freeze({
    resolve,
    clear() { entries.clear(); },
    size() { return entries.size; },
    stats() {
      return Object.freeze({ size: entries.size, maxEntries, ttlMs, hits, misses, evictions, expirations });
    },
  });
}

function queryMap(components) {
  const map = new Map();
  for (const [key, value] of components.queryEntries) {
    if (map.has(key)) throw new IpcCallerIdentityError('E_IPC_FRAME_QUERY_DENIED', `duplicate:${key}`);
    map.set(key, value);
  }
  return map;
}

function validateExpectedShellUrl(components) {
  if (components.protocol !== 'file:') throw new IpcCallerIdentityError('E_IPC_FRAME_PROTOCOL_DENIED');
  if (
    components.origin !== 'null'
    || components.username !== ''
    || components.password !== ''
    || components.hostname !== ''
    || components.port !== ''
  ) {
    throw new IpcCallerIdentityError('E_IPC_FRAME_ORIGIN_DENIED');
  }
  if (!components.pathname.endsWith('/index.html')) {
    throw new IpcCallerIdentityError('E_IPC_FRAME_PATH_DENIED');
  }
  const query = queryMap(components);
  if (query.size !== IPC_SHELL_QUERY_KEYS.length) {
    throw new IpcCallerIdentityError('E_IPC_FRAME_QUERY_DENIED', 'key-count');
  }
  for (const key of IPC_SHELL_QUERY_KEYS) {
    const value = query.get(key);
    if (typeof value !== 'string' || value.length === 0) {
      throw new IpcCallerIdentityError('E_IPC_FRAME_QUERY_DENIED', `missing:${key}`);
    }
    if (Buffer.byteLength(value, 'utf8') > IPC_FRAME_QUERY_VALUE_MAX_BYTES) {
      throw new IpcCallerIdentityError('E_IPC_FRAME_QUERY_DENIED', `value-bytes:${key}`);
    }
  }
  if (components.hash !== '') throw new IpcCallerIdentityError('E_IPC_FRAME_HASH_DENIED');
  return true;
}

function validateShellUrlAgainstExpected(components, expected) {
  if (components.protocol !== expected.protocol) throw new IpcCallerIdentityError('E_IPC_FRAME_PROTOCOL_DENIED');
  if (
    components.origin !== expected.origin
    || components.username !== expected.username
    || components.password !== expected.password
    || components.hostname !== expected.hostname
    || components.port !== expected.port
  ) {
    throw new IpcCallerIdentityError('E_IPC_FRAME_ORIGIN_DENIED');
  }
  if (components.pathname !== expected.pathname) throw new IpcCallerIdentityError('E_IPC_FRAME_PATH_DENIED');
  const query = queryMap(components);
  const expectedQuery = queryMap(expected);
  if (query.size !== expectedQuery.size) throw new IpcCallerIdentityError('E_IPC_FRAME_QUERY_DENIED', 'key-count');
  for (const [key, expectedValue] of expectedQuery) {
    if (!query.has(key) || query.get(key) !== expectedValue) {
      throw new IpcCallerIdentityError('E_IPC_FRAME_QUERY_DENIED', key);
    }
  }
  if (components.hash !== expected.hash) throw new IpcCallerIdentityError('E_IPC_FRAME_HASH_DENIED');
  return true;
}

function assertSameStructuredUrl(left, right) {
  if (left.protocol !== right.protocol) throw new IpcCallerIdentityError('E_IPC_FRAME_PROTOCOL_DENIED');
  if (
    left.origin !== right.origin
    || left.username !== right.username
    || left.password !== right.password
    || left.hostname !== right.hostname
    || left.port !== right.port
  ) throw new IpcCallerIdentityError('E_IPC_FRAME_ORIGIN_DENIED');
  if (left.pathname !== right.pathname) throw new IpcCallerIdentityError('E_IPC_FRAME_PATH_DENIED');
  const leftQuery = queryMap(left);
  const rightQuery = queryMap(right);
  if (leftQuery.size !== rightQuery.size) throw new IpcCallerIdentityError('E_IPC_FRAME_QUERY_DENIED', 'key-count');
  for (const [key, value] of leftQuery) {
    if (!rightQuery.has(key) || rightQuery.get(key) !== value) {
      throw new IpcCallerIdentityError('E_IPC_FRAME_QUERY_DENIED', key);
    }
  }
  if (left.hash !== right.hash) throw new IpcCallerIdentityError('E_IPC_FRAME_HASH_DENIED');
  return true;
}

// policy: {
//   resolveLiveCaller: ({ senderId, channel }) => {
//     senderId, session, currentUrl, allowedChannels
//   },
//   expectedFrameUrl: () => string
// }
function evaluateIpcCallerIdentity(event, policy, context = {}) {
  if (!isObjectRecord(event)) return fail('E_IPC_EVENT_MISSING');
  if (!isObjectRecord(policy)) return fail('E_IPC_POLICY_MISSING');
  const sender = event.sender;
  if (!isObjectRecord(sender)) return fail('E_IPC_SENDER_MISSING');
  if (typeof sender.isDestroyed === 'function' && sender.isDestroyed()) return fail('E_IPC_SENDER_DESTROYED');
  const frame = event.senderFrame;
  if (!isObjectRecord(frame) || typeof frame.url !== 'string') return fail('E_IPC_FRAME_MISSING');
  const channel = typeof context.channel === 'string' ? context.channel.trim() : '';
  if (!channel) return fail('E_IPC_CHANNEL_MISSING');
  if (typeof policy.resolveLiveCaller !== 'function') return fail('E_IPC_POLICY_LIVE_CALLER_MISSING');
  if (typeof policy.expectedFrameUrl !== 'function') return fail('E_IPC_POLICY_EXPECTED_URL_MISSING');

  let live;
  try {
    live = policy.resolveLiveCaller({ senderId: sender.id, channel });
  } catch (error) {
    return fail('E_IPC_LIVE_CALLER_RESOLUTION', error && error.message ? error.message : 'UNKNOWN');
  }
  if (live === undefined || live === null) return fail('E_IPC_CALLER_WINDOW_UNAVAILABLE');
  if (
    !isObjectRecord(live)
    || !Number.isInteger(live.senderId)
    || typeof live.currentUrl !== 'string'
    || !Array.isArray(live.allowedChannels)
    || !live.allowedChannels.every((item) => typeof item === 'string' && item.trim().length > 0)
  ) return fail('E_IPC_LIVE_CALLER_SHAPE');
  if (live.senderId !== sender.id) return fail('E_IPC_SENDER_MISMATCH');
  if (sender.session === undefined || live.session === undefined) return fail('E_IPC_SESSION_MISSING');
  if (sender.session !== live.session) return fail('E_IPC_SESSION_MISMATCH');
  if (!live.allowedChannels.includes(channel)) return fail('E_IPC_CHANNEL_NOT_ALLOWED');

  let expectedUrl;
  try {
    expectedUrl = policy.expectedFrameUrl();
  } catch (error) {
    return fail('E_IPC_POLICY_EXPECTED_URL_RESOLUTION', error && error.message ? error.message : 'UNKNOWN');
  }
  if (typeof expectedUrl !== 'string' || expectedUrl.length === 0) return fail('E_IPC_POLICY_EXPECTED_URL_MISSING');
  const cache = context.urlCache && typeof context.urlCache.resolve === 'function'
    ? context.urlCache
    : createBoundedIpcUrlParseCache();

  try {
    const expected = cache.resolve(expectedUrl, validateExpectedShellUrl);
    const liveUrl = cache.resolve(live.currentUrl, (components) => validateShellUrlAgainstExpected(components, expected));
    const eventUrl = cache.resolve(frame.url, validateExpectedShellUrl);
    assertSameStructuredUrl(eventUrl, liveUrl);
    assertSameStructuredUrl(liveUrl, expected);
  } catch (error) {
    if (error instanceof IpcCallerIdentityError) return fail(error.code, error.detail);
    return fail('E_IPC_FRAME_URL_INVALID');
  }
  return { ok: true, code: '' };
}

function assertIpcCallerIdentity(event, policy, context = {}) {
  const verdict = evaluateIpcCallerIdentity(event, policy, context);
  if (!verdict.ok) throw new IpcCallerIdentityError(verdict.code, verdict.detail || '');
  return true;
}

// Utility-process intake law: the message envelope must be a plain object
// with bounded depth, breadth and serialized size before any interpretation.
function validateWorkerIntakeEnvelope(message, { maxDepth = 6, maxKeys = 64, maxBytes = 4 * 1024 * 1024 } = {}) {
  if (!isObjectRecord(message)) throw new IpcCallerIdentityError('E_WORKER_ENVELOPE_SHAPE');
  const seen = new Set();
  let keys = 0;
  const walk = (value, depth) => {
    if (depth > maxDepth) throw new IpcCallerIdentityError('E_WORKER_ENVELOPE_DEPTH');
    if (!isObjectRecord(value) && !Array.isArray(value)) return;
    if (seen.has(value)) throw new IpcCallerIdentityError('E_WORKER_ENVELOPE_CYCLE');
    seen.add(value);
    const entries = Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value);
    keys += entries.length;
    if (keys > maxKeys) throw new IpcCallerIdentityError('E_WORKER_ENVELOPE_BREADTH');
    for (const [, v] of entries) walk(v, depth + 1);
    seen.delete(value);
  };
  walk(message, 0);
  let size = 0;
  try {
    size = Buffer.byteLength(JSON.stringify(message));
  } catch {
    throw new IpcCallerIdentityError('E_WORKER_ENVELOPE_SERIALIZATION');
  }
  if (size > maxBytes) throw new IpcCallerIdentityError('E_WORKER_ENVELOPE_BYTES', `${size}>${maxBytes}`);
  return true;
}

// Guarded registration factory: every handle/on registration through this
// factory evaluates fresh caller identity and live channel admission before
// the handler body. One shared bounded cache can only reuse URL parsing.
function createGuardedIpcRegistration(ipcMainLike, policy, options = {}) {
  if (!ipcMainLike || typeof ipcMainLike.handle !== 'function' || typeof ipcMainLike.on !== 'function') {
    throw new IpcCallerIdentityError('E_IPC_MAIN_SHAPE');
  }
  const urlCache = options.urlCache || createBoundedIpcUrlParseCache(options.cacheOptions);
  return Object.freeze({
    handle(channel, handler) {
      ipcMainLike.handle(channel, (event, ...args) => {
        assertIpcCallerIdentity(event, policy, { channel, urlCache });
        return handler(event, ...args);
      });
    },
    on(channel, handler) {
      ipcMainLike.on(channel, (event, ...args) => {
        assertIpcCallerIdentity(event, policy, { channel, urlCache });
        return handler(event, ...args);
      });
    },
    cacheStats: () => urlCache.stats(),
  });
}

// R2.4 WP-101 — channel capability binding. Every privileged channel must
// be bound to a declared capability class at registration time; the live
// identity snapshot independently revalidates the allowlist at dispatch.
const IPC_CHANNEL_CAPABILITY_CLASSES = Object.freeze([
  'fs.read',
  'fs.write',
  'project.mutation',
  'project.query',
  'query.read',
  'command.dispatch',
  'signal.ingest',
]);

function normalizeChannelCapabilityMap(channelCapabilityClass) {
  if (!isObjectRecord(channelCapabilityClass)) throw new IpcCallerIdentityError('E_IPC_CAPABILITY_MAP_SHAPE');
  const map = new Map();
  for (const [channel, capabilityClass] of Object.entries(channelCapabilityClass)) {
    const key = typeof channel === 'string' ? channel.trim() : '';
    if (!key) throw new IpcCallerIdentityError('E_IPC_CAPABILITY_CHANNEL_EMPTY');
    if (!IPC_CHANNEL_CAPABILITY_CLASSES.includes(capabilityClass)) {
      throw new IpcCallerIdentityError('E_IPC_CAPABILITY_CLASS_UNKNOWN', `${key}:${String(capabilityClass)}`);
    }
    map.set(key, capabilityClass);
  }
  if (map.size === 0) throw new IpcCallerIdentityError('E_IPC_CAPABILITY_MAP_EMPTY');
  return map;
}

function createCapabilityBoundRegistration(registration, channelCapabilityClass) {
  if (!registration || typeof registration.handle !== 'function' || typeof registration.on !== 'function') {
    throw new IpcCallerIdentityError('E_IPC_REGISTRATION_SHAPE');
  }
  const map = normalizeChannelCapabilityMap(channelCapabilityClass);
  const capabilityClassOf = (channel) => map.get(typeof channel === 'string' ? channel.trim() : '') || '';
  const assertBound = (channel) => {
    if (!capabilityClassOf(channel)) throw new IpcCallerIdentityError('E_IPC_CHANNEL_CAPABILITY_UNBOUND', String(channel));
  };
  return Object.freeze({
    handle(channel, handler) {
      assertBound(channel);
      return registration.handle(channel, handler);
    },
    on(channel, handler) {
      assertBound(channel);
      return registration.on(channel, handler);
    },
    capabilityClassOf,
  });
}

module.exports = Object.freeze({
  IPC_CHANNEL_CAPABILITY_CLASSES,
  IPC_FRAME_URL_MAX_BYTES,
  IPC_SHELL_QUERY_KEYS,
  IPC_URL_CACHE_MAX_ENTRIES,
  IPC_URL_CACHE_TTL_MS,
  IpcCallerIdentityError,
  assertIpcCallerIdentity,
  createBoundedIpcUrlParseCache,
  createCapabilityBoundRegistration,
  createGuardedIpcRegistration,
  evaluateIpcCallerIdentity,
  parseStructuredIpcFrameUrl,
  validateWorkerIntakeEnvelope,
});
