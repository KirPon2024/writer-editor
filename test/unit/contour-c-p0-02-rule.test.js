const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'guards', 'contour-c-p0-02.mjs');
const POSITIVE_POLICY = path.join(ROOT, 'test', 'fixtures', 'contour-c-p0-02', 'positive', 'policy.json');
const NEGATIVE_POLICY = path.join(ROOT, 'test', 'fixtures', 'contour-c-p0-02', 'negative', 'policy.json');

function runRule(policyPath) {
  return spawnSync(
    process.execPath,
    [SCRIPT, '--policy', policyPath],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  );
}

test('contour-c p0-02 rule passes on positive fixture', () => {
  const result = runRule(POSITIVE_POLICY);
  assert.equal(result.status, 0, `Unexpected fail: ${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /^RULE_ID=C-P0-02-RULE-001$/m);
  assert.match(result.stdout, /^REASON=OK$/m);
});

test('contour-c p0-02 rule fails on negative fixture and prints RULE_ID', () => {
  const result = runRule(NEGATIVE_POLICY);
  assert.notEqual(result.status, 0, 'Negative fixture must fail');
  assert.match(result.stdout, /^RULE_ID=C-P0-02-RULE-001$/m);
  assert.match(result.stdout, /^REASON=POLICY_ADDITIVE_ONLY_FALSE$/m);
});
