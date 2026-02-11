const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function parseTokens(stdout) {
  const tokens = new Map();
  for (const raw of String(stdout || '').split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    tokens.set(line.slice(0, idx), line.slice(idx + 1));
  }
  return tokens;
}

test('freeze rollups emit adapters boundary baseline tokens', () => {
  const result = spawnSync(process.execPath, ['scripts/ops/freeze-rollups-state.mjs', '--mode', 'release'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  const tokens = parseTokens(result.stdout);
  assert.equal(tokens.get('ADAPTERS_DECLARED_OK'), '1');
  assert.equal(tokens.get('ADAPTERS_BOUNDARY_TESTED_OK'), '1');
  assert.equal(tokens.get('ADAPTERS_PARITY_OK'), '1');
  assert.equal(tokens.get('ADAPTERS_ENFORCED_OK'), '1');
});
