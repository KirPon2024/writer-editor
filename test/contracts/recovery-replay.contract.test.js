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

test('recovery replay contract: repeated replay over same artifacts yields identical verdict/hash', async () => {
  const io = await loadIoModule();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-replay-contract-'));
  const target = path.join(dir, 'scene.md');

  fs.writeFileSync(target, 'stable-replay-snapshot\n', 'utf8');
  const snapshot = await io.createRecoverySnapshot(target, { now: () => 1700000000999 });
  fs.writeFileSync(target, Buffer.from([0x41, 0x00, 0x42]));

  const run1 = await io.replayMarkdownRecovery(target);
  const run2 = await io.replayMarkdownRecovery(target);

  assert.deepEqual(run1, run2);
  assert.equal(run1.ok, 1);
  assert.equal(run1.sourceKind, 'snapshot');
  assert.equal(run1.snapshotPath, snapshot.snapshotPath);
  assert.equal(run1.recoveryAction, 'OPEN_SNAPSHOT');
  assert.equal(run1.textHash, io.computeSha256Bytes(Buffer.from('stable-replay-snapshot\n', 'utf8')));
});
