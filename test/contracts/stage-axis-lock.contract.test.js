const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = process.cwd();
const SCHEMA_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-config.schema.v2.json');
const VALIDATOR_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-config-validator.js');
const EXAMPLE_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-config.v2.example.json');
const REQUIRED_SET_GENERATOR_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'generate-required-token-set.mjs');
const REQUIRED_SET_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'EXECUTION', 'REQUIRED_TOKEN_SET.json');
const FAILSIGNAL_REGISTRY_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'FAILSIGNALS', 'FAILSIGNAL_REGISTRY.json');

const { loadAndValidateMenuConfig } = require(path.join(REPO_ROOT, 'src', 'menu', 'menu-config-validator.js'));

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function stringify(value) {
  return JSON.stringify(value, null, 2);
}

function hasStageAxisEnum(node) {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some((entry) => hasStageAxisEnum(entry));
  if (
    Array.isArray(node.enum)
    && node.enum.length === 5
    && node.enum.join(',') === 'X0,X1,X2,X3,X4'
  ) {
    return true;
  }
  return Object.values(node).some((entry) => hasStageAxisEnum(entry));
}

function runMenuNormalize(configPath, outPath) {
  return spawnSync(
    process.execPath,
    [
      'scripts/ops/menu-config-normalize.mjs',
      '--in',
      configPath,
      '--context',
      'test/fixtures/menu/context.default.json',
      '--out',
      outPath,
      '--mode=promotion',
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    },
  );
}

test('stage axis lock: X5 is absent in runtime schema, validator defaults, example and required-set logic', () => {
  const schemaText = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const validatorText = fs.readFileSync(VALIDATOR_PATH, 'utf8');
  const exampleText = fs.readFileSync(EXAMPLE_PATH, 'utf8');
  const requiredSetGeneratorText = fs.readFileSync(REQUIRED_SET_GENERATOR_PATH, 'utf8');
  const requiredSetText = fs.readFileSync(REQUIRED_SET_PATH, 'utf8');

  for (const text of [schemaText, validatorText, exampleText, requiredSetGeneratorText, requiredSetText]) {
    assert.equal(/\bX5\b/u.test(text), false, 'X5 must not appear in runtime stage axis artifacts');
  }

  const schema = readJson(SCHEMA_PATH);
  assert.equal(hasStageAxisEnum(schema), true, 'schema must keep explicit X0..X4 enum lock');

  const failSignals = readJson(FAILSIGNAL_REGISTRY_PATH).failSignals || [];
  const signal = failSignals.find((entry) => entry && entry.code === 'E_STAGE_AXIS_DRIFT');
  assert.ok(signal, 'E_STAGE_AXIS_DRIFT must be registered');
  assert.ok(signal.modeMatrix && typeof signal.modeMatrix === 'object');
  assert.equal(signal.modeMatrix.prCore, 'advisory');
  assert.equal(signal.modeMatrix.release, 'blocking');
  assert.equal(signal.modeMatrix.promotion, 'blocking');
});

test('stage x5 is rejected by runtime validator', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-axis-lock-'));
  const configPath = path.join(tmpDir, 'menu-config.v2.json');
  const outPath = path.join(tmpDir, 'menu.normalized.json');

  try {
    const config = readJson(EXAMPLE_PATH);
    config.menus[0].items[0].stage = ['X5'];
    fs.writeFileSync(configPath, `${stringify(config)}\n`, 'utf8');

    const state = loadAndValidateMenuConfig({ configPath });
    assert.equal(state.ok, false, 'validator must reject stage X5');
    assert.ok(state.errors.some((entry) => String(entry.code || '') === 'E_MENU_SCHEMA_ENUM'));

    const normalizeResult = runMenuNormalize(configPath, outPath);
    assert.notEqual(normalizeResult.status, 0, 'normalization must fail for stage X5');
    assert.equal(fs.existsSync(outPath), false, 'runtime artifact must not be emitted for invalid stage axis');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
