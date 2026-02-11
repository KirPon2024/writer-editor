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
  assert.equal(/DOCTOR_(OK|INFO)/.test(stdout), true, `missing doctor pass/info token:\n${stdout}`);
});

test('delivery: warning-level pass prints DOCTOR_INFO (not DOCTOR_WARN)', () => {
  const result = runDoctorDelivery({
    SECTOR_U_FAST_RESULT_PATH: 'test/fixtures/sector-u/does-not-exist-result.json',
  });
  assert.equal(result.status, 0, `doctor should stay pass/info:\n${result.stdout}\n${result.stderr}`);

  const stdout = String(result.stdout || '');
  assert.equal(stdout.includes('DOCTOR_WARN'), false, `unexpected DOCTOR_WARN token:\n${stdout}`);
  assert.equal(stdout.includes('DOCTOR_INFO'), true, `expected DOCTOR_INFO token:\n${stdout}`);
});
