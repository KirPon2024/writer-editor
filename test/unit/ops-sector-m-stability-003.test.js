const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function parseTokens(stdout) {
  const tokens = new Map();
  for (const raw of String(stdout || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const normalized = line.startsWith('DOCTOR_TOKEN ')
      ? line.slice('DOCTOR_TOKEN '.length).trim()
      : line;
    const idx = normalized.indexOf('=');
    if (idx <= 0) continue;
    tokens.set(normalized.slice(0, idx), normalized.slice(idx + 1));
  }
  return tokens;
}

test('doctor emits sector-m stability tokens as PASS in local mode and network gate stays non-blocking', () => {
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
  assert.equal(tokens.get('SECTOR_M_TESTS_PHASE_AGNOSTIC_OK'), '1');
  assert.equal(tokens.get('SECTOR_M_SCOPE_SSOT_OK'), '1');
  assert.equal(tokens.get('DELIVERY_FALLBACK_RUNBOOK_OK'), '1');
  assert.equal(tokens.get('NETWORK_GATE_READY'), '0');
  assert.equal(tokens.get('CANON_WORKTREE_POLICY_OK'), '1');
  assert.equal(tokens.get('CANON_WORKTREE_SPLIT_BRAIN_DETECTED'), '0');
  assert.equal(tokens.get('SECTOR_M_FAST_FULL_DIVERGENCE_OK'), '1');
});

test('doctor emits NETWORK_GATE_READY=1 only when delivery gate passes', () => {
  const result = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      OPS_EXEC_MODE: 'DELIVERY_EXEC',
      NETWORK_GATE_FIXTURE_JSON: JSON.stringify({
        originUrl: 'https://example.invalid/org/repo.git',
        originHost: 'example.invalid',
        dns: { ok: 1, detail: 'fixture_dns_ok' },
        git: { ok: 1, detail: 'fixture_git_ok' },
        http: { ok: 0, detail: 'fixture_http_fail' },
      }),
      SECTOR_U_FAST_DURATION_MS: '10',
    },
  });

  assert.ok(result.status === 0 || result.status === 1, `unexpected doctor exit:\n${result.stdout}\n${result.stderr}`);
  const tokens = parseTokens(result.stdout);
  assert.equal(tokens.get('NETWORK_GATE_READY'), '1');
});
