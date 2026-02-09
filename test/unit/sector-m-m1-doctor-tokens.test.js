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

test('doctor emits M1 contract tokens', () => {
  const result = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SECTOR_U_FAST_DURATION_MS: '10',
    },
  });
  assert.equal(result.status, 0, `doctor failed:\n${result.stdout}\n${result.stderr}`);
  const tokens = parseTokens(result.stdout);

  assert.equal(tokens.get('SECTOR_M_PHASE'), 'M1');
  assert.equal(tokens.get('M1_CONTRACT_DOCS_PRESENT'), '1');
  assert.equal(tokens.get('M1_CONTRACT_DOCS_COMPLETE'), '1');
  assert.equal(tokens.get('M1_SECURITY_POLICY_OK'), '1');
  assert.equal(tokens.get('M1_LOSS_POLICY_OK'), '1');
  assert.equal(tokens.get('M1_GO_TAG_RULE_OK'), '1');
  assert.equal(tokens.get('M1_CONTRACT_OK'), '1');
  assert.equal(tokens.get('CANON_ENTRYPOINT_SPLIT_BRAIN_DETECTED'), '0');
});
