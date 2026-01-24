const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const fileManager = require('./fileManager');

function getBackupsRoot(basePath) {
  if (basePath) {
    return path.join(basePath, 'backups');
  }
  const documentsPath = fileManager.getDocumentsPath();
  return path.join(documentsPath, '.backups');
}

async function ensureBackupsFolder(fileId, basePath) {
  const root = getBackupsRoot(basePath);
  const backupsPath = path.join(root, fileId);
  await fs.mkdir(backupsPath, { recursive: true });
  return backupsPath;
}

async function createBackup(filePath, content, options = {}) {
  try {
    const basePath = options && options.basePath ? options.basePath : null;
    const fileId = crypto.createHash('sha256').update(path.resolve(filePath)).digest('hex');
    const backupsPath = await ensureBackupsFolder(fileId, basePath);
    await writeMetaFile(backupsPath, filePath);

    const fileName = path.basename(filePath);
    const timestamp = Date.now();
    const backupFileName = `${timestamp}_${fileName}`;
    const backupPath = path.join(backupsPath, backupFileName);
    const writeResult = await fileManager.writeFileAtomic(backupPath, content);
    if (!writeResult.success) {
      return writeResult;
    }

    await cleanupOldBackups(backupsPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function cleanupOldBackups(backupsPath) {
  try {
    const files = await fs.readdir(backupsPath);
    const backupFiles = files.filter((file) => file !== 'meta.json');

    if (backupFiles.length > 50) {
      backupFiles.sort();
      const toDelete = backupFiles.slice(0, backupFiles.length - 50);
      for (const file of toDelete) {
        await fs.unlink(path.join(backupsPath, file));
      }
    }
  } catch (error) {
    // Тихая обработка ошибок
  }
}

async function writeMetaFile(backupsPath, filePath) {
  try {
    const metaPath = path.join(backupsPath, 'meta.json');
    const meta = {
      originalPath: filePath,
      baseName: path.basename(filePath)
    };
    await fileManager.writeFileAtomic(metaPath, JSON.stringify(meta, null, 2));
  } catch {
    // Игнорируем сбои записи meta
  }
}

module.exports = {
  getBackupsRoot,
  ensureBackupsFolder,
  createBackup
};
