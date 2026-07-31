const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModules() {
  const root = process.cwd();
  const catalog = await import(pathToFileURL(path.join(root, 'src', 'renderer', 'commands', 'command-catalog.v1.mjs')).href);
  const project = await import(pathToFileURL(path.join(root, 'src', 'renderer', 'commands', 'projectCommands.mjs')).href);
  const product = require(path.join(root, 'src', 'shared', 'productCommandRegistry.cjs'));
  return { catalog, project, product };
}

test('command catalog v1: entries are deterministic and namespace-bound', async () => {
  const { catalog, product } = await loadModules();
  const entries = catalog.listCommandCatalog();
  const productIds = new Set(product.PRODUCT_COMMAND_ID_LIST);

  assert.equal(Array.isArray(entries), true);
  assert.equal(entries.length > 0, true);

  const ids = new Set();
  const keys = new Set();
  for (const entry of entries) {
    assert.equal(typeof entry.key, 'string');
    assert.equal(typeof entry.id, 'string');
    assert.equal(
      entry.id.startsWith('cmd.') || productIds.has(entry.id),
      true,
      `invalid command id namespace: ${entry.id}`,
    );
    assert.equal(typeof entry.label, 'string');
    assert.equal(entry.label.length > 0, true);
    assert.equal(typeof entry.group, 'string');
    assert.equal(entry.group.length > 0, true);
    assert.equal(Array.isArray(entry.surface), true);
    assert.equal(entry.surface.length > 0, true);
    assert.equal(ids.has(entry.id), false, `duplicate command id: ${entry.id}`);
    assert.equal(keys.has(entry.key), false, `duplicate command key: ${entry.key}`);
    ids.add(entry.id);
    keys.add(entry.key);

    const lookup = catalog.getCommandCatalogById(entry.id);
    assert.equal(lookup && lookup.id, entry.id);
  }
});

test('command catalog v1: covers all runtime project command IDs', async () => {
  const { catalog, project } = await loadModules();
  const entries = catalog.listCommandCatalog();
  const catalogIds = new Set(entries.map((entry) => entry.id));
  const runtimeCommandIds = Object.values(project.COMMAND_IDS);

  for (const commandId of runtimeCommandIds) {
    assert.equal(catalogIds.has(commandId), true, `missing command in catalog: ${commandId}`);
  }
});

test('command catalog v1: covers all shared product command IDs', async () => {
  const { catalog, product } = await loadModules();
  const entries = catalog.listCommandCatalog();
  const catalogIds = new Set(entries.map((entry) => entry.id));

  for (const commandId of product.PRODUCT_COMMAND_ID_LIST) {
    assert.equal(catalogIds.has(commandId), true, `missing product command in catalog: ${commandId}`);
  }
  assert.equal(product.PRODUCT_COMMAND_DOMAIN_STATUS.plot.status, 'degraded-no-runtime-mutating-command');
  assert.deepEqual(product.PRODUCT_COMMAND_DOMAIN_STATUS.plot.commandIds, []);
});
