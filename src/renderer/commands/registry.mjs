export function createCommandRegistry() {
  const handlers = new Map();

  function registerCommand(id, handler) {
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('COMMAND_ID_INVALID');
    }
    if (typeof handler !== 'function') {
      throw new Error('COMMAND_HANDLER_INVALID');
    }
    handlers.set(id, handler);
  }

  function getHandler(id) {
    if (typeof id !== 'string') return null;
    return handlers.get(id) || null;
  }

  function hasCommand(id) {
    return handlers.has(id);
  }

  function listCommands() {
    return [...handlers.keys()].sort();
  }

  return {
    registerCommand,
    getHandler,
    hasCommand,
    listCommands,
  };
}
