'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  SAVE_PHASES,
  SaveCoordinatorError,
  classifySaveArtifacts,
  durableSaveTransaction,
} = require('../../src/core/save-coordinator-v1.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'r24-p2-save-'));

test('happy path: full phase chain, exact readback, revision and digest bound', async () => {
  const dir = tmp();
  const file = path.join(dir, 'scene.json');
  const result = await durableSaveTransaction({ filePath: file, content: '{"a":1}\n', revision: 7 });
  assert.equal(result.success, true);
  assert.deepEqual([...result.phases], [
    SAVE_PHASES.ADMIT,
    SAVE_PHASES.TEMP_WRITE,
    SAVE_PHASES.TEMP_FSYNC,
    SAVE_PHASES.ATOMIC_PUBLISH,
    SAVE_PHASES.PARENT_FSYNC,
    SAVE_PHASES.READBACK,
    SAVE_PHASES.ACK,
  ]);
  assert.equal(result.revision, 7);
  assert.match(result.digest, /^[0-9a-f]{64}$/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{"a":1}\n');
  assert.equal(fs.readdirSync(dir).filter((n) => n.includes('.tmp')).length, 0, 'no temp residue');
});

test('admission rejects invalid target, revision and content', async () => {
  await assert.rejects(durableSaveTransaction({ filePath: '', content: 'x' }), (e) => e.phase === 'ADMIT' && e.code === 'E_SAVE_TARGET_REQUIRED');
  await assert.rejects(durableSaveTransaction({ filePath: '/x', content: 'x', revision: -1 }), (e) => e.code === 'E_SAVE_REVISION_INVALID');
  await assert.rejects(durableSaveTransaction({ filePath: '/x', content: 42 }), (e) => e.code === 'E_SAVE_CONTENT_SHAPE');
});

test('per-phase failure injection produces typed phase errors and no false ACK', async () => {
  const dir = tmp();
  const file = path.join(dir, 'scene.json');
  const goodFs = require('node:fs/promises');

  const failWrite = {
    ...goodFs,
    open: async () => { throw new Error('disk full'); },
  };
  await assert.rejects(
    durableSaveTransaction({ filePath: file, content: 'x', fsAdapter: failWrite }),
    (e) => e instanceof SaveCoordinatorError && e.code === 'E_SAVE_TEMP_WRITE' && e.phase === 'TEMP_WRITE',
  );

  const failSync = {
    ...goodFs,
    open: async (p, mode) => {
      const handle = await goodFs.open(p, mode);
      return { ...handle, writeFile: (c) => handle.writeFile(c), sync: async () => { throw new Error('fsync refused'); }, close: () => handle.close() };
    },
  };
  await assert.rejects(
    durableSaveTransaction({ filePath: file, content: 'x', fsAdapter: failSync }),
    (e) => e.code === 'E_SAVE_TEMP_FSYNC' && e.phase === 'TEMP_FSYNC',
  );

  const failRename = { ...goodFs, rename: async () => { throw new Error('rename denied'); } };
  await assert.rejects(
    durableSaveTransaction({ filePath: file, content: 'x', fsAdapter: failRename }),
    (e) => e.code === 'E_SAVE_ATOMIC_PUBLISH' && e.phase === 'ATOMIC_PUBLISH',
  );

  const failDirSync = { ...goodFs, syncDirectory: async () => { throw new Error('dir fsync failed'); } };
  await assert.rejects(
    durableSaveTransaction({ filePath: file, content: 'x', fsAdapter: failDirSync }),
    (e) => e.code === 'E_SAVE_PARENT_FSYNC' && e.phase === 'PARENT_FSYNC',
  );

  const failReadback = { ...goodFs, readFile: async () => { throw new Error('readback lost'); } };
  await assert.rejects(
    durableSaveTransaction({ filePath: file, content: 'x', fsAdapter: failReadback }),
    (e) => e.code === 'E_SAVE_READBACK' && e.phase === 'READBACK',
  );
  assert.equal(fs.existsSync(file), true, 'publish already happened; no false ACK was issued');
});

test('tampered readback is detected as a digest mismatch', async () => {
  const dir = tmp();
  const file = path.join(dir, 'scene.json');
  const goodFs = require('node:fs/promises');
  const tamper = { ...goodFs, readFile: async () => Buffer.from('corrupted') };
  await assert.rejects(
    durableSaveTransaction({ filePath: file, content: 'original', fsAdapter: tamper }),
    (e) => e.code === 'E_SAVE_READBACK_MISMATCH' && e.phase === 'READBACK',
  );
});

test('concurrent transactions use unique temps and any interleave is detected', async () => {
  const dir = tmp();
  const seenTemps = [];
  const goodFs = require('node:fs/promises');
  const spy = {
    ...goodFs,
    open: async (p, mode) => {
      seenTemps.push(p);
      return goodFs.open(p, mode);
    },
  };
  const outcomes = await Promise.allSettled([
    durableSaveTransaction({ filePath: path.join(dir, 'a.json'), content: '1', fsAdapter: spy }),
    durableSaveTransaction({ filePath: path.join(dir, 'a.json'), content: '2', fsAdapter: spy }),
  ]);
  assert.equal(seenTemps.length, 2);
  assert.notEqual(seenTemps[0], seenTemps[1], 'temp paths must never collide');
  const rejected = outcomes.filter((o) => o.status === 'rejected');
  for (const r of rejected) {
    assert.equal(r.reason.code, 'E_SAVE_READBACK_MISMATCH', 'an interleaved publish must surface as a typed mismatch, never silent corruption');
  }
  const finalContent = fs.readFileSync(path.join(dir, 'a.json'), 'utf8');
  assert.ok(['1', '2'].includes(finalContent), 'final content is exactly one committed payload');
});

test('fsync calls are observable through the adapter (no silent durability)', async () => {
  const dir = tmp();
  const calls = [];
  const goodFs = require('node:fs/promises');
  const spy = {
    ...goodFs,
    open: async (p, mode) => {
      const handle = await goodFs.open(p, mode);
      return {
        writeFile: (c) => handle.writeFile(c),
        sync: async () => { calls.push('temp-sync'); return handle.sync(); },
        close: () => handle.close(),
      };
    },
    syncDirectory: async (d) => { calls.push('dir-sync'); return goodFs.open(d, 'r').then((h) => h.sync().then(() => h.close())); },
  };
  await durableSaveTransaction({ filePath: path.join(dir, 'scene.json'), content: 'x', fsAdapter: spy });
  assert.deepEqual(calls, ['temp-sync', 'dir-sync']);
});

test('crash classification is total over synthetic states', () => {
  const dir = tmp();
  const file = path.join(dir, 'scene.json');
  assert.equal(classifySaveArtifacts(file).classification, 'ROLLBACK_REQUIRED');
  fs.writeFileSync(file, 'committed');
  assert.equal(classifySaveArtifacts(file).classification, 'OLD_OR_NEW_COMMITTED');
  fs.writeFileSync(path.join(dir, 'scene.json.p2-1-abcdef.tmp'), 'partial');
  assert.equal(classifySaveArtifacts(file).classification, 'ROLLBACK_REQUIRED');
  fs.unlinkSync(file);
  assert.equal(classifySaveArtifacts(file).classification, 'RESUMABLE_PREPARED');
});

test('unicode and binary content round-trip byte-exact', async () => {
  const dir = tmp();
  const file = path.join(dir, 'unicode.txt');
  const content = 'Текст İ Σσς 👨‍👩‍👧‍👦\nline2';
  const result = await durableSaveTransaction({ filePath: file, content });
  assert.equal(fs.readFileSync(file, 'utf8'), content);
  assert.equal(result.bytes, Buffer.byteLength(content, 'utf8'));
});
