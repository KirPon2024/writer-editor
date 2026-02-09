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

test('M5 atomic write preserves original file on failure before rename and cleans temp file', async () => {
  const io = await loadIoModule();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sector-m-m5-atomic-'));
  const target = path.join(dir, 'scene.md');
  fs.writeFileSync(target, 'old-content\n', 'utf8');

  await assert.rejects(
    io.atomicWriteFile(target, 'new-content\n', {
      beforeRename: () => {
        throw new Error('forced-before-rename-failure');
      },
    }),
    (error) => {
      assert.equal(error.code, 'E_IO_ATOMIC_WRITE_FAIL');
      assert.equal(error.reason, 'atomic_write_failed');
      return true;
    },
  );

  assert.equal(fs.readFileSync(target, 'utf8'), 'old-content\n');
  const leftovers = fs.readdirSync(dir).filter((name) => name.includes('.tmp.'));
  assert.deepEqual(leftovers, []);
});

test('M5 atomic write replaces target content deterministically', async () => {
  const io = await loadIoModule();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sector-m-m5-atomic-ok-'));
  const target = path.join(dir, 'scene.md');
  fs.writeFileSync(target, 'before\n', 'utf8');

  const result = await io.atomicWriteFile(target, 'after\n');
  assert.equal(result.ok, 1);
  assert.equal(result.targetPath, target);
  assert.equal(result.bytesWritten, Buffer.byteLength('after\n', 'utf8'));
  assert.equal(fs.readFileSync(target, 'utf8'), 'after\n');
});
