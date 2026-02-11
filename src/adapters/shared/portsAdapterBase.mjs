function toOptionalCommandId(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : '';
}

function makeAdapterError({
  code,
  op,
  reason,
  portId,
  platformId,
  commandId = '',
}) {
  const details = {
    platformId,
    portId,
  };
  if (commandId) {
    details.commandId = commandId;
  }
  return {
    code,
    op,
    reason,
    details,
  };
}

function ensureFunction(api, methodName) {
  if (api && typeof api[methodName] === 'function') {
    return api[methodName].bind(api);
  }
  return null;
}

function wrapMethod(fn, {
  codeOnMissing = 'E_PORT_METHOD_UNAVAILABLE',
  codeOnFailure = 'E_PORT_METHOD_FAILED',
  op,
  portId,
  platformId,
  commandId = '',
}) {
  if (!fn) {
    return async () => {
      throw makeAdapterError({
        code: codeOnMissing,
        op,
        reason: 'PORT_METHOD_UNAVAILABLE',
        portId,
        platformId,
        commandId,
      });
    };
  }

  return async (...args) => {
    try {
      return await fn(...args);
    } catch {
      throw makeAdapterError({
        code: codeOnFailure,
        op,
        reason: 'PORT_METHOD_FAILED',
        portId,
        platformId,
        commandId,
      });
    }
  };
}

function isValidator(fn) {
  return typeof fn === 'function';
}

export function createPortsAdapterBase({
  api = {},
  context = {},
  platformId,
  validators = {},
}) {
  const commandId = toOptionalCommandId(context.commandId);

  const readFileText = ensureFunction(api, 'readFileText');
  const writeFileText = ensureFunction(api, 'writeFileText');
  const fileExists = ensureFunction(api, 'fileExists');
  const openFile = ensureFunction(api, 'openFile');
  const saveFile = ensureFunction(api, 'saveFile');

  const fileSystemPort = {
    read: wrapMethod(readFileText, {
      op: 'filesystem.read',
      portId: 'FileSystemPort',
      platformId,
      commandId,
    }),
    write: wrapMethod(writeFileText, {
      op: 'filesystem.write',
      portId: 'FileSystemPort',
      platformId,
      commandId,
    }),
    exists: wrapMethod(fileExists, {
      op: 'filesystem.exists',
      portId: 'FileSystemPort',
      platformId,
      commandId,
    }),
  };

  const dialogPort = {
    openFile: wrapMethod(openFile, {
      op: 'dialog.openFile',
      portId: 'DialogPort',
      platformId,
      commandId,
    }),
    saveFile: wrapMethod(saveFile, {
      op: 'dialog.saveFile',
      portId: 'DialogPort',
      platformId,
      commandId,
    }),
  };

  const platformInfoPort = {
    getPlatformId() {
      return platformId;
    },
  };

  const { isFileSystemPort, isDialogPort, isPlatformInfoPort } = validators;
  const contractsValid = isValidator(isFileSystemPort)
    && isValidator(isDialogPort)
    && isValidator(isPlatformInfoPort)
    && isFileSystemPort(fileSystemPort)
    && isDialogPort(dialogPort)
    && isPlatformInfoPort(platformInfoPort);

  return Object.freeze({
    fileSystemPort,
    dialogPort,
    platformInfoPort,
    contractsValid,
  });
}
