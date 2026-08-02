import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { atomicWriteFile } from '../markdown/atomicWriteFile.mjs';

export const RTK_ROOT_COMMENT_RETURN_COMMAND_ID = 'cmd.rtk.review.applyRootCommentReturn';
export const RTK_COMMENT_LIFECYCLE_RETURN_COMMAND_ID = 'cmd.rtk.review.applyCommentLifecycleReturn';
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

function normalizeCommentLifecycleInput(input) {
  return {
    projectId: normalizeString(input.projectId),
    projectRoot: normalizeString(input.projectRoot),
    operationId: normalizeString(input.operationId),
    sceneId: normalizeString(input.sceneId),
    threadId: normalizeString(input.threadId || input.parentThreadId),
    action: normalizeString(input.action),
    replyId: normalizeString(input.replyId),
    replyBody: typeof input.replyBody === 'string' ? input.replyBody : '',
  };
}

function applyCommentLifecycleTransition(thread, input) {
  const next = clone(thread);
  if (next.sceneId !== input.sceneId) return blocked('RTK_COMMENT_LIFECYCLE_WRONG_SCENE', 'sceneId');
  if (input.action === 'reply') {
    if (next.status === 'deleted') return blocked('RTK_COMMENT_REPLY_TO_DELETED_THREAD', 'threadId');
    if (!input.replyId || !input.replyBody.trim() || Buffer.byteLength(input.replyBody, 'utf8') > ROOT_COMMENT_BODY_LIMIT) {
      return blocked('RTK_COMMENT_REPLY_INVALID', 'replyBody');
    }
    if (next.messages.some((message) => message.commentId === input.replyId)) {
      return blocked('RTK_COMMENT_REPLY_IDENTITY_COLLISION', 'replyId');
    }
    next.messages.push({ commentId: input.replyId, kind: 'reply', body: input.replyBody });
    return { ok: true, thread: next, eventKind: 'comment_reply_added', transitions: [next.status] };
  }
  if (input.action === 'resolve') {
    if (next.status !== 'open') return blocked('RTK_COMMENT_RESOLVE_INVALID_TRANSITION', 'action');
    next.status = 'resolved';
    return { ok: true, thread: next, eventKind: 'comment_resolved', transitions: ['open', 'resolved'] };
  }
  if (input.action === 'reopen') {
    if (next.status !== 'resolved') return blocked('RTK_COMMENT_REOPEN_INVALID_TRANSITION', 'action');
    next.status = 'open';
    return { ok: true, thread: next, eventKind: 'comment_reopened', transitions: ['resolved', 'open'] };
  }
  if (input.action === 'resolve-reopen') {
    if (next.status !== 'open') return blocked('RTK_COMMENT_RESOLVE_REOPEN_INVALID_TRANSITION', 'action');
    next.status = 'open';
    return { ok: true, thread: next, eventKind: 'comment_resolved_reopened', transitions: ['open', 'resolved', 'open'] };
  }
  if (input.action === 'delete') {
    if (next.status === 'deleted') return blocked('RTK_COMMENT_DELETE_INVALID_TRANSITION', 'action');
    const prior = next.status;
    next.status = 'deleted';
    next.deleted = true;
    return { ok: true, thread: next, eventKind: 'comment_deleted', transitions: [prior, 'deleted'] };
  }
  return blocked('RTK_COMMENT_LIFECYCLE_ACTION_UNSUPPORTED', 'action', { action: input.action });
}

