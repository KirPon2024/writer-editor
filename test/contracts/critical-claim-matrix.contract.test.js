const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function parseTokenMap(text) {
  const out = new Map();
  for (const raw of String(text || '').split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    out.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }
  return out;
}

test('critical claim matrix is machine-readable and valid', () => {
  const result = spawnSync(process.execPath, ['scripts/ops/critical-claim-matrix-state.mjs'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `critical-claim-matrix-state failed:\n${result.stdout}\n${result.stderr}`);
  const tokens = parseTokenMap(result.stdout);
  assert.equal(tokens.get('CRITICAL_CLAIM_MATRIX_PRESENT'), '1');
  assert.equal(tokens.get('CRITICAL_CLAIM_MATRIX_OK'), '1');
  assert.ok(Number(tokens.get('CRITICAL_CLAIM_MATRIX_CLAIMS_COUNT')) >= 1);
});
