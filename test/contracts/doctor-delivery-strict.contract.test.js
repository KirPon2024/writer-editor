const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

test('doctor delivery strict: only DOCTOR_OK or DOCTOR_FAIL, no WARN/INFO/PLACEHOLDER', () => {
  const result = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DOCTOR_MODE: 'delivery',
    },
  });

  assert.equal(result.status, 0, `doctor delivery failed:\n${result.stdout}\n${result.stderr}`);
  const stdout = String(result.stdout || '');
  assert.equal(stdout.includes('DOCTOR_WARN'), false, `unexpected DOCTOR_WARN:\n${stdout}`);
  assert.equal(stdout.includes('DOCTOR_INFO'), false, `unexpected DOCTOR_INFO:\n${stdout}`);
  assert.equal(stdout.includes('PLACEHOLDER'), false, `unexpected PLACEHOLDER token:\n${stdout}`);
  assert.equal(stdout.includes('INFO'), false, `unexpected INFO token:\n${stdout}`);
  assert.equal(stdout.includes('DOCTOR_OK'), true, `missing DOCTOR_OK token:\n${stdout}`);
  assert.equal(stdout.includes('DOCTOR_FAIL'), false, `unexpected DOCTOR_FAIL token:\n${stdout}`);
});
