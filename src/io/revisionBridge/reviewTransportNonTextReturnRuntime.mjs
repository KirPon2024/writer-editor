import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { atomicWriteFile } from '../markdown/atomicWriteFile.mjs';

export const RTK_ROOT_COMMENT_RETURN_COMMAND_ID = 'cmd.rtk.review.applyRootCommentReturn';
export const RTK_NON_TEXT_RETURN_STATE_SCHEMA = 'yalken.rtk.word.non-text-return-state.v1';
export const RTK_NON_TEXT_RETURN_EVENT_SCHEMA = 'yalken.rtk.word.non-text-return-event.v1';

const STATE_RELATIVE_PATH = path.join('.yalken', 'word-review', 'non-text-return-state.v1.json');
const RECOVERY_RELATIVE_PATH = path.join('.yalken', 'recovery', 'non-text-return-state.v1.json');
const ROOT_COMMENT_BODY_LIMIT = 16_384;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function blocked(code, field, details = {}) {
  return {
    ok: false,
    status: 'blocked',
    code,
    reason: code,
    reasons: [{ code, field, details: isPlainObject(details) ? clone(details) : {} }],
    writerCalled: false,
  };
}

function assertProjectPath(projectRoot, targetPath) {
  const root = path.resolve(projectRoot);
  const target = path.resolve(targetPath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error('RTK_NON_TEXT_PORT_PATH_ESCAPE');
  }
  return target;
}

function emptyState(projectId) {
  return {
    schemaVersion: RTK_NON_TEXT_RETURN_STATE_SCHEMA,
    projectId,
    revision: 0,
    threads: [],
    events: [],
  };
}

function validateState(value, projectId) {
  if (!isPlainObject(value) || value.schemaVersion !== RTK_NON_TEXT_RETURN_STATE_SCHEMA) {
    throw new Error('RTK_NON_TEXT_STATE_SCHEMA_INVALID');
  }
  if (normalizeString(value.projectId) !== projectId) throw new Error('RTK_NON_TEXT_STATE_PROJECT_MISMATCH');
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('RTK_NON_TEXT_STATE_REVISION_INVALID');
  if (!Array.isArray(value.threads) || !Array.isArray(value.events)) throw new Error('RTK_NON_TEXT_STATE_COLLECTION_INVALID');
  return clone(value);
}

export function createRtkNonTextReturnFilePort(options = {}) {
  const atomicWriter = typeof options.atomicWriteFile === 'function' ? options.atomicWriteFile : atomicWriteFile;
  return {
    async readCanonical({ projectRoot, projectId }) {
      const statePath = assertProjectPath(projectRoot, path.join(projectRoot, STATE_RELATIVE_PATH));
      try {
        return validateState(JSON.parse(await fs.promises.readFile(statePath, 'utf8')), projectId);
      } catch (error) {
        if (error?.code === 'ENOENT') return emptyState(projectId);
        throw error;
      }
    },
    async writeRecovery({ projectRoot, state }) {
      const recoveryPath = assertProjectPath(projectRoot, path.join(projectRoot, RECOVERY_RELATIVE_PATH));
      await atomicWriter(recoveryPath, `${JSON.stringify(state, null, 2)}\n`, { safetyMode: 'strict' });
      return { recoveryPath, sha256: sha256(stableJson(state)) };
    },
    async writeCanonical({ projectRoot, state }) {
      const statePath = assertProjectPath(projectRoot, path.join(projectRoot, STATE_RELATIVE_PATH));
      await atomicWriter(statePath, `${JSON.stringify(state, null, 2)}\n`, { safetyMode: 'strict' });
      return { statePath, sha256: sha256(stableJson(state)) };
    },
  };
}

function normalizeRootCommentInput(input) {
  const projectId = normalizeString(input.projectId);
  const projectRoot = normalizeString(input.projectRoot);
  const operationId = normalizeString(input.operationId);
  const sceneId = normalizeString(input.sceneId);
  const threadId = normalizeString(input.threadId);
  const commentId = normalizeString(input.commentId) || `${threadId}:root`;
  const body = typeof input.body === 'string' ? input.body : '';
  const selectedText = typeof input.selectedText === 'string' ? input.selectedText : '';
  const sceneText = typeof input.sceneText === 'string' ? input.sceneText : '';
  return { projectId, projectRoot, operationId, sceneId, threadId, commentId, body, selectedText, sceneText };
}

function countOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let cursor = 0;
  while (cursor <= text.length) {
    const index = text.indexOf(needle, cursor);
    if (index < 0) break;
    count += 1;
    cursor = index + Math.max(1, needle.length);
  }
  return count;
}

