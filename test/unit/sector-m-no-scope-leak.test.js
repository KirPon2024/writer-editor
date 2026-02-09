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

const ALLOWLIST_M1 = new Set([
  'docs/FORMAT/MARKDOWN_MODE_SPEC_v1.md',
  'docs/FORMAT/MARKDOWN_LOSS_POLICY_v1.md',
  'docs/FORMAT/MARKDOWN_SECURITY_POLICY_v1.md',
  'docs/OPS/STATUS/SECTOR_M.json',
  'docs/OPS/STATUS/SECTOR_M_CHECKS.md',
  'scripts/doctor.mjs',
  'scripts/sector-m-run.mjs',
  'test/unit/sector-m-m1-contract-docs.test.js',
  'test/unit/sector-m-m1-doctor-tokens.test.js',
  // Scope exception for phase-agnostic M0 tests.
  'test/unit/sector-m-status-schema.test.js',
  'test/unit/sector-m-doctor-tokens.test.js',
  'test/unit/sector-m-runner-artifact.test.js',
  'test/unit/sector-m-no-scope-leak.test.js',
]);

function currentPhase() {
  const status = spawnSync(process.execPath, ['-e', "const fs=require('node:fs');const p=JSON.parse(fs.readFileSync('docs/OPS/STATUS/SECTOR_M.json','utf8'));process.stdout.write(String(p.phase||''));"], {
    encoding: 'utf8',
  });
  if (status.status !== 0) return '';
  return String(status.stdout || '').trim();
}

test('sector-m diff does not leak outside phase allowlist', () => {
  const diff = spawnSync('git', ['diff', '--name-only', 'origin/main..HEAD'], {
    encoding: 'utf8',
  });
  assert.equal(diff.status, 0, `git diff failed:\n${diff.stdout}\n${diff.stderr}`);

  const files = String(diff.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const phase = currentPhase();
  const allowlist = phase === 'M1' ? ALLOWLIST_M1 : ALLOWLIST;
  const violations = files.filter((filePath) => !allowlist.has(filePath));
  assert.deepEqual(violations, [], `scope leak detected: ${violations.join(', ')}`);
});
