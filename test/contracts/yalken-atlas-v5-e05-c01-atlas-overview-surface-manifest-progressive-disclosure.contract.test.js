const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildAtlasOverviewFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const projectId = 'atlas-overview-project';
  const sceneAId = 'scene-a';
  const sceneBId = 'scene-b';
  const sceneCId = 'scene-c';
  const sceneAText = 'Anna met Mira in the archive. Anna trusted the Atlas keeper.';
  const sceneBText = 'Mira warned Sol. Anna and Sol crossed the bridge.';
  const sceneCText = 'Sol returned alone while Mira archived the bridge map.';
  const base = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas overview', sceneId: sceneAId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId: sceneAId, text: sceneAText },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-anna', name: 'Anna', entityKind: 'character' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ALIAS_ADD,
      payload: { projectId, entityId: 'entity-anna', aliasId: 'alias-atlas-keeper', value: 'Atlas keeper' },
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
  assert.equal(base.ok, true);

  const state = JSON.parse(JSON.stringify(base.state));
  state.data.projects[projectId].scenes[sceneBId] = { id: sceneBId, title: 'Bridge', text: sceneBText };
  state.data.projects[projectId].scenes[sceneCId] = { id: sceneCId, title: 'Return', text: sceneCText };
  return { projectId, state };
}

test('E05 C01: Atlas overview derives a read-only surface manifest and bounded progressive disclosure packet', async () => {
  const { projectId, state } = await buildAtlasOverviewFixture();
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'deriveAtlasOverview.mjs'));
  const before = JSON.stringify(state);

  const first = atlas.deriveAtlasOverview({
    coreState: state,
    params: { projectId, limit: 3 },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasOverview: true } },
  });
  const second = atlas.deriveAtlasOverview({
    coreState: JSON.parse(JSON.stringify(state)),
    params: { projectId, limit: 3 },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasOverview: true } },
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.value.schemaVersion, 'derived.atlas.overview.v1');
  assert.equal(first.value.state, 'ready');
  assert.equal(first.value.projectId, projectId);
  assert.equal(first.value.summary.sceneCount, 3);
  assert.equal(first.value.summary.entityCount, 3);
  assert.equal(first.value.summary.activeObservationCount, 10);
  assert.equal(first.value.summary.cooccurrencePairCount, 3);
  assert.equal(first.value.summary.graphNodeCount, 3);
  assert.equal(first.value.summary.graphEdgeCount, 3);
  assert.equal(first.value.summary.graphClusterCount, 1);
  assert.match(first.value.summary.overviewHash, /^[0-9a-f]{64}$/u);
  assert.equal(first.value.summary.overviewHash, second.value.summary.overviewHash);
  assert.equal(JSON.stringify(state), before);

  assert.deepEqual(first.value.surfaceManifest, {
    schemaVersion: 'surface.atlas.overview.v1',
    surfaceId: 'surface.atlas.overview',
    providerId: 'query.atlasOverview',
    host: 'rightRail',
    slotId: 'rightRail.context.atlas.overview',
    contributionKind: 'readOnlyProjection',
    allowedStateClasses: ['PROJECT_STATE', 'DERIVED_STATE', 'TRANSIENT_STATE'],
    commandAuthority: 'none',
    productMutation: false,
    storageAuthority: false,
    fallback: {
      empty: 'ATLAS_OVERVIEW_EMPTY',
      unavailable: 'ATLAS_OVERVIEW_UNAVAILABLE',
    },
  });
  assert.equal(first.value.authority.readModelOnly, true);
  assert.equal(first.value.authority.projectTruthMutation, false);
  assert.equal(first.value.authority.storageMutation, false);
  assert.equal(first.value.authority.networkMutation, false);
  assert.equal(first.value.authority.heavySurface, false);
  assert.deepEqual(
    first.value.progressiveDisclosure.bands.map((band) => [band.bandId, band.startsExpanded, band.commandId]),
    [
      ['atlas-overview-health', true, ''],
      ['atlas-overview-entities', false, ''],
      ['atlas-overview-relations', false, ''],
      ['atlas-overview-graph', false, ''],
    ],
  );
  assert.deepEqual(
    first.value.topEntities.map((entity) => [entity.entityId, entity.appearanceCount]).slice(0, 3),
    [
      ['entity-anna', 4],
      ['entity-mira', 3],
      ['entity-sol', 3],
    ],
  );
  assert.equal(first.value.topRelations.length, 3);
  assert.equal(first.value.sceneCoverage.length, 3);
  assert.equal(first.value.evidence.designAdvisory.applied, true);
  assert.equal(first.value.evidence.designAdvisory.runtimeMetadataIncluded, false);
  assert.equal(first.value.evidence.designAdvisory.readinessToken, false);
});

