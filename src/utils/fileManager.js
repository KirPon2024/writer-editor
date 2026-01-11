const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

// Путь к папке Documents/WriterEditor
function getDocumentsPath() {
  const documentsPath = app.getPath('documents');
  return path.join(documentsPath, 'WriterEditor');
}

// Создание папки Documents/WriterEditor (если не существует)
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

// Запись файла
async function writeFile(filePath, content) {
  try {
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = {
  getDocumentsPath,
  ensureDocumentsFolder,
  readFile,
  writeFile
};
