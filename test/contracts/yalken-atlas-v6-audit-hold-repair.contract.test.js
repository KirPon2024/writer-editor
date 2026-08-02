const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

async function importModule(relativePath) {
  return import(pathToFileURL(path.join(ROOT, relativePath)).href);
}

test('Atlas V6: strict collaborator admission is batch-atomic and preserves complete provenance', async () => {
  const collab = await importModule('src/collab/index.mjs');
  const core = await importModule('src/core/runtime.mjs');
  const domain = await importModule('src/product/domainEventPort.mjs');
  const projectId = 'atlas-v6-collaborator-project';
  const lifecycleId = 'atlas-v6-collaborator-lifecycle';
  const created = core.reduceCoreState(core.createInitialCoreState(), {
    type: core.CORE_COMMAND_IDS.PROJECT_CREATE,
    payload: { projectId, title: 'Collaborator admission' },
  });
  assert.equal(created.ok, true);
  const before = cloneJson(created.state);
  const beforeHash = core.hashCoreState(before);
  const supported = {
    schemaVersion: collab.COLLABORATOR_EVENT_ENVELOPE_SCHEMA_VERSION,
    commandVersion: collab.COLLABORATOR_COMMAND_VERSION,
    projectId,
    lifecycleId,
    eventId: 'collaborator-event-supported',
    actorId: 'peer-author',
    sessionId: 'peer-session-with-causal-metadata',
    ts: '2026-08-02T01:00:00.000Z',
    opId: 'collaborator-op-supported',
    commandId: core.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payload: { projectId, sceneId: 'scene-1', text: 'Exact collaborator text.' },
    prevHash: beforeHash,
    dependencies: ['event:ancestor-a', 'event:ancestor-b'],
    targets: [{
      targetKind: 'scene',
      targetId: 'scene-1',
      range: { from: 2, to: 7 },
      targetRevision: 'scene-revision-44',
    }],
    causal: {
      correlationId: 'correlation-atlas-v6',
      causationId: 'causation-atlas-v6',
      vector: { peer: 9 },
    },
  };
  const applied = collab.applyEventLog({
    coreState: before,
    initialStateHash: beforeHash,
    events: [supported],
    requireStrictEnvelope: true,
    expectedProjectId: projectId,
    expectedLifecycleId: lifecycleId,
    domainEventPort: domain.createCoreDomainEventProductPort(),
    hashState: core.hashCoreState,
    applyCommand: core.reduceCoreState,
  });
  assert.equal(applied.appliedCount, 1);
  assert.deepEqual(applied.rejected, []);
  assert.deepEqual(applied.appliedEvents[0].event.dependencies, supported.dependencies);
  assert.deepEqual(applied.appliedEvents[0].event.targets, supported.targets);
  assert.deepEqual(applied.appliedEvents[0].event.causal, supported.causal);
  assert.equal(applied.appliedEvents[0].event.sessionId, supported.sessionId);
  assert.match(applied.appliedEvents[0].event.provenanceDigest, /^[a-f0-9]{64}$/u);

  for (const invalid of [
    { ...supported, eventId: 'future-schema', opId: 'future-schema-op', schemaVersion: 'yalken.collaborator.eventEnvelope.v999' },
    { ...supported, eventId: 'future-command', opId: 'future-command-op', commandVersion: 999 },
    { ...supported, eventId: 'foreign-lifecycle', opId: 'foreign-lifecycle-op', lifecycleId: 'foreign-lifecycle' },
  ]) {
    const batch = collab.applyEventLog({
      coreState: before,
      initialStateHash: beforeHash,
      events: [supported, invalid],
      requireStrictEnvelope: true,
      expectedProjectId: projectId,
      expectedLifecycleId: lifecycleId,
      domainEventPort: domain.createCoreDomainEventProductPort(),
      hashState: core.hashCoreState,
      applyCommand: core.reduceCoreState,
    });
    assert.equal(batch.appliedCount, 0);
    assert.deepEqual(batch.nextState, before);
    assert.equal(batch.stateHash, beforeHash);
    assert.equal(batch.rejected.length, 1);
  }
});

