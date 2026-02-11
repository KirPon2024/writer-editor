import {
  isDialogPort,
  isFileSystemPort,
  isPlatformInfoPort,
} from '../../ports/index.mjs';

function makePortMethodError(code, details = {}) {
  return { code, reason: code, details };
}

function ensureFunction(api, methodName) {
  if (api && typeof api[methodName] === 'function') {
    return api[methodName].bind(api);
  }
  return null;
}

export function createDesktopPortsAdapter(electronAPI = {}) {
  const readFileText = ensureFunction(electronAPI, 'readFileText');
  const writeFileText = ensureFunction(electronAPI, 'writeFileText');
  const fileExists = ensureFunction(electronAPI, 'fileExists');
  const openFile = ensureFunction(electronAPI, 'openFile');
  const saveFile = ensureFunction(electronAPI, 'saveFile');

  const fileSystemPort = {
    async read(path) {
      if (!readFileText) {
        throw makePortMethodError('E_PORT_METHOD_UNAVAILABLE', { method: 'readFileText' });
      }
      return readFileText(path);
    },
    async write(path, data) {
      if (!writeFileText) {
        throw makePortMethodError('E_PORT_METHOD_UNAVAILABLE', { method: 'writeFileText' });
      }
      return writeFileText(path, data);
    },
    async exists(path) {
      if (!fileExists) {
        throw makePortMethodError('E_PORT_METHOD_UNAVAILABLE', { method: 'fileExists' });
      }
      return fileExists(path);
    },
  };

  const dialogPort = {
    async openFile() {
      if (!openFile) {
        throw makePortMethodError('E_PORT_METHOD_UNAVAILABLE', { method: 'openFile' });
      }
      return openFile();
    },
    async saveFile() {
      if (!saveFile) {
        throw makePortMethodError('E_PORT_METHOD_UNAVAILABLE', { method: 'saveFile' });
      }
      return saveFile();
    },
  };

  const platformInfoPort = {
    getPlatformId() {
      return 'node';
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

