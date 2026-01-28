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
  if (process.platform === 'win32') {
    t.skip('Permission-based test skipped on Windows');
    return;
  }

  const tempDir = await createTempDir();
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const restrictedDir = path.join(tempDir, 'restricted');
  await fs.mkdir(restrictedDir, { recursive: true });

  const filePath = path.join(restrictedDir, 'locked.txt');
  await fs.writeFile(filePath, 'keep', 'utf8');

  try {
    await fs.chmod(restrictedDir, 0o500);
    const result = await fileManager.writeFileAtomic(filePath, 'replace');
    assert.equal(result.success, false);
    assert.equal(await fs.readFile(filePath, 'utf8'), 'keep');
  } finally {
    await fs.chmod(restrictedDir, 0o700);
  }
});
