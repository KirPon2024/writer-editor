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

test('xplat cost guarantee state resolves deterministic rollup token', () => {
  const result = spawnSync(process.execPath, ['scripts/ops/xplat-cost-guarantee-state.mjs', '--json'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `xplat cost guarantee state failed:\n${result.stdout}\n${result.stderr}`);

  const payload = JSON.parse(String(result.stdout || '{}'));
  assert.equal(payload.version, 'xplat-cost-guarantee-state.v1');
  assert.equal(payload.ok, true);
  assert.equal(payload.XPLAT_COST_GUARANTEE_OK, 1);
  assert.deepEqual(payload.missing, []);
  assert.deepEqual(payload.requires, {
    SCR_SHARED_CODE_RATIO_OK: 1,
    PLATFORM_COVERAGE_BOUNDARY_TESTED_OK: 1,
    CAPABILITY_ENFORCED_OK: 1,
    ADAPTERS_ENFORCED_OK: 1,
  });
});

test('xplat cost guarantee token is emitted by truth-table, ops-summary and doctor', () => {
  const truth = spawnSync(process.execPath, ['scripts/ops/extract-truth-table.mjs', '--json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
    },
  });
  assert.equal(truth.status, 0, `truth-table failed:\n${truth.stdout}\n${truth.stderr}`);
  const truthTable = JSON.parse(String(truth.stdout || '{}'));
  assert.equal(truthTable.XPLAT_COST_GUARANTEE_OK, 1);

  const summary = spawnSync(process.execPath, ['scripts/ops/emit-ops-summary.mjs'], {
    encoding: 'utf8',
  });
  assert.ok(summary.status === 0 || summary.status === 1, `ops-summary failed:\n${summary.stdout}\n${summary.stderr}`);
  const summaryTokens = parseTokens(summary.stdout);
  assert.equal(summaryTokens.get('OPS_SUMMARY_XPLAT_COST_GUARANTEE_OK'), '1');

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
  assert.equal(doctorTokens.get('XPLAT_COST_GUARANTEE_OK'), '1');
});
