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

function makeTempFile(prefix, bytes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const filePath = path.join(dir, 'scene.md');
  fs.writeFileSync(filePath, bytes);
  return filePath;
}

test('recovery typed errors contract: invalid UTF-8 is deterministic typed error', async () => {
  const io = await loadIoModule();
  const filePath = makeTempFile('recovery-typed-invalid-', Buffer.from([0xc3, 0x28]));

  const failures = [];
  for (let i = 0; i < 2; i += 1) {
    await assert.rejects(
      io.readMarkdownWithLimits(filePath),
      (error) => {
        failures.push({ code: error.code, reason: error.reason });
        assert.equal(error.code, 'E_IO_INVALID_ENCODING');
        assert.equal(error.reason, 'invalid_utf8_encoding');
        return true;
      },
    );
  }

  assert.deepEqual(failures[0], failures[1]);
});

test('recovery typed errors contract: truncated UTF-8 is deterministic typed error', async () => {
  const io = await loadIoModule();
  const filePath = makeTempFile('recovery-typed-truncated-', Buffer.from([0xe2, 0x82]));

  const failures = [];
  for (let i = 0; i < 2; i += 1) {
    await assert.rejects(
      io.readMarkdownWithLimits(filePath),
      (error) => {
        failures.push({ code: error.code, reason: error.reason });
        assert.equal(error.code, 'E_IO_TRUNCATED_INPUT');
        assert.equal(error.reason, 'truncated_utf8_input');
        return true;
      },
    );
  }

  assert.deepEqual(failures[0], failures[1]);
});

test('recovery typed errors contract: integrity mismatch cannot return success', async () => {
  const io = await loadIoModule();
  const filePath = makeTempFile('recovery-typed-integrity-', Buffer.from('alpha\n', 'utf8'));

  await assert.rejects(
    io.readMarkdownWithLimits(filePath, { expectedSha256: 'f'.repeat(64) }),
    (error) => {
      assert.equal(error.code, 'E_IO_INTEGRITY_MISMATCH');
      assert.equal(error.reason, 'integrity_hash_mismatch');
      return true;
    },
  );
});

test('recovery typed errors contract: snapshot mismatch is typed failure', async () => {
  const io = await loadIoModule();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-typed-snapshot-mismatch-'));
  const target = path.join(dir, 'scene.md');

  fs.writeFileSync(target, 'stable-content\n', 'utf8');
  const snapshot = await io.createRecoverySnapshot(target, { now: () => 1700000000001 });
  fs.writeFileSync(snapshot.snapshotPath, Buffer.from([0xe2, 0x82]));
  fs.writeFileSync(target, Buffer.from([0x41, 0x00, 0x42]));

  await assert.rejects(
    io.readMarkdownWithRecovery(target),
    (error) => {
      assert.equal(error.code, 'E_IO_SNAPSHOT_MISMATCH');
      assert.equal(error.reason, 'snapshot_mismatch');
      assert.equal(error.details.primaryCode, 'E_IO_CORRUPT_INPUT');
      assert.equal(error.details.snapshotCode, 'E_IO_TRUNCATED_INPUT');
      return true;
    },
  );
});
