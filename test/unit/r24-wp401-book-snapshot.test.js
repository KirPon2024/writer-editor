'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const loadModule = () => import(pathToFileURL(path.join(ROOT, 'src/core/atlas-book-snapshot-v1.mjs')).href);
const digest = (value) => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

function fixture() {
  return {
    projectId: 'wp401-project',
    projectRevisionId: digest('project-r1'),
    manifestRevision: digest('manifest-r1'),
    sceneOrder: ['scene-b', 'scene-a'],
    sceneRevisionsById: {
      'scene-a': digest('scene-a-r1'),
      'scene-b': digest('scene-b-r1'),
    },
    dependenciesBySceneId: {
      'scene-a': [digest('entity-anna'), digest('timeline-main')].sort(),
      'scene-b': [digest('entity-anna')],
    },
  };
}

function identity(snapshot) {
  return {
    projectId: snapshot.projectId,
    projectRevisionId: snapshot.projectRevisionId,
    manifestRevision: snapshot.manifestRevision,
    orderDigest: snapshot.orderDigest,
    dependencyDigest: snapshot.dependencyDigest,
  };
}

test('WP-401 contract: snapshot is deterministic, exact-revision bound and deeply immutable', async () => {
  const module = await loadModule();
  const first = module.createAtlasBookSnapshot(fixture());
  const second = module.createAtlasBookSnapshot(clone(fixture()));
  assert.deepEqual(second, first);
  assert.equal(first.schemaVersion, module.ATLAS_BOOK_SNAPSHOT_SCHEMA_VERSION);
  assert.match(first.snapshotId, /^sha256:[a-f0-9]{64}$/u);
  assert.match(first.orderDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.match(first.dependencyDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(first.sceneCount, 2);
  assert.deepEqual(first.sceneOrder, ['scene-b', 'scene-a']);
  assert.deepEqual(Object.keys(first).sort(), [
    'dependenciesBySceneId', 'dependencyDigest', 'manifestRevision', 'orderDigest',
    'projectId', 'projectRevisionId', 'sceneCount', 'sceneDependencyDigestsById',
    'sceneOrder', 'sceneRevisionsById', 'schemaVersion', 'snapshotId',
  ]);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.sceneOrder), true);
  assert.equal(Object.isFrozen(first.dependenciesBySceneId['scene-a']), true);
  assert.equal('text' in first, false);
  assert.deepEqual(module.verifyAtlasBookSnapshot(first), first);
});

test('WP-401 order digest preserves authoritative scene order instead of identifier sorting', async () => {
  const module = await loadModule();
  const baseline = module.createAtlasBookSnapshot(fixture());
  const reorderedInput = fixture();
  reorderedInput.sceneOrder = ['scene-a', 'scene-b'];
  const reordered = module.createAtlasBookSnapshot(reorderedInput);
  assert.notEqual(reordered.orderDigest, baseline.orderDigest);
  assert.notEqual(reordered.dependencyDigest, baseline.dependencyDigest);
  assert.notEqual(reordered.snapshotId, baseline.snapshotId);
  assert.deepEqual(reordered.sceneOrder, ['scene-a', 'scene-b']);
  assert.equal(reordered.sceneRevisionsById['scene-a'], baseline.sceneRevisionsById['scene-a']);
});