export async function applyCommentLifecycleReturnRuntime(input = {}, options = {}) {
  if (input.commandId !== RTK_COMMENT_LIFECYCLE_RETURN_COMMAND_ID) {
    return blocked('RTK_COMMENT_LIFECYCLE_COMMAND_INVALID', 'commandId');
  }
  if (input.callerRole !== 'main' || input.commandAuthority?.issuer !== 'main'
    || input.commandAuthority?.commandId !== RTK_COMMENT_LIFECYCLE_RETURN_COMMAND_ID
    || input.commandAuthority?.intent !== 'rtk.nonTextReturn') {
    return blocked('RTK_COMMENT_LIFECYCLE_COMMAND_AUTHORITY_INVALID', 'commandAuthority');
  }
  const normalized = normalizeCommentLifecycleInput(input);
  for (const field of ['projectId', 'projectRoot', 'operationId', 'sceneId', 'threadId', 'action']) {
    if (!normalized[field]) return blocked('RTK_COMMENT_LIFECYCLE_REQUIRED_FIELD_MISSING', field);
  }
  const operationDigest = sha256(stableJson({ family: 'comment_lifecycle', ...normalized, projectRoot: undefined }));
  const port = options.port || createRtkNonTextReturnFilePort(options);
  let before;
  try {
    before = await port.readCanonical(normalized);
  } catch (error) {
    return blocked('RTK_COMMENT_LIFECYCLE_CANONICAL_READ_FAILED', 'port.readCanonical', { message: normalizeString(error?.message) });
  }
  const priorEvent = before.events.find((event) => event.operationId === normalized.operationId);
  if (priorEvent) {
    if (priorEvent.operationDigest !== operationDigest) {
      return blocked('RTK_COMMENT_LIFECYCLE_REPLAY_PAYLOAD_MISMATCH', 'operationId');
    }
    const reopened = await port.readCanonical(normalized);
    const replayThread = reopened.threads.find((thread) => thread.threadId === normalized.threadId);
    return {
      ok: true,
      status: 'replay',
      code: 'RTK_COMMENT_LIFECYCLE_ALREADY_APPLIED',
      commandId: RTK_COMMENT_LIFECYCLE_RETURN_COMMAND_ID,
      operationId: normalized.operationId,
      threadStatus: replayThread?.status || '',
      revision: reopened.revision,
      canonicalDigest: sha256(stableJson(reopened)),
      writerCalled: false,
      replay: true,
      vetoMetrics: { wrongSceneRouting: 0, silentApply: 0, replayFailure: 0, silentLoss: 0 },
    };
  }
  const threadIndex = before.threads.findIndex((thread) => thread.threadId === normalized.threadId);
  if (threadIndex < 0) return blocked('RTK_COMMENT_LIFECYCLE_THREAD_NOT_FOUND', 'threadId');
  const transition = applyCommentLifecycleTransition(before.threads[threadIndex], normalized);
  if (!transition.ok) return transition;
  const after = clone(before);
  after.revision += 1;
  after.threads[threadIndex] = transition.thread;
  after.events.push({
    schemaVersion: RTK_NON_TEXT_RETURN_EVENT_SCHEMA,
    sequence: before.events.length + 1,
    operationId: normalized.operationId,
    operationDigest,
    kind: transition.eventKind,
    sceneId: normalized.sceneId,
    threadId: normalized.threadId,
    transitions: transition.transitions,
  });
  let recovery;
  try {
    recovery = await port.writeRecovery({ ...normalized, state: before });
    await port.writeCanonical({ ...normalized, state: after });
  } catch (error) {
    return blocked('RTK_COMMENT_LIFECYCLE_ATOMIC_WRITE_FAILED', 'port.writeCanonical', { message: normalizeString(error?.message) });
  }
  let reopened;
  try {
    reopened = await port.readCanonical(normalized);
  } catch (error) {
    return blocked('RTK_COMMENT_LIFECYCLE_REOPEN_FAILED', 'port.readCanonical', { message: normalizeString(error?.message) });
  }
  if (stableJson(reopened) !== stableJson(after)) return blocked('RTK_COMMENT_LIFECYCLE_REVERSE_VERIFY_FAILED', 'readback');
  return {
    ok: true,
    status: 'applied',
    code: 'RTK_COMMENT_LIFECYCLE_APPLIED',
    commandId: RTK_COMMENT_LIFECYCLE_RETURN_COMMAND_ID,
    operationId: normalized.operationId,
    threadStatus: reopened.threads[threadIndex].status,
    revision: reopened.revision,
    canonicalDigest: sha256(stableJson(reopened)),
    recovery,
    writerCalled: true,
    replay: false,
    vetoMetrics: { wrongSceneRouting: 0, silentApply: 0, replayFailure: 0, silentLoss: 0 },
  };
}

