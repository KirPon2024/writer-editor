const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function runResolver(args = []) {
  return spawnSync(process.execPath, ['scripts/guards/platform-capability-resolver.mjs', ...args], {
    encoding: 'utf8',
  });
}

test('platform capability resolver is deterministic for baseline command/platform', () => {
  const first = runResolver(['--platform-id', 'node', '--command-id', 'cmd.project.open', '--json']);
  const second = runResolver(['--platform-id', 'node', '--command-id', 'cmd.project.open', '--json']);
  assert.equal(first.status, 0);
  assert.equal(second.status, 0);
  assert.equal(first.stdout, second.stdout);
  const parsed = JSON.parse(first.stdout);
  assert.equal(parsed.ok, 1);
  assert.equal(parsed.capabilityEnabled, 1);
  assert.equal(parsed.capabilityId, 'cap.project.open');
});
