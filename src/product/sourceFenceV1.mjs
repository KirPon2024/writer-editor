import crypto from 'node:crypto';

import projectIdDomain from './projectIdDomain.cjs';

const { normalizeProjectId } = projectIdDomain;

export const SOURCE_FENCE_V1_SCHEMAS = Object.freeze({
  observation: 'yalken.sourceFence.observation.v1',
  request: 'yalken.sourceFence.request.v1',
  token: 'yalken.sourceFence.token.v1',
  result: 'yalken.sourceFence.result.v1',
});

export const SOURCE_FENCE_V1_CODES = Object.freeze({
  ALLOWED: 'YALKEN_SOURCE_FENCE_ALLOWED',
  AUTHORITY_NOT_GRANTED: 'YALKEN_SOURCE_FENCE_AUTHORITY_NOT_GRANTED',
  CANONICAL_REVISION_STALE: 'YALKEN_SOURCE_FENCE_CANONICAL_REVISION_STALE',
  DIRTY_DOCUMENT_REJECTED: 'YALKEN_SOURCE_FENCE_DIRTY_DOCUMENT_REJECTED',
  DIRTY_STATE_UNKNOWN: 'YALKEN_SOURCE_FENCE_DIRTY_STATE_UNKNOWN',
  DOCUMENT_ID_MISMATCH: 'YALKEN_SOURCE_FENCE_DOCUMENT_ID_MISMATCH',
  FENCE_TRANSPLANT_REJECTED: 'YALKEN_SOURCE_FENCE_TRANSPLANT_REJECTED',
  FIELD_INVALID: 'YALKEN_SOURCE_FENCE_FIELD_INVALID',
  KEYSET_INVALID: 'YALKEN_SOURCE_FENCE_KEYSET_INVALID',
  PROJECT_ID_MISMATCH: 'YALKEN_SOURCE_FENCE_PROJECT_ID_MISMATCH',
  PURPOSE_MISMATCH: 'YALKEN_SOURCE_FENCE_PURPOSE_MISMATCH',
  ROOT_ID_MISMATCH: 'YALKEN_SOURCE_FENCE_ROOT_ID_MISMATCH',
  SCHEMA_INVALID: 'YALKEN_SOURCE_FENCE_SCHEMA_INVALID',
  SOURCE_DIGEST_MISMATCH: 'YALKEN_SOURCE_FENCE_SOURCE_DIGEST_MISMATCH',
  WORKING_REVISION_STALE: 'YALKEN_SOURCE_FENCE_WORKING_REVISION_STALE',
});

const REQUEST_KEYS = Object.freeze([
  'authority',
  'current',
  'dirtyPolicy',
  'expected',
  'fence',
  'purpose',
  'schemaVersion',
]);
const SOURCE_KEYS = Object.freeze([
  'canonicalRevision',
  'documentId',
  'projectId',
  'rootId',
  'sourceDigest',
  'workingRevision',
]);
const CURRENT_KEYS = Object.freeze([
  'canonicalRevision',
  'dirtyState',
  'documentId',
  'projectId',
  'rootId',
  'sourceDigest',
  'workingRevision',
]);
const TOKEN_KEYS = Object.freeze([
  'canonicalRevision',
  'documentId',
  'fenceDigest',
  'projectId',
  'purpose',
  'rootId',
  'schemaVersion',
  'sourceDigest',
  'workingRevision',
]);
const AUTHORITY_KEYS = Object.freeze(['commandId', 'decision', 'mayWrite']);