test('Atlas V6: Manual Map repeat import is one canonical operation with complete domain events and replay', async () => {
  const collab = await importModule('src/collab/index.mjs');
  const core = await importModule('src/core/runtime.mjs');
  const hashing = await importModule('src/core/browser-safe-hash.mjs');
  const domain = await importModule('src/product/domainEventPort.mjs');
  const projectId = 'atlas-v6-manual-map-import';
  const created = core.reduceCoreState(core.createInitialCoreState(), {
    type: core.CORE_COMMAND_IDS.PROJECT_CREATE,
    payload: { projectId, title: 'Manual Map canonical intake' },
  });
  assert.equal(created.ok, true);
  const planCore = {
    schemaVersion: 'manualMap.jsonRepeatImportPlan.v1',
    projectId,
    commandAuthority: 'CommandKernel',
    directCoreMutation: false,
    storageMutation: false,
    networkMutation: false,
    commands: [
      {
        type: core.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
        payload: { projectId, mapId: 'map-imported', title: 'Imported map' },
      },
      {
        type: core.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
        payload: {
          projectId,
          mapId: 'map-imported',
          nodeId: 'node-a',
          label: 'Node A',
          nodeKind: 'note',
          position: { x: 10, y: 20 },
        },
      },
      {
        type: core.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
        payload: {
          projectId,
          mapId: 'map-imported',
          nodeId: 'node-b',
          label: 'Node B',
          nodeKind: 'note',
          position: { x: 40, y: 50 },
        },
      },
      {
        type: core.CORE_COMMAND_IDS.MANUAL_MAP_EDGE_ADD,
        payload: {
          projectId,
          mapId: 'map-imported',
          edgeId: 'edge-a-b',
          fromNodeId: 'node-a',
          toNodeId: 'node-b',
          edgeKind: 'link',
          label: 'A to B',
        },
      },
    ],
  };
  const importPlan = {
    ...cloneJson(planCore),
    meta: { planHash: hashing.hashCanonicalValue(planCore) },
  };
  const domainEventPort = domain.createCoreDomainEventProductPort();
  const applied = collab.applyCommandWithEventLog({
    eventLog: collab.createEmptyEventLog(),
    currentState: created.state,
    currentStateHash: core.hashCoreState(created.state),
    domainEventPort,
    commandId: core.CORE_COMMAND_IDS.MANUAL_MAP_IMPORT_JSON_REPEAT,
    payload: { projectId, importPlan },
    opId: 'manual-map-import-operation',
    eventId: 'manual-map-import-event',
    ts: '2026-08-02T01:10:00.000Z',
    actorId: 'local-author',
    sessionId: 'local-session',
    projectId,
    lifecycleId: 'manual-map-import-lifecycle',
    dependencies: ['local-file:sha256:fixture'],
    targets: [{ targetKind: 'project', targetId: projectId }],
    applyCommand: core.reduceCoreState,
  });
  assert.equal(applied.ok, true, JSON.stringify(applied.error || {}, null, 2));
  assert.equal(applied.eventLog.events.length, 1);
  assert.equal(applied.entry.commandId, core.CORE_COMMAND_IDS.MANUAL_MAP_IMPORT_JSON_REPEAT);
  assert.ok(applied.domainEvents.length >= 4);
  assert.equal(applied.state.data.projects[projectId].manualMaps.maps['map-imported'].nodes['node-a'].label, 'Node A');
  assert.equal(applied.state.data.projects[projectId].manualMaps.maps['map-imported'].edges['edge-a-b'].label, 'A to B');

  const replay = collab.buildOperationReplayReport({
    eventLog: applied.eventLog,
    initialState: created.state,
    initialStateHash: core.hashCoreState(created.state),
    expectedFinalStateHash: applied.stateHash,
    requireExecutableOperationEnvelope: true,
    hashState: core.hashCoreState,
    applyCommand: core.reduceCoreState,
    domainEventPort,
  });
  assert.equal(replay.ok, true, JSON.stringify(replay.rejected, null, 2));
  assert.equal(replay.appliedCount, 1);
});

