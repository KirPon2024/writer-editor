const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const fileManager = require('./utils/fileManager');
const backupManager = require('./utils/backupManager');

let mainWindow;
let currentFilePath = null; // Путь к текущему открытому файлу
let isDirty = false;
let isQuitting = false;
let isWindowClosing = false;
let lastAutosaveHash = null;
const backupHashes = new Map();
const isDevMode = process.argv.includes('--dev');
let diskQueue = Promise.resolve();
const pendingTextRequests = new Map();
let currentFontSize = 16;

// Путь к файлу настроек
function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function logDevError(context, error) {
  if (isDevMode && error) {
    console.error(`[WriterEditor][${context}]`, error);
  }
}

function queueDiskOperation(operation, context = 'disk') {
  const run = () =>
    operation().catch((error) => {
      logDevError(context, error);
      throw error;
    });

  const queued = diskQueue.then(run, run);
  diskQueue = queued.catch(() => {});
  return queued;
}

function clampFontSize(size) {
  return Math.max(12, Math.min(28, size));
}

function sendEditorText(text) {
  if (mainWindow) {
    mainWindow.webContents.send('editor:set-text', typeof text === 'string' ? text : '');
  }
}

function sendEditorFontSize(px) {
  if (mainWindow) {
    mainWindow.webContents.send('editor:set-font-size', { px });
  }
}

function requestEditorText(timeoutMs = 2500) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return Promise.reject(new Error('No active window'));
  }

  return new Promise((resolve, reject) => {
    const requestId = crypto.randomBytes(8).toString('hex');
    const timeoutId = setTimeout(() => {
      pendingTextRequests.delete(requestId);
      reject(new Error('Timed out waiting for editor text'));
    }, timeoutMs);

    pendingTextRequests.set(requestId, { resolve, reject, timeoutId });
    mainWindow.webContents.send('editor:text-request', { requestId });
  });
}

function clearPendingTextRequests(reason) {
  for (const [requestId, pending] of pendingTextRequests.entries()) {
    clearTimeout(pending.timeoutId);
    pending.reject(new Error(reason));
  }
  pendingTextRequests.clear();
}

