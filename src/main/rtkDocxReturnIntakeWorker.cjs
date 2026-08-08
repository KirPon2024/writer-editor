'use strict';

const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const DEFAULT_MAX_WORKER_OUTPUT_BYTES = 16 * 1024 * 1024;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function cryptoPort() {
  return {
    sha256Text(value) {
      return crypto.createHash('sha256').update(Buffer.from(String(value || ''), 'utf8')).digest('hex');
    },
    sha256Json(value) {
      return `sha256:${this.sha256Text(stableJson(value))}`;
    },
    hmacSha256Json(value, secret) {
      return `hmac-sha256:${crypto
        .createHmac('sha256', Buffer.from(String(secret || ''), 'utf8'))
        .update(Buffer.from(stableJson(value), 'utf8'))
        .digest('hex')}`;
    },
    byteLength(value) {
      return Buffer.byteLength(String(value || ''), 'utf8');
    },
  };
}

function stripSecret(value) {
  if (Array.isArray(value)) return value.map(stripSecret);
  if (
    (typeof Buffer !== 'undefined' && Buffer.isBuffer(value))
    || value instanceof Uint8Array
    || value instanceof ArrayBuffer
    || value instanceof DataView
  ) {
    return value;
  }
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'hmacSecret')
    .map(([key, item]) => [key, stripSecret(item)]));
}

function blocked(reason, details = {}) {
  return {
    ok: false,
    status: 'blocked',
    code: reason,
    reason,
    canWriteManuscript: false,
    canApply: false,
    details: stripSecret(details),
  };
}

function maxWorkerOutputBytes(message = {}) {
  // Effective budget from the parent (resolved via the shared min-clamp
  // resolver in main.js). When present, the effective value wins over the
  // local 16 MiB default (F-11/P1-02).
  const effective = Number(message?.effectiveBudgets?.maxWorkerOutputBytes);
  if (Number.isSafeInteger(effective) && effective > 0) return effective;
  const value = Number(message?.budgets?.maxWorkerOutputBytes);
  return Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_MAX_WORKER_OUTPUT_BYTES;
}

// Normalize the incoming bytes payload to a Buffer. Accepts ArrayBuffer,
// Uint8Array, Buffer directly (the transferable-bytes path). Falls back to
// legacy bytesBase64 decode for compatibility with existing boundary tests.
// Preference: bytes > bytesBase64.
function normalizeMessageBytes(message = {}) {
  if (message.bytes !== undefined && message.bytes !== null) {
    const raw = message.bytes;
    if (Buffer.isBuffer(raw)) return raw;
    if (raw instanceof ArrayBuffer) return Buffer.from(raw);
    if (ArrayBuffer.isView(raw)) {
      return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
    }
    if (raw instanceof Uint8Array) return Buffer.from(raw);
  }
  if (message.bytesBase64 !== undefined && message.bytesBase64 !== null) {
    return Buffer.from(String(message.bytesBase64), 'base64');
  }
  return Buffer.alloc(0);
}

function enforceWorkerOutputBudget(result, message = {}) {
  const stripped = stripSecret(result);
  const limit = maxWorkerOutputBytes(message);
  const bytes = Buffer.byteLength(stableJson(stripped), 'utf8');
  if (bytes > limit) {
    return blocked('RTK_BUDGET_EXCEEDED', {
      field: 'worker.result',
      actual: bytes,
      limit,
      workerOutputBlocked: true,
    });
  }
  return stripped;
}

async function run(message = {}) {
  const bridgePath = path.join(__dirname, '..', 'io', 'revisionBridge', 'index.mjs');
  const revisionBridge = await import(pathToFileURL(bridgePath).href);
  if (typeof revisionBridge.buildDocxReviewTransportAnalysisFromZipBytes !== 'function') {
    return blocked('RTK_RETURN_INTAKE_PARSER_V2_UNAVAILABLE');
  }
  const bytes = normalizeMessageBytes(message);
  if (bytes.length === 0) return blocked('RTK_RETURN_INTAKE_BYTES_REQUIRED');
  const input = stripSecret({
    ...message,
    bytes,
    bytesBase64: undefined,
  });
  if (typeof message.hmacSecret === 'string' && message.hmacSecret) {
    input.hmacSecret = message.hmacSecret;
  }
  const parserResult = revisionBridge.buildDocxReviewTransportAnalysisFromZipBytes(input, {
    cryptoPort: cryptoPort(),
  });
  if (!isPlainObject(parserResult)) {
    return blocked('RTK_RETURN_INTAKE_PARSER_V2_RESULT_INVALID');
  }
  if (parserResult.ok !== true) {
    return blocked(
      typeof parserResult.reason === 'string' && parserResult.reason
        ? parserResult.reason
        : (typeof parserResult.code === 'string' && parserResult.code
          ? parserResult.code
          : 'RTK_RETURN_INTAKE_PARSER_V2_BLOCKED'),
      { parserCode: typeof parserResult.code === 'string' ? parserResult.code : '' },
    );
  }
  return enforceWorkerOutputBudget({
    ok: true,
    parserResult,
  }, message);
}

function unwrapParentPortMessage(message = {}) {
  if (
    isPlainObject(message)
    && !Object.prototype.hasOwnProperty.call(message, 'bytesBase64')
    && isPlainObject(message.data)
  ) {
    return message.data;
  }
  return message;
}

if (process.parentPort && typeof process.parentPort.on === 'function') {
  process.parentPort.on('message', async (message) => {
    const payload = unwrapParentPortMessage(message);
    try {
      const result = await run(payload);
      process.parentPort.postMessage({ result: enforceWorkerOutputBudget(result, payload) });
    } catch (error) {
      process.parentPort.postMessage({
        result: blocked('RTK_RETURN_INTAKE_WORKER_FAILED', {
          message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN',
        }),
      });
    }
  });
}

module.exports = {
  run,
  stripSecret,
  unwrapParentPortMessage,
};
