const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModules() {
  const root = process.cwd();
  const registry = await import(pathToFileURL(path.join(root, 'src', 'renderer', 'commands', 'registry.mjs')).href);
  const runner = await import(pathToFileURL(path.join(root, 'src', 'renderer', 'commands', 'runCommand.mjs')).href);
  const project = await import(pathToFileURL(path.join(root, 'src', 'renderer', 'commands', 'projectCommands.mjs')).href);
  return {
    createCommandRegistry: registry.createCommandRegistry,
    createCommandRunner: runner.createCommandRunner,
    COMMAND_IDS: project.COMMAND_IDS,
    registerProjectCommands: project.registerProjectCommands,
  };
}

test('capability enforcement returns deterministic typed unsupported errors and prevents silent fallback', async () => {
  const {
    createCommandRegistry,
    createCommandRunner,
    COMMAND_IDS,
    registerProjectCommands,
  } = await loadModules();

  let openCalls = 0;
  const electronAPI = {
    openFile: () => { openCalls += 1; },
  };

  const registry = createCommandRegistry();
  registerProjectCommands(registry, { electronAPI });
  const runCommand = createCommandRunner(registry, {
    capability: { defaultPlatformId: 'web' },
  });

  const a = await runCommand(COMMAND_IDS.PROJECT_OPEN);
  const b = await runCommand(COMMAND_IDS.PROJECT_OPEN);

  assert.deepEqual(a, b);
  assert.equal(a.ok, false);
  assert.equal(a.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(a.error.op, COMMAND_IDS.PROJECT_OPEN);
  assert.equal(a.error.reason, 'CAPABILITY_DISABLED_FOR_COMMAND');
  assert.deepEqual(a.error.details, {
    platformId: 'web',
    capabilityId: 'cap.project.open',
    commandId: COMMAND_IDS.PROJECT_OPEN,
  });
  assert.equal(openCalls, 0, 'silent fallback detected: handler must not run when capability is disabled');

  const mobile = await runCommand(COMMAND_IDS.PROJECT_OPEN, { platformId: 'mobile-wrapper' });
  assert.deepEqual(mobile, {
    ok: false,
    error: {
      code: 'E_CAPABILITY_DISABLED_FOR_COMMAND',
      op: COMMAND_IDS.PROJECT_OPEN,
      reason: 'CAPABILITY_DISABLED_FOR_COMMAND',
      details: {
        platformId: 'mobile-wrapper',
        capabilityId: 'cap.project.open',
        commandId: COMMAND_IDS.PROJECT_OPEN,
      },
    },
  });
});

test('capability enforcement returns deterministic unsupported-platform and missing-binding envelopes', async () => {
  const { createCommandRegistry, createCommandRunner, COMMAND_IDS, registerProjectCommands } = await loadModules();

  const registry = createCommandRegistry();
  registerProjectCommands(registry, { electronAPI: {} });
  const runCommand = createCommandRunner(registry, {
    capability: { defaultPlatformId: 'node' },
  });

  const unsupported = await runCommand(COMMAND_IDS.PROJECT_SAVE, { platformId: 'platform-x' });
  assert.deepEqual(unsupported, {
    ok: false,
    error: {
      code: 'E_UNSUPPORTED_PLATFORM',
      op: COMMAND_IDS.PROJECT_SAVE,
      reason: 'UNSUPPORTED_PLATFORM',
      details: {
        platformId: 'platform-x',
        capabilityId: 'cap.project.save',
        commandId: COMMAND_IDS.PROJECT_SAVE,
      },
    },
  });

  registry.registerCommand('cmd.project.customMutation', async () => ({ ok: true, value: { done: true } }));
  const missingBinding = await runCommand('cmd.project.customMutation');
  assert.deepEqual(missingBinding, {
    ok: false,
    error: {
      code: 'E_CAPABILITY_ENFORCEMENT_MISSING',
      op: 'cmd.project.customMutation',
      reason: 'CAPABILITY_ENFORCEMENT_MISSING',
      details: {
        commandId: 'cmd.project.customMutation',
      },
    },
  });
});
