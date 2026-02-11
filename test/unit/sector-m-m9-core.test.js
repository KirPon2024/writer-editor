const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

async function loadFlowModeModule() {
  return import(pathToFileURL(path.join(process.cwd(), 'src', 'renderer', 'commands', 'flowMode.mjs')).href);
}

test('M9 core save-error status helper is deterministic for payload reasons', async () => {
  const flow = await loadFlowModeModule();

  assert.equal(
    flow.buildFlowModeM9CoreSaveErrorStatus({ reason: 'flow_marker_count_mismatch' }, 2),
    'Flow mode core (2) · save blocked: marker count mismatch · reopen flow mode',
  );
  assert.equal(
    flow.buildFlowModeM9CoreSaveErrorStatus({ reason: 'flow_marker_sequence_invalid' }, 2),
    'Flow mode core (2) · save blocked: marker sequence invalid · reopen flow mode',
  );
  assert.equal(
    flow.buildFlowModeM9CoreSaveErrorStatus({ reason: 'flow_scene_path_missing' }, 2),
    'Flow mode core (2) · save blocked: scene path missing · reopen flow mode',
  );
  assert.equal(
    flow.buildFlowModeM9CoreSaveErrorStatus({ reason: 'unknown_reason' }, 2),
    'Flow mode core (2) · save blocked: invalid flow payload · reopen flow mode',
  );
  assert.equal(
    flow.buildFlowModeM9CoreSaveErrorStatus({ reason: 'flow_marker_count_mismatch' }, 2),
    flow.buildFlowModeM9CoreSaveErrorStatus({ reason: 'flow_marker_count_mismatch' }, 2),
  );
});

test('M9 core editor wiring maps flow payload errors to deterministic save status', () => {
  const editorPath = path.join(process.cwd(), 'src', 'renderer', 'editor.js');
  const editorText = fs.readFileSync(editorPath, 'utf8');

  assert.ok(editorText.includes('buildFlowModeM9CoreSaveErrorStatus'), 'editor must use M9 core save-error helper');
  assert.ok(editorText.includes('buildFlowModeM9CoreSaveErrorStatus(payload.error'), 'editor must map payload error reason');
});

test('M9 core doctor tokens are green on M9 phase', () => {
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

  assert.equal(has('SECTOR_M_PHASE=M9') || has('SECTOR_M_PHASE=DONE'), true);
  assert.equal(has('M9_KICKOFF_OK=1'), true);
  assert.equal(has('M9_CORE_OK=1'), true);
  assert.equal(has('M9_CORE_GO_TAG_RULE_OK=1'), true);
});
