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

test('M8 next flow status helper is deterministic for blocked reopen guidance', async () => {
  const flow = await loadFlowModeModule();

  const blocked = flow.buildFlowModeReopenBlockedStatus(3);
  const fallbackCount = flow.buildFlowModeReopenBlockedStatus(-1);

  assert.equal(blocked, 'Flow mode core (3) · unsaved changes blocked reopen · Shift+S save');
  assert.equal(fallbackCount, 'Flow mode core (0) · unsaved changes blocked reopen · Shift+S save');
  assert.equal(flow.buildFlowModeReopenBlockedStatus(3), blocked);
});

test('M8 next editor wiring blocks flow reopen when unsaved changes exist', () => {
  const flowPath = path.join(process.cwd(), 'src', 'renderer', 'commands', 'flowMode.mjs');
  const editorPath = path.join(process.cwd(), 'src', 'renderer', 'editor.js');

  const flowText = fs.readFileSync(flowPath, 'utf8');
  const editorText = fs.readFileSync(editorPath, 'utf8');

  assert.ok(flowText.includes('buildFlowModeReopenBlockedStatus'), 'flow helper for blocked reopen must exist');
  assert.ok(flowText.includes('blocked reopen'), 'flow helper must expose blocked reopen message');

  assert.ok(editorText.includes('flowModeState.active && flowModeState.dirty'), 'editor must guard dirty flow reopen');
  assert.ok(editorText.includes('buildFlowModeReopenBlockedStatus'), 'editor must use blocked reopen helper');
});

test('M8 next doctor token is green on M8 phase', () => {
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
  assert.equal(has('M8_CORE_OK=1'), true);
  assert.equal(has('M8_NEXT_OK=1'), true);
  assert.equal(has('M8_CLOSE_OK=1'), true);
});
