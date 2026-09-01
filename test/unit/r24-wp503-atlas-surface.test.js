'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const importRepo = (relativePath) => import(pathToFileURL(path.join(ROOT, relativePath)).href);
const digest = (value) => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const clone = (value) => JSON.parse(JSON.stringify(value));
const snapshotIdentity = (snapshot) => ({
  projectId: snapshot.projectId,
  projectRevisionId: snapshot.projectRevisionId,
  manifestRevision: snapshot.manifestRevision,
  orderDigest: snapshot.orderDigest,
  dependencyDigest: snapshot.dependencyDigest,
});

async function fixture(modules = null) {
  const loaded = modules || await Promise.all([
    importRepo('src/core/atlas-surface-v1.mjs'),
    importRepo('src/core/atlas-book-snapshot-v1.mjs'),
    importRepo('src/core/atlas-associations-v1.mjs'),
    importRepo('src/core/atlas-time-knowledge-v1.mjs'),
    importRepo('src/core/atlas-threads-causality-v1.mjs'),
  ]);
  const [surfaceModule, snapshotModule, associationsModule, timeModule, threadsModule] = loaded;
  const snapshot = snapshotModule.createAtlasBookSnapshot({
    projectId: 'wp503-book', projectRevisionId: digest('book-r8'), manifestRevision: digest('manifest-r8'),
    sceneOrder: ['scene-a', 'scene-b'],
    sceneRevisionsById: { 'scene-a': digest('scene-a-r5'), 'scene-b': digest('scene-b-r4') },
    dependenciesBySceneId: { 'scene-a': [], 'scene-b': [digest('scene-a-dependency')] },
  });
  const currentSnapshotIdentity = snapshotIdentity(snapshot);
  const scopeBase = { projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId };
  const associationsProjection = associationsModule.compileAtlasAssociations({
    snapshot,
    currentSnapshotIdentity,
    associations: [
      { associationId: 'a-door', associationKind: 'foreshadows', direction: 'DIRECTED', sourceEntityId: 'anna', targetEntityId: 'door', evidenceAnchorIds: ['a1'], scope: { kind: 'BOOK', ...scopeBase } },
      { associationId: 'a-key', associationKind: 'reveals', direction: 'DIRECTED', sourceEntityId: 'key', targetEntityId: 'secret', evidenceAnchorIds: ['a2'], scope: { kind: 'SCENE', ...scopeBase, sceneId: 'scene-b', sceneRevision: snapshot.sceneRevisionsById['scene-b'] } },
    ],
  });
  const evidenceAnchors = [
    { anchorId: 'a1', anchorLineageId: 'l1', sceneId: 'scene-a', sceneRevision: snapshot.sceneRevisionsById['scene-a'], startOffset: 0, endOffset: 4 },
    { anchorId: 'a2', anchorLineageId: 'l2', sceneId: 'scene-b', sceneRevision: snapshot.sceneRevisionsById['scene-b'], startOffset: 5, endOffset: 9 },
    { anchorId: 'a3', anchorLineageId: 'l3', sceneId: 'scene-b', sceneRevision: snapshot.sceneRevisionsById['scene-b'], startOffset: 10, endOffset: 14 },
  ];
  const cells = [
    { cellId: 'c1', propositionId: 'p-door', perspectiveEntityId: 'anna', epistemicState: 'KNOWN', modality: 'ASSERTED', evidenceAnchorIds: ['a1'], tripleTime: { storyTime: { certainty: 'EXACT', ordinal: 1 }, narrativeTime: { certainty: 'EXACT', ordinal: 0 }, knowledgeTime: { certainty: 'EXACT', ordinal: 1 } }, scope: { kind: 'SCENE', ...scopeBase, sceneId: 'scene-a', sceneRevision: snapshot.sceneRevisionsById['scene-a'] } },
    { cellId: 'c2', propositionId: 'p-key', perspectiveEntityId: 'anna', epistemicState: 'BELIEVED', modality: 'INFERRED', evidenceAnchorIds: ['a2'], tripleTime: { storyTime: { certainty: 'APPROXIMATE', ordinal: 2 }, narrativeTime: { certainty: 'EXACT', ordinal: 1 }, knowledgeTime: { certainty: 'OPEN', ordinal: 2 } }, scope: { kind: 'SCENE', ...scopeBase, sceneId: 'scene-b', sceneRevision: snapshot.sceneRevisionsById['scene-b'] } },
    { cellId: 'c3', propositionId: 'p-secret', perspectiveEntityId: 'boris', epistemicState: 'UNKNOWN', modality: 'POSSIBLE', evidenceAnchorIds: ['a3'], tripleTime: { storyTime: { certainty: 'UNKNOWN', ordinal: null }, narrativeTime: { certainty: 'EXACT', ordinal: 1 }, knowledgeTime: { certainty: 'UNKNOWN', ordinal: null } }, scope: { kind: 'BOOK', ...scopeBase } },
  ];
  const timeKnowledgeProjection = timeModule.compileAtlasTimeKnowledge({ snapshot, currentSnapshotIdentity, evidenceAnchors, cells });
  const threadsCausalityProjection = threadsModule.compileAtlasThreadsCausality({
    snapshot,
    currentSnapshotIdentity,
    timeKnowledgeProjection,
    threads: [
      { threadId: 'thread-door', threadKind: 'PROMISE', state: 'OPEN', participantEntityIds: ['anna'], propositionIds: ['p-door', 'p-key'], evidenceCellIds: ['c1', 'c2'] },
      { threadId: 'thread-secret', threadKind: 'PLOT', state: 'UNKNOWN', participantEntityIds: ['anna', 'boris'], propositionIds: ['p-key', 'p-secret'], evidenceCellIds: ['c2', 'c3'] },
    ],
    causalEdges: [
      { edgeId: 'edge-door-key', sourcePropositionId: 'p-door', targetPropositionId: 'p-key', relation: 'CAUSES', epistemicState: 'ASSERTED', evidenceCellIds: ['c1', 'c2'] },
      { edgeId: 'edge-key-secret', sourcePropositionId: 'p-key', targetPropositionId: 'p-secret', relation: 'ENABLES', epistemicState: 'UNKNOWN', evidenceCellIds: ['c2', 'c3'] },
    ],
  });
  const input = { snapshot, currentSnapshotIdentity, associationsProjection, timeKnowledgeProjection, threadsCausalityProjection, generation: 7 };
  return { surfaceModule, snapshotModule, associationsModule, timeModule, threadsModule, snapshot, currentSnapshotIdentity, associationsProjection, timeKnowledgeProjection, threadsCausalityProjection, input };
}

