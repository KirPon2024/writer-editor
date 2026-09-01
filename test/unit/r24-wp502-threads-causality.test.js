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
  projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId,
  manifestRevision: snapshot.manifestRevision, orderDigest: snapshot.orderDigest,
  dependencyDigest: snapshot.dependencyDigest,
});

async function fixture() {
  const [module, snapshotModule, timeModule] = await Promise.all([
    importRepo('src/core/atlas-threads-causality-v1.mjs'),
    importRepo('src/core/atlas-book-snapshot-v1.mjs'),
    importRepo('src/core/atlas-time-knowledge-v1.mjs'),
  ]);
  const snapshot = snapshotModule.createAtlasBookSnapshot({
    projectId: 'wp502-book', projectRevisionId: digest('book-r5'), manifestRevision: digest('manifest-r5'),
    sceneOrder: ['scene-a', 'scene-b'],
    sceneRevisionsById: { 'scene-a': digest('scene-a-r3'), 'scene-b': digest('scene-b-r4') },
    dependenciesBySceneId: { 'scene-a': [], 'scene-b': [] },
  });
  const currentSnapshotIdentity = snapshotIdentity(snapshot);
  const base = { projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId };
  const evidenceAnchors = [
    { anchorId: 'a1', anchorLineageId: 'l1', sceneId: 'scene-a', sceneRevision: snapshot.sceneRevisionsById['scene-a'], startOffset: 1, endOffset: 5 },
    { anchorId: 'a2', anchorLineageId: 'l2', sceneId: 'scene-a', sceneRevision: snapshot.sceneRevisionsById['scene-a'], startOffset: 6, endOffset: 10 },
    { anchorId: 'a3', anchorLineageId: 'l3', sceneId: 'scene-b', sceneRevision: snapshot.sceneRevisionsById['scene-b'], startOffset: 2, endOffset: 8 },
  ];
  const cells = [
    { cellId: 'c1', propositionId: 'p-promise-made', perspectiveEntityId: 'anna', epistemicState: 'KNOWN', modality: 'ASSERTED', evidenceAnchorIds: ['a1'], tripleTime: { storyTime: { certainty: 'EXACT', ordinal: 1 }, narrativeTime: { certainty: 'EXACT', ordinal: 0 }, knowledgeTime: { certainty: 'EXACT', ordinal: 1 } }, scope: { kind: 'BOOK', ...base } },
    { cellId: 'c2', propositionId: 'p-door-open', perspectiveEntityId: 'boris', epistemicState: 'BELIEVED', modality: 'INFERRED', evidenceAnchorIds: ['a2'], tripleTime: { storyTime: { certainty: 'EXACT', ordinal: 2 }, narrativeTime: { certainty: 'EXACT', ordinal: 0 }, knowledgeTime: { certainty: 'EXACT', ordinal: 2 } }, scope: { kind: 'BOOK', ...base } },
    { cellId: 'c3', propositionId: 'p-secret-found', perspectiveEntityId: 'anna', epistemicState: 'UNKNOWN', modality: 'POSSIBLE', evidenceAnchorIds: ['a3'], tripleTime: { storyTime: { certainty: 'UNKNOWN', ordinal: null }, narrativeTime: { certainty: 'EXACT', ordinal: 1 }, knowledgeTime: { certainty: 'UNKNOWN', ordinal: null } }, scope: { kind: 'BOOK', ...base } },
  ];
  const timeKnowledgeProjection = timeModule.compileAtlasTimeKnowledge({ snapshot, currentSnapshotIdentity, evidenceAnchors, cells });
  const threads = [
    { threadId: 'thread-promise', threadKind: 'PROMISE', state: 'OPEN', participantEntityIds: ['anna', 'boris'], propositionIds: ['p-promise-made', 'p-door-open'], evidenceCellIds: ['c1', 'c2'] },
    { threadId: 'thread-plot', threadKind: 'PLOT', state: 'UNKNOWN', participantEntityIds: ['anna'], propositionIds: ['p-door-open', 'p-secret-found'], evidenceCellIds: ['c2', 'c3'] },
  ];
  const causalEdges = [
    { edgeId: 'edge-promise-door', sourcePropositionId: 'p-promise-made', targetPropositionId: 'p-door-open', relation: 'CAUSES', epistemicState: 'ASSERTED', evidenceCellIds: ['c1', 'c2'] },
    { edgeId: 'edge-door-secret', sourcePropositionId: 'p-door-open', targetPropositionId: 'p-secret-found', relation: 'ENABLES', epistemicState: 'UNKNOWN', evidenceCellIds: ['c2', 'c3'] },
  ];
  return { module, snapshotModule, timeModule, snapshot, currentSnapshotIdentity, timeKnowledgeProjection, threads, causalEdges };
}

