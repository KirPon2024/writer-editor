const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'guards', 'sector-u-ui-no-platform-direct.mjs');
const FIXTURE_ROOT = path.join(ROOT, 'test', 'fixtures', 'sector-u', 'u2');

function parseToken(stdout, key) {
  const lines = String(stdout || '').split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith(`${key}=`)) return line.slice(key.length + 1);
  }
  return '';
}

function runGuard(scanRoot, extraArgs = []) {
  return spawnSync(
    process.execPath,
    [SCRIPT, '--scan-root', scanRoot, ...extraArgs],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  );
}

test('u2 guard: deterministic output for same fixture', () => {
  const scanRoot = path.join(FIXTURE_ROOT, 'negative');
  const a = runGuard(scanRoot);
  const b = runGuard(scanRoot);
  assert.equal(a.status, 0);
  assert.equal(b.status, 0);
  assert.equal(a.stdout, b.stdout);
  const violationsCount = Number.parseInt(parseToken(a.stdout, 'VIOLATIONS_COUNT'), 10);
  assert.ok(Number.isInteger(violationsCount));
  assert.ok(violationsCount > 0);
});

test('u2 guard: detect-only mode always exits 0 on violations', () => {
  const scanRoot = path.join(FIXTURE_ROOT, 'negative');
  const result = runGuard(scanRoot, ['--mode', 'DETECT_ONLY']);
  assert.equal(result.status, 0);
  const mode = parseToken(result.stdout, 'MODE');
  const violationsCount = Number.parseInt(parseToken(result.stdout, 'VIOLATIONS_COUNT'), 10);
  assert.equal(mode, 'DETECT_ONLY');
  assert.ok(violationsCount > 0);
});

test('u2 guard: blocking mode exits 2 when violations are present', () => {
  const scanRoot = path.join(FIXTURE_ROOT, 'negative');
  const result = runGuard(scanRoot, ['--mode', 'BLOCKING']);
  assert.equal(result.status, 2);
  const mode = parseToken(result.stdout, 'MODE');
  assert.equal(mode, 'BLOCKING');
});

test('u2 guard: dropped mode exits 0 and suppresses violations', () => {
  const scanRoot = path.join(FIXTURE_ROOT, 'negative');
  const result = runGuard(scanRoot, ['--mode', 'DROPPED']);
  assert.equal(result.status, 0);
  assert.equal(parseToken(result.stdout, 'MODE'), 'DROPPED');
  assert.equal(parseToken(result.stdout, 'VIOLATIONS_COUNT'), '0');
});

test('u2 guard: exclude rules ignore test paths in mixed fixture', () => {
  const scanRoot = path.join(FIXTURE_ROOT, 'mixed');
  const result = runGuard(scanRoot);
  assert.equal(result.status, 0);
  const lines = String(result.stdout || '').split(/\r?\n/).filter((line) => line.startsWith('VIOLATION '));
  assert.ok(lines.some((line) => line.includes('file=src/renderer/bad.js')));
  assert.ok(!lines.some((line) => line.includes('file=test/ignored.spec.js')));
});

test('u2 guard: positive fixture has zero violations', () => {
  const scanRoot = path.join(FIXTURE_ROOT, 'positive');
  const result = runGuard(scanRoot);
  assert.equal(result.status, 0);
  assert.equal(parseToken(result.stdout, 'VIOLATIONS_COUNT'), '0');
});
