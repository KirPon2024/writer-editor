import { createConflictEnvelope } from './conflictEnvelope.mjs';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeEvent(event) {
  const src = isPlainObject(event) ? event : {};
  return {
    opId: typeof src.opId === 'string' ? src.opId.trim() : '',
    authorId: typeof src.authorId === 'string' ? src.authorId.trim() : '',
    ts: typeof src.ts === 'string' ? src.ts.trim() : '',
    commandId: typeof src.commandId === 'string' ? src.commandId.trim() : '',
    baseVersion: Number.isInteger(src.baseVersion) ? src.baseVersion : null,
    nextVersion: Number.isInteger(src.nextVersion) ? src.nextVersion : null,
    content: typeof src.content === 'string' ? src.content : '',
  };
}

function normalizeState(state) {
  const src = isPlainObject(state) ? state : {};
  return {
    version: Number.isInteger(src.version) ? src.version : 0,
    content: typeof src.content === 'string' ? src.content : '',
    lastOpId: typeof src.lastOpId === 'string' ? src.lastOpId : '',
  };
}

export function mergeRemoteEvent(input = {}) {
  const localState = normalizeState(input.localState);
  const remoteEvent = normalizeEvent(input.remoteEvent);
  const detailBase = {
    opId: remoteEvent.opId || 'unknown-op',
    authorId: remoteEvent.authorId || 'unknown-author',
    ts: remoteEvent.ts || 'unknown-ts',
    commandId: remoteEvent.commandId || 'unknown-command',
  };

  if (!remoteEvent.opId || !remoteEvent.authorId || !remoteEvent.ts || !remoteEvent.commandId) {
    return {
      verdict: 'rejected',
      state: localState,
      envelope: createConflictEnvelope({
        code: 'E_COLLAB_EVENT_INVALID',
        op: 'collab.merge',
        reason: 'EVENT_FIELDS_REQUIRED',
        details: detailBase,
      }),
    };
  }

  if (remoteEvent.baseVersion === null || remoteEvent.nextVersion === null) {
    return {
      verdict: 'rejected',
      state: localState,
      envelope: createConflictEnvelope({
        code: 'E_COLLAB_EVENT_INVALID',
        op: 'collab.merge',
        reason: 'EVENT_VERSION_REQUIRED',
        details: detailBase,
      }),
    };
  }

  if (remoteEvent.baseVersion !== localState.version) {
    return {
      verdict: 'rejected',
      state: localState,
      envelope: createConflictEnvelope({
        code: 'E_COLLAB_BASE_VERSION_MISMATCH',
        op: 'collab.merge',
        reason: 'BASE_VERSION_CONFLICT',
        details: detailBase,
      }),
    };
  }

  if (remoteEvent.nextVersion <= localState.version) {
    return {
      verdict: 'rejected',
      state: localState,
      envelope: createConflictEnvelope({
        code: 'E_COLLAB_NEXT_VERSION_INVALID',
        op: 'collab.merge',
        reason: 'NEXT_VERSION_NOT_MONOTONIC',
        details: detailBase,
      }),
    };
  }

  if (remoteEvent.opId === localState.lastOpId) {
    return {
      verdict: 'noop',
      state: localState,
      envelope: null,
    };
  }

  return {
    verdict: 'applied',
    state: {
      version: remoteEvent.nextVersion,
      content: remoteEvent.content,
      lastOpId: remoteEvent.opId,
    },
    envelope: null,
  };
}