test('WP-502 contract: promise and plot threads compile deterministically against the exact WP501 projection', async () => {
  const f = await fixture();
  const input = { snapshot: f.snapshot, currentSnapshotIdentity: f.currentSnapshotIdentity, timeKnowledgeProjection: f.timeKnowledgeProjection, threads: f.threads, causalEdges: f.causalEdges };
  const projection = f.module.compileAtlasThreadsCausality(input);
  const reversed = f.module.compileAtlasThreadsCausality({ ...input, threads: [...f.threads].reverse(), causalEdges: [...f.causalEdges].reverse() });
  assert.deepEqual(reversed, projection);
  assert.equal(projection.threadCount, 2);
  assert.equal(projection.edgeCount, 2);
  assert.equal(projection.denominator.promiseThreads, 1);
  assert.equal(projection.denominator.plotThreads, 1);
  assert.equal(projection.denominator.openThreads, 1);
  assert.equal(projection.denominator.unknownThreads, 1);
  assert.equal(projection.denominator.unknownEdges, 1);
  assert.equal(projection.timeKnowledgeProjectionDigest, f.timeKnowledgeProjection.projectionDigest);
  assert.equal(f.module.verifyAtlasThreadsCausalityProjection(projection, f.snapshot, f.timeKnowledgeProjection), projection);
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.threads[0]), true);
  assert.equal(projection.authority.productMutation, false);
  assert.equal(projection.authority.persistence, false);
});

test('WP-502 open-world query: missing direct causality is UNKNOWN and never inferred from a path', async () => {
  const f = await fixture();
  const projection = f.module.compileAtlasThreadsCausality({ snapshot: f.snapshot, currentSnapshotIdentity: f.currentSnapshotIdentity, timeKnowledgeProjection: f.timeKnowledgeProjection, threads: f.threads, causalEdges: f.causalEdges });
  const direct = f.module.queryAtlasThreadsCausality({ snapshot: f.snapshot, currentSnapshotIdentity: f.currentSnapshotIdentity, timeKnowledgeProjection: f.timeKnowledgeProjection, projection, threadId: '', sourcePropositionId: 'p-promise-made', targetPropositionId: 'p-door-open' });
  assert.equal(direct.relationState, 'EXPLICIT');
  assert.equal(direct.causalEdges[0].epistemicState, 'ASSERTED');
  const explicitUnknown = f.module.queryAtlasThreadsCausality({ snapshot: f.snapshot, currentSnapshotIdentity: f.currentSnapshotIdentity, timeKnowledgeProjection: f.timeKnowledgeProjection, projection, threadId: '', sourcePropositionId: 'p-door-open', targetPropositionId: 'p-secret-found' });
  assert.equal(explicitUnknown.relationState, 'EXPLICIT');
  assert.equal(explicitUnknown.causalEdges[0].epistemicState, 'UNKNOWN');
  const absent = f.module.queryAtlasThreadsCausality({ snapshot: f.snapshot, currentSnapshotIdentity: f.currentSnapshotIdentity, timeKnowledgeProjection: f.timeKnowledgeProjection, projection, threadId: '', sourcePropositionId: 'p-promise-made', targetPropositionId: 'p-secret-found' });
  assert.equal(absent.relationState, 'UNKNOWN');
  assert.equal(absent.unknownReason, 'NO_EXPLICIT_DIRECT_CAUSAL_EDGE');
  assert.equal(absent.causalEdgeCount, 0);
  assert.equal(f.module.verifyAtlasThreadsCausalityQuery(absent, projection, f.snapshot, f.timeKnowledgeProjection), absent);
});

test('WP-502 thread query returns only explicitly contained direct edges', async () => {
  const f = await fixture();
  const projection = f.module.compileAtlasThreadsCausality({ snapshot: f.snapshot, currentSnapshotIdentity: f.currentSnapshotIdentity, timeKnowledgeProjection: f.timeKnowledgeProjection, threads: f.threads, causalEdges: f.causalEdges });
  const result = f.module.queryAtlasThreadsCausality({ snapshot: f.snapshot, currentSnapshotIdentity: f.currentSnapshotIdentity, timeKnowledgeProjection: f.timeKnowledgeProjection, projection, threadId: 'thread-promise', sourcePropositionId: '', targetPropositionId: '' });
  assert.deepEqual(result.threads.map((thread) => thread.threadId), ['thread-promise']);
  assert.deepEqual(result.causalEdges.map((edge) => edge.edgeId), ['edge-promise-door']);
});

