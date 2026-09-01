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

async function fixture() {
  const [associationsModule, snapshotModule] = await Promise.all([
    importRepo('src/core/atlas-associations-v1.mjs'),
    importRepo('src/core/atlas-book-snapshot-v1.mjs'),
  ]);
  const snapshot = snapshotModule.createAtlasBookSnapshot({
    projectId: 'wp500-project',
    projectRevisionId: digest('project-r7'),
    manifestRevision: digest('manifest-r7'),
    sceneOrder: ['scene-a', 'scene-b'],
    sceneRevisionsById: { 'scene-a': digest('scene-a-r3'), 'scene-b': digest('scene-b-r2') },
    dependenciesBySceneId: { 'scene-a': [], 'scene-b': [] },
  });
  const currentSnapshotIdentity = {
    projectId: snapshot.projectId,
    projectRevisionId: snapshot.projectRevisionId,
    manifestRevision: snapshot.manifestRevision,
    orderDigest: snapshot.orderDigest,
    dependencyDigest: snapshot.dependencyDigest,
  };
  const scopeBase = { projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId };
  const associations = [
    {
      associationId: 'z-book', associationKind: 'foreshadows', direction: 'DIRECTED',
      sourceEntityId: 'character-a', targetEntityId: 'event-z', evidenceAnchorIds: ['anchor-2', 'anchor-1'],
      scope: { kind: 'BOOK', ...scopeBase },
    },
    {
      associationId: 'a-scene', associationKind: 'contrasts', direction: 'UNDIRECTED',
      sourceEntityId: 'zeta', targetEntityId: 'alpha', evidenceAnchorIds: ['anchor-3'],
      scope: { kind: 'SCENE', ...scopeBase, sceneId: 'scene-a', sceneRevision: snapshot.sceneRevisionsById['scene-a'] },
    },
    {
      associationId: 'm-fragment', associationKind: 'echoes', direction: 'DIRECTED',
      sourceEntityId: 'motif-a', targetEntityId: 'motif-b', evidenceAnchorIds: ['anchor-4'],
      scope: {
        kind: 'FRAGMENT', ...scopeBase, sceneId: 'scene-a', sceneRevision: snapshot.sceneRevisionsById['scene-a'],
        anchorLineageId: 'lineage-a', startOffset: 10, endOffset: 30,
      },
    },
  ];
  return { associationsModule, snapshot, currentSnapshotIdentity, associations, scopeBase };
}

test('WP-500 contract: deterministic book, scene and fragment scopes inherit without cross-scene leakage', async () => {
  const { associationsModule: module, snapshot, currentSnapshotIdentity, associations, scopeBase } = await fixture();
  const input = { snapshot, currentSnapshotIdentity, associations };
  const projection = module.compileAtlasAssociations(input);
  assert.deepEqual(module.compileAtlasAssociations({ ...input, associations: [...associations].reverse() }), projection);
  assert.deepEqual(projection.associations.map((row) => row.associationId), ['a-scene', 'm-fragment', 'z-book']);
  assert.deepEqual(projection.scopeDenominator, { book: 1, scene: 1, fragment: 1, total: 3 });
  assert.deepEqual(projection.associations[0].evidenceAnchorIds, ['anchor-3']);
  assert.equal(projection.associations[0].sourceEntityId, 'alpha');
  assert.equal(module.verifyAtlasAssociationsProjection(projection, snapshot), projection);

  const book = module.queryAtlasAssociations({
    snapshot, currentSnapshotIdentity, projection, focusScope: { kind: 'BOOK', ...scopeBase },
  });
  assert.deepEqual(book.applicableAssociations.map((row) => row.associationId), ['z-book']);
  const sceneA = module.queryAtlasAssociations({
    snapshot, currentSnapshotIdentity, projection,
    focusScope: { kind: 'SCENE', ...scopeBase, sceneId: 'scene-a', sceneRevision: snapshot.sceneRevisionsById['scene-a'] },
  });
  assert.deepEqual(sceneA.applicableAssociations.map((row) => row.associationId), ['a-scene', 'z-book']);
  const fragment = module.queryAtlasAssociations({
    snapshot, currentSnapshotIdentity, projection,
    focusScope: {
      kind: 'FRAGMENT', ...scopeBase, sceneId: 'scene-a', sceneRevision: snapshot.sceneRevisionsById['scene-a'],
      anchorLineageId: 'lineage-a', startOffset: 12, endOffset: 20,
    },
  });
  assert.deepEqual(fragment.applicableAssociations.map((row) => row.associationId), ['a-scene', 'm-fragment', 'z-book']);
  assert.equal(module.verifyAtlasAssociationQuery(fragment, projection, snapshot), fragment);
  const sceneB = module.queryAtlasAssociations({
    snapshot, currentSnapshotIdentity, projection,
    focusScope: { kind: 'SCENE', ...scopeBase, sceneId: 'scene-b', sceneRevision: snapshot.sceneRevisionsById['scene-b'] },
  });
  assert.deepEqual(sceneB.applicableAssociations.map((row) => row.associationId), ['z-book']);
  assert.equal(projection.authority.productMutation, false);
  assert.equal(projection.authority.persistence, false);
  assert.equal(Object.isFrozen(projection), true);
});

