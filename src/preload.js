const { contextBridge } = require('electron');

// Экспорт безопасного API для renderer процесса
contextBridge.exposeInMainWorld('electronAPI', {
  // TODO: добавить методы для работы с файлами и IPC
});
