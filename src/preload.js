const { contextBridge, ipcRenderer } = require('electron');

// Экспорт безопасного API для renderer процесса
contextBridge.exposeInMainWorld('electronAPI', {
  onFontChanged: (callback) => {
    ipcRenderer.on('font-changed', (event, fontFamily) => callback(fontFamily));
  },
  onThemeChanged: (callback) => {
    ipcRenderer.on('theme-changed', (event, theme) => callback(theme));
  },
  onEditorSetText: (callback) => {
    ipcRenderer.on('editor:set-text', (event, text) => callback(text));
  },
  onEditorTextRequest: (callback) => {
    ipcRenderer.on('editor:text-request', (event, payload) => callback(payload));
  },
  sendEditorTextResponse: (requestId, text) => {
    ipcRenderer.send('editor:text-response', { requestId, text });
  },
  onEditorSetFontSize: (callback) => {
    ipcRenderer.on('editor:set-font-size', (event, payload) => callback(payload));
  },
  notifyDirtyState: (state) => {
    ipcRenderer.send('dirty-changed', state);
  },
  onStatusUpdate: (callback) => {
    ipcRenderer.on('status-update', (event, status) => callback(status));
  },
  onSetDirty: (callback) => {
    ipcRenderer.on('set-dirty', (event, state) => callback(state));
  }
});
