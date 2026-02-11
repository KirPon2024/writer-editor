const DEFAULT_CODE = 'E_COLLAB_CONFLICT';
const DEFAULT_OP = 'collab.merge';
const DEFAULT_REASON = 'CONFLICT_DETECTED';

function normalizeString(value, fallback = '') {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || fallback;
}

export function createConflictEnvelope(input = {}) {
  const details = input && typeof input.details === 'object' && !Array.isArray(input.details)
    ? input.details
    : {};

  return {
    code: normalizeString(input.code, DEFAULT_CODE),
    op: normalizeString(input.op, DEFAULT_OP),
    reason: normalizeString(input.reason, DEFAULT_REASON),
    details: {
      opId: normalizeString(details.opId, 'unknown-op'),
      authorId: normalizeString(details.authorId, 'unknown-author'),
      ts: normalizeString(details.ts, 'unknown-ts'),
      commandId: normalizeString(details.commandId, 'unknown-command'),
    },
  };
}
