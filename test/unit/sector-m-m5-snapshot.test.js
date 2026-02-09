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

test('M5 snapshot is skipped when target file does not exist', async () => {
  const io = await loadIoModule();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sector-m-m5-snap-missing-'));
  const target = path.join(dir, 'missing.md');

  const result = await io.createRecoverySnapshot(target);
  assert.equal(result.ok, 1);
  assert.equal(result.snapshotCreated, false);
  assert.equal(result.snapshotPath, '');
  assert.deepEqual(result.purgedSnapshots, []);
});

test('M5 snapshot keeps bounded history and purges oldest deterministically', async () => {
  const io = await loadIoModule();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sector-m-m5-snap-'));
  const target = path.join(dir, 'scene.md');
  fs.writeFileSync(target, 'snapshot-source\n', 'utf8');

  let tick = 1000;
  const now = () => {
    tick += 1;
    return tick;
  };

  await io.createRecoverySnapshot(target, { maxSnapshots: 3, now });
  await io.createRecoverySnapshot(target, { maxSnapshots: 3, now });
  await io.createRecoverySnapshot(target, { maxSnapshots: 3, now });
  const fourth = await io.createRecoverySnapshot(target, { maxSnapshots: 3, now });

  assert.equal(fourth.snapshotCreated, true);
  assert.equal(Array.isArray(fourth.purgedSnapshots), true);
  assert.equal(fourth.purgedSnapshots.length, 1);

  const names = fs.readdirSync(dir).filter((name) => name.startsWith('.scene.md.bak.')).sort();
  assert.equal(names.length, 3);
  assert.equal(names.includes('.scene.md.bak.0000000001001'), false);
  assert.equal(names.includes('.scene.md.bak.0000000001002'), true);
  assert.equal(names.includes('.scene.md.bak.0000000001003'), true);
  assert.equal(names.includes('.scene.md.bak.0000000001004'), true);
});