export async function applyRootCommentReturnRuntime(input = {}, options = {}) {
  if (input.commandId !== RTK_ROOT_COMMENT_RETURN_COMMAND_ID) return blocked('RTK_ROOT_COMMENT_COMMAND_INVALID', 'commandId');
  if (input.callerRole !== 'main' || input.commandAuthority?.issuer !== 'main'
    || input.commandAuthority?.commandId !== RTK_ROOT_COMMENT_RETURN_COMMAND_ID
    || input.commandAuthority?.intent !== 'rtk.nonTextReturn') {
    return blocked('RTK_ROOT_COMMENT_COMMAND_AUTHORITY_INVALID', 'commandAuthority');
  }
  const normalized = normalizeRootCommentInput(input);
  for (const field of ['projectId', 'projectRoot', 'operationId', 'sceneId', 'threadId', 'commentId']) {
    if (!normalized[field]) return blocked('RTK_ROOT_COMMENT_REQUIRED_FIELD_MISSING', field);
  }
  if (!normalized.body.trim() || Buffer.byteLength(normalized.body, 'utf8') > ROOT_COMMENT_BODY_LIMIT) {
    return blocked('RTK_ROOT_COMMENT_BODY_INVALID', 'body');
  }
  if (!normalized.selectedText || countOccurrences(normalized.sceneText, normalized.selectedText) !== 1) {
    return blocked('RTK_ROOT_COMMENT_ANCHOR_NOT_UNIQUE', 'selectedText');
  }
  if (normalizeString(input.anchor?.sceneId) !== normalized.sceneId) {
    return blocked('RTK_ROOT_COMMENT_WRONG_SCENE', 'anchor.sceneId');
  }
  const operationDigest = sha256(stableJson({
    family: 'root_comment',
    operationId: normalized.operationId,
    sceneId: normalized.sceneId,
    threadId: normalized.threadId,
    commentId: normalized.commentId,
    body: normalized.body,
    selectedText: normalized.selectedText,
  }));
  const port = options.port || createRtkNonTextReturnFilePort(options);
  let before;
  try {
    before = await port.readCanonical(normalized);
  } catch (error) {
    return blocked('RTK_ROOT_COMMENT_CANONICAL_READ_FAILED', 'port.readCanonical', { message: normalizeString(error?.message) });
  }
  const priorEvent = before.events.find((event) => event.operationId === normalized.operationId);
  if (priorEvent) {
    if (priorEvent.operationDigest !== operationDigest) return blocked('RTK_ROOT_COMMENT_REPLAY_PAYLOAD_MISMATCH', 'operationId');
    const reopened = await port.readCanonical(normalized);
    return {
      ok: true,
      status: 'replay',
      code: 'RTK_ROOT_COMMENT_ALREADY_APPLIED',
      commandId: RTK_ROOT_COMMENT_RETURN_COMMAND_ID,
      operationId: normalized.operationId,
      revision: reopened.revision,
      canonicalDigest: sha256(stableJson(reopened)),
      writerCalled: false,
      replay: true,
      vetoMetrics: { wrongSceneRouting: 0, silentApply: 0, replayFailure: 0, silentLoss: 0 },
    };
  }
  if (before.threads.some((thread) => thread.threadId === normalized.threadId || thread.rootCommentId === normalized.commentId)) {
    return blocked('RTK_ROOT_COMMENT_IDENTITY_COLLISION', 'threadId');
  }
  const event = {
    schemaVersion: RTK_NON_TEXT_RETURN_EVENT_SCHEMA,
    sequence: before.events.length + 1,
    operationId: normalized.operationId,
    operationDigest,
    kind: 'root_comment_added',
    sceneId: normalized.sceneId,
    threadId: normalized.threadId,
  };
  const after = {
    ...before,
    revision: before.revision + 1,
    threads: [...before.threads, {
      threadId: normalized.threadId,
      sceneId: normalized.sceneId,
      status: 'open',
      anchor: { selectedText: normalized.selectedText, selectedTextSha256: sha256(normalized.selectedText) },
      rootCommentId: normalized.commentId,
      messages: [{ commentId: normalized.commentId, kind: 'root', body: normalized.body }],
    }],
    events: [...before.events, event],
  };
  let recovery;
  try {
    recovery = await port.writeRecovery({ ...normalized, state: before });
    await port.writeCanonical({ ...normalized, state: after });
  } catch (error) {
    return blocked('RTK_ROOT_COMMENT_ATOMIC_WRITE_FAILED', 'port.writeCanonical', { message: normalizeString(error?.message) });
  }
  let reopened;
  try {
    reopened = await port.readCanonical(normalized);
  } catch (error) {
    return blocked('RTK_ROOT_COMMENT_REOPEN_FAILED', 'port.readCanonical', { message: normalizeString(error?.message) });
  }
  if (stableJson(reopened) !== stableJson(after)) return blocked('RTK_ROOT_COMMENT_REVERSE_VERIFY_FAILED', 'readback');
  return {
    ok: true,
    status: 'applied',
    code: 'RTK_ROOT_COMMENT_APPLIED',
    commandId: RTK_ROOT_COMMENT_RETURN_COMMAND_ID,
    operationId: normalized.operationId,
    revision: reopened.revision,
    canonicalDigest: sha256(stableJson(reopened)),
    recovery,
    writerCalled: true,
    replay: false,
    vetoMetrics: { wrongSceneRouting: 0, silentApply: 0, replayFailure: 0, silentLoss: 0 },
  };
}

export function createRtkRootCommentReturnCommandHandler(options = {}) {
  return (payload = {}) => applyRootCommentReturnRuntime({
    ...payload,
    commandId: RTK_ROOT_COMMENT_RETURN_COMMAND_ID,
    callerRole: 'main',
    commandAuthority: {
      ...(isPlainObject(payload.commandAuthority) ? payload.commandAuthority : {}),
      issuer: 'main',
      intent: 'rtk.nonTextReturn',
      commandId: RTK_ROOT_COMMENT_RETURN_COMMAND_ID,
    },
  }, options);
}
