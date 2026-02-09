const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadCommandModules() {
  const root = process.cwd();
  const registryModule = await import(pathToFileURL(path.join(root, 'src', 'renderer', 'commands', 'registry.mjs')).href);
  const runnerModule = await import(pathToFileURL(path.join(root, 'src', 'renderer', 'commands', 'runCommand.mjs')).href);
  const projectModule = await import(pathToFileURL(path.join(root, 'src', 'renderer', 'commands', 'projectCommands.mjs')).href);
  return { ...registryModule, ...runnerModule, ...projectModule };
}

test('M5 command path passes sourcePath/outPath metadata through command layer', async () => {
  const {
    createCommandRegistry,
    createCommandRunner,
    registerProjectCommands,
    COMMAND_IDS,
  } = await loadCommandModules();

  const registry = createCommandRegistry();
  registerProjectCommands(registry, {
    electronAPI: {
      importMarkdownV1: async (payload) => {
        assert.equal(typeof payload.sourcePath, 'string');
        assert.equal(payload.sourcePath.endsWith('existing.md'), true);
        return {
          ok: 1,
          scene: { kind: 'scene.v1', blocks: [], nodeCount: 0, lossReport: { count: 0, items: [] } },
          lossReport: { count: 0, items: [] },
        };
      },
      exportMarkdownV1: async (payload) => {
        assert.equal(typeof payload.outPath, 'string');
        assert.equal(payload.outPath.endsWith('.md'), true);
        return {
          ok: 1,
          markdown: '# out\n',
          outPath: payload.outPath,
          bytesWritten: 6,
          snapshotCreated: true,
          snapshotPath: payload.outPath + '.bak',
          lossReport: { count: 0, items: [] },
        };
      },
    },
  });

  const runCommand = createCommandRunner(registry);
  const imported = await runCommand(COMMAND_IDS.PROJECT_IMPORT_MARKDOWN_V1, {
    sourcePath: path.join(process.cwd(), 'test', 'fixtures', 'sector-m', 'm5', 'existing.md'),
  });
  assert.equal(imported.ok, true);

  const exported = await runCommand(COMMAND_IDS.PROJECT_EXPORT_MARKDOWN_V1, {
    scene: { kind: 'scene.v1', blocks: [] },
    outPath: path.join(process.cwd(), 'test', 'fixtures', 'sector-m', 'm5', 'existing.md.out.md'),
    snapshotLimit: 2,
  });

  assert.equal(exported.ok, true);
  assert.equal(exported.value.outPath.endsWith('.md'), true);
  assert.equal(exported.value.snapshotCreated, true);
  assert.equal(exported.value.bytesWritten, 6);
});

test('M5 typed IO errors remain stable through command layer', async () => {
  const {
    createCommandRegistry,
    createCommandRunner,
    registerProjectCommands,
    COMMAND_IDS,
  } = await loadCommandModules();

  const registry = createCommandRegistry();
  registerProjectCommands(registry, {
    electronAPI: {
      importMarkdownV1: async () => ({
        ok: 0,
        error: {
          code: 'E_IO_INPUT_TOO_LARGE',
          op: 'm:cmd:project:import:markdownV1:v1',
          reason: 'input_too_large',
        },
      }),
    },
  });

  const runCommand = createCommandRunner(registry);
  const result = await runCommand(COMMAND_IDS.PROJECT_IMPORT_MARKDOWN_V1, {
    sourcePath: path.join(process.cwd(), 'test', 'fixtures', 'sector-m', 'm5', 'big.md'),
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_IO_INPUT_TOO_LARGE');
  assert.equal(result.error.reason, 'input_too_large');
  assert.equal(Object.prototype.hasOwnProperty.call(result.error, 'stack'), false);
});

test('M5 main command handlers reference reliability primitives (static guard)', () => {
  const mainPath = path.join(process.cwd(), 'src', 'main.js');
  const mainText = fs.readFileSync(mainPath, 'utf8');
  assert.match(mainText, /writeMarkdownWithRecovery/);
  assert.match(mainText, /readMarkdownWithLimits/);
  assert.match(mainText, /code\.startsWith\('E_IO_'/);
});
