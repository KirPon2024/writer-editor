const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildSchedulerFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const projectId = 'atlas-global-composite-scheduler-project';
  const sceneId = 'scene-a';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Global Composite Scheduler', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId, text: 'Mira meets Sol. Sol guards the map.' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-sol', name: 'Sol', entityKind: 'character' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
      payload: { projectId, mapId: 'map-main', title: 'Composite Map' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
      payload: {
        projectId,
        mapId: 'map-main',
        nodeId: 'node-scene',
        label: 'Scene note',
        nodeKind: 'sceneRef',
        targetKind: 'scene',
        targetId: sceneId,
      },
    },
  ]);
  assert.equal(built.ok, true);
  return { runtime, projectId, sceneId, state: built.state };
}

function capabilitySnapshot() {
  return {
    platformId: 'node',
    capabilities: {
      atlasGlobalCompositeGraph: true,
      atlasMentionIndex: true,
      atlasLocalGraph: true,
      plotProjection: true,
      ideaProjection: true,
      meaningProjection: true,
      crossProjectionImpactPreview: true,
      manualMapView: true,
    },
  };
}

test('E08 C02: scheduler creates work only for explicit open or granted idle budget', async () => {
  const { runtime, projectId, state } = await buildSchedulerFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const sourceRevision = runtime.hashCoreState(state);

  const explicit = derived.createAtlasGlobalCompositeGraphJob({
    coreState: state,
    projectId,
    sourceRevision,
    sequence: 1,
    triggerMode: derived.ATLAS_GLOBAL_COMPOSITE_GRAPH_TRIGGER.EXPLICIT_OPEN,
    capabilitySnapshot: capabilitySnapshot(),
  });
  const idle = derived.createAtlasGlobalCompositeGraphJob({
    coreState: state,
    projectId,
    sequence: 2,
    triggerMode: derived.ATLAS_GLOBAL_COMPOSITE_GRAPH_TRIGGER.IDLE_BUDGET,
    idleBudgetMs: 12,
    capabilitySnapshot: capabilitySnapshot(),
  });
  const eager = derived.createAtlasGlobalCompositeGraphJob({
    coreState: state,
    projectId,
    sequence: 3,
    triggerMode: 'backgroundDaemon',
    capabilitySnapshot: capabilitySnapshot(),
  });
  const idleWithoutBudget = derived.createAtlasGlobalCompositeGraphJob({
    coreState: state,
    projectId,
    sequence: 4,
    triggerMode: derived.ATLAS_GLOBAL_COMPOSITE_GRAPH_TRIGGER.IDLE_BUDGET,
    capabilitySnapshot: capabilitySnapshot(),
  });

  assert.equal(explicit.ok, true);
  assert.equal(explicit.value.schemaVersion, derived.ATLAS_GLOBAL_COMPOSITE_GRAPH_JOB_SCHEMA_VERSION);
  assert.equal(explicit.value.sourceRevision, sourceRevision);
  assert.equal(explicit.value.trigger.mode, 'explicitOpen');
  assert.equal(idle.ok, true);
  assert.equal(idle.value.trigger.mode, 'idleBudget');
  assert.equal(idle.value.trigger.idleBudgetMs, 12);
  assert.deepEqual(explicit.value.adapter.authority, {
    filesystem: false,
    network: false,
    writer: false,
    projectMutation: false,
    manuscriptMutation: false,
    rendererMutation: false,
    persistentDerivedTruth: false,
  });
  assert.notStrictEqual(explicit.value.input.coreState, state);
  assert.deepEqual(explicit.value.input.coreState, state);
  assert.equal(eager.ok, false);
  assert.equal(eager.error.code, 'E_ATLAS_GLOBAL_COMPOSITE_TRIGGER_REQUIRED');
  assert.equal(idleWithoutBudget.ok, false);
  assert.equal(idleWithoutBudget.error.code, 'E_ATLAS_GLOBAL_COMPOSITE_IDLE_BUDGET_REQUIRED');
});

test('E08 C02: queue coalesces to latest generation per project and stays bounded', async () => {
  const { projectId, state } = await buildSchedulerFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const jobs = [1, 2, 3].map((sequence) => derived.createAtlasGlobalCompositeGraphJob({
    coreState: state,
    projectId,
    sequence,
    triggerMode: 'explicitOpen',
    capabilitySnapshot: capabilitySnapshot(),
  }).value);
  const other = derived.createAtlasGlobalCompositeGraphJob({
    coreState: state,
    projectId: 'other-project',
    sequence: 4,
    triggerMode: 'explicitOpen',
    capabilitySnapshot: capabilitySnapshot(),
  }).value;

  const bounded = derived.coalesceAtlasGlobalCompositeGraphJobs([...jobs, other], { maxQueueSize: 1 });
  const projectQueue = derived.coalesceAtlasGlobalCompositeGraphJobs(jobs, { maxQueueSize: 4 });

  assert.equal(bounded.ok, true);
  assert.equal(bounded.value.schemaVersion, derived.ATLAS_GLOBAL_COMPOSITE_GRAPH_QUEUE_SCHEMA_VERSION);
  assert.equal(bounded.value.queue.length, 1);
  assert.equal(bounded.value.queue[0].projectId, 'other-project');
  assert.equal(bounded.value.discardedCount, 1);
  assert.equal(projectQueue.value.queue.length, 1);
  assert.equal(projectQueue.value.queue[0].generation, 3);
});

