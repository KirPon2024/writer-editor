const { app, BrowserWindow, Menu, dialog, ipcMain, session } = require('electron');
const { performance } = require('perf_hooks');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const fsSync = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
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
const CSP_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
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
const EXPORT_DOCX_MIN_CHANNEL = 'u:cmd:project:export:docxMin:v1';
const EXPORT_DOCX_DEFAULT_REQUEST_ID = 'u3-export-docxmin-request';
const IMPORT_MARKDOWN_V1_CHANNEL = 'm:cmd:project:import:markdownV1:v1';
const EXPORT_MARKDOWN_V1_CHANNEL = 'm:cmd:project:export:markdownV1:v1';
const FLOW_OPEN_V1_CHANNEL = 'm:cmd:project:flow:open:v1';
const FLOW_SAVE_V1_CHANNEL = 'm:cmd:project:flow:save:v1';
const MARKDOWN_RELIABILITY_LOG_PATH = path.join(os.tmpdir(), 'writer-editor-ops-state', 'markdown-io.log');
const ZIP_CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

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

function isFileUrl(url) {
  return typeof url === 'string' && url.startsWith('file://');
}

function blockExternalNavigation(event, url) {
  if (!isFileUrl(url)) {
    event.preventDefault();
  }
}

function installContentSecurityPolicy() {
  const defaultSession = session.defaultSession;
  if (!defaultSession) {
    return;
  }

  defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders ? { ...details.responseHeaders } : {};
    if (details.resourceType === 'mainFrame' && isFileUrl(details.url)) {
      responseHeaders['Content-Security-Policy'] = [CSP_POLICY];
    }
    callback({ responseHeaders });
  });
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

function makeTypedExportError(code, reason, details) {
  const error = {
    code: typeof code === 'string' && code.length > 0 ? code : 'E_EXPORT_DOCXMIN_FAILED',
    op: EXPORT_DOCX_MIN_CHANNEL,
    reason: typeof reason === 'string' && reason.length > 0 ? reason : 'EXPORT_DOCXMIN_FAILED',
  };
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    error.details = details;
  }
  return { ok: 0, error };
}

let markdownTransformModulePromise = null;
function loadMarkdownTransformModule() {
  if (!markdownTransformModulePromise) {
    const modulePath = pathToFileURL(path.join(__dirname, 'export', 'markdown', 'v1', 'index.mjs')).href;
    markdownTransformModulePromise = import(modulePath).catch((error) => {
      markdownTransformModulePromise = null;
      throw error;
    });
  }
  return markdownTransformModulePromise;
}

let markdownIoModulePromise = null;
function loadMarkdownIoModule() {
  if (!markdownIoModulePromise) {
    const modulePath = pathToFileURL(path.join(__dirname, 'io', 'markdown', 'index.mjs')).href;
    markdownIoModulePromise = import(modulePath).catch((error) => {
      markdownIoModulePromise = null;
      throw error;
    });
  }
  return markdownIoModulePromise;
}

function mapMarkdownErrorCode(inputCode, inputReason) {
  const code = typeof inputCode === 'string' ? inputCode : '';
  const reason = typeof inputReason === 'string' ? inputReason : '';
  if (code.startsWith('E_IO_')) return code;
  if (code === 'E_MD_LIMIT_SIZE') return 'MDV1_INPUT_TOO_LARGE';
  if (code === 'E_MD_LIMIT_DEPTH' || code === 'E_MD_LIMIT_NODES' || code === 'E_MD_LIMIT_TIMEOUT') {
    return 'MDV1_LIMIT_EXCEEDED';
  }
  if (code === 'E_MD_SECURITY_URI_SCHEME_DENIED' || code === 'E_MD_SECURITY_RAW_HTML') {
    return 'MDV1_SECURITY_VIOLATION';
  }
  if (code === 'E_MD_SERIALIZE_UNKNOWN_BLOCK' || code === 'E_MD_UNSUPPORTED_FEATURE') {
    return 'MDV1_UNSUPPORTED_FEATURE';
  }
  if (reason.includes('unsupported')) {
    return 'MDV1_UNSUPPORTED_FEATURE';
  }
  return 'MDV1_INTERNAL_ERROR';
}

