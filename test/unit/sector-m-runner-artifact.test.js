const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function normalizePath(filePath) {
  return String(filePath).replaceAll('\\\\', '/');
}

test('sector-m runner writes fast artifact schema', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sector-m-runner-'));
  const artifactsRoot = path.join(tmpRoot, 'sector-m-run');

  const run = spawnSync(process.execPath, ['scripts/sector-m-run.mjs', '--pack', 'fast'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SECTOR_M_ARTIFACTS_ROOT: artifactsRoot,
      SECTOR_U_FAST_DURATION_MS: '10',
      SECTOR_M_RUN_SKIP_DOCTOR_TEST: '1',
    },
  });

  assert.equal(run.status, 0, `runner failed:\n${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /SECTOR_M_RUN_OK=1/);

  const latestResultPath = path.join(artifactsRoot, 'latest', 'result.json');
  assert.equal(fs.existsSync(latestResultPath), true, 'latest/result.json must exist');

  const result = JSON.parse(fs.readFileSync(latestResultPath, 'utf8'));
  assert.equal(result.schemaVersion, 'sector-m-run.v1');
  assert.equal(result.pack, 'fast');
  assert.equal(result.ok, 1);
  assert.equal(normalizePath(result.paths.artifactsRoot), normalizePath(artifactsRoot));
  assert.ok(Array.isArray(result.checks), 'checks must be array');
  assert.ok(result.checks.length > 0, 'checks must be non-empty');
  for (const item of result.checks) {
    assert.equal(typeof item.checkId, 'string');
    assert.ok(item.checkId.length > 0);
    assert.ok(item.ok === 0 || item.ok === 1);
  }
});
