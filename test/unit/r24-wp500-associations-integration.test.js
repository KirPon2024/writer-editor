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

function identity(snapshot) {
  return {
    projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId,
    manifestRevision: snapshot.manifestRevision, orderDigest: snapshot.orderDigest,
    dependencyDigest: snapshot.dependencyDigest,
  };
}

test('WP-500 integration: real lineage and book snapshot bind author associations to one current revision', async () => {
  const [module, snapshotModule, anchorModule] = await Promise.all([
    importRepo('src/core/atlas-associations-v1.mjs'),
    importRepo('src/core/atlas-book-snapshot-v1.mjs'),
    importRepo('src/core/atlas-anchor-lineage-v1.mjs'),
  ]);
  const revision = {
    domain: { projectId: 'integration-book', entityId: 'scene-1' }, projectRevision: 8,
    entityRevision: 3, sourceRevision: 3, generation: 0, writerEpoch: 0,
  };
  const lineage = anchorModule.createAnchorLineage({
    anchorId: 'anchor-lineage-1', projectId: 'integration-book', sceneId: 'scene-1', birthRevision: revision,
  });
  const snapshot = snapshotModule.createAtlasBookSnapshot({
    projectId: 'integration-book', projectRevisionId: digest('book-r8'), manifestRevision: digest('manifest-r8'),
    sceneOrder: ['scene-1'], sceneRevisionsById: { 'scene-1': digest('scene-r3') },
    dependenciesBySceneId: { 'scene-1': [digest(JSON.stringify(lineage))] },
  });
  const base = { projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId };
  const associations = [{
    associationId: 'association-1', associationKind: 'depends-on', direction: 'DIRECTED',
    sourceEntityId: 'scene-1', targetEntityId: 'research-note-1', evidenceAnchorIds: [lineage.identity.anchorId],
    scope: {
      kind: 'FRAGMENT', ...base, sceneId: 'scene-1', sceneRevision: snapshot.sceneRevisionsById['scene-1'],
      anchorLineageId: lineage.identity.anchorId, startOffset: 4, endOffset: 24,
    },
  }];
  const projection = module.compileAtlasAssociations({ snapshot, currentSnapshotIdentity: identity(snapshot), associations });
  const inside = module.queryAtlasAssociations({
    snapshot, currentSnapshotIdentity: identity(snapshot), projection,
    focusScope: { ...associations[0].scope, startOffset: 8, endOffset: 16 },
  });
  const outside = module.queryAtlasAssociations({
    snapshot, currentSnapshotIdentity: identity(snapshot), projection,
    focusScope: { ...associations[0].scope, startOffset: 24, endOffset: 28 },
  });
  assert.equal(inside.applicableAssociationCount, 1);
  assert.equal(outside.applicableAssociationCount, 0);
  const staleSnapshot = snapshotModule.createAtlasBookSnapshot({
    projectId: 'integration-book', projectRevisionId: digest('book-r9'), manifestRevision: digest('manifest-r9'),
    sceneOrder: ['scene-1'], sceneRevisionsById: { 'scene-1': digest('scene-r4') }, dependenciesBySceneId: { 'scene-1': [] },
  });
  assert.throws(() => module.verifyAtlasAssociationsProjection(projection, staleSnapshot));
});

test('WP-500 differential oracle independently recomputes scope indexes and query applicability', async () => {
  const [module, snapshotModule] = await Promise.all([
    importRepo('src/core/atlas-associations-v1.mjs'), importRepo('src/core/atlas-book-snapshot-v1.mjs'),
  ]);
  const snapshot = snapshotModule.createAtlasBookSnapshot({
    projectId: 'differential-book', projectRevisionId: digest('differential-r1'), manifestRevision: digest('differential-manifest'),
    sceneOrder: ['s1', 's2'], sceneRevisionsById: { s1: digest('s1'), s2: digest('s2') }, dependenciesBySceneId: { s1: [], s2: [] },
  });
  const base = { projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId };
  const kinds = ['BOOK', 'SCENE', 'FRAGMENT'];
  const rows = Array.from({ length: 90 }, (_, index) => {
    const kind = kinds[index % kinds.length];
    const sceneId = index % 2 ? 's2' : 's1';
    const scope = kind === 'BOOK' ? { kind, ...base } : kind === 'SCENE'
      ? { kind, ...base, sceneId, sceneRevision: snapshot.sceneRevisionsById[sceneId] }
      : { kind, ...base, sceneId, sceneRevision: snapshot.sceneRevisionsById[sceneId], anchorLineageId: `lineage-${index % 5}`, startOffset: index, endOffset: index + 20 };
    return { associationId: `association-${String(index).padStart(3, '0')}`, associationKind: `kind-${index}`, direction: 'DIRECTED', sourceEntityId: `source-${index}`, targetEntityId: `target-${index}`, evidenceAnchorIds: [`evidence-${index}`], scope };
  });
  const projection = module.compileAtlasAssociations({ snapshot, currentSnapshotIdentity: identity(snapshot), associations: rows });
  const expected = { book: 0, scene: 0, fragment: 0, total: rows.length };
  for (const row of rows) expected[row.scope.kind.toLowerCase()] += 1;
  assert.deepEqual(projection.scopeDenominator, expected);
  for (const sceneId of snapshot.sceneOrder) {
    assert.deepEqual(projection.sceneAssociationIdsByScene[sceneId], projection.associations.filter((row) => row.scope.kind === 'SCENE' && row.scope.sceneId === sceneId).map((row) => row.associationId));
    assert.deepEqual(projection.fragmentAssociationIdsByScene[sceneId], projection.associations.filter((row) => row.scope.kind === 'FRAGMENT' && row.scope.sceneId === sceneId).map((row) => row.associationId));
  }
});

test('WP-500 large corpus: the admitted 10,000 association denominator is deterministic within five seconds', async () => {
  const [module, snapshotModule] = await Promise.all([
    importRepo('src/core/atlas-associations-v1.mjs'), importRepo('src/core/atlas-book-snapshot-v1.mjs'),
  ]);
  const snapshot = snapshotModule.createAtlasBookSnapshot({
    projectId: 'large-book', projectRevisionId: digest('large-r1'), manifestRevision: digest('large-manifest'),
    sceneOrder: ['large-scene'], sceneRevisionsById: { 'large-scene': digest('large-scene-r1') }, dependenciesBySceneId: { 'large-scene': [] },
  });
  const base = { projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId };
  const associations = Array.from({ length: module.ATLAS_ASSOCIATIONS_MAX_COUNT }, (_, index) => ({
    associationId: `large-${String(index).padStart(5, '0')}`, associationKind: `kind-${index}`,
    direction: 'DIRECTED', sourceEntityId: `source-${index}`, targetEntityId: `target-${index}`,
    evidenceAnchorIds: [`evidence-${index}`], scope: { kind: 'BOOK', ...base },
  }));
  const startedAt = performance.now();
  const projection = module.compileAtlasAssociations({ snapshot, currentSnapshotIdentity: identity(snapshot), associations });
  const elapsedMs = performance.now() - startedAt;
  assert.equal(projection.associationCount, 10_000);
  assert.equal(module.verifyAtlasAssociationsProjection(projection, snapshot), projection);
  assert.ok(elapsedMs < 5_000, `large corpus exceeded bound: ${elapsedMs}ms`);
  assert.throws(() => module.compileAtlasAssociations({
    snapshot, currentSnapshotIdentity: identity(snapshot), associations: [...associations, associations[0]],
  }), (error) => error.code === 'E_ATLAS_ASSOCIATIONS_COUNT_BOUND');
});
