'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { pathToFileURL } = require('node:url');
const { fixture } = require('./r24-wp503-atlas-surface.test.js');

const ROOT = path.resolve(__dirname, '..', '..');
const importRepo = (relativePath) => import(pathToFileURL(path.join(ROOT, relativePath)).href);
const digest = (value) => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const identity = (snapshot) => ({ projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId, manifestRevision: snapshot.manifestRevision, orderDigest: snapshot.orderDigest, dependencyDigest: snapshot.dependencyDigest });

test('WP-503 renderer presentation keeps legitimate Unicode and exact shared-row parity', async () => {
  const module = await importRepo('src/renderer/atlasSurfacePresentationModel.mjs');
  const overview = {
    state: 'ready',
    summary: { sceneCount: 2, entityCount: 2, cooccurrencePairCount: 1, evidenceHealth: 'current' },
    topEntities: [
      { entityId: 'entity-anna', name: 'Анна', appearanceCount: 8, sceneCount: 2, entityKind: 'CHARACTER' },
      { entityId: 'entity-cafe', name: 'Café', appearanceCount: 3, sceneCount: 1, entityKind: 'PLACE' },
    ],
    topRelations: [{ pairId: 'pair-1', leftEntityId: 'entity-anna', rightEntityId: 'entity-cafe', leftName: 'Анна', rightName: 'Café', occurrenceCount: 2, sceneCount: 1 }],
    sceneCoverage: [{ sceneId: 'scene-1', title: 'Возвращение', entityCount: 2, observationCount: 4, evidenceHealth: 'current' }],
  };
  const presentation = module.buildAtlasSurfacePresentation({ overview, posture: 'SPLIT', view: 'GRAPH', viewportWidth: 1440 });
  assert.equal(module.assertAtlasSurfacePresentationParity(presentation), presentation);
  assert.equal(presentation.posture, 'SPLIT');
  assert.equal(presentation.rowCount, 4);
  assert.equal(presentation.rows.some((row) => row.title === 'Анна'), true);
  assert.equal(presentation.rows.some((row) => row.title === 'Café'), true);
  assert.equal(new Set(presentation.views.map((view) => view.rowSetDigest)).size, 1);
  const narrow = module.buildAtlasSurfacePresentation({ overview, posture: 'SPLIT', view: 'TABLE', viewportWidth: 900 });
  assert.equal(narrow.requestedPosture, 'SPLIT');
  assert.equal(narrow.posture, 'MANUSCRIPT');
  assert.equal(narrow.responsiveFallbackApplied, true);
  assert.deepEqual(narrow.rowIds, presentation.rowIds);
});

test('WP-503 differential oracle: every posture and representation resolves the same source rows', async () => {
  const f = await fixture();
  const projection = f.surfaceModule.compileAtlasSurface(f.input);
  const currentIdentity = { snapshotId: projection.snapshotId, projectRevisionId: projection.projectRevisionId, generation: projection.generation, sharedRowSetDigest: projection.sharedRowSetDigest };
  const naiveRows = projection.rows.map((row) => row.rowId).sort();
  for (const posture of Object.values(f.surfaceModule.ATLAS_SURFACE_POSTURE)) {
    for (const view of Object.values(f.surfaceModule.ATLAS_SURFACE_VIEW)) {
      const result = f.surfaceModule.projectAtlasSurfaceView({ projection, currentIdentity, posture, view });
      assert.deepEqual(result.rows.map((row) => row.rowId).sort(), naiveRows);
    }
  }
});

