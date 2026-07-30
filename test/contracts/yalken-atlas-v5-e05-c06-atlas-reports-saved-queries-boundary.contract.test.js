const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildReportsFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'atlas-reports-project';
  const sceneId = 'scene-a';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas reports', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId, text: 'Anna met Mira. Anna found Sol.' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-anna', name: 'Anna', entityKind: 'character' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-mira', name: 'Mira', entityKind: 'character' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-sol', name: 'Sol', entityKind: 'character' },
    },
  ]);
  assert.equal(built.ok, true);
  built.state.data.projects[projectId].languageCode = 'en';
  return { runtime, derived, projectId, sceneId, state: built.state };
}

function capabilitySnapshot() {
  return {
    platformId: 'node',
    capabilities: {
      atlasReportsSavedQueries: true,
      atlasOverview: true,
      atlasMatrices: true,
      atlasHeatmap: true,
      atlasObservationAggregate: true,
      atlasTemporalContinuity: true,
      atlasLocalGraph: true,
    },
  };
}

test('E05 C06: Atlas saved query command persists author truth and report readback detects stale source', async () => {
  const { runtime, derived, projectId, sceneId, state } = await buildReportsFixture();
  const before = derived.deriveAtlasReportsSavedQueries({
    coreState: state,
    params: { projectId, limit: 12 },
    capabilitySnapshot: capabilitySnapshot(),
  });
  assert.equal(before.ok, true);
  assert.equal(before.value.schemaVersion, derived.ATLAS_REPORTS_SAVED_QUERIES_SCHEMA_VERSION);
  assert.equal(before.value.surfaceManifest.schemaVersion, derived.ATLAS_REPORTS_SURFACE_MANIFEST_VERSION);
  assert.equal(before.value.surfaceManifest.providerId, 'query.atlasReportsSavedQueries');
  assert.equal(before.value.surfaceManifest.commandAuthority, 'CommandKernel');
  assert.deepEqual(before.value.surfaceManifest.commandIds, ['atlas.savedQuery.save']);
  assert.equal(before.value.authority.projectTruthMutation, false);
  assert.equal(before.value.authority.storageMutation, false);
  assert.equal(before.value.authority.networkMutation, false);
  assert.equal(before.value.authority.cloudSync, false);
  assert.equal(before.value.authority.hiddenMutation, false);
  assert.equal(before.value.localReportPacket.schemaVersion, derived.ATLAS_LOCAL_REPORT_PACKET_SCHEMA_VERSION);
  assert.equal(before.value.exportSafeSummary.schemaVersion, derived.ATLAS_REPORT_EXPORT_SAFE_SUMMARY_SCHEMA_VERSION);
  assert.equal(before.value.exportSafeSummary.pathless, true);
  assert.equal(before.value.exportSafeSummary.containsPrivateData, false);
  assert.match(before.value.summary.sourceHash, /^[0-9a-f]{64}$/u);

  const saved = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_SAVED_QUERY_SAVE,
    payload: {
      projectId,
      savedQueryId: 'saved-query-main-cast',
      name: 'Main cast report',
      reportType: 'overview',
      sourceHash: before.value.summary.sourceHash,
      filter: {
        entityIds: ['entity-anna', 'entity-mira'],
        queryText: 'main cast',
      },
    },
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.state.data.projects[projectId].scenes[sceneId].text, state.data.projects[projectId].scenes[sceneId].text);
  const reopened = JSON.parse(JSON.stringify(saved.state));
  assert.equal(reopened.data.projects[projectId].atlas.savedQueries['saved-query-main-cast'].name, 'Main cast report');
  assert.equal(reopened.data.projects[projectId].atlas.savedQueries['saved-query-main-cast'].sourceHash, before.value.summary.sourceHash);

  const readback = derived.deriveAtlasReportsSavedQueries({
    coreState: reopened,
    params: { projectId, limit: 12 },
    capabilitySnapshot: capabilitySnapshot(),
  });
  assert.equal(readback.ok, true);
  assert.equal(readback.value.savedQueries.length, 1);
  assert.equal(readback.value.savedQueries[0].schemaVersion, derived.ATLAS_SAVED_QUERY_READBACK_SCHEMA_VERSION);
  assert.equal(readback.value.savedQueries[0].stale, false);
  assert.equal(readback.value.summary.savedQueryCount, 1);
  assert.equal(readback.value.summary.staleSavedQueryCount, 0);

  const edited = runtime.reduceCoreState(reopened, {
    type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payload: { projectId, sceneId, text: 'Anna met Mira. Anna found Sol. Mira returns.' },
  });
  assert.equal(edited.ok, true);
  const stale = derived.deriveAtlasReportsSavedQueries({
    coreState: edited.state,
    params: { projectId, limit: 12 },
    capabilitySnapshot: capabilitySnapshot(),
  });
  assert.equal(stale.ok, true);
  assert.equal(stale.value.savedQueries[0].stale, true);
  assert.equal(stale.value.summary.staleSavedQueryCount, 1);
});

