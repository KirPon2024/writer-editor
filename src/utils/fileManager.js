const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

const DOCUMENTS_FOLDER_NAME = 'craftsman';
const LEGACY_DOCUMENTS_FOLDER_NAME = 'WriterEditor';

// Путь к папке Documents/craftsman (fallback на WriterEditor, если уже существует)
function getDocumentsPath() {
  const documentsPath = app.getPath('documents');
  const preferredPath = path.join(documentsPath, DOCUMENTS_FOLDER_NAME);
  const legacyPath = path.join(documentsPath, LEGACY_DOCUMENTS_FOLDER_NAME);

  if (fsSync.existsSync(preferredPath)) {
    return preferredPath;
  }

  if (fsSync.existsSync(legacyPath)) {
    return legacyPath;
  }

  return preferredPath;
}

// Создание папки Documents/craftsman или работа с существующей WriterEditor
async function ensureDocumentsFolder() {
  const folderPath = getDocumentsPath();
  try {
    await fs.access(folderPath);
  } catch (error) {
    // Папка не существует, создаём её
    await fs.mkdir(folderPath, { recursive: true });
  }
  return folderPath;
}

// Чтение файла
async function readFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function writeFileAtomic(filePath, content) {
  const directory = path.dirname(filePath);
  const baseName = path.basename(filePath);
  const randomSuffix = crypto.randomBytes(5).toString('hex');
  const tempPath = path.join(directory, `${baseName}.${randomSuffix}.tmp`);
  const oldPath = path.join(directory, `${baseName}.${randomSuffix}.old`);

  try {
    const stat = await fs.lstat(filePath);
    if (stat.isDirectory()) {
      return { success: false, error: 'Target path is a directory' };
    }
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      return { success: false, error: error.message };
    }
  }

  try {
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(tempPath, content, 'utf-8');
  } catch (error) {
    try {
      await fs.unlink(tempPath);
    } catch {}
    return { success: false, error: error.message };
  }

  try {
    await fs.rename(tempPath, filePath);
    return { success: true };
  } catch (renameError) {
    // Иногда rename падает (особенно на Windows) — пробуем безопасно заменить через перенос старого файла.
    let oldMoved = false;
    try {
      await fs.rename(filePath, oldPath);
      oldMoved = true;
    } catch (moveOldError) {
      if (moveOldError && moveOldError.code !== 'ENOENT') {
        try {
          await fs.unlink(tempPath);
        } catch {}
        return { success: false, error: moveOldError.message || renameError.message };
      }
    }

    try {
      await fs.rename(tempPath, filePath);
      if (oldMoved) {
        try {
          await fs.unlink(oldPath);
        } catch {}
      }
      return { success: true };
    } catch (secondError) {
      let restored = false;
      try {
        if (oldMoved) {
          await fs.rename(oldPath, filePath);
          restored = true;
        }
      } catch {}
      if (restored) {
        try {
          await fs.unlink(tempPath);
        } catch {}
      }
      // Если восстановить не удалось — лучше оставить temp/old на диске, чем потерять данные.
      return { success: false, error: secondError.message || renameError.message };
    }
  }
}

// Запись файла через атомарную операцию для совместимости
async function writeFile(filePath, content) {
  return writeFileAtomic(filePath, content);
}

module.exports = {
  getDocumentsPath,
  ensureDocumentsFolder,
  readFile,
  writeFile,
  writeFileAtomic
};
