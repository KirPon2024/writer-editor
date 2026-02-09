const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

async function loadFlowModeModule() {
  return import(pathToFileURL(path.join(process.cwd(), 'src', 'renderer', 'commands', 'flowMode.mjs')).href);
}

test('M9 next no-op save status helper is deterministic', async () => {
  const flow = await loadFlowModeModule();

  assert.equal(
    flow.buildFlowModeM9NextNoopSaveStatus(2),
    'Flow mode core (2) · no changes to save · edit and press Shift+S',
  );
  assert.equal(
    flow.buildFlowModeM9NextNoopSaveStatus(-1),
    'Flow mode core (0) · no changes to save · edit and press Shift+S',
  );
  assert.equal(
    flow.buildFlowModeM9NextNoopSaveStatus(2),
    flow.buildFlowModeM9NextNoopSaveStatus(2),
  );
});

test('M9 next editor wiring blocks save command when flow mode is clean', () => {
  const editorPath = path.join(process.cwd(), 'src', 'renderer', 'editor.js');
  const editorText = fs.readFileSync(editorPath, 'utf8');

  assert.ok(editorText.includes('if (!flowModeState.dirty)'), 'editor must guard clean flow save path');
  assert.ok(editorText.includes('buildFlowModeM9NextNoopSaveStatus'), 'editor must use M9 next no-op helper');
});

test('M9 next doctor tokens are green on M9 phase', () => {
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

  assert.equal(has('SECTOR_M_PHASE=M9'), true);
  assert.equal(has('M9_CORE_OK=1'), true);
  assert.equal(has('M9_NEXT_OK=1'), true);
});
