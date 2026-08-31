'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const loadModule = () => import(pathToFileURL(path.join(ROOT, 'src/core/atlas-projector-kernel-v1.mjs')).href);
const loadSnapshotModule = () => import(pathToFileURL(path.join(ROOT, 'src/core/atlas-book-snapshot-v1.mjs')).href);
const digest = (value) => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

function snapshotInput(projectId = 'wp402-project', revision = 'r1') {
  return {
    projectId,
    projectRevisionId: digest(`${projectId}-${revision}`),
    manifestRevision: digest(`manifest-${revision}`),
    sceneOrder: ['scene-b', 'scene-a'],
    sceneRevisionsById: {
      'scene-a': digest(`scene-a-${revision}`),
      'scene-b': digest(`scene-b-${revision}`),
    },
    dependenciesBySceneId: {
      'scene-a': [digest('entity-anna'), digest('thread-main')].sort(),
      'scene-b': [digest('entity-anna')],
    },
  };
}

async function fixture(generation = 1, projectorId = 'atlas.relationships') {
  const snapshotModule = await loadSnapshotModule();
  const kernel = await loadModule();
  const snapshot = snapshotModule.createAtlasBookSnapshot(snapshotInput());
  const job = kernel.createAtlasProjectorJob({ snapshot, projectorId, generation });
  const result = kernel.runAtlasProjectorJob(job, (source) => ({
    sceneCount: source.sceneCount,
    sceneIds: source.sceneOrder.slice(),
  }));
  return { kernel, snapshotModule, snapshot, job, result };
}

