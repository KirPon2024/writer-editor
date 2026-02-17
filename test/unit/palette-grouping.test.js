const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModules() {
  const root = process.cwd();
  const registry = await import(pathToFileURL(path.join(root, 'src', 'renderer', 'commands', 'registry.mjs')).href);
  const project = await import(pathToFileURL(path.join(root, 'src', 'renderer', 'commands', 'projectCommands.mjs')).href);
  const palette = await import(pathToFileURL(path.join(root, 'src', 'renderer', 'commands', 'palette-groups.v1.mjs')).href);
  return { ...registry, ...project, ...palette };
}

test('palette grouping: listBySurface/listByGroup are deterministic for project command registry', async () => {
  const {
    createCommandRegistry,
    registerProjectCommands,
    COMMAND_IDS,
    listBySurface,
    listByGroup,
  } = await loadModules();

  const registry = createCommandRegistry();
  registerProjectCommands(registry, { electronAPI: {} });

  const paletteCommands = listBySurface(registry, 'palette');
  assert.equal(Array.isArray(paletteCommands), true);
  assert.equal(paletteCommands.length, Object.keys(COMMAND_IDS).length);
  for (const commandId of Object.values(COMMAND_IDS)) {
    assert.equal(paletteCommands.some((entry) => entry.id === commandId), true);
  }

  const groupedA = listByGroup(registry, 'palette');
  const groupedB = listByGroup(registry, 'palette');
  assert.deepEqual(groupedA, groupedB);
  assert.equal(groupedA.length > 0, true);
  for (const groupEntry of groupedA) {
    assert.equal(typeof groupEntry.group, 'string');
    assert.equal(Array.isArray(groupEntry.commands), true);
    assert.equal(groupEntry.commands.length > 0, true);
  }
});

test('legacy action bridge: resolves to cmd.* and never exposes handler execution path', async () => {
  const {
    createLegacyActionBridge,
    COMMAND_IDS,
  } = await loadModules();

  const calls = [];
  const bridge = createLegacyActionBridge(async (commandId, payload) => {
    calls.push({ commandId, payload });
    return { ok: true, value: { routed: true } };
  });

  const openResult = await bridge('open');
  assert.equal(openResult.handled, true);
  assert.equal(openResult.commandId, COMMAND_IDS.PROJECT_OPEN);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].commandId, COMMAND_IDS.PROJECT_OPEN);

  const flowSaveResult = await bridge('save', { context: { flowModeActive: true } });
  assert.equal(flowSaveResult.handled, true);
  assert.equal(flowSaveResult.commandId, COMMAND_IDS.PROJECT_FLOW_SAVE_V1);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].commandId, COMMAND_IDS.PROJECT_FLOW_SAVE_V1);

  const noopResult = await bridge('unknown-action');
  assert.deepEqual(noopResult, { handled: false, commandId: null, result: null });
  assert.equal(calls.length, 2);
});