test('E05 C06: saved query command fails closed and is capability gated', async () => {
  const { runtime, projectId, state } = await buildReportsFixture();
  const registryModule = await loadModule(path.join('src', 'renderer', 'commands', 'registry.mjs'));
  const runnerModule = await loadModule(path.join('src', 'renderer', 'commands', 'runCommand.mjs'));

  const missingName = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_SAVED_QUERY_SAVE,
    payload: { projectId, savedQueryId: 'q1', name: '', reportType: 'overview', sourceHash: 'abc' },
  });
  assert.equal(missingName.ok, false);
  assert.equal(missingName.error.code, 'E_ATLAS_SAVED_QUERY_NAME_REQUIRED');
  assert.equal(missingName.stateHash, runtime.hashCoreState(state));

  const invalidType = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_SAVED_QUERY_SAVE,
    payload: { projectId, savedQueryId: 'q1', name: 'Query', reportType: 'cloud', sourceHash: 'abc' },
  });
  assert.equal(invalidType.ok, false);
  assert.equal(invalidType.error.code, 'E_ATLAS_SAVED_QUERY_REPORT_TYPE_INVALID');

  const registry = registryModule.createCommandRegistry();
  registry.registerCommand(runtime.CORE_COMMAND_IDS.ATLAS_SAVED_QUERY_SAVE, (input) => {
    return runtime.reduceCoreState(input.state, {
      type: runtime.CORE_COMMAND_IDS.ATLAS_SAVED_QUERY_SAVE,
      payload: input.payload,
    });
  });
  const webRunner = runnerModule.createCommandRunner(registry, {
    capability: { defaultPlatformId: 'web' },
  });
  const denied = await webRunner(runtime.CORE_COMMAND_IDS.ATLAS_SAVED_QUERY_SAVE, {
    state,
    payload: { projectId, savedQueryId: 'q1', name: 'Denied', reportType: 'overview', sourceHash: 'abc' },
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
});

test('E05 C06: reports derived sources keep side-effect boundaries closed', () => {
  const sources = [
    'src/derived/atlas/deriveAtlasReportsSavedQueries.mjs',
    'src/derived/atlas/atlasReportsTypes.mjs',
  ].map((relativePath) => [path.basename(relativePath), fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')]);
  const forbiddenPatterns = [
    /from\s+['"]node:fs['"]/u,
    /from\s+['"]node:child_process['"]/u,
    /from\s+['"]node:http['"]/u,
    /from\s+['"]node:https['"]/u,
    /from\s+['"]electron['"]/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
    /\bquerySelector\b/u,
    /\bdispatchEvent\b/u,
  ];
  for (const [basename, source] of sources) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${basename} matched ${pattern.source}`);
    }
  }
});

test('E05 C06: renderer and main wire reports through typed read-only surface without hidden mutation', () => {
  const mainSource = fs.readFileSync(path.join(process.cwd(), 'src', 'main.js'), 'utf8');
  const editorSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'editor.js'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'index.html'), 'utf8');
  const cssSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'styles.css'), 'utf8');
  const capabilitySource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'commands', 'capabilityPolicy.mjs'), 'utf8');

  assert.match(mainSource, /const ATLAS_REPORTS_SAVED_QUERIES_QUERY_ID = 'query\.atlasReportsSavedQueries'/u);
  assert.match(mainSource, /loadAtlasReportsSavedQueriesModule/u);
  assert.match(mainSource, /handleWorkspaceAtlasReportsSavedQueriesQuery/u);
  assert.match(mainSource, /WORKSPACE_QUERY_BRIDGE_ALLOWED_QUERY_IDS[\s\S]*ATLAS_REPORTS_SAVED_QUERIES_QUERY_ID/u);
  assert.doesNotMatch(mainSource, /handleWorkspaceAtlasReportsSavedQueriesQuery[\s\S]{0,3200}writeFileAtomic/u);
  assert.match(mainSource, /savedQueries: \{\}/u);

  assert.match(htmlSource, /data-atlas-reports-host/u);
  assert.match(htmlSource, /data-atlas-reports-provider="query\.atlasReportsSavedQueries"/u);
  assert.match(editorSource, /const ATLAS_REPORTS_SAVED_QUERIES_QUERY_ID = 'query\.atlasReportsSavedQueries'/u);
  assert.match(editorSource, /refreshAtlasReportsSavedQueries/u);
  assert.match(editorSource, /Command boundary: atlas\.savedQuery\.save/u);
  assert.doesNotMatch(editorSource, /ATLAS_REPORTS_SAVED_QUERIES_QUERY_ID[\s\S]{0,1000}dispatchUiCommand/u);
  assert.doesNotMatch(editorSource, /atlas\.savedQuery\.save[\s\S]{0,1000}invokePreloadUiCommandBridge/u);
  assert.match(cssSource, /\.right-rail-surface--atlas-reports/u);
  assert.match(capabilitySource, /'atlas\.savedQuery\.save': 'cap\.atlas\.savedQuery\.save'/u);
});
