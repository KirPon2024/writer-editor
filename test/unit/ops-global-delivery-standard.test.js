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

test('network gate blocks on git reachability and keeps http diagnostic non-blocking', () => {
  const gateScript = fs.readFileSync('scripts/ops/network-gate.mjs', 'utf8');
  assert.match(gateScript, /['"]get-url['"]/u, 'origin URL must be discovered from git remote');
  assert.match(gateScript, /['"]origin['"]/u, 'origin URL must be discovered from git remote');
  assert.doesNotMatch(gateScript, /originHost\s*=\s*['"]github\.com['"]/u, 'origin host must not be hardcoded');

  const okResult = runNode(
    'scripts/ops/network-gate.mjs',
    ['--mode', 'delivery'],
    {
      NETWORK_GATE_FIXTURE_JSON: JSON.stringify({
        originUrl: 'https://example.invalid/org/repo.git',
        originHost: 'example.invalid',
        dns: { ok: 1, detail: 'fixture_dns_ok' },
        git: { ok: 1, detail: 'fixture_git_ok' },
        http: { ok: 0, detail: 'fixture_http_fail' },
      }),
    },
  );
  assert.equal(okResult.status, 0, okResult.stderr);
  assert.equal(okResult.tokens.get('NETWORK_GATE_DNS_OK'), '1');
  assert.equal(okResult.tokens.get('NETWORK_GATE_GIT_OK'), '1');
  assert.equal(okResult.tokens.get('NETWORK_GATE_HTTP_OK'), '0');
  assert.equal(okResult.tokens.get('NETWORK_GATE_OK'), '1');
  assert.equal(okResult.tokens.get('NETWORK_GATE_FAIL_REASON'), '');

  const failResult = runNode(
    'scripts/ops/network-gate.mjs',
    ['--mode', 'delivery'],
    {
      NETWORK_GATE_FIXTURE_JSON: JSON.stringify({
        originUrl: 'https://example.invalid/org/repo.git',
        originHost: 'example.invalid',
        dns: { ok: 0, detail: 'fixture_dns_fail' },
        git: { ok: 0, detail: 'fatal: unable to access https://example.invalid: Could not resolve host: example.invalid' },
        http: { ok: 1, detail: 'fixture_http_ok' },
      }),
    },
  );
  assert.notEqual(failResult.status, 0);
  assert.equal(failResult.tokens.get('NETWORK_GATE_OK'), '0');
  assert.equal(failResult.tokens.get('NETWORK_GATE_DNS_OK'), '0');
  assert.equal(failResult.tokens.get('NETWORK_GATE_FAIL_REASON'), 'NETWORK_GATE_FAIL_DNS');
  assert.equal(failResult.tokens.get('FAIL_REASON'), 'NETWORK_GATE_FAIL_DNS');
});

test('network gate derives origin host from multiple remote URL formats', () => {
  const cases = [
    { url: 'https://github.com/org/repo.git', expectedHost: 'github.com' },
    { url: 'ssh://git@github.com/org/repo.git', expectedHost: 'github.com' },
    { url: 'git@github.com:org/repo.git', expectedHost: 'github.com' },
  ];

  for (const sample of cases) {
    const result = runNode(
      'scripts/ops/network-gate.mjs',
      ['--mode', 'local'],
      {
        NETWORK_GATE_FIXTURE_JSON: JSON.stringify({
          originUrl: sample.url,
          dns: { ok: 1, detail: 'fixture_dns_ok' },
          git: { ok: 1, detail: 'fixture_git_ok' },
          http: { ok: 1, detail: 'fixture_http_ok' },
        }),
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.tokens.get('NETWORK_GATE_ORIGIN_HOST'), sample.expectedHost);
  }
});

test('network gate local mode never exits non-zero even when diagnostics fail', () => {
  const result = runNode(
    'scripts/ops/network-gate.mjs',
    ['--mode', 'local'],
    {
      NETWORK_GATE_FIXTURE_JSON: JSON.stringify({
        originUrl: 'https://example.invalid/org/repo.git',
        dns: { ok: 0, detail: 'fixture_dns_fail' },
        git: { ok: 0, detail: 'fatal: unable to access https://example.invalid: Could not resolve host: example.invalid' },
        http: { ok: 0, detail: 'fixture_http_fail' },
      }),
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.tokens.get('NETWORK_GATE_OK'), '0');
  assert.equal(result.tokens.get('NETWORK_GATE_FAIL_REASON'), 'NETWORK_GATE_FAIL_DNS');
});

test('network gate supports json mode output', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/ops/network-gate.mjs', '--mode', 'delivery', '--json'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        NETWORK_GATE_FIXTURE_JSON: JSON.stringify({
          originUrl: 'https://example.invalid/org/repo.git',
          dns: { ok: 1, detail: 'fixture_dns_ok' },
          git: { ok: 1, detail: 'fixture_git_ok' },
          http: { ok: 0, detail: 'fixture_http_fail' },
        }),
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(String(result.stdout || '').trim());
  assert.equal(payload.NETWORK_GATE_OK, 1);
  assert.equal(payload.NETWORK_GATE_GIT_OK, 1);
  assert.equal(payload.NETWORK_GATE_MODE, 'delivery');
});

test('wip check supports exception artifacts only for delivery mode', () => {
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

test('post-merge verify streak is runtime-only and triggers degraded env threshold', () => {
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

  const runtimeStatePath = '/tmp/writer-editor-ops-state/post_merge_cleanup_streak.json';
  const scriptText = fs.readFileSync('scripts/ops/post-merge-verify.mjs', 'utf8');
  assert.match(scriptText, /\/tmp\/writer-editor-ops-state\/post_merge_cleanup_streak\.json/);
  fs.rmSync(runtimeStatePath, { force: true });
  assert.equal(fs.existsSync(runtimeStatePath), false);

  const defaultStateRun = runNode(
    'scripts/ops/post-merge-verify.mjs',
    ['--task', 'OPS-M5-RELIABILITY'],
    { POST_MERGE_VERIFY_FIXTURE_JSON: JSON.stringify({ fetchOk: 1, worktreeAddOk: 1, doctorOk: 1, cleanupOk: 1 }) },
  );
  assert.equal(defaultStateRun.status, 0, defaultStateRun.stderr);
  assert.equal(fs.existsSync(runtimeStatePath), true, 'runtime cleanup state must be created under /tmp');
});

test('required checks sync keeps local mode unsynced and syncs in delivery mode', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'required-checks-sync-'));
  const fixturePath = path.join(tmpDir, 'required-checks.json');
  const contractPath = path.join(tmpDir, 'contract.json');
  fs.writeFileSync(
    fixturePath,
    JSON.stringify({ requiredChecks: ['oss-policy', 'test:ops'] }),
    'utf8',
  );

  const local = runNode(
    'scripts/ops/required-checks-sync.mjs',
    ['--mode', 'LOCAL_EXEC', '--profile', 'ops'],
    { REQUIRED_CHECKS_CONTRACT_PATH: contractPath },
  );
  assert.equal(local.status, 0, local.stderr);
  assert.equal(local.tokens.get('REQUIRED_CHECKS_CONTRACT_PRESENT_OK'), '1');
  assert.equal(local.tokens.get('REQUIRED_CHECKS_SYNC_OK'), '0');
  assert.equal(local.tokens.get('REQUIRED_CHECKS_SOURCE'), 'local');
  assert.equal(local.tokens.get('REQUIRED_CHECKS_PROFILE'), 'ops');

  const delivery = runNode(
    'scripts/ops/required-checks-sync.mjs',
    ['--mode', 'DELIVERY_EXEC', '--profile', 'ops'],
    {
      REQUIRED_CHECKS_SYNC_FIXTURE_PATH: fixturePath,
      REQUIRED_CHECKS_CONTRACT_PATH: contractPath,
    },
  );
  assert.equal(delivery.status, 0, delivery.stderr);
  assert.equal(delivery.tokens.get('REQUIRED_CHECKS_CONTRACT_PRESENT_OK'), '1');
  assert.equal(delivery.tokens.get('REQUIRED_CHECKS_SYNC_OK'), '1');
  assert.equal(delivery.tokens.get('REQUIRED_CHECKS_SOURCE'), 'api');
  assert.equal(delivery.tokens.get('REQUIRED_CHECKS_STALE'), '0');
  assert.equal(delivery.tokens.get('REQUIRED_CHECKS_PROFILE'), 'ops');

  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  assert.equal(contract.schemaVersion, 1);
  assert.equal(contract.lastSyncSource, 'api');
  assert.deepEqual(contract.profiles.ops.required, ['oss-policy', 'test:ops']);
});

test('doctor exposes v0.1.3 ops tokens truthfully in local mode', () => {
  const result = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: { ...process.env, OPS_EXEC_MODE: 'LOCAL_EXEC', SECTOR_U_FAST_DURATION_MS: '10' },
  });
  assert.equal(result.status, 0, `doctor failed:\n${result.stdout}\n${result.stderr}`);
  const tokens = parseTokens(result.stdout);
  assert.equal(tokens.get('OPS_STANDARD_GLOBAL_OK'), '1');
  assert.equal(tokens.get('REQUIRED_CHECKS_CONTRACT_PRESENT_OK'), '1');
  assert.equal(tokens.get('REQUIRED_CHECKS_SYNC_OK'), '1');
  assert.equal(tokens.get('REQUIRED_CHECKS_STALE'), '0');
  assert.equal(tokens.get('REQUIRED_CHECKS_SOURCE'), 'canonical');
  assert.ok(Number(tokens.get('POST_MERGE_VERIFY_CLEANUP_FAIL_STREAK')) >= 0);
});
