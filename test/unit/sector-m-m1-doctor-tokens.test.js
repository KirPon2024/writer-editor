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

  const phase = tokens.get('SECTOR_M_PHASE') || '';
  const allowedPhases = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'DONE'];
  assert.ok(allowedPhases.includes(phase), `unexpected phase for M1 token checks: ${phase}`);

  assert.equal(tokens.get('M1_CONTRACT_DOCS_PRESENT'), '1');
  assert.equal(tokens.get('M1_CONTRACT_DOCS_COMPLETE'), '1');
  assert.equal(tokens.get('M1_SECURITY_POLICY_OK'), '1');
  assert.equal(tokens.get('M1_LOSS_POLICY_OK'), '1');
  assert.equal(tokens.get('M1_GO_TAG_RULE_OK'), '1');
  assert.equal(tokens.get('M1_CONTRACT_OK'), '1');
  assert.equal(tokens.get('CANON_ENTRYPOINT_SPLIT_BRAIN_DETECTED'), '0');
});
