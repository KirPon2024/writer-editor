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

  assert.ok(Number.isInteger(a.shared_runtime_loc) && a.shared_runtime_loc >= 0);
  assert.ok(Number.isInteger(a.total_runtime_loc) && a.total_runtime_loc >= 0);
  assert.ok(typeof a.scr === 'number' && a.scr >= 0 && a.scr <= 1);
  assert.ok(typeof a.toolVersion === 'string' && a.toolVersion.length > 0);
  assert.ok(typeof a.configHash === 'string' && a.configHash.length === 64);

  assert.equal(a.toolVersion, b.toolVersion);
  assert.equal(a.configHash, b.configHash);
  assert.equal(a.shared_runtime_loc, b.shared_runtime_loc);
  assert.equal(a.total_runtime_loc, b.total_runtime_loc);
  assert.equal(a.scr, b.scr);
  assert.ok(a.SCR_SHARED_CODE_RATIO_OK === 0 || a.SCR_SHARED_CODE_RATIO_OK === 1);
});
