const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

async function loadFlowModeModule() {
  return import(pathToFileURL(path.join(process.cwd(), 'src', 'renderer', 'commands', 'flowMode.mjs')).href);
}

test('M9 kickoff status helper appends deterministic kickoff hint only when enabled', async () => {
  const flow = await loadFlowModeModule();

  const base = flow.buildFlowModeKickoffStatus('open', 2, { m8Kickoff: true });
  const kickoff = flow.buildFlowModeM9KickoffStatus('open', 2, { m8Kickoff: true, m9Kickoff: true });
  const disabled = flow.buildFlowModeM9KickoffStatus('open', 2, { m8Kickoff: true, m9Kickoff: false });

  assert.equal(kickoff, `${base} · M9 kickoff`);
  assert.equal(disabled, base);
  assert.equal(flow.buildFlowModeM9KickoffStatus('open', 2, { m8Kickoff: true, m9Kickoff: true }), kickoff);
});

test('M9 kickoff editor wiring uses M9 helper for open/save statuses', () => {
  const editorPath = path.join(process.cwd(), 'src', 'renderer', 'editor.js');
  const editorText = fs.readFileSync(editorPath, 'utf8');

  assert.ok(editorText.includes('buildFlowModeM9KickoffStatus'), 'editor must use M9 kickoff status helper');
  assert.ok(editorText.includes('m9Kickoff: true'), 'editor must pass M9 kickoff option');
});

test('M9 kickoff doctor tokens are green on M9 phase', () => {
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
  assert.equal(has('M8_CLOSE_OK=1'), true);
  assert.equal(has('M9_PHASE_READY_OK=1'), true);
  assert.equal(has('M9_KICKOFF_OK=1'), true);
});
