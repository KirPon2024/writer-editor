const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();
const registryModuleUrl = pathToFileURL(path.join(ROOT, 'src', 'renderer', 'commands', 'registry.mjs')).href;
const runCommandModuleUrl = pathToFileURL(path.join(ROOT, 'src', 'renderer', 'commands', 'runCommand.mjs')).href;
const projectCommandsModuleUrl = pathToFileURL(path.join(ROOT, 'src', 'renderer', 'commands', 'projectCommands.mjs')).href;

async function loadModules() {
  const registry = await import(registryModuleUrl);
  const runner = await import(runCommandModuleUrl);
  const project = await import(projectCommandsModuleUrl);
  return {
    createCommandRegistry: registry.createCommandRegistry,
    createCommandRunner: runner.createCommandRunner,
    COMMAND_IDS: project.COMMAND_IDS,
    registerProjectCommands: project.registerProjectCommands,
  };
}

test('u1 command layer: unknown command id returns deterministic E_COMMAND_NOT_FOUND', async () => {
  const { createCommandRegistry, createCommandRunner } = await loadModules();
  const registry = createCommandRegistry();
  const runCommand = createCommandRunner(registry);

  const result = await runCommand('cmd.unknown');
  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 'E_COMMAND_NOT_FOUND',
      op: 'cmd.unknown',
      reason: 'COMMAND_NOT_REGISTERED',
    },
  });
});

test('u1 command layer: handler throw is converted to deterministic E_COMMAND_FAILED', async () => {
  const { createCommandRegistry, createCommandRunner } = await loadModules();
  const registry = createCommandRegistry();
  registry.registerCommand('cmd.test.throw', async () => {
    throw new Error('SIMULATED_FAIL');
  });
  const runCommand = createCommandRunner(registry);

  const result = await runCommand('cmd.test.throw');
  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 'E_COMMAND_FAILED',
      op: 'cmd.test.throw',
      reason: 'SIMULATED_FAIL',
    },
  });
});

test('u1 command layer: open/save/export command ids exist and export uses deterministic stub', async () => {
  const { createCommandRegistry, createCommandRunner, COMMAND_IDS, registerProjectCommands } = await loadModules();
  let openCalls = 0;
  let saveCalls = 0;
  const electronAPI = {
    openFile: () => { openCalls += 1; },
    saveFile: () => { saveCalls += 1; },
  };

  const registry = createCommandRegistry();
  registerProjectCommands(registry, { electronAPI });
  const runCommand = createCommandRunner(registry);

  assert.equal(registry.hasCommand(COMMAND_IDS.PROJECT_OPEN), true);
  assert.equal(registry.hasCommand(COMMAND_IDS.PROJECT_SAVE), true);
  assert.equal(registry.hasCommand(COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN), true);

  const openResult = await runCommand(COMMAND_IDS.PROJECT_OPEN);
  assert.equal(openResult.ok, true);
  assert.equal(openCalls, 1);

  const saveResult = await runCommand(COMMAND_IDS.PROJECT_SAVE);
  assert.equal(saveResult.ok, true);
  assert.equal(saveCalls, 1);

  const exportResult = await runCommand(COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN);
  assert.deepEqual(exportResult, {
    ok: false,
    error: {
      code: 'E_UNWIRED_EXPORT_BACKEND',
      op: 'cmd.project.export.docxMin',
      reason: 'EXPORT_DOCXMIN_BACKEND_NOT_WIRED',
    },
  });
});
