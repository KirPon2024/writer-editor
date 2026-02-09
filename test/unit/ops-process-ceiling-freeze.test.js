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

test('doctor emits process ceiling + ops freeze tokens', () => {
  const result = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      OPS_EXEC_MODE: 'LOCAL_EXEC',
      SECTOR_U_FAST_DURATION_MS: '10',
    },
  });

  assert.equal(result.status, 0, `doctor failed:\n${result.stdout}\n${result.stderr}`);
  const tokens = parseTokens(result.stdout);

  assert.equal(tokens.get('OPS_FREEZE_ACTIVE'), '1');
  assert.equal(tokens.get('OPS_BLOCKING_GATES_MAX'), '4');
  assert.equal(tokens.get('OPS_BLOCKING_GATES_OK'), '1');
  assert.equal(tokens.get('OPS_SSOT_SINGLE_SOURCE_OK'), '1');
  assert.equal(tokens.get('OPS_RATIO_RULE_DOC_PRESENT_OK'), '1');
});
