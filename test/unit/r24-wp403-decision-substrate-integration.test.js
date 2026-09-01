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
const evidence = (evidenceId, revision = 1) => ({ evidenceId, evidenceDigest: digest(`${evidenceId}-${revision}`) });

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function independentDigest(value) {
  return `sha256:${crypto.createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`;
}

async function harness(projectId = 'wp403-integration') {
  const [snapshotModule, projector, substrate] = await Promise.all([
    importRepo('src/core/atlas-book-snapshot-v1.mjs'),
    importRepo('src/core/atlas-projector-kernel-v1.mjs'),
    importRepo('src/core/atlas-decision-substrate-v1.mjs'),
  ]);
  const snapshot = snapshotModule.createAtlasBookSnapshot({
    projectId,
    projectRevisionId: digest(`${projectId}-revision`),
    manifestRevision: digest(`${projectId}-manifest`),
    sceneOrder: ['scene-1'],
    sceneRevisionsById: { 'scene-1': digest(`${projectId}-scene`) },
    dependenciesBySceneId: { 'scene-1': [digest(`${projectId}-entity`)] },
  });
  const publish = (generation, decisionCandidates, projectorId = 'atlas.decisionCandidates') => {
    const job = projector.createAtlasProjectorJob({ snapshot, projectorId, generation });
    const result = projector.runAtlasProjectorJob(job, () => ({ decisionCandidates }));
    const cell = projector.createAtlasProjectorPublicationCell();
    assert.equal(cell.publish({ activeJob: job, result, currentSnapshot: snapshot, currentGeneration: generation }).published, true);
    return cell.read();
  };
  return { projector, substrate, snapshot, publish };
}

function payload(candidateKey, evidenceRefs, summary = { label: candidateKey }) {
  return {
    candidateKey,
    candidateKind: 'continuity.review',
    entityId: `entity-${candidateKey}`,
    evidence: evidenceRefs,
    summary,
  };
}

test('WP-403 integration: projector publication to queue to review to append-only decisions preserves lineage', async () => {
  const { substrate, snapshot, publish } = await harness();
  const firstPublication = publish(1, [payload('arc', [evidence('scene-1:arc')])]);
  const firstQueue = substrate.buildAtlasDecisionCandidateQueue([firstPublication]);
  const initialCenter = substrate.buildAtlasReviewCenter({
    candidateQueue: firstQueue,
    currentGeneration: 1,
    currentSnapshot: snapshot,
    decisionMemory: substrate.createAtlasDecisionMemory({ projectId: snapshot.projectId }),
  });
  assert.equal(initialCenter.items[0].reviewStatus, 'REVIEW_REQUIRED');
  const firstDecision = substrate.recordAtlasDecision({
    candidateId: firstQueue.candidates[0].candidateId,
    candidateQueue: firstQueue,
    currentGeneration: 1,
    currentSnapshot: snapshot,
    decision: { disposition: 'ACCEPT', reason: 'First publication is supported.' },
    decisionMemory: substrate.createAtlasDecisionMemory({ projectId: snapshot.projectId }),
  });
  const secondPublication = publish(2, [payload('arc', [
    evidence('scene-1:arc', 2),
    evidence('scene-1:arc-support'),
  ], { label: 'arc', confidence: 'higher' })]);
  const secondQueue = substrate.buildAtlasDecisionCandidateQueue([firstPublication, secondPublication]);
  const changedCenter = substrate.buildAtlasReviewCenter({
    candidateQueue: secondQueue,
    currentGeneration: 2,
    currentSnapshot: snapshot,
    decisionMemory: firstDecision.memory,
  });
  assert.equal(changedCenter.items[0].reviewStatus, 'EVIDENCE_CHANGED');
  assert.equal(changedCenter.items[0].evidenceDelta.summary.changedCount, 1);
  assert.equal(changedCenter.items[0].evidenceDelta.summary.addedCount, 1);
  const secondDecision = substrate.recordAtlasDecision({
    candidateId: secondQueue.candidates[0].candidateId,
    candidateQueue: secondQueue,
    currentGeneration: 2,
    currentSnapshot: snapshot,
    decision: { disposition: 'ACCEPT', reason: 'Changed evidence was reviewed.' },
    decisionMemory: firstDecision.memory,
  });
  assert.equal(secondDecision.accepted, true);
  assert.equal(secondDecision.memory.entries.length, 2);
  assert.equal(secondDecision.memory.entries[0].candidate.generation, 1);
  assert.equal(secondDecision.memory.entries[1].candidate.generation, 2);
  assert.equal(secondDecision.memory.entries[1].previousMemoryDigest, firstDecision.memory.memoryDigest);
});

