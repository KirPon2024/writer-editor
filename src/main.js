const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const { performance } = require('perf_hooks');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const crypto = require('crypto');
const fileManager = require('./utils/fileManager');
const backupManager = require('./utils/backupManager');
const { hasDirectoryContent, copyDirectoryContents } = require('./utils/fsHelpers');

const launchT0 = performance.now();
let mainWindow;
let currentFilePath = null; // Путь к текущему открытому файлу
let isDirty = false;
let autoSaveInProgress = false;
let isQuitting = false;
let isWindowClosing = false;
let lastAutosaveHash = null;
const backupHashes = new Map();
const isDevMode = process.argv.includes('--dev');
function logPerfStage(label) {
  if (!isDevMode) return;
  const elapsed = Math.round(performance.now() - launchT0);
  console.info(`[perf] ${label}: ${elapsed}ms`);
}
let diskQueue = Promise.resolve();
const pendingTextRequests = new Map();
let currentFontSize = 16;
const USER_DATA_FOLDER_NAME = 'craftsman';
const LEGACY_USER_DATA_FOLDER_NAME = 'WriterEditor';
const MIGRATION_MARKER = '.migrated-from-writer-editor';
const DEFAULT_PROJECT_NAME = 'Роман';
const PROJECT_SUBFOLDERS = {
  roman: 'roman',
  mindmap: 'mindmap',
  print: 'print',
  materials: 'materials',
  reference: 'reference',
  trash: 'trash',
  backups: 'backups'
};
const MATERIALS_SECTION_LABELS = ['Заметки', 'Исследования', 'Идеи/черновики', 'Вырезки'];
const REFERENCE_SECTION_LABELS = ['Персонажи', 'Локации', 'Термины/глоссарий', 'События/таймлайн'];
const ROMAN_SECTION_LABELS = [
  'обложка',
  'черновик',
  'карта идей',
  'чистовой текст',
  'поток сознания',
  'сны',
  'статистика'
];
const ROMAN_MIND_MAP_SECTION_LABELS = ['карта сюжета', 'карта идей'];
const PRINT_SECTION_LABELS = ['макет'];
const ROMAN_META_KINDS = new Set(['chapter-file', 'scene']);

