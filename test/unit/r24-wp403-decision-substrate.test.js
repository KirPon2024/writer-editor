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
const evidence = (evidenceId, revision = 1) => ({ evidenceId, evidenceDigest: digest(`${evidenceId}-${revision}`) });

async function fixture() {
  const [snapshotModule, projector, substrate] = await Promise.all([
    importRepo('src/core/atlas-book-snapshot-v1.mjs'),
    importRepo('src/core/atlas-projector-kernel-v1.mjs'),
    importRepo('src/core/atlas-decision-substrate-v1.mjs'),
  ]);
  const makeSnapshot = (revision = 1, projectId = 'wp403-project') => snapshotModule.createAtlasBookSnapshot({
    projectId,
    projectRevisionId: digest(`${projectId}-project-${revision}`),
    manifestRevision: digest(`${projectId}-manifest-${revision}`),
    sceneOrder: ['scene-b', 'scene-a'],
    sceneRevisionsById: {
      'scene-a': digest(`scene-a-${revision}`),
      'scene-b': digest(`scene-b-${revision}`),
    },
    dependenciesBySceneId: {
      'scene-a': [digest('entity-a')],
      'scene-b': [digest('entity-b')],
    },
  });
  const makePublication = (snapshot, generation, decisionCandidates, projectorId = 'atlas.decisionCandidates') => {
    const job = projector.createAtlasProjectorJob({ snapshot, projectorId, generation });
    const result = projector.runAtlasProjectorJob(job, () => ({ decisionCandidates }));
    const cell = projector.createAtlasProjectorPublicationCell();
    const published = cell.publish({ activeJob: job, result, currentSnapshot: snapshot, currentGeneration: generation });
    assert.equal(published.published, true);
    return cell.read();
  };
  return { snapshotModule, projector, substrate, makeSnapshot, makePublication };
}

function payload(candidateKey, evidenceRefs, summary = { label: candidateKey }) {
  return {
    candidateKey,
    candidateKind: 'relationship.review',
    entityId: `entity-${candidateKey}`,
    evidence: evidenceRefs,
    summary,
  };
}

test('WP-403 contract: candidate queue is publication-derived, deterministic, latest-only and bounded', async () => {
  const { substrate, makeSnapshot, makePublication } = await fixture();
  const snapshot = makeSnapshot();
  const generationOne = makePublication(snapshot, 1, [
    payload('alpha', [evidence('ev-a')]),
    payload('beta', [evidence('ev-b')]),
  ]);
  const generationTwo = makePublication(snapshot, 2, [
    payload('alpha', [evidence('ev-a', 2)]),
    payload('gamma', [evidence('ev-c')]),
  ]);
  const queue = substrate.buildAtlasDecisionCandidateQueue([generationTwo, generationOne], { maxQueueSize: 2 });
  const repeated = substrate.buildAtlasDecisionCandidateQueue([clone(generationOne), clone(generationTwo)], { maxQueueSize: 2 });
  assert.deepEqual(repeated, queue);
  assert.equal(queue.sourceCount, 4);
  assert.equal(queue.coalescedCount, 3);
  assert.equal(queue.discardedCount, 2);
  assert.deepEqual(queue.candidates.map((candidate) => candidate.candidateKey), ['alpha', 'gamma']);
  assert.equal(queue.candidates.find((candidate) => candidate.candidateKey === 'alpha').generation, 2);
  assert.equal(Object.isFrozen(queue), true);
  assert.equal(Object.isFrozen(queue.publications), true);
  assert.equal(Object.isFrozen(queue.candidates[0].evidence), true);
  assert.deepEqual(substrate.verifyAtlasDecisionCandidateQueue(queue), queue);
  assert.throws(
    () => substrate.buildAtlasDecisionCandidateQueue([generationOne], { maxQueueSize: substrate.ATLAS_DECISION_MAX_QUEUE_SIZE + 1 }),
    (error) => error.code === 'E_ATLAS_DECISION_QUEUE_BOUND',
  );
});

