export function createCommandRegistry() {
  const handlers = new Map();
  const metadata = new Map();

  function normalizeSurface(input) {
    if (Array.isArray(input)) {
      return [...new Set(input.filter((item) => typeof item === 'string' && item.trim().length > 0))]
        .map((item) => item.trim())
        .sort();
    }
    if (typeof input === 'string' && input.trim().length > 0) {
      return [input.trim()];
    }
    return [];
  }

  function normalizeCommandMeta(id, input = {}) {
    const normalizedId = typeof id === 'string' ? id.trim() : '';
    return Object.freeze({
      id: normalizedId,
      label: typeof input.label === 'string' && input.label.trim().length > 0
        ? input.label.trim()
        : normalizedId,
      group: typeof input.group === 'string' && input.group.trim().length > 0
        ? input.group.trim()
        : 'ungrouped',
      surface: normalizeSurface(input.surface),
      hotkey: typeof input.hotkey === 'string' && input.hotkey.trim().length > 0
        ? input.hotkey.trim()
        : '',
    });
  }

  function parseRegistration(commandOrId, maybeHandler) {
    if (commandOrId && typeof commandOrId === 'object' && !Array.isArray(commandOrId)) {
      const id = typeof commandOrId.id === 'string' ? commandOrId.id : '';
      const handler = typeof commandOrId.handler === 'function'
        ? commandOrId.handler
        : maybeHandler;
      const meta = normalizeCommandMeta(id, commandOrId);
      return { id: meta.id, handler, meta };
    }
    const id = typeof commandOrId === 'string' ? commandOrId : '';
    return {
      id: id.trim(),
      handler: maybeHandler,
      meta: normalizeCommandMeta(id),
    };
  }

  function registerCommand(commandOrId, maybeHandler) {
    const registration = parseRegistration(commandOrId, maybeHandler);
    const { id, handler, meta } = registration;
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('COMMAND_ID_INVALID');
    }
    if (typeof handler !== 'function') {
      throw new Error('COMMAND_HANDLER_INVALID');
    }
    handlers.set(id, handler);
    metadata.set(id, meta);
  }

  function getHandler(id) {
    if (typeof id !== 'string') return null;
    return handlers.get(id) || null;
  }

  function getMeta(id) {
    if (typeof id !== 'string') return null;
    return metadata.get(id) || null;
  }

  function hasCommand(id) {
    return handlers.has(id);
  }

  function listCommands() {
    return [...handlers.keys()].sort();
  }

  function listCommandMeta() {
    return listCommands()
      .map((id) => metadata.get(id) || normalizeCommandMeta(id))
      .map((entry) => ({ ...entry, surface: [...entry.surface] }));
  }

  function listByGroup(group) {
    const normalizedGroup = typeof group === 'string' ? group.trim() : '';
    const entries = listCommandMeta();
    if (!normalizedGroup) return entries;
    return entries.filter((entry) => entry.group === normalizedGroup);
  }

  function listBySurface(surface) {
    const normalizedSurface = typeof surface === 'string' ? surface.trim() : '';
    const entries = listCommandMeta();
    if (!normalizedSurface) return entries;
    return entries.filter((entry) => entry.surface.includes(normalizedSurface));
  }

  return {
    registerCommand,
    getHandler,
    getMeta,
    hasCommand,
    listCommands,
    listCommandMeta,
    listByGroup,
    listBySurface,
  };
}
