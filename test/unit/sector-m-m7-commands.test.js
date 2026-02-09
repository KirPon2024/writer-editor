const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadCommandModules() {
  const root = process.cwd();
  const registryModule = await import(pathToFileURL(path.join(root, 'src', 'renderer', 'commands', 'registry.mjs')).href);
  const runnerModule = await import(pathToFileURL(path.join(root, 'src', 'renderer', 'commands', 'runCommand.mjs')).href);
  const projectModule = await import(pathToFileURL(path.join(root, 'src', 'renderer', 'commands', 'projectCommands.mjs')).href);
  return { ...registryModule, ...runnerModule, ...projectModule };
}

test('M7 commands wire flow open/save through command layer with deterministic payloads', async () => {
  const {
    createCommandRegistry,
    createCommandRunner,
    registerProjectCommands,
    COMMAND_IDS,
  } = await loadCommandModules();

  const registry = createCommandRegistry();
  registerProjectCommands(registry, {
    electronAPI: {
      openFlowModeV1: async () => ({
        ok: 1,
        scenes: [{ path: '/tmp/a.txt', title: 'One', kind: 'scene', content: 'Alpha' }],
      }),
      saveFlowModeV1: async (payload) => ({
        ok: 1,
        savedCount: Array.isArray(payload.scenes) ? payload.scenes.length : 0,
      }),
    },
  });
  const runCommand = createCommandRunner(registry);

  const opened = await runCommand(COMMAND_IDS.PROJECT_FLOW_OPEN_V1);
  assert.deepEqual(opened, {
    ok: true,
    value: {
      opened: true,
      scenes: [{ path: '/tmp/a.txt', title: 'One', kind: 'scene', content: 'Alpha' }],
    },
  });

  const saved = await runCommand(COMMAND_IDS.PROJECT_FLOW_SAVE_V1, {
    scenes: [{ path: '/tmp/a.txt', content: 'Alpha' }],
  });
  assert.deepEqual(saved, {
    ok: true,
    value: { saved: true, savedCount: 1 },
  });
});

test('M7 commands keep typed errors stable and do not expose stack', async () => {
  const {
    createCommandRegistry,
    createCommandRunner,
    registerProjectCommands,
    COMMAND_IDS,
  } = await loadCommandModules();

  const registry = createCommandRegistry();
  registerProjectCommands(registry, {
    electronAPI: {
      openFlowModeV1: async () => ({
        ok: 0,
        error: {
          code: 'M7_FLOW_IO_READ_FAIL',
          op: 'm:cmd:project:flow:open:v1',
          reason: 'flow_open_read_failed',
        },
      }),
      saveFlowModeV1: async () => {
        throw new Error('boom');
      },
    },
  });
  const runCommand = createCommandRunner(registry);

  const openFail = await runCommand(COMMAND_IDS.PROJECT_FLOW_OPEN_V1);
  assert.equal(openFail.ok, false);
  assert.equal(openFail.error.code, 'M7_FLOW_IO_READ_FAIL');
  assert.equal(openFail.error.reason, 'flow_open_read_failed');
  assert.equal(Object.prototype.hasOwnProperty.call(openFail.error, 'stack'), false);

  const saveFail = await runCommand(COMMAND_IDS.PROJECT_FLOW_SAVE_V1, {
    scenes: [{ path: '/tmp/a.txt', content: 'Alpha' }],
  });
  assert.equal(saveFail.ok, false);
  assert.equal(saveFail.error.code, 'M7_FLOW_INTERNAL_ERROR');
  assert.equal(saveFail.error.reason, 'FLOW_SAVE_IPC_FAILED');
  assert.equal(Object.prototype.hasOwnProperty.call(saveFail.error, 'stack'), false);
});
