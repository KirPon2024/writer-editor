import { COMMAND_CATALOG_V1, getCommandCatalogById } from './command-catalog.v1.mjs';

const COMMAND_KEY_TO_ID = Object.freeze(
  Object.fromEntries(COMMAND_CATALOG_V1.map((entry) => [entry.key, entry.id])),
);

export const COMMAND_IDS = Object.freeze({
  PROJECT_OPEN: COMMAND_KEY_TO_ID.PROJECT_OPEN,
  PROJECT_SAVE: COMMAND_KEY_TO_ID.PROJECT_SAVE,
  PROJECT_EXPORT_DOCX_MIN: COMMAND_KEY_TO_ID.PROJECT_EXPORT_DOCX_MIN,
  PROJECT_IMPORT_MARKDOWN_V1: COMMAND_KEY_TO_ID.PROJECT_IMPORT_MARKDOWN_V1,
  PROJECT_EXPORT_MARKDOWN_V1: COMMAND_KEY_TO_ID.PROJECT_EXPORT_MARKDOWN_V1,
  PROJECT_FLOW_OPEN_V1: COMMAND_KEY_TO_ID.PROJECT_FLOW_OPEN_V1,
  PROJECT_FLOW_SAVE_V1: COMMAND_KEY_TO_ID.PROJECT_FLOW_SAVE_V1,
});

export const EXTRA_COMMAND_IDS = Object.freeze({
  PROJECT_NEW: 'cmd.project.new',
  PROJECT_SAVE_AS: 'cmd.project.saveAs',
});

