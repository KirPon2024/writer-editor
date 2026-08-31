'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'src/core/atlas-book-snapshot-v1.mjs');
const digest = (value) => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

const MUTANTS = Object.freeze([
  {
    id: 'scene-order-sorted-before-digest',
    find: "    schemaVersion: ATLAS_BOOK_ORDER_SCHEMA_VERSION,\n    projectId,\n    sceneOrder,\n  });",
    replace: "    schemaVersion: ATLAS_BOOK_ORDER_SCHEMA_VERSION,\n    projectId,\n    sceneOrder: [...sceneOrder].sort(),\n  });",
  },
  {
    id: 'scene-revision-removed-from-dependency-digest',
    find: "      sceneId,\n      sceneRevision: sceneRevisionsById[sceneId],\n      dependencyDigests: dependenciesBySceneId[sceneId],",
    replace: "      sceneId,\n      sceneRevision: 'sha256:' + '0'.repeat(64),\n      dependencyDigests: dependenciesBySceneId[sceneId],",
  },
  {
    id: 'manifest-removed-from-book-dependency-digest',
    find: "    projectId,\n    manifestRevision,\n    orderedSceneDependencies: sceneOrder.map((sceneId) => ({",
    replace: "    projectId,\n    manifestRevision: 'sha256:' + '0'.repeat(64),\n    orderedSceneDependencies: sceneOrder.map((sceneId) => ({",
  },
  {
    id: 'project-revision-removed-from-snapshot-id',
    find: "  const identity = {\n    schemaVersion: ATLAS_BOOK_SNAPSHOT_SCHEMA_VERSION,\n    projectId,\n    projectRevisionId,\n    manifestRevision,\n    sceneCount: sceneOrder.length,",
    replace: "  const identity = {\n    schemaVersion: ATLAS_BOOK_SNAPSHOT_SCHEMA_VERSION,\n    projectId,\n    projectRevisionId: 'sha256:' + '0'.repeat(64),\n    manifestRevision,\n    sceneCount: sceneOrder.length,",
  },
  {
    id: 'snapshot-no-longer-deeply-frozen',
    find: "  return freezeDeep({\n    schemaVersion: ATLAS_BOOK_SNAPSHOT_SCHEMA_VERSION,\n    snapshotId,",
    replace: "  return ({\n    schemaVersion: ATLAS_BOOK_SNAPSHOT_SCHEMA_VERSION,\n    snapshotId,",
  },
  {
    id: 'tampered-snapshot-verification-disabled',
    find: "  if (hashCanonicalValue(snapshot) !== hashCanonicalValue(rebuilt)) fail('E_ATLAS_BOOK_SNAPSHOT_DIGEST_MISMATCH');",
    replace: "  if (false) fail('E_ATLAS_BOOK_SNAPSHOT_DIGEST_MISMATCH');",
  },
  {
    id: 'unordered-dependencies-accepted',
    find: "    if (normalized.some((digest, index) => index > 0 && normalized[index - 1] >= digest)) {\n      fail('E_ATLAS_BOOK_SNAPSHOT_DEPENDENCY_ORDER');\n    }",
    replace: "    if (false) {\n      fail('E_ATLAS_BOOK_SNAPSHOT_DEPENDENCY_ORDER');\n    }",
  },
  {
    id: 'stale-project-revision-accepted',
    find: "    if (expected[field] !== current[field]) {",
    replace: "    if (field !== 'projectRevisionId' && expected[field] !== current[field]) {",
  },
]);

function fixture() {
  return {
    projectId: 'wp401-mutant-project',
    projectRevisionId: digest('project-r1'),
    manifestRevision: digest('manifest-r1'),
    sceneOrder: ['scene-b', 'scene-a'],
    sceneRevisionsById: { 'scene-a': digest('scene-a-r1'), 'scene-b': digest('scene-b-r1') },
    dependenciesBySceneId: { 'scene-a': [digest('dep-a')], 'scene-b': [digest('dep-b')] },
  };
}

function currentIdentity(snapshot) {
  return {
    projectId: snapshot.projectId,
    projectRevisionId: snapshot.projectRevisionId,
    manifestRevision: snapshot.manifestRevision,
    orderDigest: snapshot.orderDigest,
    dependencyDigest: snapshot.dependencyDigest,
  };
}

async function assertWp401Oracle(module) {
  const baseline = module.createAtlasBookSnapshot(fixture());
  assert.equal(Object.isFrozen(baseline), true);
  assert.equal(Object.isFrozen(baseline.sceneOrder), true);
  assert.deepEqual(module.verifyAtlasBookSnapshot(baseline), baseline);

  const reordered = fixture();
  reordered.sceneOrder = ['scene-a', 'scene-b'];
  assert.notEqual(module.createAtlasBookSnapshot(reordered).orderDigest, baseline.orderDigest);

  const revised = fixture();
  revised.sceneRevisionsById['scene-a'] = digest('scene-a-r2');
  assert.notEqual(module.createAtlasBookSnapshot(revised).dependencyDigest, baseline.dependencyDigest);

  const manifest = fixture();
  manifest.manifestRevision = digest('manifest-r2');
  assert.notEqual(module.createAtlasBookSnapshot(manifest).dependencyDigest, baseline.dependencyDigest);

  const project = fixture();
  project.projectRevisionId = digest('project-r2');
  assert.notEqual(module.createAtlasBookSnapshot(project).snapshotId, baseline.snapshotId);

  assert.throws(
    () => module.verifyAtlasBookSnapshot({ ...clone(baseline), snapshotId: digest('forged') }),
    (error) => error.code === 'E_ATLAS_BOOK_SNAPSHOT_DIGEST_MISMATCH',
  );

  const unordered = fixture();
  unordered.dependenciesBySceneId['scene-a'] = [digest('z'), digest('a')].sort().reverse();
  assert.throws(
    () => module.createAtlasBookSnapshot(unordered),
    (error) => error.code === 'E_ATLAS_BOOK_SNAPSHOT_DEPENDENCY_ORDER',
  );

  const current = currentIdentity(baseline);
  const stale = module.assessAtlasBookSnapshotCurrent(baseline, {
    ...current,
    projectRevisionId: digest('project-r9'),
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'PROJECT_REVISION_CHANGED');
}

async function loadMutant(source, mutant) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp401-mutant-'));
  const coreDir = path.join(dir, 'core');
  fs.mkdirSync(coreDir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'src/core/browser-safe-hash.mjs'), path.join(coreDir, 'browser-safe-hash.mjs'));
  const target = path.join(coreDir, 'atlas-book-snapshot-v1.mjs');
  fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
  return { dir, module: await import(`${pathToFileURL(target).href}?mutant=${encodeURIComponent(mutant.id)}`) };
}

test('WP-401 implementation mutants: every identity and stale-publication law has an executed kill oracle', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  await assertWp401Oracle(await import(pathToFileURL(MODULE_PATH).href));
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const loaded = await loadMutant(source, mutant);
    let killed = false;
    let detail = 'survived';
    try {
      await assertWp401Oracle(loaded.module);
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    } finally {
      fs.rmSync(loaded.dir, { recursive: true, force: true });
    }
    results.push({ id: mutant.id, killed, detail });
  }
  const survived = results.filter((result) => !result.killed);
  console.log(`R24_WP401_MUTATION_RECEIPT=${JSON.stringify({
    total: results.length,
    killed: results.length - survived.length,
    survived: survived.map((result) => result.id),
    score: results.length ? (results.length - survived.length) / results.length : 0,
  })}`);
  assert.equal(results.length, MUTANTS.length);
  assert.deepEqual(survived, []);
});
