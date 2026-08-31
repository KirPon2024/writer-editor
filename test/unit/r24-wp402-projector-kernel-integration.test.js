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

async function makeSnapshot(projectId = 'wp402-integration', revision = 1) {
  const snapshotModule = await importRepo('src/core/atlas-book-snapshot-v1.mjs');
  return snapshotModule.createAtlasBookSnapshot({
    projectId,
    projectRevisionId: digest(`${projectId}-project-${revision}`),
    manifestRevision: digest(`${projectId}-manifest-${revision}`),
    sceneOrder: ['scene-z', 'scene-a'],
    sceneRevisionsById: {
      'scene-a': digest(`scene-a-${revision}`),
      'scene-z': digest(`scene-z-${revision}`),
    },
    dependenciesBySceneId: {
      'scene-a': [digest('entity-a')],
      'scene-z': [digest('entity-z'), digest('thread-z')].sort(),
    },
  });
}

test('WP-402 differential oracle independently recomputes job, output, result and publication identities', async () => {
  const kernel = await importRepo('src/core/atlas-projector-kernel-v1.mjs');
  const snapshot = await makeSnapshot();
  const job = kernel.createAtlasProjectorJob({ snapshot, projectorId: 'atlas.graph', generation: 11 });
  const jobIdentity = {
    schemaVersion: kernel.ATLAS_PROJECTOR_JOB_SCHEMA_VERSION,
    projectorId: 'atlas.graph',
    generation: 11,
    projectId: snapshot.projectId,
    projectRevisionId: snapshot.projectRevisionId,
    snapshotId: snapshot.snapshotId,
    orderDigest: snapshot.orderDigest,
    dependencyDigest: snapshot.dependencyDigest,
  };
  assert.equal(job.jobId, independentDigest(jobIdentity));

  const result = kernel.runAtlasProjectorJob(job, (source) => ({
    orderedScenes: source.sceneOrder.map((sceneId) => ({
      dependencyCount: source.dependenciesBySceneId[sceneId].length,
      sceneId,
    })),
  }));
  const outputDigest = independentDigest({
    schemaVersion: kernel.ATLAS_PROJECTOR_OUTPUT_SCHEMA_VERSION,
    jobId: job.jobId,
    output: result.output,
  });
  assert.equal(result.outputDigest, outputDigest);
  const resultIdentity = {
    schemaVersion: kernel.ATLAS_PROJECTOR_RESULT_SCHEMA_VERSION,
    jobId: job.jobId,
    projectorId: job.projectorId,
    generation: job.generation,
    projectId: job.projectId,
    projectRevisionId: job.projectRevisionId,
    snapshotId: job.snapshotId,
    orderDigest: job.orderDigest,
    dependencyDigest: job.dependencyDigest,
    outputDigest,
  };
  assert.equal(result.resultId, independentDigest(resultIdentity));

  const cell = kernel.createAtlasProjectorPublicationCell();
  const published = cell.publish({ activeJob: job, result, currentSnapshot: snapshot, currentGeneration: 11 });
  assert.equal(published.published, true);
  const publication = cell.read();
  const publicationIdentity = {
    schemaVersion: kernel.ATLAS_PROJECTOR_PUBLICATION_SCHEMA_VERSION,
    resultId: result.resultId,
    jobId: result.jobId,
    projectorId: result.projectorId,
    generation: result.generation,
    projectId: result.projectId,
    projectRevisionId: result.projectRevisionId,
    snapshotId: result.snapshotId,
    orderDigest: result.orderDigest,
    dependencyDigest: result.dependencyDigest,
    outputDigest: result.outputDigest,
  };
  assert.equal(publication.publicationId, independentDigest(publicationIdentity));
});