export const LEGACY_ACTION_TO_COMMAND = Object.freeze({
  new: EXTRA_COMMAND_IDS.PROJECT_NEW,
  open: COMMAND_IDS.PROJECT_OPEN,
  openDocument: COMMAND_IDS.PROJECT_OPEN,
  save: COMMAND_IDS.PROJECT_SAVE,
  saveDocument: COMMAND_IDS.PROJECT_SAVE,
  'save-as': EXTRA_COMMAND_IDS.PROJECT_SAVE_AS,
  'export-docx-min': COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN,
  exportDocxMin: COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN,
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

export function registerProjectCommands(registry, options = {}) {
  const electronAPI = options.electronAPI || null;

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.PROJECT_NEW,
      label: 'New Project',
      group: 'file',
      surface: ['toolbar', 'menu'],
      hotkey: '',
    },
    async () => {
      const hasFileOpen = electronAPI && typeof electronAPI.fileOpen === 'function';
      const hasNewFile = electronAPI && typeof electronAPI.newFile === 'function';
      if (!hasFileOpen && !hasNewFile) {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.PROJECT_NEW, 'ELECTRON_API_UNAVAILABLE');
      }

      let response;
      try {
        if (hasFileOpen) {
          response = await electronAPI.fileOpen({ intent: 'new' });
        } else {
          electronAPI.newFile();
          response = { ok: true };
        }
      } catch (error) {
        return fail(
          'E_COMMAND_FAILED',
          EXTRA_COMMAND_IDS.PROJECT_NEW,
          'FILE_NEW_IPC_FAILED',
          { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
        );
      }

      if (response && (response.ok === 1 || response.ok === true)) {
        return ok({ created: true });
      }
      return fail(
        'E_COMMAND_FAILED',
        EXTRA_COMMAND_IDS.PROJECT_NEW,
        response && typeof response.reason === 'string' ? response.reason : 'FILE_NEW_FAILED',
      );
    },
  );

  registerCatalogCommand(registry, COMMAND_IDS.PROJECT_OPEN, async () => {
    const hasFileOpen = electronAPI && typeof electronAPI.fileOpen === 'function';
    const hasOpenFile = electronAPI && typeof electronAPI.openFile === 'function';
    if (!hasFileOpen && !hasOpenFile) {
      return fail('E_COMMAND_FAILED', COMMAND_IDS.PROJECT_OPEN, 'ELECTRON_API_UNAVAILABLE');
    }

    let response;
    try {
      if (hasFileOpen) {
        response = await electronAPI.fileOpen({ intent: 'open' });
      } else {
        electronAPI.openFile();
        response = { ok: true };
      }
    } catch (error) {
      return fail(
        'E_COMMAND_FAILED',
        COMMAND_IDS.PROJECT_OPEN,
        'FILE_OPEN_IPC_FAILED',
        { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
      );
    }

    if (response && (response.ok === 1 || response.ok === true)) {
      return ok({ opened: true });
    }
    return fail(
      'E_COMMAND_FAILED',
      COMMAND_IDS.PROJECT_OPEN,
      response && typeof response.reason === 'string' ? response.reason : 'FILE_OPEN_FAILED',
    );
  });

  registerCatalogCommand(registry, COMMAND_IDS.PROJECT_SAVE, async () => {
    const hasFileSave = electronAPI && typeof electronAPI.fileSave === 'function';
    const hasSaveFile = electronAPI && typeof electronAPI.saveFile === 'function';
    if (!hasFileSave && !hasSaveFile) {
      return fail('E_COMMAND_FAILED', COMMAND_IDS.PROJECT_SAVE, 'ELECTRON_API_UNAVAILABLE');
    }

    let response;
    try {
      if (hasFileSave) {
        response = await electronAPI.fileSave({ intent: 'save' });
      } else {
        electronAPI.saveFile();
        response = { ok: true };
      }
    } catch (error) {
      return fail(
        'E_COMMAND_FAILED',
        COMMAND_IDS.PROJECT_SAVE,
        'FILE_SAVE_IPC_FAILED',
        { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
      );
    }

    if (response && (response.ok === 1 || response.ok === true)) {
      return ok({ saved: true });
    }
    return fail(
      'E_COMMAND_FAILED',
      COMMAND_IDS.PROJECT_SAVE,
      response && typeof response.reason === 'string' ? response.reason : 'FILE_SAVE_FAILED',
    );
  });

  registry.registerCommand(
    {
      id: EXTRA_COMMAND_IDS.PROJECT_SAVE_AS,
      label: 'Save Project As',
      group: 'file',
      surface: ['toolbar', 'menu'],
      hotkey: '',
    },
    async () => {
      const hasFileSaveAs = electronAPI && typeof electronAPI.fileSaveAs === 'function';
      const hasSaveAs = electronAPI && typeof electronAPI.saveAs === 'function';
      if (!hasFileSaveAs && !hasSaveAs) {
        return fail('E_COMMAND_FAILED', EXTRA_COMMAND_IDS.PROJECT_SAVE_AS, 'ELECTRON_API_UNAVAILABLE');
      }

      let response;
      try {
        if (hasFileSaveAs) {
          response = await electronAPI.fileSaveAs({ intent: 'saveAs' });
        } else {
          electronAPI.saveAs();
          response = { ok: true };
        }
      } catch (error) {
        return fail(
          'E_COMMAND_FAILED',
          EXTRA_COMMAND_IDS.PROJECT_SAVE_AS,
          'FILE_SAVE_AS_IPC_FAILED',
          { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
        );
      }

      if (response && (response.ok === 1 || response.ok === true)) {
        return ok({ savedAs: true });
      }
      return fail(
        'E_COMMAND_FAILED',
        EXTRA_COMMAND_IDS.PROJECT_SAVE_AS,
        response && typeof response.reason === 'string' ? response.reason : 'FILE_SAVE_AS_FAILED',
      );
    },
  );

  registerCatalogCommand(registry, COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN, async (input = {}) => {
    if (!electronAPI || typeof electronAPI.exportDocxMin !== 'function') {
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

    let response;
    try {
      response = await electronAPI.exportDocxMin(payload);
    } catch (error) {
      return fail(
        'E_COMMAND_FAILED',
        COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN,
        'EXPORT_DOCXMIN_IPC_FAILED',
        { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
      );
    }

    if (response && response.ok === 1) {
      return ok({
        exported: true,
        outPath: typeof response.outPath === 'string' ? response.outPath : '',
        bytesWritten: Number.isInteger(response.bytesWritten) ? response.bytesWritten : 0,
      });
    }

    if (response && response.ok === 0 && response.error && typeof response.error === 'object') {
      const error = response.error;
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

  registerCatalogCommand(registry, COMMAND_IDS.PROJECT_IMPORT_MARKDOWN_V1, async (input = {}) => {
    if (!electronAPI || typeof electronAPI.importMarkdownV1 !== 'function') {
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
      limits: input.limits && typeof input.limits === 'object' && !Array.isArray(input.limits)
        ? input.limits
        : {},
    };

    let response;
    try {
      response = await electronAPI.importMarkdownV1(payload);
    } catch (error) {
      return fail(
        'MDV1_INTERNAL_ERROR',
        COMMAND_IDS.PROJECT_IMPORT_MARKDOWN_V1,
        'IMPORT_MARKDOWN_IPC_FAILED',
        { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
      );
    }

    if (response && response.ok === 1 && response.scene && typeof response.scene === 'object') {
      return ok({
        imported: true,
        scene: response.scene,
        lossReport: response.lossReport && typeof response.lossReport === 'object'
          ? response.lossReport
          : { count: 0, items: [] },
      });
    }

    if (response && response.ok === 0 && response.error && typeof response.error === 'object') {
      const error = response.error;
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

  registerCatalogCommand(registry, COMMAND_IDS.PROJECT_EXPORT_MARKDOWN_V1, async (input = {}) => {
    if (!electronAPI || typeof electronAPI.exportMarkdownV1 !== 'function') {
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
      response = await electronAPI.exportMarkdownV1(payload);
    } catch (error) {
      return fail(
        'MDV1_INTERNAL_ERROR',
        COMMAND_IDS.PROJECT_EXPORT_MARKDOWN_V1,
        'EXPORT_MARKDOWN_IPC_FAILED',
        { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
      );
    }

    if (response && response.ok === 1 && typeof response.markdown === 'string') {
      const output = {
        exported: true,
        markdown: response.markdown,
        lossReport: response.lossReport && typeof response.lossReport === 'object'
          ? response.lossReport
          : { count: 0, items: [] },
      };

      if (typeof response.outPath === 'string' && response.outPath.length > 0) {
        output.outPath = response.outPath;
      }
      if (Number.isInteger(response.bytesWritten) && response.bytesWritten >= 0) {
        output.bytesWritten = response.bytesWritten;
      }
      if (typeof response.safetyMode === 'string' && response.safetyMode.length > 0) {
        output.safetyMode = response.safetyMode;
      }
      if (response.snapshotCreated === true) {
        output.snapshotCreated = true;
        if (typeof response.snapshotPath === 'string' && response.snapshotPath.length > 0) {
          output.snapshotPath = response.snapshotPath;
        }
      }

      return ok(output);
    }

    if (response && response.ok === 0 && response.error && typeof response.error === 'object') {
      const error = response.error;
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
    if (!electronAPI || typeof electronAPI.openFlowModeV1 !== 'function') {
      return fail(
        'M7_FLOW_INTERNAL_ERROR',
        COMMAND_IDS.PROJECT_FLOW_OPEN_V1,
        'FLOW_OPEN_BACKEND_NOT_WIRED',
      );
    }

    let response;
    try {
      response = await electronAPI.openFlowModeV1();
    } catch (error) {
      return fail(
        'M7_FLOW_INTERNAL_ERROR',
        COMMAND_IDS.PROJECT_FLOW_OPEN_V1,
        'FLOW_OPEN_IPC_FAILED',
        { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
      );
    }

    if (response && response.ok === 1 && Array.isArray(response.scenes)) {
      return ok({
        opened: true,
        scenes: response.scenes,
      });
    }

    if (response && response.ok === 0 && response.error && typeof response.error === 'object') {
      const error = response.error;
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
    if (!electronAPI || typeof electronAPI.saveFlowModeV1 !== 'function') {
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
      response = await electronAPI.saveFlowModeV1({ scenes: input.scenes });
    } catch (error) {
      return fail(
        'M7_FLOW_INTERNAL_ERROR',
        COMMAND_IDS.PROJECT_FLOW_SAVE_V1,
        'FLOW_SAVE_IPC_FAILED',
        { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
      );
    }

    if (response && response.ok === 1) {
      return ok({
        saved: true,
        savedCount: Number.isInteger(response.savedCount) ? response.savedCount : input.scenes.length,
      });
    }

    if (response && response.ok === 0 && response.error && typeof response.error === 'object') {
      const error = response.error;
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
