const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'guards', 'contour-c-p0-01.mjs');
const POSITIVE_INVARIANTS = path.join(ROOT, 'test', 'fixtures', 'contour-c-p0-01', 'positive', 'invariants.json');
const POSITIVE_ENFORCEMENT = path.join(ROOT, 'test', 'fixtures', 'contour-c-p0-01', 'positive', 'enforcement.json');
const NEGATIVE_INVARIANTS = path.join(ROOT, 'test', 'fixtures', 'contour-c-p0-01', 'negative', 'invariants.json');
const NEGATIVE_ENFORCEMENT = path.join(ROOT, 'test', 'fixtures', 'contour-c-p0-01', 'negative', 'enforcement.json');

function runRule(invariantsPath, enforcementPath) {
  return spawnSync(
    process.execPath,
    [
      SCRIPT,
      '--invariants',
      invariantsPath,
      '--enforcement',
      enforcementPath,
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  );
}

test('contour-c p0-01 rule passes on positive fixture', () => {
  const result = runRule(POSITIVE_INVARIANTS, POSITIVE_ENFORCEMENT);
  assert.equal(result.status, 0, `Unexpected fail: ${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /^RULE_ID=C-P0-01-RULE-001$/m);
  assert.match(result.stdout, /^REASON=OK$/m);
});

test('contour-c p0-01 rule fails on negative fixture and prints RULE_ID', () => {
  const result = runRule(NEGATIVE_INVARIANTS, NEGATIVE_ENFORCEMENT);
  assert.notEqual(result.status, 0, 'Negative fixture must fail');
  assert.match(result.stdout, /^RULE_ID=C-P0-01-RULE-001$/m);
  assert.match(result.stdout, /^REASON=(INVARIANT_MATURITY_NOT_IMPLEMENTED|ENFORCEMENT_RULE_NOT_REGISTERED)$/m);
});
