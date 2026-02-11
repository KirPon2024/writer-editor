import {
  isDialogPort,
  isFileSystemPort,
  isPlatformInfoPort,
} from '../../ports/index.mjs';

const PLATFORM_ID = 'node';

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
  commandId = '',
}) {
  const details = {
    platformId: PLATFORM_ID,
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
  commandId = '',
}) {
  if (!fn) {
    return async () => {
      throw makeAdapterError({
        code: codeOnMissing,
        op,
        reason: 'PORT_METHOD_UNAVAILABLE',
        portId,
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
        commandId,
      });
    }
  };
}

export function createDesktopPortsAdapter(electronAPI = {}, context = {}) {
  const commandId = toOptionalCommandId(context.commandId);
  const readFileText = ensureFunction(electronAPI, 'readFileText');
  const writeFileText = ensureFunction(electronAPI, 'writeFileText');
  const fileExists = ensureFunction(electronAPI, 'fileExists');
  const openFile = ensureFunction(electronAPI, 'openFile');
  const saveFile = ensureFunction(electronAPI, 'saveFile');

  const fileSystemPort = {
    read: wrapMethod(readFileText, {
      op: 'filesystem.read',
      portId: 'FileSystemPort',
      commandId,
    }),
    write: wrapMethod(writeFileText, {
      op: 'filesystem.write',
      portId: 'FileSystemPort',
      commandId,
    }),
    exists: wrapMethod(fileExists, {
      op: 'filesystem.exists',
      portId: 'FileSystemPort',
      commandId,
    }),
  };

  const dialogPort = {
    openFile: wrapMethod(openFile, {
      op: 'dialog.openFile',
      portId: 'DialogPort',
      commandId,
    }),
    saveFile: wrapMethod(saveFile, {
      op: 'dialog.saveFile',
      portId: 'DialogPort',
      commandId,
    }),
  };

  const platformInfoPort = {
    getPlatformId() {
      return PLATFORM_ID;
    },
  };

  return Object.freeze({
    fileSystemPort,
    dialogPort,
    platformInfoPort,
    contractsValid: isFileSystemPort(fileSystemPort)
      && isDialogPort(dialogPort)
      && isPlatformInfoPort(platformInfoPort),
  });
}