function sanitizeFilename(name) {
  const safe = String(name || '')
    .trim()
    .replace(/[\\/<>:"|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '');

  return safe.slice(0, 80) || 'Untitled';
}

const ROMAN_SECTION_FILENAME_SET = new Set(
  ROMAN_SECTION_LABELS.map((label) => sanitizeFilename(label).toLowerCase())
);

function getProjectRootPath(projectName = DEFAULT_PROJECT_NAME) {
  const root = fileManager.getDocumentsPath();
  return path.join(root, sanitizeFilename(projectName));
}

function getProjectSectionPath(section, projectName = DEFAULT_PROJECT_NAME) {
  const root = getProjectRootPath(projectName);
  const folder = PROJECT_SUBFOLDERS[section];
  return folder ? path.join(root, folder) : root;
}

function buildSectionDefinitions(labels) {
  return labels.map((label) => ({
    label,
    dirName: sanitizeFilename(label)
  }));
}

const MATERIALS_SECTIONS = buildSectionDefinitions(MATERIALS_SECTION_LABELS);
const REFERENCE_SECTIONS = buildSectionDefinitions(REFERENCE_SECTION_LABELS);

function getSectionDocumentPath(sectionName, projectName = DEFAULT_PROJECT_NAME) {
  const root = fileManager.getDocumentsPath();
  const projectFolder = sanitizeFilename(projectName);
  const fileName = `${sanitizeFilename(sectionName)}.txt`;
  return path.join(root, projectFolder, fileName);
}

// Путь к файлу настроек
function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function logDevError(context, error) {
  if (isDevMode && error) {
    console.error(`[craftsman][${context}]`, error);
  }
}

function logMigration(message) {
  if (isDevMode) {
    console.debug(`[craftsman:migration] ${message}`);
  }
}

async function migrateUserData() {
  const appDataPath = app.getPath('appData');
  const targetPath = path.join(appDataPath, USER_DATA_FOLDER_NAME);
  const legacyPath = path.join(appDataPath, LEGACY_USER_DATA_FOLDER_NAME);
  const markerPath = path.join(targetPath, MIGRATION_MARKER);

  if (fsSync.existsSync(markerPath)) {
    logMigration('userData migration marker detected, using craftsman folder');
    await fs.mkdir(targetPath, { recursive: true }).catch(() => {});
    app.setPath('userData', targetPath);
    return targetPath;
  }

  if (hasDirectoryContent(targetPath)) {
    logMigration('craftsman userData already contains files');
    app.setPath('userData', targetPath);
    return targetPath;
  }

  if (!hasDirectoryContent(legacyPath)) {
    logMigration('no legacy userData found, creating craftsman folder');
    await fs.mkdir(targetPath, { recursive: true }).catch((error) => {
      logDevError('migrateUserData', error);
    });
    app.setPath('userData', targetPath);
    return targetPath;
  }

  try {
    logMigration(`copying userData from ${legacyPath} → ${targetPath}`);
    await copyDirectoryContents(legacyPath, targetPath);
    await fs.writeFile(markerPath, 'migrated from WriterEditor', 'utf8');
    logMigration('userData migration complete');
  } catch (error) {
    logDevError('migrateUserData', error);
  }

  app.setPath('userData', targetPath);
  return targetPath;
}

async function ensureUserDataFolder() {
  try {
    return await migrateUserData();
  } catch (error) {
    logDevError('ensureUserDataFolder', error);
    const fallbackPath = path.join(app.getPath('appData'), USER_DATA_FOLDER_NAME);
    await fs.mkdir(fallbackPath, { recursive: true }).catch(() => {});
    app.setPath('userData', fallbackPath);
    return fallbackPath;
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

function sendEditorText(payload) {
  if (!mainWindow) return;
  if (typeof payload === 'string') {
    mainWindow.webContents.send('editor:set-text', { content: payload });
    return;
  }
  if (payload && typeof payload === 'object') {
    const safePayload = {
      content: typeof payload.content === 'string' ? payload.content : '',
      title: typeof payload.title === 'string' ? payload.title : '',
      path: typeof payload.path === 'string' ? payload.path : '',
      kind: typeof payload.kind === 'string' ? payload.kind : '',
      metaEnabled: Boolean(payload.metaEnabled)
    };
    mainWindow.webContents.send('editor:set-text', safePayload);
    return;
  }
  mainWindow.webContents.send('editor:set-text', { content: '' });
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

function extractNumericPrefix(name) {
  const match = /^(\d+)_/.exec(name);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function stripNumericPrefix(name) {
  return name.replace(/^\d+_/, '');
}

function stripTxtExtension(name) {
  return name.replace(/\.txt$/i, '');
}

function getDisplayNameForEntry(entryName) {
  return stripNumericPrefix(stripTxtExtension(entryName));
}

function formatPrefixedName(baseName, index) {
  const safeBase = sanitizeFilename(baseName);
  const prefix = String(index).padStart(2, '0');
  return `${prefix}_${safeBase}`;
}

function isPathInside(parentPath, childPath) {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  return child === parent || child.startsWith(`${parent}${path.sep}`);
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

async function ensureProjectStructure(projectName = DEFAULT_PROJECT_NAME) {
  const projectRoot = getProjectRootPath(projectName);
  const romanPath = getProjectSectionPath('roman', projectName);
  const mindmapPath = getProjectSectionPath('mindmap', projectName);
  const printPath = getProjectSectionPath('print', projectName);
  const materialsPath = getProjectSectionPath('materials', projectName);
  const referencePath = getProjectSectionPath('reference', projectName);
  const trashPath = getProjectSectionPath('trash', projectName);
  const backupsPath = getProjectSectionPath('backups', projectName);

  await fs.mkdir(projectRoot, { recursive: true });
  await fs.mkdir(romanPath, { recursive: true });
  await fs.mkdir(mindmapPath, { recursive: true });
  await fs.mkdir(printPath, { recursive: true });
  await fs.mkdir(materialsPath, { recursive: true });
  await fs.mkdir(referencePath, { recursive: true });
  await fs.mkdir(trashPath, { recursive: true });
  await fs.mkdir(backupsPath, { recursive: true });

  for (const section of MATERIALS_SECTIONS) {
    await fs.mkdir(path.join(materialsPath, section.dirName), { recursive: true });
  }

  for (const section of REFERENCE_SECTIONS) {
    await fs.mkdir(path.join(referencePath, section.dirName), { recursive: true });
  }

  return projectRoot;
}

async function readDirectoryEntries(folderPath) {
  let entries = [];
  try {
    entries = await fs.readdir(folderPath, { withFileTypes: true });
  } catch (error) {
    logDevError('readDirectoryEntries', error);
    return [];
  }

  return entries
    .filter((entry) => entry.name && !entry.name.startsWith('.'))
    .map((entry) => ({
      name: entry.name,
      path: path.join(folderPath, entry.name),
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
      prefix: extractNumericPrefix(entry.name),
      baseName: getDisplayNameForEntry(entry.name)
    }))
    .sort((a, b) => {
      const prefixA = a.prefix ?? Number.MAX_SAFE_INTEGER;
      const prefixB = b.prefix ?? Number.MAX_SAFE_INTEGER;
      if (prefixA !== prefixB) {
        return prefixA - prefixB;
      }
      return a.baseName.localeCompare(b.baseName, 'ru');
    });
}

function buildNode({ name, label, kind, nodePath, children = [] }) {
  return {
    id: nodePath,
    name,
    label,
    kind,
    path: nodePath,
    children
  };
}

async function buildRomanTree(projectName = DEFAULT_PROJECT_NAME) {
  const romanPath = getProjectSectionPath('roman', projectName);
  const childNodes = ROMAN_SECTION_LABELS.map((label) =>
    buildNode({
      name: label,
      label,
      kind: 'roman-section',
      nodePath: path.join(romanPath, `${sanitizeFilename(label)}.txt`),
      children: []
    })
  );

  return buildNode({
    name: 'Роман',
    label: 'Роман',
    kind: 'roman-root',
    nodePath: romanPath,
    children: childNodes
  });
}

async function buildMindMapTree(projectName = DEFAULT_PROJECT_NAME) {
  const mindmapPath = getProjectSectionPath('mindmap', projectName);
  const childNodes = ROMAN_MIND_MAP_SECTION_LABELS.map((label) =>
    buildNode({
      name: label,
      label,
      kind: 'mindmap-section',
      nodePath: path.join(mindmapPath, `${sanitizeFilename(label)}.txt`),
      children: []
    })
  );

  return buildNode({
    name: 'Mind map',
    label: 'Mind map',
    kind: 'mindmap-root',
    nodePath: mindmapPath,
    children: childNodes
  });
}

async function buildPrintTree(projectName = DEFAULT_PROJECT_NAME) {
  const printPath = getProjectSectionPath('print', projectName);
  const childNodes = PRINT_SECTION_LABELS.map((label) =>
    buildNode({
      name: label,
      label,
      kind: 'print-section',
      nodePath: path.join(printPath, `${sanitizeFilename(label)}.txt`),
      children: []
    })
  );

  return buildNode({
    name: 'Печать',
    label: 'Печать',
    kind: 'print-root',
    nodePath: printPath,
    children: childNodes
  });
}

async function buildGenericTree(rootPath, kind) {
  const entries = await readDirectoryEntries(rootPath);
  const nodes = [];
  for (const entry of entries) {
    if (entry.isDirectory) {
      const children = await buildGenericTree(entry.path, kind);
      nodes.push(
        buildNode({
          name: entry.baseName,
          label: entry.baseName,
          kind: 'folder',
          nodePath: entry.path,
          children: children.children || []
        })
      );
      continue;
    }
    if (entry.isFile && entry.name.toLowerCase().endsWith('.txt')) {
      nodes.push(
        buildNode({
          name: entry.baseName,
          label: entry.baseName,
          kind: kind === 'materials' ? 'material' : 'reference',
          nodePath: entry.path,
          children: []
        })
      );
    }
  }

  return buildNode({
    name: rootPath,
    label: path.basename(rootPath),
    kind: 'folder',
    nodePath: rootPath,
    children: nodes
  });
}

async function buildMaterialsTree(projectName = DEFAULT_PROJECT_NAME) {
  const materialsPath = getProjectSectionPath('materials', projectName);
  const categoryNodes = [];
  for (const section of MATERIALS_SECTIONS) {
    const folderPath = path.join(materialsPath, section.dirName);
    const subtree = await buildGenericTree(folderPath, 'materials');
    categoryNodes.push(
      buildNode({
        name: section.label,
        label: section.label,
        kind: 'materials-category',
        nodePath: folderPath,
        children: subtree.children || []
      })
    );
  }

  return buildNode({
    name: 'Материалы',
    label: 'Материалы',
    kind: 'materials-root',
    nodePath: materialsPath,
    children: categoryNodes
  });
}

async function buildReferenceTree(projectName = DEFAULT_PROJECT_NAME) {
  const referencePath = getProjectSectionPath('reference', projectName);
  const categoryNodes = [];
  for (const section of REFERENCE_SECTIONS) {
    const folderPath = path.join(referencePath, section.dirName);
    const subtree = await buildGenericTree(folderPath, 'reference');
    categoryNodes.push(
      buildNode({
        name: section.label,
        label: section.label,
        kind: 'reference-category',
        nodePath: folderPath,
        children: subtree.children || []
      })
    );
  }

  return buildNode({
    name: 'Справочник',
    label: 'Справочник',
    kind: 'reference-root',
    nodePath: referencePath,
    children: categoryNodes
  });
}

function getDocumentContextFromPath(filePath) {
  const projectRoot = getProjectRootPath();
  const relative = path.relative(projectRoot, filePath);
  const baseTitle = getDisplayNameForEntry(path.basename(filePath));
  const lowerBaseName = path.basename(filePath).toLowerCase();

  if (!relative || relative.startsWith('..')) {
    return { title: baseTitle, kind: 'external', metaEnabled: false };
  }

  const parts = relative.split(path.sep);
  if (parts[0] === PROJECT_SUBFOLDERS.roman) {
    if (parts.length >= 2) {
      if (parts.length === 2 && parts[1].toLowerCase().endsWith('.txt')) {
        const normalizedName = sanitizeFilename(stripTxtExtension(parts[1])).toLowerCase();
        if (ROMAN_SECTION_FILENAME_SET.has(normalizedName)) {
          return { title: baseTitle, kind: 'roman-section', metaEnabled: false };
        }
        return { title: baseTitle, kind: 'chapter-file', metaEnabled: true };
      }
      if (parts.length === 3 && parts[2].toLowerCase().endsWith('.txt')) {
        return { title: baseTitle, kind: 'chapter-file', metaEnabled: true };
      }
      if (parts.length >= 4 && parts[3].toLowerCase().endsWith('.txt')) {
        return { title: baseTitle, kind: 'scene', metaEnabled: true };
      }
    }
  }

  if (parts[0] === PROJECT_SUBFOLDERS.mindmap) {
    if (parts.length === 2 && parts[1].toLowerCase().endsWith('.txt')) {
      return { title: baseTitle, kind: 'mindmap-section', metaEnabled: false };
    }
  }

  if (parts[0] === PROJECT_SUBFOLDERS.print) {
    if (parts.length === 2 && parts[1].toLowerCase().endsWith('.txt')) {
      return { title: baseTitle, kind: 'print-section', metaEnabled: false };
    }
  }

  if (parts[0] === PROJECT_SUBFOLDERS.materials) {
    if (lowerBaseName === '.index.txt' && parts.length >= 3) {
      const category = MATERIALS_SECTIONS.find((section) => section.dirName === parts[1]);
      return { title: category ? category.label : baseTitle, kind: 'material', metaEnabled: false };
    }
    return { title: baseTitle, kind: 'material', metaEnabled: false };
  }

  if (parts[0] === PROJECT_SUBFOLDERS.reference) {
    if (lowerBaseName === '.index.txt' && parts.length >= 3) {
      const category = REFERENCE_SECTIONS.find((section) => section.dirName === parts[1]);
      return { title: category ? category.label : baseTitle, kind: 'reference', metaEnabled: false };
    }
    return { title: baseTitle, kind: 'reference', metaEnabled: false };
  }

  return { title: baseTitle, kind: 'external', metaEnabled: false };
}

function getBackupBasePathForFile(filePath) {
  if (!filePath) return null;
  const projectRoot = getProjectRootPath();
  return isPathInside(projectRoot, filePath) ? projectRoot : null;
}

async function safeRenameSequence(renames) {
  const timestamp = Date.now();
  const tempSuffix = `.tmp-${timestamp}`;
  const tempMappings = [];
  for (const rename of renames) {
    const tempPath = `${rename.from}${tempSuffix}`;
    await fs.rename(rename.from, tempPath);
    tempMappings.push({ tempPath, finalPath: rename.to });
  }
  for (const mapping of tempMappings) {
    await fs.rename(mapping.tempPath, mapping.finalPath);
  }
}

async function reorderEntriesWithPrefixes(parentPath, orderedEntries) {
  const renames = [];
  orderedEntries.forEach((entry, index) => {
    const baseName = entry.baseName;
    const prefixed = formatPrefixedName(baseName, index + 1);
    const finalName = entry.isFile ? `${prefixed}.txt` : prefixed;
    const finalPath = path.join(parentPath, finalName);
    if (entry.path !== finalPath) {
      renames.push({ from: entry.path, to: finalPath });
    }
    entry.nextPath = finalPath;
  });

  if (!renames.length) {
    return orderedEntries;
  }

  await safeRenameSequence(renames);
  return orderedEntries;
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
      const context = getDocumentContextFromPath(lastFilePath);
      sendEditorText({
        content: fileResult.content,
        title: context.title,
        path: lastFilePath,
        kind: context.kind,
        metaEnabled: context.metaEnabled
      });
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

    sendEditorText({ content, title: 'Автосохранение', path: '', kind: 'autosave', metaEnabled: false });

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
const DEFAULT_WINDOW_SIZE = {
  width: 3456,
  height: 2234
};

const windowState = {
  width: DEFAULT_WINDOW_SIZE.width,
  height: DEFAULT_WINDOW_SIZE.height,
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

ipcMain.handle('ui:request-autosave', async () => {
  return autoSave();
});

ipcMain.on('dirty-changed', (_, state) => {
  isDirty = state;
});

ipcMain.on('ui:new', () => {
  ensureCleanAction(handleNew).catch(() => {});
});

ipcMain.on('ui:open', () => {
  ensureCleanAction(handleOpen).catch(() => {});
});

ipcMain.on('ui:save', () => {
  handleSave().catch(() => {});
});

ipcMain.on('ui:save-as', () => {
  handleSaveAs().catch(() => {});
});

ipcMain.on('ui:set-theme', (_, theme) => {
  if (typeof theme === 'string') {
    handleThemeChange(theme);
  }
});

ipcMain.on('ui:set-font', (_, fontFamily) => {
  if (typeof fontFamily === 'string') {
    handleFontChange(fontFamily);
  }
});

ipcMain.on('ui:set-font-size', async (_, px) => {
  const nextSize = Number(px);
  if (!Number.isFinite(nextSize)) return;
  currentFontSize = clampFontSize(nextSize);
  sendEditorFontSize(currentFontSize);
  try {
    const settings = await loadSettings();
    settings.fontSize = currentFontSize;
    await saveSettings(settings);
  } catch (error) {
    logDevError('ui:set-font-size', error);
  }
});

ipcMain.on('ui:font-size', (_, action) => {
  handleFontSizeChange(action).catch(() => {});
});

ipcMain.on('ui:window-minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.handle('ui:get-project-tree', async (_, payload) => {
  const tab = payload && payload.tab;
  if (!tab) {
    return { ok: false, error: 'Missing tab' };
  }

  await ensureProjectStructure();

  if (tab === 'roman') {
    const romanRoot = await buildRomanTree();
    const mindmapRoot = await buildMindMapTree();
    const printRoot = await buildPrintTree();
    const root = buildNode({
      name: 'Roman tab',
      label: 'Roman',
      kind: 'roman-tab-root',
      nodePath: getProjectRootPath(),
      children: [romanRoot, mindmapRoot, printRoot]
    });
    return { ok: true, root };
  }
  if (tab === 'materials') {
    const root = await buildMaterialsTree();
    return { ok: true, root };
  }
  if (tab === 'reference') {
    const root = await buildReferenceTree();
    return { ok: true, root };
  }

  return { ok: false, error: 'Unknown tab' };
});

ipcMain.handle('ui:open-document', async (_, payload) => {
  if (!mainWindow) {
    return { ok: false, error: 'No active window' };
  }

  const filePath = payload && payload.path;
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return { ok: false, error: 'Invalid file path' };
  }

  const projectRoot = getProjectRootPath();
  if (!isPathInside(projectRoot, filePath)) {
    return { ok: false, error: 'Path outside project' };
  }

  const canProceed = await confirmDiscardChanges();
  if (!canProceed) {
    return { ok: false, cancelled: true };
  }

  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
  } catch (error) {
    logDevError('open document mkdir', error);
    return { ok: false, error: error.message || 'Failed to create folder' };
  }

  let content = '';
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      logDevError('open document read', error);
      return { ok: false, error: error.message || 'Failed to read file' };
    }

    const created = await queueDiskOperation(
      () => fileManager.writeFileAtomic(filePath, ''),
      'create document file'
    );
    if (!created.success) {
      return { ok: false, error: created.error || 'Failed to create file' };
    }
  }

  const context = payload && payload.kind ? {
    title: typeof payload.title === 'string' ? payload.title : getDisplayNameForEntry(path.basename(filePath)),
    kind: payload.kind,
    metaEnabled: ROMAN_META_KINDS.has(payload.kind)
  } : getDocumentContextFromPath(filePath);

  currentFilePath = filePath;
  await saveLastFile();
  sendEditorText({
    content,
    title: context.title,
    path: filePath,
    kind: context.kind,
    metaEnabled: context.metaEnabled
  });
  setDirtyState(false);
  const contentHash = computeHash(content);
  lastAutosaveHash = contentHash;
  backupHashes.set(filePath, contentHash);
  updateStatus('Готово');
  return { ok: true, path: filePath };
});

ipcMain.handle('ui:create-node', async (_, payload) => {
  if (!payload || typeof payload.parentPath !== 'string' || typeof payload.kind !== 'string') {
    return { ok: false, error: 'Invalid payload' };
  }

  const parentPath = payload.parentPath;
  const kind = payload.kind;
  const name = typeof payload.name === 'string' ? payload.name : '';
  const safeName = sanitizeFilename(name);
  const projectRoot = getProjectRootPath();

  if (!isPathInside(projectRoot, parentPath)) {
    return { ok: false, error: 'Path outside project' };
  }

  const createWithPrefix = async (baseName, isFile) => {
    const entries = await readDirectoryEntries(parentPath);
    const nextIndex = entries.length + 1;
    const prefixed = formatPrefixedName(baseName, nextIndex);
    const finalName = isFile ? `${prefixed}.txt` : prefixed;
    const targetPath = path.join(parentPath, finalName);
    if (await fileExists(targetPath)) {
      return { ok: false, error: 'Файл уже существует' };
    }
    if (isFile) {
      const result = await fileManager.writeFileAtomic(targetPath, '');
      if (!result.success) {
        return { ok: false, error: result.error || 'Failed to create file' };
      }
      return { ok: true, path: targetPath };
    }
    await fs.mkdir(targetPath, { recursive: true });
    return { ok: true, path: targetPath };
  };

  const createWithoutPrefix = async (baseName, isFile) => {
    const finalName = isFile ? `${baseName}.txt` : baseName;
    const targetPath = path.join(parentPath, finalName);
    if (await fileExists(targetPath)) {
      return { ok: false, error: 'Файл уже существует' };
    }
    if (isFile) {
      const result = await fileManager.writeFileAtomic(targetPath, '');
      if (!result.success) {
        return { ok: false, error: result.error || 'Failed to create file' };
      }
      return { ok: true, path: targetPath };
    }
    await fs.mkdir(targetPath, { recursive: true });
    return { ok: true, path: targetPath };
  };

  if (kind === 'part') {
    return createWithPrefix(safeName || 'Новая часть', false);
  }
  if (kind === 'chapter-file') {
    return createWithPrefix(safeName || 'Новая глава', true);
  }
  if (kind === 'chapter-folder') {
    return createWithPrefix(safeName || 'Новая глава', false);
  }
  if (kind === 'scene') {
    return createWithPrefix(safeName || 'Новая сцена', true);
  }
  if (kind === 'folder') {
    return createWithoutPrefix(safeName || 'Новая папка', false);
  }
  if (kind === 'file') {
    return createWithoutPrefix(safeName || 'Новый документ', true);
  }

  return { ok: false, error: 'Unknown node kind' };
});

ipcMain.handle('ui:rename-node', async (_, payload) => {
  if (!payload || typeof payload.path !== 'string' || typeof payload.name !== 'string') {
    return { ok: false, error: 'Invalid payload' };
  }

  const nodePath = payload.path;
  const newName = sanitizeFilename(payload.name);
  if (!newName) {
    return { ok: false, error: 'Empty name' };
  }

  const projectRoot = getProjectRootPath();
  if (!isPathInside(projectRoot, nodePath)) {
    return { ok: false, error: 'Path outside project' };
  }

  const baseName = path.basename(nodePath);
  const isFile = baseName.toLowerCase().endsWith('.txt');
  const prefix = extractNumericPrefix(baseName);
  const finalBase = prefix !== null ? `${String(prefix).padStart(2, '0')}_${newName}` : newName;
  const finalName = isFile ? `${finalBase}.txt` : finalBase;
  const targetPath = path.join(path.dirname(nodePath), finalName);

  if (targetPath === nodePath) {
    return { ok: true, path: nodePath };
  }

  try {
    await fs.rename(nodePath, targetPath);
  } catch (error) {
    logDevError('rename node', error);
    return { ok: false, error: error.message || 'Failed to rename' };
  }

  if (currentFilePath && isPathInside(nodePath, currentFilePath)) {
    const relative = path.relative(nodePath, currentFilePath);
    currentFilePath = path.join(targetPath, relative);
    await saveLastFile();
  }

  return { ok: true, path: targetPath };
});

ipcMain.handle('ui:delete-node', async (_, payload) => {
  if (!payload || typeof payload.path !== 'string') {
    return { ok: false, error: 'Invalid payload' };
  }

  const nodePath = payload.path;
  const projectRoot = getProjectRootPath();
  if (!isPathInside(projectRoot, nodePath)) {
    return { ok: false, error: 'Path outside project' };
  }

  const trashPath = getProjectSectionPath('trash');
  await fs.mkdir(trashPath, { recursive: true });
  const baseName = path.basename(nodePath);
  let targetPath = path.join(trashPath, baseName);
  if (await fileExists(targetPath)) {
    const stamped = `${Date.now()}_${baseName}`;
    targetPath = path.join(trashPath, stamped);
  }

  try {
    await fs.rename(nodePath, targetPath);
  } catch (error) {
    logDevError('delete node', error);
    return { ok: false, error: error.message || 'Failed to move to trash' };
  }

  if (currentFilePath && isPathInside(nodePath, currentFilePath)) {
    currentFilePath = null;
    await saveLastFile();
    sendEditorText({ content: '', title: '', path: '', kind: 'empty', metaEnabled: false });
    setDirtyState(false);
    updateStatus('Готово');
  }

  return { ok: true, path: targetPath };
});

ipcMain.handle('ui:reorder-node', async (_, payload) => {
  if (!payload || typeof payload.path !== 'string' || typeof payload.direction !== 'string') {
    return { ok: false, error: 'Invalid payload' };
  }

  const nodePath = payload.path;
  const direction = payload.direction;
  const projectRoot = getProjectRootPath();
  const romanRoot = getProjectSectionPath('roman');

  if (!isPathInside(projectRoot, nodePath)) {
    return { ok: false, error: 'Path outside project' };
  }

  if (!isPathInside(romanRoot, nodePath)) {
    return { ok: false, error: 'Reorder only supported in roman' };
  }

  const parentPath = path.dirname(nodePath);
  const entries = await readDirectoryEntries(parentPath);
  const index = entries.findIndex((entry) => entry.path === nodePath);
  if (index === -1) {
    return { ok: false, error: 'Node not found' };
  }

  const targetIndex = direction === 'up' ? index - 1 : direction === 'down' ? index + 1 : index;
  if (targetIndex < 0 || targetIndex >= entries.length || targetIndex === index) {
    return { ok: true, path: nodePath };
  }

  const nextEntries = entries.slice();
  const [moved] = nextEntries.splice(index, 1);
  nextEntries.splice(targetIndex, 0, moved);

  const reordered = await reorderEntriesWithPrefixes(parentPath, nextEntries);
  const updated = reordered.find((entry) => entry.path === nodePath || entry.nextPath === nodePath);
  const updatedPath = updated?.nextPath || nodePath;

  if (currentFilePath && isPathInside(nodePath, currentFilePath)) {
    const relative = path.relative(nodePath, currentFilePath);
    currentFilePath = path.join(updatedPath, relative);
    await saveLastFile();
  }

  return { ok: true, path: updatedPath };
});
ipcMain.handle('ui:open-section', async (_, payload) => {
  if (!mainWindow) {
    return { ok: false, error: 'No active window' };
  }

  const sectionName = payload && payload.sectionName;
  if (typeof sectionName !== 'string' || !sectionName.trim()) {
    return { ok: false, error: 'Invalid section name' };
  }

  const canProceed = await confirmDiscardChanges();
  if (!canProceed) {
    return { ok: false, cancelled: true };
  }

  const filePath = getSectionDocumentPath(sectionName);
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
  } catch (error) {
    logDevError('open section mkdir', error);
    return { ok: false, error: error.message || 'Failed to create folder' };
  }

  let content = '';
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      logDevError('open section read', error);
      return { ok: false, error: error.message || 'Failed to read file' };
    }

    const created = await queueDiskOperation(
      () => fileManager.writeFileAtomic(filePath, ''),
      'create section file'
    );
    if (!created.success) {
      return { ok: false, error: created.error || 'Failed to create file' };
    }
  }

  currentFilePath = filePath;
  await saveLastFile();
  sendEditorText({ content, title: sectionName, path: filePath, kind: 'legacy-section', metaEnabled: false });
  setDirtyState(false);
  const contentHash = computeHash(content);
  lastAutosaveHash = contentHash;
  backupHashes.set(filePath, contentHash);
  updateStatus('Готово');
  return { ok: true, filePath };
});

function createWindow() {
  // Восстановление размеров и позиции окна
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const desiredWidth = Number.isFinite(windowState.width) ? windowState.width : DEFAULT_WINDOW_SIZE.width;
  const desiredHeight = Number.isFinite(windowState.height) ? windowState.height : DEFAULT_WINDOW_SIZE.height;
  const width = Math.min(desiredWidth, screenWidth);
  const height = Math.min(desiredHeight, screenHeight);

  mainWindow = new BrowserWindow({
    width,
    height,
    x: windowState.x,
    y: windowState.y,
    backgroundColor: '#dbd4ca',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  logPerfStage('create-window');

  mainWindow.loadFile('src/renderer/index.html');

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape' && mainWindow && mainWindow.isFullScreen()) {
      event.preventDefault();
      mainWindow.setFullScreen(false);
    }
  });

  // Открыть последний файл и применить настройки после загрузки
  mainWindow.webContents.once('did-finish-load', async () => {
    mainWindow.webContents.setZoomFactor(1);
    logPerfStage('did-finish-load');
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
  sendEditorText({ content: '', title: '', path: '', kind: 'empty', metaEnabled: false });
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
      const context = getDocumentContextFromPath(filePath);
      sendEditorText({
        content: fileResult.content,
        title: context.title,
        path: filePath,
        kind: context.kind,
        metaEnabled: context.metaEnabled
      });
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

async function autoSave() {
  if (!mainWindow || autoSaveInProgress) {
    return true;
  }

  if (!isDirty) {
    return true;
  }

  autoSaveInProgress = true;
  try {
    const content = await requestEditorText();
    const currentHash = computeHash(content);

    if (currentHash === lastAutosaveHash) {
      setDirtyState(false);
      return true;
    }

    if (currentFilePath) {
      const saveResult = await queueDiskOperation(
        () => fileManager.writeFileAtomic(currentFilePath, content),
        'autosave file'
      );
      if (!saveResult.success) {
        updateStatus('Ошибка сохранения');
        return false;
      }

      lastAutosaveHash = currentHash;
      setDirtyState(false);
      updateStatus('Автосохранено');
      await saveLastFile();
      return true;
    }

    const autosaveResult = await queueDiskOperation(
      () => writeAutosaveFile(content),
      'autosave temporary'
    );
    if (!autosaveResult.success) {
      updateStatus('Ошибка сохранения');
      return false;
    }

    lastAutosaveHash = currentHash;
    setDirtyState(false);
    updateStatus('Автосохранено');
    return true;
  } catch (error) {
    updateStatus('Ошибка сохранения');
    logDevError('autoSave', error);
    return false;
  } finally {
    autoSaveInProgress = false;
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
        () => backupManager.createBackup(currentFilePath, content, { basePath: getBackupBasePathForFile(currentFilePath) }),
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

async function handleSaveAs() {
  if (!mainWindow) {
    return false;
  }

  let content;
  try {
    content = await requestEditorText();
  } catch (error) {
    updateStatus('Ошибка');
    logDevError('handleSaveAs', error);
    return false;
  }

  const wasUntitled = currentFilePath === null;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Сохранить файл',
    defaultPath: currentFilePath || fileManager.getDocumentsPath(),
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
      'save as file'
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

  return autoSave();
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
    { label: 'Palatino', value: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif" },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
    { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
    { label: 'Arial', value: 'Arial, sans-serif' },
    { label: 'SF Pro', value: '-apple-system, system-ui, sans-serif' },
    { label: 'Courier', value: "'Courier New', Courier, monospace" }
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
      label: 'Правка',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        { role: 'selectAll' }
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

// Подготовка локальных директорий (Documents/craftsman + autosave) при запуске
async function initializeApp() {
  await fileManager.migrateDocumentsFolder();
  await fileManager.ensureDocumentsFolder();
  await ensureAutosaveDirectory();
  await ensureProjectStructure();
}

app.whenReady().then(async () => {
  logPerfStage('when-ready');
  app.setName('Craftsman');
  await ensureUserDataFolder();
  const windowStatePromise = loadWindowStateFromSettings();
  const initPromise = initializeApp()
    .then(() => {
      logPerfStage('init-complete');
    })
    .catch((error) => {
      logDevError('initializeApp', error);
    });

  await windowStatePromise;
  logPerfStage('window-state-loaded');
  createWindow();
  createMenu();
  logPerfStage('window-visible');

  // Запуск автосохранения каждые 15 секунд
  setInterval(() => {
    autoSave().catch((error) => {
      logDevError('autoSave interval', error);
    });
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

  // Позволяем фоновым инициализациям завершиться без блокировки UI
  initPromise.catch(() => {});
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
