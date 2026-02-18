const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = process.cwd();
const SPEC_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'MENU_CONFIG_NORMALIZATION_SPEC_v1.json');
const NORMALIZER_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-config-normalizer.js');
const OPS_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'menu-config-normalize.mjs');
const EXAMPLE_CONFIG_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-config.v2.example.json');
const DEFAULT_CONTEXT_PATH = path.join(REPO_ROOT, 'test', 'fixtures', 'menu', 'context.default.json');
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

function walkMenuItems(items, visit) {
  if (!Array.isArray(items)) return;
  items.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    visit(item);
    walkMenuItems(item.items, visit);
  });
}

function runNormalizeCli(args) {
  return spawnSync(process.execPath, [OPS_SCRIPT_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function makeSimpleConfig(overrides = {}) {
  const base = {
    version: 'v2',
    fonts: [
      { id: 'font-1', label: 'Serif', value: 'serif' },
    ],
    menus: [
      {
        id: 'file',
        label: 'File',
        items: [
          {
            id: 'save',
            label: 'Save',
            command: 'cmd.project.save',
            enabledWhen: { op: 'all', args: [] },
            mode: ['offline'],
            profile: ['minimal', 'pro', 'guru'],
            stage: ['X1', 'X2', 'X3', 'X4'],
          },
        ],
      },
    ],
  };
  return Object.assign(base, overrides);
}

test('menu normalization spec exists and normalizer entrypoint is present', () => {
  assert.equal(fs.existsSync(SPEC_PATH), true, 'missing MENU_CONFIG_NORMALIZATION_SPEC_v1.json');
  assert.equal(fs.existsSync(NORMALIZER_PATH), true, 'missing menu-config-normalizer.js');

  const spec = readJson(SPEC_PATH);
  assert.equal(spec.normalizedShapeVersion, 'v1');
  assert.equal(Array.isArray(spec.normalizedItemRequiredFields), true);
  assert.equal(spec.normalizedItemRequiredFields.includes('canonicalCmdId'), true);
  assert.equal(spec.rules.forbidActionIdInNormalizedOutput, true);
});

test('menu normalization is deterministic for identical inputs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-normalize-contract-'));
  const outA = path.join(tmpDir, 'normalized-a.json');
  const outB = path.join(tmpDir, 'normalized-b.json');
  try {
    const first = runNormalizeCli([
      '--in',
      EXAMPLE_CONFIG_PATH,
      '--context',
      DEFAULT_CONTEXT_PATH,
      '--out',
      outA,
      '--json',
    ]);
    assert.equal(first.status, 0, first.stdout || first.stderr);

    const second = runNormalizeCli([
      '--in',
      EXAMPLE_CONFIG_PATH,
      '--context',
      DEFAULT_CONTEXT_PATH,
      '--out',
      outB,
      '--json',
    ]);
    assert.equal(second.status, 0, second.stdout || second.stderr);

    const payloadA = readJson(outA);
    const payloadB = readJson(outB);
    assert.equal(typeof payloadA.normalizedHashSha256, 'string');
    assert.equal(payloadA.normalizedHashSha256.length, 64);
    assert.equal(payloadA.normalizedHashSha256, payloadB.normalizedHashSha256);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('normalized output has canonical-only command IDs, AST-only enabledWhen, and no actionId', () => {
  const { normalizeMenuConfigPipeline } = require(NORMALIZER_PATH);
  const state = normalizeMenuConfigPipeline({
    baseConfig: readJson(EXAMPLE_CONFIG_PATH),
    overlays: [],
    context: readJson(DEFAULT_CONTEXT_PATH),
    baseSourceRef: EXAMPLE_CONFIG_PATH,
  });

  assert.equal(state.ok, true, JSON.stringify(state.diagnostics, null, 2));
  const normalized = state.normalizedConfig;
  assert.equal(normalized.normalizedShapeVersion, 'v1');

  walkMenuItems(normalized.menus, (item) => {
    assert.equal(Object.prototype.hasOwnProperty.call(item, 'actionId'), false, 'normalized item cannot contain actionId');
    assert.equal(Object.prototype.hasOwnProperty.call(item, 'command'), false, 'normalized item cannot contain raw command');

    if (typeof item.canonicalCmdId === 'string' && item.canonicalCmdId.length > 0) {
      assert.equal(item.canonicalCmdId.startsWith('cmd.project.'), true, `non-canonical cmd id: ${item.canonicalCmdId}`);
      assert.ok(item.enabledWhenAst && typeof item.enabledWhenAst === 'object' && !Array.isArray(item.enabledWhenAst));
    } else {
      assert.equal(item.canonicalCmdId, null);
      assert.equal(item.enabledWhenAst === null || typeof item.enabledWhenAst === 'object', true);
    }

    if (item.enabledWhenAst !== null) {
      assert.notEqual(typeof item.enabledWhenAst, 'string');
    }
  });
});

test('negative: string enabledWhen is rejected', () => {
  const { normalizeMenuConfigPipeline } = require(NORMALIZER_PATH);
  const config = makeSimpleConfig();
  config.menus[0].items[0].enabledWhen = 'hasDocument';

  const state = normalizeMenuConfigPipeline({
    baseConfig: config,
    overlays: [],
    context: readJson(DEFAULT_CONTEXT_PATH),
    baseSourceRef: 'fixture:string-enabledWhen',
  });

  assert.equal(state.ok, false);
  assert.ok(state.diagnostics.errors.some((entry) => entry.code === 'E_MENU_NORMALIZATION_ENABLEDWHEN_STRING'));
});

test('negative: unknown cmdId without alias is rejected', () => {
  const { normalizeMenuConfigPipeline } = require(NORMALIZER_PATH);
  const config = makeSimpleConfig();
  config.menus[0].items[0].command = 'cmd.unknown.save';

  const state = normalizeMenuConfigPipeline({
    baseConfig: config,
    overlays: [],
    context: readJson(DEFAULT_CONTEXT_PATH),
    baseSourceRef: 'fixture:unknown-cmd',
  });

  assert.equal(state.ok, false);
  assert.ok(state.diagnostics.errors.some((entry) => entry.code === 'E_MENU_NORMALIZATION_COMMAND_NON_CANON'));
});

test('negative: overlay order is fixed by origin precedence', () => {
  const { normalizeMenuConfigPipeline } = require(NORMALIZER_PATH);
  const config = makeSimpleConfig();

  const overlays = [
    {
      origin: 'plugin',
      sourceRef: 'plugin-override',
      config: {
        menus: [{ id: 'file', items: [{ id: 'save', command: 'cmd.project.saveAs' }] }],
      },
    },
    {
      origin: 'profile',
      sourceRef: 'profile-override',
      config: {
        menus: [{ id: 'file', items: [{ id: 'save', command: 'cmd.project.open' }] }],
      },
    },
  ];

  const state = normalizeMenuConfigPipeline({
    baseConfig: config,
    overlays,
    context: readJson(DEFAULT_CONTEXT_PATH),
    baseSourceRef: 'fixture:overlay-order',
  });

  assert.equal(state.ok, true, JSON.stringify(state.diagnostics, null, 2));
  const saveItem = state.normalizedConfig.menus[0].items.find((item) => item.id === 'save');
  assert.ok(saveItem);
  assert.equal(saveItem.canonicalCmdId, 'cmd.project.saveAs');
  assert.deepEqual(state.diagnostics.overlayOrder.map((row) => row.origin), ['profile', 'plugin']);
});

test('negative: hiding a core command in Minimal profile is rejected', () => {
  const { normalizeMenuConfigPipeline } = require(NORMALIZER_PATH);
  const config = makeSimpleConfig();
  config.menus[0].items[0].visible = false;

  const state = normalizeMenuConfigPipeline({
    baseConfig: config,
    overlays: [],
    context: readJson(DEFAULT_CONTEXT_PATH),
    baseSourceRef: 'fixture:core-hidden',
  });

  assert.equal(state.ok, false);
  assert.ok(state.diagnostics.errors.some((entry) => entry.code === 'E_MENU_NORMALIZATION_CORE_HIDDEN'));
});

test('negative: X5 stage condition is rejected', () => {
  const { normalizeMenuConfigPipeline } = require(NORMALIZER_PATH);
  const config = makeSimpleConfig();
  config.menus[0].items[0].enabledWhen = {
    op: 'stageGte',
    value: 'X5',
  };

  const state = normalizeMenuConfigPipeline({
    baseConfig: config,
    overlays: [],
    context: readJson(DEFAULT_CONTEXT_PATH),
    baseSourceRef: 'fixture:x5-stage',
  });

  assert.equal(state.ok, false);
  assert.ok(state.diagnostics.errors.some((entry) => entry.code === 'E_MENU_NORMALIZATION_ENABLEDWHEN_INVALID'));
});

test('failSignal/token are registered and token is not in required set', () => {
  const failRegistry = readJson(FAILSIGNAL_REGISTRY_PATH);
  const signal = (failRegistry.failSignals || []).find((entry) => entry && entry.code === 'E_MENU_NORMALIZATION_DRIFT');
  assert.ok(signal, 'E_MENU_NORMALIZATION_DRIFT must exist in failSignal registry');
  assert.ok(signal.modeMatrix && typeof signal.modeMatrix === 'object');
  assert.equal(signal.modeMatrix.prCore, 'advisory');
  assert.equal(signal.modeMatrix.release, 'advisory');
  assert.equal(signal.modeMatrix.promotion, 'blocking');

  const tokenCatalog = readJson(TOKEN_CATALOG_PATH);
  const token = (tokenCatalog.tokens || []).find((entry) => entry && entry.tokenId === 'MENU_CONFIG_NORMALIZED_DETERMINISTIC_OK');
  assert.ok(token, 'MENU_CONFIG_NORMALIZED_DETERMINISTIC_OK must exist in token catalog');
  assert.equal(token.failSignalCode, 'E_MENU_NORMALIZATION_DRIFT');

  const requiredSet = readJson(REQUIRED_SET_PATH);
  const flattened = flattenStrings(requiredSet);
  assert.equal(flattened.includes('MENU_CONFIG_NORMALIZED_DETERMINISTIC_OK'), false);
});
