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

test('doctor emits sector-m stability tokens as PASS', () => {
  const result = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SECTOR_U_FAST_DURATION_MS: '10',
    },
  });

  assert.equal(result.status, 0, `doctor failed:\n${result.stdout}\n${result.stderr}`);
  const tokens = parseTokens(result.stdout);
  assert.equal(tokens.get('SECTOR_M_TESTS_PHASE_AGNOSTIC_OK'), '1');
  assert.equal(tokens.get('SECTOR_M_SCOPE_SSOT_OK'), '1');
  assert.equal(tokens.get('DELIVERY_FALLBACK_RUNBOOK_OK'), '1');
  assert.equal(tokens.get('NETWORK_GATE_READY'), '1');
  assert.equal(tokens.get('CANON_WORKTREE_POLICY_OK'), '1');
  assert.equal(tokens.get('CANON_WORKTREE_SPLIT_BRAIN_DETECTED'), '0');
  assert.equal(tokens.get('SECTOR_M_FAST_FULL_DIVERGENCE_OK'), '1');
});
