const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = process.cwd();
const V2_CONFIG_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-config.v2.json');

const {
  evaluateMenuItemEnabled,
  loadAndValidateMenuConfig
} = require(path.join(REPO_ROOT, 'src', 'menu', 'menu-config-validator.js'));

function readV2Config() {
  return JSON.parse(fs.readFileSync(V2_CONFIG_PATH, 'utf8'));
}

function runWithTempV2(mutator) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-config-v2-contract-'));
  const configPath = path.join(tmpDir, 'menu-config.v2.json');
  try {
    const config = readV2Config();
    mutator(config);
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    return loadAndValidateMenuConfig({ configPath });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('menu-config v2 contract: example file validates and resolves as v2', () => {
  const state = loadAndValidateMenuConfig({ configPath: V2_CONFIG_PATH });
  assert.equal(state.ok, true, `expected ok state\nerrors:\n${JSON.stringify(state.errors, null, 2)}`);
  assert.equal(state.version, 'v2');
  assert.ok(Array.isArray(state.errors));
  assert.equal(state.errors.length, 0);
});

test('menu-config v2 contract: review menu exposes local packet import export and clear session product entries', () => {
  const config = readV2Config();
  const reviewMenu = config.menus.find((menu) => menu.id === 'review');
  assert.ok(reviewMenu, 'expected review menu');
  const items = new Map(reviewMenu.items.map((item) => [item.id, item]));

  assert.deepEqual(items.get('review-import-local-packet'), {
    id: 'review-import-local-packet',
    label: 'Import Review Packet for Exact Apply...',
    labelKey: 'menu.review.importLocalPacket',
    command: 'cmd.project.review.importLocalPacket',
  });
  assert.deepEqual(items.get('review-export-local-packet'), {
    id: 'review-export-local-packet',
    label: 'Export Review Packet...',
    labelKey: 'menu.review.exportLocalPacket',
    command: 'cmd.project.review.exportLocalPacket',
  });
  assert.deepEqual(items.get('review-export-docx-review-packet'), {
    id: 'review-export-docx-review-packet',
    label: 'Export Review DOCX Packet...',
    labelKey: 'menu.review.exportDocxReviewPacket',
    command: 'cmd.project.review.exportDocxReviewPacket',
  });
  assert.deepEqual(items.get('review-open-docx-review-preview-session'), {
    id: 'review-open-docx-review-preview-session',
    label: 'Open DOCX Review (Comments; tracked text candidates are manual-only)...',
    labelKey: 'menu.review.openDocxReviewPreviewSession',
    command: 'cmd.project.review.openDocxReviewPreviewSession',
  });
  assert.deepEqual(items.get('review-clear-session'), {
    id: 'review-clear-session',
    label: 'Clear Review Session',
    labelKey: 'menu.review.clearSession',
    command: 'cmd.project.review.clearSession',
  });
  assert.deepEqual(items.get('review-cancel-operation'), {
    id: 'review-cancel-operation',
    label: 'Cancel Review Operation',
    labelKey: 'menu.review.cancelOperation',
    command: 'cmd.project.review.cancelOperation',
  });
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
  const config = readV2Config();
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
