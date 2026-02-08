const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();
const FIXTURES_ROOT = path.join(ROOT, 'test', 'fixtures', 'sector-u', 'u3');
const projectCommandsModuleUrl = pathToFileURL(path.join(ROOT, 'src', 'renderer', 'commands', 'projectCommands.mjs')).href;
const registryModuleUrl = pathToFileURL(path.join(ROOT, 'src', 'renderer', 'commands', 'registry.mjs')).href;
const runnerModuleUrl = pathToFileURL(path.join(ROOT, 'src', 'renderer', 'commands', 'runCommand.mjs')).href;

function readFixtureJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_ROOT, fileName), 'utf8'));
}

async function loadModules() {
  const registry = await import(registryModuleUrl);
  const runner = await import(runnerModuleUrl);
  const project = await import(projectCommandsModuleUrl);
  return {
    createCommandRegistry: registry.createCommandRegistry,
    createCommandRunner: runner.createCommandRunner,
    COMMAND_IDS: project.COMMAND_IDS,
    registerProjectCommands: project.registerProjectCommands,
  };
}

test('u3 export wiring: fallback stub is preserved when backend hook is missing', async () => {
  const { createCommandRegistry, createCommandRunner, COMMAND_IDS, registerProjectCommands } = await loadModules();
  const registry = createCommandRegistry();
  registerProjectCommands(registry, { electronAPI: {} });
  const runCommand = createCommandRunner(registry);

  const result = await runCommand(COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN);
  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 'E_UNWIRED_EXPORT_BACKEND',
      op: 'cmd.project.export.docxMin',
      reason: 'EXPORT_DOCXMIN_BACKEND_NOT_WIRED',
    },
  });
});

test('u3 export wiring: command uses electronAPI.exportDocxMin and returns deterministic success', async () => {
  const { createCommandRegistry, createCommandRunner, COMMAND_IDS, registerProjectCommands } = await loadModules();
  const fixtureRequest = readFixtureJson('export-request.json');
  let capturedPayload = null;
  const electronAPI = {
    exportDocxMin: async (payload) => {
      capturedPayload = payload;
      return { ok: 1, outPath: payload.outPath, bytesWritten: 123 };
    },
  };

  const registry = createCommandRegistry();
  registerProjectCommands(registry, { electronAPI });
  const runCommand = createCommandRunner(registry);

  const result = await runCommand(COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN, fixtureRequest);
  assert.deepEqual(capturedPayload, {
    requestId: 'u3-test-request',
    outPath: '/tmp/u3-test.docx',
    outDir: '',
    bufferSource: 'Line one\nLine two',
    options: {},
  });
  assert.deepEqual(result, {
    ok: true,
    value: {
      exported: true,
      outPath: '/tmp/u3-test.docx',
      bytesWritten: 123,
    },
  });
});

test('u3 export wiring: command maps typed backend error without random fields', async () => {
  const { createCommandRegistry, createCommandRunner, COMMAND_IDS, registerProjectCommands } = await loadModules();
  const fixtureError = readFixtureJson('export-error.json');
  const electronAPI = {
    exportDocxMin: async () => fixtureError,
  };

  const registry = createCommandRegistry();
  registerProjectCommands(registry, { electronAPI });
  const runCommand = createCommandRunner(registry);

  const result = await runCommand(COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN, { requestId: 'deterministic' });
  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 'E_EXPORT_WRITE_FAILED',
      op: 'u:cmd:project:export:docxMin:v1',
      reason: 'DOCX_WRITE_FAILED',
    },
  });
});