test('WP-503 exposes the bounded immutable Atlas surface contract', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'src/core/atlas-surface-v1.mjs')).href);
  assert.equal(module.ATLAS_SURFACE_NODE_ID, 'WP-503_ATLAS_SURFACE');
  assert.deepEqual(Object.values(module.ATLAS_SURFACE_POSTURE), ['MANUSCRIPT', 'SPLIT', 'FULL']);
  assert.deepEqual(Object.values(module.ATLAS_SURFACE_VIEW), ['GRAPH', 'LIST', 'TABLE']);
  assert.equal(module.ATLAS_SURFACE_FEATURE_INTEGRATION_MANIFEST_V1.domainOwner, 'DERIVED_PROJECTOR_AUTHORITY');
  assert.equal(module.ATLAS_SURFACE_FEATURE_INTEGRATION_MANIFEST_V1.writePath, 'PURE_RETURN_VALUE_ONLY');
});

test('WP-503 compiles one immutable shared row set for graph list and table', async () => {
  const f = await fixture();
  const projection = f.surfaceModule.compileAtlasSurface(f.input);
  assert.equal(projection.denominator.totalRows, 9);
  assert.deepEqual(projection.denominator, { associations: 2, timeKnowledgeCells: 3, threads: 2, causalEdges: 2, totalRows: 9, sheets: 4, views: 3 });
  assert.deepEqual(projection.views.map((view) => view.view), ['GRAPH', 'LIST', 'TABLE']);
  for (const view of projection.views) {
    assert.equal(view.rowSetDigest, projection.sharedRowSetDigest);
    assert.deepEqual(view.rowIds, projection.rows.map((row) => row.rowId));
  }
  assert.equal(f.surfaceModule.verifyAtlasSurfaceProjection(projection, f.snapshot, f.associationsProjection, f.timeKnowledgeProjection, f.threadsCausalityProjection), projection);
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.rows[0]), true);
  assert.equal(projection.authority.productMutation, false);
  assert.equal(projection.authority.persistence, false);
  assert.equal(projection.authority.rendererWiring, false);
  assert.equal(projection.authority.externalEffects, false);
});

