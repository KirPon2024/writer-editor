const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'sector-u-run.mjs');

test('sector-u-run writes canonical artifact schema to latest result path', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sector-u-run-'));
  const artifactsRoot = path.join(tmpRoot, 'artifacts', 'sector-u-run');
  const latestResultPath = path.join(artifactsRoot, 'latest', 'result.json');

  const result = spawnSync(
    process.execPath,
    [SCRIPT, '--pack', 'fast'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        SECTOR_U_ARTIFACTS_ROOT: artifactsRoot,
        SECTOR_U_RUN_SKIP_TEST: '1',
      },
    },
  );

  assert.equal(result.status, 0, `Unexpected fail: ${result.stdout}\n${result.stderr}`);
  assert.equal(fs.existsSync(latestResultPath), true, 'latest result.json must exist');

  const parsed = JSON.parse(fs.readFileSync(latestResultPath, 'utf8'));
  assert.equal(parsed.schemaVersion, 'sector-u-run.v1');
  assert.equal(typeof parsed.runId, 'string');
  assert.ok(parsed.runId.length > 0);
  assert.equal(parsed.pack, 'fast');
  assert.ok(parsed.ok === 0 || parsed.ok === 1);
  assert.equal(typeof parsed.durationMs, 'number');
  assert.ok(Array.isArray(parsed.checks));
  assert.ok(parsed.checks.length >= 1);

  for (const check of parsed.checks) {
    assert.equal(typeof check.checkId, 'string');
    assert.equal(typeof check.cmd, 'string');
    assert.ok(check.ok === 0 || check.ok === 1);
    assert.equal(typeof check.outPath, 'string');
    assert.equal(fs.existsSync(check.outPath), true, `check outPath missing: ${check.outPath}`);
  }

  assert.equal(typeof parsed.doctorTokens, 'object');
  assert.equal(typeof parsed.doctorTokens.SECTOR_U_STATUS_OK, 'string');
  assert.equal(typeof parsed.doctorTokens.SECTOR_U_NO_RUNTIME_PRODUCT_WAIVERS_OK, 'string');
  assert.equal(typeof parsed.paths.latestResultPath, 'string');
  assert.equal(parsed.paths.latestResultPath.replaceAll('\\', '/'), latestResultPath.replaceAll('\\', '/'));
});
