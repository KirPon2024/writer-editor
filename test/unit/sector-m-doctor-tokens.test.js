const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function parseTokens(stdout) {
  const tokens = new Map();
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    tokens.set(line.slice(0, idx), line.slice(idx + 1));
  }
  return tokens;
}

test('doctor emits M0 sector tokens', () => {
  const result = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SECTOR_U_FAST_DURATION_MS: '10',
    },
  });

  assert.equal(result.status, 0, `doctor failed:\n${result.stdout}\n${result.stderr}`);
  const tokens = parseTokens(result.stdout);

  assert.equal(tokens.get('SECTOR_M_STATUS_OK'), '1');
  assert.equal(tokens.get('SECTOR_M_PHASE'), 'M0');
  assert.equal(tokens.get('SECTOR_M_GO_TAG'), '');
  assert.equal(tokens.get('M0_RUNNER_EXISTS'), '1');
  assert.equal(tokens.get('M0_TESTS_OK'), '1');
  assert.equal(tokens.get('M0_PROOF_OK'), '1');
});
