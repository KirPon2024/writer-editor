const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function runPerf() {
  const result = spawnSync(process.execPath, ['scripts/ops/perf-run.mjs', '--json'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `perf-run failed:\n${result.stdout}\n${result.stderr}`);
  return JSON.parse(String(result.stdout || '{}'));
}

test('perf runner contract: deterministic verdict and stable proof fields', () => {
  const first = runPerf();
  const second = runPerf();

  assert.equal(first.verdict, 'PASS');
  assert.equal(second.verdict, 'PASS');
  assert.equal(first.toolVersion, second.toolVersion);
  assert.equal(first.fixtureId, second.fixtureId);
  assert.equal(first.configHash, second.configHash);
  assert.equal(first.fixtureStateHash, second.fixtureStateHash);
  assert.equal(first.expectedStateHash, second.expectedStateHash);
  assert.equal(first.probeStable, 1);
  assert.equal(second.probeStable, 1);
  assert.equal(first.stateHashStable, 1);
  assert.equal(second.stateHashStable, 1);
  assert.deepEqual(
    Array.isArray(first.failReasons) ? first.failReasons.slice().sort() : [],
    Array.isArray(second.failReasons) ? second.failReasons.slice().sort() : [],
  );
});