test('E08 C02: fresh result publishes only a derived pointer after identity and source revision match', async () => {
  const { projectId, state } = await buildSchedulerFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const job = derived.createAtlasGlobalCompositeGraphJob({
    coreState: state,
    projectId,
    sequence: 1,
    triggerMode: 'explicitOpen',
    capabilitySnapshot: capabilitySnapshot(),
  }).value;
  const result = derived.runAtlasGlobalCompositeGraphJob(job);
  const accepted = derived.acceptAtlasGlobalCompositeGraphResult({
    activeJob: job,
    result: result.value,
    currentCoreState: state,
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.ok, true);
  assert.equal(result.value.schemaVersion, derived.ATLAS_GLOBAL_COMPOSITE_GRAPH_RESULT_SCHEMA_VERSION);
  assert.equal(result.value.compositeGraph.schemaVersion, derived.ATLAS_GLOBAL_COMPOSITE_GRAPH_SCHEMA_VERSION);
  assert.match(result.value.compositeHash, /^[0-9a-f]{64}$/u);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.value.accepted, true);
  assert.equal(accepted.value.published.schemaVersion, derived.ATLAS_GLOBAL_COMPOSITE_GRAPH_SCHEMA_VERSION);
  assert.equal(accepted.value.published.compositeHash, result.value.compositeHash);
  assert.equal(accepted.value.published.persistentDerivedTruth, false);
  assert.equal(Object.hasOwn(accepted.value.published, 'compositeGraph'), false);
});

test('E08 C02: stale result is discarded on source revision or request identity mismatch', async () => {
  const { runtime, projectId, sceneId, state } = await buildSchedulerFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const firstJob = derived.createAtlasGlobalCompositeGraphJob({
    coreState: state,
    projectId,
    sequence: 1,
    triggerMode: 'explicitOpen',
    capabilitySnapshot: capabilitySnapshot(),
  }).value;
  const secondJob = derived.createAtlasGlobalCompositeGraphJob({
    coreState: state,
    projectId,
    sequence: 2,
    triggerMode: 'explicitOpen',
    capabilitySnapshot: capabilitySnapshot(),
  }).value;
  const firstResult = derived.runAtlasGlobalCompositeGraphJob(firstJob).value;
  const edited = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payload: {
      projectId,
      sceneId,
      text: 'Mira changed the scene before the global graph finished.',
    },
  });
  assert.equal(edited.ok, true);

  const staleSource = derived.acceptAtlasGlobalCompositeGraphResult({
    activeJob: firstJob,
    result: firstResult,
    currentCoreState: edited.state,
  });
  const staleIdentity = derived.acceptAtlasGlobalCompositeGraphResult({
    activeJob: secondJob,
    result: firstResult,
    currentCoreState: state,
  });

  assert.equal(staleSource.ok, false);
  assert.equal(staleSource.error.code, 'E_ATLAS_GLOBAL_COMPOSITE_STALE_RESULT');
  assert.equal(staleSource.error.reason, 'STALE_RESULT_SOURCE_REVISION');
  assert.equal(staleIdentity.ok, false);
  assert.equal(staleIdentity.error.code, 'E_ATLAS_GLOBAL_COMPOSITE_STALE_RESULT');
  assert.equal(staleIdentity.error.reason, 'STALE_RESULT_IDENTITY_MISMATCH');
  assert.deepEqual(staleIdentity.error.details.mismatches, ['requestId', 'generation']);
});

test('E08 C02: global composite scheduler exports through barrels and adds no daemon storage network or timer path', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));

  assert.equal(derived.createAtlasGlobalCompositeGraphJob, atlas.createAtlasGlobalCompositeGraphJob);
  assert.equal(derived.runAtlasGlobalCompositeGraphJob, atlas.runAtlasGlobalCompositeGraphJob);
  assert.equal(derived.acceptAtlasGlobalCompositeGraphResult, atlas.acceptAtlasGlobalCompositeGraphResult);
  assert.equal(derived.ATLAS_GLOBAL_COMPOSITE_GRAPH_TRIGGER.EXPLICIT_OPEN, 'explicitOpen');

  const sources = [
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'scheduleAtlasGlobalCompositeGraph.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'atlasGlobalCompositeGraphTypes.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'index.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'index.mjs'),
  ];
  const forbidden = [
    /from\s+['"]node:fs['"]/u,
    /from\s+['"]node:child_process['"]/u,
    /from\s+['"]node:http['"]/u,
    /from\s+['"]node:https['"]/u,
    /from\s+['"]node:net['"]/u,
    /from\s+['"]electron['"]/u,
    /new\s+Worker\b/u,
    /\bsetTimeout\b/u,
    /\bsetInterval\b/u,
    /\bDate\.now\b/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
    /dispatchUiCommand/u,
    /addEventListener\s*\(\s*['"](?:beforeinput|input|keydown|pointermove|wheel)['"]/u,
    /persistentDerivedTruth:\s*true/u,
    /projectMutation:\s*true/u,
    /manuscriptMutation:\s*true/u,
    /rendererMutation:\s*true/u,
  ];

  for (const sourcePath of sources) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${path.basename(sourcePath)} matched ${pattern.source}`);
    }
  }
});
