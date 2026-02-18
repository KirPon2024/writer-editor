const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = process.cwd();
const NORMALIZER_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-config-normalizer.js');
const PLUGIN_LOADER_PATH = path.join(REPO_ROOT, 'src', 'menu', 'plugin-overlays-loader.js');
const OPS_CHECK_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'check-menu-overlay-stack.mjs');
const RUN_TESTS_PATH = path.join(REPO_ROOT, 'scripts', 'run-tests.js');
const STACK_CANON_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'MENU_OVERLAY_STACK_CANON_v1.json');
const PLUGIN_POLICY_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'PLUGIN_MENU_OVERLAY_POLICY_v1.json');
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

function uniqueOriginsInOrder(rows = []) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const origin = String(row && row.origin ? row.origin : '').trim().toLowerCase();
    if (!origin || seen.has(origin)) continue;
    seen.add(origin);
    out.push(origin);
  }
  return out;
}

function buildBaseConfig() {
  return {
    version: 'v2',
    fonts: [{ id: 'font-default', label: 'Serif', value: 'serif' }],
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
}

function buildOverlayFixture(pluginOverlays) {
  return {
    platformOverlay: {
      sourceRef: 'layer:platform',
      config: { menus: [{ id: 'file', items: [{ id: 'save', command: 'cmd.project.open' }] }] },
    },
    profileOverlay: {
      sourceRef: 'layer:profile',
      config: { menus: [{ id: 'file', items: [{ id: 'save', command: 'cmd.project.saveAs' }] }] },
    },
    workspaceOverlay: {
      sourceRef: 'layer:workspace',
      config: { menus: [{ id: 'file', items: [{ id: 'save', command: 'cmd.project.close' }] }] },
    },
    userOverlay: {
      sourceRef: 'layer:user',
      config: { menus: [{ id: 'file', items: [{ id: 'save', command: 'cmd.project.new' }] }] },
    },
    pluginOverlays,
    context: {
      platform: 'mac',
      mode: 'offline',
      profile: 'minimal',
      stage: 'X2',
      hasDocument: true,
    },
    baseSourceRef: 'fixture:base',
    mode: 'release',
  };
}

function runOverlayCheck(args = []) {
  return spawnSync(process.execPath, [OPS_CHECK_PATH, '--json', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function parseJsonOutput(result) {
  let payload = null;
  assert.doesNotThrow(() => {
    payload = JSON.parse(String(result.stdout || '{}'));
  }, `invalid JSON output:\n${result.stdout}\n${result.stderr}`);
  return payload;
}

test('stack order and determinism are canonical', () => {
  assert.equal(fs.existsSync(STACK_CANON_PATH), true, 'missing MENU_OVERLAY_STACK_CANON_v1.json');
  assert.equal(fs.existsSync(PLUGIN_POLICY_PATH), true, 'missing PLUGIN_MENU_OVERLAY_POLICY_v1.json');
  assert.equal(fs.existsSync(OPS_CHECK_PATH), true, 'missing check-menu-overlay-stack.mjs');
  assert.equal(fs.existsSync(PLUGIN_LOADER_PATH), true, 'missing plugin-overlays-loader.js');

  const canon = readJson(STACK_CANON_PATH);
  const expectedOrder = canon.stackOrder.map((entry) => String(entry || '').trim().toLowerCase());

  const { normalizeMenuConfigPipeline } = require(NORMALIZER_PATH);
  const pluginOverlays = [
    {
      pluginId: 'plugin.zeta',
      pluginVersion: '1.0.0',
      overlayId: 'overlay-b',
      signatureStatus: 'signed',
      sourceRef: 'plugin:zeta',
      inserts: [{ id: 'file', items: [{ id: 'save', command: 'cmd.project.save' }] }],
    },
    {
      pluginId: 'plugin.alpha',
      pluginVersion: '2.0.0',
      overlayId: 'overlay-a',
      signatureStatus: 'signed',
      sourceRef: 'plugin:alpha',
      inserts: [{ id: 'file', items: [{ id: 'save', command: 'cmd.project.export.docxMin' }] }],
    },
  ];

  const stateA = normalizeMenuConfigPipeline({
    baseConfig: buildBaseConfig(),
    ...buildOverlayFixture(pluginOverlays),
  });
  assert.equal(stateA.ok, true, JSON.stringify(stateA.diagnostics, null, 2));
  const detectedOrder = uniqueOriginsInOrder(stateA.overlayStackApplied);
  assert.deepEqual(detectedOrder, expectedOrder);
  assert.match(String(stateA.inputFingerprintSha256 || ''), /^[0-9a-f]{64}$/u);
  assert.match(String(stateA.normalizedHashSha256 || ''), /^[0-9a-f]{64}$/u);

  const stateB = normalizeMenuConfigPipeline({
    baseConfig: buildBaseConfig(),
    ...buildOverlayFixture(pluginOverlays),
  });
  assert.equal(stateB.ok, true, JSON.stringify(stateB.diagnostics, null, 2));
  assert.equal(stateA.normalizedHashSha256, stateB.normalizedHashSha256);
});

test('plugin overlay sorting determinism keeps normalized hash stable', () => {
  const { normalizeMenuConfigPipeline } = require(NORMALIZER_PATH);
  const overlaysA = [
    {
      pluginId: 'plugin.zeta',
      pluginVersion: '1.0.0',
      overlayId: 'overlay-b',
      signatureStatus: 'signed',
      sourceRef: 'plugin:zeta',
      inserts: [{ id: 'file', items: [{ id: 'save', command: 'cmd.project.save' }] }],
    },
    {
      pluginId: 'plugin.alpha',
      pluginVersion: '2.0.0',
      overlayId: 'overlay-a',
      signatureStatus: 'signed',
      sourceRef: 'plugin:alpha',
      inserts: [{ id: 'file', items: [{ id: 'save', command: 'cmd.project.export.docxMin' }] }],
    },
  ];
  const overlaysB = [...overlaysA].reverse();

  const stateA = normalizeMenuConfigPipeline({
    baseConfig: buildBaseConfig(),
    ...buildOverlayFixture(overlaysA),
  });
  const stateB = normalizeMenuConfigPipeline({
    baseConfig: buildBaseConfig(),
    ...buildOverlayFixture(overlaysB),
  });

  assert.equal(stateA.ok, true, JSON.stringify(stateA.diagnostics, null, 2));
  assert.equal(stateB.ok, true, JSON.stringify(stateB.diagnostics, null, 2));
  assert.equal(stateA.normalizedHashSha256, stateB.normalizedHashSha256);
});

test('plugin data-only policy negative pack', () => {
  const { normalizePluginOverlays } = require(PLUGIN_LOADER_PATH);
  const badOverlays = [
    {
      pluginId: 'plugin.bad.forbidden-field',
      pluginVersion: '1.0.0',
      overlayId: 'bad-1',
      signatureStatus: 'signed',
      handler: 'ipc://do-thing',
      inserts: [],
    },
    {
      pluginId: 'plugin.bad.functionish',
      pluginVersion: '1.0.0',
      overlayId: 'bad-2',
      signatureStatus: 'signed',
      inserts: [() => {}],
    },
    {
      pluginId: 'plugin.bad.replace',
      pluginVersion: '1.0.0',
      overlayId: 'bad-3',
      signatureStatus: 'signed',
      replace: { id: 'save', command: 'cmd.project.open' },
      inserts: [],
    },
    {
      pluginId: 'plugin.bad.enabledwhen-string',
      pluginVersion: '1.0.0',
      overlayId: 'bad-4',
      signatureStatus: 'signed',
      enabledWhenAst: 'hasDocument',
      inserts: [],
    },
    {
      pluginId: 'plugin.bad.visibility-conflict',
      pluginVersion: '1.0.0',
      overlayId: 'bad-5',
      signatureStatus: 'signed',
      visibilityPolicy: {
        'cmd.project.save': 'hidden',
      },
      inserts: [],
    },
  ];

  const state = normalizePluginOverlays(badOverlays);
  const codes = new Set((state.violations || []).map((entry) => String(entry.code || '').trim()));

  assert.equal(codes.has('PLUGIN_OVERLAY_EXECUTABLE_FIELD_FORBIDDEN'), true);
  assert.equal(codes.has('PLUGIN_OVERLAY_FUNCTION_VALUE_FORBIDDEN'), true);
  assert.equal(codes.has('PLUGIN_OVERLAY_FIELD_FORBIDDEN'), true);
  assert.equal(codes.has('PLUGIN_OVERLAY_ENABLEDWHEN_STRING_FORBIDDEN'), true);
  assert.equal(codes.has('PLUGIN_OVERLAY_VISIBILITY_CORE_CONFLICT'), true);
});

test('mode semantics release warn and promotion fail on violations', () => {
  const release = runOverlayCheck(['--mode=release', '--simulate-violation=plugin-policy']);
  assert.equal(release.status, 0, `${release.stdout}\n${release.stderr}`);
  const releasePayload = parseJsonOutput(release);
  assert.equal(releasePayload.result, 'WARN');
  assert.equal(releasePayload.failSignalCode, 'E_PLUGIN_MENU_OVERLAY_POLICY_VIOLATION');

  const promotion = runOverlayCheck(['--mode=promotion', '--simulate-violation=plugin-policy']);
  assert.notEqual(promotion.status, 0, 'promotion must fail when overlay violations are present');
  const promotionPayload = parseJsonOutput(promotion);
  assert.equal(promotionPayload.result, 'FAIL');
  assert.equal(promotionPayload.failSignalCode, 'E_PLUGIN_MENU_OVERLAY_POLICY_VIOLATION');
});

test('heavy lane wiring includes overlay stack check and fast lane remains untouched', () => {
  const runTestsText = fs.readFileSync(RUN_TESTS_PATH, 'utf8');
  assert.ok(runTestsText.includes('runMenuOverlayStackGuard'), 'heavy lane must include runMenuOverlayStackGuard');
  assert.ok(runTestsText.includes('scripts/ops/check-menu-overlay-stack.mjs'), 'run-tests must execute check-menu-overlay-stack.mjs');
});

test('failSignals and tokens are registered; required set is not expanded', () => {
  const failRegistry = readJson(FAILSIGNAL_REGISTRY_PATH);
  const stackSignal = (failRegistry.failSignals || []).find((row) => row && row.code === 'E_MENU_OVERLAY_STACK_DRIFT');
  const pluginSignal = (failRegistry.failSignals || []).find((row) => row && row.code === 'E_PLUGIN_MENU_OVERLAY_POLICY_VIOLATION');
  assert.ok(stackSignal, 'missing failSignal E_MENU_OVERLAY_STACK_DRIFT');
  assert.ok(pluginSignal, 'missing failSignal E_PLUGIN_MENU_OVERLAY_POLICY_VIOLATION');
  assert.equal(stackSignal.modeMatrix.promotion, 'blocking');
  assert.equal(pluginSignal.modeMatrix.promotion, 'blocking');

  const tokenCatalog = readJson(TOKEN_CATALOG_PATH);
  const stackToken = (tokenCatalog.tokens || []).find((row) => row && row.tokenId === 'MENU_OVERLAY_STACK_CANON_OK');
  const pluginToken = (tokenCatalog.tokens || []).find((row) => row && row.tokenId === 'PLUGIN_MENU_OVERLAY_DATA_ONLY_OK');
  assert.ok(stackToken, 'missing token MENU_OVERLAY_STACK_CANON_OK');
  assert.ok(pluginToken, 'missing token PLUGIN_MENU_OVERLAY_DATA_ONLY_OK');
  assert.equal(stackToken.failSignalCode, 'E_MENU_OVERLAY_STACK_DRIFT');
  assert.equal(pluginToken.failSignalCode, 'E_PLUGIN_MENU_OVERLAY_POLICY_VIOLATION');

  const requiredSet = readJson(REQUIRED_SET_PATH);
  const flattened = flattenStrings(requiredSet);
  assert.equal(flattened.includes('MENU_OVERLAY_STACK_CANON_OK'), false);
  assert.equal(flattened.includes('PLUGIN_MENU_OVERLAY_DATA_ONLY_OK'), false);
});
