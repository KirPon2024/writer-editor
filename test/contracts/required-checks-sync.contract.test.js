const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function parseTokens(stdout) {
  const tokens = new Map();
  for (const lineRaw of String(stdout || '').split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    tokens.set(line.slice(0, idx), line.slice(idx + 1));
  }
  return tokens;
}

test('required checks state: canonical sync is strict-ready', () => {
  const result = spawnSync(process.execPath, ['scripts/ops/required-checks-state.mjs', '--profile', 'ops'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `required-checks-state failed:\n${result.stdout}\n${result.stderr}`);
  const tokens = parseTokens(result.stdout);
  assert.equal(tokens.get('REQUIRED_CHECKS_CONTRACT_PRESENT_OK'), '1');
  assert.equal(tokens.get('REQUIRED_CHECKS_SYNC_OK'), '1');
  assert.equal(tokens.get('REQUIRED_CHECKS_STALE'), '0');
  assert.equal(tokens.get('REQUIRED_CHECKS_SOURCE'), 'canonical');
  assert.equal(tokens.get('REQUIRED_CHECKS_PROFILE'), 'ops');
  assert.ok(Number(tokens.get('REQUIRED_CHECKS_COUNT')) >= 1);
});
