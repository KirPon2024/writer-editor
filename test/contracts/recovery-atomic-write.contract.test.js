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

test('recovery atomic contract: partial write never mutates committed target', async () => {
  const io = await loadIoModule();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-atomic-contract-'));
  const target = path.join(dir, 'scene.md');
  fs.writeFileSync(target, 'stable-before\n', 'utf8');

  await assert.rejects(
    io.atomicWriteFile(target, 'new-content\n', {
      afterTempWrite: () => {
        throw new Error('forced-interruption-after-temp-write');
      },
    }),
    (error) => {
      assert.equal(error.code, 'E_IO_ATOMIC_WRITE_FAIL');
      assert.equal(error.reason, 'atomic_write_failed');
      return true;
    },
  );

  assert.equal(fs.readFileSync(target, 'utf8'), 'stable-before\n');
  const leftovers = fs.readdirSync(dir).filter((name) => name.includes('.tmp.'));
  assert.deepEqual(leftovers, []);
});
