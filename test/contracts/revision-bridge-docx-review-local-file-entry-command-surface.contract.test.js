const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { deflateRawSync } = require('node:zlib');
const { pathToFileURL } = require('node:url');
const { createDocxActivationRequestDigestGuard } = require('../../src/main/rtkDocxActivationGuards.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MAIN_PATH = path.join(REPO_ROOT, 'src', 'main.js');
const BRIDGE_MODULE_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'index.mjs');
const MENU_CONFIG_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-config.v2.json');
const MENU_LOCALE_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-locale.catalog.v1.json');
const MUTATE_SECTION_START = '// CONTOUR_01A_REVIEW_MUTATE_PORT_START';
const MUTATE_SECTION_END = '// CONTOUR_01A_REVIEW_MUTATE_PORT_END';
const INTAKE_SECTION_START = '// DOCX_INTAKE_GATE_COMMAND_SURFACE_START';
const INTAKE_SECTION_END = '// DOCX_INTAKE_GATE_COMMAND_SURFACE_END';
const ACTIVATION_SECTION_START = '// DOCX_REVIEW_PREVIEW_SESSION_COMMAND_SURFACE_START';
const ACTIVATION_SECTION_END = '// DOCX_REVIEW_PREVIEW_SESSION_COMMAND_SURFACE_END';
const LOCAL_ENTRY_SECTION_START = '// DOCX_REVIEW_PREVIEW_SESSION_LOCAL_FILE_COMMAND_SURFACE_START';
const LOCAL_ENTRY_SECTION_END = '// DOCX_REVIEW_PREVIEW_SESSION_LOCAL_FILE_COMMAND_SURFACE_END';

function readSource(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function extractMarkedSection(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker);
  assert.notEqual(start, -1, `missing marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing marker: ${endMarker}`);
  assert.ok(end > start, `marker order invalid: ${startMarker}`);
  return text.slice(start, end + endMarker.length);
}

