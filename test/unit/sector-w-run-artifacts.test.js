const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'sector-w-run.mjs');
const GUARD = path.join(ROOT, 'scripts', 'guards', 'sector-w-web-smoke-no-electron.mjs');

function runSectorWFast(artifactsRoot) {
  return spawnSync(
    process.execPath,
    [SCRIPT, '--pack', 'fast'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        SECTOR_W_ARTIFACTS_ROOT: artifactsRoot,
        SECTOR_W_RUN_SKIP_NPM_TEST: '1',
      },
    },
  );
}

test('sector-w-run writes canonical v1 artifact schema to latest result path', (t) => {
  if (!fs.existsSync(GUARD)) {
    t.skip('sector-w smoke guard script is not present in this baseline');
    return;
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sector-w-run-'));
  const artifactsRoot = path.join(tmpRoot, 'artifacts', 'sector-w-run');
  const latestResultPath = path.join(artifactsRoot, 'latest', 'result.json');

  const result = runSectorWFast(artifactsRoot);
  assert.equal(result.status, 0, `Unexpected fail: ${result.stdout}\n${result.stderr}`);
  assert.equal(fs.existsSync(latestResultPath), true, 'latest result.json must exist');

  const parsed = JSON.parse(fs.readFileSync(latestResultPath, 'utf8'));
  assert.equal(parsed.schemaVersion, 'sector-w-run.v1');
  assert.equal(typeof parsed.runId, 'string');
  assert.ok(parsed.runId.length > 0);
  assert.equal(parsed.pack, 'fast');
  assert.equal(typeof parsed.startedAt, 'string');
  assert.equal(typeof parsed.finishedAt, 'string');
  assert.ok(parsed.ok === 0 || parsed.ok === 1);
  assert.ok(Array.isArray(parsed.checks));
  assert.ok(parsed.checks.length >= 1);

  for (const check of parsed.checks) {
    assert.equal(typeof check.checkId, 'string');
    assert.ok(check.checkId.length > 0);
    assert.equal(typeof check.cmd, 'string');
    assert.ok(check.cmd.length > 0);
    assert.ok(check.ok === 0 || check.ok === 1);
    assert.equal(typeof check.outPath, 'string');
    assert.ok(check.outPath.length > 0);
    assert.equal(fs.existsSync(check.outPath), true, `check outPath missing: ${check.outPath}`);
  }

  assert.equal(typeof parsed.doctorTokens, 'object');
  assert.equal(typeof parsed.doctorTokens.W0_WEB_SMOKE_NO_ELECTRON_RULE_EXISTS, 'string');
  assert.equal(typeof parsed.doctorTokens.W0_WEB_SMOKE_NO_ELECTRON_TESTS_OK, 'string');
  assert.equal(typeof parsed.doctorTokens.W0_WEB_SMOKE_NO_ELECTRON_PROOF_OK, 'string');

  assert.equal(typeof parsed.paths, 'object');
  assert.equal(typeof parsed.paths.runDir, 'string');
  assert.equal(typeof parsed.paths.latestResultPath, 'string');
  assert.equal(parsed.paths.latestResultPath.replaceAll('\\', '/'), latestResultPath.replaceAll('\\', '/'));
});
