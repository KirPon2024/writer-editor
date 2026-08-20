// R2.4 S0_IPC_CALLER_IDENTITY — caller identity law for privileged IPC and
// utility-process intake. Every privileged entry point must prove its event's
// sender, frame, session and origin before any handler body runs. Forged,
// foreign, destroyed or unbound callers fail closed with typed codes.
'use strict';

class IpcCallerIdentityError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

const isObjectRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// policy: {
//   expectedSenderIds: () => number[]         — live app-shell webContents ids at call time
//   allowedFrameUrlPrefixes: () => string[]   — exact file:// prefixes of the app shell
//   expectedSessionId?: () => unknown         — optional session binding
// }
function evaluateIpcCallerIdentity(event, policy) {
  if (!isObjectRecord(event)) return { ok: false, code: 'E_IPC_EVENT_MISSING' };
  if (!policy || typeof policy !== 'object') return { ok: false, code: 'E_IPC_POLICY_MISSING' };
  const sender = event.sender;
  if (!isObjectRecord(sender)) return { ok: false, code: 'E_IPC_SENDER_MISSING' };
  const expectedIds = typeof policy.expectedSenderIds === 'function' ? policy.expectedSenderIds() : undefined;
  if (expectedIds !== undefined) {
    if (!Array.isArray(expectedIds) || !expectedIds.every((id) => Number.isInteger(id))) {
      return { ok: false, code: 'E_IPC_POLICY_SENDER_IDS_SHAPE' };
    }
    if (expectedIds.length === 0) return { ok: false, code: 'E_IPC_CALLER_WINDOW_UNAVAILABLE' };
    if (!expectedIds.includes(sender.id)) return { ok: false, code: 'E_IPC_SENDER_MISMATCH' };
  }
  if (typeof sender.isDestroyed === 'function' && sender.isDestroyed()) {
    return { ok: false, code: 'E_IPC_SENDER_DESTROYED' };
  }
  const frame = event.senderFrame;
  if (!isObjectRecord(frame) || typeof frame.url !== 'string') return { ok: false, code: 'E_IPC_FRAME_MISSING' };
  const prefixes = typeof policy.allowedFrameUrlPrefixes === 'function' ? policy.allowedFrameUrlPrefixes() : undefined;
  if (!Array.isArray(prefixes) || prefixes.length === 0 || !prefixes.every((p) => typeof p === 'string' && p.length > 0)) {
    return { ok: false, code: 'E_IPC_POLICY_PREFIXES_MISSING' };
  }
  if (!prefixes.some((prefix) => frame.url.startsWith(prefix))) {
    return { ok: false, code: 'E_IPC_FRAME_ORIGIN_DENIED' };
  }
  if (typeof policy.expectedSessionId === 'function') {
    const expectedSession = policy.expectedSessionId();
    if (expectedSession !== undefined && sender.session !== expectedSession) {
      return { ok: false, code: 'E_IPC_SESSION_MISMATCH' };
    }
  }
  return { ok: true, code: '' };
}

function assertIpcCallerIdentity(event, policy) {
  const verdict = evaluateIpcCallerIdentity(event, policy);
  if (!verdict.ok) throw new IpcCallerIdentityError(verdict.code);
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
// factory evaluates caller identity before the handler body runs.
function createGuardedIpcRegistration(ipcMainLike, policy) {
  if (!ipcMainLike || typeof ipcMainLike.handle !== 'function' || typeof ipcMainLike.on !== 'function') {
    throw new IpcCallerIdentityError('E_IPC_MAIN_SHAPE');
  }
  return Object.freeze({
    handle(channel, handler) {
      ipcMainLike.handle(channel, (event, ...args) => {
        assertIpcCallerIdentity(event, policy);
        return handler(event, ...args);
      });
    },
    on(channel, handler) {
      ipcMainLike.on(channel, (event, ...args) => {
        assertIpcCallerIdentity(event, policy);
        return handler(event, ...args);
      });
    },
  });
}

module.exports = Object.freeze({
  IpcCallerIdentityError,
  assertIpcCallerIdentity,
  createGuardedIpcRegistration,
  evaluateIpcCallerIdentity,
  validateWorkerIntakeEnvelope,
});
