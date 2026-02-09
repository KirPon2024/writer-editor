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

function read(filePath) {
  return fs.readFileSync(path.join(process.cwd(), filePath), 'utf8');
}

test('M6 IO typed errors keep recovery guidance in command response', async () => {
  const {
    createCommandRegistry,
    createCommandRunner,
    registerProjectCommands,
    COMMAND_IDS,
  } = await loadCommandModules();

  const registry = createCommandRegistry();
  registerProjectCommands(registry, {
    electronAPI: {
      exportMarkdownV1: async () => ({
        ok: 0,
        error: {
          code: 'E_IO_ATOMIC_WRITE_FAIL',
          op: 'm:cmd:project:export:markdownV1:v1',
          reason: 'atomic_write_failed',
          details: {
            userMessage: 'Не удалось безопасно записать Markdown.',
            recoveryActions: ['RETRY', 'SAVE_AS', 'OPEN_SNAPSHOT'],
          },
        },
      }),
    },
  });

  const runCommand = createCommandRunner(registry);
  const result = await runCommand(COMMAND_IDS.PROJECT_EXPORT_MARKDOWN_V1, {
    scene: { kind: 'scene.v1', blocks: [] },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_IO_ATOMIC_WRITE_FAIL');
  assert.equal(result.error.reason, 'atomic_write_failed');
  assert.equal(result.error.details.userMessage.includes('Markdown'), true);
  assert.deepEqual(result.error.details.recoveryActions, ['RETRY', 'SAVE_AS', 'OPEN_SNAPSHOT']);
  assert.equal(Object.prototype.hasOwnProperty.call(result.error, 'stack'), false);
});

test('M6 editor static guard keeps recovery UX mapping for IO errors', () => {
  const editorText = read('src/renderer/editor.js');
  assert.match(editorText, /details\.userMessage/);
  assert.match(editorText, /recoveryActions/);
  assert.match(editorText, /code\.startsWith\('E_IO_'\)\s*\?\s*'WARN'/);
});
