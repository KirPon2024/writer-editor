const fs = require('fs').promises;
const path = require('path');
const fileManager = require('./fileManager');

// Путь к папке бэкапов
function getBackupsPath() {
  const documentsPath = fileManager.getDocumentsPath();
  return path.join(documentsPath, '.backups');
}

// Создание папки бэкапов (если не существует)
async function ensureBackupsFolder() {
  const backupsPath = getBackupsPath();
  try {
    await fs.access(backupsPath);
  } catch (error) {
    await fs.mkdir(backupsPath, { recursive: true });
  }
  return backupsPath;
}

// Создание бэкапа файла
async function createBackup(filePath, content) {
  try {
    await ensureBackupsFolder();
    
    const fileName = path.basename(filePath);
    const timestamp = Date.now();
    const backupFileName = `${timestamp}_${fileName}`;
    const backupPath = path.join(getBackupsPath(), backupFileName);
    
    await fs.writeFile(backupPath, content, 'utf-8');
    
    // Очистка старых бэкапов (оставить только последние 50)
    await cleanupOldBackups(fileName);
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Очистка старых бэкапов (оставить только последние 50)
async function cleanupOldBackups(fileName) {
  try {
    const backupsPath = getBackupsPath();
    const files = await fs.readdir(backupsPath);
    
    // Фильтруем только файлы, которые соответствуют текущему файлу
    const fileBackups = files.filter(file => file.endsWith(`_${fileName}`));
    
    if (fileBackups.length > 50) {
      // Сортируем по имени (timestamp в начале)
      fileBackups.sort();
      
      // Удаляем старые (оставляем последние 50)
      const toDelete = fileBackups.slice(0, fileBackups.length - 50);
      
      for (const file of toDelete) {
        await fs.unlink(path.join(backupsPath, file));
      }
    }
  } catch (error) {
    // Тихая обработка ошибок
  }
}

module.exports = {
  getBackupsPath,
  ensureBackupsFolder,
  createBackup
};
