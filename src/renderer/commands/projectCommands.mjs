export const COMMAND_IDS = {
  PROJECT_OPEN: 'cmd.project.open',
  PROJECT_SAVE: 'cmd.project.save',
  PROJECT_EXPORT_DOCX_MIN: 'cmd.project.export.docxMin',
};

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

  registry.registerCommand(COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN, async () => {
    return fail(
      'E_UNWIRED_EXPORT_BACKEND',
      COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN,
      'EXPORT_DOCXMIN_BACKEND_NOT_WIRED',
    );
  });
}
