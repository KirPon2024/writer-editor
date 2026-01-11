const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('path');
const fileManager = require('./utils/fileManager');
const backupManager = require('./utils/backupManager');

let mainWindow;
let currentFilePath = null; // Путь к текущему открытому файлу

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
      }
    }
  }
}

function createMenu() {
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