test('WP-403 differential oracle independently recomputes candidate, queue, delta and memory identities', async () => {
  const { substrate, snapshot, publish } = await harness('wp403-differential');
  const publication = publish(7, [payload('alpha', [evidence('ev-a')], { rank: 1 })]);
  const queue = substrate.buildAtlasDecisionCandidateQueue([publication], { maxQueueSize: 8 });
  const candidate = queue.candidates[0];
  const candidateIdentity = {
    schemaVersion: substrate.ATLAS_DECISION_CANDIDATE_SCHEMA_VERSION,
    candidateKey: candidate.candidateKey,
    candidateKind: candidate.candidateKind,
    entityId: candidate.entityId,
    evidenceDigest: candidate.evidenceDigest,
    summaryDigest: candidate.summaryDigest,
    sourceIndex: candidate.sourceIndex,
    publicationId: candidate.publicationId,
    resultId: candidate.resultId,
    jobId: candidate.jobId,
    projectorId: candidate.projectorId,
    generation: candidate.generation,
    projectId: candidate.projectId,
    projectRevisionId: candidate.projectRevisionId,
    snapshotId: candidate.snapshotId,
    orderDigest: candidate.orderDigest,
    dependencyDigest: candidate.dependencyDigest,
    outputDigest: candidate.outputDigest,
  };
  assert.equal(candidate.candidateId, independentDigest(candidateIdentity));
  const { queueDigest, ...queueIdentity } = queue;
  assert.equal(queueDigest, independentDigest(queueIdentity));

  const delta = substrate.computeAtlasEvidenceDelta({
    beforeEvidence: [evidence('ev-a')],
    afterEvidence: [evidence('ev-a', 2), evidence('ev-b')],
  });
  const { deltaDigest, ...deltaIdentity } = delta;
  assert.equal(deltaDigest, independentDigest(deltaIdentity));

  const memory = substrate.createAtlasDecisionMemory({ projectId: snapshot.projectId });
  assert.equal(memory.memoryDigest, independentDigest({
    schemaVersion: 'yalken.atlas.decisionMemorySeed.v1',
    projectId: snapshot.projectId,
  }));
  const recorded = substrate.recordAtlasDecision({
    candidateId: candidate.candidateId,
    candidateQueue: queue,
    currentGeneration: 7,
    currentSnapshot: snapshot,
    decision: { disposition: 'REJECT', reason: 'Independent oracle decision.' },
    decisionMemory: memory,
  });
  const recordIdentity = {
    schemaVersion: substrate.ATLAS_DECISION_RECORD_SCHEMA_VERSION,
    sequence: 1,
    previousMemoryDigest: memory.memoryDigest,
    candidateId: candidate.candidateId,
    disposition: 'REJECT',
    reason: 'Independent oracle decision.',
  };
  assert.equal(recorded.decision.decisionId, independentDigest(recordIdentity));
  assert.equal(recorded.memory.memoryDigest, independentDigest({
    schemaVersion: 'yalken.atlas.decisionMemoryChain.v1',
    previousMemoryDigest: memory.memoryDigest,
    decisionId: recorded.decision.decisionId,
  }));
});

test('WP-403 large corpus: 1,000 publication-derived candidates stay deterministic and hard-bounded', async () => {
  const { substrate, publish } = await harness('wp403-large');
  const source = Array.from({ length: 1_000 }, (_, index) => payload(
    `candidate-${String(index).padStart(4, '0')}`,
    [evidence(`ev-${index}`)],
    { index, label: `Candidate ${index}` },
  ));
  const publication = publish(1, source);
  const startedAt = performance.now();
  const queue = substrate.buildAtlasDecisionCandidateQueue([publication], { maxQueueSize: 128 });
  const elapsedMs = performance.now() - startedAt;
  assert.equal(queue.sourceCount, 1_000);
  assert.equal(queue.coalescedCount, 1_000);
  assert.equal(queue.candidates.length, 128);
  assert.equal(queue.discardedCount, 872);
  assert.equal(queue.candidates.at(-1).candidateKey, 'candidate-0999');
  assert.deepEqual(substrate.verifyAtlasDecisionCandidateQueue(queue), queue);
  assert.ok(elapsedMs < 5_000, `large corpus exceeded bound: ${elapsedMs}ms`);
});

test('WP-403 integration negatives: stale Review Center is visible but never decision-eligible', async () => {
  const { substrate, snapshot, publish } = await harness('wp403-stale-review');
  const publication = publish(3, [payload('stale', [evidence('ev-stale')])]);
  const queue = substrate.buildAtlasDecisionCandidateQueue([publication]);
  const memory = substrate.createAtlasDecisionMemory({ projectId: snapshot.projectId });
  const center = substrate.buildAtlasReviewCenter({
    candidateQueue: queue,
    currentGeneration: 4,
    currentSnapshot: snapshot,
    decisionMemory: memory,
  });
  assert.equal(center.items[0].reviewStatus, 'STALE_BLOCKED');
  assert.equal(center.items[0].decisionEligible, false);
  assert.deepEqual(center.items[0].staleMismatches, ['generation']);
  assert.equal(center.summary.staleBlockedCount, 1);
  assert.equal(center.summary.decisionEligibleCount, 0);
  const rejected = substrate.recordAtlasDecision({
    candidateId: queue.candidates[0].candidateId,
    candidateQueue: queue,
    currentGeneration: 4,
    currentSnapshot: snapshot,
    decision: { disposition: 'ACCEPT', reason: 'Must not be accepted.' },
    decisionMemory: memory,
  });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.memory.memoryDigest, memory.memoryDigest);
  assert.equal(rejected.memory.entries.length, 0);
});
