const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const ALLOWLIST = new Set([
  'docs/OPS/STATUS/SECTOR_M.json',
  'docs/OPS/STATUS/SECTOR_M_CHECKS.md',
  'scripts/sector-m-run.mjs',
  'scripts/doctor.mjs',
  'package.json',
  'test/unit/sector-m-status-schema.test.js',
  'test/unit/sector-m-doctor-tokens.test.js',
  'test/unit/sector-m-runner-artifact.test.js',
  'test/unit/sector-m-no-scope-leak.test.js',
  'test/fixtures/sector-m/expected-result.json',
]);

test('M0 diff does not leak outside allowlist', () => {
  const diff = spawnSync('git', ['diff', '--name-only', 'origin/main..HEAD'], {
    encoding: 'utf8',
  });
  assert.equal(diff.status, 0, `git diff failed:\n${diff.stdout}\n${diff.stderr}`);

  const files = String(diff.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const violations = files.filter((filePath) => !ALLOWLIST.has(filePath));
  assert.deepEqual(violations, [], `scope leak detected: ${violations.join(', ')}`);
});