test('WP-402 contract: deterministic job identity binds the exact whole-book snapshot and generation', async () => {
  const { kernel, snapshot, job } = await fixture(7);
  const repeated = kernel.createAtlasProjectorJob({
    snapshot: clone(snapshot),
    projectorId: 'atlas.relationships',
    generation: 7,
  });
  assert.deepEqual(repeated, job);
  assert.match(job.jobId, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(job.projectId, snapshot.projectId);
  assert.equal(job.projectRevisionId, snapshot.projectRevisionId);
  assert.equal(job.snapshotId, snapshot.snapshotId);
  assert.equal(job.orderDigest, snapshot.orderDigest);
  assert.equal(job.dependencyDigest, snapshot.dependencyDigest);
  assert.equal(Object.isFrozen(job), true);
  assert.equal(Object.isFrozen(job.snapshot), true);
  assert.deepEqual(kernel.verifyAtlasProjectorJob(job), job);
  assert.notEqual(
    kernel.createAtlasProjectorJob({ snapshot, projectorId: 'atlas.relationships', generation: 8 }).jobId,
    job.jobId,
  );
  assert.notEqual(
    kernel.createAtlasProjectorJob({ snapshot, projectorId: 'atlas.timeline', generation: 7 }).jobId,
    job.jobId,
  );
});

test('WP-402 scheduler coalesces to the latest job per project and projector within a hard bound', async () => {
  const kernel = await loadModule();
  const snapshotModule = await loadSnapshotModule();
  const snapshotA = snapshotModule.createAtlasBookSnapshot(snapshotInput('project-a'));
  const snapshotB = snapshotModule.createAtlasBookSnapshot(snapshotInput('project-b'));
  const jobs = [
    kernel.createAtlasProjectorJob({ snapshot: snapshotA, projectorId: 'atlas.graph', generation: 1 }),
    kernel.createAtlasProjectorJob({ snapshot: snapshotA, projectorId: 'atlas.graph', generation: 3 }),
    kernel.createAtlasProjectorJob({ snapshot: snapshotA, projectorId: 'atlas.timeline', generation: 2 }),
    kernel.createAtlasProjectorJob({ snapshot: snapshotB, projectorId: 'atlas.graph', generation: 4 }),
  ];
  const queue = kernel.coalesceAtlasProjectorJobs(jobs, { maxQueueSize: 2 });
  assert.equal(queue.sourceCount, 4);
  assert.equal(queue.coalescedCount, 3);
  assert.equal(queue.discardedCount, 2);
  assert.deepEqual(queue.jobs.map((job) => job.generation), [3, 4]);
  assert.equal(queue.jobs.some((job) => job.generation === 1), false);
  assert.match(queue.queueDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(Object.isFrozen(queue.jobs), true);
  assert.throws(
    () => kernel.coalesceAtlasProjectorJobs(jobs, { maxQueueSize: kernel.ATLAS_PROJECTOR_MAX_QUEUE_SIZE + 1 }),
    (error) => error.code === 'E_ATLAS_PROJECTOR_QUEUE_BOUND',
  );
  const sameProjectNewSnapshot = snapshotModule.createAtlasBookSnapshot(snapshotInput('project-a', 'r2'));
  assert.throws(
    () => kernel.coalesceAtlasProjectorJobs([
      jobs[0],
      kernel.createAtlasProjectorJob({
        snapshot: sameProjectNewSnapshot,
        projectorId: 'atlas.graph',
        generation: 1,
      }),
    ], { maxQueueSize: 2 }),
    (error) => error.code === 'E_ATLAS_PROJECTOR_GENERATION_COLLISION',
  );
});

test('WP-402 result is deterministic, bounded, digest-bound and deeply immutable', async () => {
  const { kernel, job, result } = await fixture(2);
  const repeated = kernel.runAtlasProjectorJob(job, (source) => ({
    sceneIds: source.sceneOrder.slice(),
    sceneCount: source.sceneCount,
  }));
  assert.deepEqual(repeated, result);
  assert.match(result.outputDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.match(result.resultId, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.output), true);
  assert.equal(Object.isFrozen(result.output.sceneIds), true);
  assert.deepEqual(kernel.verifyAtlasProjectorResult(result), result);

  const outputMutant = clone(result);
  outputMutant.output.sceneCount = 99;
  assert.throws(
    () => kernel.verifyAtlasProjectorResult(outputMutant),
    (error) => error.code === 'E_ATLAS_PROJECTOR_OUTPUT_DIGEST_MISMATCH',
  );
  const identityMutant = clone(result);
  identityMutant.resultId = digest('forged-result');
  assert.throws(
    () => kernel.verifyAtlasProjectorResult(identityMutant),
    (error) => error.code === 'E_ATLAS_PROJECTOR_RESULT_DIGEST_MISMATCH',
  );
});

test('WP-402 publication rejects stale generation and snapshot before changing the cell', async () => {
  const { kernel, snapshotModule, snapshot, job, result } = await fixture(4);
  const cell = kernel.createAtlasProjectorPublicationCell();
  const accepted = cell.publish({ activeJob: job, result, currentSnapshot: snapshot, currentGeneration: 4 });
  assert.equal(accepted.published, true);
  const original = cell.read();
  assert.equal(original.resultId, result.resultId);

  const newerJob = kernel.createAtlasProjectorJob({ snapshot, projectorId: job.projectorId, generation: 5 });
  const newerResult = kernel.runAtlasProjectorJob(newerJob, () => ({ version: 5 }));
  const generationRejected = cell.publish({
    activeJob: newerJob,
    result: newerResult,
    currentSnapshot: snapshot,
    currentGeneration: 6,
  });
  assert.equal(generationRejected.published, false);
  assert.equal(generationRejected.assessment.reason, 'GENERATION_STALE');
  assert.strictEqual(cell.read(), original);

  const newerSnapshot = snapshotModule.createAtlasBookSnapshot(snapshotInput('wp402-project', 'r2'));
  const snapshotRejected = cell.publish({
    activeJob: newerJob,
    result: newerResult,
    currentSnapshot: newerSnapshot,
    currentGeneration: 5,
  });
  assert.equal(snapshotRejected.published, false);
  assert.equal(snapshotRejected.assessment.reason, 'SNAPSHOT_STALE');
  assert.deepEqual(snapshotRejected.assessment.mismatches, [
    'dependencyDigest', 'projectRevisionId', 'snapshotId',
  ]);
  assert.strictEqual(cell.read(), original);
});

test('WP-402 publication rejects wrong job/projector identity and tampered output atomically', async () => {
  const { kernel, snapshot, job, result } = await fixture(3);
  const cell = kernel.createAtlasProjectorPublicationCell();
  const alternate = kernel.createAtlasProjectorJob({ snapshot, projectorId: 'atlas.timeline', generation: 3 });
  const mismatch = kernel.assessAtlasProjectorResultForPublication({
    activeJob: alternate,
    result,
    currentSnapshot: snapshot,
    currentGeneration: 3,
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason, 'RESULT_JOB_IDENTITY_MISMATCH');
  assert.deepEqual(mismatch.mismatches, ['jobId', 'projectorId']);

  const tampered = clone(result);
  tampered.output.sceneIds.push('forged-scene');
  assert.throws(
    () => cell.publish({ activeJob: job, result: tampered, currentSnapshot: snapshot, currentGeneration: 3 }),
    (error) => error.code === 'E_ATLAS_PROJECTOR_OUTPUT_DIGEST_MISMATCH',
  );
  assert.equal(cell.read(), null);
});

test('WP-402 rejects malformed, accessor-backed and unbounded inputs without invoking hostile accessors', async () => {
  const { kernel, snapshot, job } = await fixture();
  assert.throws(
    () => kernel.createAtlasProjectorJob({ snapshot, projectorId: ' atlas.graph ', generation: 1 }),
    (error) => error.code === 'E_ATLAS_PROJECTOR_ID_INVALID',
  );
  assert.throws(
    () => kernel.createAtlasProjectorJob({ snapshot, projectorId: 'atlas.graph', generation: 0 }),
    (error) => error.code === 'E_ATLAS_PROJECTOR_GENERATION_INVALID',
  );
  assert.throws(
    () => kernel.createAtlasProjectorJob({ snapshot, projectorId: 'atlas.graph', generation: 1, extra: true }),
    (error) => error.code === 'E_ATLAS_PROJECTOR_JOB_INPUT_INVALID',
  );

  let outputAccessorInvoked = false;
  const hostileOutput = {};
  Object.defineProperty(hostileOutput, 'secret', {
    enumerable: true,
    get() {
      outputAccessorInvoked = true;
      return 'leak';
    },
  });
  assert.throws(
    () => kernel.runAtlasProjectorJob(job, () => hostileOutput),
    (error) => error.code === 'E_ATLAS_PROJECTOR_OUTPUT_INVALID',
  );
  assert.equal(outputAccessorInvoked, false);

  let jobAccessorInvoked = false;
  const hostileJob = clone(job);
  Object.defineProperty(hostileJob, 'projectorId', {
    enumerable: true,
    get() {
      jobAccessorInvoked = true;
      return 'leak';
    },
  });
  assert.throws(
    () => kernel.verifyAtlasProjectorJob(hostileJob),
    (error) => error.code === 'E_ATLAS_PROJECTOR_JOB_INVALID',
  );
  assert.equal(jobAccessorInvoked, false);

  const tooDeep = {};
  let cursor = tooDeep;
  for (let index = 0; index < kernel.ATLAS_PROJECTOR_MAX_OUTPUT_DEPTH + 2; index += 1) {
    cursor.next = {};
    cursor = cursor.next;
  }
  assert.throws(
    () => kernel.runAtlasProjectorJob(job, () => tooDeep),
    (error) => error.code === 'E_ATLAS_PROJECTOR_OUTPUT_DEPTH_LIMIT',
  );
});
