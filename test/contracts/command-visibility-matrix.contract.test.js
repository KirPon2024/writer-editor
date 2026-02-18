const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = process.cwd();
const MATRIX_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'COMMAND_VISIBILITY_MATRIX.json');
const VALIDATOR_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-config-validator.js');
const FAILSIGNAL_REGISTRY_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'FAILSIGNALS', 'FAILSIGNAL_REGISTRY.json');
const TOKEN_CATALOG_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'TOKENS', 'TOKEN_CATALOG.json');
const REQUIRED_SET_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'EXECUTION', 'REQUIRED_TOKEN_SET.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function flattenStrings(input, out = []) {
  if (Array.isArray(input)) {
    input.forEach((entry) => flattenStrings(entry, out));
    return out;
  }
  if (!input || typeof input !== 'object') {
    if (typeof input === 'string') out.push(input);
    return out;
  }
  Object.values(input).forEach((value) => flattenStrings(value, out));
  return out;
}

test('missing-visibility-matrix-ssot: matrix file exists and has mandatory MVP states/rules', () => {
  assert.equal(fs.existsSync(MATRIX_PATH), true, 'missing command visibility matrix SSOT');
  const matrix = readJson(MATRIX_PATH);

  assert.equal(typeof matrix.version, 'string');
  assert.deepEqual(matrix.states, [
    'visible+enabled',
    'visible+disabled(reason)',
    'hidden',
  ]);
  assert.equal(
    String(matrix?.rules?.stageGatedDefaultState || ''),
    'visible+disabled(reason="STAGE_GATED")',
  );
  assert.equal(matrix?.rules?.minimalProfileCanHideNonCore, true);

  const coreSafety = Array.isArray(matrix.coreSafetyCommandAllowlist)
    ? matrix.coreSafetyCommandAllowlist
    : [];
  assert.equal(coreSafety.includes('cmd.project.open'), true);
  assert.equal(coreSafety.includes('cmd.project.save'), true);
  assert.equal(coreSafety.includes('cmd.project.export.docxMin'), true);
});

test('command-visibility-matrix: validator/normalizer wiring exposes matrix version', () => {
  const { loadAndValidateMenuConfig } = require(VALIDATOR_PATH);
  const state = loadAndValidateMenuConfig({
    configPath: path.join(REPO_ROOT, 'src', 'menu', 'menu-config.v2.example.json'),
  });
  assert.equal(state.ok, true, JSON.stringify(state.errors, null, 2));
  assert.equal(typeof state.normalizedConfig.visibilityMatrixVersion, 'string');
  assert.equal(state.normalizedConfig.visibilityMatrixVersion.length > 0, true);
});

test('command-visibility-matrix: stage-gated commands stay visible but disabled', () => {
  const { evaluateMenuItemEnabled } = require(VALIDATOR_PATH);

  const result = evaluateMenuItemEnabled(
    {
      id: 'file-save',
      label: 'Save',
      command: 'cmd.project.save',
      mode: ['offline'],
      profile: ['minimal', 'pro', 'guru'],
      stage: ['X2', 'X3', 'X4'],
      enabledWhen: { op: 'all', args: [] },
    },
    {
      mode: 'offline',
      profile: 'minimal',
      stage: 'X1',
      hasDocument: true,
    },
  );

  assert.deepEqual(result, {
    enabled: false,
    visible: true,
    reason: 'E_MENU_GATE_STAGE',
    visibilityReason: 'STAGE_GATED',
  });
});

test('command-visibility-matrix: minimal profile can hide non-core commands but not core safety commands', () => {
  const { evaluateMenuItemEnabled } = require(VALIDATOR_PATH);

  const hiddenResult = evaluateMenuItemEnabled(
    {
      id: 'flow-open',
      label: 'Flow Open',
      command: 'cmd.project.importMarkdownV1',
      mode: ['offline'],
      profile: ['minimal', 'pro', 'guru'],
      stage: ['X1', 'X2', 'X3', 'X4'],
      enabledWhen: { op: 'all', args: [] },
    },
    {
      mode: 'offline',
      profile: 'minimal',
      stage: 'X1',
    },
  );
  assert.deepEqual(hiddenResult, {
    enabled: false,
    visible: false,
    reason: 'E_MENU_VISIBILITY_HIDDEN_PROFILE_MINIMAL',
  });

  const coreResult = evaluateMenuItemEnabled(
    {
      id: 'file-open',
      label: 'Open',
      command: 'cmd.project.open',
      mode: ['offline'],
      profile: ['minimal', 'pro', 'guru'],
      stage: ['X1', 'X2', 'X3', 'X4'],
      enabledWhen: { op: 'all', args: [] },
    },
    {
      mode: 'offline',
      profile: 'minimal',
      stage: 'X1',
    },
  );
  assert.equal(coreResult.visible, true);
});

test('command-visibility-matrix: advisory token stays outside required sets', () => {
  const registry = readJson(FAILSIGNAL_REGISTRY_PATH);
  const signal = (registry.failSignals || []).find((item) => item && item.code === 'E_COMMAND_VISIBILITY_MATRIX_DRIFT');
  assert.ok(signal, 'E_COMMAND_VISIBILITY_MATRIX_DRIFT must exist in failSignal registry');
  assert.ok(signal.modeMatrix && typeof signal.modeMatrix === 'object');
  assert.equal(signal.modeMatrix.prCore, 'advisory');
  assert.equal(signal.modeMatrix.release, 'advisory');
  assert.equal(signal.modeMatrix.promotion, 'blocking');

  const catalog = readJson(TOKEN_CATALOG_PATH);
  const token = (catalog.tokens || []).find((item) => item && item.tokenId === 'COMMAND_VISIBILITY_MATRIX_OK');
  assert.ok(token, 'COMMAND_VISIBILITY_MATRIX_OK token must exist');
  assert.equal(token.failSignalCode, 'E_COMMAND_VISIBILITY_MATRIX_DRIFT');

  const required = readJson(REQUIRED_SET_PATH);
  const flattened = flattenStrings(required);
  assert.equal(flattened.includes('COMMAND_VISIBILITY_MATRIX_OK'), false);
});
