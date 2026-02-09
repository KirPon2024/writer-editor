const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadIoModule() {
  const root = process.cwd();
  return import(pathToFileURL(path.join(root, 'src', 'io', 'markdown', 'index.mjs')).href);
}

test('M5 limits guard returns typed error for oversized markdown input', async () => {
  const io = await loadIoModule();
  const fixturePath = path.join(process.cwd(), 'test', 'fixtures', 'sector-m', 'm5', 'big.md');

  await assert.rejects(
    io.readMarkdownWithLimits(fixturePath, { maxInputBytes: 256 }),
    (error) => {
      assert.equal(error.code, 'E_IO_INPUT_TOO_LARGE');
      assert.equal(error.reason, 'input_too_large');
      return true;
    },
  );
});