function normalizeMarkdownSafetyMode(input) {
  return input === 'compat' ? 'compat' : 'strict';
}

function getMarkdownRecoveryGuidance(code) {
  if (code === 'E_IO_INTEGRITY_MISMATCH') {
    return {
      userMessage: 'Нарушена целостность Markdown. Действия: Open Snapshot / Retry / Abort.',
      recoveryActions: ['OPEN_SNAPSHOT', 'RETRY', 'ABORT'],
    };
  }
  if (code === 'E_IO_ATOMIC_WRITE_FAIL') {
    return {
      userMessage: 'Не удалось безопасно записать Markdown. Действия: Retry / Save As / Open Snapshot.',
      recoveryActions: ['RETRY', 'SAVE_AS', 'OPEN_SNAPSHOT'],
    };
  }
  if (code === 'E_IO_SNAPSHOT_FAIL') {
    return {
      userMessage: 'Не удалось создать recovery snapshot. Действия: Retry / Save As.',
      recoveryActions: ['RETRY', 'SAVE_AS'],
    };
  }
  if (code === 'E_IO_CORRUPT_INPUT') {
    return {
      userMessage: 'Markdown поврежден. Действия: Open Snapshot / Retry.',
      recoveryActions: ['OPEN_SNAPSHOT', 'RETRY'],
    };
  }
  if (code === 'E_IO_INVALID_ENCODING' || code === 'E_IO_TRUNCATED_INPUT') {
    return {
      userMessage: 'Markdown поврежден кодировкой. Действия: Open Snapshot / Retry / Abort.',
      recoveryActions: ['OPEN_SNAPSHOT', 'RETRY', 'ABORT'],
    };
  }
  if (code === 'E_IO_SNAPSHOT_MISSING') {
    return {
      userMessage: 'Recovery snapshot не найден. Действия: Retry / Save As / Abort.',
      recoveryActions: ['RETRY', 'SAVE_AS', 'ABORT'],
    };
  }
  if (code === 'E_IO_SNAPSHOT_MISMATCH') {
    return {
      userMessage: 'Recovery snapshot поврежден. Действия: Retry / Save As / Abort.',
      recoveryActions: ['RETRY', 'SAVE_AS', 'ABORT'],
    };
  }
  if (code === 'E_IO_INPUT_TOO_LARGE') {
    return {
      userMessage: 'Markdown слишком большой. Действия: Save As / Retry с меньшим файлом.',
      recoveryActions: ['SAVE_AS', 'RETRY'],
    };
  }
  if (code.startsWith('E_IO_')) {
    return {
      userMessage: 'Ошибка ввода-вывода Markdown. Действия: Retry / Save As / Abort.',
      recoveryActions: ['RETRY', 'SAVE_AS', 'ABORT'],
    };
  }
  return null;
}

function makeTypedMarkdownError(op, inputCode, inputReason, details) {
  const mappedCode = mapMarkdownErrorCode(inputCode, inputReason);
  const error = {
    code: mappedCode,
    op,
    reason: typeof inputReason === 'string' && inputReason.length > 0
      ? inputReason
      : 'MARKDOWN_COMMAND_FAILED',
  };
  const recovery = getMarkdownRecoveryGuidance(mappedCode);
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    error.details = { ...details };
  }
  if (recovery) {
    error.details = {
      ...(error.details && typeof error.details === 'object' ? error.details : {}),
      userMessage: recovery.userMessage,
      recoveryActions: recovery.recoveryActions,
    };
  }
  return { ok: 0, error };
}

async function appendMarkdownReliabilityLog(markdownIo, input = {}) {
  if (!markdownIo || typeof markdownIo.buildReliabilityLogRecord !== 'function') {
    return { logRecord: null, logPath: '' };
  }
  const logRecord = markdownIo.buildReliabilityLogRecord({
    op: input.op,
    code: input.code,
    reason: input.reason,
    safetyMode: input.safetyMode,
    sourcePath: input.sourcePath,
    targetPath: input.targetPath,
    snapshotPath: input.snapshotPath,
    recoveryActions: input.recoveryActions,
  });
  if (typeof markdownIo.appendReliabilityLog !== 'function') {
    return { logRecord, logPath: '' };
  }
  try {
    const appended = await markdownIo.appendReliabilityLog(logRecord, {
      logPath: MARKDOWN_RELIABILITY_LOG_PATH,
    });
    return { logRecord, logPath: appended && typeof appended.logPath === 'string' ? appended.logPath : '' };
  } catch {
    return { logRecord, logPath: '' };
  }
}

function normalizeMarkdownImportPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  return {
    text: typeof payload.text === 'string'
      ? payload.text
      : (typeof payload.markdown === 'string' ? payload.markdown : ''),
    sourceName: typeof payload.sourceName === 'string' ? payload.sourceName : '',
    sourcePath: typeof payload.sourcePath === 'string' ? payload.sourcePath : '',
    limits: payload.limits && typeof payload.limits === 'object' && !Array.isArray(payload.limits)
      ? payload.limits
      : {},
  };
}

function normalizeMarkdownExportPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (!payload.scene || typeof payload.scene !== 'object' || Array.isArray(payload.scene)) return null;
  return {
    scene: payload.scene,
    outPath: typeof payload.outPath === 'string' ? payload.outPath.trim() : '',
    snapshotLimit: Number.isInteger(payload.snapshotLimit) && payload.snapshotLimit >= 1
      ? payload.snapshotLimit
      : 3,
    safetyMode: normalizeMarkdownSafetyMode(payload.safetyMode),
    limits: payload.limits && typeof payload.limits === 'object' && !Array.isArray(payload.limits)
      ? payload.limits
      : {},
  };
}

function normalizeExportPayload(payload) {
  if (payload === undefined || payload === null) {
    return {
      requestId: EXPORT_DOCX_DEFAULT_REQUEST_ID,
      outPath: '',
      outDir: '',
      bufferSource: '',
      options: {},
    };
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const requestId = typeof payload.requestId === 'string' && payload.requestId.trim().length > 0
    ? payload.requestId.trim()
    : EXPORT_DOCX_DEFAULT_REQUEST_ID;
  const outPath = typeof payload.outPath === 'string' ? payload.outPath.trim() : '';
  const outDir = typeof payload.outDir === 'string' ? payload.outDir.trim() : '';
  const bufferSource = typeof payload.bufferSource === 'string' ? payload.bufferSource : '';
  const options = payload.options && typeof payload.options === 'object' && !Array.isArray(payload.options)
    ? payload.options
    : {};

  return {
    requestId,
    outPath,
    outDir,
    bufferSource,
    options,
  };
}

function normalizeDocxExportPath(filePath) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) return '';
  const raw = filePath.trim();
  return raw.toLowerCase().endsWith('.docx') ? raw : `${raw}.docx`;
}

async function resolveDocxExportPath(payload) {
  const fromPayload = normalizeDocxExportPath(payload.outPath);
  if (fromPayload) return fromPayload;

  const defaultBase = currentFilePath
    ? currentFilePath.replace(/\.[^/.]+$/i, '')
    : path.join(fileManager.getDocumentsPath(), 'export');
  const defaultPath = normalizeDocxExportPath(defaultBase);

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Экспорт DOCX (MIN)',
    defaultPath,
    filters: [{ name: 'DOCX', extensions: ['docx'] }],
  });
  if (result.canceled) return '';
  return normalizeDocxExportPath(result.filePath);
}

