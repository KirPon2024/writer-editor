export const COMMAND_IDS = {
  PROJECT_OPEN: 'cmd.project.open',
  PROJECT_SAVE: 'cmd.project.save',
  PROJECT_EXPORT_DOCX_MIN: 'cmd.project.export.docxMin',
};
const EXPORT_DOCX_MIN_OP = 'u:cmd:project:export:docxMin:v1';

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
}
