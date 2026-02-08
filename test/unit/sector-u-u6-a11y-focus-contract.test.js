const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const FULL_MODE = process.env.SECTOR_U_FULL_A11Y === '1';

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('u6 a11y focus contract: editor has focusable entry point and no tabindex=-1 on key roots', { skip: !FULL_MODE }, () => {
  const editorText = read('src/renderer/editor.js');
  const htmlText = read('src/renderer/index.html');

  assert.match(editorText, /const editor = document\.getElementById\('editor'\);/);
  assert.match(editorText, /editor\.focus\(\);/);

  const rootCandidates = [
    /<main[^>]*class="[^"]*main-content[^"]*"[^>]*>/i,
    /<section[^>]*class="[^"]*editor-panel[^"]*"[^>]*>/i,
    /<[^>]*id="editor"[^>]*>/i,
  ];
  for (const pattern of rootCandidates) {
    const match = htmlText.match(pattern);
    if (!match) continue;
    assert.doesNotMatch(match[0], /tabindex\s*=\s*"-1"/i);
    assert.doesNotMatch(match[0], /tabindex\s*=\s*'-1'/i);
  }
});
