const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = process.cwd();
const MENU_CONFIG_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-config.v1.json');
const STATE_SCRIPT_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-config-state.mjs');

function runMenuConfigState(extraArgs = []) {
  return spawnSync(process.execPath, [STATE_SCRIPT_PATH, '--json', ...extraArgs], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1'
    }
  });
}

function readBaselineConfig() {
  return JSON.parse(fs.readFileSync(MENU_CONFIG_PATH, 'utf8'));
}

function runWithTempConfig(mutator) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-config-contract-'));
  const configPath = path.join(tmpDir, 'menu-config.v1.json');
  try {
    const config = readBaselineConfig();
    mutator(config);
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    return runMenuConfigState(['--config-path', configPath]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function parsePayload(run) {
  return JSON.parse(String(run.stdout || '{}'));
}

test('menu config contract: valid baseline config passes with zero exit', () => {
  const run = runMenuConfigState();
  assert.equal(run.status, 0, `expected exit=0\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`);

  const payload = parsePayload(run);
  assert.equal(payload.ok, true);
  assert.equal(payload.MENU_CONFIG_SCHEMA_VALID_OK, 1);
  assert.equal(payload.failReason, '');
  assert.ok(Array.isArray(payload.errors));
  assert.equal(payload.errors.length, 0);
});

test('menu config contract: unknown field fails with non-zero exit', () => {
  const run = runWithTempConfig((config) => {
    config.menus[0].items[0].unknownField = true;
  });
  assert.notEqual(run.status, 0, `expected non-zero exit\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`);

  const payload = parsePayload(run);
  assert.equal(payload.ok, false);
  assert.equal(payload.MENU_CONFIG_SCHEMA_VALID_OK, 0);
  assert.notEqual(String(payload.failReason || '').trim(), '');
  assert.ok(Array.isArray(payload.errors));
  assert.ok(payload.errors.some((entry) => entry.code === 'E_MENU_SCHEMA_ADDITIONAL'));
});

test('menu config contract: non-string actionId fails with non-zero exit', () => {
  const run = runWithTempConfig((config) => {
    config.menus[0].items[0].actionId = 42;
  });
  assert.notEqual(run.status, 0, `expected non-zero exit\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`);

  const payload = parsePayload(run);
  assert.equal(payload.ok, false);
  assert.equal(payload.MENU_CONFIG_SCHEMA_VALID_OK, 0);
  assert.notEqual(String(payload.failReason || '').trim(), '');
  assert.ok(Array.isArray(payload.errors));
  assert.ok(payload.errors.some((entry) => entry.code === 'E_MENU_SCHEMA_TYPE'));
});

test('menu config contract: code-like actionId payload fails with non-zero exit', () => {
  const run = runWithTempConfig((config) => {
    config.menus[0].items[0].actionId = 'process.exit(1)';
  });
  assert.notEqual(run.status, 0, `expected non-zero exit\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`);

  const payload = parsePayload(run);
  assert.equal(payload.ok, false);
  assert.equal(payload.MENU_CONFIG_SCHEMA_VALID_OK, 0);
  assert.notEqual(String(payload.failReason || '').trim(), '');
  assert.ok(Array.isArray(payload.errors));
  assert.ok(payload.errors.some((entry) => entry.code === 'E_MENU_SCHEMA_PATTERN'));
});
