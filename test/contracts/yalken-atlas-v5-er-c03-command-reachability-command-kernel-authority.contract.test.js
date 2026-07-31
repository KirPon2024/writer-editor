const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = process.cwd();

function readText(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

async function importModule(relativePath) {
  return import(pathToFileURL(path.join(REPO_ROOT, relativePath)).href);
}

function productRuntimeCommandIds(runtime) {
  return Object.values(runtime.CORE_COMMAND_IDS)
    .filter((commandId) => /^(atlas|idea|meaning|manualMap)\./.test(commandId))
    .sort();
}

test('ER C03: shared product command registry covers Core Atlas, Manual Map, Idea and Meaning commands', async () => {
  const product = require(path.join(REPO_ROOT, 'src', 'shared', 'productCommandRegistry.cjs'));
  const runtime = await importModule('src/core/runtime.mjs');
  const typedCoreRegistrySource = readText('src/core/registry.ts');
  const runtimeProductIds = productRuntimeCommandIds(runtime);

  assert.equal(product.PRODUCT_COMMAND_SCHEMA_VERSION, 'product-command-registry.v1');
  assert.deepEqual([...product.PRODUCT_COMMAND_ID_LIST].sort(), runtimeProductIds);
  assert.equal(product.PRODUCT_COMMAND_ID_LIST.length, product.PRODUCT_COMMAND_RECORDS.length);

  for (const record of product.PRODUCT_COMMAND_RECORDS) {
    assert.match(typedCoreRegistrySource, new RegExp(`'${record.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
    assert.equal(record.commandAuthority, 'CommandKernel');
    assert.equal(record.runtimeBacked, true);
    assert.equal(product.getProductCommandRecord(record.id).id, record.id);
    assert.equal(product.PRODUCT_COMMAND_CAPABILITY_BINDING[record.id], record.capabilityId);
    assert.equal(record.surface.includes('palette'), true, `palette reachability missing for ${record.id}`);
  }

  assert.equal(product.PRODUCT_COMMAND_DOMAIN_STATUS.atlas.status, 'runtime-backed');
  assert.equal(product.PRODUCT_COMMAND_DOMAIN_STATUS.manualMap.status, 'runtime-backed');
  assert.equal(product.PRODUCT_COMMAND_DOMAIN_STATUS.idea.status, 'runtime-backed');
  assert.equal(product.PRODUCT_COMMAND_DOMAIN_STATUS.meaning.status, 'runtime-backed');
  assert.equal(product.PRODUCT_COMMAND_DOMAIN_STATUS.plot.status, 'degraded-no-runtime-mutating-command');
  assert.deepEqual(product.PRODUCT_COMMAND_DOMAIN_STATUS.plot.commandIds, []);
});

test('ER C03: catalog, capability binding and local availability project from the shared registry', async () => {
  const product = require(path.join(REPO_ROOT, 'src', 'shared', 'productCommandRegistry.cjs'));
  const catalog = await importModule('src/renderer/commands/command-catalog.v1.mjs');
  const capabilityPolicy = await importModule('src/renderer/commands/capabilityPolicy.mjs');
  const localCapability = await importModule('src/renderer/commands/localCapabilityProvider.mjs');

  const catalogIds = new Set(catalog.listCommandCatalog().map((entry) => entry.id));
  const localContract = localCapability.getLocalCapabilityContract();
  const localAlwaysAvailable = new Set(localContract.freeAlwaysAvailableCommandIds);

  for (const commandId of product.PRODUCT_COMMAND_ID_LIST) {
    assert.equal(catalogIds.has(commandId), true, `product command missing from catalog: ${commandId}`);
    assert.equal(capabilityPolicy.CAPABILITY_BINDING[commandId], product.PRODUCT_COMMAND_CAPABILITY_BINDING[commandId]);
    assert.equal(localAlwaysAvailable.has(commandId), true, `product command missing from local availability: ${commandId}`);
    const entitlement = capabilityPolicy.enforceCapabilityForCommand(commandId, { platformId: 'node' });
    assert.equal(entitlement.ok, true, `node product command should be capability-admitted: ${commandId}`);
  }
});

test('ER C03: renderer command registry reaches product commands through bridge-only Command Kernel path', async () => {
  const product = require(path.join(REPO_ROOT, 'src', 'shared', 'productCommandRegistry.cjs'));
  const { createCommandRegistry } = await importModule('src/renderer/commands/registry.mjs');
  const { createCommandRunner } = await importModule('src/renderer/commands/runCommand.mjs');
  const { registerProjectCommands } = await importModule('src/renderer/commands/projectCommands.mjs');
  const bridgedRequests = [];
  const electronAPI = {
    async invokeUiCommandBridge(request) {
      bridgedRequests.push(request);
      if (request.commandId === 'atlas.observation.suppress') {
        return {
          ok: false,
          value: {
            ok: false,
            error: {
              code: 'E_PRODUCT_COMMAND_BACKEND_DEGRADED',
              op: request.commandId,
              reason: 'PRODUCT_COMMAND_REQUIRES_PROJECT_KERNEL_ADAPTER',
              details: { commandAuthority: 'CommandKernel', mutationApplied: false },
            },
          },
        };
      }
      return {
        ok: true,
        value: {
          ok: true,
          commandAuthority: 'CommandKernel',
          commandId: request.commandId,
        },
      };
    },
  };

  const registry = createCommandRegistry();
  registerProjectCommands(registry, { electronAPI });
  const runCommand = createCommandRunner(registry, { capability: { platformId: 'node' } });

  for (const commandId of product.PRODUCT_COMMAND_ID_LIST) {
    assert.equal(registry.hasCommand(commandId), true, `product command not registered: ${commandId}`);
    const meta = registry.getMeta(commandId);
    assert.equal(meta.surface.includes('palette'), true, `palette surface missing for ${commandId}`);
  }

  const okResult = await runCommand('manualMap.create', { projectId: 'project-a' });
  assert.equal(okResult.ok, true);
  assert.equal(okResult.value.commandAuthority, 'CommandKernel');
  assert.equal(bridgedRequests.at(-1).route, 'command.bus');
  assert.equal(bridgedRequests.at(-1).commandId, 'manualMap.create');

  const degraded = await runCommand('atlas.observation.suppress', { projectId: 'project-a' });
  assert.equal(degraded.ok, false);
  assert.equal(degraded.error.code, 'E_PRODUCT_COMMAND_BACKEND_DEGRADED');
  assert.equal(degraded.error.reason, 'PRODUCT_COMMAND_REQUIRES_PROJECT_KERNEL_ADAPTER');

  const unknown = await runCommand('atlas.unknown.write', {});
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error.code, 'E_COMMAND_NOT_FOUND');
});

test('ER C03: main bridge allowlist and routing use product registry and fail closed without menu namespace bypass', () => {
  const mainSource = readText('src/main.js');

  assert.match(mainSource, /PRODUCT_COMMAND_ID_LIST/);
  assert.match(mainSource, /new Set\(\[\s*\.\.\.PRODUCT_COMMAND_ID_LIST/);
  assert.match(mainSource, /PRODUCT_COMMAND_ID_SET\.has\(commandId\)/);
  assert.match(mainSource, /dispatchProductCommandBridge\(commandId, payload\)/);
  assert.match(mainSource, /PRODUCT_COMMAND_REQUIRES_PROJECT_KERNEL_ADAPTER/);
  assert.match(mainSource, /mutationApplied:\s*false/);
  assert.match(mainSource, /storageWritten:\s*false/);
  assert.doesNotMatch(mainSource, /resolveMenuCommandId\(commandId[\s\S]{0,80}atlas\./);
});

test('ER C03: Atlas relation review actions dispatch existing product commands instead of intent-only logging', async () => {
  const product = require(path.join(REPO_ROOT, 'src', 'shared', 'productCommandRegistry.cjs'));
  const relationActions = await importModule('src/renderer/commands/atlasRelationReviewActions.mjs');
  const editorSource = readText('src/renderer/editor.js');
  const listenerStart = editorSource.indexOf("atlasRelationDossierHost?.addEventListener('click'");
  const listenerEnd = editorSource.indexOf("atlasHeatmapHost?.addEventListener('click'", listenerStart);
  const listenerSource = editorSource.slice(listenerStart, listenerEnd);

  assert.equal(listenerStart >= 0, true, 'relation dossier listener missing');
  assert.equal(listenerEnd > listenerStart, true, 'relation dossier listener end missing');
  assert.doesNotMatch(listenerSource, /Atlas review action intent:/);
  assert.match(listenerSource, /await dispatchUiCommand\(commandId,\s*\{/);
  assert.match(listenerSource, /source:\s*'atlasRelationDossier'/);
  assert.match(listenerSource, /commandAuthority:\s*'CommandKernel'/);
  assert.doesNotMatch(listenerSource, /reduceCoreState|writeFile|localStorage\.setItem/);

  for (const commandId of relationActions.ATLAS_RELATION_REVIEW_ACTION_COMMAND_IDS) {
    assert.equal(product.isProductCommandId(commandId), true, `relation action is not a registered product command: ${commandId}`);
  }
});
