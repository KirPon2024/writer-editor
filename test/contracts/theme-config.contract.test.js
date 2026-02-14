const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = process.cwd();
const THEME_CONFIG_PATH = path.join(REPO_ROOT, 'src', 'renderer', 'theme', 'theme-config.v1.json');
const THEME_SCHEMA_PATH = path.join(REPO_ROOT, 'src', 'renderer', 'theme', 'theme-config.schema.v1.json');
const THEME_STATE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'ops', 'theme-config-state.mjs');

function runThemeConfigState(extraArgs = []) {
  return spawnSync(process.execPath, [THEME_STATE_SCRIPT, '--json', ...extraArgs], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });
}

function parsePayload(run) {
  return JSON.parse(String(run.stdout || '{}'));
}

function readBaselineConfig() {
  return JSON.parse(fs.readFileSync(THEME_CONFIG_PATH, 'utf8'));
}

function runWithTempConfig(mutator) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-config-contract-'));
  const configPath = path.join(tmpDir, 'theme-config.v1.json');
  try {
    const config = readBaselineConfig();
    mutator(config);
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    return runThemeConfigState(['--config-path', configPath]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function runWithInvalidSchemaContent() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-schema-contract-'));
  const schemaPath = path.join(tmpDir, 'theme-config.schema.v1.json');
  try {
    fs.writeFileSync(schemaPath, '{"type":"object"', 'utf8');
    return runThemeConfigState(['--schema-path', schemaPath]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('theme config contract: baseline config passes with zero exit', () => {
  const run = runThemeConfigState();
  assert.equal(run.status, 0, `expected exit=0\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`);

  const payload = parsePayload(run);
  assert.equal(payload.ok, true);
  assert.equal(payload.THEME_CONFIG_OK, 1);
  assert.equal(payload.failReason, '');
  assert.ok(Array.isArray(payload.errors));
  assert.equal(payload.errors.length, 0);
});

test('theme config contract: invalid schema json fails with non-zero exit', () => {
  const run = runWithInvalidSchemaContent();
  assert.notEqual(run.status, 0, `expected non-zero exit\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`);

  const payload = parsePayload(run);
  assert.equal(payload.ok, false);
  assert.equal(payload.THEME_CONFIG_OK, 0);
  assert.notEqual(String(payload.failReason || '').trim(), '');
  assert.ok(Array.isArray(payload.errors));
  assert.ok(payload.errors.some((entry) => entry.code === 'E_THEME_SCHEMA_PARSE'));
});

test('theme config contract: missing required section fails with non-zero exit', () => {
  const run = runWithTempConfig((config) => {
    delete config.typography;
  });
  assert.notEqual(run.status, 0, `expected non-zero exit\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`);

  const payload = parsePayload(run);
  assert.equal(payload.ok, false);
  assert.equal(payload.THEME_CONFIG_OK, 0);
  assert.notEqual(String(payload.failReason || '').trim(), '');
  assert.ok(Array.isArray(payload.errors));
  assert.ok(payload.errors.some((entry) => entry.code === 'E_THEME_SCHEMA_REQUIRED' && entry.path === '$.typography'));
});

test('theme config contract: out-of-range token value fails with non-zero exit', () => {
  const run = runWithTempConfig((config) => {
    config.animations.duration.fast = -1;
  });
  assert.notEqual(run.status, 0, `expected non-zero exit\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`);

  const payload = parsePayload(run);
  assert.equal(payload.ok, false);
  assert.equal(payload.THEME_CONFIG_OK, 0);
  assert.notEqual(String(payload.failReason || '').trim(), '');
  assert.ok(Array.isArray(payload.errors));
  assert.ok(payload.errors.some((entry) => entry.code === 'E_THEME_SCHEMA_MINIMUM' && entry.path === '$.animations.duration.fast'));
});

test('theme config contract: baseline schema file remains parseable JSON', () => {
  const schema = JSON.parse(fs.readFileSync(THEME_SCHEMA_PATH, 'utf8'));
  assert.equal(schema.$id, 'craftsman://theme/theme-config.schema.v1.json');
  assert.equal(schema.type, 'object');
});
