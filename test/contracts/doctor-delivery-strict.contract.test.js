const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

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

test('doctor delivery strict: deterministic PASS tokens without DOCTOR_WARN/DOCTOR_INFO', () => {
  const result = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DOCTOR_MODE: 'delivery',
    },
  });

  assert.equal(result.status, 0, `doctor delivery failed:\n${result.stdout}\n${result.stderr}`);
  const stdout = String(result.stdout || '');
  const tokens = parseTokens(stdout);
  assert.equal(stdout.includes('DOCTOR_WARN'), false, `unexpected DOCTOR_WARN:\n${stdout}`);
  assert.equal(stdout.includes('DOCTOR_INFO'), false, `unexpected DOCTOR_INFO:\n${stdout}`);
  assert.equal(stdout.includes('DOCTOR_OK'), true, `missing DOCTOR_OK token:\n${stdout}`);
  assert.equal(stdout.includes('DOCTOR_FAIL'), false, `unexpected DOCTOR_FAIL token:\n${stdout}`);
  assert.equal(tokens.get('EFFECTIVE_MODE'), 'STRICT');
  assert.equal(tokens.get('PLACEHOLDER_INVARIANTS_COUNT'), '0');
  assert.equal(tokens.get('NO_SOURCE_INVARIANTS_COUNT'), '0');
  assert.equal(tokens.get('CONTOUR_C_EXIT_IMPLEMENTED_P0_OK'), '1');
  assert.equal(tokens.get('RUNTIME_INVARIANT_COVERAGE_OK'), '1');
});
