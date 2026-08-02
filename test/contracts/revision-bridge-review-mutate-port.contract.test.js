const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const {
  readExternalFileBounded: readExternalFileBoundedActual,
  validateExternalWriteTarget,
} = require('../../src/utils/externalFileAuthority');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MAIN_PATH = path.join(REPO_ROOT, 'src', 'main.js');
const BRIDGE_MODULE_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'index.mjs');
const EXACT_SAFE_WRITE_MODULE_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'exactTextMinSafeWrite.mjs');
const SECTION_START = '// CONTOUR_01A_REVIEW_MUTATE_PORT_START';
const SECTION_END = '// CONTOUR_01A_REVIEW_MUTATE_PORT_END';
const LOCAL_PACKET_SECTION_START = '// REVIEW_LOCAL_PACKET_COMMAND_SURFACE_START';
const LOCAL_PACKET_SECTION_END = '// REVIEW_LOCAL_PACKET_COMMAND_SURFACE_END';

function readMainSource() {
  return fs.readFileSync(MAIN_PATH, 'utf8');
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

function extractUiCommandBridgeAllowedCommandIdsSection(text) {
  const startMarker = 'const UI_COMMAND_BRIDGE_ALLOWED_COMMAND_IDS = new Set([';
  const endMarker = 'const WORKSPACE_QUERY_BRIDGE_ALLOWED_QUERY_IDS = new Set(WORKSPACE_QUERY_ID_LIST);';
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing marker: ${endMarker}`);
  assert.ok(end > start, 'ui command bridge markers must be ordered');
  return text.slice(start, end);
}

const MENU_HANDLER_COMPUTED_KEY_GLOBALS = Object.freeze({
  EXPORT_CURRENT_SCENE_TXT_COMMAND_ID: 'cmd.project.exportCurrentSceneTxtV1',
  EXPORT_SELECTED_SCENES_TXT_COMMAND_ID: 'cmd.project.exportSelectedScenesTxtV1',
  EXPORT_ALL_SCENES_TXT_COMMAND_ID: 'cmd.project.exportAllScenesTxtV1',
  EXPORT_PDF_COMMAND_ID: 'cmd.project.exportPdfV1',
  EXPORT_PROJECT_ARCHIVE_COMMAND_ID: 'cmd.project.exportFullArchiveV1',
  IMPORT_PROJECT_ARCHIVE_COMMAND_ID: 'cmd.project.importFullArchiveV1',
  FULL_MANUSCRIPT_REVIEW_DOCX_COMMAND_ID: 'cmd.project.review.exportFullManuscriptDocxReviewPacket',
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
  MENU_CUSTOMIZATION_COMMAND_RESET: 'cmd.project.view.resetMenuCustomization',
  MENU_CUSTOMIZATION_COMMAND_TOGGLE_VISIBILITY: 'cmd.project.view.toggleMenuSectionVisibility',
  MENU_CUSTOMIZATION_COMMAND_MOVE_EARLIER: 'cmd.project.view.moveMenuSectionEarlier',
  MENU_CUSTOMIZATION_COMMAND_MOVE_LATER: 'cmd.project.view.moveMenuSectionLater',
  MENU_PRESENTATION_COMMAND_CLASSIC: 'cmd.project.view.setMenuPresentationClassic',
  MENU_PRESENTATION_COMMAND_COMPACT: 'cmd.project.view.setMenuPresentationCompact',
  MENU_LOCALE_COMMAND_BASE: 'cmd.project.view.setMenuLocaleBase',
  MENU_LOCALE_COMMAND_RU: 'cmd.project.view.setMenuLocaleRu',
  MENU_LOCALE_COMMAND_EN: 'cmd.project.view.setMenuLocaleEn',
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

async function loadExactSafeWrite() {
  return import(pathToFileURL(EXACT_SAFE_WRITE_MODULE_PATH).href);
}

function tmpScene(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-review-mutate-port-'));
  const scenePath = path.join(dir, 'scene.txt');
  fs.writeFileSync(scenePath, text, 'utf8');
  return { dir, scenePath };
}

function tmpLocalPacket(payload) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-review-local-packet-'));
  const packetPath = path.join(dir, 'review-packet.json');
  const text = JSON.stringify(payload);
  fs.writeFileSync(packetPath, text, 'utf8');
  return {
    dir,
    packetPath,
    name: path.basename(packetPath),
    size: Buffer.byteLength(text, 'utf8'),
  };
}

async function importLocalPacketFromPath(port, packet, requestId = 'local-packet-e2e-request', options = {}) {
  return port.handleReviewSurfaceImportLocalPacketCommandSurface(
    { requestId },
    {
      ...options,
      pickLocalFile: async () => ({
        path: packet.packetPath,
        name: packet.name,
        size: packet.size,
      }),
    },
  );
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function validThread(body = 'Tighten this sentence.') {
  return {
    threadId: 'thread-1',
    authorId: 'editor-1',
    status: 'open',
    createdAt: '2026-04-24T08:00:00.000Z',
    updatedAt: '2026-04-24T08:30:00.000Z',
    tags: ['clarity'],
    messages: [
      {
        messageId: 'message-1',
        authorId: 'editor-1',
        body,
        createdAt: '2026-04-24T08:00:00.000Z',
      },
    ],
  };
}

function validPlacement() {
  return {
    placementId: 'placement-1',
    threadId: 'thread-1',
    targetScope: {
      type: 'scene',
      id: 'scene-1',
    },
    anchor: {
      kind: 'text',
      value: 'anchor-1',
    },
    range: {
      from: 10,
      to: 24,
    },
    quote: 'original sentence',
    prefix: 'before',
    suffix: 'after',
    confidence: 1,
    policy: 'exact',
    selector: {
      type: 'text-position',
      start: 10,
      end: 24,
    },
    createdAt: '2026-04-24T08:01:00.000Z',
  };
}

function validTextChange() {
  return {
    changeId: 'text-change-1',
    targetScope: {
      type: 'scene',
      id: 'scene-1',
    },
    match: {
      kind: 'exact',
      quote: 'original sentence',
      prefix: 'before',
      suffix: 'after',
    },
    replacementText: 'revised sentence',
    createdAt: '2026-04-24T08:02:00.000Z',
  };
}

function validStructuralChange() {
  return {
    structuralChangeId: 'structural-change-1',
    kind: 'split-scene',
    targetScope: {
      type: 'scene',
      id: 'scene-1',
    },
    summary: 'Consider splitting the scene.',
    createdAt: '2026-04-24T08:03:00.000Z',
  };
}

function validDiagnosticItem() {
  return {
    diagnosticId: 'diagnostic-1',
    severity: 'warning',
    message: 'Manual review required.',
    targetScope: {
      type: 'scene',
      id: 'scene-1',
    },
    relatedItemId: 'structural-change-1',
    createdAt: '2026-04-24T08:04:00.000Z',
  };
}

function validExactApplyRevisionSession({
  projectId = 'project-1',
  sessionId = 'session-1',
  baselineHash = 'baseline-1',
  sceneId = 'scene-1',
  quote = 'beta',
  replacementText = 'delta',
  textChanges,
  structuralChanges = [],
  commentThreads = [],
  commentPlacements = [],
  status = 'open',
} = {}) {
  return {
    projectId,
    sessionId,
    baselineHash,
    status,
    reviewGraph: {
      commentThreads,
      commentPlacements,
      textChanges: textChanges || [
        {
          changeId: 'text-change-1',
          targetScope: {
            type: 'scene',
            id: sceneId,
          },
          match: {
            kind: 'exact',
            quote,
            prefix: '',
            suffix: '',
          },
          replacementText,
          createdAt: '2026-04-24T08:02:00.000Z',
        },
      ],
      structuralChanges,
      diagnosticItems: [],
      decisionStates: [],
    },
  };
}

async function buildReadyExactApplyInput({ scenePath, sceneText, revisionSession }) {
  const bridge = await loadBridge();
  const sceneId = revisionSession.reviewGraph.textChanges[0].targetScope.id;
  const projectSnapshot = {
    projectId: revisionSession.projectId,
    baselineHash: revisionSession.baselineHash,
    scenes: [
      {
        sceneId,
        text: sceneText,
      },
    ],
  };
  const reviewItem = revisionSession.reviewGraph.textChanges[0];
  const planPreview = bridge.buildExactTextApplyPlanNoDiskPreview({
    projectSnapshot,
    revisionSession,
    reviewItem,
  });
  assert.equal(planPreview.status, 'ready');
  return {
    projectRoot: path.dirname(scenePath),
    projectSnapshot,
    revisionSession,
    reviewItem,
    planPreview,
    scenePath,
    scenePathBySceneId: {
      [sceneId]: scenePath,
    },
  };
}

function buildBatchExactApplyInput({ scenePath, sceneText, revisionSession }) {
  const sceneId = revisionSession.reviewGraph.textChanges[0].targetScope.id;
  return {
    projectRoot: path.dirname(scenePath),
    projectSnapshot: {
      projectId: revisionSession.projectId,
      baselineHash: revisionSession.baselineHash,
      scenes: [
        {
          sceneId,
          text: sceneText,
        },
      ],
    },
    revisionSession,
    reviewItems: cloneJsonSafe(revisionSession.reviewGraph.textChanges),
    scenePath,
    scenePathBySceneId: {
      [sceneId]: scenePath,
    },
  };
}

function validDecisionState() {
  return {
    decisionId: 'decision-1',
    itemKind: 'textChange',
    itemId: 'text-change-1',
    status: 'accepted',
    decidedAt: '2026-04-24T08:05:00.000Z',
    reason: 'Editor approved manually.',
  };
}

function validReviewPacket(overrides = {}) {
  return {
    commentThreads: [validThread()],
    commentPlacements: [validPlacement()],
    textChanges: [validTextChange()],
    structuralChanges: [validStructuralChange()],
    diagnosticItems: [validDiagnosticItem()],
    decisionStates: [validDecisionState()],
    ...overrides,
  };
}

function validParsedSurface() {
  return {
    ...validReviewPacket(),
    unsupportedItems: [
      {
        unsupportedId: 'unsupported-1',
        severity: 'warning',
        message: 'Unsupported floating comment.',
        targetScope: {
          type: 'scene',
          id: 'scene-1',
        },
        relatedItemId: 'comment-9',
        createdAt: '2026-04-24T08:09:00.000Z',
      },
    ],
  };
}

function findForbiddenKeys(value, forbiddenKeys, pathSegments = []) {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenKeys(item, forbiddenKeys, pathSegments.concat(String(index))));
  }
  if (!value || typeof value !== 'object') return [];

  return Object.keys(value).flatMap((key) => {
    const keyPath = pathSegments.concat(key);
    const nested = findForbiddenKeys(value[key], forbiddenKeys, keyPath);
    return forbiddenKeys.includes(key) ? [keyPath.join('.'), ...nested] : nested;
  });
}

function instantiateReviewMutatePort(options = {}) {
  const mainSource = readMainSource();
  const section = extractMarkedSection(mainSource, SECTION_START, SECTION_END);
  const localPacketSection = extractMarkedSection(mainSource, LOCAL_PACKET_SECTION_START, LOCAL_PACKET_SECTION_END);
  const menuCommandHandlersSection = extractMenuCommandHandlersSection(mainSource);
  const sandbox = {
    activeReviewSessionStore: null,
    activeReviewSessionLifecycle: 'passive',
    currentReviewSurfacePayload: {},
    currentReviewSurfacePayloadSource: 'none',
    currentReviewSurfacePayloadContentHash: '',
    rememberReviewExactTextApplyReconciliation: (value) => cloneJsonSafe(value),
    attachReviewExactTextApplyReconciliationState: (value) => cloneJsonSafe(value || {}),
    Buffer,
    ...MENU_HANDLER_COMPUTED_KEY_GLOBALS,
    cloneJsonSafe,
    computeHash,
    dialog: options.dialog || {
      showOpenDialog: async () => ({ canceled: true }),
      showSaveDialog: async () => ({ canceled: true }),
    },
    fileManager: options.fileManager || {
      getDocumentsPath: () => os.tmpdir(),
      writeFileAtomic: async (filePath, content) => {
        fs.writeFileSync(filePath, content, 'utf8');
        return {
          success: true,
          bytesWritten: Buffer.byteLength(content, 'utf8'),
        };
      },
    },
    fs: options.fs || fs.promises,
    getProjectRootPath: () => (
      typeof options.projectRoot === 'string'
        ? options.projectRoot
        : path.join(os.tmpdir(), 'rb-review-mutate-project-root')
    ),
    hasReviewSurfacePayload,
    handleReviewSurfaceApplyFormattingReturnCommandSurface: async () => ({
      ok: false,
      status: 'blocked',
      reason: 'RTK_FORMATTING_RETURN_NOT_EXERCISED_BY_LEGACY_HARNESS',
    }),
    isPlainObjectValue,
    loadRevisionBridgeModule: typeof options.loadRevisionBridgeModule === 'function'
      ? options.loadRevisionBridgeModule
      : async () => {
          throw new Error('loadRevisionBridgeModule unavailable in test sandbox');
        },
    mainWindow: options.mainWindow || {},
    module: { exports: {} },
    exports: {},
    path,
    queueDiskOperation: typeof options.queueDiskOperation === 'function'
      ? options.queueDiskOperation
      : async (operation) => operation(),
    readExternalFileBounded: typeof options.readExternalFileBounded === 'function'
      ? options.readExternalFileBounded
      : options.fs
        ? async (filePath, readOptions = {}) => {
            const stat = await options.fs.stat(filePath);
            const size = Number(stat?.size);
            if (!stat || typeof stat.isFile !== 'function' || !stat.isFile()) {
              const error = new Error('EXTERNAL_SOURCE_FILE_REQUIRED');
              error.code = 'E_EXTERNAL_FILE_AUTHORITY';
              error.reason = 'EXTERNAL_SOURCE_FILE_REQUIRED';
              throw error;
            }
            if (Number.isInteger(readOptions.maxBytes) && size > readOptions.maxBytes) {
              const error = new Error('EXTERNAL_SOURCE_TOO_LARGE');
              error.code = 'E_EXTERNAL_FILE_AUTHORITY';
              error.reason = 'EXTERNAL_SOURCE_TOO_LARGE';
              error.details = { maxBytes: readOptions.maxBytes, actualBytes: size };
              throw error;
            }
            const bytes = await options.fs.readFile(filePath);
            return {
              bytes: Buffer.isBuffer(bytes) ? Buffer.from(bytes) : Buffer.from(String(bytes || '')),
            };
          }
        : readExternalFileBoundedActual,
    validateExternalWriteTarget,
  };
  vm.runInNewContext(
    `${section}
${localPacketSection}
const runtimeCommands = [];
function sendCanonicalRuntimeCommand(commandId, payload = {}, legacyCommand = '') {
  runtimeCommands.push({ commandId, payload, legacyCommand });
  return true;
}
const MENU_PRESENTATION_COMMAND_CLASSIC = 'cmd.menu.presentation.classic';
const MENU_PRESENTATION_COMMAND_COMPACT = 'cmd.menu.presentation.compact';
const MENU_LOCALE_COMMAND_BASE = 'cmd.menu.locale.base';
const MENU_LOCALE_COMMAND_RU = 'cmd.menu.locale.ru';
const MENU_LOCALE_COMMAND_EN = 'cmd.menu.locale.en';
const MENU_CUSTOMIZATION_COMMAND_RESET = 'cmd.menu.customization.reset';
const MENU_CUSTOMIZATION_COMMAND_TOGGLE_VISIBILITY = 'cmd.menu.customization.toggleVisibility';
const MENU_CUSTOMIZATION_COMMAND_MOVE_EARLIER = 'cmd.menu.customization.moveEarlier';
const MENU_CUSTOMIZATION_COMMAND_MOVE_LATER = 'cmd.menu.customization.moveLater';
${menuCommandHandlersSection}
module.exports = {
  MENU_COMMAND_HANDLERS,
  runtimeCommands,
  resetActiveReviewSessionStore,
  normalizeReviewSessionImportRecord,
  cloneActiveReviewSessionStore,
  readActiveReviewSessionReviewSurface,
  handleReviewSurfaceImportLocalPacketCommandSurface,
  handleReviewSurfaceExportLocalPacketCommandSurface,
  handleReviewSurfaceImportPacketCommandSurface,
  handleReviewSurfaceClearSessionCommandSurface,
  handleReviewSurfaceApplyExactTextChangeCommandSurface,
  handleReviewSurfaceApplyExactTextChangesBatchCommandSurface,
  handleReviewExactTextReloadReconciledSceneCommandSurface,
  getState() {
    return {
      activeReviewSessionStore,
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

function normalizeVmValue(value) {
  return cloneJsonSafe(value);
}

test('review mutate port contract: only public review bridge routes are exposed through ui command bridge and menu handlers', () => {
  const source = readMainSource();
  const uiCommandBridgeSection = extractUiCommandBridgeAllowedCommandIdsSection(source);
  const menuCommandHandlersSection = extractMenuCommandHandlersSection(source);

  assert.equal(uiCommandBridgeSection.includes("'cmd.project.review.importLocalPacket'"), true);
  assert.equal(uiCommandBridgeSection.includes("'cmd.project.review.exportLocalPacket'"), true);
  assert.equal(uiCommandBridgeSection.includes("'cmd.project.review.clearSession'"), true);
  assert.equal(uiCommandBridgeSection.includes("'cmd.project.review.applyExactTextChange'"), true);
  assert.equal(uiCommandBridgeSection.includes("'cmd.project.review.applyExactTextChangesBatch'"), true);
  assert.equal(uiCommandBridgeSection.includes("'cmd.project.review.importPacket'"), false);
  assert.match(
    menuCommandHandlersSection,
    /'cmd\.project\.review\.importLocalPacket':\s*async\s*\(payload\s*=\s*\{\}\)\s*=>\s*\{[\s\S]*handleReviewSurfaceImportLocalPacketCommandSurface\(payload\)/,
  );
  assert.match(
    menuCommandHandlersSection,
    /'cmd\.project\.review\.importLocalPacket':\s*async\s*\(payload\s*=\s*\{\}\)\s*=>\s*\{[\s\S]*sendCanonicalRuntimeCommand\(\s*'cmd\.project\.review\.openComments',\s*\{\s*source:\s*'review-import-local-packet',\s*requestId:\s*result\.requestId\s*\}/,
  );
  assert.match(
    menuCommandHandlersSection,
    /'cmd\.project\.review\.exportLocalPacket':\s*async\s*\(payload\s*=\s*\{\}\)\s*=>\s*\{\s*return handleReviewSurfaceExportLocalPacketCommandSurface\(payload\);/,
  );
  assert.equal(menuCommandHandlersSection.includes("'cmd.project.review.importPacket':"), false);
  assert.match(
    menuCommandHandlersSection,
    /'cmd\.project\.review\.clearSession':\s*async\s*\(\)\s*=>\s*\{[\s\S]*handleReviewSurfaceClearSessionCommandSurface\(\)/,
  );
  assert.match(
    menuCommandHandlersSection,
    /'cmd\.project\.review\.clearSession':\s*async\s*\(\)\s*=>\s*\{[\s\S]*sendCanonicalRuntimeCommand\(\s*'cmd\.project\.review\.openComments',\s*\{\s*source:\s*'review-clear-session'\s*\}/,
  );
  assert.match(
    menuCommandHandlersSection,
    /'cmd\.project\.review\.applyExactTextChange':\s*async\s*\(payload\s*=\s*\{\}\)\s*=>\s*\{\s*return handleReviewSurfaceApplyExactTextChangeCommandSurface\(payload\);/,
  );
  assert.match(
    menuCommandHandlersSection,
    /'cmd\.project\.review\.applyExactTextChangesBatch':\s*async\s*\(payload\s*=\s*\{\}\)\s*=>\s*\{\s*return handleReviewSurfaceApplyExactTextChangesBatchCommandSurface\(payload\);/,
  );
});

test('review mutate port contract: import stores canonical in-memory session shape', async () => {
  const port = instantiateReviewMutatePort();

  const payload = {
    projectId: 'project-1',
    sessionId: 'session-1',
    baselineHash: 'baseline-1',
    reviewSurface: {
      summary: { total: 1 },
      changes: [{ changeId: 'change-1' }],
    },
    revisionSession: {
      status: 'preview',
    },
    sourcePacketHash: 'packet-hash-1',
    createdAt: '2026-05-24T12:00:00.000Z',
  };

  const result = await port.handleReviewSurfaceImportPacketCommandSurface(payload);
  const state = port.getState();

  assert.equal(result.ok, true);
  assert.deepEqual(normalizeVmValue(result.reviewSurface), payload.reviewSurface);
  assert.deepEqual(normalizeVmValue(result.session), {
    projectId: 'project-1',
    sessionId: 'session-1',
    baselineHash: 'baseline-1',
    reviewSurface: payload.reviewSurface,
    revisionSession: { status: 'preview' },
    sourcePacketHash: 'packet-hash-1',
    createdAt: '2026-05-24T12:00:00.000Z',
  });
  assert.equal(state.activeReviewSessionLifecycle, 'active');
  assert.deepEqual(normalizeVmValue(state.activeReviewSessionStore), normalizeVmValue(result.session));
  assert.deepEqual(normalizeVmValue(state.currentReviewSurfacePayload), payload.reviewSurface);
  assert.equal(state.currentReviewSurfacePayloadSource, 'session');
  assert.equal(state.currentReviewSurfacePayloadContentHash, '');
  assert.deepEqual(normalizeVmValue(port.readActiveReviewSessionReviewSurface()), payload.reviewSurface);
});

test('review mutate port contract: local packet import reads main-owned json and activates review session', async () => {
  const port = instantiateReviewMutatePort({ loadRevisionBridgeModule: loadBridge });
  const payload = {
    packetVersion: 'review-packet.v1',
    projectId: 'project-1',
    sessionId: 'session-local-1',
    baselineHash: 'baseline-local-1',
    reviewPacket: validReviewPacket({
      commentThreads: [],
      commentPlacements: [],
      structuralChanges: [],
      diagnosticItems: [],
      decisionStates: [],
    }),
  };
  const text = JSON.stringify(payload);
  const calls = [];

  const result = await port.handleReviewSurfaceImportLocalPacketCommandSurface(
    { requestId: 'local-request-1' },
    {
      pickLocalFile: async (input) => {
        calls.push({ pick: input });
        return {
          path: path.join(os.tmpdir(), 'review-packet.json'),
          name: 'review-packet.json',
          size: Buffer.byteLength(text, 'utf8'),
        };
      },
      readLocalFileText: async (selection) => {
        calls.push({ read: selection });
        return text;
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.commandId, 'cmd.project.review.importLocalPacket');
  assert.equal(result.requestId, 'local-request-1');
  assert.equal(result.imported, true);
  assert.equal(result.packetVersion, 'review-packet.v1');
  assert.equal(result.legacyNormalized, false);
  assert.equal(result.fileName, 'review-packet.json');
  assert.equal(result.path, undefined);
  assert.equal(result.filePath, undefined);
  assert.equal(result.reviewSurface.revisionSession.sessionId, 'session-local-1');
  assert.equal(result.reviewSurface.revisionSession.reviewGraph.textChanges[0].changeId, 'text-change-1');
  assert.equal(result.reviewSurface.exactTextPlanPreview.status, 'blocked');
  assert.equal(
    result.reviewSurface.exactTextPlanPreview.reason,
    'REVIEW_EXACT_TEXT_APPLY_CONTEXT_UNAVAILABLE',
  );
  assert.equal(port.getState().activeReviewSessionLifecycle, 'active');
  assert.deepEqual(
    normalizeVmValue(port.readActiveReviewSessionReviewSurface()),
    normalizeVmValue(result.reviewSurface),
  );
  assert.deepEqual(normalizeVmValue(calls), [
    { pick: { requestId: 'local-request-1' } },
    {
      read: {
        path: path.join(os.tmpdir(), 'review-packet.json'),
        name: 'review-packet.json',
        size: Buffer.byteLength(text, 'utf8'),
        requestId: 'local-request-1',
      },
    },
  ]);
});

test('review mutate port contract: stale asynchronous plan refresh cannot overwrite a newer imported session', async () => {
  const port = instantiateReviewMutatePort({ loadRevisionBridgeModule: loadBridge });
  const reviewGraph = validReviewPacket({
    commentThreads: [],
    commentPlacements: [],
    structuralChanges: [],
    diagnosticItems: [],
    decisionStates: [],
  });
  const firstPacket = tmpLocalPacket({
    packetVersion: 'review-packet.v1',
    projectId: 'project-1',
    sessionId: 'session-race-first',
    baselineHash: 'baseline-race-first',
    reviewPacket: reviewGraph,
  });
  const secondPacket = tmpLocalPacket({
    packetVersion: 'review-packet.v1',
    projectId: 'project-1',
    sessionId: 'session-race-second',
    baselineHash: 'baseline-race-second',
    reviewPacket: reviewGraph,
  });

  let releaseFirstRefresh;
  let markFirstRefreshStarted;
  const firstRefreshStarted = new Promise((resolve) => { markFirstRefreshStarted = resolve; });
  const firstRefreshGate = new Promise((resolve) => { releaseFirstRefresh = resolve; });
  const firstImport = importLocalPacketFromPath(
    port,
    firstPacket,
    'local-request-race-first',
    {
      buildReviewExactTextApplyInput: async () => {
        markFirstRefreshStarted();
        await firstRefreshGate;
        return { ok: false, reason: 'FIRST_SESSION_BLOCK' };
      },
    },
  );
  await firstRefreshStarted;

  const secondImport = await importLocalPacketFromPath(
    port,
    secondPacket,
    'local-request-race-second',
    {
      buildReviewExactTextApplyInput: async () => ({
        ok: false,
        reason: 'SECOND_SESSION_BLOCK',
      }),
    },
  );
  releaseFirstRefresh();
  await firstImport;

  const activeSurface = normalizeVmValue(port.readActiveReviewSessionReviewSurface());
  assert.equal(secondImport.ok, true);
  assert.equal(port.getState().activeReviewSessionStore.sessionId, 'session-race-second');
  assert.equal(activeSurface.revisionSession.sessionId, 'session-race-second');
  assert.equal(activeSurface.exactTextPlanPreview.status, 'blocked');
  assert.equal(activeSurface.exactTextPlanPreview.reason, 'SECOND_SESSION_BLOCK');
});

test('review mutate port contract: local packet menu command uses default main file intake and opens comments', async () => {
  const payload = {
    packetVersion: 'review-packet.v1',
    projectId: 'project-1',
    sessionId: 'session-menu-local-1',
    baselineHash: 'baseline-menu-local-1',
    reviewPacket: validReviewPacket({
      commentThreads: [],
      commentPlacements: [],
      structuralChanges: [],
      diagnosticItems: [],
      decisionStates: [],
    }),
  };
  const packet = tmpLocalPacket(payload);
  const dialogCalls = [];
  const port = instantiateReviewMutatePort({
    loadRevisionBridgeModule: loadBridge,
    dialog: {
      showOpenDialog: async (windowRef, options) => {
        dialogCalls.push({ windowRef, options });
        return {
          canceled: false,
          filePaths: [packet.packetPath],
        };
      },
    },
  });

  const result = await port.MENU_COMMAND_HANDLERS['cmd.project.review.importLocalPacket']({
    requestId: 'menu-local-request-1',
  });

  assert.equal(result.ok, true);
  assert.equal(result.commandId, 'cmd.project.review.importLocalPacket');
  assert.equal(result.requestId, 'menu-local-request-1');
  assert.equal(result.imported, true);
  assert.equal(result.fileName, 'review-packet.json');
  assert.equal(result.path, undefined);
  assert.equal(result.filePath, undefined);
  assert.equal(dialogCalls.length, 1);
  assert.deepEqual(
    normalizeVmValue(dialogCalls[0].options.filters),
    [{ name: 'Review Packet JSON', extensions: ['json'] }],
  );
  const reviewSurface = normalizeVmValue(port.readActiveReviewSessionReviewSurface());
  assert.equal(reviewSurface.revisionSession.sessionId, 'session-menu-local-1');
  assert.equal(reviewSurface.revisionSession.reviewGraph.textChanges[0].changeId, 'text-change-1');
  assert.equal(reviewSurface.exactTextPlanPreview.status, 'blocked');
  assert.deepEqual(normalizeVmValue(port.runtimeCommands), [
    {
      commandId: 'cmd.project.review.openComments',
      payload: {
        source: 'review-import-local-packet',
        requestId: 'menu-local-request-1',
      },
      legacyCommand: 'review-comment',
    },
  ]);

  const clearResult = await port.MENU_COMMAND_HANDLERS['cmd.project.review.clearSession']();
  assert.equal(clearResult.ok, true);
  assert.equal(clearResult.cleared, true);
  assert.deepEqual(normalizeVmValue(port.readActiveReviewSessionReviewSurface()), {});
  assert.deepEqual(normalizeVmValue(port.runtimeCommands[1]), {
    commandId: 'cmd.project.review.openComments',
    payload: {
      source: 'review-clear-session',
    },
    legacyCommand: 'review-comment',
  });
});

test('review mutate port contract: local packet export fails closed before file selection when no active session exists', async () => {
  const port = instantiateReviewMutatePort({ loadRevisionBridgeModule: loadBridge });
  let pickCalled = false;

  const result = await port.handleReviewSurfaceExportLocalPacketCommandSurface(
    { requestId: 'export-no-session' },
    {
      pickLocalFile: async () => {
        pickCalled = true;
        return { path: path.join(os.tmpdir(), 'review-export.json') };
      },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.op, 'cmd.project.review.exportLocalPacket');
  assert.equal(result.error.reason, 'REVIEW_EXPORT_LOCAL_PACKET_NO_ACTIVE_SESSION');
  assert.equal(pickCalled, false);
});

test('review mutate port contract: local packet export revalidates target before write', async () => {
  const port = instantiateReviewMutatePort({ loadRevisionBridgeModule: loadBridge });
  const revisionSession = {
    projectId: 'project-1',
    sessionId: 'session-export-revalidate',
    baselineHash: 'baseline-export-revalidate',
    status: 'open',
    reviewGraph: validReviewPacket(),
  };
  const importResult = await port.handleReviewSurfaceImportPacketCommandSurface({
    projectId: revisionSession.projectId,
    sessionId: revisionSession.sessionId,
    baselineHash: revisionSession.baselineHash,
    reviewSurface: { revisionSession },
    revisionSession,
  });
  assert.equal(importResult.ok, true);

  let validationCount = 0;
  let writeCount = 0;
  const result = await port.handleReviewSurfaceExportLocalPacketCommandSurface(
    { requestId: 'export-revalidate' },
    {
      pickLocalFile: async () => ({
        path: path.join(os.tmpdir(), 'review-export-revalidate.json'),
      }),
      validateExternalWriteTarget: async () => {
        validationCount += 1;
        if (validationCount === 2) {
          const error = new Error('EXTERNAL_TARGET_SYMLINK_DENIED');
          error.reason = 'EXTERNAL_TARGET_SYMLINK_DENIED';
          throw error;
        }
        return { ok: true };
      },
      writeFileAtomic: async () => {
        writeCount += 1;
        return { success: true };
      },
    },
  );

  assert.equal(validationCount, 2);
  assert.equal(writeCount, 0);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_REVIEW_EXPORT_LOCAL_PACKET_TARGET_FORBIDDEN');
  assert.equal(result.error.reason, 'EXTERNAL_TARGET_SYMLINK_DENIED');
});

test('review mutate port contract: local packet export writes one normalized json file and roundtrips back through local import', async () => {
  const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-review-export-local-packet-'));
  const exportPath = path.join(exportDir, 'exported-review-packet.json');
  const revisionSession = {
    projectId: 'project-1',
    sessionId: 'session-export-local-1',
    baselineHash: 'baseline-export-local-1',
    status: 'open',
    reviewGraph: validReviewPacket(),
  };
  const dialogCalls = [];
  const port = instantiateReviewMutatePort({
    loadRevisionBridgeModule: loadBridge,
    dialog: {
      showSaveDialog: async (windowRef, options) => {
        dialogCalls.push({ kind: 'save', windowRef, options });
        return {
          canceled: false,
          filePath: exportPath,
        };
      },
      showOpenDialog: async (windowRef, options) => {
        dialogCalls.push({ kind: 'open', windowRef, options });
        return {
          canceled: false,
          filePaths: [exportPath],
        };
      },
    },
  });

  const importResult = await port.handleReviewSurfaceImportPacketCommandSurface({
    projectId: 'project-1',
    sessionId: 'session-export-local-1',
    baselineHash: 'baseline-export-local-1',
    createdAt: '2026-05-24T12:00:00.000Z',
    reviewSurface: {
      revisionSession,
      receipt: {
        transactionId: 'ignored-receipt-1',
      },
      exactTextApplyReceipts: [{ transactionId: 'ignored-receipt-1' }],
      exactTextAppliedChangeIds: ['text-change-1'],
      stage01Preview: {
        sourceViewState: {
          packetHash: 'ignored-packet-hash',
        },
      },
    },
    revisionSession,
  });
  assert.equal(importResult.ok, true);

  const exportResult = await port.MENU_COMMAND_HANDLERS['cmd.project.review.exportLocalPacket']({
    requestId: 'export-local-request-1',
  });
  assert.equal(exportResult.ok, true);
  assert.equal(exportResult.commandId, 'cmd.project.review.exportLocalPacket');
  assert.equal(exportResult.requestId, 'export-local-request-1');
  assert.equal(exportResult.exported, true);
  assert.equal(exportResult.outPath, exportPath);
  assert.equal(exportResult.bytesWritten > 0, true);
  assert.deepEqual(normalizeVmValue(exportResult.counts), {
    commentThreads: 1,
    commentPlacements: 1,
    textChanges: 1,
    structuralChanges: 1,
    diagnosticItems: 1,
    decisionStates: 1,
  });

  const exportedPacket = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  assert.deepEqual(
    Object.keys(exportedPacket).sort(),
    ['baselineHash', 'createdAt', 'packetVersion', 'projectId', 'reviewPacket', 'sessionId'],
  );
  assert.deepEqual(
    Object.keys(exportedPacket.reviewPacket).sort(),
    [
      'commentPlacements',
      'commentThreads',
      'decisionStates',
      'diagnosticItems',
      'structuralChanges',
      'textChanges',
    ],
  );
  assert.equal(exportedPacket.projectId, 'project-1');
  assert.equal(exportedPacket.packetVersion, 'review-packet.v1');
  assert.equal(exportedPacket.sessionId, 'session-export-local-1');
  assert.equal(exportedPacket.baselineHash, 'baseline-export-local-1');
  assert.equal(exportedPacket.reviewPacket.textChanges[0].changeId, 'text-change-1');
  assert.deepEqual(
    findForbiddenKeys(exportedPacket, [
      'filePath',
      'rawBytes',
      'projectRoot',
      'scenePath',
      'scenePaths',
      'applyOps',
      'receipt',
      'recovery',
      'exactTextApplyReceipts',
      'exactTextAppliedChangeIds',
      'writeEffects',
      'publicationEffect',
      'rendererPacket',
      'rendererSession',
      'docxBytes',
      'sourceViewState',
    ]),
    [],
  );

  const clearResult = port.handleReviewSurfaceClearSessionCommandSurface();
  assert.equal(clearResult.ok, true);
  assert.equal(port.getState().activeReviewSessionLifecycle, 'cleared');

  const reopenResult = await port.MENU_COMMAND_HANDLERS['cmd.project.review.importLocalPacket']({
    requestId: 'reimport-export-local-request-1',
  });
  const reopenedSurface = normalizeVmValue(port.readActiveReviewSessionReviewSurface());

  assert.equal(reopenResult.ok, true);
  assert.equal(reopenResult.commandId, 'cmd.project.review.importLocalPacket');
  assert.equal(reopenResult.imported, true);
  assert.equal(reopenResult.packetVersion, 'review-packet.v1');
  assert.equal(reopenResult.legacyNormalized, false);
  assert.equal(reopenedSurface.revisionSession.sessionId, 'session-export-local-1');
  assert.equal(reopenedSurface.revisionSession.reviewGraph.textChanges[0].changeId, 'text-change-1');
  assert.equal(reopenedSurface.shadowPreview.status, 'preview');
  assert.equal(reopenedSurface.blockedApplyPlan.status, 'blocked');
  assert.deepEqual(normalizeVmValue(port.runtimeCommands), [
    {
      commandId: 'cmd.project.review.openComments',
      payload: {
        source: 'review-import-local-packet',
        requestId: 'reimport-export-local-request-1',
      },
      legacyCommand: 'review-comment',
    },
  ]);
  assert.equal(dialogCalls.length, 2);
  assert.equal(dialogCalls[0].kind, 'save');
  assert.equal(dialogCalls[1].kind, 'open');
});

test('review mutate port contract: local packet import cancel is a no-op and does not activate session', async () => {
  const port = instantiateReviewMutatePort();
  let readCalled = false;

  const result = await port.handleReviewSurfaceImportLocalPacketCommandSurface(
    { requestId: 'local-request-cancel' },
    {
      pickLocalFile: async () => ({ canceled: true }),
      readLocalFileText: async () => {
        readCalled = true;
        return '{}';
      },
    },
  );

  assert.deepEqual(normalizeVmValue(result), {
    ok: true,
    commandId: 'cmd.project.review.importLocalPacket',
    requestId: 'local-request-cancel',
    imported: false,
    cancelled: true,
  });
  assert.equal(readCalled, false);
  assert.equal(port.getState().activeReviewSessionLifecycle, 'passive');
});

test('review mutate port contract: local packet import rejects renderer authority before file picker', async () => {
  const port = instantiateReviewMutatePort();
  let pickCalled = false;

  const result = await port.handleReviewSurfaceImportLocalPacketCommandSurface(
    {
      requestId: 'local-request-denied',
      filePath: '/tmp/renderer-owned.json',
    },
    {
      pickLocalFile: async () => {
        pickCalled = true;
        return { canceled: true };
      },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.op, 'cmd.project.review.importLocalPacket');
  assert.equal(result.error.reason, 'REVIEW_IMPORT_LOCAL_PACKET_PAYLOAD_UNSUPPORTED_FIELDS');
  assert.deepEqual(normalizeVmValue(result.error.details.fields), ['filePath']);
  assert.equal(pickCalled, false);
  assert.equal(port.getState().activeReviewSessionLifecycle, 'passive');
});

test('review mutate port contract: local packet import rejects non-json and oversize selections before read', async () => {
  const port = instantiateReviewMutatePort();
  let readCalled = false;

  const nonJson = await port.handleReviewSurfaceImportLocalPacketCommandSurface(
    { requestId: 'local-request-non-json' },
    {
      pickLocalFile: async () => ({
        path: path.join(os.tmpdir(), 'review-packet.txt'),
        name: 'review-packet.txt',
        size: 12,
      }),
      readLocalFileText: async () => {
        readCalled = true;
        return '{}';
      },
    },
  );

  assert.equal(nonJson.ok, false);
  assert.equal(nonJson.error.reason, 'REVIEW_IMPORT_LOCAL_PACKET_JSON_REQUIRED');
  assert.equal(readCalled, false);

  const tooLarge = await port.handleReviewSurfaceImportLocalPacketCommandSurface(
    { requestId: 'local-request-too-large' },
    {
      pickLocalFile: async () => ({
        path: path.join(os.tmpdir(), 'review-packet.json'),
        name: 'review-packet.json',
        size: 2 * 1024 * 1024 + 1,
      }),
      readLocalFileText: async () => {
        readCalled = true;
        return '{}';
      },
    },
  );

  assert.equal(tooLarge.ok, false);
  assert.equal(tooLarge.error.reason, 'REVIEW_IMPORT_LOCAL_PACKET_TOO_LARGE');
  assert.equal(readCalled, false);
  assert.equal(port.getState().activeReviewSessionLifecycle, 'passive');
});

test('review mutate port contract: local packet import malformed json stays typed and inactive', async () => {
  const port = instantiateReviewMutatePort();

  const result = await port.handleReviewSurfaceImportLocalPacketCommandSurface(
    { requestId: 'local-request-malformed' },
    {
      pickLocalFile: async () => ({
        path: path.join(os.tmpdir(), 'review-packet.json'),
        name: 'review-packet.json',
        size: 1,
      }),
      readLocalFileText: async () => '{',
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.op, 'cmd.project.review.importLocalPacket');
  assert.equal(result.error.reason, 'REVIEW_IMPORT_LOCAL_PACKET_JSON_INVALID');
  assert.equal(port.getState().activeReviewSessionLifecycle, 'passive');
  assert.deepEqual(normalizeVmValue(port.readActiveReviewSessionReviewSurface()), {});
});

test('review mutate port contract: canonical packet version is enforced and unversioned canonical transport is normalized', async () => {
  const canonicalPayload = {
    projectId: 'project-1',
    sessionId: 'session-version-1',
    baselineHash: 'baseline-version-1',
    reviewPacket: validReviewPacket({
      commentThreads: [],
      commentPlacements: [],
      structuralChanges: [],
      diagnosticItems: [],
      decisionStates: [],
    }),
  };
  const port = instantiateReviewMutatePort({ loadRevisionBridgeModule: loadBridge });
  const legacyText = JSON.stringify(canonicalPayload);

  const normalized = await port.handleReviewSurfaceImportLocalPacketCommandSurface(
    { requestId: 'local-request-version-normalized' },
    {
      pickLocalFile: async () => ({
        path: path.join(os.tmpdir(), 'review-packet.json'),
        name: 'review-packet.json',
        size: Buffer.byteLength(legacyText, 'utf8'),
      }),
      readLocalFileText: async () => legacyText,
    },
  );

  assert.equal(normalized.ok, true);
  assert.equal(normalized.packetVersion, 'review-packet.v1');
  assert.equal(normalized.legacyNormalized, true);
  port.handleReviewSurfaceClearSessionCommandSurface();

  const unsupportedText = JSON.stringify({
    ...canonicalPayload,
    packetVersion: 'review-packet.v2',
  });
  const unsupported = await port.handleReviewSurfaceImportLocalPacketCommandSurface(
    { requestId: 'local-request-version-unsupported' },
    {
      pickLocalFile: async () => ({
        path: path.join(os.tmpdir(), 'review-packet.json'),
        name: 'review-packet.json',
        size: Buffer.byteLength(unsupportedText, 'utf8'),
      }),
      readLocalFileText: async () => unsupportedText,
    },
  );

  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.error.code, 'E_REVIEW_IMPORT_LOCAL_PACKET_VERSION_UNSUPPORTED');
  assert.equal(unsupported.error.reason, 'REVIEW_IMPORT_LOCAL_PACKET_VERSION_UNSUPPORTED');
  assert.equal(port.getState().activeReviewSessionLifecycle, 'cleared');

  const invalidVersionText = JSON.stringify({
    ...canonicalPayload,
    packetVersion: 1,
    createdAt: 123,
  });
  const invalidVersion = await port.handleReviewSurfaceImportLocalPacketCommandSurface(
    { requestId: 'local-request-version-invalid-type' },
    {
      pickLocalFile: async () => ({
        path: path.join(os.tmpdir(), 'review-packet.json'),
        name: 'review-packet.json',
        size: Buffer.byteLength(invalidVersionText, 'utf8'),
      }),
      readLocalFileText: async () => invalidVersionText,
    },
  );

  assert.equal(invalidVersion.ok, false);
  assert.equal(invalidVersion.error.code, 'E_REVIEW_IMPORT_LOCAL_PACKET_SCHEMA_INVALID');
  assert.equal(invalidVersion.error.reason, 'REVIEW_IMPORT_LOCAL_PACKET_TOP_LEVEL_VALUES_INVALID');
  assert.deepEqual(normalizeVmValue(invalidVersion.error.details.fields), ['createdAt', 'packetVersion']);
  assert.equal(port.getState().activeReviewSessionLifecycle, 'cleared');
});

test('review mutate port contract: canonical packet rejects missing or unknown ReviewGraph collections', async () => {
  const basePayload = {
    packetVersion: 'review-packet.v1',
    projectId: 'project-1',
    sessionId: 'session-schema-1',
    baselineHash: 'baseline-schema-1',
    reviewPacket: validReviewPacket(),
  };
  const port = instantiateReviewMutatePort({ loadRevisionBridgeModule: loadBridge });

  for (const [requestId, mutate, expectedDetails] of [
    [
      'local-request-schema-missing',
      (payload) => { delete payload.reviewPacket.diagnosticItems; },
      { missingFields: ['diagnosticItems'], unsupportedFields: [] },
    ],
    [
      'local-request-schema-unknown',
      (payload) => { payload.reviewPacket.unknownCollection = []; },
      { missingFields: [], unsupportedFields: ['unknownCollection'] },
    ],
  ]) {
    const payload = cloneJsonSafe(basePayload);
    mutate(payload);
    const text = JSON.stringify(payload);
    const result = await port.handleReviewSurfaceImportLocalPacketCommandSurface(
      { requestId },
      {
        pickLocalFile: async () => ({
          path: path.join(os.tmpdir(), 'review-packet.json'),
          name: 'review-packet.json',
          size: Buffer.byteLength(text, 'utf8'),
        }),
        readLocalFileText: async () => text,
      },
    );

    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'E_REVIEW_IMPORT_LOCAL_PACKET_SCHEMA_INVALID');
    assert.equal(result.error.reason, 'REVIEW_IMPORT_LOCAL_PACKET_REVIEW_PACKET_FIELDS_INVALID');
    assert.deepEqual(normalizeVmValue(result.error.details), expectedDetails);
    assert.notEqual(port.getState().activeReviewSessionLifecycle, 'active');
  }
});

test('review mutate port contract: legacy reviewSurface transport cannot activate direct apply state', async () => {
  const port = instantiateReviewMutatePort();
  const text = JSON.stringify({
    projectId: 'project-1',
    sessionId: 'session-legacy-surface-1',
    baselineHash: 'baseline-legacy-surface-1',
    reviewSurface: {
      exactTextPlanPreview: {
        status: 'ready',
        plan: {
          applyOps: [{ changeId: 'external-change' }],
        },
      },
    },
  });

  const result = await port.handleReviewSurfaceImportLocalPacketCommandSurface(
    { requestId: 'local-request-legacy-surface' },
    {
      pickLocalFile: async () => ({
        path: path.join(os.tmpdir(), 'review-packet.json'),
        name: 'review-packet.json',
        size: Buffer.byteLength(text, 'utf8'),
      }),
      readLocalFileText: async () => text,
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.reason, 'REVIEW_IMPORT_LOCAL_PACKET_WRITE_EVIDENCE_DENIED');
  assert.deepEqual(
    normalizeVmValue(result.error.details.fields),
    [
      'reviewSurface',
      'reviewSurface.exactTextPlanPreview.plan',
      'reviewSurface.exactTextPlanPreview.plan.applyOps',
    ],
  );
  assert.equal(port.getState().activeReviewSessionLifecycle, 'passive');
});

test('review mutate port contract: local packet import denies external write receipt evidence', async () => {
  const port = instantiateReviewMutatePort();
  const payload = {
    packetVersion: 'review-packet.v1',
    projectId: 'project-1',
    sessionId: 'session-1',
    baselineHash: 'baseline-1',
    reviewPacket: {
      ...validReviewPacket(),
      receipt: {
        schemaVersion: 'revision-bridge.exact-text-min-safe-write.receipt.v1',
        projectId: 'project-1',
        sessionId: 'session-1',
        changeId: 'text-change-1',
        operationKind: 'replaceExactText',
        writeStatus: 'applied',
      },
      exactTextApplyReceipts: [],
      exactTextAppliedChangeIds: ['text-change-1'],
    },
  };
  const text = JSON.stringify(payload);

  const result = await port.handleReviewSurfaceImportLocalPacketCommandSurface(
    { requestId: 'local-request-receipt-denied' },
    {
      pickLocalFile: async () => ({
        path: path.join(os.tmpdir(), 'review-packet.json'),
        name: 'review-packet.json',
        size: Buffer.byteLength(text, 'utf8'),
      }),
      readLocalFileText: async () => text,
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.op, 'cmd.project.review.importLocalPacket');
  assert.equal(result.error.reason, 'REVIEW_IMPORT_LOCAL_PACKET_WRITE_EVIDENCE_DENIED');
  assert.deepEqual(
    normalizeVmValue(result.error.details.fields),
    [
      'reviewPacket.receipt',
      'reviewPacket.exactTextApplyReceipts',
      'reviewPacket.exactTextAppliedChangeIds',
    ],
  );
  assert.equal(port.getState().activeReviewSessionLifecycle, 'passive');
  assert.deepEqual(normalizeVmValue(port.readActiveReviewSessionReviewSurface()), {});
});

test('review mutate port contract: local packet import restats before read and rejects oversized replacement', async () => {
  let readCalled = false;
  const port = instantiateReviewMutatePort({
    fs: {
      stat: async () => ({
        isFile: () => true,
        size: 2 * 1024 * 1024 + 5,
      }),
      readFile: async () => {
        readCalled = true;
        return '{}';
      },
    },
  });

  const result = await port.handleReviewSurfaceImportLocalPacketCommandSurface(
    { requestId: 'local-request-restat-too-large' },
    {
      pickLocalFile: async () => ({
        path: path.join(os.tmpdir(), 'review-packet.json'),
        name: 'review-packet.json',
        size: 10,
      }),
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.op, 'cmd.project.review.importLocalPacket');
  assert.equal(result.error.reason, 'EXTERNAL_SOURCE_TOO_LARGE');
  assert.equal(readCalled, false);
  assert.equal(port.getState().activeReviewSessionLifecycle, 'passive');
});

test('review mutate port contract: local packet e2e exact apply writes only after local import', async () => {
  const port = instantiateReviewMutatePort({ loadRevisionBridgeModule: loadBridge });
  const { scenePath } = tmpScene('Alpha beta gamma.');
  const revisionSession = validExactApplyRevisionSession({
    sceneId: scenePath,
    sessionId: 'session-local-e2e-1',
    baselineHash: 'baseline-local-e2e-1',
  });
  const packet = tmpLocalPacket({
    packetVersion: 'review-packet.v1',
    projectId: 'project-1',
    sessionId: 'session-local-e2e-1',
    baselineHash: 'baseline-local-e2e-1',
    reviewPacket: revisionSession.reviewGraph,
    createdAt: '2026-05-24T12:00:00.000Z',
  });

  const applyInput = await buildReadyExactApplyInput({
    scenePath,
    sceneText: 'Alpha beta gamma.',
    revisionSession,
  });
  let prepareRequest = null;
  const importResult = await importLocalPacketFromPath(
    port,
    packet,
    'local-request-e2e-single',
    {
      buildReviewExactTextApplyInput: async (request) => {
        prepareRequest = normalizeVmValue(request);
        return { ok: true, input: applyInput };
      },
    },
  );
  const importedSurface = normalizeVmValue(port.readActiveReviewSessionReviewSurface());

  assert.equal(importResult.ok, true);
  assert.equal(importResult.commandId, 'cmd.project.review.importLocalPacket');
  assert.equal(importResult.imported, true);
  assert.equal(importResult.requestId, 'local-request-e2e-single');
  assert.equal(importResult.fileName, 'review-packet.json');
  assert.equal(importResult.path, undefined);
  assert.equal(importResult.filePath, undefined);
  assert.equal(prepareRequest.payload.changeId, 'text-change-1');
  assert.equal(readText(scenePath), 'Alpha beta gamma.');
  assert.equal(port.getState().activeReviewSessionLifecycle, 'active');
  assert.equal(importedSurface.revisionSession.sessionId, 'session-local-e2e-1');
  assert.equal(importedSurface.revisionSession.reviewGraph.textChanges[0].changeId, 'text-change-1');
  assert.equal(importedSurface.exactTextPlanPreview.status, 'ready');
  assert.equal(importedSurface.exactTextPlanPreview.plan.applyOps.length, 1);
  assert.equal(importedSurface.exactTextPlanPreview.plan.applyOps[0].changeId, 'text-change-1');
  assert.equal(Object.prototype.hasOwnProperty.call(importedSurface, 'receipt'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(importedSurface, 'exactTextApplyResult'), false);

  let applyRequest = null;
  const applyResult = await port.handleReviewSurfaceApplyExactTextChangeCommandSurface(
    { changeId: 'text-change-1' },
    {
      buildReviewExactTextApplyInput: async (request) => {
        applyRequest = normalizeVmValue(request);
        return { ok: true, input: applyInput };
      },
      loadExactTextMinSafeWriteModule: loadExactSafeWrite,
      safeWriteOptions: { now: () => 1700000020000 },
    },
  );
  const value = normalizeVmValue(applyResult);
  const appliedSurface = normalizeVmValue(port.readActiveReviewSessionReviewSurface());

  assert.equal(applyRequest.payload.changeId, 'text-change-1');
  assert.equal(applyRequest.activeSession.sessionId, 'session-local-e2e-1');
  assert.equal(value.ok, true, JSON.stringify(value, null, 2));
  assert.equal(value.applied, true);
  assert.equal(readText(scenePath), 'Alpha delta gamma.');
  assert.equal(value.receipt.projectId, 'project-1');
  assert.equal(value.receipt.sessionId, 'session-local-e2e-1');
  assert.equal(value.receipt.changeId, 'text-change-1');
  assert.equal(value.receipt.writeStatus, 'applied');
  assert.equal(value.receipt.recovery.snapshotCreated, true);
  assert.equal(value.receipt.recovery.snapshotReadable, true);
  assert.equal(value.receipt.recovery.snapshotHashMatchesInput, true);
  assert.equal(fs.readFileSync(value.receipt.recovery.snapshotPath, 'utf8'), 'Alpha beta gamma.');
  assert.equal(appliedSurface.receipt.transactionId, value.receipt.transactionId);
  assert.equal(appliedSurface.exactTextApplyReceipts.length, 1);
  assert.equal(appliedSurface.exactTextApplyResult.status, 'applied');

  const clearResult = port.handleReviewSurfaceClearSessionCommandSurface();
  assert.equal(clearResult.ok, true);
  assert.equal(clearResult.hadActiveSession, true);
  assert.deepEqual(normalizeVmValue(port.readActiveReviewSessionReviewSurface()), {});
  assert.equal(readText(scenePath), 'Alpha delta gamma.');
});

test('review mutate port contract: local packet e2e batch exact apply stays same-scene and receipt-free on surface', async () => {
  const port = instantiateReviewMutatePort({ loadRevisionBridgeModule: loadBridge });
  const { scenePath } = tmpScene('Alpha beta gamma omega.');
  const revisionSession = validExactApplyRevisionSession({
    sceneId: scenePath,
    sessionId: 'session-local-e2e-batch',
    baselineHash: 'baseline-local-e2e-batch',
    textChanges: [
      {
        ...validTextChange(),
        changeId: 'text-change-1',
        targetScope: { type: 'scene', id: scenePath },
        match: { kind: 'exact', quote: 'beta', prefix: '', suffix: '' },
        replacementText: 'delta',
      },
      {
        ...validTextChange(),
        changeId: 'text-change-2',
        targetScope: { type: 'scene', id: scenePath },
        match: { kind: 'exact', quote: 'omega', prefix: '', suffix: '' },
        replacementText: 'sigma',
      },
    ],
  });
  const packet = tmpLocalPacket({
    packetVersion: 'review-packet.v1',
    projectId: 'project-1',
    sessionId: 'session-local-e2e-batch',
    baselineHash: 'baseline-local-e2e-batch',
    reviewPacket: revisionSession.reviewGraph,
    createdAt: '2026-05-24T12:00:00.000Z',
  });

  const importResult = await importLocalPacketFromPath(
    port,
    packet,
    'local-request-e2e-batch',
    {
      buildReviewExactTextApplyInput: async (request) => ({
        ok: true,
        input: await buildReadyExactApplyInput({
          scenePath,
          sceneText: 'Alpha beta gamma omega.',
          revisionSession: request.revisionSession,
        }),
      }),
    },
  );
  assert.equal(importResult.ok, true);
  assert.equal(readText(scenePath), 'Alpha beta gamma omega.');
  assert.equal(importResult.reviewSurface.exactTextPlanPreview.status, 'ready');
  assert.deepEqual(
    normalizeVmValue(importResult.reviewSurface.exactTextPlanPreview.plan.applyOps.map((op) => op.changeId)),
    ['text-change-1', 'text-change-2'],
  );
  assert.equal(Object.prototype.hasOwnProperty.call(
    normalizeVmValue(port.readActiveReviewSessionReviewSurface()),
    'exactTextAppliedChangeIds',
  ), false);

  const applyInput = buildBatchExactApplyInput({
    scenePath,
    sceneText: 'Alpha beta gamma omega.',
    revisionSession,
  });
  let safeWriterLoaded = false;
  const result = await port.handleReviewSurfaceApplyExactTextChangesBatchCommandSurface(
    { changeIds: ['text-change-1', 'text-change-2'] },
    {
      buildReviewExactTextApplyBatchInput: async (request) => {
        assert.deepEqual(
          normalizeVmValue(request.textChanges.map((change) => change.changeId)),
          ['text-change-1', 'text-change-2'],
        );
        assert.equal(request.activeSession.sessionId, 'session-local-e2e-batch');
        return { ok: true, input: applyInput };
      },
      loadExactTextMinSafeWriteModule: async () => {
        safeWriterLoaded = true;
        return loadExactSafeWrite();
      },
      safeWriteOptions: { now: () => 1700000030000 },
    },
  );
  const value = normalizeVmValue(result);
  const appliedSurface = normalizeVmValue(port.readActiveReviewSessionReviewSurface());

  assert.equal(safeWriterLoaded, true);
  assert.equal(value.ok, true, JSON.stringify(value, null, 2));
  assert.equal(value.batch, true);
  assert.equal(value.applied, true);
  assert.equal(readText(scenePath), 'Alpha delta gamma sigma.');
  assert.deepEqual(appliedSurface.exactTextAppliedChangeIds, ['text-change-1', 'text-change-2']);
  assert.equal(appliedSurface.exactTextBatchApplyResult.status, 'applied');
  assert.equal(Object.prototype.hasOwnProperty.call(appliedSurface, 'receipt'), false);
});

test('review mutate port contract: local mixed packet remains preview and manual-only for structural changes', async () => {
  const port = instantiateReviewMutatePort({ loadRevisionBridgeModule: loadBridge });
  const packet = tmpLocalPacket({
    packetVersion: 'review-packet.v1',
    projectId: 'project-1',
    sessionId: 'session-local-mixed-preview',
    baselineHash: 'baseline-a',
    reviewPacket: validReviewPacket(),
    createdAt: '2026-05-24T12:00:00.000Z',
  });

  const importResult = await importLocalPacketFromPath(port, packet, 'local-request-mixed-preview');
  const reviewSurface = normalizeVmValue(importResult.reviewSurface);

  assert.equal(importResult.ok, true);
  assert.equal(importResult.commandId, 'cmd.project.review.importLocalPacket');
  assert.equal(reviewSurface.shadowPreview.status, 'preview');
  assert.equal(reviewSurface.blockedApplyPlan.status, 'blocked');
  assert.equal(reviewSurface.blockedApplyPlan.canApply, false);
  assert.deepEqual(reviewSurface.blockedApplyPlan.applyOps, []);
  assert.equal(reviewSurface.structuralManualReviewPreview.status, 'preview');
  assert.equal(reviewSurface.structuralManualReviewPreview.canAutoApply, false);
  assert.equal(
    reviewSurface.structuralManualReviewPreview.items[0].manualOnlyReason,
    'REVISION_BRIDGE_STAGE01_STRUCTURAL_MANUAL_ONLY',
  );
  assert.equal(Object.prototype.hasOwnProperty.call(reviewSurface, 'receipt'), false);

  let buildContextCalled = false;
  const applyResult = await port.handleReviewSurfaceApplyExactTextChangeCommandSurface(
    { changeId: 'text-change-1' },
    {
      buildReviewExactTextApplyInput: async () => {
        buildContextCalled = true;
        throw new Error('manual-only structural packet must not build write context');
      },
      loadExactTextMinSafeWriteModule: loadExactSafeWrite,
    },
  );

  assert.equal(applyResult.ok, false);
  assert.equal(applyResult.error.reason, 'REVIEW_EXACT_TEXT_APPLY_STRUCTURAL_CHANGE_BLOCKED');
  assert.equal(buildContextCalled, false);
  assert.equal(Object.prototype.hasOwnProperty.call(
    normalizeVmValue(port.readActiveReviewSessionReviewSurface()),
    'receipt',
  ), false);
});

test('review mutate port contract: import builds Stage01 preview surface from reviewPacket without authorizing apply', async () => {
  const port = instantiateReviewMutatePort({ loadRevisionBridgeModule: loadBridge });
  const payload = {
    projectId: 'project-1',
    sessionId: 'session-1',
    baselineHash: 'baseline-a',
    currentBaselineHash: 'baseline-b',
    reviewPacket: validReviewPacket(),
    createdAt: '2026-05-24T12:00:00.000Z',
  };
  const before = cloneJsonSafe(payload);

  const result = await port.handleReviewSurfaceImportPacketCommandSurface(payload);
  const state = port.getState();
  const reviewSurface = normalizeVmValue(result.reviewSurface);

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.deepEqual(payload, before);
  assert.equal(reviewSurface.revisionSession.projectId, 'project-1');
  assert.equal(reviewSurface.revisionSession.sessionId, 'session-1');
  assert.equal(reviewSurface.revisionSession.baselineHash, 'baseline-a');
  assert.equal(reviewSurface.revisionSession.reviewGraph.textChanges.length, 1);
  assert.equal(reviewSurface.shadowPreview.status, 'preview');
  assert.equal(reviewSurface.blockedApplyPlan.status, 'blocked');
  assert.equal(reviewSurface.blockedApplyPlan.canApply, false);
  assert.deepEqual(reviewSurface.blockedApplyPlan.applyOps, []);
  assert.deepEqual(
    reviewSurface.blockedApplyPlan.reasons.map((reason) => reason.code),
    ['REVISION_BRIDGE_STAGE01_PREVIEW_ONLY', 'REVISION_BRIDGE_STAGE01_STALE_BASELINE'],
  );
  assert.equal(reviewSurface.structuralManualReviewPreview.status, 'preview');
  assert.equal(reviewSurface.structuralManualReviewPreview.canAutoApply, false);
  assert.equal(reviewSurface.structuralManualReviewPreview.items[0].structuralChangeId, 'structural-change-1');
  assert.equal(
    reviewSurface.structuralManualReviewPreview.items[0].manualOnlyReason,
    'REVISION_BRIDGE_STAGE01_STRUCTURAL_MANUAL_ONLY',
  );
  assert.deepEqual(findForbiddenKeys(reviewSurface, [
    'applyAuthorized',
    'applyDecision',
    'authorized',
    'authorization',
  ]), []);
  assert.equal(state.activeReviewSessionLifecycle, 'active');
  assert.equal(state.activeReviewSessionStore.currentBaselineHash, 'baseline-b');
  assert.deepEqual(normalizeVmValue(state.currentReviewSurfacePayload), reviewSurface);
  assert.equal(state.currentReviewSurfacePayloadSource, 'session');
  assert.equal(state.currentReviewSurfacePayloadContentHash, '');
});

test('review mutate port contract: import maps parsedSurface unsupported items into preview diagnostics only', async () => {
  const port = instantiateReviewMutatePort({ loadRevisionBridgeModule: loadBridge });

  const result = await port.handleReviewSurfaceImportPacketCommandSurface({
    projectId: 'project-1',
    sessionId: 'session-1',
    baselineHash: 'baseline-1',
    parsedSurface: validParsedSurface(),
  });

  const reviewSurface = normalizeVmValue(result.reviewSurface);

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.deepEqual(reviewSurface.structuralManualReviewPreview.unsupportedObservations, [
    {
      itemId: 'unsupported-1',
      structuralKind: 'unsupportedObservation',
      reason: 'REVISION_BRIDGE_STAGE01_UNSUPPORTED_OBSERVATION',
    },
  ]);
  assert.deepEqual(reviewSurface.blockedApplyPlan.applyOps, []);
  assert.equal(reviewSurface.revisionSession.reviewGraph.textChanges.length, 1);
  assert.equal(reviewSurface.revisionSession.reviewGraph.structuralChanges.length, 1);
});

test('review mutate port contract: packet diagnostics are typed and do not activate a session', async () => {
  const port = instantiateReviewMutatePort({ loadRevisionBridgeModule: loadBridge });

  const result = await port.handleReviewSurfaceImportPacketCommandSurface({
    projectId: 'project-1',
    sessionId: 'session-1',
    baselineHash: 'baseline-1',
    reviewPacket: {
      commentThreads: 'not-an-array',
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_REVIEW_SESSION_IMPORT_INVALID');
  assert.equal(result.error.op, 'cmd.project.review.importPacket');
  assert.equal(result.error.reason, 'REVIEW_STAGE01_PREVIEW_DIAGNOSTICS');
  assert.equal(Array.isArray(result.error.details.reasons), true);
  assert.deepEqual(normalizeVmValue(port.readActiveReviewSessionReviewSurface()), {});
  assert.equal(port.getState().activeReviewSessionLifecycle, 'passive');
});

test('review mutate port contract: missing Stage01 builder fails closed as typed diagnostics', async () => {
  const port = instantiateReviewMutatePort({
    loadRevisionBridgeModule: async () => {
      throw new Error('bridge unavailable');
    },
  });

  const result = await port.handleReviewSurfaceImportPacketCommandSurface({
    projectId: 'project-1',
    sessionId: 'session-1',
    baselineHash: 'baseline-1',
    reviewPacket: validReviewPacket(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_REVIEW_SESSION_IMPORT_INVALID');
  assert.equal(result.error.op, 'cmd.project.review.importPacket');
  assert.equal(result.error.reason, 'REVIEW_STAGE01_PREVIEW_BUILDER_UNAVAILABLE');
  assert.equal(result.error.details.message, 'bridge unavailable');
  assert.deepEqual(normalizeVmValue(port.readActiveReviewSessionReviewSurface()), {});
  assert.equal(port.getState().activeReviewSessionLifecycle, 'passive');
});

test('review mutate port contract: preview import path stays storage-free while apply delegates through safe writer', () => {
  const section = extractMarkedSection(readMainSource(), SECTION_START, SECTION_END);
  const previewOnlySection = section.slice(0, section.indexOf('const REVIEW_EXACT_TEXT_APPLY_COMMAND_ID'));
  const forbiddenRuntimeCalls = [
    'writeFileAtomic',
    'writeFlowSceneBatchAtomic',
    'writeBufferAtomic',
    'ensureProjectManifest',
    'resolveProjectBindingForFile',
    'docxMin',
    'buildDocxMinBuffer',
    'runDocxMinExport',
    'markdownImportSafeCreate',
    'applyMarkdownImportSafeCreate',
    'fs.',
    'readFile',
    'writeFile',
  ];

  for (const forbidden of forbiddenRuntimeCalls) {
    assert.equal(previewOnlySection.includes(forbidden), false, `${forbidden} must stay out of review packet preview import`);
  }

  const forbiddenDirectWriteCalls = [
    'writeFileAtomic',
    'writeFlowSceneBatchAtomic',
    'writeBufferAtomic',
    'fileManager.writeFileAtomic',
    'fs.',
    'readFile',
    'writeFile',
  ];
  for (const forbidden of forbiddenDirectWriteCalls) {
    assert.equal(section.includes(forbidden), false, `${forbidden} must stay out of review mutate port section`);
  }

  for (const forbiddenPayloadAccess of [
    /payload\s*\.\s*scenePath/u,
    /payload\s*\.\s*projectRoot/u,
    /payload\s*\.\s*scenePathBySceneId/u,
    /payload\s*\.\s*projectSnapshot/u,
    /payload\s*\.\s*planPreview/u,
    /payload\s*\.\s*plan/u,
    /payload\s*\.\s*applyOps/u,
    /payload\s*\.\s*receipt/u,
  ]) {
    assert.equal(forbiddenPayloadAccess.test(section), false, `${forbiddenPayloadAccess} must not be renderer authority`);
  }
});

test('review mutate port contract: main apply context is main-owned and never renderer snapshot-owned', () => {
  const source = readMainSource();
  const start = source.indexOf('async function buildReviewExactTextApplyInputFromMainState');
  const end = source.indexOf('function mapMarkdownErrorCode', start);
  assert.ok(start > -1 && end > start, 'main-owned apply context builder must exist');
  const snippet = source.slice(start, end);

  assert.equal(snippet.includes('requestEditorSnapshot'), false);
  assert.equal(snippet.includes('readCurrentReviewSurfaceSourceText'), false);
  assert.equal(snippet.includes('buildDerivedReviewSurfacePayload'), false);
  assert.equal(snippet.includes('payload.scenePath'), false);
  assert.equal(snippet.includes('payload.projectRoot'), false);
  assert.equal(snippet.includes('payload.projectSnapshot'), false);
  assert.equal(snippet.includes('fs.readFile(currentFilePath, \'utf8\')'), true);
  assert.equal(snippet.includes('isDirty || autoSaveInProgress'), true);
  assert.equal(snippet.includes('buildExactTextApplyPlanNoDiskPreview'), true);
  assert.equal((snippet.match(/baselineHash: computeHash\(sceneText\)/gu) || []).length, 2);
  assert.equal(snippet.includes('scenePathBySceneId'), true);
});

test('review mutate port contract: import rejects payload without required metadata', async () => {
  const port = instantiateReviewMutatePort();

  const result = await port.handleReviewSurfaceImportPacketCommandSurface({
    reviewSurface: {
      summary: { total: 1 },
    },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(normalizeVmValue(result.error), {
    code: 'E_REVIEW_SESSION_IMPORT_INVALID',
    op: 'cmd.project.review.importPacket',
    reason: 'REVIEW_SESSION_METADATA_REQUIRED',
  });
  assert.deepEqual(normalizeVmValue(port.readActiveReviewSessionReviewSurface()), {});
  assert.equal(port.getState().activeReviewSessionLifecycle, 'passive');
});

test('review mutate port contract: clear closes active session and read returns empty surface', async () => {
  const port = instantiateReviewMutatePort();

  await port.handleReviewSurfaceImportPacketCommandSurface({
    projectId: 'project-1',
    sessionId: 'session-1',
    baselineHash: 'baseline-1',
    reviewSurface: {
      summary: { total: 1 },
    },
  });

  const result = port.handleReviewSurfaceClearSessionCommandSurface();
  const state = port.getState();

  assert.deepEqual(normalizeVmValue(result), {
    ok: true,
    cleared: true,
    hadActiveSession: true,
  });
  assert.equal(state.activeReviewSessionLifecycle, 'cleared');
  assert.equal(state.activeReviewSessionStore, null);
  assert.deepEqual(normalizeVmValue(state.currentReviewSurfacePayload), {});
  assert.equal(state.currentReviewSurfacePayloadSource, 'none');
  assert.equal(state.currentReviewSurfacePayloadContentHash, '');
  assert.deepEqual(normalizeVmValue(port.readActiveReviewSessionReviewSurface()), {});
});

test('review mutate port contract: apply exact text requires active session and rejects renderer authority fields', async () => {
  const port = instantiateReviewMutatePort();

  const noSession = await port.handleReviewSurfaceApplyExactTextChangeCommandSurface({
    projectId: 'project-1',
  });

  assert.deepEqual(normalizeVmValue(noSession), {
    ok: false,
    error: {
      code: 'E_REVIEW_EXACT_TEXT_APPLY_PAYLOAD_INVALID',
      op: 'cmd.project.review.applyExactTextChange',
      reason: 'REVIEW_EXACT_TEXT_APPLY_PAYLOAD_UNSUPPORTED_FIELDS',
      details: {
        fields: ['projectId'],
      },
    },
  });

  const rendererAuthority = await port.handleReviewSurfaceApplyExactTextChangeCommandSurface({
    scenePath: '/tmp/renderer-owned.txt',
    projectId: 'project-1',
  });

  assert.deepEqual(normalizeVmValue(rendererAuthority), {
    ok: false,
    error: {
      code: 'E_REVIEW_EXACT_TEXT_APPLY_PAYLOAD_INVALID',
      op: 'cmd.project.review.applyExactTextChange',
      reason: 'REVIEW_EXACT_TEXT_APPLY_RENDERER_AUTHORITY_DENIED',
      details: {
        fields: ['scenePath'],
      },
    },
  });

  const emptyPayload = await port.handleReviewSurfaceApplyExactTextChangeCommandSurface({});
  assert.equal(emptyPayload.ok, false);
  assert.equal(emptyPayload.error.code, 'E_REVIEW_EXACT_TEXT_APPLY_NO_ACTIVE_SESSION');
  assert.equal(emptyPayload.error.reason, 'REVIEW_EXACT_TEXT_APPLY_NO_ACTIVE_SESSION');
});

test('review mutate port contract: batch exact apply rejects renderer authority fields', async () => {
  const port = instantiateReviewMutatePort();

  const rendererAuthority = await port.handleReviewSurfaceApplyExactTextChangesBatchCommandSurface({
    changeIds: ['text-change-1', 'text-change-2'],
    scenePath: '/tmp/renderer-owned.txt',
  });

  assert.deepEqual(normalizeVmValue(rendererAuthority), {
    ok: false,
    error: {
      code: 'E_REVIEW_EXACT_TEXT_APPLY_BATCH_PAYLOAD_INVALID',
      op: 'cmd.project.review.applyExactTextChangesBatch',
      reason: 'REVIEW_EXACT_TEXT_APPLY_BATCH_RENDERER_AUTHORITY_DENIED',
      details: {
        fields: ['scenePath'],
      },
    },
  });

  const duplicate = await port.handleReviewSurfaceApplyExactTextChangesBatchCommandSurface({
    changeIds: ['text-change-1', 'text-change-1'],
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error.reason, 'REVIEW_EXACT_TEXT_APPLY_BATCH_DUPLICATE_CHANGE_ID');
});

test('review mutate port contract: reconciliation reload accepts operationId intent only', async () => {
  const port = instantiateReviewMutatePort();
  const result = await port.handleReviewExactTextReloadReconciledSceneCommandSurface({
    operationId: 'op_reconcile_1',
    scenePath: '/tmp/renderer-owned.md',
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_REVIEW_EXACT_TEXT_RECONCILIATION_BLOCKED');
  assert.equal(result.error.reason, 'REVIEW_EXACT_TEXT_RECONCILIATION_WRITE_AUTHORITY_DENIED');
});

test('review mutate port contract: apply exact text writes through safe core and exposes receipt on review surface', async () => {
  const port = instantiateReviewMutatePort();
  const { scenePath } = tmpScene('Alpha beta gamma.');
  const revisionSession = validExactApplyRevisionSession({ sceneId: scenePath });
  const applyInput = await buildReadyExactApplyInput({
    scenePath,
    sceneText: 'Alpha beta gamma.',
    revisionSession,
  });

  const importResult = await port.handleReviewSurfaceImportPacketCommandSurface({
    projectId: 'project-1',
    sessionId: 'session-1',
    baselineHash: 'baseline-1',
    reviewSurface: {
      revisionSession,
      summary: { total: 1 },
    },
    revisionSession,
    sourcePacketHash: 'packet-hash-apply-1',
    createdAt: '2026-05-24T12:00:00.000Z',
  });
  assert.equal(importResult.ok, true);

  const result = await port.handleReviewSurfaceApplyExactTextChangeCommandSurface(
    { changeId: 'text-change-1' },
    {
      buildReviewExactTextApplyInput: async () => ({ ok: true, input: applyInput }),
      loadExactTextMinSafeWriteModule: loadExactSafeWrite,
      safeWriteOptions: { now: () => 1700000000000 },
    },
  );

  const value = normalizeVmValue(result);
  const state = normalizeVmValue(port.getState());

  assert.equal(value.ok, true);
  assert.equal(value.applied, true);
  assert.equal(readText(scenePath), 'Alpha delta gamma.');
  assert.equal(value.receipt.projectId, 'project-1');
  assert.equal(value.receipt.sessionId, 'session-1');
  assert.equal(value.receipt.sceneId, scenePath);
  assert.equal(value.receipt.changeId, 'text-change-1');
  assert.equal(value.receipt.writeStatus, 'applied');
  assert.equal(value.reviewSurface.receipt.transactionId, value.receipt.transactionId);
  assert.equal(value.reviewSurface.exactTextApplyResult.applied, true);
  assert.equal(value.reviewSurface.exactTextApplyResult.status, 'applied');
  assert.equal(state.currentReviewSurfacePayloadSource, 'session');
  assert.equal(state.activeReviewSessionStore.lastExactTextApplyReceipt.transactionId, value.receipt.transactionId);
  assert.equal(state.currentReviewSurfacePayload.receipt.transactionId, value.receipt.transactionId);
  assert.equal(normalizeVmValue(port.readActiveReviewSessionReviewSurface()).receipt.transactionId, value.receipt.transactionId);

  let duplicateBuildCalled = false;
  let duplicateSafeWriteLoaded = false;
  const duplicate = await port.handleReviewSurfaceApplyExactTextChangeCommandSurface(
    { changeId: 'text-change-1' },
    {
      buildReviewExactTextApplyInput: async () => {
        duplicateBuildCalled = true;
        return {
          ok: false,
          code: 'E_REVIEW_EXACT_TEXT_APPLY_CONTEXT_BLOCKED',
          reason: 'REVIEW_EXACT_TEXT_APPLY_PLAN_BLOCKED',
          details: {
            planReason: 'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_NO_MATCH',
          },
        };
      },
      loadExactTextMinSafeWriteModule: async () => {
        duplicateSafeWriteLoaded = true;
        return loadExactSafeWrite();
      },
    },
  );
  const duplicateState = normalizeVmValue(port.getState());

  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error.code, 'E_REVIEW_EXACT_TEXT_APPLY_BLOCKED');
  assert.equal(duplicate.error.reason, 'REVIEW_EXACT_TEXT_APPLY_ALREADY_APPLIED');
  assert.equal(duplicate.error.details.changeId, 'text-change-1');
  assert.equal(duplicate.error.details.transactionId, value.receipt.transactionId);
  assert.equal(duplicate.error.details.livePlanStatus, 'blocked');
  assert.equal(duplicate.error.details.livePlanReason, 'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_NO_MATCH');
  assert.equal(duplicateBuildCalled, true);
  assert.equal(duplicateSafeWriteLoaded, false);
  assert.equal(readText(scenePath), 'Alpha delta gamma.');
  assert.equal(duplicateState.currentReviewSurfacePayload.receipt.transactionId, value.receipt.transactionId);
});

test('review mutate port contract: batch exact apply writes same-scene changes through one safe writer result', async () => {
  const port = instantiateReviewMutatePort();
  const { scenePath } = tmpScene('Alpha beta gamma omega.');
  const revisionSession = validExactApplyRevisionSession({
    sceneId: scenePath,
    textChanges: [
      {
        ...validTextChange(),
        changeId: 'text-change-1',
        targetScope: { type: 'scene', id: scenePath },
        match: { kind: 'exact', quote: 'beta', prefix: '', suffix: '' },
        replacementText: 'delta',
      },
      {
        ...validTextChange(),
        changeId: 'text-change-2',
        targetScope: { type: 'scene', id: scenePath },
        match: { kind: 'exact', quote: 'omega', prefix: '', suffix: '' },
        replacementText: 'sigma',
      },
    ],
  });
  const applyInput = buildBatchExactApplyInput({
    scenePath,
    sceneText: 'Alpha beta gamma omega.',
    revisionSession,
  });

  const importResult = await port.handleReviewSurfaceImportPacketCommandSurface({
    projectId: 'project-1',
    sessionId: 'session-1',
    baselineHash: 'baseline-1',
    reviewSurface: {
      revisionSession,
      summary: { total: 2 },
    },
    revisionSession,
    sourcePacketHash: 'packet-hash-batch-apply-1',
    createdAt: '2026-05-24T12:00:00.000Z',
  });
  assert.equal(importResult.ok, true);

  let canonicalReload = null;
  const result = await port.handleReviewSurfaceApplyExactTextChangesBatchCommandSurface(
    { changeIds: ['text-change-1', 'text-change-2'] },
    {
      buildReviewExactTextApplyBatchInput: async (request) => {
        assert.deepEqual(
          normalizeVmValue(request.textChanges.map((change) => change.changeId)),
          ['text-change-1', 'text-change-2'],
        );
        return { ok: true, input: applyInput };
      },
      loadExactTextMinSafeWriteModule: loadExactSafeWrite,
      safeWriteOptions: { now: () => 1700000010000 },
      syncReviewExactTextApplyEditor: async (request) => {
        canonicalReload = cloneJsonSafe(request);
        return { ok: true, skipped: false, contentHash: 'canonical-after-batch' };
      },
    },
  );

  const value = normalizeVmValue(result);
  const state = normalizeVmValue(port.getState());

  assert.equal(value.ok, true);
  assert.equal(value.batch, true);
  assert.equal(value.applied, true);
  assert.equal(value.status, 'applied');
  assert.deepEqual(value.changes.map((change) => change.changeId), ['text-change-1', 'text-change-2']);
  assert.equal(readText(scenePath), 'Alpha delta gamma sigma.');
  assert.deepEqual(value.reviewSurface.exactTextAppliedChangeIds, ['text-change-1', 'text-change-2']);
  assert.equal(value.reviewSurface.exactTextBatchApplyResult.applied, true);
  assert.equal(value.reviewSurface.exactTextBatchApplyResult.status, 'applied');
  assert.equal(value.editorSync.ok, true);
  assert.equal(value.editorSync.contentHash, 'canonical-after-batch');
  assert.equal(canonicalReload.applyInput.scenePath, scenePath);
  assert.equal(canonicalReload.receipt.operationKind, 'replaceExactTextBatch');
  assert.equal(Object.prototype.hasOwnProperty.call(value.reviewSurface, 'receipt'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(state.currentReviewSurfacePayload, 'receipt'), false);
  assert.equal(state.activeReviewSessionStore.lastExactTextApplyBatchResult.applied, true);
});

test('review mutate port contract: duplicate apply after external revert revalidates live context but does not write', async () => {
  const port = instantiateReviewMutatePort();
  const { scenePath } = tmpScene('Alpha beta gamma.');
  const revisionSession = validExactApplyRevisionSession({ sceneId: scenePath });
  const applyInput = await buildReadyExactApplyInput({
    scenePath,
    sceneText: 'Alpha beta gamma.',
    revisionSession,
  });

  const importResult = await port.handleReviewSurfaceImportPacketCommandSurface({
    projectId: 'project-1',
    sessionId: 'session-1',
    baselineHash: 'baseline-1',
    reviewSurface: {
      revisionSession,
      summary: { total: 1 },
    },
    revisionSession,
    sourcePacketHash: 'packet-hash-apply-external-revert',
    createdAt: '2026-05-24T12:00:00.000Z',
  });
  assert.equal(importResult.ok, true);

  const first = normalizeVmValue(await port.handleReviewSurfaceApplyExactTextChangeCommandSurface(
    { changeId: 'text-change-1' },
    {
      buildReviewExactTextApplyInput: async () => ({ ok: true, input: applyInput }),
      loadExactTextMinSafeWriteModule: loadExactSafeWrite,
      safeWriteOptions: { now: () => 1700000000000 },
    },
  ));
  assert.equal(first.ok, true);
  assert.equal(readText(scenePath), 'Alpha delta gamma.');

  fs.writeFileSync(scenePath, 'Alpha beta gamma.', 'utf8');
  let liveContextReadRevertedBytes = false;
  let duplicateSafeWriteLoaded = false;
  const duplicate = normalizeVmValue(await port.handleReviewSurfaceApplyExactTextChangeCommandSurface(
    { changeId: 'text-change-1' },
    {
      buildReviewExactTextApplyInput: async () => {
        liveContextReadRevertedBytes = readText(scenePath) === 'Alpha beta gamma.';
        return { ok: true, input: applyInput };
      },
      loadExactTextMinSafeWriteModule: async () => {
        duplicateSafeWriteLoaded = true;
        return loadExactSafeWrite();
      },
    },
  ));

  assert.equal(liveContextReadRevertedBytes, true);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error.reason, 'REVIEW_EXACT_TEXT_APPLY_ALREADY_APPLIED');
  assert.equal(duplicate.error.details.livePlanStatus, 'ready');
  assert.equal(duplicateSafeWriteLoaded, false);
  assert.equal(readText(scenePath), 'Alpha beta gamma.');
  assert.equal(
    normalizeVmValue(port.readActiveReviewSessionReviewSurface()).receipt.transactionId,
    first.receipt.transactionId,
  );
});

test('review mutate port contract: apply exact text blocks structural and multi-change sessions before write context', async () => {
  const port = instantiateReviewMutatePort();
  const buildContext = async () => {
    throw new Error('context builder must not be called');
  };

  await port.handleReviewSurfaceImportPacketCommandSurface({
    projectId: 'project-1',
    sessionId: 'session-1',
    baselineHash: 'baseline-1',
    reviewSurface: { summary: { total: 1 } },
    revisionSession: validExactApplyRevisionSession({
      structuralChanges: [{ structuralChangeId: 'structural-1', kind: 'split-scene' }],
    }),
  });
  const structural = await port.handleReviewSurfaceApplyExactTextChangeCommandSurface({}, {
    buildReviewExactTextApplyInput: buildContext,
    loadExactTextMinSafeWriteModule: loadExactSafeWrite,
  });
  assert.equal(structural.ok, false);
  assert.equal(structural.error.reason, 'REVIEW_EXACT_TEXT_APPLY_STRUCTURAL_CHANGE_BLOCKED');

  await port.handleReviewSurfaceImportPacketCommandSurface({
    projectId: 'project-1',
    sessionId: 'session-2',
    baselineHash: 'baseline-1',
    reviewSurface: { summary: { total: 2 } },
    revisionSession: validExactApplyRevisionSession({
      textChanges: [
        validTextChange(),
        {
          ...validTextChange(),
          changeId: 'text-change-2',
          match: { kind: 'exact', quote: 'another', prefix: '', suffix: '' },
          replacementText: 'other',
        },
      ],
    }),
  });
  const multi = await port.handleReviewSurfaceApplyExactTextChangeCommandSurface({}, {
    buildReviewExactTextApplyInput: buildContext,
    loadExactTextMinSafeWriteModule: loadExactSafeWrite,
  });
  assert.equal(multi.ok, false);
  assert.equal(multi.error.reason, 'REVIEW_EXACT_TEXT_APPLY_SINGLE_TEXT_CHANGE_REQUIRED');
});

test('review mutate port contract: blocked safe-write result does not attach receipt', async () => {
  const port = instantiateReviewMutatePort();

  await port.handleReviewSurfaceImportPacketCommandSurface({
    projectId: 'project-1',
    sessionId: 'session-1',
    baselineHash: 'baseline-1',
    reviewSurface: {
      summary: { total: 1 },
    },
    revisionSession: validExactApplyRevisionSession(),
  });

  const result = await port.handleReviewSurfaceApplyExactTextChangeCommandSurface({}, {
    buildReviewExactTextApplyInput: async () => ({ ok: true, input: { fake: true } }),
    loadExactTextMinSafeWriteModule: async () => ({
      applyExactTextMinSafeWrite: async () => ({
        ok: false,
        status: 'blocked',
        code: 'E_FAKE_BLOCKED',
        reason: 'FAKE_BLOCKED_REASON',
        applied: false,
        reasons: [
          {
            code: 'FAKE_BLOCKED_REASON',
            field: 'scenePath',
            message: 'blocked in test',
          },
        ],
      }),
    }),
  });
  const state = normalizeVmValue(port.getState());

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_FAKE_BLOCKED');
  assert.equal(result.error.reason, 'FAKE_BLOCKED_REASON');
  assert.equal(Object.prototype.hasOwnProperty.call(state.currentReviewSurfacePayload, 'receipt'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(
    normalizeVmValue(port.readActiveReviewSessionReviewSurface()),
    'receipt',
  ), false);
});

test('review mutate port contract: applied-without-receipt is surfaced as reconciliation, never false failed', async () => {
  const port = instantiateReviewMutatePort();
  await port.handleReviewSurfaceImportPacketCommandSurface({
    projectId: 'project-1',
    sessionId: 'session-1',
    baselineHash: 'baseline-1',
    reviewSurface: { summary: { total: 1 } },
    revisionSession: validExactApplyRevisionSession(),
  });
  const reconciliation = {
    schemaVersion: 'revision-bridge.exact-text-apply-reconciliation.v1',
    operationId: 'op_ambiguous_1',
    status: 'reconciled',
    previousStatus: 'applied',
    outcome: 'applied_receipt_missing',
    ambiguous: true,
    projectId: 'project-1',
    sessionId: 'session-1',
    sceneId: 'scene-1',
    changeIds: ['text-change-1'],
    sceneRelativePath: 'roman/scene.md',
    recoveryVerified: true,
    snapshotAvailable: true,
    safeActions: ['RELOAD_CANONICAL'],
  };

  const result = await port.handleReviewSurfaceApplyExactTextChangeCommandSurface({}, {
    buildReviewExactTextApplyInput: async () => ({ ok: true, input: { fake: true } }),
    loadExactTextMinSafeWriteModule: async () => ({
      applyExactTextMinSafeWrite: async () => ({
        ok: false,
        status: 'ambiguous',
        code: 'E_REVISION_BRIDGE_EXACT_TEXT_APPLY_OUTCOME_AMBIGUOUS',
        reason: 'REVISION_BRIDGE_EXACT_TEXT_APPLY_APPLIED_RECEIPT_MISSING',
        applied: false,
        receipt: null,
        reasons: [],
        reconciliation,
      }),
    }),
  });
  const surface = normalizeVmValue(port.readActiveReviewSessionReviewSurface());

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_REVISION_BRIDGE_EXACT_TEXT_APPLY_OUTCOME_AMBIGUOUS');
  assert.equal(result.error.reason, 'REVISION_BRIDGE_EXACT_TEXT_APPLY_APPLIED_RECEIPT_MISSING');
  assert.equal(result.reviewSurface.exactTextApplyReconciliation.items[0].operationId, 'op_ambiguous_1');
  assert.equal(surface.exactTextApplyReconciliation.items[0].outcome, 'applied_receipt_missing');
  assert.equal(Object.prototype.hasOwnProperty.call(surface, 'receipt'), false);
});

test('review mutate port contract: stale no-match exact apply stays blocked without receipt invention', async () => {
  const port = instantiateReviewMutatePort();

  await port.handleReviewSurfaceImportPacketCommandSurface({
    projectId: 'project-1',
    sessionId: 'session-1',
    baselineHash: 'baseline-1',
    reviewSurface: {
      summary: { total: 1 },
    },
    revisionSession: validExactApplyRevisionSession(),
  });

  const result = await port.handleReviewSurfaceApplyExactTextChangeCommandSurface({}, {
    buildReviewExactTextApplyInput: async () => ({ ok: true, input: { fake: true } }),
    loadExactTextMinSafeWriteModule: async () => ({
      applyExactTextMinSafeWrite: async () => ({
        ok: false,
        status: 'blocked',
        code: 'E_REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_BLOCKED',
        reason: 'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_NO_MATCH',
        applied: false,
        reasons: [
          {
            code: 'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_NO_MATCH',
            field: 'reviewItem.match.quote',
            message: 'Exact quote no longer matches current scene text.',
          },
        ],
      }),
    }),
  });
  const state = normalizeVmValue(port.getState());

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_BLOCKED');
  assert.equal(result.error.reason, 'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_NO_MATCH');
  assert.equal(Object.prototype.hasOwnProperty.call(state.currentReviewSurfacePayload, 'receipt'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(state.currentReviewSurfacePayload, 'exactTextApplyResult'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(
    normalizeVmValue(port.readActiveReviewSessionReviewSurface()),
    'receipt',
  ), false);
});

test('review mutate port contract: stale no-match batch apply stays blocked without applied evidence', async () => {
  const port = instantiateReviewMutatePort();

  await port.handleReviewSurfaceImportPacketCommandSurface({
    projectId: 'project-1',
    sessionId: 'session-1',
    baselineHash: 'baseline-1',
    reviewSurface: {
      summary: { total: 2 },
    },
    revisionSession: validExactApplyRevisionSession({
      textChanges: [
        validTextChange(),
        {
          ...validTextChange(),
          changeId: 'text-change-2',
          match: { kind: 'exact', quote: 'omega', prefix: '', suffix: '' },
          replacementText: 'sigma',
        },
      ],
    }),
  });

  const result = await port.handleReviewSurfaceApplyExactTextChangesBatchCommandSurface(
    { changeIds: ['text-change-1', 'text-change-2'] },
    {
      buildReviewExactTextApplyBatchInput: async () => ({ ok: true, input: { fake: true } }),
      loadExactTextMinSafeWriteModule: async () => ({
        applyExactTextBatchMinSafeWrite: async () => ({
          ok: false,
          status: 'blocked',
          code: 'E_REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_BLOCKED',
          reason: 'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_CURRENT_NO_MATCH',
          applied: false,
          reasons: [
            {
              code: 'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_CURRENT_NO_MATCH',
              field: 'reviewItems.match.quote',
              message: 'expectedText is not present in current batch text',
              changeId: 'text-change-2',
            },
          ],
        }),
      }),
    },
  );
  const state = normalizeVmValue(port.getState());

  assert.equal(result.ok, true);
  assert.equal(result.batch, true);
  assert.equal(result.applied, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_CURRENT_NO_MATCH');
  assert.equal(Object.prototype.hasOwnProperty.call(state.currentReviewSurfacePayload, 'receipt'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(state.currentReviewSurfacePayload, 'exactTextAppliedChangeIds'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(state.currentReviewSurfacePayload, 'exactTextBatchApplyResult'), false);
});

test('review mutate port contract: batch exact apply blocks cross-scene requests before safe writer load', async () => {
  const port = instantiateReviewMutatePort();

  await port.handleReviewSurfaceImportPacketCommandSurface({
    projectId: 'project-1',
    sessionId: 'session-1',
    baselineHash: 'baseline-1',
    reviewSurface: {
      summary: { total: 2 },
    },
    revisionSession: validExactApplyRevisionSession({
      textChanges: [
        validTextChange(),
        {
          ...validTextChange(),
          changeId: 'text-change-2',
          targetScope: { type: 'scene', id: 'scene-2' },
          match: { kind: 'exact', quote: 'omega', prefix: '', suffix: '' },
          replacementText: 'sigma',
        },
      ],
    }),
  });

  let buildCalled = false;
  let safeWriterLoaded = false;
  const result = await port.handleReviewSurfaceApplyExactTextChangesBatchCommandSurface(
    { changeIds: ['text-change-1', 'text-change-2'] },
    {
      buildReviewExactTextApplyBatchInput: async () => {
        buildCalled = true;
        throw new Error('cross-scene batch must not build write context');
      },
      loadExactTextMinSafeWriteModule: async () => {
        safeWriterLoaded = true;
        return loadExactSafeWrite();
      },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.reason, 'REVIEW_EXACT_TEXT_APPLY_BATCH_SINGLE_SCENE_REQUIRED');
  assert.equal(buildCalled, false);
  assert.equal(safeWriterLoaded, false);
});

test('review mutate port contract: queue-time dirty block stays non-mutating and receipt-free', async () => {
  const port = instantiateReviewMutatePort();

  await port.handleReviewSurfaceImportPacketCommandSurface({
    projectId: 'project-1',
    sessionId: 'session-1',
    baselineHash: 'baseline-1',
    reviewSurface: {
      summary: { total: 1 },
    },
    revisionSession: validExactApplyRevisionSession(),
  });

  let safeWriteAsked = false;
  const result = await port.handleReviewSurfaceApplyExactTextChangeCommandSurface({}, {
    buildReviewExactTextApplyInput: async () => ({ ok: true, input: { fake: true } }),
    loadExactTextMinSafeWriteModule: async () => ({
      applyExactTextMinSafeWrite: async () => {
        throw new Error('safe writer must be wrapped by queue guard');
      },
    }),
    runReviewExactTextSafeWrite: async () => {
      safeWriteAsked = true;
      return {
        ok: false,
        status: 'blocked',
        code: 'E_REVIEW_EXACT_TEXT_APPLY_BLOCKED',
        reason: 'REVIEW_EXACT_TEXT_APPLY_DIRTY_EDITOR_BLOCKED',
        applied: false,
        reasons: [
          {
            code: 'REVIEW_EXACT_TEXT_APPLY_DIRTY_EDITOR_BLOCKED',
            field: 'editor',
            message: 'Editor became dirty before queued write.',
          },
        ],
      };
    },
  });
  const state = normalizeVmValue(port.getState());

  assert.equal(safeWriteAsked, true);
  assert.equal(result.ok, false);
  assert.equal(result.error.reason, 'REVIEW_EXACT_TEXT_APPLY_DIRTY_EDITOR_BLOCKED');
  assert.equal(Object.prototype.hasOwnProperty.call(state.currentReviewSurfacePayload, 'receipt'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(state.currentReviewSurfacePayload, 'exactTextApplyResult'), false);
});

test('review mutate port contract: queue-time dirty batch block stays non-mutating and evidence-free', async () => {
  const port = instantiateReviewMutatePort();

  await port.handleReviewSurfaceImportPacketCommandSurface({
    projectId: 'project-1',
    sessionId: 'session-1',
    baselineHash: 'baseline-1',
    reviewSurface: {
      summary: { total: 2 },
    },
    revisionSession: validExactApplyRevisionSession({
      textChanges: [
        validTextChange(),
        {
          ...validTextChange(),
          changeId: 'text-change-2',
          match: { kind: 'exact', quote: 'omega', prefix: '', suffix: '' },
          replacementText: 'sigma',
        },
      ],
    }),
  });

  let safeWriteAsked = false;
  const result = await port.handleReviewSurfaceApplyExactTextChangesBatchCommandSurface(
    { changeIds: ['text-change-1', 'text-change-2'] },
    {
      buildReviewExactTextApplyBatchInput: async () => ({ ok: true, input: { fake: true } }),
      loadExactTextMinSafeWriteModule: async () => ({
        applyExactTextBatchMinSafeWrite: async () => {
          throw new Error('batch safe writer must be wrapped by queue guard');
        },
      }),
      runReviewExactTextBatchSafeWrite: async () => {
        safeWriteAsked = true;
        return {
          ok: false,
          status: 'blocked',
          code: 'E_REVIEW_EXACT_TEXT_APPLY_BLOCKED',
          reason: 'REVIEW_EXACT_TEXT_APPLY_DIRTY_EDITOR_BLOCKED',
          applied: false,
          reasons: [
            {
              code: 'REVIEW_EXACT_TEXT_APPLY_DIRTY_EDITOR_BLOCKED',
              field: 'editor',
              message: 'Editor became dirty before queued batch write.',
            },
          ],
        };
      },
    },
  );
  const state = normalizeVmValue(port.getState());

  assert.equal(safeWriteAsked, true);
  assert.equal(result.ok, true);
  assert.equal(result.applied, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'REVIEW_EXACT_TEXT_APPLY_DIRTY_EDITOR_BLOCKED');
  assert.equal(Object.prototype.hasOwnProperty.call(state.currentReviewSurfacePayload, 'receipt'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(state.currentReviewSurfacePayload, 'exactTextBatchApplyResult'), false);
});
