const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

test('hotpath policy contract: static policy check passes without violations', () => {
  const result = spawnSync(process.execPath, ['scripts/ops/hotpath-policy-state.mjs', '--json'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `hotpath policy failed:\n${result.stdout}\n${result.stderr}`);

  const state = JSON.parse(String(result.stdout || '{}'));
  assert.equal(state.HOTPATH_POLICY_OK, 1);
  assert.equal(Array.isArray(state.policyIssues), true);
  assert.equal(state.policyIssues.length, 0);
  assert.equal(Array.isArray(state.violations), true);
  assert.equal(state.violations.length, 0);
  assert.equal(typeof state.configHash, 'string');
  assert.equal(state.configHash.length, 64);
});
