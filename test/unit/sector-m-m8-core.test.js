const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

async function loadFlowModeModule() {
  const root = process.cwd();
  return import(pathToFileURL(path.join(root, 'src', 'renderer', 'commands', 'flowMode.mjs')).href);
}

test('M8 core flow status helper is deterministic for clean/dirty states', async () => {
  const flow = await loadFlowModeModule();

  const clean = flow.buildFlowModeCoreStatus(2, { dirty: false });
  const dirty = flow.buildFlowModeCoreStatus(2, { dirty: true });
  const fallbackCount = flow.buildFlowModeCoreStatus(-10, { dirty: true });

  assert.equal(clean, 'Flow mode core (2) · synced');
  assert.equal(dirty, 'Flow mode core (2) · unsaved changes · Shift+S save');
  assert.equal(fallbackCount, 'Flow mode core (0) · unsaved changes · Shift+S save');
  assert.equal(flow.buildFlowModeCoreStatus(2, { dirty: true }), dirty);
});

test('M8 core editor wiring marks flow mode dirty with deterministic status helper', () => {
  const flowPath = path.join(process.cwd(), 'src', 'renderer', 'commands', 'flowMode.mjs');
  const editorPath = path.join(process.cwd(), 'src', 'renderer', 'editor.js');

  const flowText = fs.readFileSync(flowPath, 'utf8');
  const editorText = fs.readFileSync(editorPath, 'utf8');

  assert.ok(flowText.includes('buildFlowModeCoreStatus'), 'flow mode helper must exist');
  assert.ok(flowText.includes('unsaved changes'), 'flow mode helper must expose dirty status text');

  assert.ok(editorText.includes('buildFlowModeCoreStatus'), 'editor must use M8 core status helper');
  assert.ok(editorText.includes('flowModeState.active'), 'editor must guard flow mode path');
  assert.ok(editorText.includes('dirty: true'), 'editor must mark flow mode state dirty');
});

test('M8 core doctor tokens are green on M8 phase', () => {
  const result = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SECTOR_U_FAST_DURATION_MS: '10',
    },
  });
  assert.equal(result.status, 0, `doctor failed:\n${result.stdout}\n${result.stderr}`);

  const lines = String(result.stdout || '').split(/\r?\n/);
  const has = (prefix) => lines.some((line) => line === prefix);

  assert.equal(has('SECTOR_M_PHASE=M8'), true);
  assert.equal(has('M8_PHASE_READY_OK=1'), true);
  assert.equal(has('M8_KICKOFF_OK=1'), true);
  assert.equal(has('M8_CORE_OK=1'), true);
});
