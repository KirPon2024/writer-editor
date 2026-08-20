'use strict';

// R2.4 P2 implementation mutation suite for the save coordinator.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'save-coordinator-v1.cjs');

const MUTANTS = [
  {
    id: 'temp-fsync-skipped',
    find: '    await handle.sync();\n    await handle.close();',
    replace: '    await handle.close();',
  },
  {
    id: 'parent-fsync-skipped',
    find: '    await fsyncDirectoryWith(fsAdapter, directory);',
    replace: '    void directory;',
  },
  {
    id: 'readback-mismatch-ignored',
    find: '  if (readbackDigest !== expectedDigest) {',
    replace: '  if (false) {',
  },
  {
    id: 'temp-not-unique',
    find: "`${baseName}.p2-${process.pid}-${crypto.randomBytes(6).toString('hex')}.tmp`",
    replace: '`${baseName}.p2-fixed.tmp`',
  },
  {
    id: 'ack-phase-not-recorded',
    find: '  phases.push(SAVE_PHASES.ACK);',
    replace: '  void phases;',
  },
  {
    id: 'revision-not-bound',
    find: '    revision: revision === undefined ? null : revision,',
    replace: '    revision: null,',
  },
];

function killOracle(module) {
  return (async () => {
    const { SAVE_PHASES, durableSaveTransaction } = module;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-p2-mutant-oracle-'));
    const goodFs = require('node:fs/promises');
    const calls = [];
    const spy = {
      ...goodFs,
      open: async (p, m) => {
        calls.push(`open:${path.basename(p)}`);
        const handle = await goodFs.open(p, m);
        return {
          writeFile: (c) => handle.writeFile(c),
          sync: async () => { calls.push('temp-sync'); return handle.sync(); },
          close: () => handle.close(),
        };
      },
      syncDirectory: async (d) => { calls.push('dir-sync'); const h = await goodFs.open(d, 'r'); try { await h.sync(); } finally { await h.close(); } },
    };
    const target = path.join(dir, 'scene.json');
    const result = await durableSaveTransaction({ filePath: target, content: 'x', revision: 9, fsAdapter: spy });
    assert.equal(result.success, true);
    assert.deepEqual(calls.filter((c) => c.endsWith('sync')), ['temp-sync', 'dir-sync']);
    assert.deepEqual([...result.phases].at(-1), SAVE_PHASES.ACK);
    assert.equal(result.revision, 9);

    const tamper = { ...goodFs, readFile: async () => Buffer.from('corrupted') };
    await assert.rejects(
      durableSaveTransaction({ filePath: path.join(dir, 'b.json'), content: 'y', fsAdapter: tamper }),
      (e) => e.code === 'E_SAVE_READBACK_MISMATCH',
    );

    const temps = [];
    const spyTemps = {
      ...goodFs,
      open: async (p, m) => { temps.push(p); return goodFs.open(p, m); },
    };
    await Promise.all([
      durableSaveTransaction({ filePath: path.join(dir, 'c.json'), content: '1', fsAdapter: spyTemps }),
      durableSaveTransaction({ filePath: path.join(dir, 'c.json'), content: '2', fsAdapter: spyTemps }),
    ]);
    assert.equal(temps.length, 2);
    assert.notEqual(temps[0], temps[1]);
  })();
}

test('P2 save coordinator: all implementation mutants are executed and killed', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-p2-mutant-'));
    const target = path.join(dir, 'save-coordinator-v1.cjs');
    fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
    let killed = false;
    let detail = '';
    try {
      await killOracle(require(target));
      detail = 'survived';
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    }
    results.push({ id: mutant.id, killed, detail });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const survived = results.filter((r) => !r.killed);
  console.log(`R24_P2_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((s) => s.id), score: results.length ? (results.length - survived.length) / results.length : 0 })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
