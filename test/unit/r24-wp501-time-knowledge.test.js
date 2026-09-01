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

function snapshotIdentity(snapshot) {
  return {
    projectId: snapshot.projectId,
    projectRevisionId: snapshot.projectRevisionId,
    manifestRevision: snapshot.manifestRevision,
    orderDigest: snapshot.orderDigest,
    dependencyDigest: snapshot.dependencyDigest,
  };
}

async function fixture() {
  const [module, snapshotModule] = await Promise.all([
    importRepo('src/core/atlas-time-knowledge-v1.mjs'),
    importRepo('src/core/atlas-book-snapshot-v1.mjs'),
  ]);
  const snapshot = snapshotModule.createAtlasBookSnapshot({
    projectId: 'wp501-book',
    projectRevisionId: digest('book-r4'),
    manifestRevision: digest('manifest-r4'),
    sceneOrder: ['scene-a', 'scene-b'],
    sceneRevisionsById: { 'scene-a': digest('scene-a-r2'), 'scene-b': digest('scene-b-r3') },
    dependenciesBySceneId: { 'scene-a': [], 'scene-b': [] },
  });
  const currentSnapshotIdentity = snapshotIdentity(snapshot);
  const scopeBase = { projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId };
  const evidenceAnchors = [
    { anchorId: 'anchor-a', anchorLineageId: 'lineage-a', sceneId: 'scene-a', sceneRevision: snapshot.sceneRevisionsById['scene-a'], startOffset: 4, endOffset: 18 },
    { anchorId: 'anchor-b', anchorLineageId: 'lineage-a', sceneId: 'scene-a', sceneRevision: snapshot.sceneRevisionsById['scene-a'], startOffset: 20, endOffset: 32 },
    { anchorId: 'anchor-c', anchorLineageId: 'lineage-b', sceneId: 'scene-b', sceneRevision: snapshot.sceneRevisionsById['scene-b'], startOffset: 2, endOffset: 16 },
  ];
  const cells = [
    {
      cellId: 'z-known', propositionId: 'prop-door-open', perspectiveEntityId: 'entity-anna',
      epistemicState: 'KNOWN', modality: 'ASSERTED', evidenceAnchorIds: ['anchor-a'],
      tripleTime: {
        storyTime: { certainty: 'EXACT', ordinal: 10 },
        narrativeTime: { certainty: 'EXACT', ordinal: 0 },
        knowledgeTime: { certainty: 'EXACT', ordinal: 1 },
      },
      scope: { kind: 'SCENE', ...scopeBase, sceneId: 'scene-a', sceneRevision: snapshot.sceneRevisionsById['scene-a'] },
    },
    {
      cellId: 'a-unknown', propositionId: 'prop-door-open', perspectiveEntityId: 'entity-boris',
      epistemicState: 'UNKNOWN', modality: 'POSSIBLE', evidenceAnchorIds: ['anchor-c'],
      tripleTime: {
        storyTime: { certainty: 'UNKNOWN', ordinal: null },
        narrativeTime: { certainty: 'EXACT', ordinal: 1 },
        knowledgeTime: { certainty: 'UNKNOWN', ordinal: null },
      },
      scope: { kind: 'BOOK', ...scopeBase },
    },
    {
      cellId: 'm-belief', propositionId: 'prop-key-hidden', perspectiveEntityId: 'entity-anna',
      epistemicState: 'BELIEVED', modality: 'INFERRED', evidenceAnchorIds: ['anchor-b'],
      tripleTime: {
        storyTime: { certainty: 'APPROXIMATE', ordinal: 15 },
        narrativeTime: { certainty: 'EXACT', ordinal: 0 },
        knowledgeTime: { certainty: 'OPEN', ordinal: 2 },
      },
      scope: {
        kind: 'FRAGMENT', ...scopeBase, sceneId: 'scene-a', sceneRevision: snapshot.sceneRevisionsById['scene-a'],
        anchorLineageId: 'lineage-a', startOffset: 18, endOffset: 36,
      },
    },
  ];
  return { module, snapshot, currentSnapshotIdentity, scopeBase, evidenceAnchors, cells };
}

