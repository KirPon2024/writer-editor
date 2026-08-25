'use strict';

const SESSION_CONTINUITY_SETTINGS_KEY = 'sessionContinuityV1';
const SESSION_CONTINUITY_SCHEMA_VERSION = 'yalken.sessionContinuity.v1';
const MAX_CONTEXT_REVISION = Number.MAX_SAFE_INTEGER;
const MAX_PROJECT_ID_LENGTH = 128;
const MAX_RELATIVE_PATH_LENGTH = 1024;
const MAX_SELECTION_OFFSET = 0x7fffffff;
const RECORD_KEYS = Object.freeze([
  'documentRelativePath',
  'projectId',
  'revision',
  'schemaVersion',
  'selectionRange',
]);
const SELECTION_KEYS = Object.freeze(['end', 'start']);

class SessionContinuityError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expectedKeys) {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === expectedKeys.length
    && keys.every((key, index) => key === expectedKeys[index]);
}

function normalizeSessionProjectId(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_PROJECT_ID_LENGTH) return '';
  if (/[\\/\u0000-\u001f\u007f]/u.test(normalized)) return '';
  return normalized;
}

function normalizeSessionDocumentRelativePath(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_RELATIVE_PATH_LENGTH) return '';
  if (/^[a-zA-Z]:[\\/]/u.test(trimmed) || /^[\\/]/u.test(trimmed)) return '';
  if (/[\u0000-\u001f\u007f]/u.test(trimmed)) return '';
  const segments = trimmed.replace(/\\/gu, '/').split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return '';
  if (segments.some((segment) => segment.length > 255)) return '';
  return segments.join('/');
}

function normalizeSessionSelectionRange(value) {
  if (!hasExactKeys(value, SELECTION_KEYS)) return null;
  const { start, end } = value;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
  if (start < 0 || end < start || end > MAX_SELECTION_OFFSET) return null;
  return Object.freeze({ start, end });
}

function freezeRecord({ revision, projectId, documentRelativePath, selectionRange }) {
  return Object.freeze({
    schemaVersion: SESSION_CONTINUITY_SCHEMA_VERSION,
    revision,
    projectId,
    documentRelativePath,
    selectionRange: Object.freeze({
      start: selectionRange.start,
      end: selectionRange.end,
    }),
  });
}

function invalid(code) {
  return Object.freeze({ ok: false, code, record: null });
}

function validateSessionContinuityV1(value) {
  if (!hasExactKeys(value, RECORD_KEYS)) return invalid('E_SESSION_CONTINUITY_SHAPE');
  if (value.schemaVersion !== SESSION_CONTINUITY_SCHEMA_VERSION) {
    return invalid('E_SESSION_CONTINUITY_SCHEMA');
  }
  if (!Number.isSafeInteger(value.revision) || value.revision < 1 || value.revision > MAX_CONTEXT_REVISION) {
    return invalid('E_SESSION_CONTINUITY_REVISION');
  }
  const projectId = normalizeSessionProjectId(value.projectId);
  if (!projectId || projectId !== value.projectId) return invalid('E_SESSION_CONTINUITY_PROJECT_ID');
  const documentRelativePath = normalizeSessionDocumentRelativePath(value.documentRelativePath);
  if (!documentRelativePath || documentRelativePath !== value.documentRelativePath) {
    return invalid('E_SESSION_CONTINUITY_DOCUMENT_PATH');
  }
  const selectionRange = normalizeSessionSelectionRange(value.selectionRange);
  if (!selectionRange) return invalid('E_SESSION_CONTINUITY_SELECTION');
  return Object.freeze({
    ok: true,
    code: 'SESSION_CONTINUITY_VALID',
    record: freezeRecord({
      revision: value.revision,
      projectId,
      documentRelativePath,
      selectionRange,
    }),
  });
}

function readSessionContinuityV1(settings) {
  if (!isPlainObject(settings)) {
    return Object.freeze({
      ok: false,
      present: false,
      source: 'settings',
      code: 'E_SESSION_CONTINUITY_SETTINGS',
      projectId: '',
      record: null,
    });
  }

  if (Object.prototype.hasOwnProperty.call(settings, SESSION_CONTINUITY_SETTINGS_KEY)) {
    const validated = validateSessionContinuityV1(settings[SESSION_CONTINUITY_SETTINGS_KEY]);
    return Object.freeze({
      ok: validated.ok,
      present: true,
      source: 'v1',
      code: validated.code,
      projectId: validated.record?.projectId || '',
      record: validated.record,
    });
  }

  const projectId = normalizeSessionProjectId(settings.lastProjectId);
  if (!projectId) {
    return Object.freeze({
      ok: true,
      present: false,
      source: 'absent',
      code: 'SESSION_CONTINUITY_ABSENT',
      projectId: '',
      record: null,
    });
  }

  const documentRelativePath = normalizeSessionDocumentRelativePath(settings.lastProjectRelativePath);
  if (!documentRelativePath) {
    return Object.freeze({
      ok: true,
      present: false,
      source: 'legacy-project',
      code: 'SESSION_CONTINUITY_LEGACY_PROJECT_ONLY',
      projectId,
      record: null,
    });
  }

  const selectionRange = normalizeSessionSelectionRange(settings.lastProjectSelectionRange)
    || Object.freeze({ start: 0, end: 0 });
  return Object.freeze({
    ok: true,
    present: false,
    source: 'legacy',
    code: 'SESSION_CONTINUITY_LEGACY_VALID',
    projectId,
    record: freezeRecord({
      revision: 1,
      projectId,
      documentRelativePath,
      selectionRange,
    }),
  });
}

function sameContext(left, right) {
  return left.projectId === right.projectId
    && left.documentRelativePath === right.documentRelativePath
    && left.selectionRange.start === right.selectionRange.start
    && left.selectionRange.end === right.selectionRange.end;
}

function commitSessionContinuityV1(previousValue, input) {
  if (!isPlainObject(input)) throw new SessionContinuityError('E_SESSION_CONTINUITY_INPUT');
  const projectId = normalizeSessionProjectId(input.projectId);
  if (!projectId) throw new SessionContinuityError('E_SESSION_CONTINUITY_PROJECT_ID');
  const documentRelativePath = normalizeSessionDocumentRelativePath(input.documentRelativePath);
  if (!documentRelativePath) throw new SessionContinuityError('E_SESSION_CONTINUITY_DOCUMENT_PATH');
  const selectionRange = normalizeSessionSelectionRange(input.selectionRange);
  if (!selectionRange) throw new SessionContinuityError('E_SESSION_CONTINUITY_SELECTION');

  const previous = validateSessionContinuityV1(previousValue).record;
  const candidate = { projectId, documentRelativePath, selectionRange };
  if (previous && sameContext(previous, candidate)) return previous;
  if (previous && previous.revision >= MAX_CONTEXT_REVISION) {
    throw new SessionContinuityError('E_SESSION_CONTINUITY_REVISION_EXHAUSTED');
  }
  return freezeRecord({
    revision: previous ? previous.revision + 1 : 1,
    ...candidate,
  });
}

module.exports = Object.freeze({
  MAX_CONTEXT_REVISION,
  MAX_RELATIVE_PATH_LENGTH,
  MAX_SELECTION_OFFSET,
  SESSION_CONTINUITY_SCHEMA_VERSION,
  SESSION_CONTINUITY_SETTINGS_KEY,
  SessionContinuityError,
  commitSessionContinuityV1,
  normalizeSessionDocumentRelativePath,
  normalizeSessionProjectId,
  normalizeSessionSelectionRange,
  readSessionContinuityV1,
  validateSessionContinuityV1,
});
