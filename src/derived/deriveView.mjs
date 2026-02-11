import { createHash } from 'node:crypto';
import { hashCoreState } from '../core/runtime.mjs';

const DEFAULT_VIEW_ID = 'derived.view';
const DEFAULT_OP = 'derived.view';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalSerialize(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalSerialize(item)).join(',')}]`;
  if (t === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalSerialize(value[key])}`).join(',')}}`;
  }
  return 'null';
}

export function hashCanonicalValue(value) {
  return createHash('sha256')
    .update(Buffer.from(canonicalSerialize(value), 'utf8'))
    .digest('hex');
}

function typedError(code, op, reason, details) {
  const error = {
    code: String(code || 'E_DERIVED_UNKNOWN'),
    op: String(op || DEFAULT_OP),
    reason: String(reason || 'UNKNOWN'),
  };
  if (isPlainObject(details)) {
    error.details = cloneJson(details);
  }
  return error;
}

function normalizeObject(value) {
  return isPlainObject(value) ? cloneJson(value) : {};
}

function normalizeViewId(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || DEFAULT_VIEW_ID;
}

function normalizeOutput(value) {
  if (value === undefined) return null;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) return null;
  return JSON.parse(encoded);
}

function asThrownTypedError(value) {
  if (!isPlainObject(value)) return null;
  if (!isPlainObject(value.__derivedTypedError)) return null;
  const item = value.__derivedTypedError;
  return typedError(item.code, item.op, item.reason, item.details);
}

export function createDerivedError(code, op, reason, details) {
  return {
    __derivedTypedError: typedError(code, op, reason, details),
  };
}

export function deriveView(input = {}) {
  const viewId = normalizeViewId(input.viewId);
  const coreState = input.coreState;
  const derive = input.derive;
  const params = normalizeObject(input.params);
  const capabilitySnapshot = normalizeObject(input.capabilitySnapshot);

  if (!isPlainObject(coreState)) {
    return {
      ok: false,
      error: typedError('E_DERIVED_CORE_STATE_REQUIRED', viewId, 'CORE_STATE_REQUIRED'),
    };
  }
  if (typeof derive !== 'function') {
    return {
      ok: false,
      error: typedError('E_DERIVED_DERIVE_FN_REQUIRED', viewId, 'DERIVE_FN_REQUIRED'),
    };
  }

  const coreStateHash = hashCoreState(coreState);
  const paramsHash = hashCanonicalValue(params);
  const capabilityHash = hashCanonicalValue(capabilitySnapshot);
  const invalidationKey = hashCanonicalValue({
    viewId,
    coreStateHash,
    paramsHash,
    capabilityHash,
  });
  const metaBase = {
    viewId,
    coreStateHash,
    paramsHash,
    capabilityHash,
    invalidationKey,
  };

  try {
    const value = derive({
      coreState: cloneJson(coreState),
      params,
      capabilitySnapshot,
      meta: cloneJson(metaBase),
    });
    const normalizedValue = normalizeOutput(value);
    const outputHash = hashCanonicalValue(normalizedValue);
    return {
      ok: true,
      value: normalizedValue,
      meta: {
        ...metaBase,
        outputHash,
      },
    };
  } catch (error) {
    const thrownTyped = asThrownTypedError(error);
    return {
      ok: false,
      error: thrownTyped || typedError('E_DERIVED_VIEW_FAILED', viewId, 'DERIVE_FN_FAILED'),
      meta: metaBase,
    };
  }
}
