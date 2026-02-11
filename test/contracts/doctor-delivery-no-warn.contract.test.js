const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function runDoctorDelivery(extraEnv = {}) {
  return spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DOCTOR_MODE: 'delivery',
      ...extraEnv,
    },
  });
}

function parseTokens(stdout) {
  const map = new Map();
  for (const raw of String(stdout || '').split(/\r?\n/)) {
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

function assertDeliveryPrefixWhitelist(stdout) {
  const lines = String(stdout || '').split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const isStatus = line === 'DOCTOR_OK' || line === 'DOCTOR_FAIL';
    const isToken = /^DOCTOR_TOKEN [A-Z0-9_]+=.*$/u.test(line);
    assert.equal(isStatus || isToken, true, `non-canonical delivery prefix line: ${line}`);
  }
}

test('delivery: exit 0 never prints DOCTOR_WARN in green run', () => {
  const result = runDoctorDelivery();
  assert.equal(result.status, 0, `doctor failed:\n${result.stdout}\n${result.stderr}`);

  const stdout = String(result.stdout || '');
  const tokens = parseTokens(stdout);
  assert.equal(stdout.includes('DOCTOR_WARN'), false, `unexpected DOCTOR_WARN token:\n${stdout}`);
  assert.equal(stdout.includes('DOCTOR_INFO'), false, `unexpected DOCTOR_INFO token:\n${stdout}`);
  assert.equal(stdout.includes('DOCTOR_OK'), true, `missing DOCTOR_OK token:\n${stdout}`);
  assert.equal(tokens.get('PLACEHOLDER_INVARIANTS_COUNT'), '0');
  assert.equal(tokens.get('NO_SOURCE_INVARIANTS_COUNT'), '0');
  assertDeliveryPrefixWhitelist(stdout);
});

test('delivery: strict output includes explicit zero-debt runtime tokens', () => {
  const result = runDoctorDelivery({
    SECTOR_U_FAST_RESULT_PATH: 'test/fixtures/sector-u/does-not-exist-result.json',
  });
  assert.equal(result.status, 0, `doctor should stay strict pass:\n${result.stdout}\n${result.stderr}`);

  const stdout = String(result.stdout || '');
  const tokens = parseTokens(stdout);
  assert.equal(stdout.includes('DOCTOR_WARN'), false, `unexpected DOCTOR_WARN token:\n${stdout}`);
  assert.equal(stdout.includes('DOCTOR_INFO'), false, `unexpected DOCTOR_INFO token:\n${stdout}`);
  assert.equal(tokens.get('EFFECTIVE_MODE'), 'STRICT');
  assert.equal(tokens.get('PLACEHOLDER_INVARIANTS_COUNT'), '0');
  assert.equal(tokens.get('NO_SOURCE_INVARIANTS_COUNT'), '0');
  assert.equal(tokens.get('CONTOUR_C_EXIT_IMPLEMENTED_P0_OK'), '1');
  assert.equal(tokens.get('RUNTIME_INVARIANT_COVERAGE_OK'), '1');
  assertDeliveryPrefixWhitelist(stdout);
});
