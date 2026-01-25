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
  newFile: () => {
    ipcRenderer.send('ui:new');
  },
  openFile: () => {
    ipcRenderer.send('ui:open');
  },
  saveFile: () => {
    ipcRenderer.send('ui:save');
  },
  saveAs: () => {
    ipcRenderer.send('ui:save-as');
  },
  openSection: (sectionName) => {
    return ipcRenderer.invoke('ui:open-section', { sectionName });
  },
  getProjectTree: (tab) => {
    return ipcRenderer.invoke('ui:get-project-tree', { tab });
  },
  openDocument: (payload) => {
    return ipcRenderer.invoke('ui:open-document', payload);
  },
  createNode: (payload) => {
    return ipcRenderer.invoke('ui:create-node', payload);
  },
  renameNode: (payload) => {
    return ipcRenderer.invoke('ui:rename-node', payload);
  },
  deleteNode: (payload) => {
    return ipcRenderer.invoke('ui:delete-node', payload);
  },
  reorderNode: (payload) => {
    return ipcRenderer.invoke('ui:reorder-node', payload);
  },
  setTheme: (theme) => {
    ipcRenderer.send('ui:set-theme', theme);
  },
  setFont: (fontFamily) => {
    ipcRenderer.send('ui:set-font', fontFamily);
  },
  setFontSizePx: (px) => {
    ipcRenderer.send('ui:set-font-size', px);
  },
  changeFontSize: (action) => {
    ipcRenderer.send('ui:font-size', action);
  },
  minimizeWindow: () => {
    ipcRenderer.send('ui:window-minimize');
  },
  notifyDirtyState: (state) => {
    ipcRenderer.send('dirty-changed', state);
  },
  requestAutoSave: () => {
    return ipcRenderer.invoke('ui:request-autosave');
  },
  onStatusUpdate: (callback) => {
    ipcRenderer.on('status-update', (event, status) => callback(status));
  },
  onSetDirty: (callback) => {
    ipcRenderer.on('set-dirty', (event, state) => callback(state));
  }
});
