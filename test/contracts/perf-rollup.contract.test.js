const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function parseTokens(stdout) {
  const map = new Map();
  for (const raw of String(stdout || '').split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    map.set(line.slice(0, index), line.slice(index + 1));
  }
  return map;
}

test('perf rollup contract: freeze rollups and authoritative emitters expose PERF baseline tokens', () => {
  const freeze = spawnSync(process.execPath, ['scripts/ops/freeze-rollups-state.mjs', '--mode', 'release', '--json'], {
    encoding: 'utf8',
  });
  assert.equal(freeze.status, 0, `freeze rollups failed:\n${freeze.stdout}\n${freeze.stderr}`);
  const freezeState = JSON.parse(String(freeze.stdout || '{}'));
  assert.equal(freezeState.HOTPATH_POLICY_OK, 1);
  assert.equal(freezeState.PERF_FIXTURE_OK, 1);
  assert.equal(freezeState.PERF_RUNNER_DETERMINISTIC_OK, 1);
  assert.equal(freezeState.PERF_THRESHOLD_OK, 1);
  assert.equal(freezeState.PERF_BASELINE_OK, 1);

  const truth = spawnSync(process.execPath, ['scripts/ops/extract-truth-table.mjs', '--json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
    },
  });
  assert.equal(truth.status, 0, `truth-table failed:\n${truth.stdout}\n${truth.stderr}`);
  const truthTable = JSON.parse(String(truth.stdout || '{}'));
  assert.equal(truthTable.HOTPATH_POLICY_OK, 1);
  assert.equal(truthTable.PERF_FIXTURE_OK, 1);
  assert.equal(truthTable.PERF_RUNNER_DETERMINISTIC_OK, 1);
  assert.equal(truthTable.PERF_THRESHOLD_OK, 1);
  assert.equal(truthTable.PERF_BASELINE_OK, 1);

  const doctor = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DOCTOR_MODE: 'delivery',
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
    },
  });
  assert.equal(doctor.status, 0, `doctor failed:\n${doctor.stdout}\n${doctor.stderr}`);
  const doctorTokens = parseTokens(doctor.stdout);
  assert.equal(doctorTokens.get('HOTPATH_POLICY_OK'), '1');
  assert.equal(doctorTokens.get('PERF_FIXTURE_OK'), '1');
  assert.equal(doctorTokens.get('PERF_RUNNER_DETERMINISTIC_OK'), '1');
  assert.equal(doctorTokens.get('PERF_THRESHOLD_OK'), '1');
  assert.equal(doctorTokens.get('PERF_BASELINE_OK'), '1');
});
