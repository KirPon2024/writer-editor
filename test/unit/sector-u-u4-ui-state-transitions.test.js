const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = process.cwd();
const GUARD = path.join(ROOT, 'scripts', 'guards', 'sector-u-ui-state-transitions.mjs');
const FIXTURES = path.join(ROOT, 'test', 'fixtures', 'sector-u', 'u4', 'transitions');

function runGuard(fileName, mode = 'BLOCKING') {
  return spawnSync(
    process.execPath,
    [GUARD, '--mode', mode, '--transitions-path', path.join(FIXTURES, fileName)],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  );
}

function getToken(stdout, key) {
  const lines = String(stdout || '').split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith(`${key}=`)) return line.slice(key.length + 1);
  }
  return '';
}

test('u4 transitions guard: valid SoT passes in blocking mode', () => {
  const result = runGuard('valid.json', 'BLOCKING');
  assert.equal(result.status, 0);
  assert.equal(getToken(result.stdout, 'RULE_ID'), 'U4-RULE-001');
  assert.equal(getToken(result.stdout, 'VIOLATIONS_COUNT'), '0');
});

test('u4 transitions guard: duplicate (from,event) fails in blocking mode', () => {
  const result = runGuard('duplicate-key.json', 'BLOCKING');
  assert.equal(result.status, 2);
  assert.match(result.stdout, /DUPLICATE_TRANSITION_KEY/);
});

test('u4 transitions guard: unknown state reference fails in blocking mode', () => {
  const result = runGuard('unknown-state.json', 'BLOCKING');
  assert.equal(result.status, 2);
  assert.match(result.stdout, /UNKNOWN_TO_STATE:MISSING_STATE/);
});
