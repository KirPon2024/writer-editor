const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function parseTokens(stdout) {
  const tokens = new Map();
  for (const raw of String(stdout || '').split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line) continue;
    const normalized = line.startsWith('DOCTOR_TOKEN ')
      ? line.slice('DOCTOR_TOKEN '.length).trim()
      : line;
    const idx = normalized.indexOf('=');
    if (idx <= 0) continue;
    tokens.set(normalized.slice(0, idx), normalized.slice(idx + 1));
  }
  return tokens;
}

test('platform coverage state is deterministic and emits baseline tokens', () => {
  const state = spawnSync(process.execPath, ['scripts/ops/platform-coverage-state.mjs', '--json'], {
    encoding: 'utf8',
  });
  assert.equal(state.status, 0, `platform coverage state failed:\n${state.stdout}\n${state.stderr}`);
  const payload = JSON.parse(String(state.stdout || '{}'));

  assert.equal(payload.PLATFORM_COVERAGE_DECLARED_OK, 1);
  assert.equal(payload.PLATFORM_COVERAGE_BOUNDARY_TESTED_OK, 1);
  assert.deepEqual(payload.requiredPlatformIds, ['mobile-wrapper', 'node', 'web']);
  assert.deepEqual(payload.declaredPlatformIds, ['mobile-wrapper', 'node', 'web']);
  assert.deepEqual(payload.missingCoveragePlatformIds, []);
  assert.deepEqual(payload.missingBoundaryTests, []);
  assert.deepEqual(payload.nonSpecificBoundaryTests, []);
});

test('platform coverage tokens are exposed by freeze rollups, truth-table, ops-summary and doctor', () => {
  const freeze = spawnSync(process.execPath, ['scripts/ops/freeze-rollups-state.mjs', '--mode', 'release', '--json'], {
    encoding: 'utf8',
  });
  assert.equal(freeze.status, 0, `freeze rollups failed:\n${freeze.stdout}\n${freeze.stderr}`);
  const freezeState = JSON.parse(String(freeze.stdout || '{}'));
  assert.equal(freezeState.PLATFORM_COVERAGE_DECLARED_OK, 1);
  assert.equal(freezeState.PLATFORM_COVERAGE_BOUNDARY_TESTED_OK, 1);

  const truth = spawnSync(process.execPath, ['scripts/ops/extract-truth-table.mjs', '--json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
    },
  });
  assert.equal(truth.status, 0, `truth-table failed:\n${truth.stdout}\n${truth.stderr}`);
  const truthTable = JSON.parse(String(truth.stdout || '{}'));
  assert.equal(truthTable.PLATFORM_COVERAGE_DECLARED_OK, 1);
  assert.equal(truthTable.PLATFORM_COVERAGE_BOUNDARY_TESTED_OK, 1);

  const opsSummary = spawnSync(process.execPath, ['scripts/ops/emit-ops-summary.mjs'], {
    encoding: 'utf8',
  });
  assert.ok(
    opsSummary.status === 0 || opsSummary.status === 1,
    `unexpected ops-summary exit:\n${opsSummary.stdout}\n${opsSummary.stderr}`,
  );
  const summaryTokens = parseTokens(opsSummary.stdout);
  assert.equal(summaryTokens.get('OPS_SUMMARY_PLATFORM_COVERAGE_DECLARED_OK'), '1');
  assert.equal(summaryTokens.get('OPS_SUMMARY_PLATFORM_COVERAGE_BOUNDARY_TESTED_OK'), '1');

  const doctor = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DOCTOR_MODE: 'delivery',
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
    },
  });
  assert.ok(
    doctor.status === 0 || doctor.status === 1,
    `unexpected doctor exit:\n${doctor.stdout}\n${doctor.stderr}`,
  );
  const doctorTokens = parseTokens(doctor.stdout);
  assert.equal(doctorTokens.get('PLATFORM_COVERAGE_DECLARED_OK'), '1');
  assert.equal(doctorTokens.get('PLATFORM_COVERAGE_BOUNDARY_TESTED_OK'), '1');
});