// Загрузка настроек
async function loadSettings() {
  try {
    const data = await fs.readFile(getSettingsPath(), 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

// Сохранение настроек
async function saveSettings(settings) {
  try {
    await queueDiskOperation(
      () => fileManager.writeFileAtomic(getSettingsPath(), JSON.stringify(settings)),
      'save settings'
    );
  } catch {
    // Тихая обработка ошибок
  }
}

// Сохранение последнего открытого файла
async function saveLastFile() {
  try {
    const settings = await loadSettings();
    settings.lastFilePath = currentFilePath;
    await saveSettings(settings);
  } catch (error) {
    // Тихая обработка ошибок
  }
}

// Загрузка последнего открытого файла
async function loadLastFile() {
  try {
    const settings = await loadSettings();
    return settings.lastFilePath || null;
  } catch (error) {
    return null;
  }
}

function computeHash(text) {
  return crypto.createHash('sha256').update(text || '', 'utf8').digest('hex');
}

// Проверка существования файла
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Автоматическое открытие последнего файла
async function openLastFile() {
  if (!mainWindow) return 'noFile';
  
  const lastFilePath = await loadLastFile();
  if (!lastFilePath) return 'noFile';
  
  const exists = await fileExists(lastFilePath);
  if (!exists) return 'noFile';
  
  const fileResult = await fileManager.readFile(lastFilePath);
    if (fileResult.success) {
      currentFilePath = lastFilePath;
      await saveLastFile();
      sendEditorText(fileResult.content);
      setDirtyState(false);
      const contentHash = computeHash(fileResult.content);
      lastAutosaveHash = contentHash;
      backupHashes.set(lastFilePath, contentHash);
      updateStatus('Готово');
      return 'loaded';
    }

  updateStatus('Ошибка');
  return 'error';
}

// Применение сохранённого размера шрифта
async function loadSavedFontSize() {
  if (!mainWindow) return;
  
  try {
    const settings = await loadSettings();
    if (Number.isFinite(settings.fontSize)) {
      currentFontSize = clampFontSize(settings.fontSize);
    }
  } catch (error) {
    // Тихая обработка ошибок
  }

  sendEditorFontSize(currentFontSize);
}

async function restoreAutosaveIfExists() {
  if (!mainWindow) return false;
  await ensureAutosaveDirectory();

  const autosavePath = getAutosavePath();
  try {
    const content = await fs.readFile(autosavePath, 'utf-8');
    if (!content) {
      return false;
    }

    sendEditorText(content);

    setDirtyState(true); // восстановленный черновик считается несохранённым
    const autosaveHash = computeHash(content);
    lastAutosaveHash = autosaveHash;
    backupHashes.set(autosavePath, autosaveHash);
    updateStatus('Восстановлено из автосохранения');
    return true;
  } catch (error) {
    logDevError('restoreAutosaveIfExists', error);
    return false;
  }
}

// Сохранение и восстановление размеров окна
const windowState = {
  width: 1200,
  height: 800,
  x: undefined,
  y: undefined
};

async function loadWindowStateFromSettings() {
  try {
    const settings = await loadSettings();
    if (Number.isFinite(settings.windowWidth) && settings.windowWidth > 0) {
      windowState.width = settings.windowWidth;
    }
    if (Number.isFinite(settings.windowHeight) && settings.windowHeight > 0) {
      windowState.height = settings.windowHeight;
    }
    if (Number.isFinite(settings.windowX)) {
      windowState.x = settings.windowX;
    }
    if (Number.isFinite(settings.windowY)) {
      windowState.y = settings.windowY;
    }
  } catch {
    // Игнорируем ошибки
  }
}

async function persistWindowState(bounds) {
  try {
    const settings = await loadSettings();
    settings.windowWidth = bounds.width;
    settings.windowHeight = bounds.height;
    settings.windowX = bounds.x;
    settings.windowY = bounds.y;
    await saveSettings(settings);
  } catch {
    // Тихо игнорируем
  }
}

function getAutosaveDir() {
  const documentsPath = fileManager.getDocumentsPath();
  return path.join(documentsPath, '.autosave');
}

function getAutosavePath() {
  return path.join(getAutosaveDir(), 'autosave.txt');
}

async function ensureAutosaveDirectory() {
  const dir = getAutosaveDir();
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // Папка может уже существовать
  }
  return dir;
}

async function deleteAutosaveFile() {
  const autosavePath = getAutosavePath();
  try {
    await fs.unlink(autosavePath);
  } catch {
    // Игнорируем, если файла нет
  }
}

async function writeAutosaveFile(content) {
  const autosavePath = getAutosavePath();
  await ensureAutosaveDirectory();
  return fileManager.writeFileAtomic(autosavePath, content);
}

function updateStatus(status) {
  if (mainWindow) {
    mainWindow.webContents.send('status-update', status);
  }
}

function setDirtyState(state) {
  isDirty = state;
  if (mainWindow) {
    mainWindow.webContents.send('set-dirty', state);
  }
}

ipcMain.on('editor:text-response', (_, payload) => {
  const requestId = payload && payload.requestId;
  if (!requestId) {
    return;
  }

  const pending = pendingTextRequests.get(requestId);
  if (!pending) {
    return;
  }

  clearTimeout(pending.timeoutId);
  pendingTextRequests.delete(requestId);
  pending.resolve(typeof payload.text === 'string' ? payload.text : '');
});

ipcMain.on('dirty-changed', (_, state) => {
  isDirty = state;
});

function createWindow() {
  // Восстановление размеров и позиции окна
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: windowState.width || 1200,
    height: windowState.height || 800,
    x: windowState.x,
    y: windowState.y,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile('src/renderer/index.html');

  // Открыть последний файл и применить настройки после загрузки
  mainWindow.webContents.once('did-finish-load', async () => {
    await loadSavedFontSize();
    const restored = await restoreAutosaveIfExists();
    if (!restored) {
      const openResult = await openLastFile();
      if (openResult !== 'loaded' && openResult !== 'error') {
        updateStatus('Готово');
      }
    }
  });

  // Сохранение размеров и позиции окна + запрос при несохранённых изменениях
  mainWindow.on('close', (event) => {
    if (isWindowClosing || isQuitting) {
      return;
    }

    event.preventDefault();

    (async () => {
      const canClose = await confirmDiscardChanges();
      if (!canClose) {
        return;
      }

      if (mainWindow) {
        const bounds = mainWindow.getBounds();
        await persistWindowState(bounds);
      }

      isWindowClosing = true;
      mainWindow.close();
    })().catch(() => {});
  });

  mainWindow.on('closed', () => {
    clearPendingTextRequests('Window closed');
    mainWindow = null;
    isWindowClosing = false;
  });

  mainWindow.on('resize', () => {
    if (mainWindow) {
      persistWindowState(mainWindow.getBounds()).catch(() => {});
    }
  });

  mainWindow.on('move', () => {
    if (mainWindow) {
      persistWindowState(mainWindow.getBounds()).catch(() => {});
    }
  });

  // Открыть DevTools только в режиме разработки (опционально)
  // mainWindow.webContents.openDevTools();
}

async function handleNew() {
  if (!mainWindow) return;
  currentFilePath = null;
  await saveLastFile();
  sendEditorText('');
  setDirtyState(false);
  lastAutosaveHash = null;
  updateStatus('Готово');
}

async function handleOpen() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Открыть файл',
    defaultPath: fileManager.getDocumentsPath(),
    filters: [
      { name: 'Текстовые файлы', extensions: ['txt'] },
      { name: 'Все файлы', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const fileResult = await fileManager.readFile(filePath);
    
    if (fileResult.success) {
      currentFilePath = filePath;
      await saveLastFile();
      sendEditorText(fileResult.content);
      setDirtyState(false);
      const contentHash = computeHash(fileResult.content);
      lastAutosaveHash = contentHash;
      backupHashes.set(filePath, contentHash);
      updateStatus('Готово');
    } else {
      updateStatus('Ошибка');
    }
  }
}

// Автосохранение каждые 15 секунд
async function autoSave() {
  if (!mainWindow || !isDirty) {
    return;
  }

  try {
    const content = await requestEditorText();
    const currentHash = computeHash(content);

    if (currentHash === lastAutosaveHash) {
      return;
    }

    if (currentFilePath) {
      const saveResult = await queueDiskOperation(
        () => fileManager.writeFileAtomic(currentFilePath, content),
        'autosave file'
      );
      if (!saveResult.success) {
        updateStatus('Ошибка');
        return;
      }

      lastAutosaveHash = currentHash;
      setDirtyState(false);
      updateStatus('Автосохранено');
      await saveLastFile();
      return;
    }

    const autosaveResult = await queueDiskOperation(
      () => writeAutosaveFile(content),
      'autosave temporary'
    );
    if (!autosaveResult.success) {
      updateStatus('Ошибка');
      return;
    }

    lastAutosaveHash = currentHash;
    updateStatus('Автосохранено');
  } catch (error) {
    updateStatus('Ошибка');
    logDevError('autoSave', error);
  }
}

// Создание бэкапа раз в минуту
async function createBackup() {
  if (!mainWindow) {
    return;
  }

  try {
    if (currentFilePath) {
      const content = await requestEditorText();
      const hash = computeHash(content);
      if (backupHashes.get(currentFilePath) === hash) {
        return;
      }

      const result = await queueDiskOperation(
        () => backupManager.createBackup(currentFilePath, content),
        'backup current file'
      );
      if (!result.success) {
        updateStatus('Ошибка');
        return;
      }

      backupHashes.set(currentFilePath, hash);
      return;
    }

    const autosavePath = getAutosavePath();
    const autosaveExists = await fileExists(autosavePath);
    if (!autosaveExists) {
      return;
    }

    const autosaveResult = await fileManager.readFile(autosavePath);
    if (!autosaveResult.success) {
      updateStatus('Ошибка');
      return;
    }

    const autosaveHash = computeHash(autosaveResult.content);
    if (backupHashes.get(autosavePath) === autosaveHash) {
      return;
    }

    const backupResult = await queueDiskOperation(
      () => backupManager.createBackup(autosavePath, autosaveResult.content),
      'backup autosave'
    );
    if (!backupResult.success) {
      updateStatus('Ошибка');
      return;
    }

    backupHashes.set(autosavePath, autosaveHash);
  } catch (error) {
    updateStatus('Ошибка');
    logDevError('createBackup', error);
  }
}

async function handleSave() {
  if (!mainWindow) {
    return false;
  }

  let content;
  try {
    content = await requestEditorText();
  } catch (error) {
    updateStatus('Ошибка');
    logDevError('handleSave', error);
    return false;
  }
  const wasUntitled = currentFilePath === null;

  if (currentFilePath) {
    const saveResult = await queueDiskOperation(
      () => fileManager.writeFileAtomic(currentFilePath, content),
      'save existing file'
    );
    if (saveResult.success) {
      lastAutosaveHash = computeHash(content);
      setDirtyState(false);
      updateStatus('Сохранено');
      await saveLastFile();
      return true;
    }
    updateStatus('Ошибка');
    return false;
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Сохранить файл',
    defaultPath: fileManager.getDocumentsPath(),
    filters: [
      { name: 'Текстовые файлы', extensions: ['txt'] },
      { name: 'Все файлы', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePath) {
    let filePath = result.filePath;
    if (!filePath.endsWith('.txt')) {
      filePath += '.txt';
    }

    const saveResult = await queueDiskOperation(
      () => fileManager.writeFileAtomic(filePath, content),
      'save new file'
    );
    if (saveResult.success) {
      lastAutosaveHash = computeHash(content);
      currentFilePath = filePath;
      await saveLastFile();
      setDirtyState(false);
      updateStatus('Сохранено');
      if (wasUntitled) {
        await deleteAutosaveFile();
        backupHashes.delete(getAutosavePath());
      }
      return true;
    }
    updateStatus('Ошибка');
  }

  return false;
}

async function confirmDiscardChanges() {
  if (!isDirty || !mainWindow) {
    return true;
  }

  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    message: 'Есть несохранённые изменения.',
    detail: 'Сохранить перед продолжением?',
    buttons: ['Сохранить', 'Не сохранять', 'Отмена'],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  });

  if (result.response === 0) {
    const saved = await handleSave();
    return saved;
  }

  if (result.response === 1) {
    if (currentFilePath === null) {
      await deleteAutosaveFile();
    }
    setDirtyState(false);
    return true;
  }

  return false;
}

async function ensureCleanAction(actionFn) {
  const canProceed = await confirmDiscardChanges();
  if (!canProceed) {
    return;
  }

  await actionFn();
}

function handleFontChange(fontFamily) {
  if (mainWindow) {
    mainWindow.webContents.send('font-changed', fontFamily);
  }
}

function handleThemeChange(theme) {
  if (mainWindow) {
    mainWindow.webContents.send('theme-changed', theme);
  }
}

// Обработка изменения размера шрифта
async function handleFontSizeChange(action) {
  if (!mainWindow) return;
  
  try {
    let newSize = currentFontSize;
    const minSize = 12;
    const maxSize = 28;
    
    if (action === 'increase') {
      newSize = Math.min(currentFontSize + 1, maxSize);
    } else if (action === 'decrease') {
      newSize = Math.max(currentFontSize - 1, minSize);
    } else if (action === 'reset') {
      newSize = 16;
    }
    
    if (newSize !== currentFontSize) {
      currentFontSize = clampFontSize(newSize);
      sendEditorFontSize(currentFontSize);

      const settings = await loadSettings();
      settings.fontSize = currentFontSize;
      await saveSettings(settings);
    }
  } catch (error) {
    logDevError('handleFontSizeChange', error);
  }
}

function createMenu() {
  const fonts = [
    { label: 'Menlo', value: 'Menlo, monospace' },
    { label: 'SF Mono', value: 'SF Mono, monospace' },
    { label: 'Monaco', value: 'Monaco, monospace' },
    { label: 'Courier New', value: 'Courier New, monospace' }
  ];

  const fontMenu = fonts.map(font => ({
    label: font.label,
    click: () => handleFontChange(font.value)
  }));

  const template = [
    {
      label: 'Файл',
      submenu: [
        {
          label: 'Новый',
          accelerator: 'CmdOrCtrl+N',
          click: async () => {
            await ensureCleanAction(handleNew);
          }
        },
        {
          label: 'Открыть',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            await ensureCleanAction(handleOpen);
          }
        },
        {
          label: 'Сохранить',
          accelerator: 'CmdOrCtrl+S',
          click: async () => {
            await handleSave();
          }
        },
        { type: 'separator' },
        {
          label: 'Выход',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Вид',
      submenu: [
        {
          label: 'Шрифт',
          submenu: fontMenu
        },
        { type: 'separator' },
        {
          label: 'Размер шрифта',
          submenu: [
            {
              label: 'Увеличить',
              click: () => handleFontSizeChange('increase')
            },
            {
              label: 'Уменьшить',
              click: () => handleFontSizeChange('decrease')
            },
            {
              label: 'Сбросить',
              click: () => handleFontSizeChange('reset')
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Светлая тема',
          click: () => handleThemeChange('light')
        },
        {
          label: 'Тёмная тема',
          click: () => handleThemeChange('dark')
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Создание папки Documents/WriterEditor и autosave при запуске
async function initializeApp() {
  await fileManager.ensureDocumentsFolder();
  await ensureAutosaveDirectory();
}

app.whenReady().then(async () => {
  await initializeApp();
  await loadWindowStateFromSettings();
  createWindow();
  createMenu();

  // Запуск автосохранения каждые 15 секунд
  setInterval(() => {
    autoSave();
  }, 15000);

  // Запуск создания бэкапов каждую минуту
  setInterval(() => {
    createBackup();
  }, 60000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', (event) => {
  if (isQuitting) {
    return;
  }

  event.preventDefault();

  (async () => {
    const canQuit = await confirmDiscardChanges();
    if (!canQuit) {
      return;
    }

    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      await persistWindowState(bounds);
    }

    isQuitting = true;
    app.quit();
  })().catch(() => {});
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
