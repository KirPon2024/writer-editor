const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const { hasDirectoryContent, copyDirectoryContents } = require('./fsHelpers');

const DOCUMENTS_FOLDER_NAME = 'craftsman';
const LEGACY_DOCUMENTS_FOLDER_NAME = 'WriterEditor';
const MIGRATION_MARKER = '.migrated-from-writer-editor';
const isDevMode = process.argv.includes('--dev');

function logMigration(message) {
  if (isDevMode) {
    console.debug(`[craftsman:migration] ${message}`);
  }
}

// Путь к папке Documents/craftsman (fallback на WriterEditor, если уже существует)
function getDocumentsPath() {
  const documentsPath = app.getPath('documents');
  const preferredPath = path.join(documentsPath, DOCUMENTS_FOLDER_NAME);
  const legacyPath = path.join(documentsPath, LEGACY_DOCUMENTS_FOLDER_NAME);

  if (hasDirectoryContent(preferredPath)) {
    return preferredPath;
  }

  if (hasDirectoryContent(legacyPath)) {
    return legacyPath;
  }

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
    await fs.mkdir(folderPath, { recursive: true });
  }
  return folderPath;
}

async function migrateDocumentsFolder() {
  const documentsPath = app.getPath('documents');
  const targetPath = path.join(documentsPath, DOCUMENTS_FOLDER_NAME);
  const legacyPath = path.join(documentsPath, LEGACY_DOCUMENTS_FOLDER_NAME);
  const markerPath = path.join(targetPath, MIGRATION_MARKER);

  if (fsSync.existsSync(markerPath)) {
    logMigration('documents migration marker present, skipping');
    return targetPath;
  }

  if (hasDirectoryContent(targetPath)) {
    logMigration('craftsman documents already populated, skipping migration');
    return targetPath;
  }

  if (!hasDirectoryContent(legacyPath)) {
    logMigration('legacy documents folder is empty or missing');
    return targetPath;
  }

  try {
    logMigration(`copying documents from ${legacyPath} → ${targetPath}`);
    await copyDirectoryContents(legacyPath, targetPath);
    await fs.writeFile(markerPath, 'migrated from WriterEditor', 'utf8');
    logMigration('documents migration complete');
  } catch (error) {
    logMigration(`documents migration failed: ${error.message}`);
  }

  return targetPath;
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
  migrateDocumentsFolder,
  readFile,
  writeFile,
  writeFileAtomic
};
