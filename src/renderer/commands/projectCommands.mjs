export const COMMAND_IDS = {
  PROJECT_OPEN: 'cmd.project.open',
  PROJECT_SAVE: 'cmd.project.save',
  PROJECT_EXPORT_DOCX_MIN: 'cmd.project.export.docxMin',
  PROJECT_IMPORT_MARKDOWN_V1: 'cmd.project.importMarkdownV1',
  PROJECT_EXPORT_MARKDOWN_V1: 'cmd.project.exportMarkdownV1',
  PROJECT_FLOW_OPEN_V1: 'cmd.project.flowOpenV1',
  PROJECT_FLOW_SAVE_V1: 'cmd.project.flowSaveV1',
};
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

export function registerProjectCommands(registry, options = {}) {
  const electronAPI = options.electronAPI || null;

  registry.registerCommand(COMMAND_IDS.PROJECT_OPEN, async () => {
    if (!electronAPI || typeof electronAPI.openFile !== 'function') {
      return fail('E_COMMAND_FAILED', COMMAND_IDS.PROJECT_OPEN, 'ELECTRON_API_UNAVAILABLE');
    }
    electronAPI.openFile();
    return ok({ opened: true });
  });

  registry.registerCommand(COMMAND_IDS.PROJECT_SAVE, async () => {
    if (!electronAPI || typeof electronAPI.saveFile !== 'function') {
      return fail('E_COMMAND_FAILED', COMMAND_IDS.PROJECT_SAVE, 'ELECTRON_API_UNAVAILABLE');
    }
    electronAPI.saveFile();
    return ok({ saved: true });
  });

  registry.registerCommand(COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN, async (input = {}) => {
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

  registry.registerCommand(COMMAND_IDS.PROJECT_IMPORT_MARKDOWN_V1, async (input = {}) => {
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

  registry.registerCommand(COMMAND_IDS.PROJECT_EXPORT_MARKDOWN_V1, async (input = {}) => {
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

  registry.registerCommand(COMMAND_IDS.PROJECT_FLOW_OPEN_V1, async () => {
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

  registry.registerCommand(COMMAND_IDS.PROJECT_FLOW_SAVE_V1, async (input = {}) => {
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
