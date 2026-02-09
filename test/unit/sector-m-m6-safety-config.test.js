const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadIoModule() {
  const root = process.cwd();
  return import(pathToFileURL(path.join(root, 'src', 'io', 'markdown', 'index.mjs')).href);
}

async function loadCommandModules() {
  const root = process.cwd();
  const registryModule = await import(pathToFileURL(path.join(root, 'src', 'renderer', 'commands', 'registry.mjs')).href);
  const runnerModule = await import(pathToFileURL(path.join(root, 'src', 'renderer', 'commands', 'runCommand.mjs')).href);
  const projectModule = await import(pathToFileURL(path.join(root, 'src', 'renderer', 'commands', 'projectCommands.mjs')).href);
  return { ...registryModule, ...runnerModule, ...projectModule };
}

test('M6 safety mode defaults to strict and accepts compat', async () => {
  const io = await loadIoModule();
  assert.equal(io.normalizeSafetyMode(undefined), 'strict');
  assert.equal(io.normalizeSafetyMode('compat'), 'compat');
  assert.equal(io.normalizeSafetyMode('anything-else'), 'strict');
});

test('M6 atomic writer reports selected safety mode', async () => {
  const io = await loadIoModule();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sector-m-m6-safety-'));
  const target = path.join(dir, 'scene.md');
  fs.writeFileSync(target, 'before\n', 'utf8');

  const compat = await io.atomicWriteFile(target, 'after\n', { safetyMode: 'compat' });
  assert.equal(compat.ok, 1);
  assert.equal(compat.safetyMode, 'compat');

  const strict = await io.atomicWriteFile(target, 'after-2\n');
  assert.equal(strict.ok, 1);
  assert.equal(strict.safetyMode, 'strict');
});

test('M6 export command forwards safety mode through command layer', async () => {
  const {
    createCommandRegistry,
    createCommandRunner,
    registerProjectCommands,
    COMMAND_IDS,
  } = await loadCommandModules();

  let seenSafetyMode = '';
  const registry = createCommandRegistry();
  registerProjectCommands(registry, {
    electronAPI: {
      exportMarkdownV1: async (payload) => {
        seenSafetyMode = payload.safetyMode;
        return {
          ok: 1,
          markdown: '# ok\n',
          safetyMode: payload.safetyMode,
          lossReport: { count: 0, items: [] },
        };
      },
    },
  });

  const runCommand = createCommandRunner(registry);
  const result = await runCommand(COMMAND_IDS.PROJECT_EXPORT_MARKDOWN_V1, {
    scene: { kind: 'scene.v1', blocks: [] },
    safetyMode: 'compat',
  });

  assert.equal(result.ok, true);
  assert.equal(seenSafetyMode, 'compat');
  assert.equal(result.value.safetyMode, 'compat');
});
