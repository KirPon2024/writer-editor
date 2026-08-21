'use strict';

// R2.4 WP-102 event/effect/job contracts: domain events are typed facts,
// file effects stay behind the admission port, and a stale background-job
// result is discarded, never published.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');

async function loadModule(relativePath) {
  return import(pathToFileURL(path.join(ROOT, relativePath)).href);
}

test('EVENT: command results carry typed domain events with hashes and closed payloads', async () => {
  const runtime = await loadModule('src/core/runtime.mjs');
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    { type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE, payload: { projectId: 'wp102-project', title: 'WP102', sceneId: 'scene-a' } },
    { type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT, payload: { projectId: 'wp102-project', sceneId: 'scene-a', text: 'Anna arrived.' } },
  ]);
  assert.equal(built.ok, true);
  const events = built.events || [];
  assert.equal(events.length > 0, true, 'zero event denominator forbidden');
  for (const event of events) {
    assert.equal(typeof event.schemaVersion, 'string', 'event is schema-typed');
    assert.equal(typeof event.type, 'string', 'event carries a type');
    assert.equal(typeof event.factKind, 'string', 'event declares its fact kind');
    assert.equal(event.sourceBinding && typeof event.sourceBinding, 'object', 'event is source-bound');
  }
  const hashA = runtime.hashCoreDomainEvents(events);
  const hashB = runtime.hashCoreDomainEvents(JSON.parse(JSON.stringify(events)));
  assert.equal(typeof hashA, 'string');
  assert.equal(hashA.length > 0, true);
  assert.equal(hashA, hashB, 'the event hash chain is deterministic');
  console.log(`R24_WP102_EVENTS=${JSON.stringify({ events: events.length, hash: hashA.slice(0, 12) })}`);
});

test('EVENT: a refused command emits no domain events', async () => {
  const runtime = await loadModule('src/core/runtime.mjs');
  const refused = runtime.reduceCoreState(runtime.createInitialCoreState(), {
    type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payload: { projectId: 'ghost', sceneId: 'scene-a', text: 'x' },
  });
  assert.equal(refused.ok, false);
  assert.equal(Array.isArray(refused.events), true);
  assert.equal(refused.events.length, 0, 'a refusal is not an event source');
});

test('EFFECT: file effects route through the admission port and carry capability classes', async () => {
  const mainSource = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  const openStart = mainSource.indexOf('async function openProjectDocumentFile');
  assert.notEqual(openStart, -1);
  const openBody = mainSource.slice(openStart, openStart + 900);
  const gateAt = openBody.indexOf('if (!filePath || !isAllowedFilePath(filePath)) {');
  const readAt = openBody.indexOf('fileManager.readFile(filePath)');
  assert.notEqual(gateAt, -1, 'the open effect gates on the admission port');
  assert.ok(readAt > gateAt, 'admission precedes the filesystem read');
  assert.ok(openBody.includes('E_PROJECT_OPEN_PATH_NOT_ALLOWED'), 'admission refusal is typed');
  const mapStart = mainSource.indexOf('const IPC_CHANNEL_CAPABILITY_CLASS = Object.freeze({');
  const mapEnd = mainSource.indexOf('});', mapStart);
  const mapBody = mainSource.slice(mapStart, mapEnd);
  assert.ok(mapBody.includes("'file:open': 'fs.read'"));
  assert.ok(mapBody.includes("'file:save': 'fs.write'"));
  assert.ok(mapBody.includes("'file:save-as': 'fs.write'"));
});

test('BACKGROUND_JOB: a stale worker result is discarded and never published', async () => {
  const scheduler = await loadModule('src/derived/atlas/scheduleAtlasGeneration.mjs');
  const runtime = await loadModule('src/core/runtime.mjs');

  const stateA = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    { type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE, payload: { projectId: 'wp102-atlas', title: 'WP102 atlas', sceneId: 'scene-a' } },
    { type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT, payload: { projectId: 'wp102-atlas', sceneId: 'scene-a', text: 'Anna arrived.' } },
  ]);
  assert.equal(stateA.ok, true);

  const jobVerdict = scheduler.createAtlasGenerationJob({ projectId: 'wp102-atlas', coreState: stateA.state, sequence: 1 });
  assert.equal(jobVerdict.ok, true);
  const job = jobVerdict.value;
  assert.equal(job.worker.authority.filesystem, false);
  assert.equal(job.worker.authority.network, false);
  assert.equal(job.worker.authority.projectMutation, false);
  assert.equal(job.worker.cancellation, 'discard-stale-generation-result');

  const workerResult = scheduler.runAtlasGenerationWorkerJob(job);
  assert.equal(workerResult.ok, true);

  // The project moves on while the worker runs: the source revision drifts.
  const stateB = runtime.reduceCoreState(stateA.state, {
    type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payload: { projectId: 'wp102-atlas', sceneId: 'scene-a', text: 'Anna arrived. Peter left.' },
  });
  assert.equal(stateB.ok, true);

  const stale = scheduler.acceptAtlasGenerationWorkerResult({
    activeJob: job,
    result: workerResult.value,
    currentCoreState: stateB.state,
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, 'E_ATLAS_STALE_WORKER_RESULT');
  assert.match(stale.error.reason, /SOURCE_REVISION/u);

  // The same result against the unchanged state publishes cleanly.
  const fresh = scheduler.acceptAtlasGenerationWorkerResult({
    activeJob: job,
    result: workerResult.value,
    currentCoreState: stateA.state,
  });
  assert.equal(fresh.ok, true, JSON.stringify(fresh.error));

  // A generation-mismatched result is refused even against the unchanged state.
  const wrongGeneration = { ...workerResult.value, generation: job.generation + 1 };
  const mismatched = scheduler.acceptAtlasGenerationWorkerResult({
    activeJob: job,
    result: wrongGeneration,
    currentCoreState: stateA.state,
  });
  assert.equal(mismatched.ok, false);
  assert.equal(mismatched.error.code, 'E_ATLAS_STALE_WORKER_RESULT');
});
