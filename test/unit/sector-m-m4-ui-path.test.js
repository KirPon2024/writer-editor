const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(filePath) {
  return fs.readFileSync(path.join(process.cwd(), filePath), 'utf8');
}

test('M4 UI path wiring exists and routes markdown actions via command layer', () => {
  const editorText = read('src/renderer/editor.js');
  const fixture = JSON.parse(read('test/fixtures/sector-m/m4/ui-path-markers.json'));

  for (const marker of fixture.requiredMarkers) {
    assert.equal(
      editorText.includes(marker),
      true,
      `missing required M4 marker: ${marker}`,
    );
  }

  for (const marker of fixture.forbiddenMarkers) {
    assert.equal(
      editorText.includes(marker),
      false,
      `forbidden direct markdown platform call in editor: ${marker}`,
    );
  }
});
