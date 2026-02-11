const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function parseTokens(stdout) {
  const map = new Map();
  for (const raw of String(stdout || '').split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line) continue;
    const normalized = line.startsWith('DOCTOR_TOKEN ')
      ? line.slice('DOCTOR_TOKEN '.length).trim()
      : line;
    const idx = normalized.indexOf('=');
    if (idx <= 0) continue;
    map.set(normalized.slice(0, idx), normalized.slice(idx + 1));
  }
  return map;
}

test('collab apply pipeline state script emits authoritative tokens', () => {
  const state = spawnSync(process.execPath, ['scripts/ops/collab-apply-pipeline-state.mjs', '--json'], {
    encoding: 'utf8',
  });
  assert.equal(state.status, 0, `collab-apply-pipeline-state failed:\n${state.stdout}\n${state.stderr}`);
  const payload = JSON.parse(String(state.stdout || '{}'));
  assert.equal(payload.COLLAB_APPLY_PIPELINE_PURE_OK, 1);
  assert.equal(payload.COLLAB_APPLY_PIPELINE_DETERMINISTIC_OK, 1);
  assert.equal(payload.COLLAB_APPLY_PIPELINE_TYPED_ERRORS_OK, 1);
  assert.equal(payload.COLLAB_APPLY_PIPELINE_OK, 1);
});

test('collab apply pipeline tokens are visible in truth-table, ops-summary and doctor', () => {
  const truth = spawnSync(process.execPath, ['scripts/ops/extract-truth-table.mjs', '--json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
    },
  });
  assert.equal(truth.status, 0, `truth-table failed:\n${truth.stdout}\n${truth.stderr}`);
  const truthTable = JSON.parse(String(truth.stdout || '{}'));
  assert.equal(truthTable.COLLAB_APPLY_PIPELINE_PURE_OK, 1);
  assert.equal(truthTable.COLLAB_APPLY_PIPELINE_DETERMINISTIC_OK, 1);
  assert.equal(truthTable.COLLAB_APPLY_PIPELINE_TYPED_ERRORS_OK, 1);
  assert.equal(truthTable.COLLAB_APPLY_PIPELINE_OK, 1);

  const summary = spawnSync(process.execPath, ['scripts/ops/emit-ops-summary.mjs'], {
    encoding: 'utf8',
  });
  assert.ok(summary.status === 0 || summary.status === 1, `ops-summary failed:\n${summary.stdout}\n${summary.stderr}`);
  const summaryTokens = parseTokens(summary.stdout);
  assert.equal(summaryTokens.get('OPS_SUMMARY_COLLAB_APPLY_PIPELINE_OK'), '1');

  const doctor = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DOCTOR_MODE: 'delivery',
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
    },
  });
  assert.ok(doctor.status === 0 || doctor.status === 1, `doctor failed:\n${doctor.stdout}\n${doctor.stderr}`);
  const doctorTokens = parseTokens(doctor.stdout);
  assert.equal(doctorTokens.get('COLLAB_APPLY_PIPELINE_OK'), '1');
});
