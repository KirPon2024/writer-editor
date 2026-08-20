'use strict';

// R2.4 P2 crash/physics: a real child process is SIGKILLed at a phase marker
// mid-transaction; the parent proves the on-disk state classifies and that no
// ACK ever survives a crash before the ACK phase.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const {
  classifySaveArtifacts,
} = require('../../src/core/save-coordinator-v1.cjs');

const CHILD_SOURCE = `
const fs = require('node:fs');
const path = require('node:path');
const { durableSaveTransaction } = require(process.argv[2]);
const [,, modulePath, targetFile, killAfter] = process.argv;
const fsp = require('node:fs/promises');
const phases = [];
const crashingAdapter = {
  ...fsp,
  open: async (p, m) => fsp.open(p, m),
  rename: fsp.rename,
  readFile: fsp.readFile,
  syncDirectory: async (d) => {
    const h = await fsp.open(d, 'r');
    try { await h.sync(); } finally { await h.close(); }
  },
};
const wrap = {
  ...crashingAdapter,
  open: async (p, m) => {
    const handle = await crashingAdapter.open(p, m);
    return {
      writeFile: async (c) => {
        await handle.writeFile(c);
        if (killAfter === 'TEMP_WRITE') process.kill(process.pid, 'SIGKILL');
      },
      sync: async () => {
        await handle.sync();
        if (killAfter === 'TEMP_FSYNC') process.kill(process.pid, 'SIGKILL');
      },
      close: () => handle.close(),
    };
  },
  rename: async (a, b) => {
    await crashingAdapter.rename(a, b);
    if (killAfter === 'ATOMIC_PUBLISH') process.kill(process.pid, 'SIGKILL');
  },
  syncDirectory: crashingAdapter.syncDirectory,
  readFile: crashingAdapter.readFile,
};
durableSaveTransaction({ filePath: targetFile, content: 'durable-payload', revision: 3, fsAdapter: wrap })
  .then((result) => {
    fs.writeFileSync(targetFile + '.acked', JSON.stringify(result.phases));
    process.exit(0);
  })
  .catch(() => process.exit(2));
`;

function runCrashChild({ targetFile, killAfter }) {
  return new Promise((resolve) => {
    const childPath = path.join(os.tmpdir(), `r24-p2-crash-child-${process.pid}-${Math.random().toString(36).slice(2, 8)}.cjs`);
    fs.writeFileSync(childPath, CHILD_SOURCE);
    const modulePath = path.join(__dirname, '..', '..', 'src', 'core', 'save-coordinator-v1.cjs');
    const child = spawn(process.execPath, [childPath, modulePath, targetFile, killAfter || 'NEVER'], { stdio: 'pipe' });
    child.on('exit', (code, signal) => {
      fs.rmSync(childPath, { force: true });
      resolve({ code, signal });
    });
  });
}

test('SIGKILL after TEMP_WRITE leaves classifiable resumable state and no ACK', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-p2-crash-'));
  const target = path.join(dir, 'scene.json');
  const outcome = await runCrashChild({ targetFile: target, killAfter: 'TEMP_WRITE' });
  assert.equal(outcome.signal, 'SIGKILL');
  assert.equal(fs.existsSync(`${target}.acked`), false, 'no ACK artifact may exist after a crash');
  const cls = classifySaveArtifacts(target);
  assert.equal(cls.classification, 'RESUMABLE_PREPARED', JSON.stringify(cls));
});

test('SIGKILL after ATOMIC_PUBLISH leaves new content committed and no ACK', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-p2-crash-'));
  const target = path.join(dir, 'scene.json');
  const outcome = await runCrashChild({ targetFile: target, killAfter: 'ATOMIC_PUBLISH' });
  assert.equal(outcome.signal, 'SIGKILL');
  assert.equal(fs.existsSync(`${target}.acked`), false);
  assert.equal(fs.readFileSync(target, 'utf8'), 'durable-payload', 'content is on disk before the ACK phase');
  const cls = classifySaveArtifacts(target);
  assert.equal(cls.classification, 'OLD_OR_NEW_COMMITTED');
});

test('a transaction never killed completes with full phase-bound ACK', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-p2-crash-'));
  const target = path.join(dir, 'scene.json');
  const outcome = await runCrashChild({ targetFile: target, killAfter: 'NEVER' });
  assert.equal(outcome.code, 0);
  const phases = JSON.parse(fs.readFileSync(`${target}.acked`, 'utf8'));
  assert.deepEqual(phases, ['ADMIT', 'TEMP_WRITE', 'TEMP_FSYNC', 'ATOMIC_PUBLISH', 'PARENT_FSYNC', 'READBACK', 'ACK']);
  assert.equal(fs.readFileSync(target, 'utf8'), 'durable-payload');
});
