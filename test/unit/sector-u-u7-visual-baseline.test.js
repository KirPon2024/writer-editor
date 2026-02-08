const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const FULL_MODE = process.env.SECTOR_U_FULL_VISUAL === '1';

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = sortObject(value[key]);
  }
  return out;
}

function buildSnapshot(editorText) {
  return sortObject({
    schemaVersion: 'u7-visual-baseline.v1',
    scenarios: {
      'U7-S01': {
        editorRootAnchor: /const editor = document\.getElementById\('editor'\);/.test(editorText),
        commandRegistryWired: /registerProjectCommands\(commandRegistry,\s*\{\s*electronAPI:\s*window\.electronAPI\s*\}\);/.test(editorText),
        loadTreeCall: /\bloadTree\(\);/.test(editorText),
      },
      'U7-S02': {
        openTrigger: /dispatchUiCommand\(COMMAND_IDS\.PROJECT_OPEN\)/.test(editorText),
        saveTrigger: /dispatchUiCommand\(COMMAND_IDS\.PROJECT_SAVE\)/.test(editorText),
        exportTrigger: /dispatchUiCommand\(COMMAND_IDS\.PROJECT_EXPORT_DOCX_MIN\)/.test(editorText),
        exportShortcut: /\(key === 'E' \|\| key === 'e'\) && event\.shiftKey/.test(editorText),
      },
      'U7-S03': {
        errorMapper: /function mapCommandErrorToUi\(error\)/.test(editorText),
        mappedStatusUpdate: /updateStatusText\(mapped\.userMessage\)/.test(editorText),
      },
    },
  });
}

test('u7 visual baseline: deterministic snapshot matches expected contract', { skip: !FULL_MODE }, () => {
  const editorText = readText('src/renderer/editor.js');
  const actual = buildSnapshot(editorText);
  const expected = sortObject(JSON.parse(readText('test/fixtures/sector-u/u7/snapshot-expected.json')));
  assert.deepEqual(actual, expected);
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
});

test('u7 visual baseline: exactly three visual scenarios are tracked', { skip: !FULL_MODE }, () => {
  const expected = JSON.parse(readText('test/fixtures/sector-u/u7/snapshot-expected.json'));
  const scenarioIds = Object.keys(expected.scenarios || {}).sort();
  assert.deepEqual(scenarioIds, ['U7-S01', 'U7-S02', 'U7-S03']);
});
