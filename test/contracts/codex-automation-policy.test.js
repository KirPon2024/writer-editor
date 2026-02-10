const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const policyPath = path.join(process.cwd(), 'docs', 'OPERATIONS', 'STATUS', 'CODEX_AUTOMATION_POLICY.json');

test('codex automation policy v1.4 bootstrap schema is present and valid', () => {
  assert.equal(fs.existsSync(policyPath), true, 'policy file must exist');
  const doc = JSON.parse(fs.readFileSync(policyPath, 'utf8'));

  assert.equal(doc.policyVersion, 'v1.4');
  assert.equal(doc.promptMode, 'prompt_disabled');
  assert.equal(Array.isArray(doc.allowlist), true);
  assert.equal(Array.isArray(doc.denylist), true);
  assert.equal(doc.allowlist.length > 0, true);
  assert.equal(doc.denylist.length > 0, true);
  assert.equal(Number.isInteger(doc.promptDetection.exitCodeOnPrompt), true);
  assert.equal(typeof doc.promptDetection.markerRegex, 'string');
  assert.equal(doc.promptDetection.markerRegex.length > 0, true);
});
