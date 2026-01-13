const { contextBridge, ipcRenderer } = require('electron');

// Экспорт безопасного API для renderer процесса
contextBridge.exposeInMainWorld('electronAPI', {
  onFontChanged: (callback) => {
    ipcRenderer.on('font-changed', (event, fontFamily) => callback(fontFamily));
  },
  onThemeChanged: (callback) => {
    ipcRenderer.on('theme-changed', (event, theme) => callback(theme));
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