test('WP-500 empty and strict boundaries are deterministic and fail closed', async () => {
  const { associationsModule: module, snapshot, currentSnapshotIdentity, associations } = await fixture();
  const empty = module.compileAtlasAssociations({ snapshot, currentSnapshotIdentity, associations: [] });
  assert.deepEqual(empty.scopeDenominator, { book: 0, scene: 0, fragment: 0, total: 0 });
  assert.deepEqual(empty.sceneAssociationIdsByScene, { 'scene-a': [], 'scene-b': [] });
  assert.throws(() => module.compileAtlasAssociations({ snapshot, currentSnapshotIdentity, associations, unknown: true }));
  const sparse = new Array(1);
  assert.throws(() => module.compileAtlasAssociations({ snapshot, currentSnapshotIdentity, associations: sparse }));
  const accessor = { snapshot, currentSnapshotIdentity, associations };
  Object.defineProperty(accessor, 'associations', { enumerable: true, get: () => associations });
  assert.throws(() => module.compileAtlasAssociations(accessor));
  const nonNfc = clone(associations); nonNfc[0].associationId = 'Cafe\u0301';
  assert.throws(() => module.compileAtlasAssociations({ snapshot, currentSnapshotIdentity, associations: nonNfc }));
  assert.throws(() => module.compileAtlasAssociations({
    snapshot, currentSnapshotIdentity, associations: [...associations, { ...clone(associations[0]), associationId: associations[0].associationId }],
  }), (error) => error.code === 'E_ATLAS_ASSOCIATION_ID_DUPLICATE');
  const semanticDuplicate = { ...clone(associations[0]), associationId: 'different-id', evidenceAnchorIds: ['other-evidence'] };
  assert.throws(() => module.compileAtlasAssociations({
    snapshot, currentSnapshotIdentity, associations: [...associations, semanticDuplicate],
  }), (error) => error.code === 'E_ATLAS_ASSOCIATION_SEMANTIC_DUPLICATE');
});

test('WP-500 rejects stale scope identities, invalid fragments, self edges and recomputed internal tampering', async () => {
  const { associationsModule: module, snapshot, currentSnapshotIdentity, associations } = await fixture();
  for (const mutated of [
    (() => { const rows = clone(associations); rows[1].scope.sceneRevision = digest('stale'); return rows; })(),
    (() => { const rows = clone(associations); rows[2].scope.endOffset = rows[2].scope.startOffset; return rows; })(),
    (() => { const rows = clone(associations); rows[0].targetEntityId = rows[0].sourceEntityId; return rows; })(),
  ]) assert.throws(() => module.compileAtlasAssociations({ snapshot, currentSnapshotIdentity, associations: mutated }));
  const staleIdentity = { ...currentSnapshotIdentity, manifestRevision: digest('stale-manifest') };
  assert.throws(() => module.compileAtlasAssociations({ snapshot, currentSnapshotIdentity: staleIdentity, associations }));
  const projection = clone(module.compileAtlasAssociations({ snapshot, currentSnapshotIdentity, associations }));
  projection.bookAssociationIds = [];
  const hashModule = await importRepo('src/core/browser-safe-hash.mjs');
  const { projectionDigest, ...identity } = projection;
  projection.projectionDigest = `sha256:${hashModule.hashCanonicalValue(identity)}`;
  assert.throws(() => module.verifyAtlasAssociationsProjection(projection, snapshot), (error) => error.code === 'E_ATLAS_ASSOCIATIONS_INDEX_MISMATCH');
  const query = clone(module.queryAtlasAssociations({
    snapshot, currentSnapshotIdentity,
    projection: module.compileAtlasAssociations({ snapshot, currentSnapshotIdentity, associations }),
    focusScope: { kind: 'BOOK', projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId },
  }));
  query.applicableAssociations = [];
  query.applicableAssociationCount = 0;
  const { queryDigest, ...queryIdentity } = query;
  query.queryDigest = `sha256:${hashModule.hashCanonicalValue(queryIdentity)}`;
  assert.throws(
    () => module.verifyAtlasAssociationQuery(query, module.compileAtlasAssociations({ snapshot, currentSnapshotIdentity, associations }), snapshot),
    (error) => error.code === 'E_ATLAS_ASSOCIATION_QUERY_RESULT_MISMATCH',
  );
});

module.exports = { ROOT, digest, clone, fixture };