test('WP-501 contract: triple-time axes remain distinct and evidence-bound perspective knowledge is deterministic', async () => {
  const { module, snapshot, currentSnapshotIdentity, evidenceAnchors, cells } = await fixture();
  const input = { snapshot, currentSnapshotIdentity, evidenceAnchors, cells };
  const projection = module.compileAtlasTimeKnowledge(input);
  const reversed = module.compileAtlasTimeKnowledge({
    ...input, evidenceAnchors: [...evidenceAnchors].reverse(), cells: [...cells].reverse(),
  });
  assert.deepEqual(reversed, projection);
  assert.deepEqual(projection.cells.map((row) => row.cellId), ['a-unknown', 'm-belief', 'z-known']);
  assert.deepEqual(projection.timeAxisDenominator, {
    storyExact: 1, storyApproximate: 1, storyOpen: 0, storyUnknown: 1,
    narrativeExact: 3, narrativeApproximate: 0, narrativeOpen: 0, narrativeUnknown: 0,
    knowledgeExact: 1, knowledgeApproximate: 0, knowledgeOpen: 1, knowledgeUnknown: 1,
    totalCells: 3,
  });
  assert.deepEqual(projection.evidenceDenominator, { anchors: 3, references: 3, cellsWithoutEvidence: 0 });
  assert.equal(projection.cells[0].epistemicState, 'UNKNOWN');
  assert.equal(projection.cells[0].tripleTime.knowledgeTime.ordinal, null);
  assert.equal(module.verifyAtlasTimeKnowledgeProjection(projection, snapshot), projection);
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.cells[0].tripleTime), true);
  assert.equal(projection.authority.productMutation, false);
  assert.equal(projection.authority.persistence, false);
});

test('WP-501 query: proposition and perspective filters intersect without inventing closed-world facts', async () => {
  const { module, snapshot, currentSnapshotIdentity, evidenceAnchors, cells } = await fixture();
  const projection = module.compileAtlasTimeKnowledge({ snapshot, currentSnapshotIdentity, evidenceAnchors, cells });
  const proposition = module.queryAtlasTimeKnowledge({
    snapshot, currentSnapshotIdentity, projection, propositionId: 'prop-door-open', perspectiveEntityId: '',
  });
  assert.deepEqual(proposition.applicableCells.map((row) => row.cellId), ['a-unknown', 'z-known']);
  assert.deepEqual(proposition.applicableCells.map((row) => row.epistemicState), ['UNKNOWN', 'KNOWN']);
  const perspective = module.queryAtlasTimeKnowledge({
    snapshot, currentSnapshotIdentity, projection, propositionId: '', perspectiveEntityId: 'entity-anna',
  });
  assert.deepEqual(perspective.applicableCells.map((row) => row.cellId), ['m-belief', 'z-known']);
  const intersection = module.queryAtlasTimeKnowledge({
    snapshot, currentSnapshotIdentity, projection, propositionId: 'prop-door-open', perspectiveEntityId: 'entity-anna',
  });
  assert.deepEqual(intersection.applicableCells.map((row) => row.cellId), ['z-known']);
  assert.equal(module.verifyAtlasTimeKnowledgeQuery(intersection, projection, snapshot), intersection);
  assert.throws(() => module.queryAtlasTimeKnowledge({
    snapshot, currentSnapshotIdentity, projection, propositionId: '', perspectiveEntityId: '',
  }), (error) => error.code === 'E_ATLAS_TIME_KNOWLEDGE_QUERY_FILTER_REQUIRED');
});

test('WP-501 strict boundaries reject accessors, sparse data, non-NFC, unevidenced cells and unused evidence', async () => {
  const { module, snapshot, currentSnapshotIdentity, evidenceAnchors, cells } = await fixture();
  assert.throws(() => module.compileAtlasTimeKnowledge({ snapshot, currentSnapshotIdentity, evidenceAnchors, cells, extra: true }));
  const sparse = new Array(1);
  assert.throws(() => module.compileAtlasTimeKnowledge({ snapshot, currentSnapshotIdentity, evidenceAnchors, cells: sparse }));
  const accessor = { snapshot, currentSnapshotIdentity, evidenceAnchors, cells };
  Object.defineProperty(accessor, 'cells', { enumerable: true, get: () => cells });
  assert.throws(() => module.compileAtlasTimeKnowledge(accessor));
  const nonNfc = clone(cells); nonNfc[0].propositionId = 'Cafe\u0301';
  assert.throws(() => module.compileAtlasTimeKnowledge({ snapshot, currentSnapshotIdentity, evidenceAnchors, cells: nonNfc }));
  const noEvidence = clone(cells); noEvidence[0].evidenceAnchorIds = [];
  assert.throws(() => module.compileAtlasTimeKnowledge({ snapshot, currentSnapshotIdentity, evidenceAnchors, cells: noEvidence }));
  assert.throws(() => module.compileAtlasTimeKnowledge({
    snapshot, currentSnapshotIdentity,
    evidenceAnchors: [...evidenceAnchors, { ...clone(evidenceAnchors[0]), anchorId: 'unused-anchor' }], cells,
  }), (error) => error.code === 'E_ATLAS_TIME_KNOWLEDGE_UNUSED_EVIDENCE');
});

