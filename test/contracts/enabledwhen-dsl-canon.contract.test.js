const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = process.cwd();
const DSL_CANON_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'ENABLEDWHEN_DSL_CANON.json');
const EVAL_PATH = path.join(REPO_ROOT, 'src', 'menu', 'enabledwhen-eval.js');
const VALIDATOR_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-config-validator.js');
const CHECK_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'check-enabledwhen-dsl.mjs');
const FAILSIGNAL_REGISTRY_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'FAILSIGNALS', 'FAILSIGNAL_REGISTRY.json');
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

function runDslCheck(mode, menuRoot) {
  return spawnSync(
    process.execPath,
    [CHECK_SCRIPT_PATH, '--json', '--mode', mode, '--menu-root', menuRoot],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
}

test('enabledwhen-dsl-canon: ssot and evaluator exist with no eval usage', () => {
  assert.equal(fs.existsSync(DSL_CANON_PATH), true, 'missing ENABLEDWHEN_DSL_CANON.json');
  assert.equal(fs.existsSync(EVAL_PATH), true, 'missing enabledwhen-eval.js');

  const canon = readJson(DSL_CANON_PATH);
  assert.equal(typeof canon.version, 'string');
  assert.equal(Array.isArray(canon.allowedOperators), true);
  assert.equal(canon.allowedOperators.includes('all'), true);
  assert.equal(canon.allowedOperators.includes('stageGte'), true);
  assert.equal(canon.noRegex, true);
  assert.equal(canon.noDynamicKeys, true);
  assert.equal(canon.determinismRule, true);

  const source = fs.readFileSync(EVAL_PATH, 'utf8');
  assert.equal(source.includes('eval('), false, 'eval must not be used');
  assert.equal(source.includes('new Function('), false, 'Function constructor must not be used');
});

test('enabledwhen-dsl-canon: evaluator is deterministic for identical context', () => {
  const { evaluateEnabledWhenAst } = require(EVAL_PATH);
  const ast = {
    op: 'all',
    args: [
      { op: 'flag', name: 'hasDocument' },
      { op: 'stageGte', value: 'X1' },
    ],
  };
  const context = {
    mode: 'offline',
    profile: 'minimal',
    stage: 'X2',
    hasDocument: true,
  };

  const first = evaluateEnabledWhenAst(ast, context);
  const second = evaluateEnabledWhenAst(ast, context);
  assert.deepEqual(first, second);
  assert.equal(first.ok, true);
  assert.equal(first.value, true);
});

test('string-enabledwhen-is-rejected: validator rejects v2 string enabledWhen and marks hasEnabledWhenError', () => {
  const { loadAndValidateMenuConfig } = require(VALIDATOR_PATH);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'enabledwhen-dsl-contract-'));
  const configPath = path.join(tmpDir, 'menu-config.v2.json');
  try {
    const config = {
      version: 'v2',
      fonts: [{ id: 'font-1', label: 'Serif', value: 'serif' }],
      menus: [
        {
          id: 'file',
          label: 'File',
          items: [
            {
              id: 'file-save',
              label: 'Save',
              actionId: 'saveDocument',
              enabledWhen: 'hasDocument',
            },
          ],
        },
      ],
    };
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

    const state = loadAndValidateMenuConfig({ configPath });
    assert.equal(state.ok, false);
    assert.equal(state.hasEnabledWhenError, true);
    assert.ok(state.errors.some((entry) => String(entry.path || '').includes('enabledWhen')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('enabledwhen-dsl-canon: ops check warns on release and fails on promotion for string enabledWhen', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'enabledwhen-dsl-check-'));
  const menuDir = path.join(tmpDir, 'menu');
  fs.mkdirSync(menuDir, { recursive: true });
  const configPath = path.join(menuDir, 'menu-config.v2.json');
  try {
    const config = {
      version: 'v2',
      fonts: [{ id: 'font-1', label: 'Serif', value: 'serif' }],
      menus: [
        {
          id: 'file',
          label: 'File',
          items: [
            {
              id: 'file-open',
              label: 'Open',
              actionId: 'openDocument',
              enabledWhen: 'always',
            },
          ],
        },
      ],
    };
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

    const release = runDslCheck('release', menuDir);
    assert.equal(release.status, 0);
    const releasePayload = JSON.parse(String(release.stdout || '{}'));
    assert.equal(releasePayload.result, 'WARN');

    const promotion = runDslCheck('promotion', menuDir);
    assert.notEqual(promotion.status, 0);
    const promotionPayload = JSON.parse(String(promotion.stdout || '{}'));
    assert.equal(promotionPayload.result, 'FAIL');
    assert.equal(promotionPayload.failSignalCode, 'E_ENABLEDWHEN_DSL_INVALID');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('enabledwhen-dsl-canon: failSignal is registered and advisory token is not in required set', () => {
  const registry = readJson(FAILSIGNAL_REGISTRY_PATH);
  const row = (registry.failSignals || []).find((item) => item && item.code === 'E_ENABLEDWHEN_DSL_INVALID');
  assert.ok(row, 'E_ENABLEDWHEN_DSL_INVALID must be present in failSignal registry');
  assert.ok(row.modeMatrix && typeof row.modeMatrix === 'object');
  assert.equal(row.modeMatrix.prCore, 'advisory');
  assert.equal(row.modeMatrix.release, 'advisory');
  assert.equal(row.modeMatrix.promotion, 'blocking');

  const requiredSet = readJson(REQUIRED_SET_PATH);
  const flattened = flattenStrings(requiredSet);
  assert.equal(flattened.includes('ENABLEDWHEN_DSL_CANON_OK'), false);
});
