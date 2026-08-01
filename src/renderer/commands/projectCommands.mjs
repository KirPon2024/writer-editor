import { COMMAND_CATALOG_V1, getCommandCatalogById } from './command-catalog.v1.mjs';
import productCommandRegistry from '../../shared/productCommandRegistry.cjs';
import {
  buildCommandOperationPlan,
  captureCommandEffectCapabilities,
  persistCommandOperationPlan,
  unwrapBridgeResponseValue,
} from './commandEffectModel.mjs';

const {
  PRODUCT_COMMAND_RECORDS,
  getProductCommandRecord,
} = productCommandRegistry;

const COMMAND_KEY_TO_ID = Object.freeze(
  Object.fromEntries(COMMAND_CATALOG_V1.map((entry) => [entry.key, entry.id])),
);

export const COMMAND_IDS = Object.freeze({
  PROJECT_OPEN: COMMAND_KEY_TO_ID.PROJECT_OPEN,
  PROJECT_SAVE: COMMAND_KEY_TO_ID.PROJECT_SAVE,
  PROJECT_EXPORT_DOCX_MIN: COMMAND_KEY_TO_ID.PROJECT_EXPORT_DOCX_MIN,
  PROJECT_EXPORT_PDF_V1: COMMAND_KEY_TO_ID.PROJECT_EXPORT_PDF_V1,
  PROJECT_EXPORT_FULL_ARCHIVE_V1: COMMAND_KEY_TO_ID.PROJECT_EXPORT_FULL_ARCHIVE_V1,
  PROJECT_IMPORT_FULL_ARCHIVE_V1: COMMAND_KEY_TO_ID.PROJECT_IMPORT_FULL_ARCHIVE_V1,
  PROJECT_IMPORT_MARKDOWN_V1: COMMAND_KEY_TO_ID.PROJECT_IMPORT_MARKDOWN_V1,
  PROJECT_IMPORT_DOCX_V1: COMMAND_KEY_TO_ID.PROJECT_IMPORT_DOCX_V1,
  PROJECT_IMPORT_TXT_V1: COMMAND_KEY_TO_ID.PROJECT_IMPORT_TXT_V1,
  PROJECT_EXPORT_MARKDOWN_V1: COMMAND_KEY_TO_ID.PROJECT_EXPORT_MARKDOWN_V1,
  PROJECT_FLOW_OPEN_V1: COMMAND_KEY_TO_ID.PROJECT_FLOW_OPEN_V1,
  PROJECT_FLOW_SAVE_V1: COMMAND_KEY_TO_ID.PROJECT_FLOW_SAVE_V1,
});

export const EXTRA_COMMAND_IDS = Object.freeze({
  PROJECT_NEW: 'cmd.project.new',
  PROJECT_LIFECYCLE_CREATE: 'cmd.project.lifecycle.create',
  PROJECT_LIFECYCLE_OPEN: 'cmd.project.lifecycle.open',
  PROJECT_LIFECYCLE_CONTINUE: 'cmd.project.lifecycle.continue',
  PROJECT_LIFECYCLE_RENAME: 'cmd.project.lifecycle.rename',
  PROJECT_LIFECYCLE_DUPLICATE: 'cmd.project.lifecycle.duplicate',
  PROJECT_LIFECYCLE_MOVE_LOCATION: 'cmd.project.lifecycle.moveLocation',
  PROJECT_LIFECYCLE_ARCHIVE: 'cmd.project.lifecycle.archive',
  PROJECT_LIFECYCLE_TRASH: 'cmd.project.lifecycle.trash',
  PROJECT_LIFECYCLE_RESTORE: 'cmd.project.lifecycle.restore',
  PROJECT_LIFECYCLE_BACKUP: 'cmd.project.lifecycle.createBackup',
  PROJECT_LIFECYCLE_INTEGRITY: 'cmd.project.lifecycle.inspectIntegrity',
  PROJECT_DOCUMENT_OPEN: 'cmd.project.document.open',
  PROJECT_EXPORT_CURRENT_SCENE_TXT: 'cmd.project.exportCurrentSceneTxtV1',
  PROJECT_EXPORT_SELECTED_SCENES_TXT: 'cmd.project.exportSelectedScenesTxtV1',
  PROJECT_EXPORT_ALL_SCENES_TXT: 'cmd.project.exportAllScenesTxtV1',
  PROJECT_SAVE_AS: 'cmd.project.saveAs',
  PROJECT_VIEW_SET_MENU_PRESENTATION_CLASSIC: 'cmd.project.view.setMenuPresentationClassic',
  PROJECT_VIEW_SET_MENU_PRESENTATION_COMPACT: 'cmd.project.view.setMenuPresentationCompact',
  PROJECT_VIEW_SET_MENU_LOCALE_BASE: 'cmd.project.view.setMenuLocaleBase',
  PROJECT_VIEW_SET_MENU_LOCALE_RU: 'cmd.project.view.setMenuLocaleRu',
  PROJECT_VIEW_SET_MENU_LOCALE_EN: 'cmd.project.view.setMenuLocaleEn',
  PROJECT_VIEW_RESET_MENU_CUSTOMIZATION: 'cmd.project.view.resetMenuCustomization',
  VIEW_OPEN_SETTINGS: 'cmd.project.view.openSettings',
  VIEW_SAFE_RESET: 'cmd.project.view.safeReset',
  VIEW_RESTORE_LAST_STABLE: 'cmd.project.view.restoreLastStable',
  TOOLS_OPEN_DIAGNOSTICS: 'cmd.project.tools.openDiagnostics',
  REVIEW_OPEN_RECOVERY: 'cmd.project.review.openRecovery',
  PLAN_SWITCH_MODE: 'cmd.project.plan.switchMode',
  REVIEW_SWITCH_MODE: 'cmd.project.review.switchMode',
  WINDOW_SWITCH_MODE_WRITE: 'cmd.project.window.switchModeWrite',
  TREE_CREATE_NODE: 'cmd.project.tree.createNode',
  TREE_RENAME_NODE: 'cmd.project.tree.renameNode',
  TREE_DELETE_NODE: 'cmd.project.tree.deleteNode',
  TREE_REORDER_NODE: 'cmd.project.tree.reorderNode',
  TREE_MOVE_NODE: 'cmd.project.tree.moveNode',
  METADATA_UPDATE: 'cmd.project.metadata.update',
  NOTES_CREATE: 'cmd.project.notes.create',
  NOTES_UPDATE: 'cmd.project.notes.update',
  NOTES_DELETE: 'cmd.project.notes.delete',
  NOTES_RESTORE: 'cmd.project.notes.restore',
  NOTES_ATTACH_SCENE: 'cmd.project.notes.attachToScene',
  NOTES_CONVERT_SCENE: 'cmd.project.notes.convertToScene',
  EDIT_UNDO: 'cmd.project.edit.undo',
  EDIT_REDO: 'cmd.project.edit.redo',
  EDIT_FIND: 'cmd.project.edit.find',
  EDIT_REPLACE: 'cmd.project.edit.replace',
  EDIT_REPLACE_SINGLE_SAFE: 'cmd.project.edit.replaceSingleSafe',
  EDIT_REPLACE_MASS_PREVIEW: 'cmd.project.edit.replaceMassPreview',
  EDIT_REPLACE_MASS_APPLY: 'cmd.project.edit.replaceMassApply',
  EDIT_REPLACE_MASS_ROLLBACK: 'cmd.project.edit.replaceMassRollback',
  HISTORY_CREATE_CHECKPOINT: 'cmd.project.history.createCheckpoint',
  HISTORY_RESTORE_PREVIEW: 'cmd.project.history.restorePreview',
  HISTORY_RESTORE_APPLY: 'cmd.project.history.restoreApply',
  HISTORY_RESTORE_UNDO: 'cmd.project.history.restoreUndo',
  VIEW_ZOOM_OUT: 'cmd.project.view.zoomOut',
  VIEW_ZOOM_IN: 'cmd.project.view.zoomIn',
  VIEW_TOGGLE_WRAP: 'cmd.project.view.toggleWrap',
  VIEW_PREVIEW_FORMAT_A4: 'cmd.project.view.previewFormatA4',
  VIEW_PREVIEW_FORMAT_A5: 'cmd.project.view.previewFormatA5',
  VIEW_PREVIEW_FORMAT_LETTER: 'cmd.project.view.previewFormatLetter',
  VIEW_PREVIEW_ORIENTATION_PORTRAIT: 'cmd.project.view.previewOrientationPortrait',
  VIEW_PREVIEW_ORIENTATION_LANDSCAPE: 'cmd.project.view.previewOrientationLandscape',
  VIEW_TOGGLE_PREVIEW: 'cmd.project.view.togglePreview',
  VIEW_TOGGLE_PREVIEW_FRAME: 'cmd.project.view.togglePreviewFrame',
  INSERT_MARKDOWN_PROMPT: 'cmd.project.insert.markdownPrompt',
  INSERT_FLOW_OPEN: 'cmd.project.insert.flowOpen',
  INSERT_ADD_CARD: 'cmd.project.insert.addCard',
  FORMAT_TOGGLE_BOLD: 'cmd.project.format.toggleBold',
  FORMAT_TOGGLE_ITALIC: 'cmd.project.format.toggleItalic',
  FORMAT_TOGGLE_UNDERLINE: 'cmd.project.format.toggleUnderline',
  FORMAT_TEXT_COLOR_PICKER: 'cmd.project.format.textColorPicker',
  FORMAT_HIGHLIGHT_COLOR_PICKER: 'cmd.project.format.highlightColorPicker',
  FORMAT_ALIGN_LEFT: 'cmd.project.format.alignLeft',
  FORMAT_ALIGN_CENTER: 'cmd.project.format.alignCenter',
  FORMAT_ALIGN_RIGHT: 'cmd.project.format.alignRight',
  FORMAT_ALIGN_JUSTIFY: 'cmd.project.format.alignJustify',
  LIST_TOGGLE_BULLET: 'cmd.project.list.toggleBullet',
  LIST_TOGGLE_ORDERED: 'cmd.project.list.toggleOrdered',
  LIST_CLEAR: 'cmd.project.list.clear',
  INSERT_LINK_PROMPT: 'cmd.project.insert.linkPrompt',
  REVIEW_IMPORT_LOCAL_PACKET: 'cmd.project.review.importLocalPacket',
  REVIEW_EXPORT_LOCAL_PACKET: 'cmd.project.review.exportLocalPacket',
  REVIEW_EXPORT_DOCX_REVIEW_PACKET: 'cmd.project.review.exportDocxReviewPacket',
  REVIEW_OPEN_DOCX_REVIEW_PREVIEW_SESSION: 'cmd.project.review.openDocxReviewPreviewSession',
  REVIEW_OPEN_COMMENTS: 'cmd.project.review.openComments',
  REVIEW_CLEAR_SESSION: 'cmd.project.review.clearSession',
  REVIEW_CANCEL_OPERATION: 'cmd.project.review.cancelOperation',
  PLAN_FLOW_SAVE: 'cmd.project.plan.flowSave',
  REVIEW_EXPORT_MARKDOWN: 'cmd.project.review.exportMarkdown',
  PROJECT_DOCX_PREVIEW_LOCAL_FILE: 'cmd.project.docx.previewLocalFile',
  PROJECT_DOCX_PREVIEW_IMPORT_PLAN: 'cmd.project.docx.previewImportPlan',
  PROJECT_DOCX_IMPORT_SAFE_CREATE: 'cmd.project.docx.importSafeCreate',
  PROJECT_TXT_PREVIEW_LOCAL_FILE: 'cmd.project.txt.previewLocalFile',
  PROJECT_TXT_IMPORT_SAFE_CREATE: 'cmd.project.txt.importSafeCreate',
});

export const UI_COMMAND_IDS = Object.freeze({
  THEME_SET: 'cmd.ui.theme.set',
  FONT_SET: 'cmd.ui.font.set',
  FONT_SIZE_SET: 'cmd.ui.fontSize.set',
});

export const LEGACY_ACTION_TO_COMMAND = Object.freeze({
  new: 'cmd.project.new',
  open: 'cmd.project.open',
  openDocument: 'cmd.project.open',
  save: 'cmd.project.save',
  saveDocument: 'cmd.project.save',
  'save-as': 'cmd.project.saveAs',
  undo: 'cmd.project.edit.undo',
  redo: 'cmd.project.edit.redo',
  find: 'cmd.project.edit.find',
  search: 'cmd.project.edit.find',
  replace: 'cmd.project.edit.replace',
  'zoom-out': 'cmd.project.view.zoomOut',
  'zoom-in': 'cmd.project.view.zoomIn',
  'toggle-wrap': 'cmd.project.view.toggleWrap',
  'switch-preview-format-a4': 'cmd.project.view.previewFormatA4',
  'switch-preview-format-a5': 'cmd.project.view.previewFormatA5',
  'switch-preview-format-letter': 'cmd.project.view.previewFormatLetter',
  'switch-preview-orientation-portrait': 'cmd.project.view.previewOrientationPortrait',
  'switch-preview-orientation-landscape': 'cmd.project.view.previewOrientationLandscape',
  'toggle-preview': 'cmd.project.view.togglePreview',
  'toggle-preview-frame': 'cmd.project.view.togglePreviewFrame',
  'import-markdown-v1': 'cmd.project.insert.markdownPrompt',
  'flow-open-v1': 'cmd.project.insert.flowOpen',
  'add-card': 'cmd.project.insert.addCard',
  'format-bold': 'cmd.project.format.toggleBold',
  'format-italic': 'cmd.project.format.toggleItalic',
  'format-underline': 'cmd.project.format.toggleUnderline',
  'format-text-color': 'cmd.project.format.textColorPicker',
  'format-highlight': 'cmd.project.format.highlightColorPicker',
  'align-left': 'cmd.project.format.alignLeft',
  'align-center': 'cmd.project.format.alignCenter',
  'align-right': 'cmd.project.format.alignRight',
  'align-justify': 'cmd.project.format.alignJustify',
  'list-bullet': 'cmd.project.list.toggleBullet',
  'list-ordered': 'cmd.project.list.toggleOrdered',
  'list-clear': 'cmd.project.list.clear',
  'insert-link': 'cmd.project.insert.linkPrompt',
  'review-comment': 'cmd.project.review.openComments',
  'flow-save-v1': 'cmd.project.plan.flowSave',
  'export-markdown-v1': 'cmd.project.review.exportMarkdown',
  'export-docx-min': 'cmd.project.export.docxMin',
  'import-docx-v1': 'cmd.project.importDocxV1',
  exportDocxMin: 'cmd.project.export.docxMin',
});

// Canonical Core command IDs used by CORE_SOT checks.
export const CORE_COMMAND_CANON = Object.freeze([
  'project.create',
  'project.applyTextEdit',
]);
const EXPORT_DOCX_MIN_OP = 'u:cmd:project:export:docxMin:v1';
const IMPORT_MARKDOWN_V1_OP = 'm:cmd:project:import:markdownV1:v1';
const EXPORT_MARKDOWN_V1_OP = 'm:cmd:project:export:markdownV1:v1';
const FLOW_OPEN_V1_OP = 'm:cmd:project:flow:open:v1';
const FLOW_SAVE_V1_OP = 'm:cmd:project:flow:save:v1';
const DOCX_IMPORT_V1_DEFAULT_REQUEST_ID = 'docx-import-v1-request';
const TXT_IMPORT_V1_DEFAULT_REQUEST_ID = 'txt-import-v1-request';
const COMMAND_BRIDGE_ROUTE = 'command.bus';

