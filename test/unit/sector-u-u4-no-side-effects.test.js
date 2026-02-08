const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = process.cwd();
const GUARD = path.join(ROOT, 'scripts', 'guards', 'sector-u-ui-no-side-effects.mjs');
const FIXTURES = path.join(ROOT, 'test', 'fixtures', 'sector-u', 'u4', 'no-side-effects');

function runGuard(relativeScanRoot, mode = 'DETECT_ONLY') {
  const scanRoot = path.join(FIXTURES, relativeScanRoot);
  return spawnSync(
    process.execPath,
    [GUARD, '--mode', mode, '--scan-root', scanRoot],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  );
}

function token(stdout, key) {
  const lines = String(stdout || '').split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith(`${key}=`)) return line.slice(key.length + 1);
  }
  return '';
}

test('u4 no-side-effects guard: positive fixture has zero violations', () => {
  const result = runGuard('positive', 'DETECT_ONLY');
  assert.equal(result.status, 0);
  assert.equal(token(result.stdout, 'RULE_ID'), 'U4-RULE-002');
  assert.equal(token(result.stdout, 'VIOLATIONS_COUNT'), '0');
});

test('u4 no-side-effects guard: negative fixture reports deterministic violations in detect-only', () => {
  const resultA = runGuard('negative', 'DETECT_ONLY');
  const resultB = runGuard('negative', 'DETECT_ONLY');
  assert.equal(resultA.status, 0);
  assert.equal(resultB.status, 0);
  assert.equal(resultA.stdout, resultB.stdout);
  const count = Number.parseInt(token(resultA.stdout, 'VIOLATIONS_COUNT'), 10);
  assert.ok(Number.isInteger(count));
  assert.ok(count > 0);
});
