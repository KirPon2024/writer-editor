'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  MINIMUM_INTERCHANGE_OWNERSHIP_V1,
  bindMinimumInterchangeRuntime,
  validateMinimumInterchangeOwnership,
} = require('../../src/core/minimum-interchange-v1.cjs');

const ROOT = path.resolve(__dirname, '..', '..');

function cloneOwnership() {
  return JSON.parse(JSON.stringify(MINIMUM_INTERCHANGE_OWNERSHIP_V1));
}

function runtimeFor(ownership = MINIMUM_INTERCHANGE_OWNERSHIP_V1) {
  const bridgeCommandIds = new Set();
  const menuCommandHandlers = {};
  const ipcCapabilityClasses = {};
  for (const format of ownership.formats) {
    for (const command of format.commands) {
      if (command.bridgeRequired !== false) bridgeCommandIds.add(command.commandId);
      menuCommandHandlers[command.commandId] = () => ({ ok: true });
    }
    for (const channel of format.directChannels || []) {
      ipcCapabilityClasses[channel.channelId] = channel.capabilityClass;
    }
  }
  return { bridgeCommandIds, menuCommandHandlers, ipcCapabilityClasses };
}

test('WP305 minimum interchange declares exact local formats and DOCX-first ownership', () => {
  const verdict = validateMinimumInterchangeOwnership(
    MINIMUM_INTERCHANGE_OWNERSHIP_V1,
    runtimeFor(),
  );

  assert.deepEqual(verdict, {
    ok: true,
    schemaVersion: 'yalken.minimum-interchange-ownership.v1',
    primaryFormatId: 'DOCX',
    formatCount: 4,
    commandCount: 19,
    directChannelCount: 3,
    localOnly: true,
    networkRequired: false,
  });
  assert.equal(Object.isFrozen(MINIMUM_INTERCHANGE_OWNERSHIP_V1), true);
  assert.equal(Object.isFrozen(MINIMUM_INTERCHANGE_OWNERSHIP_V1.formats[0].commands), true);
});

test('WP305 runtime startup binds every interchange command, handler, and direct capability', () => {
  const binding = bindMinimumInterchangeRuntime(runtimeFor());
  assert.equal(binding.ok, true);
  assert.equal(binding.primaryFormatId, 'DOCX');
  assert.equal(Object.isFrozen(binding), true);
  assert.equal(runtimeFor().bridgeCommandIds.has('cmd.project.importTxtV1'), false);
  assert.equal(runtimeFor().bridgeCommandIds.has('cmd.project.importDocxV1'), false);

  const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  assert.match(main, /bindMinimumInterchangeRuntime\(\{[\s\S]*bridgeCommandIds: UI_COMMAND_BRIDGE_ALLOWED_COMMAND_IDS/u);
  assert.match(main, /menuCommandHandlers: MENU_COMMAND_HANDLERS/u);
  assert.match(main, /ipcCapabilityClasses: IPC_CHANNEL_CAPABILITY_CLASS/u);
  assert.match(main, /MINIMUM_INTERCHANGE_RUNTIME_BINDING/u);
});

test('WP305 mutants fail closed when DOCX-first identity or primary export drifts', () => {
  const missingPrimary = cloneOwnership();
  missingPrimary.primaryFormatId = 'MARKDOWN';
  assert.equal(
    validateMinimumInterchangeOwnership(missingPrimary, runtimeFor(missingPrimary)).code,
    'E_MINIMUM_INTERCHANGE_DOCX_FIRST_INVALID',
  );

  const wrongExport = cloneOwnership();
  wrongExport.formats.find((format) => format.formatId === 'DOCX').commands[0].commandId = 'cmd.project.export.pdf';
  assert.equal(
    validateMinimumInterchangeOwnership(wrongExport, runtimeFor(wrongExport)).code,
    'E_MINIMUM_INTERCHANGE_DOCX_PRIMARY_EXPORT_MISSING',
  );
});

test('WP305 mutants fail closed on duplicate command ownership and unsafe import policy', () => {
  const duplicateCommand = cloneOwnership();
  duplicateCommand.formats.find((format) => format.formatId === 'TXT').commands[0].commandId = 'cmd.project.importMarkdownV1';
  assert.equal(
    validateMinimumInterchangeOwnership(duplicateCommand, runtimeFor(duplicateCommand)).code,
    'E_MINIMUM_INTERCHANGE_COMMAND_OWNER_DUPLICATE',
  );

  const inPlaceImport = cloneOwnership();
  inPlaceImport.formats.find((format) => format.formatId === 'MARKDOWN').importMutation = 'MUTATE_CURRENT_PROJECT';
  assert.equal(
    validateMinimumInterchangeOwnership(inPlaceImport, runtimeFor(inPlaceImport)).code,
    'E_MINIMUM_INTERCHANGE_FORMAT_POLICY_INVALID',
  );
});

test('WP305 mutants fail closed on missing command and channel bindings', () => {
  const missingBridge = runtimeFor();
  missingBridge.bridgeCommandIds.delete('cmd.project.exportFullArchiveV1');
  assert.equal(
    validateMinimumInterchangeOwnership(MINIMUM_INTERCHANGE_OWNERSHIP_V1, missingBridge).code,
    'E_MINIMUM_INTERCHANGE_BRIDGE_BINDING_MISSING',
  );

  const missingHandler = runtimeFor();
  delete missingHandler.menuCommandHandlers['cmd.project.txt.importSafeCreate'];
  assert.equal(
    validateMinimumInterchangeOwnership(MINIMUM_INTERCHANGE_OWNERSHIP_V1, missingHandler).code,
    'E_MINIMUM_INTERCHANGE_HANDLER_BINDING_MISSING',
  );

  const wrongCapability = runtimeFor();
  wrongCapability.ipcCapabilityClasses['u:cmd:project:export:docxMin:v1'] = 'project.query';
  assert.equal(
    validateMinimumInterchangeOwnership(MINIMUM_INTERCHANGE_OWNERSHIP_V1, wrongCapability).code,
    'E_MINIMUM_INTERCHANGE_CHANNEL_CAPABILITY_MISMATCH',
  );
});
