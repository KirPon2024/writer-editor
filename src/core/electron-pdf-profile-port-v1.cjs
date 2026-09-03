'use strict';

// Privileged adapter only. It returns derived bytes, never chooses a path or
// publishes a file. BrowserWindow is supplied by the existing Electron host.
function createElectronPdfProfilePort({ BrowserWindow, versions, readIdentity }) {
  if (typeof BrowserWindow !== 'function' || versions?.electron !== '41.10.3' || typeof readIdentity !== 'function') throw new Error('E_PAR_ELECTRON_PROFILE');
  return Object.freeze({
    profileId: 'ELECTRON_41_10_3_OFFLINE_CLASSIC_PDF_V1',
    readIdentity,
    async render(html) {
      if (typeof html !== 'string' || Buffer.byteLength(html) > 1048576 || !html.startsWith('<!doctype html>')) throw new Error('E_PAR_ELECTRON_HTML');
      const window = new BrowserWindow({ show: false, width: 800, height: 1100, webPreferences: { contextIsolation: true, javascript: false, nodeIntegration: false, sandbox: true, webSecurity: true, partition: 'wp704-offline-pdf' } });
      let timer;
      try {
        window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        window.webContents.on('will-navigate', event => event.preventDefault());
        window.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'file://*/*', 'ftp://*/*'] }, (_details, callback) => callback({ cancel: true }));
        const work = async () => { await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)); return Buffer.from(await window.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, generateTaggedPDF: false, generateDocumentOutline: false })); };
        return await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('E_PAR_ELECTRON_TIMEOUT')), 30000); })]);
      } finally {
        clearTimeout(timer);
        if (!window.isDestroyed()) window.destroy();
      }
    },
  });
}
module.exports = { createElectronPdfProfilePort };
