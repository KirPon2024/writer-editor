'use strict';

function isPlainObject(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function errorToSerializable(error, seen) {
  return {
    name: typeof error.name === 'string' ? error.name : 'Error',
    message: typeof error.message === 'string' ? error.message : '',
    code: typeof error.code === 'string' ? error.code : '',
    reason: typeof error.reason === 'string' ? error.reason : '',
    details: error.details === undefined ? undefined : toCommandBridgeSerializableValue(error.details, seen),
  };
}

function typedArrayToSerializable(value) {
  return {
    type: value.constructor && typeof value.constructor.name === 'string'
      ? value.constructor.name
      : 'TypedArray',
    byteLength: Number.isSafeInteger(value.byteLength) ? value.byteLength : 0,
    redacted: true,
  };
}

function toCommandBridgeSerializableValue(value, seen = new WeakSet()) {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'boolean') return value;
  if (valueType === 'number') return Number.isFinite(value) ? value : null;
  if (valueType === 'bigint') return value.toString();
  if (valueType === 'function' || valueType === 'symbol') return undefined;

  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  if (value instanceof Error) return errorToSerializable(value, seen);
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return { type: 'Buffer', byteLength: value.byteLength, redacted: true };
  }
  if (ArrayBuffer.isView(value)) return typedArrayToSerializable(value);
  if (value instanceof ArrayBuffer) {
    return { type: 'ArrayBuffer', byteLength: value.byteLength, redacted: true };
  }

  if (valueType === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (Array.isArray(value)) {
      const next = value.map((item) => {
        const serializable = toCommandBridgeSerializableValue(item, seen);
        return serializable === undefined ? null : serializable;
      });
      seen.delete(value);
      return next;
    }
    if (value instanceof Map) {
      const next = Array.from(value.entries()).map(([key, item]) => ([
        String(key),
        toCommandBridgeSerializableValue(item, seen),
      ]));
      seen.delete(value);
      return next;
    }
    if (value instanceof Set) {
      const next = Array.from(value.values()).map((item) => {
        const serializable = toCommandBridgeSerializableValue(item, seen);
        return serializable === undefined ? null : serializable;
      });
      seen.delete(value);
      return next;
    }
    const source = isPlainObject(value) ? value : Object.fromEntries(Object.entries(value));
    const next = {};
    for (const [key, item] of Object.entries(source)) {
      const serializable = toCommandBridgeSerializableValue(item, seen);
      if (serializable !== undefined) next[key] = serializable;
    }
    seen.delete(value);
    return next;
  }

  return null;
}

function makeCommandBridgeSuccess(value) {
  return {
    ok: true,
    value: toCommandBridgeSerializableValue(value) ?? null,
  };
}

function makeCommandBridgeFailure(reason, value = null) {
  return {
    ok: false,
    reason: typeof reason === 'string' && reason ? reason : 'COMMAND_EXECUTION_FAILED',
    value: value && typeof value === 'object'
      ? toCommandBridgeSerializableValue(value)
      : null,
  };
}

function makeCommandBridgeException(error) {
  return {
    ok: false,
    reason: 'COMMAND_EXECUTION_THROW',
    message: error && typeof error.message === 'string'
      ? error.message
      : error && typeof error.reason === 'string'
        ? error.reason
        : error && typeof error.code === 'string'
          ? error.code
          : 'UNKNOWN',
  };
}

module.exports = {
  makeCommandBridgeException,
  makeCommandBridgeFailure,
  makeCommandBridgeSuccess,
  toCommandBridgeSerializableValue,
};