test('WP-502 strict boundary rejects extra keys, sparse arrays, accessors, non-NFC and duplicate semantics', async () => {
  const f = await fixture();
  const input = { snapshot: f.snapshot, currentSnapshotIdentity: f.currentSnapshotIdentity, timeKnowledgeProjection: f.timeKnowledgeProjection, threads: f.threads, causalEdges: f.causalEdges };
  assert.throws(() => f.module.compileAtlasThreadsCausality({ ...input, extra: true }));
  const sparse = new Array(1);
  assert.throws(() => f.module.compileAtlasThreadsCausality({ ...input, threads: sparse }));
  const accessor = { ...input }; Object.defineProperty(accessor, 'threads', { enumerable: true, get: () => f.threads });
  assert.throws(() => f.module.compileAtlasThreadsCausality(accessor));
  const nonNfc = clone(f.threads); nonNfc[0].threadId = 'Cafe\u0301';
  assert.throws(() => f.module.compileAtlasThreadsCausality({ ...input, threads: nonNfc }));
  const duplicate = clone(f.threads); duplicate.push({ ...clone(duplicate[0]), threadId: 'duplicate-thread' });
  assert.throws(() => f.module.compileAtlasThreadsCausality({ ...input, threads: duplicate }), (error) => error.code === 'E_ATLAS_THREADS_CAUSALITY_THREAD_SEMANTIC_DUPLICATE');
});

test('WP-502 hostile graph inputs reject orphan references, evidence leaks, self edges and cycles', async () => {
  const f = await fixture();
  const input = { snapshot: f.snapshot, currentSnapshotIdentity: f.currentSnapshotIdentity, timeKnowledgeProjection: f.timeKnowledgeProjection, threads: f.threads, causalEdges: f.causalEdges };
  const orphanThread = clone(f.threads); orphanThread[0].propositionIds[0] = 'missing';
  assert.throws(() => f.module.compileAtlasThreadsCausality({ ...input, threads: orphanThread }));
  const evidenceLeak = clone(f.causalEdges); evidenceLeak[0].evidenceCellIds = ['c3'];
  assert.throws(() => f.module.compileAtlasThreadsCausality({ ...input, causalEdges: evidenceLeak }));
  const selfEdge = clone(f.causalEdges); selfEdge[0].targetPropositionId = selfEdge[0].sourcePropositionId;
  assert.throws(() => f.module.compileAtlasThreadsCausality({ ...input, causalEdges: selfEdge }), (error) => error.code === 'E_ATLAS_THREADS_CAUSALITY_SELF_EDGE');
  const cycle = [...clone(f.causalEdges), { edgeId: 'edge-cycle', sourcePropositionId: 'p-secret-found', targetPropositionId: 'p-promise-made', relation: 'CAUSES', epistemicState: 'POSSIBLE', evidenceCellIds: ['c1', 'c3'] }];
  const spanningThread = [{ threadId: 'thread-all', threadKind: 'PLOT', state: 'OPEN', participantEntityIds: ['anna'], propositionIds: ['p-promise-made', 'p-door-open', 'p-secret-found'], evidenceCellIds: ['c1', 'c2', 'c3'] }];
  assert.throws(() => f.module.compileAtlasThreadsCausality({ ...input, threads: spanningThread, causalEdges: cycle }), (error) => error.code === 'E_ATLAS_THREADS_CAUSALITY_CYCLE');
});

test('WP-502 stale WP501 projection and recomputed projection/query tamper fail closed', async () => {
  const f = await fixture();
  const input = { snapshot: f.snapshot, currentSnapshotIdentity: f.currentSnapshotIdentity, timeKnowledgeProjection: f.timeKnowledgeProjection, threads: f.threads, causalEdges: f.causalEdges };
  const projection = f.module.compileAtlasThreadsCausality(input);
  const staleSnapshot = f.snapshotModule.createAtlasBookSnapshot({ projectId: 'wp502-book', projectRevisionId: digest('book-r6'), manifestRevision: digest('manifest-r6'), sceneOrder: ['scene-a'], sceneRevisionsById: { 'scene-a': digest('scene-a-r4') }, dependenciesBySceneId: { 'scene-a': [] } });
  assert.throws(() => f.module.verifyAtlasThreadsCausalityProjection(projection, staleSnapshot, f.timeKnowledgeProjection));
  const hashModule = await importRepo('src/core/browser-safe-hash.mjs');
  const tampered = clone(projection); tampered.denominator.threads = 99;
  const { projectionDigest, ...projectionBody } = tampered; tampered.projectionDigest = `sha256:${hashModule.hashCanonicalValue(projectionBody)}`;
  assert.throws(() => f.module.verifyAtlasThreadsCausalityProjection(tampered, f.snapshot, f.timeKnowledgeProjection));
  const query = clone(f.module.queryAtlasThreadsCausality({ snapshot: f.snapshot, currentSnapshotIdentity: f.currentSnapshotIdentity, timeKnowledgeProjection: f.timeKnowledgeProjection, projection, threadId: '', sourcePropositionId: 'p-promise-made', targetPropositionId: 'p-secret-found' }));
  query.relationState = 'FALSE';
  const { queryDigest, ...queryBody } = query; query.queryDigest = `sha256:${hashModule.hashCanonicalValue(queryBody)}`;
  assert.throws(() => f.module.verifyAtlasThreadsCausalityQuery(query, projection, f.snapshot, f.timeKnowledgeProjection), (error) => error.code === 'E_ATLAS_THREADS_CAUSALITY_QUERY_RESULT_MISMATCH');
});

module.exports = { ROOT, digest, clone, snapshotIdentity, fixture };
