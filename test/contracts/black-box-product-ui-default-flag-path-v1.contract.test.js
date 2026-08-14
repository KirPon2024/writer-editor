const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = process.cwd();
const COMMAND_ID = 'cmd.project.blackBox.exportManualCoreCapsuleKitV1';
const CAPABILITY_ID = 'cap.blackBox.manualCoreCapsule.export';
const FEATURE_FLAG_ENV = 'YALKEN_ENABLE_BLACK_BOX_MANUAL_CORE_CAPSULE_COMMAND_V1';
const FEATURE_FLAG_ID = 'yalken.blackBox.manualCoreCapsuleKit.v1';
const EXPORT_FORMAT_ID = 'black-box-manual-core';
const MENU_ITEM_ID = 'file-export-black-box-manual-core-capsule';
const MENU_LABEL_KEY = 'menu.file.exportBlackBoxManualCoreCapsule';
const MODEL_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'black-box-product-ui-default-flag-path-v1-model.mjs');

function readText(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function findMenuItemByCommand(config, commandId) {
  for (const menu of config.menus || []) {
    for (const item of menu.items || []) {
      if (item && (item.command === commandId || item.canonicalCmdId === commandId)) return { menu, item };
    }
  }
  return null;
}

async function loadModules() {
  const catalog = await import(pathToFileURL(path.join(REPO_ROOT, 'src', 'renderer', 'commands', 'command-catalog.v1.mjs')).href);
  const capability = await import(pathToFileURL(path.join(REPO_ROOT, 'src', 'renderer', 'commands', 'capabilityPolicy.mjs')).href);
  const localCapability = await import(pathToFileURL(path.join(REPO_ROOT, 'src', 'renderer', 'commands', 'localCapabilityProvider.mjs')).href);
  const product = require(path.join(REPO_ROOT, 'src', 'shared', 'productCommandRegistry.cjs'));
  return { catalog, capability, localCapability, product };
}

test('F3 Black Box UI default path: product command is existing catalog truth, not a new UI command meaning', async () => {
  const { catalog, product } = await loadModules();
  const record = product.getProductCommandRecord(COMMAND_ID);
  assert.equal(record.id, COMMAND_ID);
  assert.equal(record.capabilityId, CAPABILITY_ID);
  assert.equal(record.commandAuthority, 'CommandKernel');
  assert.equal(record.runtimeBacked, true);
  assert.deepEqual(record.surface, ['palette', 'product']);

  const catalogEntry = catalog.getCommandCatalogById(COMMAND_ID);
  assert.equal(catalogEntry.id, COMMAND_ID);
  assert.equal(catalogEntry.group, 'blackBox');
  assert.deepEqual(catalogEntry.surface, ['palette', 'product']);
});

test('F3 Black Box UI default path: command capability remains desktop-only and fail-closed outside node', async () => {
  const { capability, localCapability } = await loadModules();
  assert.equal(capability.CAPABILITY_BINDING[COMMAND_ID], CAPABILITY_ID);
  assert.equal(capability.CAPABILITY_MATRIX.node[CAPABILITY_ID], true);
  assert.equal(capability.CAPABILITY_MATRIX.web[CAPABILITY_ID], false);
  assert.equal(capability.CAPABILITY_MATRIX['mobile-wrapper'][CAPABILITY_ID], false);

  const nodeAllowed = capability.enforceCapabilityForCommand(
    COMMAND_ID,
    {},
    { defaultPlatformId: 'node', entitlementTier: 'free' },
  );
  assert.equal(nodeAllowed.ok, true);

  const webDenied = capability.enforceCapabilityForCommand(
    COMMAND_ID,
    {},
    { defaultPlatformId: 'web', entitlementTier: 'free' },
  );
  assert.equal(webDenied.ok, false);
  assert.equal(webDenied.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');

  const entitlement = localCapability.resolveCommandEntitlement(COMMAND_ID, { entitlementTier: 'free' });
  assert.equal(entitlement.visible, true);
  assert.equal(entitlement.available, true);
  assert.equal(entitlement.requiresNetwork, undefined);
});

test('F3 Black Box UI default path: File export menu exposes the existing command with document gating and locale text', () => {
  const menu = readJson('src/menu/menu-config.v2.json');
  const locale = readJson('src/menu/menu-locale.catalog.v1.json');
  const artifact = readJson('docs/OPS/ARTIFACTS/menu/menu.normalized.json');
  const lock = readJson('docs/OPS/LOCKS/MENU_ARTIFACT_LOCK.json');
  const snapshotRegistry = readJson('docs/OPS/STATUS/MENU_SNAPSHOT_REGISTRY.json');
  const found = findMenuItemByCommand(menu, COMMAND_ID);
  const artifactFound = findMenuItemByCommand(artifact, COMMAND_ID);

  assert.ok(found, 'Black Box command must be discoverable from the existing File export menu');
  assert.equal(found.menu.id, 'file');
  assert.equal(found.item.id, MENU_ITEM_ID);
  assert.equal(found.item.labelKey, MENU_LABEL_KEY);
  assert.deepEqual(found.item.mode, ['offline']);
  assert.deepEqual(found.item.profile, ['minimal', 'pro', 'guru']);
  assert.deepEqual(found.item.stage, ['X1', 'X2', 'X3', 'X4']);
  assert.deepEqual(found.item.enabledWhen, { op: 'flag', name: 'hasDocument' });

  assert.equal(typeof locale.entries[MENU_LABEL_KEY]?.base, 'string');
  assert.match(locale.entries[MENU_LABEL_KEY].en, /Black Box/u);
  assert.match(locale.entries[MENU_LABEL_KEY].ru, /Black Box|Капсул/u);

  assert.ok(artifactFound, 'Black Box command must be present in the runtime menu artifact');
  assert.equal(artifactFound.menu.id, 'file');
  assert.equal(artifactFound.item.id, MENU_ITEM_ID);
  assert.equal(artifactFound.item.labelKey, MENU_LABEL_KEY);
  assert.deepEqual(artifactFound.item.enabledWhenAst, { name: 'hasDocument', op: 'flag' });
  assert.equal(artifact.normalizedHashSha256, lock.normalizedHashSha256);
  const snapshot = snapshotRegistry.snapshots.find((entry) => entry && entry.id === artifact.snapshotId);
  assert.equal(snapshot?.normalizedHashSha256, artifact.normalizedHashSha256);

  const equivalence = JSON.parse(execFileSync(process.execPath, [
    path.join(REPO_ROOT, 'scripts', 'ops', 'menu-config-normalize.mjs'),
    '--runtime-equivalent-check',
    '--context',
    path.join(REPO_ROOT, 'test', 'fixtures', 'menu', 'context.default.json'),
    '--mode=promotion',
    '--json',
  ], { cwd: REPO_ROOT, encoding: 'utf8' }));
  assert.equal(equivalence.result, 'PASS');
  assert.equal(equivalence.mismatch, false);
});

test('F3 Black Box UI default path: export modal binds a default-off Black Box option to the existing command id', () => {
  const html = readText('src/renderer/index.html');
  assert.match(html, new RegExp(`data-export-surface-format="${EXPORT_FORMAT_ID}"`, 'u'));
  assert.match(html, new RegExp(`data-product-command-id="${COMMAND_ID.replaceAll('.', '\\.')}"`, 'u'));
  assert.match(html, /Black Box CORE Capsule/u);
  assert.match(html, /default-off protected capsule/u);
  assert.match(html, /safe target/u);
});

test('F3 Black Box UI default path: renderer routes menu and palette through the existing command bus bridge only', () => {
  const source = readText('src/renderer/editor.js');
  assert.match(source, new RegExp(`const BLACK_BOX_EXPORT_MANUAL_CORE_COMMAND_ID = '${COMMAND_ID.replaceAll('.', '\\.')}'`, 'u'));
  assert.match(source, /const BLACK_BOX_EXPORT_MANUAL_CORE_FORMAT = 'black-box-manual-core'/u);
  assert.match(source, /normalizedCommandId === BLACK_BOX_EXPORT_MANUAL_CORE_COMMAND_ID[\s\S]{0,180}openExportSurfaceModal\(normalizedCommandId\)/u);
  assert.match(source, /normalizedFormat === BLACK_BOX_EXPORT_MANUAL_CORE_FORMAT[\s\S]{0,240}runExportSurfaceBridgeCommand\(\s*BLACK_BOX_EXPORT_MANUAL_CORE_COMMAND_ID/u);
  assert.match(source, /Black Box CORE capsule export[\s\S]{0,220}Command Kernel/u);

  assert.doesNotMatch(source, new RegExp(`process\\.env[\\s\\S]{0,120}${FEATURE_FLAG_ENV}`, 'u'));
  assert.doesNotMatch(source, /window\.electronAPI\.[A-Za-z0-9_$]*(?:BlackBox|blackBox|Capsule|capsule)/u);
  assert.doesNotMatch(source, new RegExp(`${FEATURE_FLAG_ID.replaceAll('.', '\\.')}[\\s\\S]{0,180}=\\s*true`, 'u'));
});

test('F3 Black Box UI default path model/oracle: finite, hostile and semantic mutation catalog all close', () => {
  const output = execFileSync(process.execPath, [MODEL_PATH], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const marker = 'BLACK_BOX_PRODUCT_UI_DEFAULT_FLAG_PATH_MODEL:';
  const line = output.split(/\r?\n/u).find((entry) => entry.startsWith(marker));
  assert.ok(line, output);
  const report = JSON.parse(line.slice(marker.length));
  assert.equal(report.taskId, 'F3_BLACK_BOX_PRODUCT_UI_DEFAULT_FLAG_PATH_V1');
  assert.equal(report.finite.total, 20);
  assert.equal(report.finite.failed, 0);
  assert.equal(report.hostile.total, 16);
  assert.equal(report.hostile.failed, 0);
  assert.equal(report.mutations.total, 12);
  assert.equal(report.mutations.survivors, 0);
});
