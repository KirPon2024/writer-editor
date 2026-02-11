const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const EDITOR_PATH = path.join(process.cwd(), 'src', 'renderer', 'editor.js');

test('mindmap derived graph is not wired into editor input hot-path handlers', () => {
  const text = fs.readFileSync(EDITOR_PATH, 'utf8');

  const forbiddenHotpathPatterns = [
    /editor\.addEventListener\('beforeinput'[\s\S]{0,2000}mindmap/iu,
    /editor\.addEventListener\('input'[\s\S]{0,2000}mindmap/iu,
    /editor\.addEventListener\('keydown'[\s\S]{0,2000}mindmap/iu,
    /document\.addEventListener\('keydown'[\s\S]{0,2000}mindmap/iu,
    /dispatchUiCommand\([^)]*mindmap/iu,
  ];

  for (const pattern of forbiddenHotpathPatterns) {
    assert.equal(
      pattern.test(text),
      false,
      `mindmap derived must not run in hot-path: ${pattern.source}`,
    );
  }
});
