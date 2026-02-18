const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = process.cwd();
const V1_CONFIG_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-config.v1.json');
const V1_SCHEMA_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-config.schema.v1.json');
const V2_EXAMPLE_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-config.v2.example.json');

const {
  evaluateMenuItemEnabled,
  loadAndValidateMenuConfig
} = require(path.join(REPO_ROOT, 'src', 'menu', 'menu-config-validator.js'));

function readV2Example() {
  return JSON.parse(fs.readFileSync(V2_EXAMPLE_PATH, 'utf8'));
}

function runWithTempV2(mutator) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-config-backcompat-contract-'));
  const configPath = path.join(tmpDir, 'menu-config.v2.json');
  try {
    const config = readV2Example();
    mutator(config);
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    return loadAndValidateMenuConfig({ configPath });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

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
  assert.deepEqual(firstAction.stage, ['X0', 'X1', 'X2', 'X3', 'X4']);
  assert.deepEqual(firstAction.enabledWhen, {
    op: 'all',
    args: [],
  });

  assert.deepEqual(
    evaluateMenuItemEnabled(firstAction, {
      mode: 'offline',
      profile: 'minimal',
      stage: 'X1'
    }),
    { enabled: true, visible: true, reason: '' }
  );
});

test('menu-config backcompat: should reject stage X5 in runtime menu config', () => {
  const state = runWithTempV2((config) => {
    config.menus[0].items[0].stage = ['X5'];
  });

  assert.equal(state.ok, false);
  assert.ok(state.errors.some((entry) => entry.code === 'E_MENU_SCHEMA_ENUM'));
  assert.ok(state.errors.some((entry) => String(entry.path || '').includes('stage')));
});
