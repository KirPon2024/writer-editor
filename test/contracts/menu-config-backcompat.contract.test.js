const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const REPO_ROOT = process.cwd();
const V1_CONFIG_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-config.v1.json');
const V1_SCHEMA_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-config.schema.v1.json');

const {
  evaluateMenuItemEnabled,
  loadAndValidateMenuConfig
} = require(path.join(REPO_ROOT, 'src', 'menu', 'menu-config-validator.js'));

test('menu-config backcompat: v1 config remains valid with default validator path', () => {
  const state = loadAndValidateMenuConfig({ configPath: V1_CONFIG_PATH });
  assert.equal(state.ok, true, `expected ok state\nerrors:\n${JSON.stringify(state.errors, null, 2)}`);
  assert.equal(state.version, 'v1');
});

test('menu-config backcompat: explicit v1 schema path remains supported', () => {
  const state = loadAndValidateMenuConfig({
    configPath: V1_CONFIG_PATH,
    schemaPath: V1_SCHEMA_PATH
  });
  assert.equal(state.ok, true, `expected ok state\nerrors:\n${JSON.stringify(state.errors, null, 2)}`);
  assert.equal(state.version, 'v1');
});

test('menu-config backcompat: v1 is normalized to v2-compatible gate defaults', () => {
  const state = loadAndValidateMenuConfig({ configPath: V1_CONFIG_PATH });
  assert.equal(state.ok, true);
  assert.ok(state.normalizedConfig);
  assert.equal(state.normalizedConfig.version, 'v2');

  const fileMenu = state.normalizedConfig.menus.find((menu) => menu.id === 'file');
  assert.ok(fileMenu);
  const firstAction = fileMenu.items.find((item) => item.actionId === 'newDocument');
  assert.ok(firstAction);

  assert.deepEqual(firstAction.mode, ['offline']);
  assert.deepEqual(firstAction.profile, ['minimal', 'pro', 'guru']);
  assert.deepEqual(firstAction.stage, ['X0', 'X1', 'X2', 'X3', 'X4', 'X5']);
  assert.equal(firstAction.enabledWhen, 'always');

  assert.deepEqual(
    evaluateMenuItemEnabled(firstAction, {
      mode: 'offline',
      profile: 'minimal',
      stage: 'X1'
    }),
    { enabled: true, reason: '' }
  );
});