test('WP-401 dependency digest binds scene revision, manifest and complete external dependencies', async () => {
  const module = await loadModule();
  const baseline = module.createAtlasBookSnapshot(fixture());

  const dependencyChanged = fixture();
  dependencyChanged.dependenciesBySceneId['scene-b'] = [digest('entity-anna'), digest('thread-red')].sort();
  const dependencySnapshot = module.createAtlasBookSnapshot(dependencyChanged);
  assert.equal(dependencySnapshot.orderDigest, baseline.orderDigest);
  assert.notEqual(dependencySnapshot.sceneDependencyDigestsById['scene-b'], baseline.sceneDependencyDigestsById['scene-b']);
  assert.notEqual(dependencySnapshot.dependencyDigest, baseline.dependencyDigest);
  assert.notEqual(dependencySnapshot.snapshotId, baseline.snapshotId);

  const revisionChanged = fixture();
  revisionChanged.sceneRevisionsById['scene-a'] = digest('scene-a-r2');
  const revisionSnapshot = module.createAtlasBookSnapshot(revisionChanged);
  assert.notEqual(revisionSnapshot.sceneDependencyDigestsById['scene-a'], baseline.sceneDependencyDigestsById['scene-a']);
  assert.notEqual(revisionSnapshot.dependencyDigest, baseline.dependencyDigest);

  const manifestChanged = fixture();
  manifestChanged.manifestRevision = digest('manifest-r2');
  const manifestSnapshot = module.createAtlasBookSnapshot(manifestChanged);
  assert.notEqual(manifestSnapshot.dependencyDigest, baseline.dependencyDigest);
});

test('WP-401 verifier rejects every digest-bearing field after tampering', async () => {
  const module = await loadModule();
  const baseline = module.createAtlasBookSnapshot(fixture());
  const mutants = [
    { ...clone(baseline), snapshotId: digest('forged-snapshot') },
    { ...clone(baseline), orderDigest: digest('forged-order') },
    { ...clone(baseline), dependencyDigest: digest('forged-dependencies') },
    {
      ...clone(baseline),
      sceneDependencyDigestsById: { ...baseline.sceneDependencyDigestsById, 'scene-a': digest('forged-scene') },
    },
    {
      ...clone(baseline),
      sceneRevisionsById: { ...baseline.sceneRevisionsById, 'scene-a': digest('scene-a-r9') },
    },
  ];
  for (const mutant of mutants) {
    assert.throws(
      () => module.verifyAtlasBookSnapshot(mutant),
      (error) => error.code === 'E_ATLAS_BOOK_SNAPSHOT_DIGEST_MISMATCH',
    );
  }
});

test('WP-401 stale gate rejects each changed exact identity dimension', async () => {
  const module = await loadModule();
  const snapshot = module.createAtlasBookSnapshot(fixture());
  const current = identity(snapshot);
  assert.deepEqual(module.assessAtlasBookSnapshotCurrent(snapshot, current), {
    ok: true,
    code: 'ATLAS_BOOK_SNAPSHOT_CURRENT',
    snapshotId: snapshot.snapshotId,
    identity: current,
  });
  for (const [field, value, reason] of [
    ['projectId', 'other-project', 'PROJECT_CHANGED'],
    ['projectRevisionId', digest('project-r2'), 'PROJECT_REVISION_CHANGED'],
    ['manifestRevision', digest('manifest-r2'), 'MANIFEST_REVISION_CHANGED'],
    ['orderDigest', digest('order-r2'), 'SCENE_ORDER_CHANGED'],
    ['dependencyDigest', digest('dependencies-r2'), 'DEPENDENCIES_CHANGED'],
  ]) {
    const result = module.assessAtlasBookSnapshotCurrent(snapshot, { ...current, [field]: value });
    assert.deepEqual(result, {
      ok: false,
      code: 'E_ATLAS_BOOK_SNAPSHOT_STALE',
      reason,
      snapshotId: snapshot.snapshotId,
    });
    assert.throws(
      () => module.assertAtlasBookSnapshotCurrent(snapshot, { ...current, [field]: value }),
      (error) => error.code === 'E_ATLAS_BOOK_SNAPSHOT_STALE' && error.detail === reason,
    );
  }
});

