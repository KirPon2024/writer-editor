const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function parseTokens(stdout) {
  const tokens = new Map();
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx);
    const value = line.slice(idx + 1);
    tokens.set(key, value);
  }
  return tokens;
}

test('doctor emits required sector-u and next-sector tokens', () => {
  const result = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SECTOR_U_FAST_DURATION_MS: '10',
    },
  });

  assert.equal(result.status, 0, `Unexpected fail: ${result.stdout}\n${result.stderr}`);
  const tokens = parseTokens(result.stdout);

  for (const key of [
    'SECTOR_U_STATUS_OK',
    'SECTOR_U_PHASE',
    'SECTOR_U_BASELINE_SHA',
    'SECTOR_U_GO_TAG',
    'SECTOR_U_NO_RUNTIME_PRODUCT_WAIVERS_OK',
    'SECTOR_U_FAST_DURATION_MS',
    'SECTOR_U_FAST_DURATION_OK',
    'NEXT_SECTOR_ID',
    'NEXT_SECTOR_GO_TAG',
    'NEXT_SECTOR_STATUS_OK',
    'NEXT_SECTOR_READY',
  ]) {
    assert.equal(tokens.has(key), true, `missing token: ${key}`);
  }

  assert.equal(tokens.get('NEXT_SECTOR_ID'), 'SECTOR U');
  assert.equal(tokens.get('NEXT_SECTOR_GO_TAG'), 'GO:NEXT_SECTOR_START');
  assert.equal(tokens.get('NEXT_SECTOR_STATUS_OK'), '1');
  assert.equal(tokens.get('NEXT_SECTOR_READY'), '1');
  assert.equal(tokens.get('SECTOR_U_STATUS_OK'), '1');
  assert.equal(tokens.get('SECTOR_U_PHASE'), 'U0');
  assert.equal(tokens.get('SECTOR_U_NO_RUNTIME_PRODUCT_WAIVERS_OK'), '1');
  assert.equal(tokens.get('SECTOR_U_FAST_DURATION_OK'), '1');
});