export function createRtkCommentLifecycleReturnCommandHandler(options = {}) {
  return (payload = {}) => applyCommentLifecycleReturnRuntime({
    ...payload,
    commandId: RTK_COMMENT_LIFECYCLE_RETURN_COMMAND_ID,
    callerRole: 'main',
    commandAuthority: {
      ...(isPlainObject(payload.commandAuthority) ? payload.commandAuthority : {}),
      issuer: 'main',
      intent: 'rtk.nonTextReturn',
      commandId: RTK_COMMENT_LIFECYCLE_RETURN_COMMAND_ID,
    },
  }, options);
}

export function buildAuthenticatedCommentReturnCommands(input = {}) {
  if (input.authenticated !== true) return blocked('RTK_COMMENT_PRODUCT_RETURN_NOT_AUTHENTICATED', 'authenticated');
  const reviewIr = isPlainObject(input.reviewIr) ? input.reviewIr : {};
  const authority = isPlainObject(input.localAuthorityCapsule) ? input.localAuthorityCapsule : {};
  const projectId = normalizeString(input.projectId || authority.projectId);
  const projectRoot = normalizeString(authority.projectRoot || input.projectRoot);
  const scenePathBySceneId = isPlainObject(authority.scenePathBySceneId) ? authority.scenePathBySceneId : {};
  const sceneTextBySceneId = isPlainObject(authority.baselineFinalTextBySceneId) ? authority.baselineFinalTextBySceneId : {};
  if (!projectId || !projectRoot) return blocked('RTK_COMMENT_PRODUCT_RETURN_PROJECT_AUTHORITY_REQUIRED', 'localAuthorityCapsule');
  const placements = new Map((Array.isArray(reviewIr.commentPlacements) ? reviewIr.commentPlacements : [])
    .filter(isPlainObject)
    .map((placement) => [normalizeString(placement.threadId), placement]));
  const commands = [];
  const typedBlocked = [];
  for (const [threadIndex, thread] of (Array.isArray(reviewIr.commentThreads) ? reviewIr.commentThreads : []).entries()) {
    if (!isPlainObject(thread)) continue;
    const threadId = normalizeString(thread.threadId || thread.commentId || `comment-thread-${threadIndex + 1}`);
    const placement = placements.get(threadId) || {};
    if (isPlainObject(placement.sceneAuthorityMismatch)) {
      typedBlocked.push({
        threadId,
        code: 'RTK_COMMENT_PRODUCT_RETURN_SCENE_AUTHORITY_MISMATCH',
        parserSceneId: normalizeString(placement.sceneAuthorityMismatch.parserSceneId),
        authenticatedExportMapSceneId: normalizeString(placement.sceneAuthorityMismatch.authenticatedExportMapSceneId),
      });
      continue;
    }
    const sceneId = normalizeString(placement.targetScope?.id || thread.targetScope?.id || thread.sceneId);
    const selectedText = typeof placement.quote === 'string'
      ? placement.quote
      : (typeof thread.quotedAnchorText === 'string' ? thread.quotedAnchorText : '');
    const scenePath = normalizeString(scenePathBySceneId[sceneId]);
    const sceneText = typeof sceneTextBySceneId[sceneId] === 'string' ? sceneTextBySceneId[sceneId] : '';
    const messages = Array.isArray(thread.messages) ? thread.messages.filter(isPlainObject) : [];
    const rootMessage = messages[0] || {};
    const rootBody = typeof rootMessage.body === 'string' ? rootMessage.body : (typeof thread.body === 'string' ? thread.body : '');
    if (!threadId || !sceneId || !scenePath || !sceneText || !selectedText || !rootBody.trim()) {
      typedBlocked.push({
        threadId,
        code: 'RTK_COMMENT_PRODUCT_RETURN_THREAD_AUTHORITY_INCOMPLETE',
        sceneId,
        hasScenePath: Boolean(scenePath),
        hasSceneText: Boolean(sceneText),
        hasSelectedText: Boolean(selectedText),
        hasRootBody: Boolean(rootBody.trim()),
      });
      continue;
    }
    const rootOperationId = `physical-root:${sha256(stableJson({
      returnArtifactId: normalizeString(input.returnArtifactId), threadId, sceneId, selectedText, rootBody,
    }))}`;
    commands.push({
      family: 'root_comment',
      payload: {
        projectId, projectRoot, operationId: rootOperationId, sceneId, scenePath, sceneText, selectedText,
        threadId,
        commentId: normalizeString(rootMessage.messageId || thread.commentId) || `${threadId}:root`,
        body: rootBody,
        anchor: { sceneId },
      },
    });
    const replies = [
      ...messages.slice(1),
      ...(Array.isArray(thread.replies) ? thread.replies.filter(isPlainObject) : []),
    ];
    replies.forEach((reply, replyIndex) => {
      const replyBody = typeof reply.body === 'string' ? reply.body : '';
      const replyId = normalizeString(reply.messageId || reply.commentId || reply.itemId) || `${threadId}:reply:${replyIndex + 1}`;
      commands.push({
        family: 'reply',
        payload: {
          projectId, projectRoot, sceneId, threadId, action: 'reply', replyId, replyBody,
          operationId: `physical-reply:${sha256(stableJson({
            returnArtifactId: normalizeString(input.returnArtifactId), threadId, replyId, replyBody,
          }))}`,
        },
      });
    });
    const rawStatus = normalizeString(thread.status).toLowerCase();
    const lifecycleState = normalizeString(thread.doneResolvedReopenedState).toLowerCase();
    const action = rawStatus === 'deleted' || lifecycleState === 'deleted'
      ? 'delete'
      : rawStatus === 'resolved' || rawStatus === 'done' || lifecycleState === 'resolved'
        ? 'resolve'
        : lifecycleState === 'reopened'
          ? 'resolve-reopen'
          : '';
    if (action) {
      commands.push({
        family: 'comment_state',
        payload: {
          projectId, projectRoot, sceneId, threadId, action,
          operationId: `physical-state:${sha256(stableJson({
            returnArtifactId: normalizeString(input.returnArtifactId), threadId, action,
          }))}`,
        },
      });
    }
  }
  return {
    ok: typedBlocked.length === 0 && commands.length > 0,
    status: typedBlocked.length === 0 && commands.length > 0 ? 'ready' : 'blocked',
    code: typedBlocked.length === 0 && commands.length > 0
      ? 'RTK_COMMENT_PRODUCT_RETURN_COMMANDS_READY'
      : 'RTK_COMMENT_PRODUCT_RETURN_COMMANDS_BLOCKED',
    commands,
    typedBlocked,
    commandBusRequired: true,
    directPortDispatchForbidden: true,
  };
}

