import { enforceCapabilityForCommand } from './capabilityPolicy.mjs';

function fail(code, op, reason, details) {
  const error = { code, op, reason };
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    error.details = details;
  }
  return { ok: false, error };
}

function normalizeCommandError(input, commandId) {
  const fallbackCode = 'E_COMMAND_FAILED';
  const fallbackReason = 'UNHANDLED_EXCEPTION';
  const source = input && typeof input === 'object' ? input : {};
  const code = typeof source.code === 'string' && source.code.length > 0
    ? source.code
    : fallbackCode;
  const op = typeof source.op === 'string' && source.op.length > 0
    ? source.op
    : commandId;
  const reason = typeof source.reason === 'string' && source.reason.length > 0
    ? source.reason
    : (typeof source.message === 'string' && source.message.length > 0
      ? source.message
      : fallbackReason);
  const details = source.details && typeof source.details === 'object' && !Array.isArray(source.details)
    ? source.details
    : undefined;
  return { code, op, reason, details };
}

export function createCommandRunner(registry, options = {}) {
  if (!registry || typeof registry.getHandler !== 'function') {
    throw new Error('COMMAND_REGISTRY_INVALID');
  }

  return async function runCommand(id, input = {}) {
    if (typeof id !== 'string' || id.trim().length === 0) {
      return fail('E_COMMAND_NOT_FOUND', String(id || ''), 'COMMAND_ID_INVALID');
    }

    const handler = registry.getHandler(id);
    if (typeof handler !== 'function') {
      return fail('E_COMMAND_NOT_FOUND', id, 'COMMAND_NOT_REGISTERED');
    }

    const capabilityCheck = enforceCapabilityForCommand(id, input, options.capability || {});
    if (!capabilityCheck.ok) {
      const normalized = normalizeCommandError(capabilityCheck.error, id);
      return fail(normalized.code, normalized.op, normalized.reason, normalized.details);
    }

    try {
      const output = await handler(input);
      if (output && typeof output === 'object' && typeof output.ok === 'boolean') {
        if (output.ok) return output;
        const normalized = normalizeCommandError(output.error, id);
        return fail(normalized.code, normalized.op, normalized.reason, normalized.details);
      }
      if (output && typeof output === 'object' && output.error && typeof output.error === 'object') {
        const normalized = normalizeCommandError(output.error, id);
        return fail(normalized.code, normalized.op, normalized.reason, normalized.details);
      }
      if (output && typeof output === 'object' && output.code && output.reason) {
        const normalized = normalizeCommandError(output, id);
        return fail(normalized.code, normalized.op, normalized.reason, normalized.details);
      }
      return { ok: true, value: output };
    } catch (error) {
      const normalized = normalizeCommandError(error, id);
      return fail(normalized.code, normalized.op, normalized.reason, normalized.details);
    }
  };
}
