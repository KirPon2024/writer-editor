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

test('mindmap-derived state script emits required tokens', () => {
  const state = spawnSync(process.execPath, ['scripts/ops/mindmap-derived-state.mjs', '--json'], {
    encoding: 'utf8',
  });
  assert.equal(state.status, 0, `mindmap-derived-state failed:\n${state.stdout}\n${state.stderr}`);
  const payload = JSON.parse(String(state.stdout || '{}'));
  assert.equal(payload.MINDMAP_DERIVED_GRAPH_DETERMINISTIC_OK, 1);
  assert.equal(payload.MINDMAP_DERIVED_GRAPH_HASH_OK, 1);
  assert.equal(payload.MINDMAP_DERIVED_GRAPH_INVALIDATION_KEY_OK, 1);
  assert.equal(payload.MINDMAP_DERIVED_GRAPH_NO_SECOND_SOT_OK, 1);
  assert.equal(payload.MINDMAP_DERIVED_GRAPH_OK, 1);
});

test('mindmap-derived tokens are present in truth-table, ops-summary and doctor', () => {
  const truth = spawnSync(process.execPath, ['scripts/ops/extract-truth-table.mjs', '--json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
    },
  });
  assert.equal(truth.status, 0, `truth-table failed:\n${truth.stdout}\n${truth.stderr}`);
  const truthPayload = JSON.parse(String(truth.stdout || '{}'));
  assert.equal(truthPayload.MINDMAP_DERIVED_GRAPH_DETERMINISTIC_OK, 1);
  assert.equal(truthPayload.MINDMAP_DERIVED_GRAPH_HASH_OK, 1);
  assert.equal(truthPayload.MINDMAP_DERIVED_GRAPH_INVALIDATION_KEY_OK, 1);
  assert.equal(truthPayload.MINDMAP_DERIVED_GRAPH_NO_SECOND_SOT_OK, 1);
  assert.equal(truthPayload.MINDMAP_DERIVED_GRAPH_OK, 1);

  const summary = spawnSync(process.execPath, ['scripts/ops/emit-ops-summary.mjs'], {
    encoding: 'utf8',
  });
  assert.ok(summary.status === 0 || summary.status === 1, `ops-summary failed:\n${summary.stdout}\n${summary.stderr}`);
  const summaryTokens = parseTokens(summary.stdout);
  assert.equal(summaryTokens.get('OPS_SUMMARY_MINDMAP_DERIVED_GRAPH_DETERMINISTIC_OK'), '1');
  assert.equal(summaryTokens.get('OPS_SUMMARY_MINDMAP_DERIVED_GRAPH_HASH_OK'), '1');
  assert.equal(summaryTokens.get('OPS_SUMMARY_MINDMAP_DERIVED_GRAPH_INVALIDATION_KEY_OK'), '1');
  assert.equal(summaryTokens.get('OPS_SUMMARY_MINDMAP_DERIVED_GRAPH_NO_SECOND_SOT_OK'), '1');
  assert.equal(summaryTokens.get('OPS_SUMMARY_MINDMAP_DERIVED_GRAPH_OK'), '1');

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
  assert.equal(doctorTokens.get('MINDMAP_DERIVED_GRAPH_DETERMINISTIC_OK'), '1');
  assert.equal(doctorTokens.get('MINDMAP_DERIVED_GRAPH_HASH_OK'), '1');
  assert.equal(doctorTokens.get('MINDMAP_DERIVED_GRAPH_INVALIDATION_KEY_OK'), '1');
  assert.equal(doctorTokens.get('MINDMAP_DERIVED_GRAPH_NO_SECOND_SOT_OK'), '1');
  assert.equal(doctorTokens.get('MINDMAP_DERIVED_GRAPH_OK'), '1');
});
