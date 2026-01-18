const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('main process does not use executeJavaScript', async () => {
  const mainPath = path.resolve(__dirname, '..', 'src', 'main.js');
  const content = await fs.readFile(mainPath, 'utf8');
  assert.equal(content.includes('executeJavaScript'), false);
});
