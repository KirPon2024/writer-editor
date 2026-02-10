const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

test('doctor emits exactly one canonical SECTOR_M_PHASE token', () => {
  const result = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      CHECKS_BASELINE_VERSION: 'v1.3',
      EFFECTIVE_MODE: 'STRICT',
      SECTOR_U_FAST_DURATION_MS: '10',
    },
  });

  assert.equal(result.status, 0, `doctor failed:\n${result.stdout}\n${result.stderr}`);
  const lines = String(result.stdout || '').split(/\r?\n/);
  const phaseLines = lines.filter((line) => line.startsWith('SECTOR_M_PHASE='));
  assert.equal(phaseLines.length, 1, `expected exactly one SECTOR_M_PHASE token, got ${phaseLines.length}`);
});
