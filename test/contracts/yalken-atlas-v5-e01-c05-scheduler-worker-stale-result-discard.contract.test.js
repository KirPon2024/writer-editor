const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildAtlasFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const projectId = 'atlas-scheduler-project';
  const sceneId = 'scene-a';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas scheduler', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId, text: 'Mira met Sol. Sol kept the map.' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: {
        projectId,
        entityId: 'entity-sol',
        name: 'Sol',
        entityKind: 'character',
      },
    },
  ]);
  assert.equal(built.ok, true);
  return { runtime, projectId, sceneId, state: built.state };
}

test('E01 C05: scheduler jobs carry revision identity and no worker write authority', async () => {
  const { runtime, projectId, state } = await buildAtlasFixture();
  const scheduler = await loadModule(path.join('src', 'derived', 'atlas', 'scheduleAtlasGeneration.mjs'));
  const sourceRevision = runtime.hashCoreState(state);

  const job = scheduler.createAtlasGenerationJob({
    coreState: state,
    projectId,
    sourceRevision,
    sequence: 1,
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasMentionIndex: true } },
  });

  assert.equal(job.ok, true);
  assert.equal(job.value.schemaVersion, 'derived.atlas.generationScheduler.v1');
  assert.equal(job.value.projectId, projectId);
  assert.equal(job.value.sourceRevision, sourceRevision);
  assert.match(job.value.requestId, /^atlas-generation-request:/u);
  assert.deepEqual(job.value.worker.authority, {
    filesystem: false,
    network: false,
    writer: false,
    projectMutation: false,
    persistentDerivedTruth: false,
  });
  assert.notStrictEqual(job.value.workerInput.coreState, state);
  assert.deepEqual(job.value.workerInput.coreState, state);
});

test('E01 C05: queue coalesces to the latest generation per project and remains bounded', async () => {
  const { projectId, state } = await buildAtlasFixture();
  const scheduler = await loadModule(path.join('src', 'derived', 'atlas', 'scheduleAtlasGeneration.mjs'));
  const capabilitySnapshot = { platformId: 'node', capabilities: { atlasMentionIndex: true } };
  const jobs = [1, 2, 3].map((sequence) => scheduler.createAtlasGenerationJob({
    coreState: state,
    projectId,
    sequence,
    capabilitySnapshot,
  }).value);
  const other = scheduler.createAtlasGenerationJob({
    coreState: state,
    projectId: 'other-project',
    sequence: 4,
    capabilitySnapshot,
  }).value;

  const queue = scheduler.coalesceAtlasGenerationJobs([...jobs, other], { maxQueueSize: 1 });

  assert.equal(queue.ok, true);
  assert.equal(queue.value.queue.length, 1);
  assert.equal(queue.value.queue[0].projectId, 'other-project');
  assert.equal(queue.value.discardedCount, 1);

  const projectQueue = scheduler.coalesceAtlasGenerationJobs(jobs, { maxQueueSize: 4 });
  assert.equal(projectQueue.value.queue.length, 1);
  assert.equal(projectQueue.value.queue[0].generation, 3);
});

test('E01 C05: stale worker result is discarded when project source revision changes before accept', async () => {
  const { runtime, projectId, sceneId, state } = await buildAtlasFixture();
  const scheduler = await loadModule(path.join('src', 'derived', 'atlas', 'scheduleAtlasGeneration.mjs'));
  const sourceRevision = runtime.hashCoreState(state);
  const job = scheduler.createAtlasGenerationJob({
    coreState: state,
    projectId,
    sourceRevision,
    sequence: 1,
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasMentionIndex: true } },
  }).value;
  const workerResult = scheduler.runAtlasGenerationWorkerJob(job);
  assert.equal(workerResult.ok, true);
  assert.equal(workerResult.value.ok, true);

  const edited = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payload: {
      projectId,
      sceneId,
      text: 'Mira moved the map before the worker returned.',
    },
  });
  assert.equal(edited.ok, true);
  assert.notEqual(runtime.hashCoreState(edited.state), sourceRevision);

  const accepted = scheduler.acceptAtlasGenerationWorkerResult({
    activeJob: job,
    result: workerResult.value,
    currentCoreState: edited.state,
  });

  assert.equal(accepted.ok, false);
  assert.equal(accepted.error.code, 'E_ATLAS_STALE_WORKER_RESULT');
  assert.equal(accepted.error.reason, 'STALE_WORKER_RESULT_SOURCE_REVISION');
});

