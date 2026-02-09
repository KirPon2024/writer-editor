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

const ALLOWLIST_M2 = new Set([
  'src/export/markdown/v1/index.mjs',
  'src/export/markdown/v1/lossReport.mjs',
  'src/export/markdown/v1/parseMarkdownV1.mjs',
  'src/export/markdown/v1/serializeMarkdownV1.mjs',
  'src/export/markdown/v1/types.mjs',
  'docs/OPS/STATUS/SECTOR_M.json',
  'docs/OPS/STATUS/SECTOR_M_CHECKS.md',
  'scripts/doctor.mjs',
  'scripts/sector-m-run.mjs',
  'test/unit/sector-m-m2-roundtrip.test.js',
  'test/unit/sector-m-m2-security-policy.test.js',
  'test/unit/sector-m-m2-limits.test.js',
  'test/fixtures/sector-m/m2/simple.md',
  'test/fixtures/sector-m/m2/simple.expected.md',
  'test/fixtures/sector-m/m2/headings.md',
  'test/fixtures/sector-m/m2/lists.md',
  'test/fixtures/sector-m/m2/links_safe.md',
  'test/fixtures/sector-m/m2/links_unsafe.md',
  'test/fixtures/sector-m/m2/html_raw.md',
  'test/fixtures/sector-m/m2/large.md',
  'test/fixtures/sector-m/m2/deep.md',
  'test/fixtures/sector-m/m2/lossy.md',
  'test/fixtures/sector-m/m2/loss.expected.json',
  // Keep prior tests updated as phase-agnostic.
  'test/unit/sector-m-status-schema.test.js',
  'test/unit/sector-m-doctor-tokens.test.js',
  'test/unit/sector-m-runner-artifact.test.js',
  'test/unit/sector-m-no-scope-leak.test.js',
]);

const ALLOWLIST_M3 = new Set([
  'docs/OPS/STATUS/SECTOR_M.json',
  'docs/OPS/STATUS/SECTOR_M_CHECKS.md',
  'scripts/doctor.mjs',
  'scripts/sector-m-run.mjs',
  'src/preload.js',
  'src/main.js',
  'test/unit/sector-m-no-scope-leak.test.js',
]);

const ALLOWLIST_M3_PREFIXES = [
  'src/renderer/commands/',
  'test/unit/sector-m-m3-',
  'test/fixtures/sector-m/m3/',
];

const ALLOWLIST_M4 = new Set([
  'docs/OPS/STATUS/SECTOR_M.json',
  'docs/OPS/STATUS/SECTOR_M_CHECKS.md',
  'scripts/doctor.mjs',
  'scripts/sector-m-run.mjs',
  'src/renderer/editor.js',
  'test/unit/sector-m-no-scope-leak.test.js',
  'test/unit/sector-m-m4-ui-path.test.js',
  'test/fixtures/sector-m/m4/ui-path-markers.json',
]);

const ALLOWLIST_M4_PREFIXES = [
  'src/renderer/commands/',
  'test/unit/sector-m-m3-',
  'test/fixtures/sector-m/m3/',
];

function currentPhase() {
  const status = spawnSync(process.execPath, ['-e', "const fs=require('node:fs');const p=JSON.parse(fs.readFileSync('docs/OPS/STATUS/SECTOR_M.json','utf8'));process.stdout.write(String(p.phase||''));"], {
    encoding: 'utf8',
  });
  if (status.status !== 0) return '';
  return String(status.stdout || '').trim();
}

function isPhaseAtLeastM2(phase) {
  return ['M2', 'M3', 'M4', 'M5', 'M6', 'DONE'].includes(phase);
}

function isPhaseAtLeastM3(phase) {
  return ['M3', 'M4', 'M5', 'M6', 'DONE'].includes(phase);
}

function isAllowedM3Path(filePath) {
  if (ALLOWLIST_M3.has(filePath)) return true;
  return ALLOWLIST_M3_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

function isAllowedM4Path(filePath) {
  if (ALLOWLIST_M4.has(filePath)) return true;
  return ALLOWLIST_M4_PREFIXES.some((prefix) => filePath.startsWith(prefix));
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
  const violations = files.filter((filePath) => {
    if (['M4', 'M5', 'M6', 'DONE'].includes(phase)) return !isAllowedM4Path(filePath);
    if (isPhaseAtLeastM3(phase)) return !isAllowedM3Path(filePath);
    if (isPhaseAtLeastM2(phase)) return !ALLOWLIST_M2.has(filePath);
    if (phase === 'M1') return !ALLOWLIST_M1.has(filePath);
    return !ALLOWLIST.has(filePath);
  });
  assert.deepEqual(violations, [], `scope leak detected: ${violations.join(', ')}`);
});