function extractMenuCommandHandlersSection(text) {
  const startMarker = 'const MENU_COMMAND_HANDLERS = Object.freeze({';
  const endMarker = '\n\nfunction shouldFailHardOnMenuConfigError';
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing marker: ${endMarker}`);
  assert.ok(end > start, 'menu command handler markers must be ordered');
  return text.slice(start, end);
}

const MENU_HANDLER_COMPUTED_KEY_GLOBALS = Object.freeze({
  EXPORT_CURRENT_SCENE_TXT_COMMAND_ID: 'cmd.project.exportCurrentSceneTxtV1',
  EXPORT_SELECTED_SCENES_TXT_COMMAND_ID: 'cmd.project.exportSelectedScenesTxtV1',
  EXPORT_ALL_SCENES_TXT_COMMAND_ID: 'cmd.project.exportAllScenesTxtV1',
  EXPORT_PDF_COMMAND_ID: 'cmd.project.exportPdfV1',
  EXPORT_PROJECT_ARCHIVE_COMMAND_ID: 'cmd.project.exportFullArchiveV1',
  IMPORT_PROJECT_ARCHIVE_COMMAND_ID: 'cmd.project.importFullArchiveV1',
  TXT_IMPORT_LOCAL_FILE_PREVIEW_COMMAND_ID: 'cmd.project.txt.previewLocalFile',
  TXT_IMPORT_SAFE_CREATE_COMMAND_ID: 'cmd.project.txt.importSafeCreate',
  TREE_MOVE_COMMAND_ID: 'cmd.project.tree.moveNode',
  METADATA_UPDATE_COMMAND_ID: 'cmd.project.metadata.update',
  NOTES_CREATE_COMMAND_ID: 'cmd.project.notes.create',
  NOTES_UPDATE_COMMAND_ID: 'cmd.project.notes.update',
  NOTES_DELETE_COMMAND_ID: 'cmd.project.notes.delete',
  NOTES_RESTORE_COMMAND_ID: 'cmd.project.notes.restore',
  NOTES_ATTACH_SCENE_COMMAND_ID: 'cmd.project.notes.attachToScene',
  NOTES_CONVERT_SCENE_COMMAND_ID: 'cmd.project.notes.convertToScene',
  REPLACE_SINGLE_SAFE_COMMAND_ID: 'cmd.project.edit.replaceSingleSafe',
  REPLACE_MASS_PREVIEW_COMMAND_ID: 'cmd.project.edit.replaceMassPreview',
  REPLACE_MASS_APPLY_COMMAND_ID: 'cmd.project.edit.replaceMassApply',
  REPLACE_MASS_ROLLBACK_COMMAND_ID: 'cmd.project.edit.replaceMassRollback',
  PROJECT_LIFECYCLE_CREATE_COMMAND_ID: 'cmd.project.lifecycle.create',
  PROJECT_LIFECYCLE_OPEN_COMMAND_ID: 'cmd.project.lifecycle.open',
  PROJECT_LIFECYCLE_CONTINUE_COMMAND_ID: 'cmd.project.lifecycle.continue',
  PROJECT_LIFECYCLE_RENAME_COMMAND_ID: 'cmd.project.lifecycle.rename',
  PROJECT_LIFECYCLE_DUPLICATE_COMMAND_ID: 'cmd.project.lifecycle.duplicate',
  PROJECT_LIFECYCLE_MOVE_LOCATION_COMMAND_ID: 'cmd.project.lifecycle.moveLocation',
  PROJECT_LIFECYCLE_ARCHIVE_COMMAND_ID: 'cmd.project.lifecycle.archive',
  PROJECT_LIFECYCLE_TRASH_COMMAND_ID: 'cmd.project.lifecycle.trash',
  PROJECT_LIFECYCLE_RESTORE_COMMAND_ID: 'cmd.project.lifecycle.restore',
  PROJECT_LIFECYCLE_BACKUP_COMMAND_ID: 'cmd.project.lifecycle.createBackup',
  PROJECT_LIFECYCLE_INTEGRITY_COMMAND_ID: 'cmd.project.lifecycle.inspectIntegrity',
  PROJECT_LIFECYCLE_PERMANENT_DELETE_COMMAND_ID: 'cmd.project.lifecycle.permanentDelete',
  HISTORY_CREATE_CHECKPOINT_COMMAND_ID: 'cmd.project.history.createCheckpoint',
  HISTORY_RESTORE_PREVIEW_COMMAND_ID: 'cmd.project.history.restorePreview',
  HISTORY_RESTORE_APPLY_COMMAND_ID: 'cmd.project.history.restoreApply',
  HISTORY_RESTORE_UNDO_COMMAND_ID: 'cmd.project.history.restoreUndo',
});

function cloneJsonSafe(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function isPlainObjectValue(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasReviewSurfacePayload(value) {
  return isPlainObjectValue(value) && Object.keys(value).length > 0;
}

function computeHash(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

async function loadBridge() {
  return import(pathToFileURL(BRIDGE_MODULE_PATH).href);
}

function instantiateDocxReviewLocalFileEntryPort(options = {}) {
  const mainSource = readSource(MAIN_PATH);
  const mutateSection = extractMarkedSection(mainSource, MUTATE_SECTION_START, MUTATE_SECTION_END);
  const intakeSection = extractMarkedSection(mainSource, INTAKE_SECTION_START, INTAKE_SECTION_END);
  const activationSection = extractMarkedSection(mainSource, ACTIVATION_SECTION_START, ACTIVATION_SECTION_END);
  const localEntrySection = extractMarkedSection(mainSource, LOCAL_ENTRY_SECTION_START, LOCAL_ENTRY_SECTION_END);
  const menuCommandHandlersSection = extractMenuCommandHandlersSection(mainSource);
  const selectedPath = typeof options.selectedPath === 'string' && options.selectedPath
    ? options.selectedPath
    : '/tmp/Review.docx';
  const currentScenePath = '/project/roman/imported/scene-1.txt';
  const bytes = Buffer.from(options.bytes || docxWithAnchoredComment());
  const statSizes = Array.isArray(options.statSizes) ? [...options.statSizes] : null;
  const calls = {
    showOpenDialog: [],
    stat: [],
    readFile: [],
  };
  const runtimeCommands = [];
  const sandbox = {
    activeDocxActivationRequestDigestGuard: createDocxActivationRequestDigestGuard({ maxEntries: 128 }),
    activeReviewSessionStore: null,
    activeReviewSessionLifecycle: 'passive',
    autoSaveInProgress: false,
    currentFilePath: currentScenePath,
    currentReviewSurfacePayload: {},
    currentReviewSurfacePayloadSource: 'none',
    currentReviewSurfacePayloadContentHash: '',
    isDirty: false,
    Buffer,
    ...MENU_HANDLER_COMPUTED_KEY_GLOBALS,
    calls,
    cloneJsonSafe,
    computeHash,
    crypto,
    dialog: {
      showOpenDialog: async (...args) => {
        calls.showOpenDialog.push(cloneJsonSafe(args));
        if (typeof options.showOpenDialog === 'function') {
          return options.showOpenDialog(...args);
        }
        if (Object.prototype.hasOwnProperty.call(options, 'dialogResult')) {
          return options.dialogResult;
        }
        return { canceled: false, filePaths: [selectedPath] };
      },
    },
    fileManager: {
      getDocumentsPath: () => '/tmp',
    },
    fs: {
      stat: async (filePath) => {
        calls.stat.push(filePath);
        if (typeof options.stat === 'function') return options.stat(filePath);
        const size = statSizes && statSizes.length > 0 ? statSizes.shift() : bytes.length;
        return {
          size,
          isFile: () => options.isFile !== false,
        };
      },
      readFile: async (filePath, encoding) => {
        calls.readFile.push({ filePath, encoding });
        if (typeof options.readFile === 'function') return options.readFile(filePath, encoding);
        if (filePath === currentScenePath) return 'Anchored text';
        return bytes;
      },
    },
    getProjectRootPath: () => '/project',
    getDocumentContextFromPath: options.getDocumentContextFromPath || (() => ({ kind: 'scene' })),
    getProjectRelativeFilePath: options.getProjectRelativeFilePath || (() => 'roman/imported/scene-1.txt'),
    hasReviewSurfacePayload,
    isAllowedFilePath: options.isAllowedFilePath || (() => true),
    isPlainObjectValue,
    loadRevisionBridgeModule: typeof options.loadRevisionBridgeModule === 'function'
      ? options.loadRevisionBridgeModule
      : loadBridge,
    dispatchCommandSurfaceKernel: typeof options.dispatchCommandSurfaceKernel === 'function'
      ? options.dispatchCommandSurfaceKernel
      : async () => ({ ok: false, error: { code: 'E_TEST_COMMAND_HANDLER_MISSING', reason: 'TEST_COMMAND_HANDLER_MISSING' } }),
    mainWindow: options.mainWindow || {},
    module: { exports: {} },
    exports: {},
    path,
    readExternalFileBounded: async (filePath, readOptions = {}) => {
      const before = await sandbox.fs.stat(filePath);
      const beforeSize = Number(before?.size);
      if (!before || typeof before.isFile !== 'function' || !before.isFile()) {
        const error = new Error('EXTERNAL_SOURCE_FILE_REQUIRED');
        error.code = 'E_EXTERNAL_FILE_AUTHORITY';
        error.reason = 'EXTERNAL_SOURCE_FILE_REQUIRED';
        throw error;
      }
      if (Number.isInteger(readOptions.maxBytes) && beforeSize > readOptions.maxBytes) {
        const error = new Error('EXTERNAL_SOURCE_TOO_LARGE');
        error.code = 'E_EXTERNAL_FILE_AUTHORITY';
        error.reason = 'EXTERNAL_SOURCE_TOO_LARGE';
        throw error;
      }
      if (beforeSize === 0) {
        const error = new Error('EXTERNAL_SOURCE_EMPTY');
        error.code = 'E_EXTERNAL_FILE_AUTHORITY';
        error.reason = 'EXTERNAL_SOURCE_EMPTY';
        throw error;
      }
      if (Number.isInteger(readOptions.expectedBytes) && beforeSize !== readOptions.expectedBytes) {
        const error = new Error('EXTERNAL_SOURCE_CHANGED_DURING_READ');
        error.code = 'E_EXTERNAL_FILE_AUTHORITY';
        error.reason = 'EXTERNAL_SOURCE_CHANGED_DURING_READ';
        throw error;
      }
      const loaded = await sandbox.fs.readFile(filePath);
      const bytesRead = Buffer.isBuffer(loaded) ? loaded.length : Buffer.byteLength(String(loaded || ''));
      const after = await sandbox.fs.stat(filePath);
      if (Number(after?.size) !== beforeSize || bytesRead !== beforeSize) {
        const error = new Error('EXTERNAL_SOURCE_CHANGED_DURING_READ');
        error.code = 'E_EXTERNAL_FILE_AUTHORITY';
        error.reason = 'EXTERNAL_SOURCE_CHANGED_DURING_READ';
        throw error;
      }
      return { bytes: Buffer.from(loaded), byteLength: bytesRead };
    },
    readReviewExactTextApplyProjectBinding: options.readReviewExactTextApplyProjectBinding || (async () => ({
      ok: true,
      projectId: 'project-1',
      manifestPath: '/project/manifest.json',
      projectRoot: '/project',
    })),
    runtimeCommands,
    sendCanonicalRuntimeCommand(commandId, payload = {}, legacyCommand = '') {
      runtimeCommands.push({ commandId, payload, legacyCommand });
      return true;
    },
  };

  vm.runInNewContext(
    `${mutateSection}
${intakeSection}
${activationSection}
${localEntrySection}
const MENU_PRESENTATION_COMMAND_CLASSIC = 'cmd.menu.presentation.classic';
const MENU_PRESENTATION_COMMAND_COMPACT = 'cmd.menu.presentation.compact';
const MENU_LOCALE_COMMAND_BASE = 'cmd.menu.locale.base';
const MENU_LOCALE_COMMAND_RU = 'cmd.menu.locale.ru';
const MENU_LOCALE_COMMAND_EN = 'cmd.menu.locale.en';
const MENU_CUSTOMIZATION_COMMAND_RESET = 'cmd.menu.customization.reset';
const MENU_CUSTOMIZATION_COMMAND_TOGGLE_VISIBILITY = 'cmd.menu.customization.toggleVisibility';
const MENU_CUSTOMIZATION_COMMAND_MOVE_EARLIER = 'cmd.menu.customization.moveEarlier';
const MENU_CUSTOMIZATION_COMMAND_MOVE_LATER = 'cmd.menu.customization.moveLater';
const __testHandleDocxReviewPreviewSessionLocalFileCommandSurface = handleDocxReviewPreviewSessionLocalFileCommandSurface;
handleDocxReviewPreviewSessionLocalFileCommandSurface = async (payload = {}, testOptions = {}) => {
  return __testHandleDocxReviewPreviewSessionLocalFileCommandSurface(payload, {
    allowInlineDocxReturnIntakeParserForTests: true,
    ...testOptions,
  });
};
${menuCommandHandlersSection}
module.exports = {
  calls,
  DOCX_REVIEW_PREVIEW_SESSION_LOCAL_FILE_COMMAND_ID,
  MENU_COMMAND_HANDLERS,
  runtimeCommands,
  handleDocxReviewPreviewSessionLocalFileCommandSurface,
  getState() {
    return {
      activeReviewSessionLifecycle,
      currentReviewSurfacePayload,
      currentReviewSurfacePayloadSource,
      currentReviewSurfacePayloadContentHash,
    };
  },
};`,
    sandbox,
    { filename: MAIN_PATH },
  );
  return sandbox.module.exports;
}

function asciiBytes(value) {
  return Buffer.from(value, 'ascii');
}

function utf8Bytes(value) {
  return Buffer.from(value, 'utf8');
}

function normalizeEntry(entry) {
  const body = Buffer.isBuffer(entry.body)
    ? entry.body
    : utf8Bytes(typeof entry.body === 'string' ? entry.body : '');
  const method = entry.method ?? 0;
  const compressedBody = method === 8 ? deflateRawSync(body) : body;
  return {
    name: entry.name,
    method,
    body,
    compressedBody,
    byteSize: entry.byteSize ?? body.length,
    compressedSize: entry.compressedSize ?? compressedBody.length,
  };
}

// CRC32 (table-based, IEEE polynomial) — ZIP CRC is computed over the
// UNCOMPRESSED body, so we crc32 over normalized.body for every entry
// regardless of storage method. Copied from the ZIP-01 evidence table-impl.
const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function crc32Bytes(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function localRecord(entry, offset) {
  const normalized = normalizeEntry(entry);
  const name = asciiBytes(normalized.name);
  const header = Buffer.alloc(30 + name.length);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(entry.flags ?? 0, 6);
  header.writeUInt16LE(normalized.method, 8);
  header.writeUInt32LE(crc32Bytes(normalized.body), 14);
  header.writeUInt32LE(normalized.compressedSize, 18);
  header.writeUInt32LE(normalized.byteSize, 22);
  header.writeUInt16LE(name.length, 26);
  name.copy(header, 30);
  return {
    ...normalized,
    offset,
    bytes: Buffer.concat([header, normalized.compressedBody]),
  };
}

function centralRecord(entry) {
  const name = asciiBytes(entry.name);
  const header = Buffer.alloc(46 + name.length);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(entry.flags ?? 0, 8);
  header.writeUInt16LE(entry.method, 10);
  header.writeUInt32LE(crc32Bytes(entry.body), 16);
  header.writeUInt32LE(entry.compressedSize, 20);
  header.writeUInt32LE(entry.byteSize, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt32LE(entry.offset, 42);
  name.copy(header, 46);
  return header;
}

function zipFixture(entries) {
  const locals = [];
  let offset = 0;
  for (const entry of entries) {
    const local = localRecord(entry, offset);
    locals.push(local);
    offset += local.bytes.length;
  }
  const central = Buffer.concat(locals.map((entry) => centralRecord(entry)));
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(locals.length, 8);
  end.writeUInt16LE(locals.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([Buffer.concat(locals.map((entry) => entry.bytes)), central, end]);
}

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function documentXml(body) {
  return `<w:document xmlns:w="${W_NS}"><w:body>${body}</w:body></w:document>`;
}

function paragraphXml(text) {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function cleanDocxZip(body = '<w:p/>', extraEntries = []) {
  return zipFixture([
    {
      name: 'word/document.xml',
      method: 8,
      body: documentXml(body),
    },
    ...extraEntries,
  ]);
}

function docxWithAnchoredComment(extraBody = '') {
  return cleanDocxZip([
    '<w:p>',
    '<w:commentRangeStart w:id="0"/>',
    '<w:r><w:t>Anchored text</w:t></w:r>',
    '<w:commentRangeEnd w:id="0"/>',
    '<w:r><w:commentReference w:id="0"/></w:r>',
    '</w:p>',
    extraBody,
  ].join(''), [
    {
      name: 'word/comments.xml',
      method: 8,
      body: [
        `<w:comments xmlns:w="${W_NS}">`,
        '<w:comment w:id="0" w:author="reviewer" w:date="2026-04-24T08:00:00.000Z">',
        '<w:p><w:r><w:t>Resolve this comment.</w:t></w:r></w:p>',
        '</w:comment>',
        '</w:comments>',
      ].join(''),
    },
  ]);
}

function collectKeys(value, pathParts = []) {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectKeys(item, pathParts.concat(String(index))));
  }
  if (!value || typeof value !== 'object') return [];
  return Object.keys(value).flatMap((key) => (
    [pathParts.concat(key).join('.')].concat(collectKeys(value[key], pathParts.concat(key)))
  ));
}

function assertNoPrivateLocalFileFields(value, selectedPath = '/tmp/Review.docx') {
  const json = JSON.stringify(value);
  assert.equal(json.includes(selectedPath), false, 'selected path leaked');
  const keys = collectKeys(value);
  for (const forbidden of [
    'path',
    'filePath',
    'projectRoot',
    'rawBytes',
    'bufferSource',
    'receipt',
    'recovery',
    'writeReceipt',
    'importReceipt',
    'exportReceipt',
  ]) {
    assert.equal(
      keys.some((key) => key === forbidden || key.endsWith(`.${forbidden}`)),
      false,
      forbidden,
    );
  }
}

test('DOCX review local-file entry: command is bridge-allowlisted and menu-owned', () => {
  const source = readSource(MAIN_PATH);
  const menuConfig = JSON.parse(readSource(MENU_CONFIG_PATH));
  const menuLocale = JSON.parse(readSource(MENU_LOCALE_PATH));
  const reviewMenu = menuConfig.menus.find((section) => section.id === 'review');

  assert.match(
    source,
    /UI_COMMAND_BRIDGE_ALLOWED_COMMAND_IDS\s*=\s*new Set\(\[[\s\S]*'cmd\.project\.review\.openDocxReviewPreviewSession'/,
  );
  assert.match(
    source,
    /'cmd\.project\.review\.openDocxReviewPreviewSession':\s*async\s*\(payload\s*=\s*\{\}\)\s*=>\s*\{[\s\S]*handleDocxReviewPreviewSessionLocalFileCommandSurface\(payload\)/,
  );
  assert.match(
    source,
    /'cmd\.project\.review\.openDocxReviewPreviewSession':\s*async\s*\(payload\s*=\s*\{\}\)\s*=>\s*\{[\s\S]*sendCanonicalRuntimeCommand\(\s*'cmd\.project\.review\.openComments',\s*\{\s*source:\s*'review-docx-local-file-preview-session',\s*requestId:\s*result\.requestId\s*\}/,
  );
  assert.deepEqual(
    reviewMenu.items.find((item) => item.id === 'review-open-docx-review-preview-session'),
    {
      id: 'review-open-docx-review-preview-session',
      label: 'Open DOCX Review (Comments; tracked text candidates are manual-only)...',
      labelKey: 'menu.review.openDocxReviewPreviewSession',
      command: 'cmd.project.review.openDocxReviewPreviewSession',
    },
  );
  assert.equal(
    menuLocale.entries['menu.review.openDocxReviewPreviewSession'].en,
    'Open DOCX Review (Comments; tracked text candidates are manual-only)...',
  );
});

test('DOCX review local-file entry: selected DOCX comments activate an in-memory Review session', async () => {
  const bytes = docxWithAnchoredComment();
  const port = instantiateDocxReviewLocalFileEntryPort({ bytes });
  const result = await port.handleDocxReviewPreviewSessionLocalFileCommandSurface({
    requestId: 'local-docx-review-1',
  });

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.commandId, 'cmd.project.review.openDocxReviewPreviewSession');
  assert.equal(result.requestId, 'local-docx-review-1');
  assert.equal(result.activated, true);
  assert.equal(result.fileName, 'Review.docx');
  assert.equal(result.byteLength, bytes.length);
  assert.equal(result.canOpenReviewSession, true);
  assert.equal(result.canAutoApply, false);
  assert.equal(result.canImportMutate, false);
  assert.equal(result.canWriteStorage, false);
  const reviewGraph = result.reviewSurface.revisionSession.reviewGraph;
  assert.equal(reviewGraph.commentThreads.length, 1);
  assert.equal(
    reviewGraph.commentThreads[0].messages[0].body,
    'Resolve this comment.',
  );
  assert.equal(reviewGraph.commentPlacements.length, 1);
  assert.equal(reviewGraph.commentPlacements[0].policy, 'manual');
  assert.equal(reviewGraph.commentPlacements[0].quote, 'Anchored text');
  assert.deepEqual(reviewGraph.textChanges, []);
  assert.deepEqual(reviewGraph.structuralChanges, []);
  assert.equal(result.reviewSurface.blockedApplyPlan.canApply, false);
  assert.deepEqual(result.reviewSurface.blockedApplyPlan.applyOps, []);
  assert.equal(port.calls.showOpenDialog.length, 1);
  assert.equal(port.calls.stat.length, 3);
  assert.equal(port.calls.readFile.length, 2);
  assert.equal(port.getState().activeReviewSessionLifecycle, 'active');
  assert.equal(
    port.getState().currentReviewSurfacePayload.revisionSession.reviewGraph.commentThreads[0].messages[0].body,
    'Resolve this comment.',
  );
  assertNoPrivateLocalFileFields(result);
});

test('DOCX review local-file entry: menu handler opens comments on successful activation', async () => {
  const port = instantiateDocxReviewLocalFileEntryPort();
  const result = await port.MENU_COMMAND_HANDLERS['cmd.project.review.openDocxReviewPreviewSession']({
    requestId: 'menu-docx-review',
  });

  assert.equal(result.ok, true);
  assert.equal(result.activated, true);
  assert.deepEqual(cloneJsonSafe(port.runtimeCommands), [
    {
      commandId: 'cmd.project.review.openComments',
      payload: {
        source: 'review-docx-local-file-preview-session',
        requestId: 'menu-docx-review',
      },
      legacyCommand: 'review-comment',
    },
  ]);
});

test('DOCX review local-file entry: cancel and renderer authority injection fail closed before read', async () => {
  const cancelled = instantiateDocxReviewLocalFileEntryPort({
    dialogResult: { canceled: true, filePaths: [] },
  });
  const cancelledResult = await cancelled.handleDocxReviewPreviewSessionLocalFileCommandSurface({});
  assert.equal(cancelledResult.ok, true);
  assert.equal(cancelledResult.activated, false);
  assert.equal(cancelledResult.cancelled, true);
  assert.equal(cancelled.calls.readFile.length, 0);
  assert.equal(cancelled.getState().activeReviewSessionLifecycle, 'passive');

  const injectedPath = '/tmp/Injected.docx';
  const injected = instantiateDocxReviewLocalFileEntryPort({ selectedPath: injectedPath });
  const injectedResult = await injected.handleDocxReviewPreviewSessionLocalFileCommandSurface({
    requestId: 'renderer-injection',
    path: injectedPath,
    filePath: injectedPath,
    bufferSource: 'ignored',
    reviewPacket: { leak: true },
    projectRoot: '/project',
    receipt: { leak: true },
  });
  assert.equal(injectedResult.ok, false);
  assert.equal(injectedResult.error.op, 'cmd.project.review.openDocxReviewPreviewSession');
  assert.equal(injectedResult.error.reason, 'DOCX_REVIEW_PREVIEW_SESSION_LOCAL_FILE_PAYLOAD_UNSUPPORTED_FIELDS');
  assert.equal(injectedResult.error.details.fieldCount, 6);
  assert.equal(injected.calls.showOpenDialog.length, 0);
  assert.equal(injected.calls.readFile.length, 0);
  assertNoPrivateLocalFileFields(injectedResult, injectedPath);
});

test('DOCX review local-file entry: extension, size, read, empty, and changed-file gates fail closed', async () => {
  const unsupported = instantiateDocxReviewLocalFileEntryPort({
    selectedPath: '/tmp/NotDocx.txt',
  });
  const unsupportedResult = await unsupported.handleDocxReviewPreviewSessionLocalFileCommandSurface({});
  assert.equal(unsupportedResult.ok, false);
  assert.equal(unsupportedResult.error.reason, 'DOCX_REVIEW_PREVIEW_SESSION_LOCAL_FILE_DOCX_REQUIRED');
  assert.equal(unsupported.calls.readFile.length, 0);

  const oversizedHint = instantiateDocxReviewLocalFileEntryPort({
    statSizes: [10 * 1024 * 1024 + 1],
  });
  const oversizedHintResult = await oversizedHint.handleDocxReviewPreviewSessionLocalFileCommandSurface({});
  assert.equal(oversizedHintResult.ok, false);
  assert.equal(oversizedHintResult.error.reason, 'DOCX_REVIEW_PREVIEW_SESSION_LOCAL_FILE_TOO_LARGE');
  assert.equal(oversizedHint.calls.readFile.length, 0);

  const readFailure = instantiateDocxReviewLocalFileEntryPort({
    readFile: async () => {
      throw new Error('read failed');
    },
  });
  const readFailureResult = await readFailure.handleDocxReviewPreviewSessionLocalFileCommandSurface({});
  assert.equal(readFailureResult.ok, false);
  assert.equal(readFailureResult.error.reason, 'DOCX_REVIEW_PREVIEW_SESSION_LOCAL_FILE_READ_FAILED');

  const empty = instantiateDocxReviewLocalFileEntryPort({
    bytes: Buffer.alloc(0),
  });
  const emptyResult = await empty.handleDocxReviewPreviewSessionLocalFileCommandSurface({});
  assert.equal(emptyResult.ok, false);
  assert.equal(emptyResult.error.reason, 'EXTERNAL_SOURCE_EMPTY');

  const changedBytes = docxWithAnchoredComment();
  const changed = instantiateDocxReviewLocalFileEntryPort({
    bytes: changedBytes,
    statSizes: [changedBytes.length, changedBytes.length, changedBytes.length + 1],
  });
  const changedResult = await changed.handleDocxReviewPreviewSessionLocalFileCommandSurface({});
  assert.equal(changedResult.ok, false);
  assert.equal(changedResult.error.reason, 'EXTERNAL_SOURCE_CHANGED_DURING_READ');
  assert.equal(changed.getState().activeReviewSessionLifecycle, 'passive');

  for (const result of [unsupportedResult, oversizedHintResult, readFailureResult, emptyResult, changedResult]) {
    assertNoPrivateLocalFileFields(result);
  }
});

test('DOCX review local-file entry: clean DOCX leaves session passive with no candidate', async () => {
  const port = instantiateDocxReviewLocalFileEntryPort({
    bytes: cleanDocxZip(paragraphXml('Clean')),
  });
  const result = await port.handleDocxReviewPreviewSessionLocalFileCommandSurface({
    requestId: 'clean-local-docx-review',
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.op, 'cmd.project.review.openDocxReviewPreviewSession');
  assert.equal(result.error.code, 'E_DOCX_REVIEW_PREVIEW_SESSION_NO_CANDIDATE');
  assert.equal(result.error.details.candidateSummary.commentThreadCount, 0);
  assert.equal(port.getState().activeReviewSessionLifecycle, 'passive');
  assertNoPrivateLocalFileFields(result);
});

test('DOCX review local-file entry: complex tracked changes open manual structural review', async () => {
  const bytes = cleanDocxZip([
    paragraphXml('Before'),
    '<w:ins><w:p><w:r><w:t>Inserted</w:t></w:r></w:p></w:ins>',
  ].join(''));
  const port = instantiateDocxReviewLocalFileEntryPort({ bytes });
  const result = await port.MENU_COMMAND_HANDLERS['cmd.project.review.openDocxReviewPreviewSession']({
    requestId: 'tracked-local-docx-review',
  });

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.commandId, 'cmd.project.review.openDocxReviewPreviewSession');
  assert.equal(result.requestId, 'tracked-local-docx-review');
  assert.equal(result.activated, true);
  assert.equal(result.diagnosticOnly, false);
  assert.equal(result.canOpenReviewSession, true);
  assert.equal(result.canCreateReviewPacket, true);
  assert.equal(result.canAutoApply, false);
  assert.equal(result.canImportMutate, false);
  assert.equal(result.canWriteStorage, false);
  const reviewGraph = result.reviewSurface.revisionSession.reviewGraph;
  assert.deepEqual(reviewGraph.commentThreads, []);
  assert.deepEqual(reviewGraph.commentPlacements, []);
  assert.deepEqual(reviewGraph.textChanges, []);
  assert.equal(reviewGraph.structuralChanges.length, 1);
  assert.equal(reviewGraph.structuralChanges[0].manualOnly, true);
  assert.equal(reviewGraph.diagnosticItems.length, 2);
  assert.equal(reviewGraph.diagnosticItems[0].diagnosticId, 'docx-review-tracked-insertCount');
  assert.equal(result.reviewSurface.blockedApplyPlan.canApply, false);
  assert.deepEqual(result.reviewSurface.blockedApplyPlan.applyOps, []);
  assert.deepEqual(cloneJsonSafe(port.runtimeCommands), [
    {
      commandId: 'cmd.project.review.openComments',
      payload: {
        source: 'review-docx-local-file-preview-session',
        requestId: 'tracked-local-docx-review',
      },
      legacyCommand: 'review-comment',
    },
  ]);
  assert.equal(port.getState().activeReviewSessionLifecycle, 'active');
  assertNoPrivateLocalFileFields(result);
});

test('DOCX review local-file entry: source stays separate from import safe-create and disk writes', () => {
  const source = extractMarkedSection(readSource(MAIN_PATH), LOCAL_ENTRY_SECTION_START, LOCAL_ENTRY_SECTION_END);
  for (const forbidden of [
    'createDocxImportLocalFilePreview',
    'handleDocxImportLocalFilePreviewCommandSurface',
    'applyDocxImportSafeCreate',
    'handleDocxImportSafeCreateCommandSurface',
    'writeFileAtomic',
    'queueDiskOperation',
    'writeBufferAtomic',
    'receipt:',
    'recovery:',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.equal(source.includes('handleDocxReviewPreviewSessionActivationCommandSurface'), true);
  assert.equal(source.includes('dialog.showOpenDialog'), true);
});
