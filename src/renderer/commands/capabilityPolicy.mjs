export const CAPABILITY_BINDING = Object.freeze({
  'project.create': 'cap.core.project.create',
  'project.applyTextEdit': 'cap.core.project.applyTextEdit',
  'cmd.project.open': 'cap.project.open',
  'cmd.project.save': 'cap.project.save',
  'cmd.project.export.docxMin': 'cap.project.export.docxMin',
  'cmd.project.importMarkdownV1': 'cap.project.import.markdownV1',
  'cmd.project.exportMarkdownV1': 'cap.project.export.markdownV1',
  'cmd.project.flowOpenV1': 'cap.project.flow.openV1',
  'cmd.project.flowSaveV1': 'cap.project.flow.saveV1',
});

export const CAPABILITY_MATRIX = Object.freeze({
  node: Object.freeze({
    'cap.core.project.create': true,
    'cap.core.project.applyTextEdit': true,
    'cap.project.open': true,
    'cap.project.save': true,
    'cap.project.export.docxMin': true,
    'cap.project.import.markdownV1': true,
    'cap.project.export.markdownV1': true,
    'cap.project.flow.openV1': true,
    'cap.project.flow.saveV1': true,
  }),
  web: Object.freeze({
    'cap.core.project.create': true,
    'cap.core.project.applyTextEdit': true,
    'cap.project.open': false,
    'cap.project.save': false,
    'cap.project.export.docxMin': false,
    'cap.project.import.markdownV1': false,
    'cap.project.export.markdownV1': false,
    'cap.project.flow.openV1': false,
    'cap.project.flow.saveV1': false,
  }),
  'mobile-wrapper': Object.freeze({
    'cap.core.project.create': true,
    'cap.core.project.applyTextEdit': true,
    'cap.project.open': false,
    'cap.project.save': false,
    'cap.project.export.docxMin': false,
    'cap.project.import.markdownV1': false,
    'cap.project.export.markdownV1': false,
    'cap.project.flow.openV1': false,
    'cap.project.flow.saveV1': false,
  }),
});

function makeCapabilityError(code, op, reason, details) {
  const error = { code, op, reason };
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    error.details = details;
  }
  return error;
}

function normalizePlatformId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isDomainCommandId(commandId) {
  return commandId.startsWith('project.') || commandId.startsWith('cmd.project.');
}

function resolvePlatformId(input, options) {
  const fromInput = normalizePlatformId(input && input.platformId);
  if (fromInput) return fromInput;

  const fromOption = normalizePlatformId(options && options.platformId);
  if (fromOption) return fromOption;

  const defaultPlatform = normalizePlatformId(options && options.defaultPlatformId);
  if (defaultPlatform) return defaultPlatform;

  const fromEnv = normalizePlatformId(process && process.env ? process.env.CAPABILITY_PLATFORM_ID : '');
  if (fromEnv) return fromEnv;

  return 'node';
}

export function enforceCapabilityForCommand(commandId, input = {}, options = {}) {
  if (typeof commandId !== 'string' || commandId.length === 0) {
    return {
      ok: false,
      error: makeCapabilityError('E_CAPABILITY_ENFORCEMENT_MISSING', 'unknown', 'COMMAND_ID_INVALID'),
    };
  }

  const capabilityId = CAPABILITY_BINDING[commandId];
  if (!capabilityId) {
    if (isDomainCommandId(commandId)) {
      return {
        ok: false,
        error: makeCapabilityError(
          'E_CAPABILITY_ENFORCEMENT_MISSING',
          commandId,
          'CAPABILITY_ENFORCEMENT_MISSING',
          { commandId },
        ),
      };
    }
    return { ok: true };
  }

  const platformId = resolvePlatformId(input, options);
  if (!platformId) {
    return {
      ok: false,
      error: makeCapabilityError(
        'E_PLATFORM_ID_REQUIRED',
        commandId,
        'PLATFORM_ID_REQUIRED',
        { commandId, capabilityId },
      ),
    };
  }

  const platformCapabilities = CAPABILITY_MATRIX[platformId];
  if (!platformCapabilities || typeof platformCapabilities !== 'object') {
    return {
      ok: false,
      error: makeCapabilityError(
        'E_UNSUPPORTED_PLATFORM',
        commandId,
        'UNSUPPORTED_PLATFORM',
        { platformId, capabilityId, commandId },
      ),
    };
  }

  if (!(capabilityId in platformCapabilities)) {
    return {
      ok: false,
      error: makeCapabilityError(
        'E_CAPABILITY_MISSING',
        commandId,
        'CAPABILITY_MISSING',
        { platformId, capabilityId, commandId },
      ),
    };
  }

  if (platformCapabilities[capabilityId] !== true) {
    return {
      ok: false,
      error: makeCapabilityError(
        'E_CAPABILITY_DISABLED_FOR_COMMAND',
        commandId,
        'CAPABILITY_DISABLED_FOR_COMMAND',
        { platformId, capabilityId, commandId },
      ),
    };
  }

  return { ok: true };
}
