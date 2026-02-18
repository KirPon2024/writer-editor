const path = require('node:path');
const fs = require('node:fs');

const FAIL_SIGNAL = 'E_PATH_BOUNDARY_VIOLATION';
const WINDOWS_DRIVE_ABS_RE = /^[a-zA-Z]:\//u;
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/u;

function normalizeSlashes(value) {
  return String(value || '')
    .normalize('NFC')
    .replaceAll('\\', '/')
    .trim();
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

function isPathInsideResolved(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveRealpathOrResolved(targetPath) {
  try {
    if (typeof fs.realpathSync.native === 'function') {
      return fs.realpathSync.native(targetPath);
    }
    return fs.realpathSync(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

function resolveExistingProbePath(targetPath) {
  let probe = path.resolve(targetPath);
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  return probe;
}

function resolvePathAgainstRoot(normalizedPath, rootPath) {
  if (isAbsolutePath(normalizedPath)) {
    return path.resolve(normalizedPath);
  }
  return path.resolve(rootPath, normalizedPath);
}

function isPathInsideBoundary(parentPath, childPath, options = {}) {
  if (typeof parentPath !== 'string' || !parentPath.trim()) return false;
  if (typeof childPath !== 'string' || !childPath.trim()) return false;

  const resolvedParent = path.resolve(parentPath);
  const resolvedChild = path.resolve(childPath);
  if (!isPathInsideResolved(resolvedParent, resolvedChild)) {
    return false;
  }

  if (options.resolveSymlinks !== true) {
    return true;
  }

  const parentReal = resolveRealpathOrResolved(resolvedParent);
  const childProbe = resolveExistingProbePath(resolvedChild);
  const childReal = resolveRealpathOrResolved(childProbe);
  return isPathInsideResolved(parentReal, childReal);
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

function validatePathWithinRoot(inputPath, rootPath, options = {}) {
  if (typeof rootPath !== 'string' || !rootPath.trim()) {
    return fail('ROOT_PATH_INVALID', inputPath);
  }

  const boundaryState = validatePathBoundary(inputPath, options);
  if (!boundaryState.ok) {
    return boundaryState;
  }

  const resolvedRootPath = path.resolve(rootPath);
  const resolvedPath = resolvePathAgainstRoot(boundaryState.normalizedPath, resolvedRootPath);

  if (!isPathInsideBoundary(resolvedRootPath, resolvedPath, { resolveSymlinks: false })) {
    return fail('PATH_OUTSIDE_ROOT', inputPath, boundaryState.normalizedPath);
  }
  if (options.resolveSymlinks !== false
    && !isPathInsideBoundary(resolvedRootPath, resolvedPath, { resolveSymlinks: true })) {
    return fail('PATH_SYMLINK_OUTSIDE_ROOT', inputPath, boundaryState.normalizedPath);
  }

  return {
    ...pass(inputPath, boundaryState.normalizedPath),
    resolvedPath,
    resolvedRootPath,
  };
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

function sanitizePathFieldsWithinRoot(payload, pathFieldNames, rootPath, options = {}) {
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
    const state = validatePathWithinRoot(fieldValue, rootPath, options);
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
    nextPayload[fieldName] = state.resolvedPath;
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
  isPathInsideBoundary,
  sanitizePathFields,
  sanitizePathFieldsWithinRoot,
  validatePathWithinRoot,
  validatePathBoundary,
};