test('WP-403 contract: EvidenceDelta is exact, order-independent and digest-bound', async () => {
  const { substrate } = await fixture();
  const delta = substrate.computeAtlasEvidenceDelta({
    beforeEvidence: [evidence('removed'), evidence('changed'), evidence('retained')],
    afterEvidence: [evidence('retained'), evidence('added'), evidence('changed', 2)],
  });
  assert.deepEqual(delta.added.map((item) => item.evidenceId), ['added']);
  assert.deepEqual(delta.removed.map((item) => item.evidenceId), ['removed']);
  assert.deepEqual(delta.retained.map((item) => item.evidenceId), ['retained']);
  assert.deepEqual(delta.changed, [{
    evidenceId: 'changed',
    beforeDigest: digest('changed-1'),
    afterDigest: digest('changed-2'),
  }]);
  assert.deepEqual(delta.summary, {
    beforeCount: 3,
    afterCount: 3,
    addedCount: 1,
    removedCount: 1,
    retainedCount: 1,
    changedCount: 1,
    hasDelta: true,
  });
  assert.match(delta.deltaDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(Object.isFrozen(delta.changed[0]), true);
});

test('WP-403 contract: Decision Memory is append-only, hash-chained, idempotent and finality-preserving', async () => {
  const { substrate, makeSnapshot, makePublication } = await fixture();
  const snapshot = makeSnapshot();
  const publication = makePublication(snapshot, 4, [payload('alpha', [evidence('ev-a')])]);
  const queue = substrate.buildAtlasDecisionCandidateQueue([publication]);
  const candidateId = queue.candidates[0].candidateId;
  const empty = substrate.createAtlasDecisionMemory({ projectId: snapshot.projectId });
  const deferred = substrate.recordAtlasDecision({
    candidateId,
    candidateQueue: queue,
    currentGeneration: 4,
    currentSnapshot: snapshot,
    decision: { disposition: 'DEFER', reason: 'Need a second source.' },
    decisionMemory: empty,
  });
  assert.equal(deferred.accepted, true);
  assert.equal(deferred.memory.entries.length, 1);
  assert.equal(deferred.decision.previousMemoryDigest, empty.memoryDigest);
  const accepted = substrate.recordAtlasDecision({
    candidateId,
    candidateQueue: queue,
    currentGeneration: 4,
    currentSnapshot: snapshot,
    decision: { disposition: 'ACCEPT', reason: 'Evidence is now sufficient.' },
    decisionMemory: deferred.memory,
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.memory.entries.length, 2);
  assert.equal(accepted.decision.previousMemoryDigest, deferred.memory.memoryDigest);
  assert.deepEqual(substrate.verifyAtlasDecisionMemory(accepted.memory), accepted.memory);
  const replay = substrate.recordAtlasDecision({
    candidateId,
    candidateQueue: queue,
    currentGeneration: 4,
    currentSnapshot: snapshot,
    decision: { disposition: 'ACCEPT', reason: 'Evidence is now sufficient.' },
    decisionMemory: accepted.memory,
  });
  assert.equal(replay.code, 'ATLAS_DECISION_IDEMPOTENT_REPLAY');
  assert.equal(replay.memory.memoryDigest, accepted.memory.memoryDigest);
  assert.equal(replay.memory.entries.length, 2);
  const conflict = substrate.recordAtlasDecision({
    candidateId,
    candidateQueue: queue,
    currentGeneration: 4,
    currentSnapshot: snapshot,
    decision: { disposition: 'REJECT', reason: 'Contradictory attempt.' },
    decisionMemory: accepted.memory,
  });
  assert.equal(conflict.accepted, false);
  assert.equal(conflict.reason, 'DECISION_ALREADY_FINAL');
  assert.equal(conflict.memory.memoryDigest, accepted.memory.memoryDigest);
});

test('WP-403 contract: Review Center is a complete read-only projection with EvidenceDelta', async () => {
  const { substrate, makeSnapshot, makePublication } = await fixture();
  const snapshot = makeSnapshot();
  const firstPublication = makePublication(snapshot, 1, [
    payload('alpha', [evidence('ev-a')]),
    payload('beta', [evidence('ev-b')]),
  ]);
  const firstQueue = substrate.buildAtlasDecisionCandidateQueue([firstPublication]);
  const empty = substrate.createAtlasDecisionMemory({ projectId: snapshot.projectId });
  const recorded = substrate.recordAtlasDecision({
    candidateId: firstQueue.candidates.find((candidate) => candidate.candidateKey === 'alpha').candidateId,
    candidateQueue: firstQueue,
    currentGeneration: 1,
    currentSnapshot: snapshot,
    decision: { disposition: 'ACCEPT', reason: 'Initial evidence accepted.' },
    decisionMemory: empty,
  });
  const secondPublication = makePublication(snapshot, 2, [
    payload('alpha', [evidence('ev-a', 2), evidence('ev-new')]),
    payload('beta', [evidence('ev-b')]),
  ]);
  const secondQueue = substrate.buildAtlasDecisionCandidateQueue([secondPublication]);
  const center = substrate.buildAtlasReviewCenter({
    candidateQueue: secondQueue,
    currentGeneration: 2,
    currentSnapshot: snapshot,
    decisionMemory: recorded.memory,
  });
  assert.equal(center.authority.readModelOnly, true);
  assert.equal(center.authority.commandAuthority, 'none');
  assert.equal(center.authority.productMutation, false);
  assert.equal(center.summary.completeDenominator, 2);
  assert.equal(center.items.length, 2);
  const alpha = center.items.find((item) => item.candidate.candidateKey === 'alpha');
  const beta = center.items.find((item) => item.candidate.candidateKey === 'beta');
  assert.equal(alpha.reviewStatus, 'EVIDENCE_CHANGED');
  assert.equal(alpha.evidenceDelta.summary.changedCount, 1);
  assert.equal(alpha.evidenceDelta.summary.addedCount, 1);
  assert.equal(beta.reviewStatus, 'REVIEW_REQUIRED');
  assert.equal(center.summary.evidenceChangedCount, 1);
  assert.equal(center.summary.reviewRequiredCount, 1);
  assert.equal(Object.isFrozen(center.items), true);
});

test('WP-403 contract: stale generation and snapshot decisions reject without memory change', async () => {
  const { substrate, makeSnapshot, makePublication } = await fixture();
  const snapshot = makeSnapshot(1);
  const publication = makePublication(snapshot, 3, [payload('alpha', [evidence('ev-a')])]);
  const queue = substrate.buildAtlasDecisionCandidateQueue([publication]);
  const memory = substrate.createAtlasDecisionMemory({ projectId: snapshot.projectId });
  const baseInput = {
    candidateId: queue.candidates[0].candidateId,
    candidateQueue: queue,
    currentSnapshot: snapshot,
    decision: { disposition: 'ACCEPT', reason: 'Current evidence accepted.' },
    decisionMemory: memory,
  };
  const staleGeneration = substrate.recordAtlasDecision({ ...baseInput, currentGeneration: 4 });
  assert.equal(staleGeneration.accepted, false);
  assert.equal(staleGeneration.reason, 'CANDIDATE_STALE');
  assert.deepEqual(staleGeneration.mismatches, ['generation']);
  assert.equal(staleGeneration.memory.memoryDigest, memory.memoryDigest);
  const staleSnapshot = substrate.recordAtlasDecision({
    ...baseInput,
    currentGeneration: 3,
    currentSnapshot: makeSnapshot(2),
  });
  assert.equal(staleSnapshot.accepted, false);
  assert.equal(staleSnapshot.reason, 'CANDIDATE_STALE');
  assert.deepEqual(staleSnapshot.mismatches, ['dependencyDigest', 'projectRevisionId', 'snapshotId']);
  assert.equal(staleSnapshot.memory.memoryDigest, memory.memoryDigest);
});

test('WP-403 contract negatives: hostile accessors, tampering, cross-project queues and collisions fail closed', async () => {
  const { substrate, makeSnapshot, makePublication } = await fixture();
  const snapshot = makeSnapshot();
  const hostilePayload = {
    candidateKey: 'hostile',
    candidateKind: 'relationship.review',
    entityId: 'entity-hostile',
    evidence: [evidence('ev-hostile')],
  };
  Object.defineProperty(hostilePayload, 'summary', { enumerable: true, get() { throw new Error('getter executed'); } });
  assert.throws(
    () => makePublication(snapshot, 1, [hostilePayload]),
    (error) => error.code === 'E_ATLAS_PROJECTOR_OUTPUT_INVALID',
  );

  const publication = makePublication(snapshot, 1, [payload('alpha', [evidence('ev-a')])]);
  const queue = substrate.buildAtlasDecisionCandidateQueue([publication]);
  const tamperedQueue = clone(queue);
  tamperedQueue.candidates[0].evidence[0].evidenceDigest = digest('forged');
  assert.throws(
    () => substrate.verifyAtlasDecisionCandidateQueue(tamperedQueue),
    (error) => error.code === 'E_ATLAS_DECISION_QUEUE_DIGEST_MISMATCH',
  );
  const memory = substrate.createAtlasDecisionMemory({ projectId: snapshot.projectId });
  const tamperedMemory = clone(memory);
  tamperedMemory.memoryDigest = digest('forged-memory');
  assert.throws(
    () => substrate.verifyAtlasDecisionMemory(tamperedMemory),
    (error) => error.code === 'E_ATLAS_DECISION_MEMORY_DIGEST_MISMATCH',
  );
  const otherSnapshot = makeSnapshot(1, 'other-project');
  const otherPublication = makePublication(otherSnapshot, 1, [payload('other', [evidence('ev-other')])]);
  assert.throws(
    () => substrate.buildAtlasDecisionCandidateQueue([publication, otherPublication]),
    (error) => error.code === 'E_ATLAS_DECISION_QUEUE_PROJECT_COLLISION',
  );
  const collisionPublication = makePublication(snapshot, 1, [payload('alpha', [evidence('ev-a', 2)])]);
  assert.throws(
    () => substrate.buildAtlasDecisionCandidateQueue([publication, collisionPublication]),
    (error) => error.code === 'E_ATLAS_DECISION_GENERATION_COLLISION',
  );
});