const PURPOSES = Object.freeze(['WRITE_SOURCE', 'READ_SOURCE_SNAPSHOT']);
const DIRTY_POLICIES = Object.freeze(['REQUIRE_CLEAN', 'ALLOW_DIRTY_IF_WORKING_REVISION_MATCHES']);
const DIRTY_STATES = Object.freeze(['CLEAN', 'DIRTY', 'UNKNOWN', 'ABSTAIN', 'CONFLICTING']);
const AUTHORITY_DECISIONS = Object.freeze(['ALLOW', 'DENY', 'UNKNOWN', 'ABSTAIN', 'CONFLICTING']);
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!isPlainObject(value) && !Array.isArray(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    if ((isPlainObject(nested) || Array.isArray(nested)) && !Object.isFrozen(nested)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Stable(value) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(stableJson(value), 'utf8')).digest('hex')}`;
}

function sortedKeys(value) {
  return isPlainObject(value) ? Object.keys(value).sort() : [];
}

function sameKeys(actual, expected) {
  const keys = sortedKeys(actual);
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function reason(code, field, expected, actual) {
  const out = { code, field };
  if (expected !== undefined) out.expected = expected;
  if (actual !== undefined) out.actual = actual;
  return Object.freeze(out);
}

function addKeysetReason(reasons, field, actual, expected) {
  reasons.push(reason(
    SOURCE_FENCE_V1_CODES.KEYSET_INVALID,
    field,
    expected,
    sortedKeys(actual),
  ));
}

function normalizeIdentityValue(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed !== value) return '';
  if (/[\\/\u0000-\u001F]/u.test(value)) return '';
  return value;
}

function normalizeRevision(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed !== value) return '';
  if (/[\u0000-\u001F]/u.test(value)) return '';
  return value;
}

function validProjectId(value) {
  return typeof value === 'string' && normalizeProjectId(value) === value;
}

function validSourceDigest(value) {
  return typeof value === 'string' && DIGEST_PATTERN.test(value);
}

function validateSourceFields(reasons, field, value, { current = false, validateKeyset = true } = {}) {
  const keys = current ? CURRENT_KEYS : SOURCE_KEYS;
  if (!isPlainObject(value)) {
    addKeysetReason(reasons, field, value, keys);
    return;
  }
  if (validateKeyset && !sameKeys(value, keys)) addKeysetReason(reasons, field, value, keys);

  if (!validProjectId(value.projectId)) {
    reasons.push(reason(SOURCE_FENCE_V1_CODES.FIELD_INVALID, `${field}.projectId`));
  }
  for (const key of ['rootId', 'documentId']) {
    if (!normalizeIdentityValue(value[key])) {
      reasons.push(reason(SOURCE_FENCE_V1_CODES.FIELD_INVALID, `${field}.${key}`));
    }
  }
  for (const key of ['canonicalRevision', 'workingRevision']) {
    if (!normalizeRevision(value[key])) {
      reasons.push(reason(SOURCE_FENCE_V1_CODES.FIELD_INVALID, `${field}.${key}`));
    }
  }
  if (!validSourceDigest(value.sourceDigest)) {
    reasons.push(reason(SOURCE_FENCE_V1_CODES.FIELD_INVALID, `${field}.sourceDigest`));
  }
  if (current && !DIRTY_STATES.includes(value.dirtyState)) {
    reasons.push(reason(SOURCE_FENCE_V1_CODES.DIRTY_STATE_UNKNOWN, `${field}.dirtyState`));
  }
}

function tokenDigestPayload(input) {
  return {
    schemaVersion: SOURCE_FENCE_V1_SCHEMAS.token,
    purpose: input.purpose,
    projectId: input.projectId,
    rootId: input.rootId,
    documentId: input.documentId,
    canonicalRevision: input.canonicalRevision,
    workingRevision: input.workingRevision,
    sourceDigest: input.sourceDigest,
  };
}

function expectedFenceDigest(input) {
  return sha256Stable(tokenDigestPayload(input));
}

function validateFence(reasons, fence) {
  if (!isPlainObject(fence)) {
    addKeysetReason(reasons, 'fence', fence, TOKEN_KEYS);
    return;
  }
  if (!sameKeys(fence, TOKEN_KEYS)) addKeysetReason(reasons, 'fence', fence, TOKEN_KEYS);
  if (fence.schemaVersion !== SOURCE_FENCE_V1_SCHEMAS.token) {
    reasons.push(reason(SOURCE_FENCE_V1_CODES.SCHEMA_INVALID, 'fence.schemaVersion', SOURCE_FENCE_V1_SCHEMAS.token, fence.schemaVersion));
  }
  validateSourceFields(reasons, 'fence', fence, { validateKeyset: false });
  if (!PURPOSES.includes(fence.purpose)) {
    reasons.push(reason(SOURCE_FENCE_V1_CODES.FIELD_INVALID, 'fence.purpose'));
  }
  if (typeof fence.fenceDigest !== 'string' || !validSourceDigest(fence.fenceDigest)) {
    reasons.push(reason(SOURCE_FENCE_V1_CODES.FIELD_INVALID, 'fence.fenceDigest'));
    return;
  }
  const digest = expectedFenceDigest(fence);
  if (fence.fenceDigest !== digest) {
    reasons.push(reason(SOURCE_FENCE_V1_CODES.FENCE_TRANSPLANT_REJECTED, 'fence.fenceDigest', digest, fence.fenceDigest));
  }
}

function validateAuthority(reasons, authority) {
  if (!isPlainObject(authority)) {
    addKeysetReason(reasons, 'authority', authority, AUTHORITY_KEYS);
    return;
  }
  if (!sameKeys(authority, AUTHORITY_KEYS)) addKeysetReason(reasons, 'authority', authority, AUTHORITY_KEYS);
  if (!AUTHORITY_DECISIONS.includes(authority.decision)) {
    reasons.push(reason(SOURCE_FENCE_V1_CODES.AUTHORITY_NOT_GRANTED, 'authority.decision', AUTHORITY_DECISIONS, authority.decision));
  }
  if (authority.decision !== 'ALLOW' || authority.mayWrite !== true) {
    reasons.push(reason(SOURCE_FENCE_V1_CODES.AUTHORITY_NOT_GRANTED, 'authority'));
  }
  if (!normalizeIdentityValue(authority.commandId)) {
    reasons.push(reason(SOURCE_FENCE_V1_CODES.FIELD_INVALID, 'authority.commandId'));
  }
}

function buildObserved(request) {
  const current = isPlainObject(request?.current) ? request.current : {};
  return Object.freeze({
    purpose: typeof request?.purpose === 'string' ? request.purpose : '',
    projectId: typeof current.projectId === 'string' ? current.projectId : '',
    rootId: typeof current.rootId === 'string' ? current.rootId : '',
    documentId: typeof current.documentId === 'string' ? current.documentId : '',
    canonicalRevision: typeof current.canonicalRevision === 'string' ? current.canonicalRevision : '',
    workingRevision: typeof current.workingRevision === 'string' ? current.workingRevision : '',
    sourceDigest: typeof current.sourceDigest === 'string' ? current.sourceDigest : '',
    dirtyState: typeof current.dirtyState === 'string' ? current.dirtyState : '',
    dirtyPolicy: typeof request?.dirtyPolicy === 'string' ? request.dirtyPolicy : '',
  });
}

function finish(ok, code, reasons, request) {
  return deepFreeze({
    schemaVersion: SOURCE_FENCE_V1_SCHEMAS.result,
    ok,
    decision: ok ? 'ALLOW' : 'DENY',
    code,
    reasons,
    observed: buildObserved(request),
  });
}

function hasBlockingValidation(reasons) {
  return reasons.some((entry) => (
    entry.code === SOURCE_FENCE_V1_CODES.KEYSET_INVALID
    || entry.code === SOURCE_FENCE_V1_CODES.SCHEMA_INVALID
    || entry.code === SOURCE_FENCE_V1_CODES.FIELD_INVALID
  ));
}

export function createSourceFenceTokenV1(input) {
  const reasons = [];
  if (!isPlainObject(input)) {
    throw new TypeError('YALKEN_SOURCE_FENCE_TOKEN_INPUT_INVALID');
  }
  const sourceInputKeys = ['canonicalRevision', 'documentId', 'projectId', 'purpose', 'rootId', 'sourceDigest', 'workingRevision'];
  if (!sameKeys(input, sourceInputKeys)) {
    throw new TypeError('YALKEN_SOURCE_FENCE_TOKEN_INPUT_KEYSET_INVALID');
  }
  validateSourceFields(reasons, 'tokenInput', input, { validateKeyset: false });
  if (!PURPOSES.includes(input.purpose)) {
    reasons.push(reason(SOURCE_FENCE_V1_CODES.FIELD_INVALID, 'tokenInput.purpose'));
  }
  if (reasons.length > 0) {
    const error = new TypeError('YALKEN_SOURCE_FENCE_TOKEN_INPUT_INVALID');
    error.reasons = reasons;
    throw error;
  }
  const payload = tokenDigestPayload(input);
  return deepFreeze({
    ...payload,
    fenceDigest: sha256Stable(payload),
  });
}

export function evaluateSourceFenceV1(request) {
  const reasons = [];
  if (!isPlainObject(request)) {
    addKeysetReason(reasons, 'request', request, REQUEST_KEYS);
    return finish(false, SOURCE_FENCE_V1_CODES.KEYSET_INVALID, reasons, request);
  }

  if (!sameKeys(request, REQUEST_KEYS)) addKeysetReason(reasons, 'request', request, REQUEST_KEYS);
  if (request.schemaVersion !== SOURCE_FENCE_V1_SCHEMAS.request) {
    reasons.push(reason(SOURCE_FENCE_V1_CODES.SCHEMA_INVALID, 'schemaVersion', SOURCE_FENCE_V1_SCHEMAS.request, request.schemaVersion));
  }
  if (!PURPOSES.includes(request.purpose)) {
    reasons.push(reason(SOURCE_FENCE_V1_CODES.FIELD_INVALID, 'purpose'));
  }
  if (!DIRTY_POLICIES.includes(request.dirtyPolicy)) {
    reasons.push(reason(SOURCE_FENCE_V1_CODES.FIELD_INVALID, 'dirtyPolicy'));
  }

  validateSourceFields(reasons, 'expected', request.expected);
  validateSourceFields(reasons, 'current', request.current, { current: true });
  validateFence(reasons, request.fence);
  validateAuthority(reasons, request.authority);

  if (hasBlockingValidation(reasons)) {
    return finish(false, reasons[0].code, reasons, request);
  }

  const { expected, current, fence } = request;

  if (request.purpose !== fence.purpose) {
    reasons.push(reason(SOURCE_FENCE_V1_CODES.PURPOSE_MISMATCH, 'purpose', fence.purpose, request.purpose));
  }

  for (const key of ['projectId', 'rootId', 'documentId', 'canonicalRevision', 'workingRevision', 'sourceDigest']) {
    if (expected[key] !== fence[key]) {
      reasons.push(reason(SOURCE_FENCE_V1_CODES.FENCE_TRANSPLANT_REJECTED, `fence.${key}`, expected[key], fence[key]));
    }
  }

  if (expected.projectId !== current.projectId) {
    reasons.push(reason(SOURCE_FENCE_V1_CODES.PROJECT_ID_MISMATCH, 'current.projectId', expected.projectId, current.projectId));
  }
  if (expected.rootId !== current.rootId) {
    reasons.push(reason(SOURCE_FENCE_V1_CODES.ROOT_ID_MISMATCH, 'current.rootId', expected.rootId, current.rootId));
  }
  if (expected.documentId !== current.documentId) {
    reasons.push(reason(SOURCE_FENCE_V1_CODES.DOCUMENT_ID_MISMATCH, 'current.documentId', expected.documentId, current.documentId));
  }
  if (expected.canonicalRevision !== current.canonicalRevision) {
    reasons.push(reason(
      SOURCE_FENCE_V1_CODES.CANONICAL_REVISION_STALE,
      'current.canonicalRevision',
      expected.canonicalRevision,
      current.canonicalRevision,
    ));
  }
  if (expected.workingRevision !== current.workingRevision) {
    reasons.push(reason(
      SOURCE_FENCE_V1_CODES.WORKING_REVISION_STALE,
      'current.workingRevision',
      expected.workingRevision,
      current.workingRevision,
    ));
  }
  if (expected.sourceDigest !== current.sourceDigest) {
    reasons.push(reason(SOURCE_FENCE_V1_CODES.SOURCE_DIGEST_MISMATCH, 'current.sourceDigest', expected.sourceDigest, current.sourceDigest));
  }
  if (['UNKNOWN', 'ABSTAIN', 'CONFLICTING'].includes(current.dirtyState)) {
    reasons.push(reason(SOURCE_FENCE_V1_CODES.DIRTY_STATE_UNKNOWN, 'current.dirtyState', 'CLEAN_OR_DIRTY', current.dirtyState));
  } else if (request.dirtyPolicy === 'REQUIRE_CLEAN' && current.dirtyState === 'DIRTY') {
    reasons.push(reason(SOURCE_FENCE_V1_CODES.DIRTY_DOCUMENT_REJECTED, 'current.dirtyState', 'CLEAN', current.dirtyState));
  }

  if (reasons.length > 0) {
    return finish(false, reasons[0].code, reasons, request);
  }
  return finish(true, SOURCE_FENCE_V1_CODES.ALLOWED, [], request);
}
