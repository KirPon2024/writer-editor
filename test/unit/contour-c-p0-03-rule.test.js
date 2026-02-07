const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'guards', 'contour-c-p0-03.mjs');
const NEGATIVE_REQUIRED = path.join(ROOT, 'test', 'fixtures', 'contour-c-p0-03', 'negative', 'required-gates.md');
const NEGATIVE_WAIVERS = path.join(ROOT, 'test', 'fixtures', 'contour-c-p0-03', 'negative', 'waived-gates.json');
const POSITIVE_EXISTING_REQUIRED = path.join(ROOT, 'test', 'fixtures', 'contour-c-p0-03', 'positive', 'existing', 'required-gates.md');
const POSITIVE_EXISTING_WAIVERS = path.join(ROOT, 'test', 'fixtures', 'contour-c-p0-03', 'positive', 'existing', 'waived-gates.json');
const POSITIVE_WAIVED_REQUIRED = path.join(ROOT, 'test', 'fixtures', 'contour-c-p0-03', 'positive', 'waived', 'required-gates.md');
const POSITIVE_WAIVED_WAIVERS = path.join(ROOT, 'test', 'fixtures', 'contour-c-p0-03', 'positive', 'waived', 'waived-gates.json');

function runRule(requiredGatesPath, waivedGatesPath) {
  return spawnSync(
    process.execPath,
    [
      SCRIPT,
      '--required-gates',
      requiredGatesPath,
      '--waived-gates',
      waivedGatesPath,
      '--now-iso',
      '2030-01-01T00:00:00.000Z',
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  );
}

test('contour-c p0-03 rule fails when gate is missing and waiver is absent', () => {
  const result = runRule(NEGATIVE_REQUIRED, NEGATIVE_WAIVERS);
  assert.notEqual(result.status, 0, 'Negative fixture must fail');
  assert.match(result.stdout, /^RULE_ID=C-P0-03-RULE-001$/m);
  assert.match(result.stdout, /^GATE_ID=C-GATE-900$/m);
  assert.match(result.stdout, /^STATUS=MISSING$/m);
  assert.match(result.stdout, /^REASON=GATE_NOT_FOUND$/m);
});

test('contour-c p0-03 rule passes when gate exists', () => {
  const result = runRule(POSITIVE_EXISTING_REQUIRED, POSITIVE_EXISTING_WAIVERS);
  assert.equal(result.status, 0, `Unexpected fail: ${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /^RULE_ID=C-P0-03-RULE-001$/m);
  assert.match(result.stdout, /^STATUS=OK$/m);
});

test('contour-c p0-03 rule passes when missing gate has active waiver', () => {
  const result = runRule(POSITIVE_WAIVED_REQUIRED, POSITIVE_WAIVED_WAIVERS);
  assert.equal(result.status, 0, `Unexpected fail: ${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /^RULE_ID=C-P0-03-RULE-001$/m);
  assert.match(result.stdout, /^GATE_ID=C-GATE-777$/m);
  assert.match(result.stdout, /^STATUS=WAIVED$/m);
  assert.match(result.stdout, /^TTL=2099-12-31T23:59:59.000Z$/m);
});
