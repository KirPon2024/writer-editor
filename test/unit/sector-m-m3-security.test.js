const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

test('M3 IPC wiring exists for markdown import/export channels', () => {
  const preloadText = read('src/preload.js');
  const mainText = read('src/main.js');

  assert.match(preloadText, /m:cmd:project:import:markdownV1:v1/);
  assert.match(preloadText, /m:cmd:project:export:markdownV1:v1/);
  assert.match(preloadText, /importMarkdownV1:\s*\(payload\)\s*=>\s*{\s*return ipcRenderer\.invoke/);
  assert.match(preloadText, /exportMarkdownV1:\s*\(payload\)\s*=>\s*{\s*return ipcRenderer\.invoke/);

  assert.match(mainText, /ipcMain\.handle\(IMPORT_MARKDOWN_V1_CHANNEL/);
  assert.match(mainText, /ipcMain\.handle\(EXPORT_MARKDOWN_V1_CHANNEL/);
  assert.match(mainText, /handleImportMarkdownV1/);
  assert.match(mainText, /handleExportMarkdownV1/);
});

test('M3 typed markdown error codes are declared in main process mapping', () => {
  const mainText = read('src/main.js');
  const requiredCodes = [
    'MDV1_INPUT_TOO_LARGE',
    'MDV1_LIMIT_EXCEEDED',
    'MDV1_UNSUPPORTED_FEATURE',
    'MDV1_SECURITY_VIOLATION',
    'MDV1_INTERNAL_ERROR',
  ];
  for (const code of requiredCodes) {
    assert.ok(mainText.includes(code), `missing typed markdown code: ${code}`);
  }
});
