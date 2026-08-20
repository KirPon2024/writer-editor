// R2.4 S1_IPC_ENVELOPE_BUDGETS — one versioned IPC envelope with correlation,
// identity, byte, depth, property and timeout/cancellation limits.
'use strict';

class IpcEnvelopeError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

const ENVELOPE_VERSION = 1;

const isObjectRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// Closed per-channel key sets: the property limit law.
const BRIDGE_KEY_SETS = Object.freeze({
  'ui:command-bridge': Object.freeze(['v', 'correlationId', 'issuedAt', 'route', 'commandId', 'payload']),
  'ui:workspace-query-bridge': Object.freeze(['v', 'correlationId', 'issuedAt', 'queryId', 'payload']),
  'ui:save-lifecycle-signal-bridge': Object.freeze(['v', 'correlationId', 'issuedAt', 'signalId', 'payload']),
});

const BRIDGE_ID_FIELD = Object.freeze({
  'ui:command-bridge': 'commandId',
  'ui:workspace-query-bridge': 'queryId',
  'ui:save-lifecycle-signal-bridge': 'signalId',
});

function validateIpcEnvelope(envelope, channel, { maxDepth = 8, maxKeys = 256, maxBytes = 1024 * 1024 } = {}) {
  if (!isObjectRecord(envelope)) return { ok: false, code: 'E_ENVELOPE_SHAPE' };
  const keySet = BRIDGE_KEY_SETS[channel];
  if (!keySet) return { ok: false, code: 'E_ENVELOPE_CHANNEL_UNKNOWN' };
  if (envelope.v !== ENVELOPE_VERSION) return { ok: false, code: 'E_ENVELOPE_VERSION' };
  if (typeof envelope.correlationId !== 'string' || envelope.correlationId.length < 8 || envelope.correlationId.length > 128) {
    return { ok: false, code: 'E_ENVELOPE_CORRELATION_ID' };
  }
  if (typeof envelope.issuedAt !== 'string' || !Number.isFinite(Date.parse(envelope.issuedAt))) {
    return { ok: false, code: 'E_ENVELOPE_ISSUED_AT' };
  }
  for (const key of Object.keys(envelope)) {
    if (!keySet.includes(key)) return { ok: false, code: 'E_ENVELOPE_KEY_UNKNOWN', detail: key };
  }
  const idField = BRIDGE_ID_FIELD[channel];
  if (typeof envelope[idField] !== 'string' || envelope[idField].length === 0) {
    return { ok: false, code: 'E_ENVELOPE_IDENTITY_MISSING' };
  }
  if (!isObjectRecord(envelope.payload)) return { ok: false, code: 'E_ENVELOPE_PAYLOAD_SHAPE' };

  let keys = 0;
  const seen = new Set();
  const walk = (value, depth) => {
    if (depth > maxDepth) return { code: 'E_ENVELOPE_DEPTH' };
    if (!isObjectRecord(value) && !Array.isArray(value)) return null;
    if (seen.has(value)) return { code: 'E_ENVELOPE_CYCLE' };
    seen.add(value);
    const entries = Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value);
    keys += entries.length;
    if (keys > maxKeys) return { code: 'E_ENVELOPE_BREADTH' };
    for (const [, v] of entries) {
      const inner = walk(v, depth + 1);
      if (inner) return inner;
    }
    seen.delete(value);
    return null;
  };
  const boundViolation = walk(envelope.payload, 0);
  if (boundViolation) return { ok: false, code: boundViolation.code };

  let size = 0;
  try {
    size = Buffer.byteLength(JSON.stringify(envelope.payload));
  } catch {
    return { ok: false, code: 'E_ENVELOPE_SERIALIZATION' };
  }
  if (size > maxBytes) return { ok: false, code: 'E_ENVELOPE_BYTES', detail: `${size}>${maxBytes}` };
  return { ok: true, code: '' };
}

function createEnvelope(channel, idFieldValue, payload, { correlationId, issuedAt } = {}) {
  const idField = BRIDGE_ID_FIELD[channel];
  if (!idField) throw new IpcEnvelopeError('E_ENVELOPE_CHANNEL_UNKNOWN', String(channel));
  const envelope = {
    v: ENVELOPE_VERSION,
    correlationId: typeof correlationId === 'string' && correlationId.length >= 8
      ? correlationId
      : `corr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    issuedAt: typeof issuedAt === 'string' ? issuedAt : new Date().toISOString(),
    [idField]: idFieldValue,
    payload: isObjectRecord(payload) ? payload : {},
  };
  if (channel === 'ui:command-bridge') envelope.route = 'command.bus';
  return envelope;
}

// Renderer-side timeout/cancellation: after the budget the waiter rejects
// and the late invoke result is discarded by construction.
function withTimeoutBudget(invokeFactory, { timeoutMs, correlationId }) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new IpcEnvelopeError('E_BRIDGE_TIMEOUT_BUDGET_INVALID');
  if (typeof invokeFactory !== 'function') throw new IpcEnvelopeError('E_BRIDGE_INVOKE_REQUIRED');
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new IpcEnvelopeError('E_BRIDGE_TIMEOUT', correlationId || ''));
    }, timeoutMs);
    Promise.resolve()
      .then(() => invokeFactory())
      .then((value) => {
        if (settled) return; // late result discarded
        settled = true;
        clearTimeout(timer);
        resolve(value);
      }, (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

module.exports = Object.freeze({
  BRIDGE_KEY_SETS,
  ENVELOPE_VERSION,
  IpcEnvelopeError,
  createEnvelope,
  validateIpcEnvelope,
  withTimeoutBudget,
});
