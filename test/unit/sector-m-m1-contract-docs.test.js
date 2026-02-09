const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(filePath) {
  assert.equal(fs.existsSync(filePath), true, `missing file: ${filePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

test('M1 contract docs exist and contain required sections', () => {
  const specPath = 'docs/FORMAT/MARKDOWN_MODE_SPEC_v1.md';
  const lossPath = 'docs/FORMAT/MARKDOWN_LOSS_POLICY_v1.md';
  const securityPath = 'docs/FORMAT/MARKDOWN_SECURITY_POLICY_v1.md';

  const spec = read(specPath);
  const loss = read(lossPath);
  const security = read(securityPath);

  const specMarkers = [
    '## Scope',
    '## Dialect',
    '## Supported Blocks',
    '## Supported Inlines',
    '## Escaping Rules',
    '## Deterministic Serialization Rules',
    '## Limits',
    '## Examples',
  ];
  const lossMarkers = [
    '## Loss Principles',
    '## Loss Report Format',
    '## Roundtrip Guarantees',
    '## Mapping Table',
    '## Examples',
  ];
  const securityMarkers = [
    '## Raw HTML Policy',
    '## Links and URIs Policy',
    '## Code Blocks Policy',
    '## Sanitization Responsibility',
    '## Limits',
  ];

  for (const marker of specMarkers) {
    assert.ok(spec.includes(marker), `spec missing marker: ${marker}`);
  }
  for (const marker of lossMarkers) {
    assert.ok(loss.includes(marker), `loss policy missing marker: ${marker}`);
  }
  for (const marker of securityMarkers) {
    assert.ok(security.includes(marker), `security policy missing marker: ${marker}`);
  }
});