test('E01 C05: worker result identity must match active request before publication', async () => {
  const { projectId, state } = await buildAtlasFixture();
  const scheduler = await loadModule(path.join('src', 'derived', 'atlas', 'scheduleAtlasGeneration.mjs'));
  const capabilitySnapshot = { platformId: 'node', capabilities: { atlasMentionIndex: true } };
  const firstJob = scheduler.createAtlasGenerationJob({
    coreState: state,
    projectId,
    sequence: 1,
    capabilitySnapshot,
  }).value;
  const secondJob = scheduler.createAtlasGenerationJob({
    coreState: state,
    projectId,
    sequence: 2,
    capabilitySnapshot,
  }).value;
  const firstResult = scheduler.runAtlasGenerationWorkerJob(firstJob).value;

  const accepted = scheduler.acceptAtlasGenerationWorkerResult({
    activeJob: secondJob,
    result: firstResult,
    currentCoreState: state,
  });

  assert.equal(accepted.ok, false);
  assert.equal(accepted.error.code, 'E_ATLAS_STALE_WORKER_RESULT');
  assert.equal(accepted.error.reason, 'STALE_WORKER_RESULT_IDENTITY_MISMATCH');
  assert.deepEqual(accepted.error.details.mismatches, ['requestId', 'generation']);
});

test('E01 C05: fresh worker result can publish only a derived manifest pointer', async () => {
  const { projectId, state } = await buildAtlasFixture();
  const scheduler = await loadModule(path.join('src', 'derived', 'atlas', 'scheduleAtlasGeneration.mjs'));
  const job = scheduler.createAtlasGenerationJob({
    coreState: state,
    projectId,
    sequence: 1,
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasMentionIndex: true } },
  }).value;
  const workerResult = scheduler.runAtlasGenerationWorkerJob(job).value;
  const accepted = scheduler.acceptAtlasGenerationWorkerResult({
    activeJob: job,
    result: workerResult,
    currentCoreState: state,
  });

  assert.equal(accepted.ok, true);
  assert.equal(accepted.value.accepted, true);
  assert.equal(accepted.value.published.sourceRevision, job.sourceRevision);
  assert.equal(accepted.value.published.persistentDerivedTruth, false);
  assert.match(accepted.value.published.generationId, /^atlas-generation:/u);
  assert.match(accepted.value.published.manifestHash, /^[0-9a-f]{64}$/u);
  assert.equal(Object.hasOwn(accepted.value.published, 'manifest'), false);
});

test('E01 C05: scheduler boundary adds no filesystem, network, Electron, timer, or renderer storage bypass', () => {
  const sourcePath = path.join(process.cwd(), 'src', 'derived', 'atlas', 'scheduleAtlasGeneration.mjs');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const forbidden = [
    /from\s+['"]node:fs['"]/u,
    /from\s+['"]node:child_process['"]/u,
    /from\s+['"]node:http['"]/u,
    /from\s+['"]node:https['"]/u,
    /from\s+['"]node:net['"]/u,
    /from\s+['"]electron['"]/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /\bmkdir(?:Sync)?\s*\(/u,
    /\brename(?:Sync)?\s*\(/u,
    /\bunlink(?:Sync)?\s*\(/u,
    /\brm(?:Sync)?\s*\(/u,
    /\bsetTimeout\b/u,
    /\bsetInterval\b/u,
    /\bDate\.now\b/u,
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
  ];

  for (const pattern of forbidden) {
    assert.doesNotMatch(source, pattern, pattern.source);
  }
});
