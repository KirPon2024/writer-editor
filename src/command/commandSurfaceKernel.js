'use strict';

const ALLOWED_COMMAND_IDS = Object.freeze([
  'cmd.project.open',
  'cmd.project.save',
  'cmd.project.saveAs',
  'cmd.project.exportCurrentSceneTxtV1',
  'cmd.project.exportSelectedScenesTxtV1',
  'cmd.project.exportAllScenesTxtV1',
  'cmd.project.exportPdfV1',
  'cmd.project.exportFullArchiveV1',
  'cmd.project.importFullArchiveV1',
  'cmd.project.importMarkdownV1',
  'cmd.project.exportMarkdownV1',
  'cmd.project.releaseClaim.admit',
  'cmd.project.releaseClaim.execute',
  'cmd.rtk.reviewSession.importComments',
]);

const ALLOWED_COMMAND_ID_SET = new Set(ALLOWED_COMMAND_IDS);
const TYPED_RESULT_COMMAND_IDS = new Set([
  'cmd.project.releaseClaim.admit',
  'cmd.project.releaseClaim.execute',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCommandId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function makeTypedError(code, op, reason, details) {
  const error = { code, op, reason };
  if (isPlainObject(details) && Object.keys(details).length > 0) {
    error.details = { ...details };
  }
  return { ok: false, error };
}

function normalizeCommandError(input, commandId) {
  const source = isPlainObject(input)
    ? (isPlainObject(input.error) ? input.error : input)
    : {};

  return {
    code: typeof source.code === 'string' && source.code.length > 0
      ? source.code
      : 'E_COMMAND_FAILED',
    op: typeof source.op === 'string' && source.op.length > 0
      ? source.op
      : commandId,
    reason: typeof source.reason === 'string' && source.reason.length > 0
      ? source.reason
      : 'UNHANDLED_EXCEPTION',
    details: isPlainObject(source.details)
      ? { ...source.details }
      : (typeof source.message === 'string' && source.message.length > 0
        ? { message: source.message }
        : undefined),
  };
}

function isTypedCommandSurfaceResult(input, commandId) {
  return isPlainObject(input)
    && TYPED_RESULT_COMMAND_IDS.has(commandId)
    && typeof input.type === 'string'
    && input.type.length > 0
    && typeof input.status === 'string'
    && input.status.length > 0
    && !isPlainObject(input.error);
}

function createCommandSurfaceKernel(handlerMap = {}) {
  const handlers = isPlainObject(handlerMap) ? { ...handlerMap } : {};

  async function dispatch(commandIdRaw, payloadRaw = {}) {
    const commandId = normalizeCommandId(commandIdRaw);
    if (!ALLOWED_COMMAND_ID_SET.has(commandId)) {
      return makeTypedError(
        'E_COMMAND_ID_NOT_ALLOWED',
        commandId || 'command.surface',
        'COMMAND_ID_NOT_ALLOWED',
      );
    }
    if (!isPlainObject(payloadRaw)) {
      return makeTypedError(
        'E_PAYLOAD_CONTRACT_VALIDATION_MISSING',
        commandId,
        'ARGS_OBJECT_REQUIRED',
      );
    }
    const handler = handlers[commandId];
    if (typeof handler !== 'function') {
      return makeTypedError(
        'E_COMMAND_HANDLER_MISSING',
        commandId,
        'COMMAND_HANDLER_MISSING',
      );
    }

    try {
      const result = await handler(payloadRaw);
      if (isPlainObject(result)) {
        if (isTypedCommandSurfaceResult(result, commandId)) {
          return result;
        }
        if (result.ok === false || result.ok === 0 || isPlainObject(result.error)) {
          const normalized = normalizeCommandError(result, commandId);
          return makeTypedError(normalized.code, normalized.op, normalized.reason, normalized.details);
        }
        if (typeof result.code === 'string' && typeof result.reason === 'string') {
          const normalized = normalizeCommandError(result, commandId);
          return makeTypedError(normalized.code, normalized.op, normalized.reason, normalized.details);
        }
        return result;
      }
      return { ok: Boolean(result) };
    } catch (error) {
      const normalized = normalizeCommandError(error, commandId);
      return makeTypedError(normalized.code, normalized.op, normalized.reason, normalized.details);
    }
  }

  return Object.freeze({
    dispatch,
    listAllowedCommandIds() {
      return [...ALLOWED_COMMAND_IDS];
    },
  });
}

module.exports = {
  ALLOWED_COMMAND_IDS,
  createCommandSurfaceKernel,
};
