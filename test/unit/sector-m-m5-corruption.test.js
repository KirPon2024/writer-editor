const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadIoModule() {
  const root = process.cwd();
  return import(pathToFileURL(path.join(root, 'src', 'io', 'markdown', 'index.mjs')).href);
}

test('M5 corruption guard returns typed error for null-byte markdown input', async () => {
  const io = await loadIoModule();
  const fixturePath = path.join(process.cwd(), 'test', 'fixtures', 'sector-m', 'm5', 'corrupt.md');

  await assert.rejects(
    io.readMarkdownWithLimits(fixturePath, { maxInputBytes: 1024 * 1024 }),
    (error) => {
      assert.equal(error.code, 'E_IO_CORRUPT_INPUT');
      assert.equal(error.reason, 'corrupt_input_null_byte');
      return true;
    },
  );
});
