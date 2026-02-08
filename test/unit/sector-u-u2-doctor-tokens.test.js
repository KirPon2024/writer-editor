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

test('u2 doctor tokens are present and consistent for detect-only defaults', () => {
  const result = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SECTOR_U_FAST_DURATION_MS: '15',
    },
  });

  assert.equal(result.status, 0, `doctor failed:\n${result.stdout}\n${result.stderr}`);
  const tokens = parseTokens(result.stdout);

  assert.equal(tokens.get('SECTOR_U_PHASE'), 'U2');
  assert.equal(tokens.get('U2_MODE'), 'DETECT_ONLY');
  assert.equal(tokens.get('U2_RULE_EXISTS'), '1');
  assert.equal(tokens.get('U2_TESTS_OK'), '1');
  assert.equal(tokens.get('U2_PROOF_OK'), '1');
  assert.equal(tokens.get('U2_TTL_EXPIRED'), '0');
  assert.equal(tokens.get('SECTOR_U_STATUS_OK'), '1');
  assert.equal(tokens.get('SECTOR_U_NO_RUNTIME_PRODUCT_WAIVERS_OK'), '1');
});
