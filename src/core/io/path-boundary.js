const path = require('node:path');

const FAIL_SIGNAL = 'E_PATH_BOUNDARY_VIOLATION';
const WINDOWS_DRIVE_ABS_RE = /^[a-zA-Z]:\//u;
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/u;

function normalizeSlashes(value) {
  return String(value || '').replaceAll('\\', '/').trim();
}

function hasDangerousPrefix(value) {
  return value.startsWith('file://')
    || value.startsWith('//')
    || value.startsWith('\\\\')
    || value.startsWith('~');
}

function hasParentSegments(value) {
  const segments = value.split('/').filter((segment) => segment.length > 0);
  return segments.some((segment) => segment === '..' || segment === '.');
}

function fail(failReason, rawPath, normalizedPath = '') {
  return {
    ok: false,
    failSignal: FAIL_SIGNAL,
    failReason,
    rawPath: String(rawPath || ''),
    normalizedPath,
  };
}

function pass(rawPath, normalizedPath) {
  return {
    ok: true,
    failSignal: '',
    failReason: '',
    rawPath: String(rawPath || ''),
    normalizedPath,
  };
}

function normalizeMode(value) {
  return String(value || '').trim().toLowerCase() === 'any' ? 'any' : 'relative';
}

function isAbsolutePath(normalizedPath) {
  return path.posix.isAbsolute(normalizedPath) || WINDOWS_DRIVE_ABS_RE.test(normalizedPath);
}

function normalizeSafePath(value) {
  const normalized = path.posix.normalize(value);
  if (!normalized || normalized === '.' || normalized === '/') return '';
  return normalized;
}

function validatePathBoundary(inputPath, options = {}) {
  if (typeof inputPath !== 'string') return fail('PATH_NOT_STRING', inputPath);
  if (!inputPath.trim()) return fail('PATH_EMPTY', inputPath);
  if (CONTROL_CHAR_RE.test(inputPath)) return fail('PATH_CONTROL_CHAR_FORBIDDEN', inputPath);

  const mode = normalizeMode(options.mode);
  const normalizedInput = normalizeSlashes(inputPath);
  if (!normalizedInput) return fail('PATH_EMPTY', inputPath);
  if (hasDangerousPrefix(normalizedInput)) return fail('PATH_PREFIX_FORBIDDEN', inputPath, normalizedInput);
  if (hasParentSegments(normalizedInput)) return fail('PATH_SEGMENT_FORBIDDEN', inputPath, normalizedInput);

  const normalizedPath = normalizeSafePath(normalizedInput);
  if (!normalizedPath) return fail('PATH_EMPTY_AFTER_NORMALIZE', inputPath, normalizedInput);
  if (mode === 'relative' && isAbsolutePath(normalizedPath)) {
    return fail('PATH_ABSOLUTE_FORBIDDEN', inputPath, normalizedPath);
  }
  if (hasParentSegments(normalizedPath)) {
    return fail('PATH_SEGMENT_FORBIDDEN', inputPath, normalizedPath);
  }

  return pass(inputPath, normalizedPath);
}

function sanitizePathFields(payload, pathFieldNames, options = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      ok: false,
      failSignal: FAIL_SIGNAL,
      failReason: 'PAYLOAD_INVALID',
      payload: null,
      field: '',
    };
  }

  const fieldNames = Array.isArray(pathFieldNames) ? pathFieldNames : [];
  const nextPayload = { ...payload };
  for (const fieldName of fieldNames) {
    if (!Object.prototype.hasOwnProperty.call(nextPayload, fieldName)) continue;
    const fieldValue = nextPayload[fieldName];
    if (typeof fieldValue !== 'string' || !fieldValue.trim()) continue;
    const state = validatePathBoundary(fieldValue, options);
    if (!state.ok) {
      return {
        ok: false,
        failSignal: FAIL_SIGNAL,
        failReason: state.failReason,
        payload: null,
        field: fieldName,
        normalizedPath: state.normalizedPath,
      };
    }
    nextPayload[fieldName] = state.normalizedPath;
  }

  return {
    ok: true,
    failSignal: '',
    failReason: '',
    payload: nextPayload,
    field: '',
    normalizedPath: '',
  };
}

module.exports = {
  FAIL_SIGNAL,
  sanitizePathFields,
  validatePathBoundary,
};