test('E05 C01: Atlas overview returns empty and unavailable states without product mutation', async () => {
  const { projectId, state } = await buildAtlasOverviewFixture();
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'deriveAtlasOverview.mjs'));

  const emptyState = JSON.parse(JSON.stringify(state));
  emptyState.data.projects[projectId].atlas.entities = {};
  const empty = atlas.deriveAtlasOverview({
    coreState: emptyState,
    params: { projectId },
  });
  assert.equal(empty.ok, true);
  assert.equal(empty.value.state, 'empty');
  assert.equal(empty.value.summary.observationCount, 0);
  assert.equal(empty.value.surfaceManifest.productMutation, false);

  const disabled = atlas.deriveAtlasOverview({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasOverview: false } },
  });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');

  const missing = atlas.deriveAtlasOverview({
    coreState: state,
    params: { projectId: 'missing-project' },
  });
  assert.equal(missing.ok, true);
  assert.equal(missing.value.state, 'unavailable');
  assert.equal(missing.value.unavailableReason, 'PROJECT_NOT_FOUND');
  assert.equal(missing.value.authority.networkMutation, false);
});

test('E05 C01: Atlas overview exports through barrels and keeps side-effect boundaries closed', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));
  assert.equal(derived.deriveAtlasOverview, atlas.deriveAtlasOverview);
  assert.equal(derived.ATLAS_OVERVIEW_SCHEMA_VERSION, atlas.ATLAS_OVERVIEW_SCHEMA_VERSION);
  assert.equal(derived.ATLAS_OVERVIEW_VIEW_ID, 'derived.atlas.overview.v1');

  const sources = [
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'deriveAtlasOverview.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'atlasOverviewTypes.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'index.mjs'),
  ];
  const forbidden = [
    /from\s+['"]node:fs['"]/u,
    /from\s+['"]node:child_process['"]/u,
    /from\s+['"]node:http['"]/u,
    /from\s+['"]node:https['"]/u,
    /from\s+['"]node:net['"]/u,
    /from\s+['"]electron['"]/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
    /\baddEventListener\s*\(/u,
    /dispatchUiCommand/u,
  ];
  for (const sourcePath of sources) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${path.basename(sourcePath)} matched ${pattern.source}`);
    }
  }
});

test('E05 C01: renderer and main wire Atlas overview through query bridge and typed host only', () => {
  const mainSource = fs.readFileSync(path.join(process.cwd(), 'src', 'main.js'), 'utf8');
  assert.match(mainSource, /ATLAS_OVERVIEW_QUERY_ID\s*=\s*WORKSPACE_QUERY_IDS\.ATLAS_OVERVIEW/u);
  assert.match(mainSource, /\[ATLAS_OVERVIEW_QUERY_ID,\s*handleWorkspaceAtlasOverviewQuery\]/u);
  assert.match(mainSource, /function loadAtlasOverviewModule/u);
  assert.match(mainSource, /function makeAtlasOverviewFallback/u);
  assert.match(mainSource, /async function buildAtlasOverviewCoreState/u);
  assert.match(mainSource, /async function handleWorkspaceAtlasOverviewQuery/u);
  assert.match(mainSource, /sanitizePayloadWithinProjectRoot/u);
  assert.match(mainSource, /parseObservablePayload/u);
  assert.doesNotMatch(mainSource, /handleWorkspaceAtlasOverviewQuery[\s\S]{0,2000}writeFileAtomic/u);

  const rendererSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'editor.js'), 'utf8');
  assert.match(rendererSource, /ATLAS_OVERVIEW_QUERY_ID\s*=\s*WORKSPACE_QUERY_IDS\.ATLAS_OVERVIEW/u);
  assert.match(rendererSource, /atlasOverviewHost/u);
  assert.match(rendererSource, /normalizeAtlasOverview/u);
  assert.match(rendererSource, /renderAtlasOverviewState/u);
  assert.match(rendererSource, /refreshAtlasOverview/u);
  assert.match(rendererSource, /invokeWorkspaceQueryBridge\(ATLAS_OVERVIEW_QUERY_ID/u);
  assert.doesNotMatch(rendererSource, /dispatchUiCommand\([^)]*ATLAS_OVERVIEW_QUERY_ID/u);

  const htmlSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'index.html'), 'utf8');
  assert.match(htmlSource, /data-atlas-overview-host/u);
  assert.match(htmlSource, /data-atlas-overview-provider="query\.atlasOverview"/u);
  assert.match(htmlSource, /data-atlas-current-scene-provider="query\.atlasCurrentScene"/u);

  const cssSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'styles.css'), 'utf8');
  assert.match(cssSource, /\.right-rail-atlas-overview-metrics/u);
  assert.match(cssSource, /\.right-rail-atlas-overview-section summary:focus-visible/u);
});
