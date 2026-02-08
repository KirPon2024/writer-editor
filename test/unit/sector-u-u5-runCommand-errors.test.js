const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();
const registryModuleUrl = pathToFileURL(path.join(ROOT, 'src', 'renderer', 'commands', 'registry.mjs')).href;
const runCommandModuleUrl = pathToFileURL(path.join(ROOT, 'src', 'renderer', 'commands', 'runCommand.mjs')).href;

async function loadModules() {
  const registry = await import(registryModuleUrl);
  const runner = await import(runCommandModuleUrl);
  return {
    createCommandRegistry: registry.createCommandRegistry,
    createCommandRunner: runner.createCommandRunner,
  };
}

test('u5 runCommand: unknown command returns typed deterministic shape', async () => {
  const { createCommandRegistry, createCommandRunner } = await loadModules();
  const registry = createCommandRegistry();
  const runCommand = createCommandRunner(registry);

  const result = await runCommand('cmd.missing');
  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 'E_COMMAND_NOT_FOUND',
      op: 'cmd.missing',
      reason: 'COMMAND_NOT_REGISTERED',
    },
  });
});

test('u5 runCommand: thrown error is normalized to typed shape', async () => {
  const { createCommandRegistry, createCommandRunner } = await loadModules();
  const registry = createCommandRegistry();
  registry.registerCommand('cmd.throw', async () => {
    throw new Error('SIMULATED_FAIL');
  });
  const runCommand = createCommandRunner(registry);

  const result = await runCommand('cmd.throw');
  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 'E_COMMAND_FAILED',
      op: 'cmd.throw',
      reason: 'SIMULATED_FAIL',
    },
  });
});

test('u5 runCommand: typed backend-style throw preserves code/op/reason', async () => {
  const { createCommandRegistry, createCommandRunner } = await loadModules();
  const registry = createCommandRegistry();
  registry.registerCommand('cmd.typed', async () => {
    throw { code: 'E_IO', op: 'io.write', reason: 'WRITE_FAILED' };
  });
  const runCommand = createCommandRunner(registry);

  const result = await runCommand('cmd.typed');
  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 'E_IO',
      op: 'io.write',
      reason: 'WRITE_FAILED',
    },
  });
});