test('Atlas V6: complete BCP47 author tags survive without manuscript normalization', async () => {
  const core = await importModule('src/core/runtime.mjs');
  const manuscript = 'Cafe\u0301 stays decomposed. 👩🏽‍💻 stays exact. Авторский текст.';
  const validTags = [
    'sl-rozaj-biske-1994',
    'zh-Hant-TW-u-ca-chinese-x-author',
    'en-US-u-nu-latn-x-draft',
    'und-Latn-x-private',
    'x-yalken-author',
  ];
  for (const [index, languageCode] of validTags.entries()) {
    const projectId = `atlas-v6-language-${index}`;
    const created = core.applyCoreSequence(core.createInitialCoreState(), [
      {
        type: core.CORE_COMMAND_IDS.PROJECT_CREATE,
        payload: { projectId, title: languageCode, sceneId: 'scene-1' },
      },
      {
        type: core.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
        payload: { projectId, sceneId: 'scene-1', text: manuscript },
      },
      {
        type: core.CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET,
        payload: { projectId, scopeKind: 'project', languageCode },
      },
    ]);
    assert.equal(created.ok, true, `${languageCode}: ${JSON.stringify(created.error || {})}`);
    const stored = created.state.data.projects[projectId].atlas.languageTags.project.languageCode;
    const expected = languageCode.startsWith('x-') ? languageCode : new Intl.Locale(languageCode).toString();
    assert.equal(stored, expected);
    assert.equal(created.state.data.projects[projectId].scenes['scene-1'].text, manuscript);
    assert.equal(Buffer.from(created.state.data.projects[projectId].scenes['scene-1'].text).equals(Buffer.from(manuscript)), true);
  }

  for (const languageCode of ['en-u-ca-gregory-u-nu-latn', 'sl-rozaj-rozaj', 'x']) {
    const projectId = `atlas-v6-language-invalid-${languageCode.replace(/[^a-z0-9]+/giu, '-')}`;
    const created = core.reduceCoreState(core.createInitialCoreState(), {
      type: core.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Invalid tag', sceneId: 'scene-1' },
    });
    const rejected = core.reduceCoreState(created.state, {
      type: core.CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET,
      payload: { projectId, scopeKind: 'project', languageCode },
    });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error.code, 'E_ATLAS_LANGUAGE_TAG_BCP47_INVALID');
  }
});

