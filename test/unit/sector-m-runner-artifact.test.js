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
  const fixturePath = path.join(process.cwd(), 'test', 'fixtures', 'sector-m', 'expected-result.json');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

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
  assert.equal(result.schemaVersion, fixture.schemaVersion);
  assert.equal(result.pack, fixture.pack);
  assert.equal(result.ok, fixture.ok);
  assert.equal(normalizePath(result.paths.artifactsRoot), normalizePath(artifactsRoot));

  const checkIds = Array.isArray(result.checks) ? result.checks.map((item) => item.checkId) : [];
  for (const requiredId of fixture.requiredCheckIds) {
    assert.ok(checkIds.includes(requiredId), `missing check id: ${requiredId}`);
  }
});
