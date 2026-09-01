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
const identity = (snapshot) => ({ projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId, manifestRevision: snapshot.manifestRevision, orderDigest: snapshot.orderDigest, dependencyDigest: snapshot.dependencyDigest });

async function makeCorpus(count) {
  const [module, snapshotModule, timeModule] = await Promise.all([
    importRepo('src/core/atlas-threads-causality-v1.mjs'), importRepo('src/core/atlas-book-snapshot-v1.mjs'), importRepo('src/core/atlas-time-knowledge-v1.mjs'),
  ]);
  const snapshot = snapshotModule.createAtlasBookSnapshot({ projectId: `corpus-${count}`, projectRevisionId: digest(`book-${count}`), manifestRevision: digest(`manifest-${count}`), sceneOrder: ['s1'], sceneRevisionsById: { s1: digest(`scene-${count}`) }, dependenciesBySceneId: { s1: [] } });
  const base = { projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId };
  const evidenceAnchors = Array.from({ length: count }, (_, index) => ({ anchorId: `a-${String(index).padStart(5, '0')}`, anchorLineageId: `l-${index}`, sceneId: 's1', sceneRevision: snapshot.sceneRevisionsById.s1, startOffset: index, endOffset: index + 1 }));
  const cells = evidenceAnchors.map((anchor, index) => ({ cellId: `c-${String(index).padStart(5, '0')}`, propositionId: `p-${String(index).padStart(5, '0')}`, perspectiveEntityId: `e-${index % 100}`, epistemicState: index % 5 === 0 ? 'UNKNOWN' : 'KNOWN', modality: index % 2 === 0 ? 'ASSERTED' : 'INFERRED', evidenceAnchorIds: [anchor.anchorId], tripleTime: { storyTime: { certainty: 'EXACT', ordinal: index }, narrativeTime: { certainty: 'EXACT', ordinal: 0 }, knowledgeTime: { certainty: 'EXACT', ordinal: index } }, scope: { kind: 'BOOK', ...base } }));
  const timeKnowledgeProjection = timeModule.compileAtlasTimeKnowledge({ snapshot, currentSnapshotIdentity: identity(snapshot), evidenceAnchors, cells });
  const threads = Array.from({ length: count }, (_, index) => {
    const sourceIndex = index === count - 1 ? 0 : index;
    const targetIndex = index === count - 1 ? count - 1 : index + 1;
    return { threadId: `t-${String(index).padStart(5, '0')}`, threadKind: index % 2 === 0 ? 'PROMISE' : 'PLOT', state: index % 7 === 0 ? 'UNKNOWN' : 'OPEN', participantEntityIds: [`e-${index % 100}`], propositionIds: [`p-${String(sourceIndex).padStart(5, '0')}`, `p-${String(targetIndex).padStart(5, '0')}`], evidenceCellIds: [`c-${String(sourceIndex).padStart(5, '0')}`, `c-${String(targetIndex).padStart(5, '0')}`] };
  });
  const causalEdges = threads.map((thread, index) => ({ edgeId: `edge-${String(index).padStart(5, '0')}`, sourcePropositionId: thread.propositionIds[0], targetPropositionId: thread.propositionIds[1], relation: index % 2 === 0 ? 'CAUSES' : 'ENABLES', epistemicState: index % 3 === 0 ? 'UNKNOWN' : 'ASSERTED', evidenceCellIds: thread.evidenceCellIds }));
  return { module, snapshot, currentSnapshotIdentity: identity(snapshot), timeKnowledgeProjection, threads, causalEdges };
}

test('WP-502 integration: batch and incremental compilers are exactly equivalent', async () => {
  const f = await makeCorpus(240);
  const full = f.module.compileAtlasThreadsCausality({ snapshot: f.snapshot, currentSnapshotIdentity: f.currentSnapshotIdentity, timeKnowledgeProjection: f.timeKnowledgeProjection, threads: f.threads, causalEdges: f.causalEdges });
  const incremental = f.module.compileAtlasThreadsCausalityIncremental({ snapshot: f.snapshot, currentSnapshotIdentity: f.currentSnapshotIdentity, timeKnowledgeProjection: f.timeKnowledgeProjection, threadBatches: [f.threads.slice(0, 11), f.threads.slice(11, 170), f.threads.slice(170)], causalEdgeBatches: [f.causalEdges.slice(0, 79), f.causalEdges.slice(79)] });
  assert.deepEqual(incremental, full);
  assert.equal(Object.values(full.threadIdsByPropositionId).flat().length, 480);
  assert.equal(Object.values(full.causalEdgesBySourcePropositionId).flat().length, 240);
  assert.equal(full.denominator.edges, 240);
});

test('WP-502 differential oracle matches naive explicit-direct and thread filters', async () => {
  const f = await makeCorpus(180);
  const projection = f.module.compileAtlasThreadsCausality({ snapshot: f.snapshot, currentSnapshotIdentity: f.currentSnapshotIdentity, timeKnowledgeProjection: f.timeKnowledgeProjection, threads: f.threads, causalEdges: f.causalEdges });
  for (let index = 0; index < 180; index += 17) {
    const source = `p-${String(index).padStart(5, '0')}`;
    const target = `p-${String(index + 1).padStart(5, '0')}`;
    const result = f.module.queryAtlasThreadsCausality({ snapshot: f.snapshot, currentSnapshotIdentity: f.currentSnapshotIdentity, timeKnowledgeProjection: f.timeKnowledgeProjection, projection, threadId: '', sourcePropositionId: source, targetPropositionId: target });
    const naive = projection.causalEdges.filter((edge) => edge.sourcePropositionId === source && edge.targetPropositionId === target);
    assert.deepEqual(result.causalEdges, naive);
  }
  const absent = f.module.queryAtlasThreadsCausality({ snapshot: f.snapshot, currentSnapshotIdentity: f.currentSnapshotIdentity, timeKnowledgeProjection: f.timeKnowledgeProjection, projection, threadId: '', sourcePropositionId: 'p-00000', targetPropositionId: 'p-00002' });
  assert.equal(absent.relationState, 'UNKNOWN');
  assert.equal(absent.causalEdgeCount, 0);
});

test('WP-502 large corpus: 10,000 threads and edges remain deterministic within twenty seconds', async () => {
  const f = await makeCorpus(10_000);
  const startedAt = performance.now();
  const projection = f.module.compileAtlasThreadsCausality({ snapshot: f.snapshot, currentSnapshotIdentity: f.currentSnapshotIdentity, timeKnowledgeProjection: f.timeKnowledgeProjection, threads: f.threads, causalEdges: f.causalEdges });
  const elapsedMs = performance.now() - startedAt;
  assert.equal(projection.threadCount, 10_000);
  assert.equal(projection.edgeCount, 10_000);
  assert.equal(projection.denominator.promiseThreads, 5_000);
  assert.equal(projection.denominator.plotThreads, 5_000);
  assert.ok(elapsedMs < 20_000, `large corpus exceeded bound: ${elapsedMs}ms`);
  assert.throws(() => f.module.compileAtlasThreadsCausality({ snapshot: f.snapshot, currentSnapshotIdentity: f.currentSnapshotIdentity, timeKnowledgeProjection: f.timeKnowledgeProjection, threads: [...f.threads, f.threads[0]], causalEdges: f.causalEdges }), (error) => error.code === 'E_ATLAS_THREADS_CAUSALITY_THREAD_COUNT_BOUND');
});
