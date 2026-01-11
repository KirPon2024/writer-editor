const { contextBridge, ipcRenderer } = require('electron');

// Экспорт безопасного API для renderer процесса
contextBridge.exposeInMainWorld('electronAPI', {
  onFontChanged: (callback) => {
    ipcRenderer.on('font-changed', (event, fontFamily) => callback(fontFamily));
  },
  onThemeChanged: (callback) => {
    ipcRenderer.on('theme-changed', (event, theme) => callback(theme));
  }
});
