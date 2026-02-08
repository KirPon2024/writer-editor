function fail(code, op, reason, details) {
  const error = { code, op, reason };
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    error.details = details;
  }
  return { ok: false, error };
}

export function createCommandRunner(registry) {
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

    try {
      const output = await handler(input);
      if (output && typeof output === 'object' && typeof output.ok === 'boolean') {
        return output;
      }
      return { ok: true, value: output };
    } catch (error) {
      const reason = error && typeof error.message === 'string' && error.message.length > 0
        ? error.message
        : 'UNHANDLED_EXCEPTION';
      return fail('E_COMMAND_FAILED', id, reason);
    }
  };
}
