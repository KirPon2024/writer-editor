const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function mapBySoT(error, doc) {
  const source = error && typeof error === 'object' && !Array.isArray(error) ? error : {};
  const code = typeof source.code === 'string' && source.code.length > 0 ? source.code : 'E_COMMAND_FAILED';
  const op = typeof source.op === 'string' && source.op.length > 0 ? source.op : '';
  const index = new Map();
  for (const entry of doc.map) {
    index.set(entry.code, entry);
  }
  const mapped = index.get(code);
  if (mapped) {
    return { userMessage: mapped.userMessage, severity: mapped.severity, code, op };
  }
  return { userMessage: doc.defaultUserMessage, severity: 'ERROR', code, op };
}

test('u5 editor mapping: editor uses SoT mapping function and no hardcoded command switch', () => {
  const editorText = read('src/renderer/editor.js');
  assert.match(editorText, /import\s+uiErrorMapDoc\s+from\s+['"][^'"]*UI_ERROR_MAP\.json['"]/);
  assert.match(editorText, /function\s+mapCommandErrorToUi\s*\(/);
  assert.match(editorText, /dispatchUiCommand\s*\(.*\)\s*\{/s);
  assert.doesNotMatch(editorText, /function\s+mapCommandErrorToStatus\s*\(/);
});

test('u5 editor mapping: known code resolves to SoT message', () => {
  const doc = JSON.parse(read('docs/OPS/STATUS/UI_ERROR_MAP.json'));
  const mapped = mapBySoT({ code: 'E_COMMAND_NOT_FOUND', op: 'cmd.project.open' }, doc);
  assert.equal(mapped.userMessage, 'Команда не найдена');
  assert.equal(mapped.severity, 'ERROR');
});

test('u5 editor mapping: unknown code resolves to defaultUserMessage', () => {
  const doc = JSON.parse(read('docs/OPS/STATUS/UI_ERROR_MAP.json'));
  const mapped = mapBySoT({ code: 'E_UNKNOWN', op: 'cmd.project.save' }, doc);
  assert.equal(mapped.userMessage, doc.defaultUserMessage);
  assert.equal(mapped.severity, 'ERROR');
});
