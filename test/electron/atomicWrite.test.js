const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const fileManager = require('../../src/utils/fileManager');

async function createTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'craftsman-'));
}

test('writeFileAtomic writes and overwrites files', async (t) => {
  const tempDir = await createTempDir();
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const filePath = path.join(tempDir, 'nested', 'dir', 'file.txt');
  const first = await fileManager.writeFileAtomic(filePath, 'first');
  assert.equal(first.success, true);
  assert.equal(await fs.readFile(filePath, 'utf8'), 'first');

  const second = await fileManager.writeFileAtomic(filePath, 'second');
  assert.equal(second.success, true);
  assert.equal(await fs.readFile(filePath, 'utf8'), 'second');
});

test('writeFileAtomic fails on directory targets without altering them', async (t) => {
  const tempDir = await createTempDir();
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const dirPath = path.join(tempDir, 'targetDir');
  await fs.mkdir(dirPath, { recursive: true });

  const result = await fileManager.writeFileAtomic(dirPath, 'nope');
  assert.equal(result.success, false);

  const stat = await fs.lstat(dirPath);
  assert.equal(stat.isDirectory(), true);
});

test('writeFileAtomic keeps original content on write failures', async (t) => {
  const tempDir = await createTempDir();
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const filePath = path.join(tempDir, 'locked.txt');
  await fs.writeFile(filePath, 'keep', 'utf8');

  const originalRename = fs.rename;
  let forcedFailures = 0;
  fs.rename = async (sourcePath, destinationPath, ...args) => {
    if (
      path.resolve(destinationPath) === path.resolve(filePath)
      && String(sourcePath).endsWith('.tmp')
    ) {
      forcedFailures += 1;
      const error = new Error('deterministic atomic replacement failure');
      error.code = 'EACCES';
      throw error;
    }
    return originalRename.call(fs, sourcePath, destinationPath, ...args);
  };

  try {
    const result = await fileManager.writeFileAtomic(filePath, 'replace');
    assert.equal(result.success, false);
    assert.equal(forcedFailures, 2);
    assert.equal(await fs.readFile(filePath, 'utf8'), 'keep');
  } finally {
    fs.rename = originalRename;
  }
});
