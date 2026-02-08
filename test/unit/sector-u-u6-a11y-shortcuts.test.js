const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const FULL_MODE = process.env.SECTOR_U_FULL_A11Y === '1';

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('u6 a11y shortcuts: renderer keeps keyboard path for open/save/export commands', { skip: !FULL_MODE }, () => {
  const editorText = read('src/renderer/editor.js');
  const expected = JSON.parse(read('test/fixtures/sector-u/u6/shortcuts-expected.json'));

  for (const token of expected.commandIds) {
    const escaped = token.replaceAll('.', '\\.')
      .replaceAll('(', '\\(')
      .replaceAll(')', '\\)');
    assert.match(editorText, new RegExp(`dispatchUiCommand\\(${escaped}\\)`));
  }

  // Contract: Shift+Primary+E routes to export command path.
  assert.match(editorText, /\(key === 'E' \|\| key === 'e'\) && event\.shiftKey/);
  assert.match(editorText, /dispatchUiCommand\(COMMAND_IDS\.PROJECT_EXPORT_DOCX_MIN\)/);
});
