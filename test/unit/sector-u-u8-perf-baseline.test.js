const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();
const FULL_MODE = process.env.SECTOR_U_FULL_PERF === '1';

function readJson(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function median(values) {
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

async function loadCommandModules() {
  const registryPath = pathToFileURL(path.join(ROOT, 'src/renderer/commands/registry.mjs')).href;
  const runnerPath = pathToFileURL(path.join(ROOT, 'src/renderer/commands/runCommand.mjs')).href;
  const projectPath = pathToFileURL(path.join(ROOT, 'src/renderer/commands/projectCommands.mjs')).href;

  const registryModule = await import(registryPath);
  const runnerModule = await import(runnerPath);
  const projectModule = await import(projectPath);
  return {
    createCommandRegistry: registryModule.createCommandRegistry,
    createCommandRunner: runnerModule.createCommandRunner,
    registerProjectCommands: projectModule.registerProjectCommands,
    COMMAND_IDS: projectModule.COMMAND_IDS,
  };
}

async function measurePerfBaseline(runs) {
  const {
    createCommandRegistry,
    createCommandRunner,
    registerProjectCommands,
    COMMAND_IDS,
  } = await loadCommandModules();

  const registry = createCommandRegistry();
  const runCommand = createCommandRunner(registry);
  registerProjectCommands(registry, {
    electronAPI: {
      openFile: () => {},
      saveFile: () => {},
    },
  });

  const samples = [];
  for (let index = 0; index < runs; index += 1) {
    const startedAt = performance.now();
    const openResult = await runCommand(COMMAND_IDS.PROJECT_OPEN);
    const saveResult = await runCommand(COMMAND_IDS.PROJECT_SAVE);
    const exportResult = await runCommand(COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN);
    const finishedAt = performance.now();

    assert.equal(openResult.ok, true);
    assert.equal(saveResult.ok, true);
    assert.equal(exportResult.ok, false);
    assert.equal(exportResult.error.code, 'E_UNWIRED_EXPORT_BACKEND');

    samples.push(finishedAt - startedAt);
  }

  return {
    medianMs: median(samples),
    minMs: Math.min(...samples),
    maxMs: Math.max(...samples),
    sampleCount: samples.length,
  };
}

test('u8 perf baseline: command-path proxy metric stays within deterministic threshold', { skip: !FULL_MODE }, async () => {
  const expected = readJson('test/fixtures/sector-u/u8/perf-expected.json');
  assert.equal(expected.schemaVersion, 'u8-perf-baseline.v1');
  assert.equal(expected.scenarioId, 'U8-S01');
  assert.equal(expected.metric, 'time-to-command-path-ready-ms');
  assert.equal(Number.isInteger(expected.runs), true);
  assert.equal(expected.runs > 0, true);

  const measured = await measurePerfBaseline(expected.runs);
  assert.equal(measured.sampleCount, expected.runs);
  assert.equal(Number.isFinite(measured.medianMs), true);
  assert.equal(Number.isFinite(measured.minMs), true);
  assert.equal(Number.isFinite(measured.maxMs), true);
  assert.equal(measured.medianMs >= 0, true);
  assert.equal(measured.medianMs <= expected.maxMedianMs, true);
});