test('WP-402 atomic cell retains the prior publication across every stale and invalid successor', async () => {
  const kernel = await importRepo('src/core/atlas-projector-kernel-v1.mjs');
  const firstSnapshot = await makeSnapshot('wp402-atomic', 1);
  const firstJob = kernel.createAtlasProjectorJob({
    snapshot: firstSnapshot,
    projectorId: 'atlas.graph',
    generation: 1,
  });
  const firstResult = kernel.runAtlasProjectorJob(firstJob, () => ({ edges: ['a->z'] }));
  const cell = kernel.createAtlasProjectorPublicationCell();
  assert.equal(cell.publish({
    activeJob: firstJob,
    result: firstResult,
    currentSnapshot: firstSnapshot,
    currentGeneration: 1,
  }).published, true);
  const prior = cell.read();

  const secondSnapshot = await makeSnapshot('wp402-atomic', 2);
  const secondJob = kernel.createAtlasProjectorJob({
    snapshot: secondSnapshot,
    projectorId: 'atlas.graph',
    generation: 2,
  });
  const secondResult = kernel.runAtlasProjectorJob(secondJob, () => ({ edges: ['a->z', 'z->a'] }));
  const rejectedInputs = [
    { activeJob: secondJob, result: secondResult, currentSnapshot: firstSnapshot, currentGeneration: 2 },
    { activeJob: secondJob, result: secondResult, currentSnapshot: secondSnapshot, currentGeneration: 3 },
    { activeJob: firstJob, result: secondResult, currentSnapshot: secondSnapshot, currentGeneration: 2 },
  ];
  for (const input of rejectedInputs) {
    assert.equal(cell.publish(input).published, false);
    assert.strictEqual(cell.read(), prior);
  }
  const tampered = JSON.parse(JSON.stringify(secondResult));
  tampered.output.edges.push('forged');
  assert.throws(() => cell.publish({
    activeJob: secondJob,
    result: tampered,
    currentSnapshot: secondSnapshot,
    currentGeneration: 2,
  }));
  assert.strictEqual(cell.read(), prior);

  assert.equal(cell.publish({
    activeJob: secondJob,
    result: secondResult,
    currentSnapshot: secondSnapshot,
    currentGeneration: 2,
  }).published, true);
  assert.equal(cell.read().resultId, secondResult.resultId);
  assert.notStrictEqual(cell.read(), prior);
});

test('WP-402 large scheduler corpus remains deterministic and bounded', async () => {
  const kernel = await importRepo('src/core/atlas-projector-kernel-v1.mjs');
  const snapshot = await makeSnapshot('wp402-large', 1);
  const jobs = [];
  for (let projectorIndex = 0; projectorIndex < 200; projectorIndex += 1) {
    for (let generation = 1; generation <= 20; generation += 1) {
      jobs.push(kernel.createAtlasProjectorJob({
        snapshot,
        projectorId: `atlas.projector-${String(projectorIndex).padStart(3, '0')}`,
        generation,
      }));
    }
  }
  const started = performance.now();
  const first = kernel.coalesceAtlasProjectorJobs(jobs, { maxQueueSize: 128 });
  const elapsedMs = performance.now() - started;
  const second = kernel.coalesceAtlasProjectorJobs([...jobs].reverse(), { maxQueueSize: 128 });
  assert.equal(first.sourceCount, 4_000);
  assert.equal(first.coalescedCount, 200);
  assert.equal(first.jobs.length, 128);
  assert.equal(first.discardedCount, 3_872);
  assert.equal(first.jobs.every((job) => job.generation === 20), true);
  assert.equal(first.queueDigest, second.queueDigest);
  assert.deepEqual(first.jobs.map((job) => job.jobId), second.jobs.map((job) => job.jobId));
  assert.equal(elapsedMs < 5_000, true, `large scheduler corpus took ${elapsedMs}ms`);
  console.log(`R24_WP402_LARGE_CORPUS_RECEIPT=${JSON.stringify({
    sourceJobs: jobs.length,
    coalescedJobs: first.coalescedCount,
    publishedQueueJobs: first.jobs.length,
    elapsedMs: Math.round(elapsedMs),
    queueDigest: first.queueDigest,
  })}`);
});
