const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const backupManager = require('../../src/utils/backupManager');
const fileManager = require('../../src/utils/fileManager');

async function createTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'craftsman-'));
}

function fileIdFor(filePath) {
  return crypto.createHash('sha256').update(path.resolve(filePath)).digest('hex');
}

test('createBackup separates files with identical basenames', async (t) => {
  const tempDir = await createTempDir();
  const originalGetDocumentsPath = fileManager.getDocumentsPath;
  fileManager.getDocumentsPath = () => tempDir;

  t.after(async () => {
    fileManager.getDocumentsPath = originalGetDocumentsPath;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const firstPath = path.resolve(path.sep, 'a', 'notes.txt');
  const secondPath = path.resolve(path.sep, 'b', 'notes.txt');

  await backupManager.createBackup(firstPath, 'first');
  await backupManager.createBackup(secondPath, 'second');

  const firstId = fileIdFor(firstPath);
  const secondId = fileIdFor(secondPath);
  assert.notEqual(firstId, secondId);

  const firstDir = path.join(tempDir, '.backups', firstId);
  const secondDir = path.join(tempDir, '.backups', secondId);
  const firstMeta = JSON.parse(await fs.readFile(path.join(firstDir, 'meta.json'), 'utf8'));
  const secondMeta = JSON.parse(await fs.readFile(path.join(secondDir, 'meta.json'), 'utf8'));

  assert.equal(firstMeta.originalPath, firstPath);
  assert.equal(firstMeta.baseName, 'notes.txt');
  assert.equal(secondMeta.originalPath, secondPath);
  assert.equal(secondMeta.baseName, 'notes.txt');
});

test('createBackup rotates backups per fileId (keeps last 50)', async (t) => {
  const tempDir = await createTempDir();
  const originalGetDocumentsPath = fileManager.getDocumentsPath;
  fileManager.getDocumentsPath = () => tempDir;

  t.after(async () => {
    fileManager.getDocumentsPath = originalGetDocumentsPath;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const filePath = path.resolve(path.sep, 'rotate', 'story.txt');
  const fileId = fileIdFor(filePath);
  const backupDir = path.join(tempDir, '.backups', fileId);

  for (let i = 0; i < 55; i += 1) {
    await backupManager.createBackup(filePath, `content-${i}`);
    await new Promise((resolve) => setTimeout(resolve, 2));
  }

  const files = await fs.readdir(backupDir);
  const backupFiles = files.filter((file) => file !== 'meta.json');
  assert.equal(backupFiles.length, 50);
  assert.equal(files.includes('meta.json'), true);
});

test('createBackup rejects traversal-like basePath input', async () => {
  const result = await backupManager.createBackup(path.resolve(path.sep, 'rotate', 'story.txt'), 'content', {
    basePath: '../outside',
  });

  assert.equal(result.success, false);
});
