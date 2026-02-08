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

test('u4 doctor tokens are present and proof is green', () => {
  const result = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SECTOR_U_STATUS_PATH: 'docs/OPS/STATUS/SECTOR_U.json',
      SECTOR_U_FAST_DURATION_MS: '20',
    },
  });

  assert.equal(result.status, 0, `doctor failed:\n${result.stdout}\n${result.stderr}`);
  const tokens = parseTokens(result.stdout);

  const allowedPhases = new Set(['U4', 'U5', 'U6', 'U7', 'U8', 'DONE']);
  assert.equal(allowedPhases.has(tokens.get('SECTOR_U_PHASE')), true);
  assert.equal(tokens.get('U4_TRANSITIONS_SOT_EXISTS'), '1');
  assert.equal(tokens.get('U4_TRANSITIONS_GUARD_OK'), '1');
  assert.equal(tokens.get('U4_NO_SIDE_EFFECTS_RULE_EXISTS'), '1');
  assert.equal(tokens.get('U4_TESTS_OK'), '1');
  assert.equal(tokens.get('U4_PROOF_OK'), '1');
  assert.equal(tokens.get('SECTOR_U_STATUS_OK'), '1');
});
