const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadIoModule() {
  const root = process.cwd();
  return import(pathToFileURL(path.join(root, 'src', 'io', 'markdown', 'index.mjs')).href);
}

test('recovery corruption contract: null-byte payload always emits typed corruption error', async () => {
  const io = await loadIoModule();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-corruption-contract-'));
  const filePath = path.join(dir, 'scene.md');
  fs.writeFileSync(filePath, Buffer.from([0x61, 0x00, 0x62]));

  const observed = [];
  for (let i = 0; i < 2; i += 1) {
    await assert.rejects(
      io.readMarkdownWithLimits(filePath),
      (error) => {
        observed.push({ code: error.code, reason: error.reason });
        assert.equal(error.code, 'E_IO_CORRUPT_INPUT');
        assert.equal(error.reason, 'corrupt_input_null_byte');
        return true;
      },
    );
  }

  assert.deepEqual(observed[0], observed[1]);
});