test('Atlas V6: retained analytics scheduler coalesces, invalidates, cancels, bounds and discards stale work', async () => {
  const schedulerModule = require('../../src/derived/atlas/atlasAnalyticsScheduler.cjs');
  const scheduler = schedulerModule.createAtlasAnalyticsScheduler({ maxRetainedResults: 2 });
  let currentRevision = 'revision-1';
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const common = {
    projectId: 'scheduler-project',
    queryId: 'query.atlasOverview',
    requestKey: 'request-a',
    sourceRevision: 'revision-1',
    dependencyKeys: ['manifest', 'scene:one'],
    getCurrentRevision: () => currentRevision,
  };
  const first = scheduler.schedule({ ...common, run: async () => { await firstGate; return { value: 1 }; } });
  const coalesced = scheduler.schedule({ ...common, run: async () => ({ value: 999 }) });
  releaseFirst();
  const [firstResult, coalescedResult] = await Promise.all([first, coalesced]);
  assert.equal(firstResult.ok, true);
  assert.equal(coalescedResult.ok, true);
  assert.equal(coalescedResult.scheduler.mode, 'coalesced');
  assert.deepEqual(coalescedResult.value, { value: 1 });
  const retained = await scheduler.schedule({ ...common, run: async () => ({ value: 2 }) });
  assert.equal(retained.scheduler.mode, 'retained');

  let releaseSuperseded;
  const supersededGate = new Promise((resolve) => { releaseSuperseded = resolve; });
  const superseded = scheduler.schedule({
    ...common,
    requestKey: 'request-old',
    run: async () => { await supersededGate; return { value: 'old' }; },
  });
  const replacement = scheduler.schedule({
    ...common,
    requestKey: 'request-new',
    run: async () => ({ value: 'new' }),
  });
  releaseSuperseded();
  const [supersededResult, replacementResult] = await Promise.all([superseded, replacement]);
  assert.equal(supersededResult.ok, false);
  assert.equal(supersededResult.error.code, 'E_ATLAS_ANALYTICS_JOB_CANCELLED');
  assert.equal(replacementResult.ok, true);

  const other = await scheduler.schedule({
    projectId: 'scheduler-project',
    queryId: 'query.atlasMatrices',
    requestKey: 'request-matrices',
    sourceRevision: 'revision-1',
    dependencyKeys: ['scene:two'],
    getCurrentRevision: () => currentRevision,
    run: async () => ({ value: 'matrix' }),
  });
  assert.equal(other.ok, true);
  const invalidated = scheduler.invalidate({
    projectId: 'scheduler-project',
    dependencyKeys: ['scene:one'],
    sourceRevision: 'revision-2',
  });
  assert.equal(invalidated.ok, true);
  assert.equal(scheduler.inspect().retainedJobs.some((job) => job.queryId === 'query.atlasMatrices'), true);

  currentRevision = 'revision-3';
  const stale = await scheduler.schedule({
    projectId: 'scheduler-project',
    queryId: 'query.atlasHeatmap',
    requestKey: 'request-stale',
    sourceRevision: 'revision-2',
    dependencyKeys: ['manifest'],
    getCurrentRevision: () => currentRevision,
    run: async () => ({ value: 'must-discard' }),
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, 'E_ATLAS_ANALYTICS_STALE_RESULT_DISCARDED');
  const inspection = scheduler.inspect();
  assert.ok(inspection.retainedJobs.length <= 2);
  assert.ok(inspection.counters.coalesced >= 1);
  assert.ok(inspection.counters.cancelled >= 1);
  assert.ok(inspection.counters.invalidations >= 1);
  assert.ok(inspection.counters.staleDiscarded >= 1);
});

test('Atlas V6: Design OS resolution requires real command, provider and exact slot catalogs', async () => {
  const designOs = await importModule('src/renderer/design-os/atlasFeatureIntegrationManifest.mjs');
  const slots = await importModule('src/renderer/design-os/atlasSlotCatalog.v1.mjs');
  const commands = await importModule('src/renderer/commands/command-catalog.v1.mjs');
  const queries = require('../../src/shared/workspaceQueryRegistry.cjs');
  const resolve = designOs.resolveAtlasFeatureDesignOsSlots;
  assert.equal(resolve({}).reason, 'E_ATLAS_COMMAND_KERNEL_CATALOG_REQUIRED');
  assert.equal(resolve({ commandCatalog: commands.listCommandCatalog() }).reason, 'E_ATLAS_PROVIDER_CATALOG_REQUIRED');
  assert.equal(resolve({
    commandCatalog: commands.listCommandCatalog(),
    providerCatalog: queries.WORKSPACE_QUERY_RECORDS,
  }).reason, 'E_ATLAS_SLOT_BINDING_CATALOG_REQUIRED');
  const exact = resolve({
    commandCatalog: commands.listCommandCatalog(),
    providerCatalog: queries.WORKSPACE_QUERY_RECORDS,
    slotCatalog: slots.ATLAS_DESIGN_OS_SLOT_CATALOG_V1,
  });
  assert.equal(exact.ok, true, JSON.stringify(exact, null, 2));
  const driftedSlots = cloneJson(slots.ATLAS_DESIGN_OS_SLOT_CATALOG_V1);
  driftedSlots[0].providerId = 'query.atlasManifestSelfCertified';
  assert.equal(resolve({
    commandCatalog: commands.listCommandCatalog(),
    providerCatalog: queries.WORKSPACE_QUERY_RECORDS,
    slotCatalog: driftedSlots,
  }).reason, 'E_ATLAS_SURFACE_SLOT_BINDING_UNRESOLVED');
});

test('Atlas V6: renderer and main contain no fixed Stage-10 or replay injection theater', () => {
  const mainSource = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
  const rendererSource = fs.readFileSync(path.join(ROOT, 'src/renderer/editor.js'), 'utf8');
  const collabSource = fs.readFileSync(path.join(ROOT, 'src/collab/eventLog.mjs'), 'utf8');
  const requestStart = rendererSource.indexOf('function buildStage10LifecycleCommandRequest');
  const requestEnd = rendererSource.indexOf('function renderStage10LifecycleSurface', requestStart);
  const stage10RequestSource = rendererSource.slice(requestStart, requestEnd);
  assert.doesNotMatch(collabSource, /canonicalTruthLink/u);
  assert.doesNotMatch(rendererSource, /Imported review comment from visible Stage-10 control/u);
  assert.doesNotMatch(stage10RequestSource, /sessions:\s*\[\]/u);
  assert.doesNotMatch(stage10RequestSource, /events:\s*\[\]/u);
  assert.match(rendererSource, /STAGE10_PRODUCT_STATE_QUERY_ID/u);
  assert.match(rendererSource, /buildStage10LifecycleCommandRequest/u);
  assert.match(mainSource, /runScheduledAtlasAnalyticsQuery/u);
  assert.match(mainSource, /prepareManualMapPortabilityCommand/u);
  assert.match(mainSource, /E_MANUAL_MAP_PDF_BINARY_ADAPTER_UNAVAILABLE/u);
});
