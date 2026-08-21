'use strict';

// R2.4 P3 implementation mutation suite for the transactional project commit.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'project-commit-v1.cjs');

const MUTANTS = [
  {
    id: 'marker-never-written',
    find: '    await durableSaveTransaction({ filePath: markerPath, content: `${JSON.stringify(marker, null, 2)}\\n`, revision, fsAdapter });',
    replace: '    void markerPath;',
  },
  {
    id: 'fence-check-removed',
    find: 'if (priorMarker && Number.isInteger(priorMarker.revision) && priorMarker.revision >= revision) {',
    replace: 'if (false) {',
  },
  {
    id: 'rollback-not-executed',
    find: '    if (manifestPersisted && typeof rollbackManifest === \'function\') {',
    replace: '    if (false) {',
  },
  {
    id: 'prepare-readback-skipped',
    find: '    if (sha256hex(prepared) !== sceneDigest) {',
    replace: '    if (false) {',
  },
  {
    id: 'publish-order-flipped',
    find: '  let manifestOutcome;\n  try {\n    manifestOutcome = await persistManifest();',
    replace: '  let manifestOutcome;\n  try {\n    await fsAdapter.rename(tempPath, scenePath);\n    manifestOutcome = await persistManifest();',
  },
  {
    id: 'temp-not-unique',
    find: "`${path.basename(scenePath)}.p3-${process.pid}-${crypto.randomBytes(6).toString('hex')}.tmp`",
    replace: '`${path.basename(scenePath)}.p3-fixed.tmp`',
  },
];

async function killOracle(module) {
  const {
    COMMIT_PHASES,
    ProjectCommitError,
    classifyProjectCommitState,
    commitProjectTextAndManifest,
    markerPathFor,
  } = module;
  const goodFs = require('node:fs/promises');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-p3-mutant-oracle-'));
  const scene = path.join(dir, 'scene.txt');

  const order = [];
  const spy = { ...goodFs, rename: async (a, b) => { order.push('scene-rename'); return goodFs.rename(a, b); } };
  const result = await commitProjectTextAndManifest({
    scenePath: scene,
    sceneContent: 'x',
    revision: 1,
    persistManifest: async () => { order.push('manifest-persist'); return { persisted: true, manifest: { v: 1 } }; },
    fsAdapter: spy,
  });
  assert.equal(result.success, true);
  assert.deepEqual(order.slice(0, 2), ['manifest-persist', 'scene-rename']);
  assert.equal(fs.existsSync(markerPathFor(scene)), true);
  assert.deepEqual([...result.phases].at(-1), COMMIT_PHASES.ACK);

  await assert.rejects(
    commitProjectTextAndManifest({ scenePath: scene, sceneContent: 'y', revision: 1, persistManifest: async () => ({ persisted: false }) }),
    (e) => e.code === 'E_COMMIT_FENCE_REGRESSION',
  );

  let rolledBack = 0;
  await assert.rejects(
    commitProjectTextAndManifest({
      scenePath: path.join(dir, 'b.txt'),
      sceneContent: 'b',
      revision: 1,
      persistManifest: async () => ({ persisted: true, manifest: { v: 1 } }),
      rollbackManifest: async () => { rolledBack += 1; },
      fsAdapter: { ...goodFs, rename: async () => { throw new Error('denied'); } },
    }),
    (e) => e.code === 'E_COMMIT_SCENE_PUBLISH',
  );
  assert.equal(rolledBack, 1);

  const tamperFs = {
    ...goodFs,
    open: async (p, m) => {
      const handle = await goodFs.open(p, m);
      return { writeFile: (c) => handle.writeFile(c), sync: () => handle.sync(), close: () => handle.close() };
    },
    readFile: async () => Buffer.from('tampered'),
  };
  await assert.rejects(
    commitProjectTextAndManifest({ scenePath: path.join(dir, 'c.txt'), sceneContent: 'c', revision: 1, persistManifest: async () => ({ persisted: false }), fsAdapter: tamperFs }),
    (e) => e.code === 'E_COMMIT_PREPARE_MISMATCH' || e.code === 'E_COMMIT_SCENE_MISMATCH',
  );

  const temps = [];
  const spyTemps = { ...goodFs, open: async (p, m) => { temps.push(p); return goodFs.open(p, m); } };
  await Promise.all([
    commitProjectTextAndManifest({ scenePath: path.join(dir, 'd.txt'), sceneContent: '1', revision: 1, persistManifest: async () => ({ persisted: false }), fsAdapter: spyTemps }),
    commitProjectTextAndManifest({ scenePath: path.join(dir, 'e.txt'), sceneContent: '2', revision: 1, persistManifest: async () => ({ persisted: false }), fsAdapter: spyTemps }),
  ]);
  assert.equal(temps.length, 2);
  assert.notEqual(temps[0], temps[1]);

  assert.equal(classifyProjectCommitState(scene).classification, 'NEW_COMMITTED');
}

test('P3 project commit: all implementation mutants are executed and killed', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-p3-mutant-'));
    const target = path.join(dir, 'project-commit-v1.cjs');
    fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
    fs.copyFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'save-coordinator-v1.cjs'), path.join(dir, 'save-coordinator-v1.cjs'));
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
  console.log(`R24_P3_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((s) => s.id), score: results.length ? (results.length - survived.length) / results.length : 0 })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
