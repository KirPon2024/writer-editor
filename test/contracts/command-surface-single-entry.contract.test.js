const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let stateModulePromise = null;
let busModulePromise = null;

function loadStateModule() {
  if (!stateModulePromise) {
    stateModulePromise = import(pathToFileURL(
      path.join(process.cwd(), 'scripts/ops/command-surface-state.mjs'),
    ).href);
  }
  return stateModulePromise;
}

function loadBusModule() {
  if (!busModulePromise) {
    busModulePromise = import(pathToFileURL(
      path.join(process.cwd(), 'src/renderer/commands/commandBusGuard.mjs'),
    ).href);
  }
  return busModulePromise;
}

// scenario id: hotkey-bypass
// scenario id: palette-bypass
// scenario id: ipc-direct-bypass
// scenario id: context-button-bypass
// scenario id: plugin-overlay-bypass
const BYPASS_NEGATIVE_SCENARIOS = Object.freeze([
  { id: 'hotkey-bypass', route: 'hotkey.direct' },
  { id: 'palette-bypass', route: 'palette.direct' },
  { id: 'ipc-direct-bypass', route: 'ipc.renderer-main.direct' },
  { id: 'context-button-bypass', route: 'context.button.direct' },
  { id: 'plugin-overlay-bypass', route: 'plugin.overlay.exec' },
]);

test('command surface single-entry: positive baseline tokens are bound', async () => {
  const { evaluateCommandSurfaceState } = await loadStateModule();
  const state = evaluateCommandSurfaceState();

  assert.equal(state.ok, true, JSON.stringify(state, null, 2));
  assert.equal(state.COMMAND_SURFACE_SINGLE_ENTRY_OK, 1);
  assert.equal(state.COMMAND_SURFACE_BYPASS_NEGATIVE_TESTS_OK, 1);
  assert.equal(state.failSignal, '');
});

test('command surface single-entry: route command.bus runs command through bus', async () => {
  const { COMMAND_BUS_ROUTE, runCommandThroughBus } = await loadBusModule();
  const result = await runCommandThroughBus(
    async () => ({ ok: true, value: { executed: true } }),
    'cmd.project.open',
    {},
    { route: COMMAND_BUS_ROUTE },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { executed: true });
});

for (const scenario of BYPASS_NEGATIVE_SCENARIOS) {
  test(`command surface single-entry: ${scenario.id} fails with E_COMMAND_SURFACE_BYPASS`, async () => {
    const { runCommandThroughBus } = await loadBusModule();
    const result = await runCommandThroughBus(
      async () => ({ ok: true, value: { shouldNotRun: true } }),
      'cmd.project.open',
      {},
      { route: scenario.route },
    );

    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'E_COMMAND_SURFACE_BYPASS');
    assert.equal(result.error.details.failSignal, 'E_COMMAND_SURFACE_BYPASS');
    assert.equal(result.error.details.scenarioId, scenario.id);
  });
}

test('command surface single-entry: missing bypass scenario set returns E_COMMAND_SURFACE_NEGATIVE_MISSING', async () => {
  const { evaluateCommandSurfaceState } = await loadStateModule();
  const reducedTestText = `
    scenario id: hotkey-bypass
    scenario id: palette-bypass
    scenario id: ipc-direct-bypass
    scenario id: context-button-bypass
  `;
  const state = evaluateCommandSurfaceState({ testFileText: reducedTestText });
  assert.equal(state.ok, false);
  assert.equal(state.COMMAND_SURFACE_SINGLE_ENTRY_OK, 1);
  assert.equal(state.COMMAND_SURFACE_BYPASS_NEGATIVE_TESTS_OK, 0);
  assert.equal(state.failSignal, 'E_COMMAND_SURFACE_NEGATIVE_MISSING');
  assert.equal(state.missingScenarioIds.includes('plugin-overlay-bypass'), true);
});

test('command surface single-entry: deterministic output for repeated evaluations', async () => {
  const { evaluateCommandSurfaceState } = await loadStateModule();
  const runA = evaluateCommandSurfaceState();
  const runB = evaluateCommandSurfaceState();
  assert.deepEqual(runA, runB);
});

