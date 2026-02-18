const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = process.cwd();
const V2_EXAMPLE_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-config.v2.example.json');

const {
  evaluateMenuItemEnabled,
  loadAndValidateMenuConfig
} = require(path.join(REPO_ROOT, 'src', 'menu', 'menu-config-validator.js'));

function readV2Example() {
  return JSON.parse(fs.readFileSync(V2_EXAMPLE_PATH, 'utf8'));
}

function runWithTempV2(mutator) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-config-v2-contract-'));
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

test('menu-config v2 contract: example file validates and resolves as v2', () => {
  const state = loadAndValidateMenuConfig({ configPath: V2_EXAMPLE_PATH });
  assert.equal(state.ok, true, `expected ok state\nerrors:\n${JSON.stringify(state.errors, null, 2)}`);
  assert.equal(state.version, 'v2');
  assert.ok(Array.isArray(state.errors));
  assert.equal(state.errors.length, 0);
});

test('menu-config v2 contract: invalid stage value fails schema enum validation', () => {
  const state = runWithTempV2((config) => {
    config.menus[0].items[0].stage = ['X9'];
  });
  assert.equal(state.ok, false);
  assert.ok(state.errors.some((entry) => entry.code === 'E_MENU_SCHEMA_ENUM'));
  assert.ok(state.errors.some((entry) => String(entry.path || '').includes('stage')));
});

test('menu-config v2 contract: gating truth table returns deterministic enabled/disabled reasons', () => {
  const config = readV2Example();
  const fileSave = config.menus[0].items.find((item) => item.id === 'file-save');
  assert.ok(fileSave, 'expected file-save item in v2 example');

  assert.deepEqual(
    evaluateMenuItemEnabled(fileSave, {
      mode: 'offline',
      profile: 'minimal',
      stage: 'X1',
      hasDocument: false
    }),
    {
      enabled: false,
      visible: true,
      reason: 'E_MENU_GATE_ENABLED_WHEN_FALSE',
      reasonCode: 'ENABLEDWHEN_FALSE'
    }
  );

  assert.deepEqual(
    evaluateMenuItemEnabled(fileSave, {
      mode: 'offline',
      profile: 'minimal',
      stage: 'X1',
      hasDocument: true
    }),
    { enabled: true, visible: true, reason: '' }
  );

  assert.deepEqual(
    evaluateMenuItemEnabled(fileSave, {
      mode: 'web_subset',
      profile: 'minimal',
      stage: 'X1',
      hasDocument: true
    }),
    { enabled: false, visible: true, reason: 'E_MENU_GATE_MODE' }
  );
});
