'use strict';

const MINIMUM_INTERCHANGE_SCHEMA_VERSION = 'yalken.minimum-interchange-ownership.v1';
const MINIMUM_INTERCHANGE_FORMAT_IDS = Object.freeze(['TXT', 'MARKDOWN', 'PROJECT_ARCHIVE', 'DOCX']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const MINIMUM_INTERCHANGE_OWNERSHIP_V1 = deepFreeze({
  schemaVersion: MINIMUM_INTERCHANGE_SCHEMA_VERSION,
  localOnly: true,
  networkRequired: false,
  primaryFormatId: 'DOCX',
  formats: [
    {
      formatId: 'TXT',
      ownership: 'SECONDARY_PLAIN_TEXT_INTERCHANGE',
      canonicalSourceRequired: true,
      atomicExportRequired: true,
      importMutation: 'CREATE_NEW_PROJECT_ONLY',
      commands: [
        { commandId: 'cmd.project.importTxtV1', role: 'IMPORT_ENTRY', bridgeRequired: false },
        { commandId: 'cmd.project.txt.previewLocalFile', role: 'IMPORT_PREVIEW' },
        { commandId: 'cmd.project.txt.importSafeCreate', role: 'IMPORT_CREATE' },
        { commandId: 'cmd.project.exportCurrentSceneTxtV1', role: 'EXPORT_CURRENT_SCENE' },
        { commandId: 'cmd.project.exportSelectedScenesTxtV1', role: 'EXPORT_SELECTED_SCENES' },
        { commandId: 'cmd.project.exportAllScenesTxtV1', role: 'EXPORT_PROJECT_TEXT' },
      ],
      directChannels: [],
    },
    {
      formatId: 'MARKDOWN',
      ownership: 'SECONDARY_STRUCTURED_TEXT_INTERCHANGE',
      canonicalSourceRequired: true,
      atomicExportRequired: true,
      importMutation: 'CREATE_NEW_PROJECT_ONLY',
      commands: [
        { commandId: 'cmd.project.importMarkdownV1', role: 'IMPORT_ENTRY' },
        { commandId: 'cmd.project.markdown.previewLocalFile', role: 'IMPORT_PREVIEW' },
        { commandId: 'cmd.project.markdown.acceptLocalPreview', role: 'IMPORT_CREATE' },
        { commandId: 'cmd.project.exportMarkdownV1', role: 'EXPORT_SCENE' },
        { commandId: 'cmd.project.markdown.exportLocalFile', role: 'EXPORT_LOCAL_FILE' },
      ],
      directChannels: [
        { channelId: 'm:cmd:project:import:markdownV1:v1', capabilityClass: 'project.mutation' },
        { channelId: 'm:cmd:project:export:markdownV1:v1', capabilityClass: 'fs.write' },
      ],
    },
    {
      formatId: 'PROJECT_ARCHIVE',
      ownership: 'WHOLE_PROJECT_PORTABILITY',
      canonicalSourceRequired: true,
      atomicExportRequired: true,
      importMutation: 'CREATE_NEW_PROJECT_ONLY',
      roundTripScope: 'WHOLE_PROJECT',
      commands: [
        { commandId: 'cmd.project.exportFullArchiveV1', role: 'EXPORT_PROJECT_ARCHIVE' },
        { commandId: 'cmd.project.importFullArchiveV1', role: 'IMPORT_PROJECT_ARCHIVE' },
      ],
      directChannels: [],
    },
    {
      formatId: 'DOCX',
      ownership: 'PRIMARY_WRITER_INTERCHANGE',
      docxFirst: true,
      canonicalSourceRequired: true,
      atomicExportRequired: true,
      importMutation: 'CREATE_NEW_PROJECT_ONLY',
      commands: [
        { commandId: 'cmd.project.export.docxMin', role: 'PRIMARY_EXPORT' },
        { commandId: 'cmd.project.importDocxV1', role: 'IMPORT_ENTRY', bridgeRequired: false },
        { commandId: 'cmd.project.docx.previewContent', role: 'IMPORT_CONTENT_PREVIEW' },
        { commandId: 'cmd.project.docx.previewImportPlan', role: 'IMPORT_PLAN_PREVIEW' },
        { commandId: 'cmd.project.docx.previewLocalFile', role: 'IMPORT_LOCAL_PREVIEW' },
        { commandId: 'cmd.project.docx.importSafeCreate', role: 'IMPORT_CREATE' },
      ],
      directChannels: [
        { channelId: 'u:cmd:project:export:docxMin:v1', capabilityClass: 'fs.write' },
      ],
    },
  ],
});

function invalid(code, details = {}) {
  return { ok: false, code, details };
}

function validateMinimumInterchangeOwnership(ownership = MINIMUM_INTERCHANGE_OWNERSHIP_V1, runtime = {}) {
  if (!ownership || typeof ownership !== 'object' || Array.isArray(ownership)) {
    return invalid('E_MINIMUM_INTERCHANGE_OWNERSHIP_INVALID');
  }
  if (ownership.schemaVersion !== MINIMUM_INTERCHANGE_SCHEMA_VERSION) {
    return invalid('E_MINIMUM_INTERCHANGE_SCHEMA_INVALID');
  }
  if (ownership.localOnly !== true || ownership.networkRequired !== false) {
    return invalid('E_MINIMUM_INTERCHANGE_LOCALITY_INVALID');
  }
  if (!Array.isArray(ownership.formats)) {
    return invalid('E_MINIMUM_INTERCHANGE_FORMATS_INVALID');
  }

  const actualFormatIds = ownership.formats.map((format) => format?.formatId);
  if (
    actualFormatIds.length !== MINIMUM_INTERCHANGE_FORMAT_IDS.length
    || MINIMUM_INTERCHANGE_FORMAT_IDS.some((formatId) => !actualFormatIds.includes(formatId))
    || new Set(actualFormatIds).size !== actualFormatIds.length
  ) {
    return invalid('E_MINIMUM_INTERCHANGE_FORMAT_DENOMINATOR_INVALID', { actualFormatIds });
  }

  const primaryRows = ownership.formats.filter((format) => format?.ownership === 'PRIMARY_WRITER_INTERCHANGE');
  const primary = primaryRows[0];
  if (
    ownership.primaryFormatId !== 'DOCX'
    || primaryRows.length !== 1
    || primary?.formatId !== 'DOCX'
    || primary?.docxFirst !== true
  ) {
    return invalid('E_MINIMUM_INTERCHANGE_DOCX_FIRST_INVALID');
  }
  if (!primary.commands?.some((command) => (
    command.commandId === 'cmd.project.export.docxMin' && command.role === 'PRIMARY_EXPORT'
  ))) {
    return invalid('E_MINIMUM_INTERCHANGE_DOCX_PRIMARY_EXPORT_MISSING');
  }

  const bridgeCommandIds = runtime.bridgeCommandIds instanceof Set
    ? runtime.bridgeCommandIds
    : new Set(Array.isArray(runtime.bridgeCommandIds) ? runtime.bridgeCommandIds : []);
  const menuCommandHandlers = runtime.menuCommandHandlers && typeof runtime.menuCommandHandlers === 'object'
    ? runtime.menuCommandHandlers
    : {};
  const ipcCapabilityClasses = runtime.ipcCapabilityClasses && typeof runtime.ipcCapabilityClasses === 'object'
    ? runtime.ipcCapabilityClasses
    : {};
  const commandOwners = new Map();
  const channelOwners = new Map();

  for (const format of ownership.formats) {
    if (
      !format
      || format.canonicalSourceRequired !== true
      || format.atomicExportRequired !== true
      || format.importMutation !== 'CREATE_NEW_PROJECT_ONLY'
    ) {
      return invalid('E_MINIMUM_INTERCHANGE_FORMAT_POLICY_INVALID', { formatId: format?.formatId || '' });
    }
    if (format.formatId === 'PROJECT_ARCHIVE' && format.roundTripScope !== 'WHOLE_PROJECT') {
      return invalid('E_MINIMUM_INTERCHANGE_ARCHIVE_SCOPE_INVALID');
    }
    if (!Array.isArray(format.commands) || format.commands.length === 0) {
      return invalid('E_MINIMUM_INTERCHANGE_COMMANDS_MISSING', { formatId: format.formatId });
    }

    for (const command of format.commands) {
      const commandId = typeof command?.commandId === 'string' ? command.commandId : '';
      const role = typeof command?.role === 'string' ? command.role : '';
      if (!commandId || !role) {
        return invalid('E_MINIMUM_INTERCHANGE_COMMAND_INVALID', { formatId: format.formatId });
      }
      if (commandOwners.has(commandId)) {
        return invalid('E_MINIMUM_INTERCHANGE_COMMAND_OWNER_DUPLICATE', {
          commandId,
          owners: [commandOwners.get(commandId), format.formatId],
        });
      }
      commandOwners.set(commandId, format.formatId);
      if (command.bridgeRequired !== false && !bridgeCommandIds.has(commandId)) {
        return invalid('E_MINIMUM_INTERCHANGE_BRIDGE_BINDING_MISSING', { commandId });
      }
      if (typeof menuCommandHandlers[commandId] !== 'function') {
        return invalid('E_MINIMUM_INTERCHANGE_HANDLER_BINDING_MISSING', { commandId });
      }
    }

    const directChannels = Array.isArray(format.directChannels) ? format.directChannels : [];
    for (const channel of directChannels) {
      const channelId = typeof channel?.channelId === 'string' ? channel.channelId : '';
      const capabilityClass = typeof channel?.capabilityClass === 'string' ? channel.capabilityClass : '';
      if (!channelId || !capabilityClass) {
        return invalid('E_MINIMUM_INTERCHANGE_CHANNEL_INVALID', { formatId: format.formatId });
      }
      if (channelOwners.has(channelId)) {
        return invalid('E_MINIMUM_INTERCHANGE_CHANNEL_OWNER_DUPLICATE', { channelId });
      }
      channelOwners.set(channelId, format.formatId);
      if (ipcCapabilityClasses[channelId] !== capabilityClass) {
        return invalid('E_MINIMUM_INTERCHANGE_CHANNEL_CAPABILITY_MISMATCH', {
          channelId,
          expected: capabilityClass,
          actual: ipcCapabilityClasses[channelId] || '',
        });
      }
    }
  }

  return {
    ok: true,
    schemaVersion: MINIMUM_INTERCHANGE_SCHEMA_VERSION,
    primaryFormatId: 'DOCX',
    formatCount: ownership.formats.length,
    commandCount: commandOwners.size,
    directChannelCount: channelOwners.size,
    localOnly: true,
    networkRequired: false,
  };
}

function bindMinimumInterchangeRuntime(runtime = {}) {
  const verdict = validateMinimumInterchangeOwnership(MINIMUM_INTERCHANGE_OWNERSHIP_V1, runtime);
  if (!verdict.ok) {
    const error = new Error(verdict.code);
    error.code = verdict.code;
    error.details = verdict.details;
    throw error;
  }
  return Object.freeze({ ...verdict });
}

module.exports = Object.freeze({
  MINIMUM_INTERCHANGE_SCHEMA_VERSION,
  MINIMUM_INTERCHANGE_FORMAT_IDS,
  MINIMUM_INTERCHANGE_OWNERSHIP_V1,
  validateMinimumInterchangeOwnership,
  bindMinimumInterchangeRuntime,
});
