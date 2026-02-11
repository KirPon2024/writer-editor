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

test('delivery: exit 0 never prints DOCTOR_WARN in green run', () => {
  const result = runDoctorDelivery();
  assert.equal(result.status, 0, `doctor failed:\n${result.stdout}\n${result.stderr}`);

  const stdout = String(result.stdout || '');
  assert.equal(stdout.includes('DOCTOR_WARN'), false, `unexpected DOCTOR_WARN token:\n${stdout}`);
  assert.equal(stdout.includes('DOCTOR_INFO'), false, `unexpected DOCTOR_INFO token:\n${stdout}`);
  assert.equal(stdout.includes('DOCTOR_OK'), true, `missing DOCTOR_OK token:\n${stdout}`);
});

test('delivery: strict output does not leak INFO/PLACEHOLDER diagnostics', () => {
  const result = runDoctorDelivery({
    SECTOR_U_FAST_RESULT_PATH: 'test/fixtures/sector-u/does-not-exist-result.json',
  });
  assert.equal(result.status, 0, `doctor should stay strict pass:\n${result.stdout}\n${result.stderr}`);

  const stdout = String(result.stdout || '');
  assert.equal(stdout.includes('DOCTOR_WARN'), false, `unexpected DOCTOR_WARN token:\n${stdout}`);
  assert.equal(stdout.includes('DOCTOR_INFO'), false, `unexpected DOCTOR_INFO token:\n${stdout}`);
  assert.equal(stdout.includes('INFO'), false, `unexpected INFO token:\n${stdout}`);
  assert.equal(stdout.includes('PLACEHOLDER'), false, `unexpected PLACEHOLDER token:\n${stdout}`);
});