test('WP-503 posture and view queries retain exact graph list table parity', async () => {
  const f = await fixture();
  const projection = f.surfaceModule.compileAtlasSurface(f.input);
  const currentIdentity = { snapshotId: projection.snapshotId, projectRevisionId: projection.projectRevisionId, generation: projection.generation, sharedRowSetDigest: projection.sharedRowSetDigest };
  const results = [];
  for (const posture of Object.values(f.surfaceModule.ATLAS_SURFACE_POSTURE)) {
    for (const view of Object.values(f.surfaceModule.ATLAS_SURFACE_VIEW)) {
      const result = f.surfaceModule.projectAtlasSurfaceView({ projection, currentIdentity, posture, view });
      assert.equal(f.surfaceModule.verifyAtlasSurfaceView(result, projection, currentIdentity), result);
      assert.equal(result.rowCount, projection.rows.length);
      assert.deepEqual(result.rowIds, projection.rows.map((row) => row.rowId));
      results.push(result);
    }
  }
  assert.equal(new Set(results.map((result) => result.sharedRowSetDigest)).size, 1);
});

test('WP-503 rejects stale generation, predecessor drift, parity drift and recomputed tamper', async () => {
  const f = await fixture();
  const projection = f.surfaceModule.compileAtlasSurface(f.input);
  const currentIdentity = { snapshotId: projection.snapshotId, projectRevisionId: projection.projectRevisionId, generation: projection.generation, sharedRowSetDigest: projection.sharedRowSetDigest };
  assert.throws(() => f.surfaceModule.assertAtlasSurfaceCurrent(projection, { ...currentIdentity, generation: 8 }), (error) => error.code === 'E_ATLAS_SURFACE_STALE');
  assert.throws(() => f.surfaceModule.projectAtlasSurfaceView({ projection, currentIdentity, posture: 'FLOATING', view: 'GRAPH' }));
  assert.throws(() => f.surfaceModule.projectAtlasSurfaceView({ projection, currentIdentity, posture: 'FULL', view: 'CARDS' }));
  const parityDrift = clone(projection);
  parityDrift.views[0].rowIds.pop();
  parityDrift.views[0].rowCount -= 1;
  assert.throws(() => f.surfaceModule.verifyAtlasSurfaceProjection(parityDrift, f.snapshot, f.associationsProjection, f.timeKnowledgeProjection, f.threadsCausalityProjection));
  const view = clone(f.surfaceModule.projectAtlasSurfaceView({ projection, currentIdentity, posture: 'SPLIT', view: 'TABLE' }));
  view.rows.pop();
  view.rowIds.pop();
  view.rowCount -= 1;
  assert.throws(() => f.surfaceModule.verifyAtlasSurfaceView(view, projection, currentIdentity), (error) => error.code === 'E_ATLAS_SURFACE_VIEW_RESULT_MISMATCH');
  const staleAssociations = clone(f.associationsProjection);
  staleAssociations.projectRevisionId = digest('stale');
  assert.throws(() => f.surfaceModule.compileAtlasSurface({ ...f.input, associationsProjection: staleAssociations }));
});

module.exports = { ROOT, digest, clone, snapshotIdentity, fixture };