test('WP-503 large corpus compiles 10,001 shared rows within the bounded budget', async () => {
  const [surfaceModule, snapshotModule, associationsModule, timeModule, threadsModule] = await Promise.all([
    importRepo('src/core/atlas-surface-v1.mjs'), importRepo('src/core/atlas-book-snapshot-v1.mjs'),
    importRepo('src/core/atlas-associations-v1.mjs'), importRepo('src/core/atlas-time-knowledge-v1.mjs'),
    importRepo('src/core/atlas-threads-causality-v1.mjs'),
  ]);
  const count = 2_500;
  const snapshot = snapshotModule.createAtlasBookSnapshot({ projectId: 'wp503-large', projectRevisionId: digest('large-r1'), manifestRevision: digest('large-m1'), sceneOrder: ['s1'], sceneRevisionsById: { s1: digest('large-s1') }, dependenciesBySceneId: { s1: [] } });
  const currentSnapshotIdentity = identity(snapshot);
  const scope = { kind: 'BOOK', projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId };
  const evidenceAnchors = Array.from({ length: count + 1 }, (_, index) => ({ anchorId: `a-${String(index).padStart(5, '0')}`, anchorLineageId: `l-${index}`, sceneId: 's1', sceneRevision: snapshot.sceneRevisionsById.s1, startOffset: index, endOffset: index + 1 }));
  const cells = evidenceAnchors.map((anchor, index) => ({ cellId: `c-${String(index).padStart(5, '0')}`, propositionId: `p-${String(index).padStart(5, '0')}`, perspectiveEntityId: `e-${index % 100}`, epistemicState: index % 9 === 0 ? 'UNKNOWN' : 'KNOWN', modality: index % 2 === 0 ? 'ASSERTED' : 'INFERRED', evidenceAnchorIds: [anchor.anchorId], tripleTime: { storyTime: { certainty: 'EXACT', ordinal: index }, narrativeTime: { certainty: 'EXACT', ordinal: 0 }, knowledgeTime: { certainty: 'EXACT', ordinal: index } }, scope }));
  const timeKnowledgeProjection = timeModule.compileAtlasTimeKnowledge({ snapshot, currentSnapshotIdentity, evidenceAnchors, cells });
  const associations = Array.from({ length: count }, (_, index) => ({ associationId: `association-${String(index).padStart(5, '0')}`, associationKind: 'connects', direction: 'DIRECTED', sourceEntityId: `entity-${index}`, targetEntityId: `entity-${index + count}`, evidenceAnchorIds: [`a-${String(index).padStart(5, '0')}`], scope }));
  const associationsProjection = associationsModule.compileAtlasAssociations({ snapshot, currentSnapshotIdentity, associations });
  const threads = Array.from({ length: count }, (_, index) => ({ threadId: `thread-${String(index).padStart(5, '0')}`, threadKind: index % 2 ? 'PLOT' : 'PROMISE', state: index % 7 ? 'OPEN' : 'UNKNOWN', participantEntityIds: [`e-${index % 100}`], propositionIds: [`p-${String(index).padStart(5, '0')}`, `p-${String(index + 1).padStart(5, '0')}`], evidenceCellIds: [`c-${String(index).padStart(5, '0')}`, `c-${String(index + 1).padStart(5, '0')}`] }));
  const causalEdges = threads.map((thread, index) => ({ edgeId: `edge-${String(index).padStart(5, '0')}`, sourcePropositionId: thread.propositionIds[0], targetPropositionId: thread.propositionIds[1], relation: index % 2 ? 'ENABLES' : 'CAUSES', epistemicState: index % 5 ? 'ASSERTED' : 'UNKNOWN', evidenceCellIds: thread.evidenceCellIds }));
  const threadsCausalityProjection = threadsModule.compileAtlasThreadsCausality({ snapshot, currentSnapshotIdentity, timeKnowledgeProjection, threads, causalEdges });
  const startedAt = performance.now();
  const projection = surfaceModule.compileAtlasSurface({ snapshot, currentSnapshotIdentity, associationsProjection, timeKnowledgeProjection, threadsCausalityProjection, generation: 1 });
  const elapsedMs = performance.now() - startedAt;
  assert.equal(projection.denominator.totalRows, 10_001);
  assert.equal(projection.views.every((view) => view.rowCount === 10_001 && view.rowSetDigest === projection.sharedRowSetDigest), true);
  assert.ok(elapsedMs < 20_000, `Atlas surface large corpus exceeded budget: ${elapsedMs}ms`);
});

test('WP-503 renderer adapter remains read-only and keeps explicit keyboard/textual parity', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/renderer/editor.js'), 'utf8');
  const start = source.indexOf('function renderAtlasWorkspaceGraph');
  const end = source.indexOf('\nfunction normalizeManualMapWorkbench', start);
  assert.ok(start > 0 && end > start);
  const adapter = source.slice(start, end);
  for (const forbidden of [/dispatchUiCommand/u, /localStorage/u, /writeFileAtomic/u, /fetch\s*\(/u, /XMLHttpRequest/u, /indexedDB/u]) assert.doesNotMatch(adapter, forbidden);
  assert.match(adapter, /Equivalent list and table views are available/u);
  assert.match(adapter, /role', 'table'/u);
  assert.match(adapter, /ArrowLeft/u);
  assert.match(adapter, /ArrowRight/u);
});

