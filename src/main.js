const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fileManager = require('./utils/fileManager');
const backupManager = require('./utils/backupManager');

let mainWindow;
let currentFilePath = null; // Путь к текущему открытому файлу
let isDirty = false;
let isQuitting = false;
let isWindowClosing = false;

// Путь к файлу настроек
function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
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
    await fs.writeFile(getSettingsPath(), JSON.stringify(settings), 'utf-8');
  } catch (error) {
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
    const contentJson = JSON.stringify(fileResult.content);
    await mainWindow.webContents.executeJavaScript(`
      document.getElementById('editor').value = ${contentJson};
    `);
    setDirtyState(false);
    updateStatus('Ready');
    return 'loaded';
  }

  updateStatus('Error');
  return 'error';
}

// Применение сохранённого размера шрифта
async function loadSavedFontSize() {
  if (!mainWindow) return;
  
  try {
    const settings = await loadSettings();
    if (settings.fontSize) {
      const size = Math.max(12, Math.min(28, settings.fontSize));
      await mainWindow.webContents.executeJavaScript(`
        document.getElementById('editor').style.fontSize = '${size}px';
      `);
    }
  } catch (error) {
    // Тихая обработка ошибок
  }
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

    const contentJson = JSON.stringify(content);
    await mainWindow.webContents.executeJavaScript(`
      document.getElementById('editor').value = ${contentJson};
    `);

    setDirtyState(false);
    updateStatus('Restored autosave');
    return true;
  } catch {
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
  const tempPath = `${autosavePath}.tmp`;

  await ensureAutosaveDirectory();
  await fs.writeFile(tempPath, content, 'utf-8');
  await fs.rename(tempPath, autosavePath);
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
        updateStatus('Ready');
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
  await mainWindow.webContents.executeJavaScript(`
    document.getElementById('editor').value = '';
  `);
  setDirtyState(false);
  updateStatus('Ready');
}

async function handleOpen() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open File',
    defaultPath: fileManager.getDocumentsPath(),
    filters: [
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const fileResult = await fileManager.readFile(filePath);
    
    if (fileResult.success) {
      currentFilePath = filePath;
      await saveLastFile();
      const contentJson = JSON.stringify(fileResult.content);
      await mainWindow.webContents.executeJavaScript(`
        document.getElementById('editor').value = ${contentJson};
      `);
      setDirtyState(false);
      updateStatus('Ready');
    } else {
      updateStatus('Error');
    }
  }
}

// Автосохранение каждые 15 секунд
async function autoSave() {
  if (!mainWindow) {
    return;
  }

  try {
    const content = await mainWindow.webContents.executeJavaScript(`
      document.getElementById('editor').value
    `);

    if (currentFilePath) {
      const saveResult = await fileManager.writeFile(currentFilePath, content);
      if (!saveResult.success) {
        updateStatus('Error');
        return;
      }
    } else {
      await writeAutosaveFile(content);
    }

    updateStatus('Autosaved');
  } catch (error) {
    updateStatus('Error');
  }
}

// Создание бэкапа раз в минуту
async function createBackup() {
  if (!mainWindow) {
    return;
  }

  try {
    if (currentFilePath) {
      const content = await mainWindow.webContents.executeJavaScript(`
        document.getElementById('editor').value
      `);
      const result = await backupManager.createBackup(currentFilePath, content);
      if (!result.success) {
        updateStatus('Error');
      }
      return;
    }

    const autosavePath = getAutosavePath();
    const autosaveExists = await fileExists(autosavePath);
    if (!autosaveExists) {
      return;
    }

    const autosaveResult = await fileManager.readFile(autosavePath);
    if (!autosaveResult.success) {
      updateStatus('Error');
      return;
    }

    const backupResult = await backupManager.createBackup(autosavePath, autosaveResult.content);
    if (!backupResult.success) {
      updateStatus('Error');
    }
  } catch (error) {
    updateStatus('Error');
  }
}

async function handleSave() {
  if (!mainWindow) {
    return false;
  }

  const content = await mainWindow.webContents.executeJavaScript(`
    document.getElementById('editor').value
  `);

  if (currentFilePath) {
    const saveResult = await fileManager.writeFile(currentFilePath, content);
    if (saveResult.success) {
      setDirtyState(false);
      updateStatus('Saved');
      await saveLastFile();
      return true;
    }
    updateStatus('Error');
    return false;
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save File',
    defaultPath: fileManager.getDocumentsPath(),
    filters: [
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePath) {
    let filePath = result.filePath;
    if (!filePath.endsWith('.txt')) {
      filePath += '.txt';
    }

    const saveResult = await fileManager.writeFile(filePath, content);
    if (saveResult.success) {
      currentFilePath = filePath;
      await saveLastFile();
      setDirtyState(false);
      updateStatus('Saved');
      return true;
    }
    updateStatus('Error');
  }

  return false;
}

async function confirmDiscardChanges() {
  if (!isDirty || !mainWindow) {
    return true;
  }

  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    message: 'You have unsaved changes.',
    detail: 'Save before continuing?',
    buttons: ['Save', "Don't Save", 'Cancel'],
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
    // Читаем текущий размер (из инлайн стиля или computed style)
    const currentSize = await mainWindow.webContents.executeJavaScript(`
      (() => {
        const editor = document.getElementById('editor');
        const inlineSize = editor.style.fontSize;
        if (inlineSize) {
          return parseInt(inlineSize) || 16;
        }
        const computed = window.getComputedStyle(editor);
        return parseInt(computed.fontSize) || 16;
      })()
    `);
    
    let newSize = currentSize;
    const minSize = 12;
    const maxSize = 28;
    
    if (action === 'increase') {
      newSize = Math.min(currentSize + 1, maxSize);
    } else if (action === 'decrease') {
      newSize = Math.max(currentSize - 1, minSize);
    } else if (action === 'reset') {
      newSize = 16;
    }
    
    if (newSize !== currentSize) {
      await mainWindow.webContents.executeJavaScript(`
        document.getElementById('editor').style.fontSize = '${newSize}px';
      `);
      
      // Сохранение размера в настройках
      const settings = await loadSettings();
      settings.fontSize = newSize;
      await saveSettings(settings);
    }
  } catch (error) {
    // Тихая обработка ошибок
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
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: async () => {
            await ensureCleanAction(handleNew);
          }
        },
        {
          label: 'Open',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            await ensureCleanAction(handleOpen);
          }
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: async () => {
            await handleSave();
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Font',
          submenu: fontMenu
        },
        { type: 'separator' },
        {
          label: 'Font Size',
          submenu: [
            {
              label: 'Increase',
              click: () => handleFontSizeChange('increase')
            },
            {
              label: 'Decrease',
              click: () => handleFontSizeChange('decrease')
            },
            {
              label: 'Reset',
              click: () => handleFontSizeChange('reset')
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Light Theme',
          click: () => handleThemeChange('light')
        },
        {
          label: 'Dark Theme',
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