function fail(code, op, reason, details) {
  const error = { code, op, reason };
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    error.details = details;
  }
  return { ok: false, error };
}

function ok(value) {
  return { ok: true, value };
}

function normalizeSafetyMode(input) {
  return input === 'compat' ? 'compat' : 'strict';
}

function registerCatalogCommand(registry, commandId, handler) {
  const meta = getCommandCatalogById(commandId);
  if (!meta) {
    throw new Error(`COMMAND_CATALOG_MISSING:${commandId}`);
  }
  registry.registerCommand(
    {
      id: meta.id,
      label: meta.label,
      group: meta.group,
      surface: [...meta.surface],
      hotkey: meta.hotkey,
    },
    handler,
  );
}

async function runUiAction(uiActions, actionName, commandId, payload = {}) {
  const capabilities = captureCommandEffectCapabilities({ uiActions });
  const planResult = buildCommandOperationPlan(
    {
      effectType: 'ui-action',
      commandId,
      actionName,
      payload,
      unavailableCode: 'E_COMMAND_FAILED',
      unavailableReason: 'UI_ACTION_UNAVAILABLE',
    },
    capabilities,
  );
  if (!planResult.ok) {
    return fail(
      planResult.error.code,
      planResult.error.op,
      planResult.error.reason,
      planResult.error.details,
    );
  }

  try {
    const result = await persistCommandOperationPlan(planResult.value, { uiActions });
    return ok({
      performed: true,
      action: actionName,
      result: result && typeof result === 'object' && !Array.isArray(result)
        ? result
        : null,
    });
  } catch (error) {
    return fail(
      'E_COMMAND_FAILED',
      commandId,
      'UI_ACTION_FAILED',
      { action: actionName, message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
    );
  }
}

async function invokeFileLifecycleBridge(electronAPI, commandId) {
  const fallbackMap = {
    [EXTRA_COMMAND_IDS.PROJECT_NEW]: { methodName: 'openFile', payload: { intent: 'new' } },
    [COMMAND_IDS.PROJECT_OPEN]: { methodName: 'openFile', payload: { intent: 'open' } },
    [COMMAND_IDS.PROJECT_SAVE]: { methodName: 'saveFile', payload: { intent: 'save' } },
    [EXTRA_COMMAND_IDS.PROJECT_SAVE_AS]: { methodName: 'saveAs', payload: { intent: 'saveAs' } },
  };
  const fallback = fallbackMap[commandId] || null;
  const capabilities = captureCommandEffectCapabilities({ electronAPI });
  const planResult = buildCommandOperationPlan(
    {
      effectType: 'electron-bridge-or-legacy',
      commandId,
      payload: {},
      fallbackMethodName: fallback ? fallback.methodName : '',
      legacyPayload: fallback ? fallback.payload : undefined,
      unavailableCode: 'E_COMMAND_FAILED',
      unavailableReason: 'ELECTRON_API_UNAVAILABLE',
    },
    capabilities,
  );
  if (!planResult.ok) {
    throw new Error('ELECTRON_API_UNAVAILABLE');
  }
  const legacyResult = await persistCommandOperationPlan(planResult.value, { electronAPI });
  if (legacyResult && typeof legacyResult === 'object' && !Array.isArray(legacyResult)) {
    return legacyResult;
  }
  return { ok: true };
}

async function invokeTransferAndFlowCommandBridge(electronAPI, commandId, payload = {}) {
  const fallbackMap = {
    [COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN]: 'exportDocxMin',
    [COMMAND_IDS.PROJECT_IMPORT_MARKDOWN_V1]: 'importMarkdownV1',
    [COMMAND_IDS.PROJECT_EXPORT_MARKDOWN_V1]: 'exportMarkdownV1',
    [COMMAND_IDS.PROJECT_FLOW_OPEN_V1]: 'openFlowModeV1',
    [COMMAND_IDS.PROJECT_FLOW_SAVE_V1]: 'saveFlowModeV1',
  };
  const methodName = fallbackMap[commandId];
  const capabilities = captureCommandEffectCapabilities({ electronAPI });
  const planResult = buildCommandOperationPlan(
    {
      effectType: 'electron-bridge-or-legacy',
      commandId,
      payload,
      fallbackMethodName: methodName,
      legacyPayload: commandId === COMMAND_IDS.PROJECT_FLOW_OPEN_V1 ? undefined : payload,
      unavailableCode: 'E_COMMAND_FAILED',
      unavailableReason: 'ELECTRON_API_UNAVAILABLE',
    },
    capabilities,
  );
  if (!planResult.ok) {
    throw new Error('ELECTRON_API_UNAVAILABLE');
  }
  const legacyResult = await persistCommandOperationPlan(planResult.value, { electronAPI });
  if (legacyResult && typeof legacyResult === 'object' && !Array.isArray(legacyResult)) {
    return legacyResult;
  }
  return { ok: legacyResult ? 1 : 0 };
}

async function invokeBridgeOnlyCommand(electronAPI, commandId, payload = {}) {
  const capabilities = captureCommandEffectCapabilities({ electronAPI });
  const planResult = buildCommandOperationPlan(
    {
      effectType: 'electron-bridge-only',
      commandId,
      payload,
      unavailableCode: 'E_COMMAND_FAILED',
      unavailableReason: 'ELECTRON_API_UNAVAILABLE',
    },
    capabilities,
  );
  if (!planResult.ok) {
    throw new Error('ELECTRON_API_UNAVAILABLE');
  }
  return persistCommandOperationPlan(planResult.value, { electronAPI });
}

function getObjectOrNull(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function normalizeDocxImportRequestId(input, fallback = DOCX_IMPORT_V1_DEFAULT_REQUEST_ID) {
  return typeof input?.requestId === 'string' && input.requestId.trim()
    ? input.requestId.trim()
    : fallback;
}

function getDocxImportLossReport(docxImportPreviewPlan, receipt = null) {
  const plan = getObjectOrNull(docxImportPreviewPlan);
  if (plan && getObjectOrNull(plan.lossReport)) return plan.lossReport;
  const safeReceipt = getObjectOrNull(receipt);
  if (safeReceipt && getObjectOrNull(safeReceipt.lossReportSummary)) {
    return safeReceipt.lossReportSummary;
  }
  return null;
}

function isReadyDocxImportPreviewPlan(docxImportPreviewPlan) {
  const plan = getObjectOrNull(docxImportPreviewPlan);
  return Boolean(
    plan
    && plan.ok === true
    && plan.schemaVersion === 'revision-bridge.docx-import-preview.v1'
    && plan.type === 'docx.import.preview'
    && plan.writeEffects === false,
  );
}

function buildDocxImportPreviewValue(localFilePreview, fallbackPlan = null) {
  const preview = getObjectOrNull(localFilePreview);
  const plan = getObjectOrNull(preview?.docxImportPreviewPlan) || getObjectOrNull(fallbackPlan);
  return {
    imported: false,
    preview: true,
    accepted: false,
    writeEffects: false,
    contentPreviewOk: preview ? preview.contentPreviewOk === true : false,
    importPreviewOk: preview ? preview.importPreviewOk === true : isReadyDocxImportPreviewPlan(plan),
    localFilePreview: preview,
    docxContentPreviewReport: getObjectOrNull(preview?.docxContentPreviewReport),
    docxImportPreviewPlan: plan,
    lossReport: getDocxImportLossReport(plan),
  };
}

function buildDocxImportAcceptedValue(safeCreateResult, options = {}) {
  const safeCreate = getObjectOrNull(safeCreateResult);
  const createdSceneIds = Array.isArray(safeCreate?.createdSceneIds)
    ? safeCreate.createdSceneIds.filter((sceneId) => typeof sceneId === 'string' && sceneId.length > 0)
    : [];
  const receipt = getObjectOrNull(safeCreate?.receipt);
  return {
    imported: true,
    preview: Boolean(options.localFilePreview),
    accepted: true,
    safeCreate: true,
    created: safeCreate?.created === true,
    createdSceneIds,
    userVisible: createdSceneIds.length > 0,
    visibleCreatedSceneIds: createdSceneIds,
    receipt,
    lossReport: getDocxImportLossReport(options.docxImportPreviewPlan, receipt),
  };
}

async function runDocxImportLocalFilePreviewBridge(electronAPI, input = {}) {
  if (!electronAPI || typeof electronAPI !== 'object') {
    return fail(
      'E_COMMAND_FAILED',
      EXTRA_COMMAND_IDS.PROJECT_DOCX_PREVIEW_LOCAL_FILE,
      'ELECTRON_API_UNAVAILABLE',
    );
  }

  let response;
  try {
    response = await invokeBridgeOnlyCommand(
      electronAPI,
      EXTRA_COMMAND_IDS.PROJECT_DOCX_PREVIEW_LOCAL_FILE,
      input && typeof input === 'object' && !Array.isArray(input) ? input : {},
    );
  } catch (error) {
    return fail(
      'E_COMMAND_FAILED',
      EXTRA_COMMAND_IDS.PROJECT_DOCX_PREVIEW_LOCAL_FILE,
      'DOCX_IMPORT_LOCAL_FILE_PREVIEW_IPC_FAILED',
      { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
    );
  }

  const bridged = unwrapBridgeResponseValue(response);
  if (bridged && bridged.ok === true) {
    return ok({
      preview: true,
      localFilePreview: bridged,
    });
  }
  if (bridged && bridged.ok === false && bridged.error && typeof bridged.error === 'object') {
    const error = bridged.error;
    return fail(
      typeof error.code === 'string' ? error.code : 'E_DOCX_IMPORT_LOCAL_FILE_PREVIEW_FAILED',
      typeof error.op === 'string' ? error.op : EXTRA_COMMAND_IDS.PROJECT_DOCX_PREVIEW_LOCAL_FILE,
      typeof error.reason === 'string' ? error.reason : 'DOCX_IMPORT_LOCAL_FILE_PREVIEW_FAILED',
      error.details && typeof error.details === 'object' && !Array.isArray(error.details) ? error.details : undefined,
    );
  }
  return fail(
    'E_COMMAND_FAILED',
    EXTRA_COMMAND_IDS.PROJECT_DOCX_PREVIEW_LOCAL_FILE,
    bridged && typeof bridged.reason === 'string'
      ? bridged.reason
      : 'DOCX_IMPORT_LOCAL_FILE_PREVIEW_INVALID_RESPONSE',
  );
}

async function runDocxImportSafeCreateBridge(electronAPI, input = {}) {
  if (!electronAPI || typeof electronAPI !== 'object') {
    return fail(
      'E_DOCX_IMPORT_SAFE_CREATE_BACKEND_NOT_WIRED',
      EXTRA_COMMAND_IDS.PROJECT_DOCX_IMPORT_SAFE_CREATE,
      'DOCX_IMPORT_SAFE_CREATE_BACKEND_NOT_WIRED',
    );
  }

  const docxImportPreviewPlan = getObjectOrNull(input.docxImportPreviewPlan);
  if (!docxImportPreviewPlan) {
    return fail(
      'E_DOCX_IMPORT_SAFE_CREATE_PREVIEW_PLAN_REQUIRED',
      EXTRA_COMMAND_IDS.PROJECT_DOCX_IMPORT_SAFE_CREATE,
      'DOCX_IMPORT_SAFE_CREATE_PREVIEW_PLAN_REQUIRED',
    );
  }

  const payload = {
    requestId: normalizeDocxImportRequestId(input, 'docx-import-safe-create-request'),
    docxImportPreviewPlan,
  };

  let response;
  try {
    response = await invokeBridgeOnlyCommand(
      electronAPI,
      EXTRA_COMMAND_IDS.PROJECT_DOCX_IMPORT_SAFE_CREATE,
      payload,
    );
  } catch (error) {
    return fail(
      'E_DOCX_IMPORT_SAFE_CREATE_IPC_FAILED',
      EXTRA_COMMAND_IDS.PROJECT_DOCX_IMPORT_SAFE_CREATE,
      'DOCX_IMPORT_SAFE_CREATE_IPC_FAILED',
      { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
    );
  }

  const bridged = unwrapBridgeResponseValue(response);
  if (bridged && bridged.ok === true && bridged.safeCreateOk === true) {
    return ok(buildDocxImportAcceptedValue(bridged, {
      docxImportPreviewPlan,
      localFilePreview: input.localFilePreview,
    }));
  }
  if (bridged && bridged.ok === false && bridged.error && typeof bridged.error === 'object') {
    const error = bridged.error;
    return fail(
      typeof error.code === 'string' ? error.code : 'E_DOCX_IMPORT_SAFE_CREATE_FAILED',
      typeof error.op === 'string' ? error.op : EXTRA_COMMAND_IDS.PROJECT_DOCX_IMPORT_SAFE_CREATE,
      typeof error.reason === 'string' ? error.reason : 'DOCX_IMPORT_SAFE_CREATE_FAILED',
      error.details && typeof error.details === 'object' && !Array.isArray(error.details) ? error.details : undefined,
    );
  }
  return fail(
    'E_DOCX_IMPORT_SAFE_CREATE_INVALID_RESPONSE',
    EXTRA_COMMAND_IDS.PROJECT_DOCX_IMPORT_SAFE_CREATE,
    'DOCX_IMPORT_SAFE_CREATE_INVALID_RESPONSE',
  );
}

async function runDocxImportPreviewPlanBridge(electronAPI, input = {}) {
  if (!electronAPI || typeof electronAPI !== 'object') {
    return fail(
      'E_DOCX_IMPORT_PREVIEW_BACKEND_NOT_WIRED',
      EXTRA_COMMAND_IDS.PROJECT_DOCX_PREVIEW_IMPORT_PLAN,
      'DOCX_IMPORT_PREVIEW_BACKEND_NOT_WIRED',
    );
  }

  const docxContentPreviewReport = getObjectOrNull(input.docxContentPreviewReport);
  if (!docxContentPreviewReport) {
    return fail(
      'E_DOCX_IMPORT_CONTENT_PREVIEW_REQUIRED',
      EXTRA_COMMAND_IDS.PROJECT_DOCX_PREVIEW_IMPORT_PLAN,
      'DOCX_IMPORT_CONTENT_PREVIEW_REQUIRED',
    );
  }

  let response;
  try {
    response = await invokeBridgeOnlyCommand(
      electronAPI,
      EXTRA_COMMAND_IDS.PROJECT_DOCX_PREVIEW_IMPORT_PLAN,
      {
        requestId: normalizeDocxImportRequestId(input, 'docx-import-preview-plan-request'),
        docxContentPreviewReport,
      },
    );
  } catch (error) {
    return fail(
      'E_DOCX_IMPORT_PREVIEW_IPC_FAILED',
      EXTRA_COMMAND_IDS.PROJECT_DOCX_PREVIEW_IMPORT_PLAN,
      'DOCX_IMPORT_PREVIEW_IPC_FAILED',
      { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
    );
  }

  const bridged = unwrapBridgeResponseValue(response);
  if (bridged && bridged.ok === true) {
    return ok({
      preview: bridged,
      docxImportPreviewPlan: getObjectOrNull(bridged.docxImportPreviewPlan),
    });
  }
  if (bridged && bridged.ok === false && bridged.error && typeof bridged.error === 'object') {
    const error = bridged.error;
    return fail(
      typeof error.code === 'string' ? error.code : 'E_DOCX_IMPORT_PREVIEW_FAILED',
      typeof error.op === 'string' ? error.op : EXTRA_COMMAND_IDS.PROJECT_DOCX_PREVIEW_IMPORT_PLAN,
      typeof error.reason === 'string' ? error.reason : 'DOCX_IMPORT_PREVIEW_FAILED',
      error.details && typeof error.details === 'object' && !Array.isArray(error.details) ? error.details : undefined,
    );
  }
  return fail(
    'E_DOCX_IMPORT_PREVIEW_INVALID_RESPONSE',
    EXTRA_COMMAND_IDS.PROJECT_DOCX_PREVIEW_IMPORT_PLAN,
    bridged && typeof bridged.reason === 'string'
      ? bridged.reason
      : 'DOCX_IMPORT_PREVIEW_INVALID_RESPONSE',
  );
}

function normalizeTxtImportRequestId(input, fallback = TXT_IMPORT_V1_DEFAULT_REQUEST_ID) {
  return typeof input?.requestId === 'string' && input.requestId.trim()
    ? input.requestId.trim()
    : fallback;
}

function isReadyTxtImportPreviewPlan(txtImportPreviewPlan) {
  const plan = getObjectOrNull(txtImportPreviewPlan);
  return Boolean(
    plan
    && plan.ok === true
    && plan.schemaVersion === 'txt-import-preview.v1'
    && plan.type === 'txt.import.preview'
    && plan.writeEffects === false,
  );
}

function buildTxtImportPreviewValue(localFilePreview, fallbackPlan = null) {
  const preview = getObjectOrNull(localFilePreview);
  const plan = getObjectOrNull(preview?.txtImportPreviewPlan) || getObjectOrNull(fallbackPlan);
  return {
    imported: false,
    preview: true,
    accepted: false,
    writeEffects: false,
    importPreviewOk: preview ? preview.importPreviewOk === true : isReadyTxtImportPreviewPlan(plan),
    localFilePreview: preview,
    sourceSummary: getObjectOrNull(preview?.sourceSummary),
    txtImportPreviewPlan: plan,
  };
}

function buildTxtImportAcceptedValue(safeCreateResult, options = {}) {
  const safeCreate = getObjectOrNull(safeCreateResult);
  const createdSceneIds = Array.isArray(safeCreate?.createdSceneIds)
    ? safeCreate.createdSceneIds.filter((sceneId) => typeof sceneId === 'string' && sceneId.length > 0)
    : [];
  const receipt = getObjectOrNull(safeCreate?.receipt);
  return {
    imported: true,
    preview: Boolean(options.localFilePreview),
    accepted: true,
    safeCreate: true,
    created: safeCreate?.created === true,
    createdSceneIds,
    userVisible: createdSceneIds.length > 0,
    visibleCreatedSceneIds: createdSceneIds,
    receipt,
    sourceSummary: getObjectOrNull(options.sourceSummary),
  };
}

async function runTxtImportLocalFilePreviewBridge(electronAPI, input = {}) {
  if (!electronAPI || typeof electronAPI !== 'object') {
    return fail(
      'E_COMMAND_FAILED',
      EXTRA_COMMAND_IDS.PROJECT_TXT_PREVIEW_LOCAL_FILE,
      'ELECTRON_API_UNAVAILABLE',
    );
  }

  let response;
  try {
    response = await invokeBridgeOnlyCommand(
      electronAPI,
      EXTRA_COMMAND_IDS.PROJECT_TXT_PREVIEW_LOCAL_FILE,
      input && typeof input === 'object' && !Array.isArray(input) ? input : {},
    );
  } catch (error) {
    return fail(
      'E_COMMAND_FAILED',
      EXTRA_COMMAND_IDS.PROJECT_TXT_PREVIEW_LOCAL_FILE,
      'TXT_IMPORT_LOCAL_FILE_PREVIEW_IPC_FAILED',
      { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
    );
  }

  const bridged = unwrapBridgeResponseValue(response);
  if (bridged && bridged.ok === true) {
    return ok({
      preview: true,
      localFilePreview: bridged,
    });
  }
  if (bridged && bridged.ok === false && bridged.error && typeof bridged.error === 'object') {
    const error = bridged.error;
    return fail(
      typeof error.code === 'string' ? error.code : 'E_TXT_IMPORT_LOCAL_FILE_PREVIEW_FAILED',
      typeof error.op === 'string' ? error.op : EXTRA_COMMAND_IDS.PROJECT_TXT_PREVIEW_LOCAL_FILE,
      typeof error.reason === 'string' ? error.reason : 'TXT_IMPORT_LOCAL_FILE_PREVIEW_FAILED',
      error.details && typeof error.details === 'object' && !Array.isArray(error.details) ? error.details : undefined,
    );
  }
  return fail(
    'E_COMMAND_FAILED',
    EXTRA_COMMAND_IDS.PROJECT_TXT_PREVIEW_LOCAL_FILE,
    bridged && typeof bridged.reason === 'string'
      ? bridged.reason
      : 'TXT_IMPORT_LOCAL_FILE_PREVIEW_INVALID_RESPONSE',
  );
}

async function runTxtImportSafeCreateBridge(electronAPI, input = {}) {
  if (!electronAPI || typeof electronAPI !== 'object') {
    return fail(
      'E_TXT_IMPORT_SAFE_CREATE_BACKEND_NOT_WIRED',
      EXTRA_COMMAND_IDS.PROJECT_TXT_IMPORT_SAFE_CREATE,
      'TXT_IMPORT_SAFE_CREATE_BACKEND_NOT_WIRED',
    );
  }

  const txtImportPreviewPlan = getObjectOrNull(input.txtImportPreviewPlan);
  if (!txtImportPreviewPlan) {
    return fail(
      'E_TXT_IMPORT_SAFE_CREATE_PREVIEW_REQUIRED',
      EXTRA_COMMAND_IDS.PROJECT_TXT_IMPORT_SAFE_CREATE,
      'TXT_IMPORT_SAFE_CREATE_PREVIEW_REQUIRED',
    );
  }

  let response;
  try {
    response = await invokeBridgeOnlyCommand(
      electronAPI,
      EXTRA_COMMAND_IDS.PROJECT_TXT_IMPORT_SAFE_CREATE,
      {
        requestId: normalizeTxtImportRequestId(input, 'txt-import-safe-create-request'),
        txtImportPreviewPlan,
      },
    );
  } catch (error) {
    return fail(
      'E_TXT_IMPORT_SAFE_CREATE_IPC_FAILED',
      EXTRA_COMMAND_IDS.PROJECT_TXT_IMPORT_SAFE_CREATE,
      'TXT_IMPORT_SAFE_CREATE_IPC_FAILED',
      { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
    );
  }

  const bridged = unwrapBridgeResponseValue(response);
  if (bridged && bridged.ok === true && bridged.safeCreateOk === true) {
    return ok(buildTxtImportAcceptedValue(bridged, {
      sourceSummary: input.sourceSummary,
      localFilePreview: input.localFilePreview,
    }));
  }
  if (bridged && bridged.ok === false && bridged.error && typeof bridged.error === 'object') {
    const error = bridged.error;
    return fail(
      typeof error.code === 'string' ? error.code : 'E_TXT_IMPORT_SAFE_CREATE_FAILED',
      typeof error.op === 'string' ? error.op : EXTRA_COMMAND_IDS.PROJECT_TXT_IMPORT_SAFE_CREATE,
      typeof error.reason === 'string' ? error.reason : 'TXT_IMPORT_SAFE_CREATE_FAILED',
      error.details && typeof error.details === 'object' && !Array.isArray(error.details) ? error.details : undefined,
    );
  }
  return fail(
    'E_TXT_IMPORT_SAFE_CREATE_INVALID_RESPONSE',
    EXTRA_COMMAND_IDS.PROJECT_TXT_IMPORT_SAFE_CREATE,
    'TXT_IMPORT_SAFE_CREATE_INVALID_RESPONSE',
  );
}

async function runReviewExportLocalPacketBridge(electronAPI, input = {}) {
  if (!electronAPI || typeof electronAPI !== 'object') {
    return fail(
      'E_COMMAND_FAILED',
      EXTRA_COMMAND_IDS.REVIEW_EXPORT_LOCAL_PACKET,
      'ELECTRON_API_UNAVAILABLE',
    );
  }

  const payload = {};
  if (typeof input?.requestId === 'string' && input.requestId.trim()) {
    payload.requestId = input.requestId.trim();
  }

  let response;
  try {
    response = await invokeBridgeOnlyCommand(
      electronAPI,
      EXTRA_COMMAND_IDS.REVIEW_EXPORT_LOCAL_PACKET,
      payload,
    );
  } catch (error) {
    return fail(
      'E_COMMAND_FAILED',
      EXTRA_COMMAND_IDS.REVIEW_EXPORT_LOCAL_PACKET,
      'REVIEW_EXPORT_LOCAL_PACKET_IPC_FAILED',
      { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
    );
  }

  const bridged = unwrapBridgeResponseValue(response);
  if (bridged && bridged.ok === true) {
    return ok({
      exported: bridged.exported === true,
      canceled: bridged.canceled === true || bridged.cancelled === true,
      outPath: typeof bridged.outPath === 'string' ? bridged.outPath : '',
      bytesWritten: Number.isInteger(bridged.bytesWritten) ? bridged.bytesWritten : 0,
      counts: getObjectOrNull(bridged.counts),
    });
  }
  if (bridged && bridged.ok === false && bridged.error && typeof bridged.error === 'object') {
    const error = bridged.error;
    return fail(
      typeof error.code === 'string' ? error.code : 'E_REVIEW_EXPORT_LOCAL_PACKET_FAILED',
      typeof error.op === 'string' ? error.op : EXTRA_COMMAND_IDS.REVIEW_EXPORT_LOCAL_PACKET,
      typeof error.reason === 'string' ? error.reason : 'REVIEW_EXPORT_LOCAL_PACKET_FAILED',
      error.details && typeof error.details === 'object' && !Array.isArray(error.details) ? error.details : undefined,
    );
  }
  return fail(
    'E_COMMAND_FAILED',
    EXTRA_COMMAND_IDS.REVIEW_EXPORT_LOCAL_PACKET,
    bridged && typeof bridged.reason === 'string'
      ? bridged.reason
      : 'REVIEW_EXPORT_LOCAL_PACKET_INVALID_RESPONSE',
  );
}

async function runReviewExportDocxReviewPacketBridge(electronAPI, input = {}) {
  if (!electronAPI || typeof electronAPI !== 'object') {
    return fail(
      'E_COMMAND_FAILED',
      EXTRA_COMMAND_IDS.REVIEW_EXPORT_DOCX_REVIEW_PACKET,
      'ELECTRON_API_UNAVAILABLE',
    );
  }

  const payload = {};
  if (typeof input?.requestId === 'string' && input.requestId.trim()) {
    payload.requestId = input.requestId.trim();
  }
  if (typeof input?.outPath === 'string' && input.outPath.trim()) {
    payload.outPath = input.outPath.trim();
  }

  let response;
  try {
    response = await invokeBridgeOnlyCommand(
      electronAPI,
      EXTRA_COMMAND_IDS.REVIEW_EXPORT_DOCX_REVIEW_PACKET,
      payload,
    );
  } catch (error) {
    return fail(
      'E_COMMAND_FAILED',
      EXTRA_COMMAND_IDS.REVIEW_EXPORT_DOCX_REVIEW_PACKET,
      'REVIEW_DOCX_EXPORT_IPC_FAILED',
      { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
    );
  }

  const bridged = unwrapBridgeResponseValue(response);
  if (bridged && bridged.ok === true) {
    return ok({
      exported: bridged.exported === true,
      outPath: typeof bridged.outPath === 'string' ? bridged.outPath : '',
      bytesWritten: Number.isInteger(bridged.bytesWritten) ? bridged.bytesWritten : 0,
      exportCapsule: getObjectOrNull(bridged.exportCapsule),
      canAutoApply: bridged.canAutoApply === true,
      canWriteManuscript: bridged.canWriteManuscript === true,
      canImportMutate: bridged.canImportMutate === true,
    });
  }
  if (bridged && bridged.ok === false && bridged.error && typeof bridged.error === 'object') {
    const error = bridged.error;
    return fail(
      typeof error.code === 'string' ? error.code : 'E_REVIEW_DOCX_EXPORT_FAILED',
      typeof error.op === 'string' ? error.op : EXTRA_COMMAND_IDS.REVIEW_EXPORT_DOCX_REVIEW_PACKET,
      typeof error.reason === 'string' ? error.reason : 'REVIEW_DOCX_EXPORT_FAILED',
      error.details && typeof error.details === 'object' && !Array.isArray(error.details) ? error.details : undefined,
    );
  }
  return fail(
    'E_COMMAND_FAILED',
    EXTRA_COMMAND_IDS.REVIEW_EXPORT_DOCX_REVIEW_PACKET,
    bridged && typeof bridged.reason === 'string'
      ? bridged.reason
      : 'REVIEW_DOCX_EXPORT_INVALID_RESPONSE',
  );
}

export function resolveLegacyActionToCommand(actionId, context = {}) {
  if (actionId === 'save' && context && context.flowModeActive === true) {
    return COMMAND_IDS.PROJECT_FLOW_SAVE_V1;
  }
  if (typeof actionId !== 'string') return null;
  return LEGACY_ACTION_TO_COMMAND[actionId] || null;
}

export function createLegacyActionBridge(executeCommand) {
  return async function executeLegacyAction(actionId, options = {}) {
    const commandId = resolveLegacyActionToCommand(actionId, options.context || {});
    if (!commandId) {
      return { handled: false, commandId: null, result: null };
    }
    if (typeof executeCommand !== 'function') {
      return fail('E_COMMAND_FAILED', commandId, 'COMMAND_EXECUTOR_INVALID');
    }
    const payload = options.payload && typeof options.payload === 'object' && !Array.isArray(options.payload)
      ? options.payload
      : {};
    const result = await executeCommand(commandId, payload);
    return { handled: true, commandId, result };
  };
}

function registerBridgeOnlyProjectCommand(registry, electronAPI, commandId, meta) {
  registry.registerCommand(
    {
      id: commandId,
      label: meta.label,
      group: meta.group || 'project',
      surface: Array.isArray(meta.surface) ? meta.surface : ['internal'],
      hotkey: meta.hotkey || '',
    },
    async (input = {}) => {
      if (!electronAPI || typeof electronAPI !== 'object') {
        return fail('E_COMMAND_FAILED', commandId, 'ELECTRON_API_UNAVAILABLE');
      }
      let response;
      try {
        response = await invokeBridgeOnlyCommand(electronAPI, commandId, input);
      } catch (error) {
        return fail(
          'E_COMMAND_FAILED',
          commandId,
          'COMMAND_BRIDGE_FAILED',
          { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
        );
      }
      const bridged = unwrapBridgeResponseValue(response);
      if (bridged && (bridged.ok === 1 || bridged.ok === true)) {
        return ok({
          performed: true,
          result: bridged,
        });
      }
      return fail(
        bridged && typeof bridged.code === 'string' ? bridged.code : 'E_COMMAND_FAILED',
        commandId,
        bridged && typeof bridged.reason === 'string' ? bridged.reason : 'COMMAND_FAILED',
        bridged && bridged.details && typeof bridged.details === 'object' ? bridged.details : undefined,
      );
    },
  );
}

async function runProductCommandBridge(electronAPI, commandId, input = {}) {
  const record = getProductCommandRecord(commandId);
  if (!record) {
    return fail('E_PRODUCT_COMMAND_NOT_REGISTERED', commandId, 'PRODUCT_COMMAND_NOT_REGISTERED');
  }
  if (!electronAPI || typeof electronAPI !== 'object') {
    return fail(
      'E_COMMAND_FAILED',
      commandId,
      'ELECTRON_API_UNAVAILABLE',
      { commandAuthority: record.commandAuthority, capabilityId: record.capabilityId, domain: record.domain },
    );
  }

  let response;
  try {
    response = await invokeBridgeOnlyCommand(
      electronAPI,
      commandId,
      input && typeof input === 'object' && !Array.isArray(input) ? input : {},
    );
  } catch (error) {
    return fail(
      'E_PRODUCT_COMMAND_BRIDGE_FAILED',
      commandId,
      'PRODUCT_COMMAND_IPC_FAILED',
      { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
    );
  }

  const bridged = unwrapBridgeResponseValue(response);
  if (bridged && (bridged.ok === 1 || bridged.ok === true)) {
    return ok({
      performed: true,
      commandAuthority: record.commandAuthority,
      commandId,
      result: bridged,
    });
  }
  if (bridged && bridged.error && typeof bridged.error === 'object' && !Array.isArray(bridged.error)) {
    const error = bridged.error;
    return fail(
      typeof error.code === 'string' ? error.code : 'E_PRODUCT_COMMAND_FAILED',
      typeof error.op === 'string' ? error.op : commandId,
      typeof error.reason === 'string' ? error.reason : 'PRODUCT_COMMAND_FAILED',
      error.details && typeof error.details === 'object' && !Array.isArray(error.details) ? error.details : undefined,
    );
  }
  return fail(
    bridged && typeof bridged.code === 'string' ? bridged.code : 'E_PRODUCT_COMMAND_DEGRADED',
    commandId,
    bridged && typeof bridged.reason === 'string' ? bridged.reason : 'PRODUCT_COMMAND_BACKEND_DEGRADED',
    {
      commandAuthority: record.commandAuthority,
      capabilityId: record.capabilityId,
      domain: record.domain,
    },
  );
}

export function registerProjectCommands(registry, options = {}) {
  const electronAPI = options.electronAPI || null;
  const uiActions = options.uiActions && typeof options.uiActions === 'object' ? options.uiActions : null;
  const domainEventPort = options.domainEventPort && typeof options.domainEventPort === 'object'
    ? options.domainEventPort
    : null;

  for (const record of PRODUCT_COMMAND_RECORDS) {
    registerCatalogCommand(
      registry,
      record.id,
      async (input = {}) => runProductCommandBridge(electronAPI, record.id, input),
    );
  }

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.PROJECT_NEW,
      label: 'New Project',
      group: 'file',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: 'Cmd/Ctrl+N',
    },
    async () => {
      if (!electronAPI || typeof electronAPI !== 'object') {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.PROJECT_NEW, 'ELECTRON_API_UNAVAILABLE');
      }

      let response;
      try {
        response = await invokeFileLifecycleBridge(electronAPI, EXTRA_COMMAND_IDS.PROJECT_NEW);
      } catch (error) {
        return fail(
          'E_COMMAND_FAILED',
          EXTRA_COMMAND_IDS.PROJECT_NEW,
          'FILE_NEW_IPC_FAILED',
          { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
        );
      }

      const bridged = response && typeof response === 'object' && !Array.isArray(response)
        && response.value && typeof response.value === 'object' && !Array.isArray(response.value)
        ? response.value
        : response;
      if (bridged && (bridged.ok === 1 || bridged.ok === true)) {
        return ok({ created: true });
      }
      return fail(
        'E_COMMAND_FAILED',
        EXTRA_COMMAND_IDS.PROJECT_NEW,
        bridged && typeof bridged.reason === 'string'
          ? bridged.reason
          : bridged && typeof bridged.error === 'string'
            ? bridged.error
            : response && typeof response.reason === 'string'
              ? response.reason
              : 'FILE_NEW_FAILED',
      );
    },
  );

  registerCatalogCommand(registry, COMMAND_IDS.PROJECT_OPEN, async () => {
    if (!electronAPI || typeof electronAPI !== 'object') {
      return fail('E_COMMAND_FAILED', COMMAND_IDS.PROJECT_OPEN, 'ELECTRON_API_UNAVAILABLE');
    }

    let response;
    try {
      response = await invokeFileLifecycleBridge(electronAPI, COMMAND_IDS.PROJECT_OPEN);
    } catch (error) {
      return fail(
        'E_COMMAND_FAILED',
        COMMAND_IDS.PROJECT_OPEN,
        'FILE_OPEN_IPC_FAILED',
        { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
      );
    }

    const bridged = response && typeof response === 'object' && !Array.isArray(response)
      && response.value && typeof response.value === 'object' && !Array.isArray(response.value)
      ? response.value
      : response;
    if (bridged && (bridged.ok === 1 || bridged.ok === true)) {
      return ok({ opened: true });
    }
    return fail(
      'E_COMMAND_FAILED',
      COMMAND_IDS.PROJECT_OPEN,
      bridged && typeof bridged.reason === 'string'
        ? bridged.reason
        : bridged && typeof bridged.error === 'string'
          ? bridged.error
          : response && typeof response.reason === 'string'
            ? response.reason
            : 'FILE_OPEN_FAILED',
    );
  });

  registerCatalogCommand(registry, COMMAND_IDS.PROJECT_SAVE, async () => {
    if (!electronAPI || typeof electronAPI !== 'object') {
      return fail('E_COMMAND_FAILED', COMMAND_IDS.PROJECT_SAVE, 'ELECTRON_API_UNAVAILABLE');
    }

    let response;
    try {
      response = await invokeFileLifecycleBridge(electronAPI, COMMAND_IDS.PROJECT_SAVE);
    } catch (error) {
      return fail(
        'E_COMMAND_FAILED',
        COMMAND_IDS.PROJECT_SAVE,
        'FILE_SAVE_IPC_FAILED',
        { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
      );
    }

    const bridged = response && typeof response === 'object' && !Array.isArray(response)
      && response.value && typeof response.value === 'object' && !Array.isArray(response.value)
      ? response.value
      : response;
    if (bridged && (bridged.ok === 1 || bridged.ok === true)) {
      return ok({ saved: true });
    }
    return fail(
      'E_COMMAND_FAILED',
      COMMAND_IDS.PROJECT_SAVE,
      bridged && typeof bridged.reason === 'string'
        ? bridged.reason
        : bridged && typeof bridged.error === 'string'
          ? bridged.error
          : response && typeof response.reason === 'string'
            ? response.reason
            : 'FILE_SAVE_FAILED',
    );
  });

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.PROJECT_SAVE_AS,
      label: 'Save Project As',
      group: 'file',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: 'Cmd/Ctrl+Shift+S',
    },
    async () => {
      if (!electronAPI || typeof electronAPI !== 'object') {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.PROJECT_SAVE_AS, 'ELECTRON_API_UNAVAILABLE');
      }

      let response;
      try {
        response = await invokeFileLifecycleBridge(electronAPI, EXTRA_COMMAND_IDS.PROJECT_SAVE_AS);
      } catch (error) {
        return fail(
          'E_COMMAND_FAILED',
          EXTRA_COMMAND_IDS.PROJECT_SAVE_AS,
          'FILE_SAVE_AS_IPC_FAILED',
          { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
        );
      }

      const bridged = response && typeof response === 'object' && !Array.isArray(response)
        && response.value && typeof response.value === 'object' && !Array.isArray(response.value)
        ? response.value
        : response;
      if (bridged && (bridged.ok === 1 || bridged.ok === true)) {
        return ok({ savedAs: true });
      }
      return fail(
        'E_COMMAND_FAILED',
        EXTRA_COMMAND_IDS.PROJECT_SAVE_AS,
        bridged && typeof bridged.reason === 'string'
          ? bridged.reason
          : bridged && typeof bridged.error === 'string'
            ? bridged.error
            : response && typeof response.reason === 'string'
              ? response.reason
              : 'FILE_SAVE_AS_FAILED',
      );
    },
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.VIEW_OPEN_SETTINGS,
      label: 'Open Settings',
      group: 'view',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: '',
    },
    async () => runUiAction(uiActions, 'openSettings', EXTRA_COMMAND_IDS.VIEW_OPEN_SETTINGS),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.VIEW_SAFE_RESET,
      label: 'Safe Reset Shell',
      group: 'view',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: '',
    },
    async () => runUiAction(uiActions, 'safeResetShell', EXTRA_COMMAND_IDS.VIEW_SAFE_RESET),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.VIEW_RESTORE_LAST_STABLE,
      label: 'Restore Last Stable Shell',
      group: 'view',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: '',
    },
    async () => runUiAction(uiActions, 'restoreLastStableShell', EXTRA_COMMAND_IDS.VIEW_RESTORE_LAST_STABLE),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.TOOLS_OPEN_DIAGNOSTICS,
      label: 'Open Diagnostics',
      group: 'tools',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: '',
    },
    async () => runUiAction(uiActions, 'openDiagnostics', EXTRA_COMMAND_IDS.TOOLS_OPEN_DIAGNOSTICS),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.REVIEW_OPEN_RECOVERY,
      label: 'Open Recovery',
      group: 'review',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: '',
    },
    async () => runUiAction(uiActions, 'openRecovery', EXTRA_COMMAND_IDS.REVIEW_OPEN_RECOVERY),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.PLAN_SWITCH_MODE,
      label: 'Switch Mode Plan',
      group: 'plan',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: '',
    },
    async () => runUiAction(
      uiActions,
      'switchMode',
      EXTRA_COMMAND_IDS.PLAN_SWITCH_MODE,
      { mode: 'plan' },
    ),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.REVIEW_SWITCH_MODE,
      label: 'Switch Mode Review',
      group: 'review',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: '',
    },
    async () => runUiAction(
      uiActions,
      'switchMode',
      EXTRA_COMMAND_IDS.REVIEW_SWITCH_MODE,
      { mode: 'review' },
    ),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.WINDOW_SWITCH_MODE_WRITE,
      label: 'Switch Mode Write',
      group: 'window',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: '',
    },
    async () => runUiAction(
      uiActions,
      'switchMode',
      EXTRA_COMMAND_IDS.WINDOW_SWITCH_MODE_WRITE,
      { mode: 'write' },
    ),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.PROJECT_EXPORT_CURRENT_SCENE_TXT,
      label: 'Export Current Scene as TXT',
      group: 'file',
      surface: ['menu', 'palette'],
      hotkey: '',
    },
    async () => runUiAction(
      uiActions,
      'openExportSurface',
      EXTRA_COMMAND_IDS.PROJECT_EXPORT_CURRENT_SCENE_TXT,
      { commandId: EXTRA_COMMAND_IDS.PROJECT_EXPORT_CURRENT_SCENE_TXT },
    ),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.PROJECT_EXPORT_SELECTED_SCENES_TXT,
      label: 'Export Selected Scenes as TXT',
      group: 'file',
      surface: ['menu', 'context'],
      hotkey: '',
    },
    async (input = {}) => {
      if (input.confirmed !== true) {
        return runUiAction(
          uiActions,
          'openSelectedScenesTxtExport',
          EXTRA_COMMAND_IDS.PROJECT_EXPORT_SELECTED_SCENES_TXT,
        );
      }
      if (!electronAPI || typeof electronAPI !== 'object') {
        return fail(
          'E_COMMAND_FAILED',
          EXTRA_COMMAND_IDS.PROJECT_EXPORT_SELECTED_SCENES_TXT,
          'ELECTRON_API_UNAVAILABLE',
        );
      }
      const selectedSceneIds = Array.isArray(input.selectedSceneIds)
        ? input.selectedSceneIds
            .filter((sceneId) => typeof sceneId === 'string' && sceneId.trim())
            .map((sceneId) => sceneId.trim())
        : [];
      if (selectedSceneIds.length === 0) {
        return fail(
          'E_COMMAND_FAILED',
          EXTRA_COMMAND_IDS.PROJECT_EXPORT_SELECTED_SCENES_TXT,
          'SELECTED_SCENE_IDS_REQUIRED',
        );
      }
      const requestId = typeof input.requestId === 'string' && input.requestId.trim()
        ? input.requestId.trim()
        : `selected-scenes-txt-export-${Date.now()}`;

      let response;
      try {
        response = await invokeBridgeOnlyCommand(
          electronAPI,
          EXTRA_COMMAND_IDS.PROJECT_EXPORT_SELECTED_SCENES_TXT,
          { confirmed: true, requestId, selectedSceneIds },
        );
      } catch (error) {
        return fail(
          'E_COMMAND_FAILED',
          EXTRA_COMMAND_IDS.PROJECT_EXPORT_SELECTED_SCENES_TXT,
          'SELECTED_SCENES_TXT_EXPORT_IPC_FAILED',
          { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
        );
      }

      const bridged = response && typeof response === 'object' && !Array.isArray(response)
        && response.value && typeof response.value === 'object' && !Array.isArray(response.value)
        ? response.value
        : response;
      if (bridged && (bridged.ok === 1 || bridged.ok === true)) {
        return ok({
          canceled: bridged.canceled === true,
          exported: bridged.exported === true,
          sceneCount: Number.isInteger(bridged.sceneCount) ? bridged.sceneCount : selectedSceneIds.length,
        });
      }
      return fail(
        'E_COMMAND_FAILED',
        EXTRA_COMMAND_IDS.PROJECT_EXPORT_SELECTED_SCENES_TXT,
        bridged && typeof bridged.reason === 'string'
          ? bridged.reason
          : bridged && typeof bridged.error === 'string'
            ? bridged.error
            : response && typeof response.reason === 'string'
              ? response.reason
              : 'SELECTED_SCENES_TXT_EXPORT_FAILED',
      );
    },
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.PROJECT_EXPORT_ALL_SCENES_TXT,
      label: 'Export All Scenes as TXT',
      group: 'file',
      surface: ['menu', 'palette'],
      hotkey: '',
    },
    async () => runUiAction(
      uiActions,
      'openExportSurface',
      EXTRA_COMMAND_IDS.PROJECT_EXPORT_ALL_SCENES_TXT,
      { commandId: EXTRA_COMMAND_IDS.PROJECT_EXPORT_ALL_SCENES_TXT },
    ),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.PROJECT_DOCUMENT_OPEN,
      label: 'Open Project Document Node',
      group: 'file',
      surface: ['internal'],
      hotkey: '',
    },
    async (input = {}) => {
      if (!electronAPI || typeof electronAPI !== 'object') {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.PROJECT_DOCUMENT_OPEN, 'ELECTRON_API_UNAVAILABLE');
      }
      const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : '';
      const nodeId = typeof input.nodeId === 'string' ? input.nodeId.trim() : '';
      if (!projectId || !nodeId) {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.PROJECT_DOCUMENT_OPEN, 'DOCUMENT_IDENTITY_REQUIRED');
      }

      let response;
      try {
        response = await invokeBridgeOnlyCommand(
          electronAPI,
          EXTRA_COMMAND_IDS.PROJECT_DOCUMENT_OPEN,
          { projectId, nodeId },
        );
      } catch (error) {
        return fail(
          'E_COMMAND_FAILED',
          EXTRA_COMMAND_IDS.PROJECT_DOCUMENT_OPEN,
          'OPEN_DOCUMENT_IPC_FAILED',
          { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
        );
      }

      const bridged = response && typeof response === 'object' && !Array.isArray(response)
        && response.value && typeof response.value === 'object' && !Array.isArray(response.value)
        ? response.value
        : response;
      if (bridged && bridged.cancelled) {
        return ok({ opened: false, cancelled: true, projectId, documentId: nodeId });
      }
      if (bridged && (bridged.ok === 1 || bridged.ok === true)) {
        return ok({
          opened: true,
          projectId,
          documentId: typeof bridged.documentId === 'string' && bridged.documentId.trim()
            ? bridged.documentId.trim()
            : nodeId,
        });
      }
      return fail(
        'E_COMMAND_FAILED',
        EXTRA_COMMAND_IDS.PROJECT_DOCUMENT_OPEN,
        bridged && typeof bridged.reason === 'string'
          ? bridged.reason
          : bridged && typeof bridged.error === 'string'
            ? bridged.error
            : response && typeof response.reason === 'string'
              ? response.reason
              : 'OPEN_DOCUMENT_FAILED',
      );
    },
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_CREATE,
      label: 'Create Local Project',
      group: 'file',
      surface: ['palette', 'toolbar'],
      hotkey: '',
    },
    async (input = {}) => {
      if (!electronAPI || typeof electronAPI !== 'object') {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_CREATE, 'ELECTRON_API_UNAVAILABLE');
      }
      const projectName = typeof input.projectName === 'string' ? input.projectName.trim() : '';
      if (!projectName) {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_CREATE, 'PROJECT_NAME_REQUIRED');
      }

      let response;
      try {
        response = await invokeBridgeOnlyCommand(
          electronAPI,
          EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_CREATE,
          { projectName },
        );
      } catch (error) {
        return fail(
          'E_COMMAND_FAILED',
          EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_CREATE,
          'PROJECT_CREATE_IPC_FAILED',
          { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
        );
      }

      const bridged = response && typeof response === 'object' && !Array.isArray(response)
        && response.value && typeof response.value === 'object' && !Array.isArray(response.value)
        ? response.value
        : response;
      if (bridged && bridged.cancelled) {
        return ok({ created: false, cancelled: true });
      }
      if (bridged && (bridged.ok === 1 || bridged.ok === true)) {
        return ok({
          created: true,
          projectId: typeof bridged.projectId === 'string' ? bridged.projectId : '',
          projectName,
        });
      }
      return fail(
        'E_COMMAND_FAILED',
        EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_CREATE,
        bridged && typeof bridged.reason === 'string' ? bridged.reason : 'PROJECT_CREATE_FAILED',
      );
    },
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_OPEN,
      label: 'Open Local Project',
      group: 'file',
      surface: ['palette', 'toolbar'],
      hotkey: '',
    },
    async (input = {}) => {
      if (!electronAPI || typeof electronAPI !== 'object') {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_OPEN, 'ELECTRON_API_UNAVAILABLE');
      }
      const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : '';
      if (!projectId) {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_OPEN, 'PROJECT_ID_REQUIRED');
      }

      let response;
      try {
        response = await invokeBridgeOnlyCommand(
          electronAPI,
          EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_OPEN,
          { projectId },
        );
      } catch (error) {
        return fail(
          'E_COMMAND_FAILED',
          EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_OPEN,
          'PROJECT_OPEN_IPC_FAILED',
          { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
        );
      }

      const bridged = response && typeof response === 'object' && !Array.isArray(response)
        && response.value && typeof response.value === 'object' && !Array.isArray(response.value)
        ? response.value
        : response;
      if (bridged && bridged.cancelled) {
        return ok({ opened: false, cancelled: true, projectId });
      }
      if (bridged && (bridged.ok === 1 || bridged.ok === true)) {
        return ok({
          opened: true,
          projectId,
          continuationSource: typeof bridged.continuationSource === 'string' ? bridged.continuationSource : '',
          readOnlyProject: Boolean(bridged.readOnlyProject),
        });
      }
      return fail(
        'E_COMMAND_FAILED',
        EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_OPEN,
        bridged && typeof bridged.reason === 'string' ? bridged.reason : 'PROJECT_OPEN_FAILED',
      );
    },
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_CONTINUE,
      label: 'Continue Last Local Project',
      group: 'file',
      surface: ['palette', 'toolbar'],
      hotkey: '',
    },
    async () => {
      if (!electronAPI || typeof electronAPI !== 'object') {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_CONTINUE, 'ELECTRON_API_UNAVAILABLE');
      }

      let response;
      try {
        response = await invokeBridgeOnlyCommand(
          electronAPI,
          EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_CONTINUE,
          {},
        );
      } catch (error) {
        return fail(
          'E_COMMAND_FAILED',
          EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_CONTINUE,
          'PROJECT_CONTINUE_IPC_FAILED',
          { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
        );
      }

      const bridged = response && typeof response === 'object' && !Array.isArray(response)
        && response.value && typeof response.value === 'object' && !Array.isArray(response.value)
        ? response.value
        : response;
      if (bridged && bridged.cancelled) {
        return ok({ opened: false, cancelled: true });
      }
      if (bridged && (bridged.ok === 1 || bridged.ok === true)) {
        return ok({
          opened: true,
          projectId: typeof bridged.projectId === 'string' ? bridged.projectId : '',
          continuationSource: typeof bridged.continuationSource === 'string' ? bridged.continuationSource : '',
        });
      }
      return fail(
        'E_COMMAND_FAILED',
        EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_CONTINUE,
        bridged && typeof bridged.reason === 'string' ? bridged.reason : 'PROJECT_CONTINUE_FAILED',
      );
    },
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_RENAME,
      label: 'Rename Local Project',
      group: 'file',
      surface: ['palette', 'toolbar'],
      hotkey: '',
    },
    async (input = {}) => {
      if (!electronAPI || typeof electronAPI !== 'object') {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_RENAME, 'ELECTRON_API_UNAVAILABLE');
      }
      const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : '';
      const projectName = typeof input.projectName === 'string' ? input.projectName.trim() : '';
      if (!projectId) {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_RENAME, 'PROJECT_ID_REQUIRED');
      }
      if (!projectName) {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_RENAME, 'PROJECT_NAME_REQUIRED');
      }

      let response;
      try {
        response = await invokeBridgeOnlyCommand(
          electronAPI,
          EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_RENAME,
          { projectId, projectName },
        );
      } catch (error) {
        return fail(
          'E_COMMAND_FAILED',
          EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_RENAME,
          'PROJECT_RENAME_IPC_FAILED',
          { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
        );
      }

      const bridged = response && typeof response === 'object' && !Array.isArray(response)
        && response.value && typeof response.value === 'object' && !Array.isArray(response.value)
        ? response.value
        : response;
      if (bridged && bridged.cancelled) {
        return ok({ renamed: false, cancelled: true, projectId });
      }
      if (bridged && (bridged.ok === 1 || bridged.ok === true)) {
        return ok({
          renamed: true,
          projectId,
          projectName,
          receipt: bridged.receipt && typeof bridged.receipt === 'object' ? bridged.receipt : null,
        });
      }
      return fail(
        'E_COMMAND_FAILED',
        EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_RENAME,
        bridged && typeof bridged.reason === 'string' ? bridged.reason : 'PROJECT_RENAME_FAILED',
      );
    },
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_DUPLICATE,
      label: 'Duplicate Local Project',
      group: 'file',
      surface: ['palette', 'toolbar'],
      hotkey: '',
    },
    async (input = {}) => {
      if (!electronAPI || typeof electronAPI !== 'object') {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_DUPLICATE, 'ELECTRON_API_UNAVAILABLE');
      }
      const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : '';
      const projectName = typeof input.projectName === 'string' ? input.projectName.trim() : '';
      if (!projectId) {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_DUPLICATE, 'PROJECT_ID_REQUIRED');
      }
      if (!projectName) {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_DUPLICATE, 'PROJECT_NAME_REQUIRED');
      }

      let response;
      try {
        response = await invokeBridgeOnlyCommand(
          electronAPI,
          EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_DUPLICATE,
          { projectId, projectName },
        );
      } catch (error) {
        return fail(
          'E_COMMAND_FAILED',
          EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_DUPLICATE,
          'PROJECT_DUPLICATE_IPC_FAILED',
          { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
        );
      }

      const bridged = response && typeof response === 'object' && !Array.isArray(response)
        && response.value && typeof response.value === 'object' && !Array.isArray(response.value)
        ? response.value
        : response;
      if (bridged && bridged.cancelled) {
        return ok({ duplicated: false, cancelled: true, projectId });
      }
      if (bridged && (bridged.ok === 1 || bridged.ok === true)) {
        return ok({
          duplicated: true,
          sourceProjectId: projectId,
          projectId: typeof bridged.projectId === 'string' ? bridged.projectId : '',
          projectName,
          receipt: bridged.receipt && typeof bridged.receipt === 'object' ? bridged.receipt : null,
        });
      }
      return fail(
        'E_COMMAND_FAILED',
        EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_DUPLICATE,
        bridged && typeof bridged.reason === 'string' ? bridged.reason : 'PROJECT_DUPLICATE_FAILED',
      );
    },
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_MOVE_LOCATION,
      label: 'Move Local Project',
      group: 'file',
      surface: ['palette', 'toolbar'],
      hotkey: '',
    },
    async (input = {}) => {
      if (!electronAPI || typeof electronAPI !== 'object') {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_MOVE_LOCATION, 'ELECTRON_API_UNAVAILABLE');
      }
      const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : '';
      if (!projectId) {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_MOVE_LOCATION, 'PROJECT_ID_REQUIRED');
      }

      let response;
      try {
        response = await invokeBridgeOnlyCommand(
          electronAPI,
          EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_MOVE_LOCATION,
          { projectId },
        );
      } catch (error) {
        return fail(
          'E_COMMAND_FAILED',
          EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_MOVE_LOCATION,
          'PROJECT_MOVE_IPC_FAILED',
          { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
        );
      }

      const bridged = response && typeof response === 'object' && !Array.isArray(response)
        && response.value && typeof response.value === 'object' && !Array.isArray(response.value)
        ? response.value
        : response;
      if (bridged && bridged.cancelled) {
        return ok({ moved: false, cancelled: true, projectId });
      }
      if (bridged && (bridged.ok === 1 || bridged.ok === true)) {
        return ok({
          moved: bridged.moved !== false,
          projectId,
          receipt: bridged.receipt && typeof bridged.receipt === 'object' ? bridged.receipt : null,
        });
      }
      return fail(
        'E_COMMAND_FAILED',
        EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_MOVE_LOCATION,
        bridged && typeof bridged.reason === 'string' ? bridged.reason : 'PROJECT_MOVE_FAILED',
      );
    },
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.TREE_CREATE_NODE,
      label: 'Create Project Tree Node',
      group: 'insert',
      surface: ['internal'],
      hotkey: '',
    },
    async (input = {}) => {
      if (!electronAPI || typeof electronAPI !== 'object') {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.TREE_CREATE_NODE, 'ELECTRON_API_UNAVAILABLE');
      }
      const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : '';
      const parentNodeId = typeof input.parentNodeId === 'string' ? input.parentNodeId.trim() : '';
      const kind = typeof input.kind === 'string' ? input.kind.trim() : '';
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!projectId || !parentNodeId || !kind || !name) {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.TREE_CREATE_NODE, 'TREE_CREATE_PAYLOAD_INVALID');
      }

      let response;
      try {
        response = await invokeBridgeOnlyCommand(
          electronAPI,
          EXTRA_COMMAND_IDS.TREE_CREATE_NODE,
          { projectId, parentNodeId, kind, name },
        );
      } catch (error) {
        return fail(
          'E_COMMAND_FAILED',
          EXTRA_COMMAND_IDS.TREE_CREATE_NODE,
          'TREE_CREATE_IPC_FAILED',
          { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
        );
      }

      const bridged = response && typeof response === 'object' && !Array.isArray(response)
        && response.value && typeof response.value === 'object' && !Array.isArray(response.value)
        ? response.value
        : response;
      if (bridged && (bridged.ok === 1 || bridged.ok === true)) {
        return ok({
          created: true,
          projectId,
          parentNodeId,
          nodeId: typeof bridged.nodeId === 'string' ? bridged.nodeId : '',
          kind,
          name,
        });
      }
      return fail(
        'E_COMMAND_FAILED',
        EXTRA_COMMAND_IDS.TREE_CREATE_NODE,
        bridged && typeof bridged.reason === 'string'
          ? bridged.reason
          : bridged && typeof bridged.error === 'string'
            ? bridged.error
            : response && typeof response.reason === 'string'
              ? response.reason
              : 'TREE_CREATE_FAILED',
      );
    },
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.TREE_RENAME_NODE,
      label: 'Rename Project Tree Node',
      group: 'edit',
      surface: ['internal'],
      hotkey: '',
    },
    async (input = {}) => {
      if (!electronAPI || typeof electronAPI !== 'object') {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.TREE_RENAME_NODE, 'ELECTRON_API_UNAVAILABLE');
      }
      const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : '';
      const nodeId = typeof input.nodeId === 'string' ? input.nodeId.trim() : '';
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!projectId || !nodeId || !name) {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.TREE_RENAME_NODE, 'TREE_RENAME_PAYLOAD_INVALID');
      }

      let response;
      try {
        response = await invokeBridgeOnlyCommand(
          electronAPI,
          EXTRA_COMMAND_IDS.TREE_RENAME_NODE,
          { projectId, nodeId, name },
        );
      } catch (error) {
        return fail(
          'E_COMMAND_FAILED',
          EXTRA_COMMAND_IDS.TREE_RENAME_NODE,
          'TREE_RENAME_IPC_FAILED',
          { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
        );
      }

      const bridged = response && typeof response === 'object' && !Array.isArray(response)
        && response.value && typeof response.value === 'object' && !Array.isArray(response.value)
        ? response.value
        : response;
      if (bridged && (bridged.ok === 1 || bridged.ok === true)) {
        return ok({
          renamed: true,
          projectId,
          nodeId: typeof bridged.nodeId === 'string' && bridged.nodeId.trim()
            ? bridged.nodeId.trim()
            : nodeId,
        });
      }
      return fail(
        'E_COMMAND_FAILED',
        EXTRA_COMMAND_IDS.TREE_RENAME_NODE,
        bridged && typeof bridged.reason === 'string'
          ? bridged.reason
          : bridged && typeof bridged.error === 'string'
            ? bridged.error
            : response && typeof response.reason === 'string'
              ? response.reason
              : 'TREE_RENAME_FAILED',
      );
    },
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.TREE_DELETE_NODE,
      label: 'Delete Project Tree Node',
      group: 'edit',
      surface: ['internal'],
      hotkey: '',
    },
    async (input = {}) => {
      if (!electronAPI || typeof electronAPI !== 'object') {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.TREE_DELETE_NODE, 'ELECTRON_API_UNAVAILABLE');
      }
      const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : '';
      const nodeId = typeof input.nodeId === 'string' ? input.nodeId.trim() : '';
      if (!projectId || !nodeId) {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.TREE_DELETE_NODE, 'TREE_DELETE_PAYLOAD_INVALID');
      }

      let response;
      try {
        response = await invokeBridgeOnlyCommand(
          electronAPI,
          EXTRA_COMMAND_IDS.TREE_DELETE_NODE,
          { projectId, nodeId },
        );
      } catch (error) {
        return fail(
          'E_COMMAND_FAILED',
          EXTRA_COMMAND_IDS.TREE_DELETE_NODE,
          'TREE_DELETE_IPC_FAILED',
          { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
        );
      }

      const bridged = response && typeof response === 'object' && !Array.isArray(response)
        && response.value && typeof response.value === 'object' && !Array.isArray(response.value)
        ? response.value
        : response;
      if (bridged && (bridged.ok === 1 || bridged.ok === true)) {
        return ok({ deleted: true, projectId, nodeId });
      }
      return fail(
        'E_COMMAND_FAILED',
        EXTRA_COMMAND_IDS.TREE_DELETE_NODE,
        bridged && typeof bridged.reason === 'string'
          ? bridged.reason
          : bridged && typeof bridged.error === 'string'
            ? bridged.error
            : response && typeof response.reason === 'string'
              ? response.reason
              : 'TREE_DELETE_FAILED',
      );
    },
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.TREE_REORDER_NODE,
      label: 'Reorder Project Tree Node',
      group: 'edit',
      surface: ['internal'],
      hotkey: '',
    },
    async (input = {}) => {
      if (!electronAPI || typeof electronAPI !== 'object') {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.TREE_REORDER_NODE, 'ELECTRON_API_UNAVAILABLE');
      }
      const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : '';
      const nodeId = typeof input.nodeId === 'string' ? input.nodeId.trim() : '';
      const direction = typeof input.direction === 'string' ? input.direction.trim() : '';
      if (!projectId || !nodeId || (direction !== 'up' && direction !== 'down')) {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.TREE_REORDER_NODE, 'TREE_REORDER_PAYLOAD_INVALID');
      }

      let response;
      try {
        response = await invokeBridgeOnlyCommand(
          electronAPI,
          EXTRA_COMMAND_IDS.TREE_REORDER_NODE,
          { projectId, nodeId, direction },
        );
      } catch (error) {
        return fail(
          'E_COMMAND_FAILED',
          EXTRA_COMMAND_IDS.TREE_REORDER_NODE,
          'TREE_REORDER_IPC_FAILED',
          { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
        );
      }

      const bridged = response && typeof response === 'object' && !Array.isArray(response)
        && response.value && typeof response.value === 'object' && !Array.isArray(response.value)
        ? response.value
        : response;
      if (bridged && (bridged.ok === 1 || bridged.ok === true)) {
        const events = Array.isArray(bridged.events) ? bridged.events : [];
        const domainEventDigest = typeof bridged.domainEventDigest === 'string' ? bridged.domainEventDigest.trim() : '';
        const reordered = bridged.reordered === true;
        if (reordered && (events.length === 0 || !domainEventDigest)) {
          return fail(
            'E_COMMAND_FAILED',
            EXTRA_COMMAND_IDS.TREE_REORDER_NODE,
            'TREE_REORDER_DOMAIN_EVENT_REQUIRED',
          );
        }
        if (reordered) {
          if (domainEventPort && typeof domainEventPort.hashCoreDomainEvents === 'function') {
            let recomputedDigest = '';
            try {
              recomputedDigest = domainEventPort.hashCoreDomainEvents(events);
            } catch {
              return fail(
                'E_COMMAND_FAILED',
                EXTRA_COMMAND_IDS.TREE_REORDER_NODE,
                'TREE_REORDER_DOMAIN_EVENT_DIGEST_INVALID',
              );
            }
            if (recomputedDigest !== domainEventDigest) {
              return fail(
                'E_COMMAND_FAILED',
                EXTRA_COMMAND_IDS.TREE_REORDER_NODE,
                'TREE_REORDER_DOMAIN_EVENT_DIGEST_MISMATCH',
              );
            }
          } else if (bridged.domainEventDigestVerified !== true) {
            return fail(
              'E_COMMAND_FAILED',
              EXTRA_COMMAND_IDS.TREE_REORDER_NODE,
              'TREE_REORDER_DOMAIN_EVENT_DIGEST_VERIFICATION_REQUIRED',
            );
          }
        }
        return ok({
          reordered,
          projectId,
          nodeId: typeof bridged.nodeId === 'string' && bridged.nodeId.trim()
            ? bridged.nodeId.trim()
            : nodeId,
          direction,
          events,
          domainEvents: events,
          domainEventDigest,
          receipt: bridged.receipt && typeof bridged.receipt === 'object' && !Array.isArray(bridged.receipt)
            ? bridged.receipt
            : null,
        });
      }
      return fail(
        'E_COMMAND_FAILED',
        EXTRA_COMMAND_IDS.TREE_REORDER_NODE,
        bridged && typeof bridged.reason === 'string'
          ? bridged.reason
          : bridged && typeof bridged.error === 'string'
            ? bridged.error
            : response && typeof response.reason === 'string'
              ? response.reason
              : 'TREE_REORDER_FAILED',
      );
    },
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.TREE_MOVE_NODE,
      label: 'Move Project Tree Node',
      group: 'edit',
      surface: ['internal'],
      hotkey: '',
    },
    async (input = {}) => {
      if (!electronAPI || typeof electronAPI !== 'object') {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.TREE_MOVE_NODE, 'ELECTRON_API_UNAVAILABLE');
      }
      const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : '';
      const nodeId = typeof input.nodeId === 'string' ? input.nodeId.trim() : '';
      const targetParentNodeId = typeof input.targetParentNodeId === 'string' ? input.targetParentNodeId.trim() : '';
      const targetIndex = Number.isInteger(input.targetIndex) ? input.targetIndex : -1;
      if (!projectId || !nodeId || !targetParentNodeId || targetIndex < 0) {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.TREE_MOVE_NODE, 'TREE_MOVE_PAYLOAD_INVALID');
      }

      let response;
      try {
        response = await invokeBridgeOnlyCommand(
          electronAPI,
          EXTRA_COMMAND_IDS.TREE_MOVE_NODE,
          { projectId, nodeId, targetParentNodeId, targetIndex },
        );
      } catch (error) {
        return fail(
          'E_COMMAND_FAILED',
          EXTRA_COMMAND_IDS.TREE_MOVE_NODE,
          'TREE_MOVE_IPC_FAILED',
          { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
        );
      }

      const bridged = response && typeof response === 'object' && !Array.isArray(response)
        && response.value && typeof response.value === 'object' && !Array.isArray(response.value)
        ? response.value
        : response;
      if (bridged && (bridged.ok === 1 || bridged.ok === true)) {
        return ok({
          moved: true,
          projectId,
          nodeId: typeof bridged.nodeId === 'string' && bridged.nodeId.trim()
            ? bridged.nodeId.trim()
            : nodeId,
          targetParentNodeId,
          targetIndex: Number.isInteger(bridged.targetIndex) ? bridged.targetIndex : targetIndex,
        });
      }
      return fail(
        'E_COMMAND_FAILED',
        EXTRA_COMMAND_IDS.TREE_MOVE_NODE,
        bridged && typeof bridged.reason === 'string'
          ? bridged.reason
          : bridged && typeof bridged.error === 'string'
            ? bridged.error
            : response && typeof response.reason === 'string'
              ? response.reason
              : 'TREE_MOVE_FAILED',
      );
    },
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.METADATA_UPDATE,
      label: 'Update Metadata',
      group: 'edit',
      surface: ['inspector'],
      hotkey: '',
    },
    async (input = {}) => {
      if (!electronAPI || typeof electronAPI !== 'object') {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.METADATA_UPDATE, 'ELECTRON_API_UNAVAILABLE');
      }
      const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : '';
      const nodeId = typeof input.nodeId === 'string' ? input.nodeId.trim() : '';
      const baselineHash = typeof input.baselineHash === 'string' ? input.baselineHash.trim() : '';
      const metadata = input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
        ? input.metadata
        : null;
      if (!projectId || !nodeId || !/^[a-f0-9]{64}$/u.test(baselineHash) || !metadata) {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.METADATA_UPDATE, 'METADATA_UPDATE_PAYLOAD_INVALID');
      }

      let response;
      try {
        response = await invokeBridgeOnlyCommand(
          electronAPI,
          EXTRA_COMMAND_IDS.METADATA_UPDATE,
          { projectId, nodeId, baselineHash, metadata },
        );
      } catch (error) {
        return fail(
          'E_COMMAND_FAILED',
          EXTRA_COMMAND_IDS.METADATA_UPDATE,
          'METADATA_UPDATE_IPC_FAILED',
          { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
        );
      }

      const bridged = unwrapBridgeResponseValue(response);
      if (bridged && bridged.ok === true) {
        return ok({
          updated: bridged.updated === true,
          projectId,
          nodeId: typeof bridged.nodeId === 'string' && bridged.nodeId.trim()
            ? bridged.nodeId.trim()
            : nodeId,
          metadata: getObjectOrNull(bridged.metadata),
          wordCount: Number.isInteger(bridged.wordCount) ? Math.max(0, bridged.wordCount) : 0,
          receipt: getObjectOrNull(bridged.receipt),
        });
      }
      return fail(
        'E_COMMAND_FAILED',
        EXTRA_COMMAND_IDS.METADATA_UPDATE,
        bridged && typeof bridged.reason === 'string'
          ? bridged.reason
          : bridged && typeof bridged.error === 'string'
            ? bridged.error
            : response && typeof response.reason === 'string'
              ? response.reason
              : 'METADATA_UPDATE_FAILED',
      );
    },
  );

  [
    [EXTRA_COMMAND_IDS.NOTES_CREATE, 'Create Note'],
    [EXTRA_COMMAND_IDS.NOTES_UPDATE, 'Update Note'],
    [EXTRA_COMMAND_IDS.NOTES_DELETE, 'Delete Note'],
    [EXTRA_COMMAND_IDS.NOTES_RESTORE, 'Restore Note'],
    [EXTRA_COMMAND_IDS.NOTES_ATTACH_SCENE, 'Attach Note To Scene'],
    [EXTRA_COMMAND_IDS.NOTES_CONVERT_SCENE, 'Convert Note To Scene'],
  ].forEach(([commandId, label]) => {
    registerBridgeOnlyProjectCommand(registry, electronAPI, commandId, {
      label,
      group: 'notes',
      surface: ['internal'],
    });
  });

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.EDIT_UNDO,
      label: 'Undo',
      group: 'edit',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: 'Cmd/Ctrl+Z',
    },
    async () => runUiAction(uiActions, 'undo', EXTRA_COMMAND_IDS.EDIT_UNDO),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.EDIT_REDO,
      label: 'Redo',
      group: 'edit',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: 'Cmd/Ctrl+Shift+Z',
    },
    async () => runUiAction(uiActions, 'redo', EXTRA_COMMAND_IDS.EDIT_REDO),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.EDIT_FIND,
      label: 'Find',
      group: 'edit',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: 'Cmd/Ctrl+F',
    },
    async () => runUiAction(uiActions, 'find', EXTRA_COMMAND_IDS.EDIT_FIND),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.EDIT_REPLACE,
      label: 'Replace',
      group: 'edit',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: 'Cmd/Ctrl+H',
    },
    async () => runUiAction(uiActions, 'replace', EXTRA_COMMAND_IDS.EDIT_REPLACE),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.VIEW_ZOOM_OUT,
      label: 'Zoom Out',
      group: 'view',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: 'Cmd/Ctrl+-',
    },
    async () => runUiAction(uiActions, 'zoomOut', EXTRA_COMMAND_IDS.VIEW_ZOOM_OUT),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.VIEW_ZOOM_IN,
      label: 'Zoom In',
      group: 'view',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: 'Cmd/Ctrl+=',
    },
    async () => runUiAction(uiActions, 'zoomIn', EXTRA_COMMAND_IDS.VIEW_ZOOM_IN),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.VIEW_TOGGLE_WRAP,
      label: 'Toggle Wrap',
      group: 'view',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: 'Cmd/Ctrl+Alt+W',
    },
    async () => runUiAction(uiActions, 'toggleWrap', EXTRA_COMMAND_IDS.VIEW_TOGGLE_WRAP),
  );

  [
    {
      id: EXTRA_COMMAND_IDS.VIEW_PREVIEW_FORMAT_A4,
      label: 'Preview Format A4',
      formatId: 'A4',
    },
    {
      id: EXTRA_COMMAND_IDS.VIEW_PREVIEW_FORMAT_A5,
      label: 'Preview Format A5',
      formatId: 'A5',
    },
    {
      id: EXTRA_COMMAND_IDS.VIEW_PREVIEW_FORMAT_LETTER,
      label: 'Preview Format Letter',
      formatId: 'LETTER',
    },
  ].forEach(({ id, label, formatId }) => {
    registry.registerCommand(
      {
        id,
        label,
        group: 'view',
        surface: ['menu', 'palette', 'toolbar'],
        hotkey: '',
      },
      async () => runUiAction(uiActions, 'setPreviewFormat', id, { formatId }),
    );
  });

  [
    {
      id: EXTRA_COMMAND_IDS.VIEW_PREVIEW_ORIENTATION_PORTRAIT,
      label: 'Preview Orientation Portrait',
      orientation: 'portrait',
    },
    {
      id: EXTRA_COMMAND_IDS.VIEW_PREVIEW_ORIENTATION_LANDSCAPE,
      label: 'Preview Orientation Landscape',
      orientation: 'landscape',
    },
  ].forEach(({ id, label, orientation }) => {
    registry.registerCommand(
      {
        id,
        label,
        group: 'view',
        surface: ['menu', 'palette', 'toolbar'],
        hotkey: '',
      },
      async () => runUiAction(uiActions, 'setPreviewOrientation', id, { orientation }),
    );
  });

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.VIEW_TOGGLE_PREVIEW,
      label: 'Toggle Preview',
      group: 'view',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: '',
    },
    async () => runUiAction(uiActions, 'togglePreview', EXTRA_COMMAND_IDS.VIEW_TOGGLE_PREVIEW),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.VIEW_TOGGLE_PREVIEW_FRAME,
      label: 'Toggle Preview Frame',
      group: 'view',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: '',
    },
    async () => runUiAction(uiActions, 'togglePreviewFrame', EXTRA_COMMAND_IDS.VIEW_TOGGLE_PREVIEW_FRAME),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.INSERT_MARKDOWN_PROMPT,
      label: 'Legacy Markdown Prompt',
      group: 'insert',
      surface: ['internal'],
      hotkey: 'Cmd/Ctrl+Shift+I',
    },
    async () => runUiAction(uiActions, 'insertMarkdownPrompt', EXTRA_COMMAND_IDS.INSERT_MARKDOWN_PROMPT),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.INSERT_FLOW_OPEN,
      label: 'Insert Flow Mode',
      group: 'insert',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: 'Cmd/Ctrl+Shift+F',
    },
    async () => runUiAction(uiActions, 'insertFlowOpen', EXTRA_COMMAND_IDS.INSERT_FLOW_OPEN),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.INSERT_ADD_CARD,
      label: 'Insert Card',
      group: 'insert',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: 'Cmd/Ctrl+Shift+K',
    },
    async () => runUiAction(uiActions, 'insertAddCard', EXTRA_COMMAND_IDS.INSERT_ADD_CARD),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.FORMAT_TOGGLE_BOLD,
      label: 'Toggle Bold',
      group: 'format',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: 'Cmd/Ctrl+B',
    },
    async () => runUiAction(uiActions, 'formatToggleBold', EXTRA_COMMAND_IDS.FORMAT_TOGGLE_BOLD),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.FORMAT_TOGGLE_ITALIC,
      label: 'Toggle Italic',
      group: 'format',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: 'Cmd/Ctrl+I',
    },
    async () => runUiAction(uiActions, 'formatToggleItalic', EXTRA_COMMAND_IDS.FORMAT_TOGGLE_ITALIC),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.FORMAT_TOGGLE_UNDERLINE,
      label: 'Toggle Underline',
      group: 'format',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: 'Cmd/Ctrl+U',
    },
    async () => runUiAction(uiActions, 'formatToggleUnderline', EXTRA_COMMAND_IDS.FORMAT_TOGGLE_UNDERLINE),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.FORMAT_ALIGN_LEFT,
      label: 'Align Left',
      group: 'format',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: 'Cmd/Ctrl+Alt+1',
    },
    async () => runUiAction(uiActions, 'formatAlignLeft', EXTRA_COMMAND_IDS.FORMAT_ALIGN_LEFT),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.FORMAT_ALIGN_CENTER,
      label: 'Align Center',
      group: 'format',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: 'Cmd/Ctrl+Alt+2',
    },
    async () => runUiAction(uiActions, 'formatAlignCenter', EXTRA_COMMAND_IDS.FORMAT_ALIGN_CENTER),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.FORMAT_ALIGN_RIGHT,
      label: 'Align Right',
      group: 'format',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: 'Cmd/Ctrl+Alt+3',
    },
    async () => runUiAction(uiActions, 'formatAlignRight', EXTRA_COMMAND_IDS.FORMAT_ALIGN_RIGHT),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.FORMAT_ALIGN_JUSTIFY,
      label: 'Align Justify',
      group: 'format',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: 'Cmd/Ctrl+Alt+4',
    },
    async () => runUiAction(uiActions, 'formatAlignJustify', EXTRA_COMMAND_IDS.FORMAT_ALIGN_JUSTIFY),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.LIST_TOGGLE_BULLET,
      label: 'Toggle Bullet List',
      group: 'list',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: '',
    },
    async () => runUiAction(uiActions, 'listToggleBullet', EXTRA_COMMAND_IDS.LIST_TOGGLE_BULLET),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.LIST_TOGGLE_ORDERED,
      label: 'Toggle Ordered List',
      group: 'list',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: '',
    },
    async () => runUiAction(uiActions, 'listToggleOrdered', EXTRA_COMMAND_IDS.LIST_TOGGLE_ORDERED),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.LIST_CLEAR,
      label: 'Clear List',
      group: 'list',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: '',
    },
    async () => runUiAction(uiActions, 'listClear', EXTRA_COMMAND_IDS.LIST_CLEAR),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.INSERT_LINK_PROMPT,
      label: 'Insert Link',
      group: 'insert',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: 'Cmd/Ctrl+K',
    },
    async (input = {}) => runUiAction(uiActions, 'insertLinkPrompt', EXTRA_COMMAND_IDS.INSERT_LINK_PROMPT, input),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.FORMAT_TEXT_COLOR_PICKER,
      label: 'Text Color',
      group: 'format',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: '',
    },
    async (input = {}) => runUiAction(uiActions, 'formatTextColorPicker', EXTRA_COMMAND_IDS.FORMAT_TEXT_COLOR_PICKER, input),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.FORMAT_HIGHLIGHT_COLOR_PICKER,
      label: 'Highlight Color',
      group: 'format',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: '',
    },
    async (input = {}) => runUiAction(uiActions, 'formatHighlightColorPicker', EXTRA_COMMAND_IDS.FORMAT_HIGHLIGHT_COLOR_PICKER, input),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.REVIEW_OPEN_COMMENTS,
      label: 'Open Comments',
      group: 'review',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: '',
    },
    async (input = {}) => runUiAction(uiActions, 'reviewOpenComments', EXTRA_COMMAND_IDS.REVIEW_OPEN_COMMENTS, input),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.REVIEW_IMPORT_LOCAL_PACKET,
      label: 'Import Review Packet for Exact Apply',
      group: 'review',
      surface: ['menu', 'palette'],
      hotkey: '',
    },
    async (input = {}) => runUiAction(uiActions, 'reviewImportLocalPacket', EXTRA_COMMAND_IDS.REVIEW_IMPORT_LOCAL_PACKET, input),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.REVIEW_EXPORT_LOCAL_PACKET,
      label: 'Export Review Packet',
      group: 'review',
      surface: ['menu'],
      hotkey: '',
    },
    async (input = {}) => runReviewExportLocalPacketBridge(electronAPI, input),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.REVIEW_EXPORT_DOCX_REVIEW_PACKET,
      label: 'Export Review DOCX Packet',
      group: 'review',
      surface: ['menu', 'palette'],
      hotkey: '',
    },
    async (input = {}) => runReviewExportDocxReviewPacketBridge(electronAPI, input),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.REVIEW_CLEAR_SESSION,
      label: 'Clear Review Session',
      group: 'review',
      surface: ['menu', 'palette'],
      hotkey: '',
    },
    async (input = {}) => runUiAction(uiActions, 'reviewClearSession', EXTRA_COMMAND_IDS.REVIEW_CLEAR_SESSION, input),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.REVIEW_CANCEL_OPERATION,
      label: 'Cancel Review Operation',
      group: 'review',
      surface: ['menu', 'palette'],
      hotkey: '',
    },
    async (input = {}) => runUiAction(uiActions, 'reviewCancelOperation', EXTRA_COMMAND_IDS.REVIEW_CANCEL_OPERATION, input),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.PLAN_FLOW_SAVE,
      label: 'Plan Flow Save',
      group: 'plan',
      surface: ['menu', 'palette', 'toolbar'],
      hotkey: 'Cmd/Ctrl+Shift+S',
    },
    async () => runUiAction(uiActions, 'planFlowSave', EXTRA_COMMAND_IDS.PLAN_FLOW_SAVE),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.REVIEW_EXPORT_MARKDOWN,
      label: 'Legacy Markdown Export Shortcut',
      group: 'review',
      surface: ['internal'],
      hotkey: 'Cmd/Ctrl+Shift+M',
    },
    async () => runUiAction(uiActions, 'reviewExportMarkdown', EXTRA_COMMAND_IDS.REVIEW_EXPORT_MARKDOWN),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.PROJECT_DOCX_PREVIEW_LOCAL_FILE,
      label: 'Preview Local DOCX Import',
      group: 'file',
      surface: ['internal'],
      hotkey: '',
    },
    async (input = {}) => {
      return runDocxImportLocalFilePreviewBridge(electronAPI, input);
    },
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.PROJECT_DOCX_PREVIEW_IMPORT_PLAN,
      label: 'Prepare DOCX Import Plan',
      group: 'file',
      surface: ['internal'],
      hotkey: '',
    },
    async (input = {}) => runDocxImportPreviewPlanBridge(electronAPI, input),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.PROJECT_DOCX_IMPORT_SAFE_CREATE,
      label: 'Accept DOCX Import',
      group: 'file',
      surface: ['internal'],
      hotkey: '',
    },
    async (input = {}) => runDocxImportSafeCreateBridge(electronAPI, input),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.PROJECT_TXT_PREVIEW_LOCAL_FILE,
      label: 'Preview Local TXT Import',
      group: 'file',
      surface: ['internal'],
      hotkey: '',
    },
    async (input = {}) => runTxtImportLocalFilePreviewBridge(electronAPI, input),
  );

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.PROJECT_TXT_IMPORT_SAFE_CREATE,
      label: 'Accept TXT Import',
      group: 'file',
      surface: ['internal'],
      hotkey: '',
    },
    async (input = {}) => runTxtImportSafeCreateBridge(electronAPI, input),
  );

  registry.registerCommand(
    {
      id: UI_COMMAND_IDS.THEME_SET,
      label: 'Set Theme',
      group: 'view',
      surface: ['internal'],
      hotkey: '',
    },
    async (input = {}) => runUiAction(uiActions, 'setTheme', UI_COMMAND_IDS.THEME_SET, input),
  );

  registry.registerCommand(
    {
      id: UI_COMMAND_IDS.FONT_SET,
      label: 'Set Font',
      group: 'format',
      surface: ['internal'],
      hotkey: '',
    },
    async (input = {}) => runUiAction(uiActions, 'setFont', UI_COMMAND_IDS.FONT_SET, input),
  );

  registry.registerCommand(
    {
      id: UI_COMMAND_IDS.FONT_SIZE_SET,
      label: 'Set Font Size',
      group: 'format',
      surface: ['internal'],
      hotkey: '',
    },
    async (input = {}) => runUiAction(uiActions, 'setFontSize', UI_COMMAND_IDS.FONT_SIZE_SET, input),
  );

  registerCatalogCommand(registry, COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN, async (input = {}) => {
    if (!electronAPI || typeof electronAPI !== 'object') {
      return fail(
        'E_UNWIRED_EXPORT_BACKEND',
        COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN,
        'EXPORT_DOCXMIN_BACKEND_NOT_WIRED',
      );
    }
    const hasBridgeHook = typeof electronAPI.invokeUiCommandBridge === 'function';
    const hasLegacyHook = typeof electronAPI.exportDocxMin === 'function';
    if (!hasBridgeHook && !hasLegacyHook) {
      return fail(
        'E_UNWIRED_EXPORT_BACKEND',
        COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN,
        'EXPORT_DOCXMIN_BACKEND_NOT_WIRED',
      );
    }

    const payload = {
      requestId: typeof input.requestId === 'string' && input.requestId.length > 0
        ? input.requestId
        : 'u3-export-docxmin-request',
      outPath: typeof input.outPath === 'string' ? input.outPath : '',
      outDir: typeof input.outDir === 'string' ? input.outDir : '',
      bufferSource: typeof input.bufferSource === 'string' ? input.bufferSource : '',
      options: input.options && typeof input.options === 'object' && !Array.isArray(input.options)
        ? input.options
        : {},
    };
    if (input.preview === true) {
      payload.preview = true;
    }
    if (input.confirmed === true) {
      payload.confirmed = true;
    }

    let response;
    try {
      response = await invokeTransferAndFlowCommandBridge(electronAPI, COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN, payload);
    } catch (error) {
      return fail(
        'E_COMMAND_FAILED',
        COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN,
        'EXPORT_DOCXMIN_IPC_FAILED',
        { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
      );
    }
    const bridged = unwrapBridgeResponseValue(response);

    if (bridged && (bridged.ok === 1 || bridged.ok === true)) {
      if (bridged.preview === true) {
        return ok({
          exported: false,
          preview: true,
        });
      }
      return ok({
        exported: true,
        outPath: typeof bridged.outPath === 'string' ? bridged.outPath : '',
        bytesWritten: Number.isInteger(bridged.bytesWritten) ? bridged.bytesWritten : 0,
      });
    }

    if (bridged && bridged.ok === 0 && bridged.error && typeof bridged.error === 'object') {
      const error = bridged.error;
      return fail(
        typeof error.code === 'string' ? error.code : 'E_EXPORT_DOCXMIN_FAILED',
        typeof error.op === 'string' ? error.op : EXPORT_DOCX_MIN_OP,
        typeof error.reason === 'string' ? error.reason : 'EXPORT_DOCXMIN_FAILED',
        error.details && typeof error.details === 'object' && !Array.isArray(error.details) ? error.details : undefined,
      );
    }

    return fail(
      'E_COMMAND_FAILED',
      COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN,
      'EXPORT_DOCXMIN_INVALID_RESPONSE',
    );
  });

  registerCatalogCommand(registry, COMMAND_IDS.PROJECT_EXPORT_PDF_V1, async () => {
    return runUiAction(
      uiActions,
      'openExportSurface',
      COMMAND_IDS.PROJECT_EXPORT_PDF_V1,
      { commandId: COMMAND_IDS.PROJECT_EXPORT_PDF_V1 },
    );
  });

  registerCatalogCommand(registry, COMMAND_IDS.PROJECT_EXPORT_FULL_ARCHIVE_V1, async () => {
    return runUiAction(
      uiActions,
      'openExportSurface',
      COMMAND_IDS.PROJECT_EXPORT_FULL_ARCHIVE_V1,
      { commandId: COMMAND_IDS.PROJECT_EXPORT_FULL_ARCHIVE_V1 },
    );
  });

  registerCatalogCommand(registry, COMMAND_IDS.PROJECT_IMPORT_FULL_ARCHIVE_V1, async () => {
    return runUiAction(
      uiActions,
      'openImportSurface',
      COMMAND_IDS.PROJECT_IMPORT_FULL_ARCHIVE_V1,
      { commandId: COMMAND_IDS.PROJECT_IMPORT_FULL_ARCHIVE_V1 },
    );
  });

  registerCatalogCommand(registry, COMMAND_IDS.PROJECT_IMPORT_MARKDOWN_V1, async (input = {}) => {
    if (!electronAPI || typeof electronAPI !== 'object') {
      return fail(
        'MDV1_INTERNAL_ERROR',
        COMMAND_IDS.PROJECT_IMPORT_MARKDOWN_V1,
        'IMPORT_MARKDOWN_BACKEND_NOT_WIRED',
      );
    }

    const payload = {
      text: typeof input.text === 'string'
        ? input.text
        : (typeof input.markdown === 'string' ? input.markdown : ''),
      sourceName: typeof input.sourceName === 'string' ? input.sourceName : '',
      sourcePath: typeof input.sourcePath === 'string' ? input.sourcePath : '',
      preview: input.preview === true,
      safeCreate: input.safeCreate === true,
      previewPayload: input.previewPayload && typeof input.previewPayload === 'object' && !Array.isArray(input.previewPayload)
        ? input.previewPayload
        : null,
      limits: input.limits && typeof input.limits === 'object' && !Array.isArray(input.limits)
        ? input.limits
        : {},
    };

    let response;
    try {
      response = await invokeTransferAndFlowCommandBridge(electronAPI, COMMAND_IDS.PROJECT_IMPORT_MARKDOWN_V1, payload);
    } catch (error) {
      return fail(
        'MDV1_INTERNAL_ERROR',
        COMMAND_IDS.PROJECT_IMPORT_MARKDOWN_V1,
        'IMPORT_MARKDOWN_IPC_FAILED',
        { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
      );
    }
    const bridged = unwrapBridgeResponseValue(response);

    if (bridged && (bridged.ok === true || bridged.ok === 1) && bridged.scene && typeof bridged.scene === 'object') {
      const result = {
        imported: true,
        scene: bridged.scene,
        lossReport: bridged.lossReport && typeof bridged.lossReport === 'object'
          ? bridged.lossReport
          : { count: 0, items: [] },
      };
      if (bridged.preview === true) {
        result.preview = true;
        result.previewResult = bridged.previewResult && typeof bridged.previewResult === 'object'
          ? bridged.previewResult
          : null;
      }
      return ok(result);
    }

    if (bridged && (bridged.ok === true || bridged.ok === 1) && bridged.safeCreate === true) {
      return ok({
        imported: true,
        safeCreate: true,
        created: bridged.created === true,
        createdSceneIds: Array.isArray(bridged.createdSceneIds) ? bridged.createdSceneIds : [],
        receipt: bridged.receipt && typeof bridged.receipt === 'object'
          ? bridged.receipt
          : null,
      });
    }

    if (bridged && bridged.ok === 0 && bridged.error && typeof bridged.error === 'object') {
      const error = bridged.error;
      return fail(
        typeof error.code === 'string' ? error.code : 'MDV1_INTERNAL_ERROR',
        typeof error.op === 'string' ? error.op : IMPORT_MARKDOWN_V1_OP,
        typeof error.reason === 'string' ? error.reason : 'IMPORT_MARKDOWN_FAILED',
        error.details && typeof error.details === 'object' && !Array.isArray(error.details) ? error.details : undefined,
      );
    }

    return fail(
      'MDV1_INTERNAL_ERROR',
      COMMAND_IDS.PROJECT_IMPORT_MARKDOWN_V1,
      'IMPORT_MARKDOWN_INVALID_RESPONSE',
    );
  });

  registerCatalogCommand(registry, COMMAND_IDS.PROJECT_IMPORT_DOCX_V1, async (input = {}) => {
    if (!electronAPI || typeof electronAPI !== 'object') {
      return fail(
        'E_DOCX_IMPORT_BACKEND_NOT_WIRED',
        COMMAND_IDS.PROJECT_IMPORT_DOCX_V1,
        'DOCX_IMPORT_BACKEND_NOT_WIRED',
      );
    }

    const acceptRequested = input && typeof input === 'object' && input.accept === true;
    let localFilePreview = getObjectOrNull(input?.localFilePreview);
    let docxImportPreviewPlan = getObjectOrNull(input?.docxImportPreviewPlan);
    let docxContentPreviewReport = getObjectOrNull(input?.docxContentPreviewReport)
      || getObjectOrNull(localFilePreview?.docxContentPreviewReport);

    if (!docxImportPreviewPlan) {
      const previewResult = await runDocxImportLocalFilePreviewBridge(electronAPI, {
        requestId: normalizeDocxImportRequestId(input),
      });
      if (!previewResult.ok) return previewResult;
      localFilePreview = previewResult.value.localFilePreview;
      docxImportPreviewPlan = getObjectOrNull(localFilePreview?.docxImportPreviewPlan);
      docxContentPreviewReport = getObjectOrNull(localFilePreview?.docxContentPreviewReport);
    }

    if (!acceptRequested) {
      return ok(buildDocxImportPreviewValue(localFilePreview, docxImportPreviewPlan));
    }

    const importPreviewResult = await runDocxImportPreviewPlanBridge(electronAPI, {
      requestId: normalizeDocxImportRequestId(input, 'docx-import-accept-preview'),
      docxContentPreviewReport,
    });
    if (!importPreviewResult.ok) return importPreviewResult;
    docxImportPreviewPlan = getObjectOrNull(importPreviewResult.value.docxImportPreviewPlan);

    if (!isReadyDocxImportPreviewPlan(docxImportPreviewPlan)) {
      return fail(
        'E_DOCX_IMPORT_PREVIEW_NOT_ACCEPTABLE',
        COMMAND_IDS.PROJECT_IMPORT_DOCX_V1,
        'DOCX_IMPORT_PREVIEW_NOT_ACCEPTABLE',
      );
    }

    return runDocxImportSafeCreateBridge(electronAPI, {
      requestId: normalizeDocxImportRequestId(input),
      docxImportPreviewPlan,
      localFilePreview,
    });
  });

  registerCatalogCommand(registry, COMMAND_IDS.PROJECT_IMPORT_TXT_V1, async (input = {}) => {
    if (!electronAPI || typeof electronAPI !== 'object') {
      return fail(
        'E_TXT_IMPORT_BACKEND_NOT_WIRED',
        COMMAND_IDS.PROJECT_IMPORT_TXT_V1,
        'TXT_IMPORT_BACKEND_NOT_WIRED',
      );
    }

    const acceptRequested = input && typeof input === 'object' && input.accept === true;
    let localFilePreview = getObjectOrNull(input?.localFilePreview);
    let txtImportPreviewPlan = getObjectOrNull(input?.txtImportPreviewPlan)
      || getObjectOrNull(localFilePreview?.txtImportPreviewPlan);
    let sourceSummary = getObjectOrNull(input?.sourceSummary)
      || getObjectOrNull(localFilePreview?.sourceSummary);

    if (!txtImportPreviewPlan) {
      const previewResult = await runTxtImportLocalFilePreviewBridge(electronAPI, {
        requestId: normalizeTxtImportRequestId(input),
      });
      if (!previewResult.ok) return previewResult;
      localFilePreview = previewResult.value.localFilePreview;
      txtImportPreviewPlan = getObjectOrNull(localFilePreview?.txtImportPreviewPlan);
      sourceSummary = getObjectOrNull(localFilePreview?.sourceSummary);
    }

    if (!acceptRequested) {
      return ok(buildTxtImportPreviewValue(localFilePreview, txtImportPreviewPlan));
    }

    if (!isReadyTxtImportPreviewPlan(txtImportPreviewPlan)) {
      return fail(
        'E_TXT_IMPORT_PREVIEW_NOT_ACCEPTABLE',
        COMMAND_IDS.PROJECT_IMPORT_TXT_V1,
        'TXT_IMPORT_PREVIEW_NOT_ACCEPTABLE',
      );
    }

    return runTxtImportSafeCreateBridge(electronAPI, {
      requestId: normalizeTxtImportRequestId(input),
      txtImportPreviewPlan,
      localFilePreview,
      sourceSummary,
    });
  });

  registerCatalogCommand(registry, COMMAND_IDS.PROJECT_EXPORT_MARKDOWN_V1, async (input = {}) => {
    if (!electronAPI || typeof electronAPI !== 'object') {
      return fail(
        'MDV1_INTERNAL_ERROR',
        COMMAND_IDS.PROJECT_EXPORT_MARKDOWN_V1,
        'EXPORT_MARKDOWN_BACKEND_NOT_WIRED',
      );
    }
    if (!input || typeof input !== 'object' || Array.isArray(input) || !input.scene || typeof input.scene !== 'object') {
      return fail(
        'MDV1_INTERNAL_ERROR',
        COMMAND_IDS.PROJECT_EXPORT_MARKDOWN_V1,
        'EXPORT_MARKDOWN_SCENE_REQUIRED',
      );
    }

    const payload = {
      scene: input.scene,
      outPath: typeof input.outPath === 'string' ? input.outPath : '',
      saveAs: input.saveAs === true,
      defaultName: typeof input.defaultName === 'string' ? input.defaultName : '',
      snapshotLimit: Number.isInteger(input.snapshotLimit) && input.snapshotLimit >= 1
        ? input.snapshotLimit
        : 3,
      safetyMode: normalizeSafetyMode(input.safetyMode),
      limits: input.limits && typeof input.limits === 'object' && !Array.isArray(input.limits)
        ? input.limits
        : {},
    };

    let response;
    try {
      response = await invokeTransferAndFlowCommandBridge(electronAPI, COMMAND_IDS.PROJECT_EXPORT_MARKDOWN_V1, payload);
    } catch (error) {
      return fail(
        'MDV1_INTERNAL_ERROR',
        COMMAND_IDS.PROJECT_EXPORT_MARKDOWN_V1,
        'EXPORT_MARKDOWN_IPC_FAILED',
        { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
      );
    }
    const bridged = unwrapBridgeResponseValue(response);

    if (bridged && (bridged.ok === true || bridged.ok === 1) && bridged.canceled === true) {
      return ok({
        exported: false,
        canceled: true,
        outPath: '',
        bytesWritten: 0,
        lossReport: bridged.lossReport && typeof bridged.lossReport === 'object'
          ? bridged.lossReport
          : { count: 0, items: [] },
      });
    }

    if (bridged && (bridged.ok === true || bridged.ok === 1) && typeof bridged.markdown === 'string') {
      const output = {
        exported: true,
        markdown: bridged.markdown,
        lossReport: bridged.lossReport && typeof bridged.lossReport === 'object'
          ? bridged.lossReport
          : { count: 0, items: [] },
      };

      if (typeof bridged.outPath === 'string' && bridged.outPath.length > 0) {
        output.outPath = bridged.outPath;
      }
      if (Number.isInteger(bridged.bytesWritten) && bridged.bytesWritten >= 0) {
        output.bytesWritten = bridged.bytesWritten;
      }
      if (typeof bridged.safetyMode === 'string' && bridged.safetyMode.length > 0) {
        output.safetyMode = bridged.safetyMode;
      }
      if (bridged.snapshotCreated === true) {
        output.snapshotCreated = true;
        if (typeof bridged.snapshotPath === 'string' && bridged.snapshotPath.length > 0) {
          output.snapshotPath = bridged.snapshotPath;
        }
      }

      return ok(output);
    }

    if (bridged && bridged.ok === 0 && bridged.error && typeof bridged.error === 'object') {
      const error = bridged.error;
      return fail(
        typeof error.code === 'string' ? error.code : 'MDV1_INTERNAL_ERROR',
        typeof error.op === 'string' ? error.op : EXPORT_MARKDOWN_V1_OP,
        typeof error.reason === 'string' ? error.reason : 'EXPORT_MARKDOWN_FAILED',
        error.details && typeof error.details === 'object' && !Array.isArray(error.details) ? error.details : undefined,
      );
    }

    return fail(
      'MDV1_INTERNAL_ERROR',
      COMMAND_IDS.PROJECT_EXPORT_MARKDOWN_V1,
      'EXPORT_MARKDOWN_INVALID_RESPONSE',
    );
  });

  registerCatalogCommand(registry, COMMAND_IDS.PROJECT_FLOW_OPEN_V1, async () => {
    if (!electronAPI || typeof electronAPI !== 'object') {
      return fail(
        'M7_FLOW_INTERNAL_ERROR',
        COMMAND_IDS.PROJECT_FLOW_OPEN_V1,
        'FLOW_OPEN_BACKEND_NOT_WIRED',
      );
    }

    let response;
    try {
      response = await invokeTransferAndFlowCommandBridge(electronAPI, COMMAND_IDS.PROJECT_FLOW_OPEN_V1);
    } catch (error) {
      return fail(
        'M7_FLOW_INTERNAL_ERROR',
        COMMAND_IDS.PROJECT_FLOW_OPEN_V1,
        'FLOW_OPEN_IPC_FAILED',
        { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
      );
    }
    const bridged = unwrapBridgeResponseValue(response);

    if (bridged && (bridged.ok === true || bridged.ok === 1) && Array.isArray(bridged.scenes)) {
      return ok({
        opened: true,
        scenes: bridged.scenes,
      });
    }

    if (bridged && bridged.ok === 0 && bridged.error && typeof bridged.error === 'object') {
      const error = bridged.error;
      return fail(
        typeof error.code === 'string' ? error.code : 'M7_FLOW_INTERNAL_ERROR',
        typeof error.op === 'string' ? error.op : FLOW_OPEN_V1_OP,
        typeof error.reason === 'string' ? error.reason : 'FLOW_OPEN_FAILED',
        error.details && typeof error.details === 'object' && !Array.isArray(error.details) ? error.details : undefined,
      );
    }

    return fail(
      'M7_FLOW_INTERNAL_ERROR',
      COMMAND_IDS.PROJECT_FLOW_OPEN_V1,
      'FLOW_OPEN_INVALID_RESPONSE',
    );
  });

  registerCatalogCommand(registry, COMMAND_IDS.PROJECT_FLOW_SAVE_V1, async (input = {}) => {
    if (!electronAPI || typeof electronAPI !== 'object') {
      return fail(
        'M7_FLOW_INTERNAL_ERROR',
        COMMAND_IDS.PROJECT_FLOW_SAVE_V1,
        'FLOW_SAVE_BACKEND_NOT_WIRED',
      );
    }

    if (!input || typeof input !== 'object' || Array.isArray(input) || !Array.isArray(input.scenes)) {
      return fail(
        'M7_FLOW_INTERNAL_ERROR',
        COMMAND_IDS.PROJECT_FLOW_SAVE_V1,
        'FLOW_SAVE_SCENES_REQUIRED',
      );
    }

    let response;
    try {
      response = await invokeTransferAndFlowCommandBridge(
        electronAPI,
        COMMAND_IDS.PROJECT_FLOW_SAVE_V1,
        { scenes: input.scenes },
      );
    } catch (error) {
      return fail(
        'M7_FLOW_INTERNAL_ERROR',
        COMMAND_IDS.PROJECT_FLOW_SAVE_V1,
        'FLOW_SAVE_IPC_FAILED',
        { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
      );
    }
    const bridged = unwrapBridgeResponseValue(response);

    if (bridged && (bridged.ok === true || bridged.ok === 1)) {
      return ok({
        saved: true,
        savedCount: Number.isInteger(bridged.savedCount) ? bridged.savedCount : input.scenes.length,
        receipt: bridged.receipt && typeof bridged.receipt === 'object' && !Array.isArray(bridged.receipt)
          ? bridged.receipt
          : null,
        scenes: Array.isArray(bridged.scenes) ? bridged.scenes : [],
      });
    }

    if (bridged && bridged.ok === 0 && bridged.error && typeof bridged.error === 'object') {
      const error = bridged.error;
      return fail(
        typeof error.code === 'string' ? error.code : 'M7_FLOW_INTERNAL_ERROR',
        typeof error.op === 'string' ? error.op : FLOW_SAVE_V1_OP,
        typeof error.reason === 'string' ? error.reason : 'FLOW_SAVE_FAILED',
        error.details && typeof error.details === 'object' && !Array.isArray(error.details) ? error.details : undefined,
      );
    }

    return fail(
      'M7_FLOW_INTERNAL_ERROR',
      COMMAND_IDS.PROJECT_FLOW_SAVE_V1,
      'FLOW_SAVE_INVALID_RESPONSE',
    );
  });
}
