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
const identity = (snapshot) => ({
  projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId,
  manifestRevision: snapshot.manifestRevision, orderDigest: snapshot.orderDigest,
  dependencyDigest: snapshot.dependencyDigest,
});

test('WP-501 integration: WP-500 association and WP-501 knowledge projections share one exact snapshot without authority leakage', async () => {
  const [module, associationsModule, snapshotModule, lineageModule] = await Promise.all([
    importRepo('src/core/atlas-time-knowledge-v1.mjs'), importRepo('src/core/atlas-associations-v1.mjs'),
    importRepo('src/core/atlas-book-snapshot-v1.mjs'), importRepo('src/core/atlas-anchor-lineage-v1.mjs'),
  ]);
  const revision = {
    domain: { projectId: 'integration-book', entityId: 'scene-1' }, projectRevision: 9,
    entityRevision: 4, sourceRevision: 4, generation: 0, writerEpoch: 0,
  };
  const lineage = lineageModule.createAnchorLineage({
    anchorId: 'lineage-1', projectId: 'integration-book', sceneId: 'scene-1', birthRevision: revision,
  });
  const snapshot = snapshotModule.createAtlasBookSnapshot({
    projectId: 'integration-book', projectRevisionId: digest('book-r9'), manifestRevision: digest('manifest-r9'),
    sceneOrder: ['scene-1'], sceneRevisionsById: { 'scene-1': digest('scene-r4') },
    dependenciesBySceneId: { 'scene-1': [digest(JSON.stringify(lineage))] },
  });
  const scopeBase = { projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId };
  const associationProjection = associationsModule.compileAtlasAssociations({
    snapshot, currentSnapshotIdentity: identity(snapshot),
    associations: [{
      associationId: 'knows-link', associationKind: 'knows-about', direction: 'DIRECTED',
      sourceEntityId: 'entity-anna', targetEntityId: 'prop-key-hidden', evidenceAnchorIds: ['evidence-1'],
      scope: { kind: 'SCENE', ...scopeBase, sceneId: 'scene-1', sceneRevision: snapshot.sceneRevisionsById['scene-1'] },
    }],
  });
  const projection = module.compileAtlasTimeKnowledge({
    snapshot, currentSnapshotIdentity: identity(snapshot),
    evidenceAnchors: [{
      anchorId: 'evidence-1', anchorLineageId: lineage.identity.anchorId, sceneId: 'scene-1',
      sceneRevision: snapshot.sceneRevisionsById['scene-1'], startOffset: 3, endOffset: 21,
    }],
    cells: [{
      cellId: 'knowledge-1', propositionId: 'prop-key-hidden', perspectiveEntityId: 'entity-anna',
      epistemicState: 'KNOWN', modality: 'ASSERTED', evidenceAnchorIds: ['evidence-1'],
      tripleTime: {
        storyTime: { certainty: 'EXACT', ordinal: 7 }, narrativeTime: { certainty: 'EXACT', ordinal: 0 },
        knowledgeTime: { certainty: 'EXACT', ordinal: 4 },
      },
      scope: { kind: 'SCENE', ...scopeBase, sceneId: 'scene-1', sceneRevision: snapshot.sceneRevisionsById['scene-1'] },
    }],
  });
  assert.equal(projection.snapshotId, associationProjection.snapshotId);
  assert.equal(projection.cells[0].evidenceAnchorIds[0], associationProjection.associations[0].evidenceAnchorIds[0]);
  assert.equal(projection.authority.productMutation, false);
  const staleSnapshot = snapshotModule.createAtlasBookSnapshot({
    projectId: 'integration-book', projectRevisionId: digest('book-r10'), manifestRevision: digest('manifest-r10'),
    sceneOrder: ['scene-1'], sceneRevisionsById: { 'scene-1': digest('scene-r5') }, dependenciesBySceneId: { 'scene-1': [] },
  });
  assert.throws(() => module.verifyAtlasTimeKnowledgeProjection(projection, staleSnapshot));
});