function escapeXml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = (crc >>> 8) ^ ZIP_CRC32_TABLE[(crc ^ buffer[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const nameBuffer = Buffer.from(entry.name, 'utf8');
    const dataBuffer = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data || ''), 'utf8');
    const crc = crc32(dataBuffer);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataBuffer.length, 18);
    localHeader.writeUInt32LE(dataBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBuffer, dataBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataBuffer.length, 20);
    centralHeader.writeUInt32LE(dataBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + dataBuffer.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

function buildDocxMinBuffer(sourceText) {
  const normalized = String(sourceText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.length > 0 ? normalized.split('\n') : [''];
  const paragraphs = lines
    .map((line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`)
    .join('');

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  return buildStoredZip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'word/document.xml', data: documentXml },
  ]);
}

async function writeBufferAtomic(filePath, buffer) {
  const directory = path.dirname(filePath);
  const baseName = path.basename(filePath);
  const randomSuffix = crypto.randomBytes(5).toString('hex');
  const tempPath = path.join(directory, `${baseName}.${randomSuffix}.tmp`);

  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(tempPath, buffer);
  await fs.rename(tempPath, filePath);
}

async function handleExportDocxMin(payloadRaw) {
  const payload = normalizeExportPayload(payloadRaw);
  if (!payload) {
    return makeTypedExportError('E_EXPORT_PAYLOAD_INVALID', 'PAYLOAD_INVALID');
  }

  let outPath = '';
  try {
    outPath = await resolveDocxExportPath(payload);
  } catch (error) {
    return makeTypedExportError('E_EXPORT_DIALOG_FAILED', 'EXPORT_DIALOG_FAILED', {
      message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN',
    });
  }
  if (!outPath) {
    return makeTypedExportError('E_EXPORT_CANCELED', 'EXPORT_DIALOG_CANCELED', {
      requestId: payload.requestId,
    });
  }

  let sourceText = payload.bufferSource;
  if (!sourceText) {
    try {
      sourceText = await requestEditorText();
    } catch (error) {
      return makeTypedExportError('E_EXPORT_TEXT_UNAVAILABLE', 'EDITOR_TEXT_UNAVAILABLE', {
        message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN',
      });
    }
  }

  let documentBuffer;
  try {
    documentBuffer = buildDocxMinBuffer(sourceText);
  } catch (error) {
    return makeTypedExportError('E_EXPORT_BUILD_FAILED', 'DOCX_BUILD_FAILED', {
      message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN',
    });
  }

  try {
    await queueDiskOperation(() => writeBufferAtomic(outPath, documentBuffer), 'export docx min');
    updateStatus('DOCX MIN экспортирован');
    return {
      ok: 1,
      outPath,
      bytesWritten: documentBuffer.length,
    };
  } catch (error) {
    return makeTypedExportError('E_EXPORT_WRITE_FAILED', 'DOCX_WRITE_FAILED', {
      message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN',
      outPath,
    });
  }
}

async function handleImportMarkdownV1(payloadRaw) {
  const payload = normalizeMarkdownImportPayload(payloadRaw);
  if (!payload) {
    return makeTypedMarkdownError(IMPORT_MARKDOWN_V1_CHANNEL, 'E_MD_PAYLOAD_INVALID', 'import_payload_invalid');
  }

  let transform;
  try {
    transform = await loadMarkdownTransformModule();
  } catch (error) {
    return makeTypedMarkdownError(
      IMPORT_MARKDOWN_V1_CHANNEL,
      'E_MD_TRANSFORM_LOAD_FAILED',
      'transform_module_load_failed',
      { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
    );
  }

  try {
    let markdownText = payload.text;
    let ioRecovery = null;
    if (!markdownText && payload.sourcePath) {
      const markdownIo = await loadMarkdownIoModule();
      const limits = typeof transform.normalizeLimits === 'function'
        ? transform.normalizeLimits(payload.limits)
        : { maxInputBytes: 1024 * 1024 };
      const loaded = await markdownIo.readMarkdownWithRecovery(payload.sourcePath, {
        maxInputBytes: limits.maxInputBytes,
      });
      markdownText = loaded.text;
      if (loaded && loaded.recoveredFromSnapshot === true) {
        ioRecovery = {
          sourceKind: loaded.sourceKind,
          snapshotPath: loaded.snapshotPath,
          recoveryAction: loaded.recoveryAction,
          primaryError: loaded.primaryError,
        };
      }
    }

    const scene = transform.parseMarkdownV1(markdownText, { limits: payload.limits });
    const out = {
      ok: 1,
      scene,
      sourceName: payload.sourceName,
      lossReport: scene && scene.lossReport && typeof scene.lossReport === 'object'
        ? scene.lossReport
        : { count: 0, items: [] },
    };
    if (ioRecovery) {
      out.recovery = ioRecovery;
    }
    return out;
  } catch (error) {
    let logRecord = null;
    let logPath = '';
    try {
      const markdownIo = await loadMarkdownIoModule();
      const log = await appendMarkdownReliabilityLog(markdownIo, {
        op: IMPORT_MARKDOWN_V1_CHANNEL,
        code: error && typeof error.code === 'string' ? error.code : 'E_MD_IMPORT_FAILED',
        reason: error && typeof error.reason === 'string' ? error.reason : 'import_failed',
        sourcePath: payload.sourcePath,
      });
      logRecord = log.logRecord;
      logPath = log.logPath;
    } catch {
      logRecord = null;
      logPath = '';
    }
    return makeTypedMarkdownError(
      IMPORT_MARKDOWN_V1_CHANNEL,
      error && typeof error.code === 'string' ? error.code : 'E_MD_IMPORT_FAILED',
      error && typeof error.reason === 'string' ? error.reason : 'import_failed',
      {
        ...(error && error.details && typeof error.details === 'object' && !Array.isArray(error.details)
          ? error.details
          : {}),
        ...(logRecord ? { logRecord } : {}),
        ...(logPath ? { logPath } : {}),
      },
    );
  }
}

async function handleExportMarkdownV1(payloadRaw) {
  const payload = normalizeMarkdownExportPayload(payloadRaw);
  if (!payload) {
    return makeTypedMarkdownError(EXPORT_MARKDOWN_V1_CHANNEL, 'E_MD_PAYLOAD_INVALID', 'export_payload_invalid');
  }

  let transform;
  try {
    transform = await loadMarkdownTransformModule();
  } catch (error) {
    return makeTypedMarkdownError(
      EXPORT_MARKDOWN_V1_CHANNEL,
      'E_MD_TRANSFORM_LOAD_FAILED',
      'transform_module_load_failed',
      { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
    );
  }

  try {
    const markdown = transform.serializeMarkdownV1(payload.scene);
    const parsed = transform.parseMarkdownV1(markdown, { limits: payload.limits });

    let writeResult = null;
    if (payload.outPath) {
      const markdownIo = await loadMarkdownIoModule();
      writeResult = await queueDiskOperation(
        () => markdownIo.writeMarkdownWithRecovery(payload.outPath, markdown, {
          maxSnapshots: payload.snapshotLimit,
          safetyMode: payload.safetyMode,
        }),
        'export markdown v1',
      );
    }

    return {
      ok: 1,
      markdown,
      safetyMode: payload.safetyMode,
      outPath: writeResult && typeof writeResult.outPath === 'string' ? writeResult.outPath : '',
      bytesWritten: writeResult && Number.isInteger(writeResult.bytesWritten) ? writeResult.bytesWritten : 0,
      snapshotCreated: writeResult ? Boolean(writeResult.snapshotCreated) : false,
      snapshotPath: writeResult && typeof writeResult.snapshotPath === 'string' ? writeResult.snapshotPath : '',
      purgedSnapshots: writeResult && Array.isArray(writeResult.purgedSnapshots) ? writeResult.purgedSnapshots : [],
      lossReport: parsed && parsed.lossReport && typeof parsed.lossReport === 'object'
        ? parsed.lossReport
        : { count: 0, items: [] },
    };
  } catch (error) {
    let logRecord = null;
    let logPath = '';
    const mappedCode = error && typeof error.code === 'string' ? error.code : 'E_MD_EXPORT_FAILED';
    const mappedReason = error && typeof error.reason === 'string' ? error.reason : 'export_failed';
    const recovery = getMarkdownRecoveryGuidance(mapMarkdownErrorCode(mappedCode, mappedReason));
    try {
      const markdownIo = await loadMarkdownIoModule();
      const log = await appendMarkdownReliabilityLog(markdownIo, {
        op: EXPORT_MARKDOWN_V1_CHANNEL,
        code: mappedCode,
        reason: mappedReason,
        safetyMode: payload.safetyMode,
        targetPath: payload.outPath,
        snapshotPath: error && error.details && typeof error.details === 'object'
          ? error.details.snapshotPath
          : '',
        recoveryActions: recovery ? recovery.recoveryActions : [],
      });
      logRecord = log.logRecord;
      logPath = log.logPath;
    } catch {
      logRecord = null;
      logPath = '';
    }
    return makeTypedMarkdownError(
      EXPORT_MARKDOWN_V1_CHANNEL,
      mappedCode,
      mappedReason,
      {
        ...(error && error.details && typeof error.details === 'object' && !Array.isArray(error.details)
          ? error.details
          : {}),
        safetyMode: payload.safetyMode,
        ...(logRecord ? { logRecord } : {}),
        ...(logPath ? { logPath } : {}),
      },
    );
  }
}

function makeFlowModeError(op, code, reason, details = {}) {
  return {
    ok: 0,
    error: {
      op,
      code,
      reason,
      details: details && typeof details === 'object' && !Array.isArray(details) ? details : {},
    },
  };
}

async function handleFlowOpenV1() {
  try {
    await ensureProjectStructure();
    const romanRoot = await buildRomanTree();
    const flowNodes = collectFlowEditableNodes(romanRoot, []);

    const scenes = [];
    for (const node of flowNodes) {
      const filePath = node.path;
      let content = '';
      try {
        content = await fs.readFile(filePath, 'utf8');
      } catch (error) {
        if (error && error.code === 'ENOENT') {
          const created = await queueDiskOperation(
            () => fileManager.writeFileAtomic(filePath, ''),
            'create flow scene file',
          );
          if (!created.success) {
            return makeFlowModeError(FLOW_OPEN_V1_CHANNEL, 'M7_FLOW_IO_CREATE_FAIL', 'flow_open_create_failed', {
              path: filePath,
            });
          }
        } else {
          return makeFlowModeError(FLOW_OPEN_V1_CHANNEL, 'M7_FLOW_IO_READ_FAIL', 'flow_open_read_failed', {
            path: filePath,
            message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN',
          });
        }
      }

      scenes.push({
        path: filePath,
        title: node.title,
        kind: node.kind,
        content: normalizeFlowTextInput(content),
      });
    }

    return {
      ok: 1,
      scenes,
    };
  } catch (error) {
    return makeFlowModeError(FLOW_OPEN_V1_CHANNEL, 'M7_FLOW_INTERNAL_ERROR', 'flow_open_failed', {
      message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN',
    });
  }
}

async function handleFlowSaveV1(payloadRaw) {
  const payload = payloadRaw && typeof payloadRaw === 'object' && !Array.isArray(payloadRaw) ? payloadRaw : null;
  const incomingScenes = payload && Array.isArray(payload.scenes) ? payload.scenes : null;
  if (!incomingScenes) {
    return makeFlowModeError(FLOW_SAVE_V1_CHANNEL, 'M7_FLOW_INVALID_PAYLOAD', 'flow_save_payload_invalid');
  }

  try {
    await ensureProjectStructure();
    const romanRoot = await buildRomanTree();
    const allowedNodes = collectFlowEditableNodes(romanRoot, []);
    const allowed = new Map(allowedNodes.map((item) => [item.path, item]));

    const normalizedScenes = [];
    for (const item of incomingScenes) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return makeFlowModeError(FLOW_SAVE_V1_CHANNEL, 'M7_FLOW_INVALID_SCENE_ITEM', 'flow_save_scene_invalid');
      }
      const scenePath = typeof item.path === 'string' ? item.path : '';
      if (!scenePath || !allowed.has(scenePath)) {
        return makeFlowModeError(FLOW_SAVE_V1_CHANNEL, 'M7_FLOW_PATH_FORBIDDEN', 'flow_save_path_forbidden', {
          path: scenePath,
        });
      }
      normalizedScenes.push({
        path: scenePath,
        content: normalizeFlowTextInput(item.content),
      });
    }

    for (const scene of normalizedScenes) {
      const writeResult = await queueDiskOperation(
        () => fileManager.writeFileAtomic(scene.path, scene.content),
        'save flow scene',
      );
      if (!writeResult.success) {
        return makeFlowModeError(FLOW_SAVE_V1_CHANNEL, 'M7_FLOW_IO_WRITE_FAIL', 'flow_save_write_failed', {
          path: scene.path,
        });
      }
    }

    updateStatus('Flow mode сохранен');
    return {
      ok: 1,
      savedCount: normalizedScenes.length,
    };
  } catch (error) {
    return makeFlowModeError(FLOW_SAVE_V1_CHANNEL, 'M7_FLOW_INTERNAL_ERROR', 'flow_save_failed', {
      message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN',
    });
  }
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

function normalizeFlowTextInput(value) {
  return String(value ?? '').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function collectFlowEditableNodes(node, output = []) {
  if (!node || typeof node !== 'object') return output;
  const kind = typeof node.kind === 'string' ? node.kind : '';
  const nodePath = typeof node.path === 'string' ? node.path : '';
  if (
    nodePath &&
    nodePath.toLowerCase().endsWith('.txt') &&
    (kind === 'roman-section' || kind === 'scene' || kind === 'chapter-file')
  ) {
    output.push({
      path: nodePath,
      title: typeof node.label === 'string' ? node.label : getDisplayNameForEntry(path.basename(nodePath)),
      kind,
    });
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      collectFlowEditableNodes(child, output);
    }
  }
  return output;
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

ipcMain.handle('file:save', async () => {
  return { ok: false, reason: "not-implemented" };
});

ipcMain.handle('file:save-as', async () => {
  return { ok: false, reason: "not-implemented" };
});

ipcMain.handle('file:open', async () => {
  return { ok: false, reason: "not-implemented" };
});

ipcMain.handle(EXPORT_DOCX_MIN_CHANNEL, async (_, payload) => {
  return handleExportDocxMin(payload);
});

ipcMain.handle(IMPORT_MARKDOWN_V1_CHANNEL, async (_, payload) => {
  return handleImportMarkdownV1(payload);
});

ipcMain.handle(EXPORT_MARKDOWN_V1_CHANNEL, async (_, payload) => {
  return handleExportMarkdownV1(payload);
});

ipcMain.handle(FLOW_OPEN_V1_CHANNEL, async () => {
  return handleFlowOpenV1();
});

ipcMain.handle(FLOW_SAVE_V1_CHANNEL, async (_, payload) => {
  return handleFlowSaveV1(payload);
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

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', blockExternalNavigation);
  mainWindow.webContents.on('will-redirect', blockExternalNavigation);

  logPerfStage('create-window');

  const useTiptap = process.env.USE_TIPTAP === '1';
  mainWindow.loadFile('src/renderer/index.html', { query: { USE_TIPTAP: (process.env.USE_TIPTAP === '1' ? '1' : '0') } });

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
    if (isDevMode) mainWindow.webContents.openDevTools({ mode: 'detach' });
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

const MENU_CONFIG_PATH = path.join(__dirname, 'menu', 'menu-config.v1.json');
const {
  loadAndValidateMenuConfig
} = require('./menu/menu-config-validator');
const MENU_ACCELERATOR_TOKENS = Object.freeze({
  platformQuit: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q'
});
const ALLOWED_MENU_ROLES = new Set(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']);
const MENU_ROLE_TEMPLATES = Object.freeze({
  undo: { role: 'undo' },
  redo: { role: 'redo' },
  cut: { role: 'cut' },
  copy: { role: 'copy' },
  paste: { role: 'paste' },
  selectAll: { role: 'selectAll' }
});
const MENU_ACTION_HANDLERS = Object.freeze({
  newDocument: async () => {
    await ensureCleanAction(handleNew);
  },
  openDocument: async () => {
    await ensureCleanAction(handleOpen);
  },
  saveDocument: async () => {
    await handleSave();
  },
  quitApp: () => {
    app.quit();
  },
  setFont: (fontFamily) => {
    handleFontChange(fontFamily);
  },
  setFontSize: (actionArg) => {
    handleFontSizeChange(actionArg);
  },
  setTheme: (theme) => {
    handleThemeChange(theme);
  }
});

function shouldFailHardOnMenuConfigError() {
  return process.env.MENU_CONFIG_CONTRACT_MODE === '1' || process.argv.includes('--menu-config-contract');
}

function resolveMenuAccelerator(value) {
  if (typeof value !== 'string' || !value.startsWith('$')) {
    return value;
  }

  const token = value.slice(1);
  if (!Object.prototype.hasOwnProperty.call(MENU_ACCELERATOR_TOKENS, token)) {
    throw new Error(`Unsupported menu accelerator token: ${value}`);
  }
  return MENU_ACCELERATOR_TOKENS[token];
}

function buildClickHandler(actionId, actionArg) {
  const handler = MENU_ACTION_HANDLERS[actionId];
  if (typeof handler !== 'function') {
    throw new Error(`Unknown menu action id: ${String(actionId)}`);
  }

  return () => {
    try {
      const result = handler(actionArg);
      if (result && typeof result.catch === 'function') {
        result.catch((error) => {
          logDevError(`menu-action:${actionId}`, error);
        });
      }
    } catch (error) {
      logDevError(`menu-action:${actionId}`, error);
    }
  };
}

function buildFontSubmenu(config) {
  return config.fonts.map((font, index) => {
    if (!font || typeof font !== 'object') {
      throw new Error(`Invalid font config at fonts[${index}]`);
    }
    if (typeof font.label !== 'string' || typeof font.value !== 'string') {
      throw new Error(`Invalid font config at fonts[${index}]: label/value are required`);
    }

    return {
      id: typeof font.id === 'string' ? font.id : `font-${index}`,
      label: font.label,
      click: buildClickHandler('setFont', font.value)
    };
  });
}

function buildMenuItemFromConfig(item, config, location) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`Invalid menu item at ${location}`);
  }

  if (item.type === 'separator') {
    return { type: 'separator' };
  }

  if (typeof item.role === 'string') {
    if (!ALLOWED_MENU_ROLES.has(item.role)) {
      throw new Error(`Unsupported menu role "${item.role}" at ${location}`);
    }

    const roleTemplate = MENU_ROLE_TEMPLATES[item.role];
    const roleItem = {
      ...roleTemplate
    };

    if (typeof item.id === 'string') {
      roleItem.id = item.id;
    }
    if (typeof item.enabled === 'boolean') {
      roleItem.enabled = item.enabled;
    }
    if (typeof item.visible === 'boolean') {
      roleItem.visible = item.visible;
    }

    return roleItem;
  }

  if (typeof item.label !== 'string' || item.label.length === 0) {
    throw new Error(`Menu item label is required at ${location}`);
  }

  const built = {
    label: item.label
  };

  if (typeof item.id === 'string') {
    built.id = item.id;
  }
  if (typeof item.accelerator === 'string') {
    built.accelerator = resolveMenuAccelerator(item.accelerator);
  }
  if (typeof item.enabled === 'boolean') {
    built.enabled = item.enabled;
  }
  if (typeof item.visible === 'boolean') {
    built.visible = item.visible;
  }

  if (item.submenuFrom !== undefined) {
    if (item.submenuFrom !== 'fonts') {
      throw new Error(`Unknown submenuFrom "${String(item.submenuFrom)}" at ${location}`);
    }
    built.submenu = buildFontSubmenu(config);
  } else if (Array.isArray(item.items)) {
    built.submenu = item.items.map((child, index) =>
      buildMenuItemFromConfig(child, config, `${location}.items[${index}]`)
    );
  }

  if (item.actionId !== undefined) {
    if (typeof item.actionId !== 'string') {
      throw new Error(`Menu actionId must be string at ${location}`);
    }
    built.click = buildClickHandler(item.actionId, item.actionArg);
  }

  return built;
}

function buildMenuTemplateFromConfig(config) {
  return config.menus.map((menuItem, index) =>
    buildMenuItemFromConfig(menuItem, config, `menus[${index}]`)
  );
}

function buildSafeFallbackMenuTemplate() {
  return [
    {
      id: 'safe-file',
      label: 'Файл',
      submenu: [
        {
          id: 'safe-quit',
          label: 'Выход',
          accelerator: MENU_ACCELERATOR_TOKENS.platformQuit,
          click: buildClickHandler('quitApp')
        }
      ]
    }
  ];
}

function createMenu() {
  const validatedConfig = loadAndValidateMenuConfig({
    configPath: MENU_CONFIG_PATH
  });
  if (!validatedConfig.ok) {
    const failReason = validatedConfig.failReason || 'Menu config validation failed.';
    const error = new Error(
      `Menu config validation failed: ${failReason} (${MENU_CONFIG_PATH})`
    );
    logDevError('createMenu', error);

    const fallbackMenu = Menu.buildFromTemplate(buildSafeFallbackMenuTemplate());
    Menu.setApplicationMenu(fallbackMenu);

    if (shouldFailHardOnMenuConfigError()) {
      throw error;
    }
    return;
  }

  const template = buildMenuTemplateFromConfig(validatedConfig.config);

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
  installContentSecurityPolicy();
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
