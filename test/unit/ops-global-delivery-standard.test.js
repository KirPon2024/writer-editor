const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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

function runNode(scriptPath, args, env = {}) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return {
    ...result,
    tokens: parseTokens(result.stdout),
  };
}

test('network gate blocks only on git check, http is diagnostic', () => {
  const okResult = runNode(
    'scripts/ops/network-gate.mjs',
    ['--mode', 'delivery'],
    {
      NETWORK_GATE_FIXTURE_JSON: JSON.stringify({
        originUrl: 'https://example.invalid/org/repo.git',
        originHost: 'example.invalid',
        git: { ok: 1, detail: 'fixture_git_ok' },
        http: { ok: 0, detail: 'fixture_http_fail' },
      }),
    },
  );
  assert.equal(okResult.status, 0, okResult.stderr);
  assert.equal(okResult.tokens.get('NETWORK_GATE_GIT_OK'), '1');
  assert.equal(okResult.tokens.get('NETWORK_GATE_HTTP_OK'), '0');
  assert.equal(okResult.tokens.get('NETWORK_GATE_OK'), '1');

  const failResult = runNode(
    'scripts/ops/network-gate.mjs',
    ['--mode', 'delivery'],
    {
      NETWORK_GATE_FIXTURE_JSON: JSON.stringify({
        originUrl: 'https://example.invalid/org/repo.git',
        originHost: 'example.invalid',
        git: { ok: 0, detail: 'fixture_git_fail' },
        http: { ok: 1, detail: 'fixture_http_ok' },
      }),
    },
  );
  assert.notEqual(failResult.status, 0);
  assert.equal(failResult.tokens.get('NETWORK_GATE_OK'), '0');
  assert.equal(failResult.tokens.get('FAIL_REASON'), 'NETWORK_GATE_FAIL');
});

test('wip check handles exception artifact only in delivery mode', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wip-check-'));
  const fixturePath = path.join(tmpDir, 'fixture.json');
  fs.writeFileSync(
    fixturePath,
    JSON.stringify({
      openPullRequests: [
        { number: 101, comments: [] },
        { number: 102, comments: [{ body: 'GO:EMERGENCY_FIX_PR_APPROVED' }] },
      ],
    }),
    'utf8',
  );

  const deliveryOk = runNode(
    'scripts/ops/wip-check.mjs',
    ['--mode', 'DELIVERY_EXEC'],
    { WIP_CHECK_FIXTURE_PATH: fixturePath },
  );
  assert.equal(deliveryOk.status, 0, deliveryOk.stderr);
  assert.equal(deliveryOk.tokens.get('WIP_LIMIT_OK'), '1');
  assert.equal(deliveryOk.tokens.get('ACTIVE_DELIVERY_COUNT'), '2');
  assert.equal(deliveryOk.tokens.get('WIP_EXCEPTION_OK'), '1');

  const localMode = runNode(
    'scripts/ops/wip-check.mjs',
    ['--mode', 'LOCAL_EXEC'],
    { WIP_CHECK_FIXTURE_PATH: fixturePath },
  );
  assert.equal(localMode.status, 0, localMode.stderr);
  assert.equal(localMode.tokens.get('WIP_EXCEPTION_OK'), 'N_A');
});

test('post-merge verify tracks cleanup streak and degrades after threshold', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'post-merge-verify-'));
  const stateFile = path.join(tmpDir, 'streak.json');
  const fixture = JSON.stringify({
    fetchOk: 1,
    worktreeAddOk: 1,
    doctorOk: 1,
    cleanupOk: 0,
  });

  for (let i = 0; i < 2; i += 1) {
    const result = runNode(
      'scripts/ops/post-merge-verify.mjs',
      ['--task', 'OPS-M5-RELIABILITY', '--state-file', stateFile],
      { POST_MERGE_VERIFY_FIXTURE_JSON: fixture },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.tokens.get('POST_MERGE_VERIFY_OK'), '1');
    assert.equal(result.tokens.get('POST_MERGE_VERIFY_CLEANUP_OK'), '0');
  }

  const third = runNode(
    'scripts/ops/post-merge-verify.mjs',
    ['--task', 'OPS-M5-RELIABILITY', '--state-file', stateFile],
    { POST_MERGE_VERIFY_FIXTURE_JSON: fixture },
  );
  assert.notEqual(third.status, 0);
  assert.equal(third.tokens.get('POST_MERGE_VERIFY_OK'), '0');
  assert.equal(third.tokens.get('FAIL_REASON'), 'OPS_ENV_DEGRADED');
});

test('required checks sync updates local contract in delivery mode via fixture', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'required-checks-sync-'));
  const fixturePath = path.join(tmpDir, 'required-checks.json');
  const contractPath = path.join(tmpDir, 'contract.json');
  fs.writeFileSync(
    fixturePath,
    JSON.stringify({ requiredChecks: ['oss-policy', 'unit-tests'] }),
    'utf8',
  );

  const result = runNode(
    'scripts/ops/required-checks-sync.mjs',
    ['--mode', 'DELIVERY_EXEC'],
    {
      REQUIRED_CHECKS_SYNC_FIXTURE_PATH: fixturePath,
      REQUIRED_CHECKS_CONTRACT_PATH: contractPath,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.tokens.get('REQUIRED_CHECKS_SYNC_OK'), '1');
  assert.equal(result.tokens.get('REQUIRED_CHECKS_SOURCE'), 'fixture');
  assert.equal(result.tokens.get('REQUIRED_CHECKS_STALE'), '0');

  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  assert.equal(contract.schemaVersion, 'required-checks.v1');
  assert.deepEqual(contract.requiredChecks, ['oss-policy', 'unit-tests']);
});

test('doctor exposes global ops standard tokens', () => {
  const result = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: { ...process.env, SECTOR_U_FAST_DURATION_MS: '10' },
  });
  assert.equal(result.status, 0, `doctor failed:\n${result.stdout}\n${result.stderr}`);
  const tokens = parseTokens(result.stdout);
  assert.equal(tokens.get('OPS_STANDARD_GLOBAL_OK'), '1');
  assert.equal(tokens.get('REQUIRED_CHECKS_SYNC_OK'), '1');
  assert.ok(Number(tokens.get('POST_MERGE_VERIFY_CLEANUP_FAIL_STREAK')) >= 0);
});
