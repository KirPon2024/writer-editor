const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function parseTokens(stdout) {
  const out = new Map();
  for (const rawLine of String(stdout || '').split(/\r?\n/)) {
    const idx = rawLine.indexOf('=');
    if (idx <= 0) continue;
    out.set(rawLine.slice(0, idx), rawLine.slice(idx + 1));
  }
  return out;
}

function phaseAtLeastM7(phase) {
  if (phase === 'DONE') return true;
  const match = /^M(\d+)$/u.exec(String(phase || ''));
  if (!match) return false;
  return Number(match[1]) >= 7;
}

test('M7 doctor tokens stay green once phase is M7 or above', () => {
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
  assert.equal(phaseAtLeastM7(phase), true, `phase must be M7+ for M7 token checks: ${phase}`);

  assert.equal(tokens.get('M7_PHASE_READY_OK'), '1');
  assert.equal(tokens.get('M7_FLOW_VIEW_OK'), '1');
  assert.equal(tokens.get('M7_FLOW_EDIT_OK'), '1');
  assert.equal(tokens.get('M7_FLOW_UX_OK'), '1');
  assert.equal(tokens.get('M7_CORE_OK'), '1');
  assert.equal(tokens.get('M7_NEXT_OK'), '1');
  assert.equal(tokens.get('OPS_FREEZE_ACTIVE'), '1');
  assert.equal(tokens.get('CANON_WORKTREE_SPLIT_BRAIN_DETECTED'), '0');
});
