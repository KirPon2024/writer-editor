'use strict';

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

async function fixture() {
  const [api, snapshotApi, timeApi, causalityApi] = await Promise.all([
    importRepo('src/core/wse-threads-explanation-v1.mjs'),
    importRepo('src/core/atlas-book-snapshot-v1.mjs'),
    importRepo('src/core/atlas-time-knowledge-v1.mjs'),
    importRepo('src/core/atlas-threads-causality-v1.mjs'),
  ]);
  const projectId = 'wp604-project';
  const snapshot = snapshotApi.createAtlasBookSnapshot({
    projectId,
    projectRevisionId: digest('book-r1'),
    manifestRevision: digest('manifest-r1'),
    sceneOrder: ['scene-a', 'scene-b'],
    sceneRevisionsById: { 'scene-a': digest('scene-a-r1'), 'scene-b': digest('scene-b-r1') },
    dependenciesBySceneId: { 'scene-a': [], 'scene-b': [] },
  });
  const currentSnapshotIdentity = snapshotIdentity(snapshot);
  const base = { projectId, projectRevisionId: snapshot.projectRevisionId };
  const evidenceAnchors = [
    { anchorId: 'a1', anchorLineageId: 'l1', sceneId: 'scene-a', sceneRevision: snapshot.sceneRevisionsById['scene-a'], startOffset: 0, endOffset: 9 },
    { anchorId: 'a2', anchorLineageId: 'l2', sceneId: 'scene-a', sceneRevision: snapshot.sceneRevisionsById['scene-a'], startOffset: 10, endOffset: 19 },
    { anchorId: 'a3', anchorLineageId: 'l3', sceneId: 'scene-b', sceneRevision: snapshot.sceneRevisionsById['scene-b'], startOffset: 0, endOffset: 9 },
  ];
  const cells = [
    { cellId: 'c1', propositionId: 'promise-made', perspectiveEntityId: 'anna', epistemicState: 'KNOWN', modality: 'ASSERTED', evidenceAnchorIds: ['a1'], tripleTime: { storyTime: { certainty: 'EXACT', ordinal: 1 }, narrativeTime: { certainty: 'EXACT', ordinal: 0 }, knowledgeTime: { certainty: 'EXACT', ordinal: 1 } }, scope: { kind: 'BOOK', ...base } },
    { cellId: 'c2', propositionId: 'door-open', perspectiveEntityId: 'boris', epistemicState: 'BELIEVED', modality: 'INFERRED', evidenceAnchorIds: ['a2'], tripleTime: { storyTime: { certainty: 'EXACT', ordinal: 2 }, narrativeTime: { certainty: 'EXACT', ordinal: 0 }, knowledgeTime: { certainty: 'EXACT', ordinal: 2 } }, scope: { kind: 'BOOK', ...base } },
    { cellId: 'c3', propositionId: 'secret-found', perspectiveEntityId: 'anna', epistemicState: 'UNKNOWN', modality: 'POSSIBLE', evidenceAnchorIds: ['a3'], tripleTime: { storyTime: { certainty: 'UNKNOWN', ordinal: null }, narrativeTime: { certainty: 'EXACT', ordinal: 1 }, knowledgeTime: { certainty: 'UNKNOWN', ordinal: null } }, scope: { kind: 'BOOK', ...base } },
  ];
  const timeKnowledgeProjection = timeApi.compileAtlasTimeKnowledge({ snapshot, currentSnapshotIdentity, evidenceAnchors, cells });
  const threadsCausalityProjection = causalityApi.compileAtlasThreadsCausality({
    snapshot,
    currentSnapshotIdentity,
    timeKnowledgeProjection,
    threads: [
      { threadId: 'thread-promise', threadKind: 'PROMISE', state: 'OPEN', participantEntityIds: ['anna', 'boris'], propositionIds: ['promise-made', 'door-open'], evidenceCellIds: ['c1', 'c2'] },
      { threadId: 'thread-plot', threadKind: 'PLOT', state: 'UNKNOWN', participantEntityIds: ['anna'], propositionIds: ['door-open', 'secret-found'], evidenceCellIds: ['c2', 'c3'] },
    ],
    causalEdges: [
      { edgeId: 'edge-promise-door', sourcePropositionId: 'promise-made', targetPropositionId: 'door-open', relation: 'CAUSES', epistemicState: 'ASSERTED', evidenceCellIds: ['c1', 'c2'] },
      { edgeId: 'edge-door-secret', sourcePropositionId: 'door-open', targetPropositionId: 'secret-found', relation: 'ENABLES', epistemicState: 'UNKNOWN', evidenceCellIds: ['c2', 'c3'] },
    ],
  });
  const fact = (id, sceneId, promiseState, value, evidenceState = 'current') => ({
    id,
    projectId,
    ledgerKind: 'promise',
    sceneId,
    subjectEntityId: 'anna',
    relatedEntityIds: ['boris'],
    factLabel: 'Return promise',
    factValue: value,
    promiseState,
    evidenceState,
    createdByCommandSeq: sceneId === 'scene-a' ? 1 : 2,
    updatedByCommandSeq: sceneId === 'scene-a' ? 1 : 2,
    evidenceAnchor: {
      anchorId: `fact-anchor-${id}`,
      sceneId,
      quote: `${promiseState} ${value}`,
      startOffset: 0,
      endOffset: `${promiseState} ${value}`.length,
      quoteHash: digest(`${promiseState} ${value}`),
      sceneTextHash: digest(sceneId),
    },
  });
  const facts = [
    fact('promise-open-return', 'scene-a', 'open', 'return'),
    fact('promise-fulfilled-return', 'scene-b', 'fulfilled', 'return'),
    fact('promise-open-letter', 'scene-a', 'open', 'send-letter'),
    fact('promise-broken-key', 'scene-b', 'broken', 'bring-key'),
  ];
  const causalContext = { snapshot, currentSnapshotIdentity, timeKnowledgeProjection, threadsCausalityProjection };
  const input = {
    projectId,
    sourceRevision: 'revision-7',
    currentSourceRevision: 'revision-7',
    generation: 7,
    currentGeneration: 7,
    facts,
    causalContext,
    rowLimit: 128,
  };
  return { api, snapshotApi, timeApi, causalityApi, projectId, snapshot, currentSnapshotIdentity, timeKnowledgeProjection, threadsCausalityProjection, causalContext, facts, input };
}

module.exports = { ROOT, clone, digest, fixture, importRepo };