export function bindAuthenticatedCommentPlacementSceneAuthority(input = {}) {
  const threads = Array.isArray(input.commentThreads) ? input.commentThreads.filter(isPlainObject) : [];
  const parserPlacements = Array.isArray(input.parserPlacements) ? input.parserPlacements.filter(isPlainObject) : [];
  const authenticatedPlacements = Array.isArray(input.authenticatedPlacements)
    ? input.authenticatedPlacements.filter(isPlainObject)
    : [];
  const capsule = isPlainObject(input.localAuthorityCapsule) ? input.localAuthorityCapsule : {};
  const scenePathBySceneId = isPlainObject(capsule.scenePathBySceneId) ? capsule.scenePathBySceneId : {};
  const sceneTextBySceneId = isPlainObject(capsule.baselineFinalTextBySceneId) ? capsule.baselineFinalTextBySceneId : {};
  const bound = (sceneId) => Boolean(normalizeString(sceneId))
    && Boolean(normalizeString(scenePathBySceneId[sceneId]))
    && typeof sceneTextBySceneId[sceneId] === 'string';
  const parserByThread = new Map(parserPlacements.map((placement) => [normalizeString(placement.threadId), placement]));
  const placements = [];
  const failures = [];
  const parserIdentityOwners = new Map();
  const authenticatedByNativeIdentity = new Map();
  for (const placement of authenticatedPlacements) {
    const nativeCommentId = normalizeString(placement.sourceCommentId || placement.commentId);
    if (!nativeCommentId) {
      failures.push({ threadId: normalizeString(placement.threadId), code: 'RTK_COMMENT_PRODUCT_RETURN_NATIVE_COMMENT_ID_MISSING', side: 'authenticated-candidate' });
      continue;
    }
    if (authenticatedByNativeIdentity.has(nativeCommentId)) {
      failures.push({ nativeCommentId, code: 'RTK_COMMENT_PRODUCT_RETURN_NATIVE_COMMENT_ID_DUPLICATE', side: 'authenticated-candidate' });
      continue;
    }
    authenticatedByNativeIdentity.set(nativeCommentId, placement);
  }
  let identityJoinCount = 0;
  for (const thread of threads) {
    const threadId = normalizeString(thread.threadId);
    const parser = parserByThread.get(threadId) || { threadId, targetScope: { type: 'scene', id: '' } };
    const threadNativeCommentId = normalizeString(thread.sourceCommentId || thread.commentId);
    const placementNativeCommentId = normalizeString(parser.sourceCommentId || parser.commentId);
    if (!threadNativeCommentId) {
      placements.push(clone(parser));
      failures.push({ threadId, code: 'RTK_COMMENT_PRODUCT_RETURN_NATIVE_COMMENT_ID_MISSING', side: 'parser-thread' });
      continue;
    }
    if (placementNativeCommentId && placementNativeCommentId !== threadNativeCommentId) {
      placements.push(clone(parser));
      failures.push({ threadId, code: 'RTK_COMMENT_PRODUCT_RETURN_NATIVE_COMMENT_ID_CONFLICT', threadNativeCommentId, placementNativeCommentId });
      continue;
    }
    const priorOwner = parserIdentityOwners.get(threadNativeCommentId);
    if (priorOwner && priorOwner !== threadId) {
      placements.push(clone(parser));
      failures.push({ threadId, nativeCommentId: threadNativeCommentId, priorThreadId: priorOwner, code: 'RTK_COMMENT_PRODUCT_RETURN_NATIVE_COMMENT_ID_MANY_TO_ONE' });
      continue;
    }
    parserIdentityOwners.set(threadNativeCommentId, threadId);
    const authenticated = authenticatedByNativeIdentity.get(threadNativeCommentId) || null;
    if (!authenticated) {
      placements.push(clone(parser));
      failures.push({ threadId, nativeCommentId: threadNativeCommentId, code: 'RTK_COMMENT_PRODUCT_RETURN_NATIVE_COMMENT_ID_UNJOINED' });
      continue;
    }
    identityJoinCount += 1;
    const parserSceneId = normalizeString(parser.targetScope?.id);
    const authenticatedSceneId = normalizeString(authenticated?.targetScope?.id);
    if (parserSceneId && authenticatedSceneId && parserSceneId !== authenticatedSceneId) {
      const mismatch = { parserSceneId, authenticatedExportMapSceneId: authenticatedSceneId };
      placements.push({ ...clone(parser), sceneAuthorityMismatch: mismatch });
      failures.push({ threadId, code: 'RTK_COMMENT_PRODUCT_RETURN_SCENE_AUTHORITY_MISMATCH', ...mismatch });
      continue;
    }
    if (bound(parserSceneId)) {
      placements.push(clone(parser));
      continue;
    }
    if (bound(authenticatedSceneId)) {
      placements.push({
        ...clone(parser),
        threadId,
        sourceCommentId: threadNativeCommentId,
        targetScope: clone(authenticated.targetScope),
        sceneAuthority: clone(authenticated.sceneAuthority || null),
        sceneAuthoritySource: 'authenticated-candidate-export-map-placement',
      });
      continue;
    }
    placements.push(clone(parser));
    failures.push({
      threadId,
      code: 'RTK_COMMENT_PRODUCT_RETURN_SCENE_AUTHORITY_UNRESOLVED',
      parserSceneId,
      authenticatedExportMapSceneId: authenticatedSceneId,
    });
  }
  return {
    ok: failures.length === 0 && placements.length === threads.length,
    code: failures.length === 0
      ? 'RTK_COMMENT_PRODUCT_RETURN_SCENE_AUTHORITY_BOUND'
      : 'RTK_COMMENT_PRODUCT_RETURN_SCENE_AUTHORITY_BLOCKED',
    placements,
    failures,
    identityJoinCount,
    unjoinedPlacementCount: threads.length - identityJoinCount,
    nativeCommentIdentityJoin: true,
    arbitraryThreadIdSuffixParsingUsed: false,
    quoteHeuristicUsed: false,
  };
}
