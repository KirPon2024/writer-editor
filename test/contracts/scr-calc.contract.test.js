const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function runScr() {
  const result = spawnSync(process.execPath, ['scripts/ops/scr-calc.mjs', '--json'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `scr-calc failed:\n${result.stdout}\n${result.stderr}`);
  return JSON.parse(String(result.stdout || '{}'));
}

test('scr-calc emits deterministic shape and hash', () => {
  const a = runScr();
  const b = runScr();

  assert.ok(Number.isInteger(a.runtime_shared_loc) && a.runtime_shared_loc >= 0);
  assert.ok(Number.isInteger(a.runtime_total_loc) && a.runtime_total_loc >= 0);
  assert.ok(Number.isInteger(a.app_total_loc) && a.app_total_loc >= 0);
  assert.ok(typeof a.runtime_scr === 'number' && a.runtime_scr >= 0 && a.runtime_scr <= 1);
  assert.ok(typeof a.app_scr === 'number' && a.app_scr >= 0 && a.app_scr <= 1);
  assert.ok(Array.isArray(a.runtime_platform_breakdown));
  assert.ok(typeof a.toolVersion === 'string' && a.toolVersion.length > 0);
  assert.ok(typeof a.configHash === 'string' && a.configHash.length === 64);
  assert.ok(a.SCR_RUNTIME_SHARED_RATIO_OK === 0 || a.SCR_RUNTIME_SHARED_RATIO_OK === 1);
  assert.ok(typeof a.SCR_APP_TOTAL_SHARED_RATIO_INFO === 'number');
  assert.ok(a.SCR_SHARED_CODE_RATIO_OK === 0 || a.SCR_SHARED_CODE_RATIO_OK === 1);
  assert.equal(a.SCR_SHARED_CODE_RATIO_OK, a.SCR_RUNTIME_SHARED_RATIO_OK);

  assert.equal(a.toolVersion, b.toolVersion);
  assert.equal(a.configHash, b.configHash);
  assert.equal(a.runtime_shared_loc, b.runtime_shared_loc);
  assert.equal(a.runtime_total_loc, b.runtime_total_loc);
  assert.equal(a.runtime_scr, b.runtime_scr);
  assert.equal(a.app_total_loc, b.app_total_loc);
  assert.equal(a.app_scr, b.app_scr);
  assert.deepEqual(a.runtime_platform_breakdown, b.runtime_platform_breakdown);
  assert.equal(a.SCR_RUNTIME_SHARED_RATIO_OK, b.SCR_RUNTIME_SHARED_RATIO_OK);
  assert.equal(a.SCR_APP_TOTAL_SHARED_RATIO_INFO, b.SCR_APP_TOTAL_SHARED_RATIO_INFO);
  assert.equal(a.SCR_SHARED_CODE_RATIO_OK, b.SCR_SHARED_CODE_RATIO_OK);
});
