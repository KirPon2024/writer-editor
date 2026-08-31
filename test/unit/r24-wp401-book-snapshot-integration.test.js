'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const importRepo = (relativePath) => import(pathToFileURL(path.join(ROOT, relativePath)).href);
const digest = (value) => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const SCENE_A = `tree-node-${'a'.repeat(32)}`;
const SCENE_B = `tree-node-${'b'.repeat(32)}`;

function bridgeInput() {
  return {
    projectId: 'wp401-integration-project',
    revisionScope: 'WHOLE_PROJECT',
    manifestRevision: digest('manifest-v1'),
    sceneOrder: [SCENE_B, SCENE_A],
    scenesById: {
      [SCENE_A]: {
        sceneId: SCENE_A,
        title: 'Opening',
        text: 'Private manuscript text A',
        sceneRevision: digest('scene-a-v1'),
      },
      [SCENE_B]: {
        sceneId: SCENE_B,
        title: 'Ending',
        text: 'Private manuscript text B',
        sceneRevision: digest('scene-b-v1'),
      },
    },
  };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function independentDigest(value) {
  return `sha256:${crypto.createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`;
}

test('WP-401 integration: validated product revision bridge becomes a privacy-minimal whole-book snapshot', async () => {
  const bridgeModule = await importRepo('src/product/atlasProductRevisionBridge.mjs');
  const snapshotModule = await importRepo('src/core/atlas-book-snapshot-v1.mjs');
  const bridged = bridgeModule.buildAtlasProductRevisionBridge(bridgeInput());
  assert.equal(bridged.ok, true);
  const dependencies = {
    [SCENE_A]: [digest('entity-anna'), digest('timeline-main')].sort(),
    [SCENE_B]: [digest('entity-anna')],
  };
  const snapshot = snapshotModule.createAtlasBookSnapshotFromRevisionBridge(bridged.value, dependencies);
  assert.equal(snapshot.projectId, bridged.value.projectId);
  assert.equal(snapshot.projectRevisionId, bridged.value.projectRevisionId);
  assert.equal(snapshot.manifestRevision, bridged.value.manifestRevision);
  assert.deepEqual(snapshot.sceneOrder, bridged.value.sceneOrder);
  assert.equal(snapshot.sceneRevisionsById[SCENE_A], bridged.value.scenesById[SCENE_A].sceneRevision);
  assert.equal(JSON.stringify(snapshot).includes('Private manuscript text'), false);
  assert.equal(JSON.stringify(snapshot).includes('Opening'), false);
  assert.deepEqual(snapshotModule.verifyAtlasBookSnapshot(snapshot), snapshot);
});

test('WP-401 differential oracle independently recomputes order, per-scene, book and snapshot digests', async () => {
  const snapshotModule = await importRepo('src/core/atlas-book-snapshot-v1.mjs');
  const input = {
    projectId: 'wp401-differential',
    projectRevisionId: digest('project'),
    manifestRevision: digest('manifest'),
    sceneOrder: ['scene-z', 'scene-a'],
    sceneRevisionsById: { 'scene-a': digest('a'), 'scene-z': digest('z') },
    dependenciesBySceneId: {
      'scene-a': [digest('dep-a')],
      'scene-z': [digest('dep-z1'), digest('dep-z2')].sort(),
    },
  };
  const snapshot = snapshotModule.createAtlasBookSnapshot(input);
  const orderDigest = independentDigest({
    schemaVersion: snapshotModule.ATLAS_BOOK_ORDER_SCHEMA_VERSION,
    projectId: input.projectId,
    sceneOrder: input.sceneOrder,
  });
  const sceneDependencyDigestsById = {};
  for (const sceneId of input.sceneOrder) {
    sceneDependencyDigestsById[sceneId] = independentDigest({
      schemaVersion: snapshotModule.ATLAS_SCENE_DEPENDENCY_SCHEMA_VERSION,
      projectId: input.projectId,
      sceneId,
      sceneRevision: input.sceneRevisionsById[sceneId],
      dependencyDigests: input.dependenciesBySceneId[sceneId],
    });
  }
  const dependencyDigest = independentDigest({
    schemaVersion: snapshotModule.ATLAS_BOOK_DEPENDENCY_SCHEMA_VERSION,
    projectId: input.projectId,
    manifestRevision: input.manifestRevision,
    orderedSceneDependencies: input.sceneOrder.map((sceneId) => ({
      sceneId,
      digest: sceneDependencyDigestsById[sceneId],
    })),
  });
  const snapshotId = independentDigest({
    schemaVersion: snapshotModule.ATLAS_BOOK_SNAPSHOT_SCHEMA_VERSION,
    projectId: input.projectId,
    projectRevisionId: input.projectRevisionId,
    manifestRevision: input.manifestRevision,
    sceneCount: input.sceneOrder.length,
    orderDigest,
    dependencyDigest,
  });
  assert.equal(snapshot.orderDigest, orderDigest);
  assert.deepEqual(snapshot.sceneDependencyDigestsById, sceneDependencyDigestsById);
  assert.equal(snapshot.dependencyDigest, dependencyDigest);
  assert.equal(snapshot.snapshotId, snapshotId);
});

test('WP-401 large corpus remains deterministic, immutable and linearly bounded', async () => {
  const snapshotModule = await importRepo('src/core/atlas-book-snapshot-v1.mjs');
  const sceneCount = 4_000;
  const sceneOrder = [];
  const sceneRevisionsById = {};
  const dependenciesBySceneId = {};
  for (let index = 0; index < sceneCount; index += 1) {
    const sceneId = `scene-${String(index).padStart(5, '0')}`;
    sceneOrder.push(sceneId);
    sceneRevisionsById[sceneId] = digest(`revision-${index}`);
    dependenciesBySceneId[sceneId] = [
      digest(`entity-${index % 97}`),
      digest(`thread-${index % 211}`),
      digest(`time-${index % 31}`),
    ].sort();
  }
  const input = {
    projectId: 'wp401-large-corpus',
    projectRevisionId: digest('large-project-r1'),
    manifestRevision: digest('large-manifest-r1'),
    sceneOrder,
    sceneRevisionsById,
    dependenciesBySceneId,
  };
  const started = performance.now();
  const first = snapshotModule.createAtlasBookSnapshot(input);
  const elapsedMs = performance.now() - started;
  const second = snapshotModule.createAtlasBookSnapshot(input);
  assert.equal(first.sceneCount, sceneCount);
  assert.equal(Object.keys(first.sceneDependencyDigestsById).length, sceneCount);
  assert.equal(first.snapshotId, second.snapshotId);
  assert.equal(Object.isFrozen(first.dependenciesBySceneId[sceneOrder.at(-1)]), true);
  assert.equal(elapsedMs < 5_000, true, `large corpus took ${elapsedMs}ms`);
  console.log(`R24_WP401_LARGE_CORPUS_RECEIPT=${JSON.stringify({ sceneCount, dependencyCount: sceneCount * 3, elapsedMs: Math.round(elapsedMs), snapshotId: first.snapshotId })}`);
});

test('WP-401 rejects current-scene bridges and stale bridge replacement without publishing', async () => {
  const bridgeModule = await importRepo('src/product/atlasProductRevisionBridge.mjs');
  const snapshotModule = await importRepo('src/core/atlas-book-snapshot-v1.mjs');
  const source = bridgeInput();
  source.revisionScope = 'CURRENT_SCENE';
  source.sceneOrder = [SCENE_A];
  source.scenesById = { [SCENE_A]: source.scenesById[SCENE_A] };
  const currentScene = bridgeModule.buildAtlasProductRevisionBridge(source);
  assert.equal(currentScene.ok, true);
  assert.throws(
    () => snapshotModule.createAtlasBookSnapshotFromRevisionBridge(currentScene.value, { [SCENE_A]: [] }),
    (error) => error.code === 'E_ATLAS_BOOK_SNAPSHOT_WHOLE_PROJECT_REQUIRED',
  );

  const whole = bridgeModule.buildAtlasProductRevisionBridge(bridgeInput());
  const snapshot = snapshotModule.createAtlasBookSnapshotFromRevisionBridge(whole.value, {
    [SCENE_A]: [],
    [SCENE_B]: [],
  });
  const edited = bridgeInput();
  edited.scenesById[SCENE_A].text = 'Edited text';
  edited.scenesById[SCENE_A].sceneRevision = digest('scene-a-v2');
  const newer = bridgeModule.buildAtlasProductRevisionBridge(edited);
  assert.equal(newer.ok, true);
  const currentSnapshot = snapshotModule.createAtlasBookSnapshotFromRevisionBridge(newer.value, {
    [SCENE_A]: [],
    [SCENE_B]: [],
  });
  const result = snapshotModule.assessAtlasBookSnapshotCurrent(snapshot, {
    projectId: currentSnapshot.projectId,
    projectRevisionId: currentSnapshot.projectRevisionId,
    manifestRevision: currentSnapshot.manifestRevision,
    orderDigest: currentSnapshot.orderDigest,
    dependencyDigest: currentSnapshot.dependencyDigest,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'PROJECT_REVISION_CHANGED');
});

test('WP-401 bridge adapter rejects incomplete and accessor-backed revision bridges before traversal', async () => {
  const bridgeModule = await importRepo('src/product/atlasProductRevisionBridge.mjs');
  const snapshotModule = await importRepo('src/core/atlas-book-snapshot-v1.mjs');
  const built = bridgeModule.buildAtlasProductRevisionBridge(bridgeInput());
  assert.equal(built.ok, true);
  const dependencies = { [SCENE_A]: [], [SCENE_B]: [] };

  const incomplete = {
    ...built.value,
    sceneOrder: [SCENE_A],
  };
  assert.throws(
    () => snapshotModule.createAtlasBookSnapshotFromRevisionBridge(incomplete, dependencies),
    (error) => error.code === 'E_ATLAS_BOOK_SNAPSHOT_REVISION_BRIDGE_COVERAGE',
  );

  let invoked = false;
  const accessorOrder = built.value.sceneOrder.slice();
  Object.defineProperty(accessorOrder, '0', {
    enumerable: true,
    get() {
      invoked = true;
      return SCENE_A;
    },
  });
  const hostile = {
    ...built.value,
    sceneOrder: accessorOrder,
  };
  assert.throws(
    () => snapshotModule.createAtlasBookSnapshotFromRevisionBridge(hostile, dependencies),
    (error) => error.code === 'E_ATLAS_BOOK_SNAPSHOT_REVISION_BRIDGE_ORDER',
  );
  assert.equal(invoked, false);
});