test('WP-501 hostile temporal and scope inputs fail closed', async () => {
  const { module, snapshot, currentSnapshotIdentity, evidenceAnchors, cells } = await fixture();
  const cases = [
    (() => { const rows = clone(cells); rows[0].tripleTime.narrativeTime.ordinal = 1; return { evidenceAnchors, cells: rows }; })(),
    (() => { const rows = clone(cells); rows[0].tripleTime.storyTime = { certainty: 'UNKNOWN', ordinal: 0 }; return { evidenceAnchors, cells: rows }; })(),
    (() => { const rows = clone(cells); rows[2].scope.startOffset = 24; return { evidenceAnchors, cells: rows }; })(),
    (() => { const anchors = clone(evidenceAnchors); anchors[0].sceneRevision = digest('stale'); return { evidenceAnchors: anchors, cells }; })(),
    (() => { const rows = clone(cells); rows[0].evidenceAnchorIds = ['anchor-a', 'anchor-c']; rows[1].evidenceAnchorIds = ['anchor-c']; return { evidenceAnchors, cells: rows }; })(),
  ];
  for (const candidate of cases) {
    assert.throws(() => module.compileAtlasTimeKnowledge({ snapshot, currentSnapshotIdentity, ...candidate }));
  }
  const semanticDuplicate = { ...clone(cells[0]), cellId: 'duplicate-semantic', evidenceAnchorIds: ['anchor-a'] };
  assert.throws(() => module.compileAtlasTimeKnowledge({
    snapshot, currentSnapshotIdentity, evidenceAnchors, cells: [...cells, semanticDuplicate],
  }), (error) => error.code === 'E_ATLAS_TIME_KNOWLEDGE_SEMANTIC_DUPLICATE');
});

test('WP-501 stale projection, recomputed index tamper and query tamper are rejected', async () => {
  const { module, snapshot, currentSnapshotIdentity, evidenceAnchors, cells } = await fixture();
  const projection = module.compileAtlasTimeKnowledge({ snapshot, currentSnapshotIdentity, evidenceAnchors, cells });
  assert.throws(() => module.compileAtlasTimeKnowledge({
    snapshot, currentSnapshotIdentity: { ...currentSnapshotIdentity, orderDigest: digest('stale-order') }, evidenceAnchors, cells,
  }));
  const tampered = clone(projection);
  tampered.cellsByPropositionId['prop-door-open'] = [];
  const hashModule = await importRepo('src/core/browser-safe-hash.mjs');
  const { projectionDigest, ...projectionIdentity } = tampered;
  tampered.projectionDigest = `sha256:${hashModule.hashCanonicalValue(projectionIdentity)}`;
  assert.throws(() => module.verifyAtlasTimeKnowledgeProjection(tampered, snapshot));
  const query = clone(module.queryAtlasTimeKnowledge({
    snapshot, currentSnapshotIdentity, projection, propositionId: 'prop-door-open', perspectiveEntityId: '',
  }));
  query.applicableCells = [];
  query.applicableCellCount = 0;
  const { queryDigest, ...queryIdentity } = query;
  query.queryDigest = `sha256:${hashModule.hashCanonicalValue(queryIdentity)}`;
  assert.throws(() => module.verifyAtlasTimeKnowledgeQuery(query, projection, snapshot), (error) => (
    error.code === 'E_ATLAS_TIME_KNOWLEDGE_QUERY_RESULT_MISMATCH'
  ));
});

module.exports = { ROOT, digest, clone, fixture, snapshotIdentity };
