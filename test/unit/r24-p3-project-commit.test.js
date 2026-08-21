'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  COMMIT_PHASES,
  MARKER_SCHEMA_VERSION,
  ProjectCommitError,
  classifyProjectCommitState,
  commitProjectTextAndManifest,
  markerPathFor,
} = require('../../src/core/project-commit-v1.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'r24-p3-commit-'));

test('happy path: full phase chain, marker commit point, fence advances', async () => {
  const dir = tmp();
  const scene = path.join(dir, 'scene.txt');
  const first = await commitProjectTextAndManifest({
    scenePath: scene,
    sceneContent: 'text one',
    revision: 1,
    persistManifest: async () => ({ persisted: true, manifest: { v: 1 } }),
  });
  assert.equal(first.success, true);
  assert.deepEqual([...first.phases], [
    COMMIT_PHASES.ADMIT,
    COMMIT_PHASES.PREPARE,
    COMMIT_PHASES.MANIFEST_PERSIST,
    COMMIT_PHASES.SCENE_PUBLISH,
    COMMIT_PHASES.MARKER,
    COMMIT_PHASES.ACK,
  ]);
  assert.equal(first.priorMarkerRevision, null);
  const marker = JSON.parse(fs.readFileSync(markerPathFor(scene), 'utf8'));
  assert.equal(marker.schemaVersion, MARKER_SCHEMA_VERSION);
  assert.equal(marker.revision, 1);
  assert.equal(fs.readFileSync(scene, 'utf8'), 'text one');
  assert.equal(classifyProjectCommitState(scene).classification, 'NEW_COMMITTED');

  const second = await commitProjectTextAndManifest({
    scenePath: scene,
    sceneContent: 'text two',
    revision: 2,
    persistManifest: async () => ({ persisted: true, manifest: { v: 2 } }),
  });
  assert.equal(second.priorMarkerRevision, 1);
});

test('fence regression is refused at admission and never overwrites the marker', async () => {
  const dir = tmp();
  const scene = path.join(dir, 'scene.txt');
  await commitProjectTextAndManifest({
    scenePath: scene,
    sceneContent: 'newer',
    revision: 5,
    persistManifest: async () => ({ persisted: false }),
  });
  const markerBefore = fs.readFileSync(markerPathFor(scene), 'utf8');
  await assert.rejects(
    commitProjectTextAndManifest({
      scenePath: scene,
      sceneContent: 'older attempt',
      revision: 5,
      persistManifest: async () => ({ persisted: false }),
    }),
    (e) => e instanceof ProjectCommitError && e.code === 'E_COMMIT_FENCE_REGRESSION',
  );
  assert.equal(fs.readFileSync(markerPathFor(scene), 'utf8'), markerBefore);
  assert.equal(fs.readFileSync(scene, 'utf8'), 'newer');
});

test('admission validates target, revision, content and manifest fn', async () => {
  const scene = path.join(tmp(), 'scene.txt');
  await assert.rejects(commitProjectTextAndManifest({ scenePath: '', sceneContent: 'x', revision: 1, persistManifest: async () => ({}) }), (e) => e.code === 'E_COMMIT_TARGET_REQUIRED');
  await assert.rejects(commitProjectTextAndManifest({ scenePath: scene, sceneContent: 'x', revision: -1, persistManifest: async () => ({}) }), (e) => e.code === 'E_COMMIT_REVISION_INVALID');
  await assert.rejects(commitProjectTextAndManifest({ scenePath: scene, sceneContent: 1, revision: 1, persistManifest: async () => ({}) }), (e) => e.code === 'E_COMMIT_CONTENT_SHAPE');
  await assert.rejects(commitProjectTextAndManifest({ scenePath: scene, sceneContent: 'x', revision: 1, persistManifest: null }), (e) => e.code === 'E_COMMIT_MANIFEST_FN_REQUIRED');
});

test('manifest persist failure leaves no marker, no scene write, no partial state', async () => {
  const dir = tmp();
  const scene = path.join(dir, 'scene.txt');
  await assert.rejects(
    commitProjectTextAndManifest({
      scenePath: scene,
      sceneContent: 'text',
      revision: 1,
      persistManifest: async () => { throw new Error('manifest authority refused'); },
    }),
    (e) => e.code === 'E_COMMIT_MANIFEST_PERSIST' && e.phase === 'MANIFEST_PERSIST',
  );
  assert.equal(fs.existsSync(scene), false);
  assert.equal(fs.existsSync(markerPathFor(scene)), false);
  assert.equal(classifyProjectCommitState(scene).classification, 'ROLLBACK_REQUIRED');
});

test('scene publish failure rolls the manifest back and never writes the marker', async () => {
  const dir = tmp();
  const scene = path.join(dir, 'scene.txt');
  let rolledBack = 0;
  let typed = null;
  const goodFs = require('node:fs/promises');
  const failingFs = { ...goodFs, rename: async () => { throw new Error('rename denied'); } };
  try {
    await commitProjectTextAndManifest({
      scenePath: scene,
      sceneContent: 'text',
      revision: 1,
      persistManifest: async () => ({ persisted: true, manifest: { v: 1 } }),
      rollbackManifest: async () => { rolledBack += 1; },
      fsAdapter: failingFs,
    });
    assert.fail('must throw');
  } catch (error) {
    typed = error;
  }
  assert.equal(typed.code, 'E_COMMIT_SCENE_PUBLISH');
  assert.equal(typed.rolledBack, true);
  assert.equal(rolledBack, 1);
  assert.equal(fs.existsSync(scene), false);
  assert.equal(fs.existsSync(markerPathFor(scene)), false);
});

test('marker digest disagreement is typed corruption, never silent', () => {
  const dir = tmp();
  const scene = path.join(dir, 'scene.txt');
  fs.writeFileSync(markerPathFor(scene), JSON.stringify({ schemaVersion: MARKER_SCHEMA_VERSION, revision: 3, sceneDigest: 'f'.repeat(64), manifestPersisted: false }));
  fs.writeFileSync(scene, 'different content');
  const cls = classifyProjectCommitState(scene);
  assert.equal(cls.classification, 'PARTIAL_CORRUPTION_DETECTED');
  fs.unlinkSync(scene);
  assert.equal(classifyProjectCommitState(scene).classification, 'PARTIAL_CORRUPTION_DETECTED');
});

test('absent marker with prepared temp is resumable; absent marker without is old', () => {
  const dir = tmp();
  const scene = path.join(dir, 'scene.txt');
  fs.writeFileSync(scene, 'committed');
  assert.equal(classifyProjectCommitState(scene).classification, 'OLD_COMMITTED');
  fs.writeFileSync(path.join(dir, 'scene.txt.p3-1-abcdef.tmp'), 'prepared');
  assert.equal(classifyProjectCommitState(scene).classification, 'RESUMABLE_PREPARED');
  fs.unlinkSync(scene);
  assert.equal(classifyProjectCommitState(scene).classification, 'RESUMABLE_PREPARED');
  fs.unlinkSync(path.join(dir, 'scene.txt.p3-1-abcdef.tmp'));
  assert.equal(classifyProjectCommitState(scene).classification, 'ROLLBACK_REQUIRED');
});

test('manifest persist order: manifest commits before scene publish (spy-proven)', async () => {
  const dir = tmp();
  const scene = path.join(dir, 'scene.txt');
  const order = [];
  const goodFs = require('node:fs/promises');
  const spy = { ...goodFs, rename: async (a, b) => { order.push('scene-rename'); return goodFs.rename(a, b); } };
  await commitProjectTextAndManifest({
    scenePath: scene,
    sceneContent: 'text',
    revision: 1,
    persistManifest: async () => { order.push('manifest-persist'); return { persisted: true, manifest: { v: 1 } }; },
    fsAdapter: spy,
  });
  assert.deepEqual(order.slice(0, 2), ['manifest-persist', 'scene-rename']);
});
