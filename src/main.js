const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fileManager = require('./utils/fileManager');
const backupManager = require('./utils/backupManager');

let mainWindow;
let currentFilePath = null; // Путь к текущему открытому файлу

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
  if (!mainWindow) return;
  
  const lastFilePath = await loadLastFile();
  if (!lastFilePath) return;
  
  const exists = await fileExists(lastFilePath);
  if (!exists) return;
  
  const fileResult = await fileManager.readFile(lastFilePath);
  if (fileResult.success) {
    currentFilePath = lastFilePath;
    const contentJson = JSON.stringify(fileResult.content);
    await mainWindow.webContents.executeJavaScript(`
      document.getElementById('editor').value = ${contentJson};
    `);
  }
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

// Сохранение и восстановление размеров окна
const windowState = {
  width: 1200,
  height: 800,
  x: undefined,
  y: undefined
};

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
    await openLastFile();
  });

  // Сохранение размеров и позиции окна
  mainWindow.on('close', () => {
    const bounds = mainWindow.getBounds();
    windowState.width = bounds.width;
    windowState.height = bounds.height;
    windowState.x = bounds.x;
    windowState.y = bounds.y;
  });

  // Открыть DevTools только в режиме разработки (опционально)
  // mainWindow.webContents.openDevTools();
}

async function handleNew() {
  currentFilePath = null;
  await saveLastFile();
  await mainWindow.webContents.executeJavaScript(`
    document.getElementById('editor').value = '';
  `);
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
    }
  }
}

// Автосохранение каждые 15 секунд
async function autoSave() {
  if (!currentFilePath || !mainWindow) {
    return;
  }

  try {
    const content = await mainWindow.webContents.executeJavaScript(`
      document.getElementById('editor').value
    `);
    await fileManager.writeFile(currentFilePath, content);
  } catch (error) {
    // Тихая обработка ошибок
  }
}

// Создание бэкапа раз в минуту
async function createBackup() {
  if (!currentFilePath || !mainWindow) {
    return;
  }

  try {
    const content = await mainWindow.webContents.executeJavaScript(`
      document.getElementById('editor').value
    `);
    await backupManager.createBackup(currentFilePath, content);
  } catch (error) {
    // Тихая обработка ошибок
  }
}

async function handleSave() {
  const content = await mainWindow.webContents.executeJavaScript(`
    document.getElementById('editor').value
  `);

  if (currentFilePath) {
    // Сохранить в текущий файл
    await fileManager.writeFile(currentFilePath, content);
  } else {
    // Показать диалог сохранения
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
      // Добавить расширение .txt, если его нет
      if (!filePath.endsWith('.txt')) {
        filePath += '.txt';
      }
      
      const saveResult = await fileManager.writeFile(filePath, content);
      if (saveResult.success) {
        currentFilePath = filePath;
        await saveLastFile();
      }
    }
  }
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
            await handleNew();
          }
        },
        {
          label: 'Open',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            await handleOpen();
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

// Создание папки Documents/WriterEditor при запуске
async function initializeApp() {
  await fileManager.ensureDocumentsFolder();
}

app.whenReady().then(async () => {
  await initializeApp();
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