test('WP-501 differential oracle and incremental compiler reproduce exact indexes and denominators', async () => {
  const [module, snapshotModule] = await Promise.all([
    importRepo('src/core/atlas-time-knowledge-v1.mjs'), importRepo('src/core/atlas-book-snapshot-v1.mjs'),
  ]);
  const snapshot = snapshotModule.createAtlasBookSnapshot({
    projectId: 'differential-book', projectRevisionId: digest('book-r1'), manifestRevision: digest('manifest-r1'),
    sceneOrder: ['s1', 's2', 's3'], sceneRevisionsById: { s1: digest('s1'), s2: digest('s2'), s3: digest('s3') },
    dependenciesBySceneId: { s1: [], s2: [], s3: [] },
  });
  const base = { projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId };
  const evidenceAnchors = [];
  const cells = [];
  const certainties = ['EXACT', 'APPROXIMATE', 'OPEN', 'UNKNOWN'];
  for (let index = 0; index < 120; index += 1) {
    const sceneOrdinal = index % 3;
    const sceneId = snapshot.sceneOrder[sceneOrdinal];
    const anchorId = `anchor-${String(index).padStart(3, '0')}`;
    evidenceAnchors.push({ anchorId, anchorLineageId: `lineage-${index}`, sceneId, sceneRevision: snapshot.sceneRevisionsById[sceneId], startOffset: index, endOffset: index + 1 });
    const storyCertainty = certainties[index % certainties.length];
    const knowledgeCertainty = certainties[(index + 1) % certainties.length];
    cells.push({
      cellId: `cell-${String(index).padStart(3, '0')}`, propositionId: `prop-${index % 7}`,
      perspectiveEntityId: `entity-${index % 5}`, epistemicState: index % 4 === 0 ? 'UNKNOWN' : 'KNOWN',
      modality: index % 2 === 0 ? 'ASSERTED' : 'INFERRED', evidenceAnchorIds: [anchorId],
      tripleTime: {
        storyTime: { certainty: storyCertainty, ordinal: storyCertainty === 'UNKNOWN' ? null : index },
        narrativeTime: { certainty: 'EXACT', ordinal: sceneOrdinal },
        knowledgeTime: { certainty: knowledgeCertainty, ordinal: knowledgeCertainty === 'UNKNOWN' ? null : index + 1 },
      },
      scope: { kind: 'BOOK', ...base },
    });
  }
  const full = module.compileAtlasTimeKnowledge({ snapshot, currentSnapshotIdentity: identity(snapshot), evidenceAnchors, cells });
  const incremental = module.compileAtlasTimeKnowledgeIncremental({
    snapshot, currentSnapshotIdentity: identity(snapshot), evidenceAnchors,
    cellBatches: [cells.slice(0, 17), cells.slice(17, 89), cells.slice(89)],
  });
  assert.deepEqual(incremental, full);
  for (const perspectiveEntityId of Object.keys(full.cellsByPerspectiveEntityId)) {
    assert.deepEqual(full.cellsByPerspectiveEntityId[perspectiveEntityId], full.cells.filter((row) => row.perspectiveEntityId === perspectiveEntityId).map((row) => row.cellId));
  }
  for (const propositionId of Object.keys(full.cellsByPropositionId)) {
    assert.deepEqual(full.cellsByPropositionId[propositionId], full.cells.filter((row) => row.propositionId === propositionId).map((row) => row.cellId));
  }
  assert.equal(Object.values(full.timeAxisDenominator).slice(0, 12).reduce((sum, value) => sum + value, 0), 360);
  assert.equal(full.evidenceDenominator.references, 120);
});

test('WP-501 large corpus: 10,000 evidence-bound cells remain deterministic within five seconds', async () => {
  const [module, snapshotModule] = await Promise.all([
    importRepo('src/core/atlas-time-knowledge-v1.mjs'), importRepo('src/core/atlas-book-snapshot-v1.mjs'),
  ]);
  const snapshot = snapshotModule.createAtlasBookSnapshot({
    projectId: 'large-book', projectRevisionId: digest('large-r1'), manifestRevision: digest('large-manifest'),
    sceneOrder: ['large-scene'], sceneRevisionsById: { 'large-scene': digest('large-scene-r1') },
    dependenciesBySceneId: { 'large-scene': [] },
  });
  const base = { projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId };
  const evidenceAnchors = Array.from({ length: module.ATLAS_TIME_KNOWLEDGE_MAX_CELLS }, (_, index) => ({
    anchorId: `large-anchor-${String(index).padStart(5, '0')}`, anchorLineageId: `large-lineage-${index}`,
    sceneId: 'large-scene', sceneRevision: snapshot.sceneRevisionsById['large-scene'], startOffset: index, endOffset: index + 1,
  }));
  const cells = evidenceAnchors.map((anchor, index) => ({
    cellId: `large-cell-${String(index).padStart(5, '0')}`, propositionId: `prop-${index}`,
    perspectiveEntityId: `entity-${index % 100}`, epistemicState: 'KNOWN', modality: 'ASSERTED',
    evidenceAnchorIds: [anchor.anchorId],
    tripleTime: {
      storyTime: { certainty: 'EXACT', ordinal: index }, narrativeTime: { certainty: 'EXACT', ordinal: 0 },
      knowledgeTime: { certainty: 'EXACT', ordinal: index },
    },
    scope: { kind: 'BOOK', ...base },
  }));
  const startedAt = performance.now();
  const projection = module.compileAtlasTimeKnowledge({ snapshot, currentSnapshotIdentity: identity(snapshot), evidenceAnchors, cells });
  const elapsedMs = performance.now() - startedAt;
  assert.equal(projection.cellCount, 10_000);
  assert.equal(projection.evidenceAnchorCount, 10_000);
  assert.equal(module.verifyAtlasTimeKnowledgeProjection(projection, snapshot), projection);
  assert.ok(elapsedMs < 5_000, `large corpus exceeded bound: ${elapsedMs}ms`);
  assert.throws(() => module.compileAtlasTimeKnowledge({
    snapshot, currentSnapshotIdentity: identity(snapshot), evidenceAnchors: [...evidenceAnchors, evidenceAnchors[0]], cells,
  }), (error) => error.code === 'E_ATLAS_TIME_KNOWLEDGE_EVIDENCE_ID_DUPLICATE');
});
