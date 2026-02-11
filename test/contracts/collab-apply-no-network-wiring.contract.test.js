const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const FILE_PATH = 'src/collab/applyEventLog.mjs';
const FORBIDDEN_PATTERNS = [
  /from\s+['"]node:net['"]/u,
  /from\s+['"]node:http['"]/u,
  /from\s+['"]node:https['"]/u,
  /from\s+['"]ws['"]/u,
  /from\s+['"]electron['"]/u,
  /\bWebSocket\b/u,
  /\bfetch\s*\(/u,
  /\bXMLHttpRequest\b/u,
  /from\s+['"][^'"]*\/renderer\/[^'"]*['"]/u,
  /from\s+['"][^'"]*\/core\/[^'"]*['"]/u,
];

test('collab apply pipeline has no network wiring and no core/renderer bypass imports', () => {
  const text = fs.readFileSync(FILE_PATH, 'utf8');
  for (const pattern of FORBIDDEN_PATTERNS) {
    assert.equal(pattern.test(text), false, `forbidden pattern in ${FILE_PATH}: ${pattern.source}`);
  }
});