test('WP-401 rejects malformed, incomplete, duplicated and unordered snapshot inputs', async () => {
  const module = await loadModule();
  const cases = [];
  cases.push([null, 'E_ATLAS_BOOK_SNAPSHOT_INPUT_INVALID']);
  cases.push([{ ...fixture(), unknown: true }, 'E_ATLAS_BOOK_SNAPSHOT_INPUT_INVALID']);
  cases.push([{ ...fixture(), projectId: ' wp401-project ' }, 'E_ATLAS_BOOK_SNAPSHOT_PROJECT_ID_INVALID']);
  cases.push([{ ...fixture(), projectRevisionId: 'not-a-digest' }, 'E_ATLAS_BOOK_SNAPSHOT_PROJECT_REVISION_INVALID']);
  cases.push([{ ...fixture(), sceneOrder: ['scene-a', 'scene-a'] }, 'E_ATLAS_BOOK_SNAPSHOT_SCENE_ORDER_DUPLICATE']);
  const revisionGap = fixture(); delete revisionGap.sceneRevisionsById['scene-b'];
  cases.push([revisionGap, 'E_ATLAS_BOOK_SNAPSHOT_REVISION_COVERAGE']);
  const dependencyGap = fixture(); delete dependencyGap.dependenciesBySceneId['scene-b'];
  cases.push([dependencyGap, 'E_ATLAS_BOOK_SNAPSHOT_DEPENDENCY_COVERAGE']);
  const duplicateDependency = fixture();
  duplicateDependency.dependenciesBySceneId['scene-b'] = [digest('entity-anna'), digest('entity-anna')];
  cases.push([duplicateDependency, 'E_ATLAS_BOOK_SNAPSHOT_DEPENDENCY_DUPLICATE']);
  const unorderedDependency = fixture();
  unorderedDependency.dependenciesBySceneId['scene-b'] = [digest('z'), digest('a')].sort().reverse();
  cases.push([unorderedDependency, 'E_ATLAS_BOOK_SNAPSHOT_DEPENDENCY_ORDER']);
  for (const [input, expectedCode] of cases) {
    assert.throws(() => module.createAtlasBookSnapshot(input), (error) => error.code === expectedCode, expectedCode);
  }
});

test('WP-401 rejects accessor-backed inputs without invoking author-controlled getters', async () => {
  const module = await loadModule();
  let topInvoked = false;
  const top = fixture();
  Object.defineProperty(top, 'projectId', { enumerable: true, get() { topInvoked = true; return 'leak'; } });
  assert.throws(() => module.createAtlasBookSnapshot(top), (error) => error.code === 'E_ATLAS_BOOK_SNAPSHOT_INPUT_INVALID');
  assert.equal(topInvoked, false);

  let mapInvoked = false;
  const map = fixture();
  Object.defineProperty(map.sceneRevisionsById, 'scene-a', { enumerable: true, get() { mapInvoked = true; return digest('leak'); } });
  assert.throws(() => module.createAtlasBookSnapshot(map), (error) => error.code === 'E_ATLAS_BOOK_SNAPSHOT_SCENE_REVISIONS_INVALID');
  assert.equal(mapInvoked, false);

  let arrayInvoked = false;
  const array = fixture();
  Object.defineProperty(array.sceneOrder, '0', { enumerable: true, get() { arrayInvoked = true; return 'scene-a'; } });
  assert.throws(() => module.createAtlasBookSnapshot(array), (error) => error.code === 'E_ATLAS_BOOK_SNAPSHOT_SCENE_ORDER_INVALID');
  assert.equal(arrayInvoked, false);
});

test('WP-401 empty book is explicit and still has non-zero identity denominators', async () => {
  const module = await loadModule();
  const input = fixture();
  input.sceneOrder = [];
  input.sceneRevisionsById = {};
  input.dependenciesBySceneId = {};
  const snapshot = module.createAtlasBookSnapshot(input);
  assert.equal(snapshot.sceneCount, 0);
  assert.deepEqual(snapshot.sceneOrder, []);
  assert.match(snapshot.orderDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.match(snapshot.dependencyDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.match(snapshot.snapshotId, /^sha256:[a-f0-9]{64}$/u);
});
