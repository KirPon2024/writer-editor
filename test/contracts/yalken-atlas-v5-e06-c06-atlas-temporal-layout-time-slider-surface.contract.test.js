const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

function exactIsoRange(calendarId, start, end = start) {
  return {
    rangeKind: 'exact',
    start: { pointKind: 'calendarDate', calendarId, value: start },
    end: { pointKind: 'calendarDate', calendarId, value: end },
  };
}

function exactOrdinalRange(dayIndex) {
  return {
    rangeKind: 'exact',
    start: { pointKind: 'ordinalDay', dayIndex },
    end: { pointKind: 'ordinalDay', dayIndex },
  };
}

function nodeCapabilitySnapshot() {
  return {
    platformId: 'node',
    capabilities: {
      atlasTemporalLayout: true,
      atlasSceneTemporalAnchors: true,
      atlasRelationSegmentsPerspective: true,
      atlasCalendarDefinitions: true,
      atlasObservationAggregate: true,
      atlasTemporalContinuity: true,
    },
  };
}

async function buildTemporalLayoutFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'atlas-temporal-layout-project';
  const sceneAId = 'scene-a';
  const sceneBId = 'scene-b';
  const sceneCId = 'scene-c';
  const sceneDId = 'scene-d';
  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas temporal layout', sceneId: sceneAId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId: sceneAId, text: 'Anna meets Mira before Omar arrives.' },
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
      payload: { projectId, entityId: 'entity-omar', name: 'Omar', entityKind: 'character' },
    },
  ]);
  assert.equal(created.ok, true);
  const state = JSON.parse(JSON.stringify(created.state));
  state.data.projects[projectId].scenes[sceneBId] = { id: sceneBId, title: 'Second', text: 'Mira warns Anna while Omar waits.' };
  state.data.projects[projectId].scenes[sceneCId] = { id: sceneCId, title: 'Third', text: 'Anna leaves Mira behind.' };
  state.data.projects[projectId].scenes[sceneDId] = { id: sceneDId, title: 'Fourth', text: 'Omar finds Anna after Mira disappears.' };
  const anchored = runtime.applyCoreSequence(state, [
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_CALENDAR_DEFINE,
      payload: {
        projectId,
        calendarId: 'calendar-local',
        name: 'Local Gregorian',
        calendarKind: 'real',
        calendarSystem: 'gregorian-proleptic-local',
        conversionRules: [
          {
            ruleId: 'rule-local-identity',
            ruleKind: 'identity',
            sourceScale: 'iso-date',
            targetScale: 'iso-date',
            precision: 'exact',
          },
        ],
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET,
      payload: {
        projectId,
        sceneId: sceneAId,
        storyRange: exactIsoRange('calendar-local', '2026-07-01'),
        narrativeRange: exactOrdinalRange(0),
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET,
      payload: {
        projectId,
        sceneId: sceneBId,
        storyRange: exactIsoRange('calendar-local', '2026-07-02'),
        narrativeRange: exactOrdinalRange(1),
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET,
      payload: {
        projectId,
        sceneId: sceneCId,
        storyRange: exactIsoRange('calendar-local', '2026-07-03'),
        narrativeRange: exactOrdinalRange(2),
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET,
      payload: {
        projectId,
        sceneId: sceneDId,
        storyRange: {
          rangeKind: 'unknown',
          precisionNote: 'The author has not placed the disappearance yet.',
        },
        narrativeRange: exactOrdinalRange(3),
      },
    },
  ]);
  assert.equal(anchored.ok, true);
  return { runtime, derived, projectId, state: anchored.state };
}

test('E06 C06: Atlas temporal layout derives explicit heavy timeline, slider, keyboard, and list parity', async () => {
  const { runtime, derived, projectId, state } = await buildTemporalLayoutFixture();
  const beforeHash = runtime.hashCoreState(state);

  const result = derived.deriveAtlasTemporalLayout({
    coreState: state,
    params: { projectId, sceneLimit: 3, segmentLimit: 2, sliderValue: 2026 * 372 + 7 * 31 + 2 },
    capabilitySnapshot: nodeCapabilitySnapshot(),
  });

  assert.equal(result.ok, true);
  assert.equal(runtime.hashCoreState(state), beforeHash);
  assert.equal(result.value.schemaVersion, derived.ATLAS_TEMPORAL_LAYOUT_SCHEMA_VERSION);
  assert.equal(result.value.surfaceManifest.schemaVersion, derived.ATLAS_TEMPORAL_LAYOUT_SURFACE_MANIFEST_VERSION);
  assert.equal(result.value.surfaceManifest.providerId, 'query.atlasTemporalLayout');
  assert.equal(result.value.surfaceManifest.slotId, 'rightRail.context.atlas.temporalLayout');
  assert.equal(result.value.surfaceManifest.heavySurface, true);
  assert.equal(result.value.surfaceManifest.explicitOpenRequired, true);
  assert.equal(result.value.authority.readModelOnly, true);
  assert.equal(result.value.authority.commandAuthority, 'none');
  assert.equal(result.value.authority.projectTruthMutation, false);
  assert.equal(result.value.authority.manuscriptMutation, false);
  assert.equal(result.value.authority.storageMutation, false);
  assert.equal(result.value.authority.networkMutation, false);
  assert.equal(result.value.authority.backgroundDaemon, false);
  assert.equal(result.value.authority.typingHotPath, false);

  assert.equal(result.value.layoutPacket.schemaVersion, derived.ATLAS_TEMPORAL_LAYOUT_PACKET_SCHEMA_VERSION);
  assert.equal(result.value.layoutPacket.events.length, 3);
  assert.equal(result.value.listParity.schemaVersion, derived.ATLAS_TEMPORAL_LAYOUT_LIST_PARITY_SCHEMA_VERSION);
  assert.equal(result.value.listParity.rows.length, result.value.layoutPacket.events.length);
  assert.equal(result.value.listParity.equivalentToTimeline, true);
  assert.equal(result.value.timeSliderState.schemaVersion, derived.ATLAS_TIME_SLIDER_STATE_SCHEMA_VERSION);
  assert.ok(result.value.timeSliderState.selectedSceneIds.includes('scene-b'));
  assert.equal(result.value.keyboardContract.schemaVersion, derived.ATLAS_TEMPORAL_LAYOUT_KEYBOARD_CONTRACT_SCHEMA_VERSION);
  assert.deepEqual(result.value.keyboardContract.supportedKeys, ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' ']);
  assert.equal(result.value.keyboardContract.noPointerOnlyState, true);
  assert.equal(result.value.largeProjectBudgetProof.schemaVersion, derived.ATLAS_TEMPORAL_LAYOUT_BUDGET_PROOF_SCHEMA_VERSION);
  assert.equal(result.value.largeProjectBudgetProof.queryOnlyOnExplicitOpen, true);
  assert.equal(result.value.largeProjectBudgetProof.typingHotPathNonblocking, true);
  assert.equal(result.value.largeProjectBudgetProof.renderAllScenes, false);
  assert.ok(result.value.largeProjectBudgetProof.omittedSceneCount > 0);
  assert.match(result.value.summary.layoutHash, /^[0-9a-f]{64}$/u);
  assert.equal(result.value.evidence.designAdvisory.applied, true);
  assert.equal(result.value.evidence.designAdvisory.runtimeMetadataIncluded, false);
  assert.equal(result.value.evidence.designAdvisory.readinessToken, false);
  assert.equal(result.value.evidence.designAdvisory.externalReportAvailable, false);
});

test('E06 C06: Atlas temporal layout returns unknown-time degraded state without inventing writes', async () => {
  const { derived, projectId, state } = await buildTemporalLayoutFixture();
  const result = derived.deriveAtlasTemporalLayout({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: nodeCapabilitySnapshot(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.state, 'degraded');
  assert.equal(result.value.summary.unknownTemporalSceneCount, 1);
  assert.ok(result.value.layoutPacket.events.some((event) => event.sceneId === 'scene-d' && event.temporalState === 'unknown'));
  assert.equal(result.value.evidence.guarantees.noManuscriptMutation, true);
  assert.equal(result.value.evidence.guarantees.noNewDependency, true);
});

test('E06 C06: Atlas temporal layout fails closed and exports through derived barrels', async () => {
  const { derived, projectId, state } = await buildTemporalLayoutFixture();
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));

  assert.equal(typeof derived.deriveAtlasTemporalLayout, 'function');
  assert.equal(typeof atlas.deriveAtlasTemporalLayout, 'function');
  assert.equal(derived.ATLAS_TEMPORAL_LAYOUT_VIEW_ID, 'derived.atlas.temporalLayout.v1');
  assert.equal(typeof derived.sortAtlasTemporalLayoutEvents, 'function');

  const missingProjectId = derived.deriveAtlasTemporalLayout({ coreState: state, params: {} });
  assert.equal(missingProjectId.ok, false);
  assert.equal(missingProjectId.error.code, 'E_ATLAS_PROJECT_ID_REQUIRED');

  const disabled = derived.deriveAtlasTemporalLayout({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { capabilities: { atlasTemporalLayout: false } },
  });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(disabled.error.details.capabilityId, 'atlas.temporalLayout');
});

test('E06 C06: renderer and main wire temporal layout as explicit heavy surface only', () => {
  const mainSource = fs.readFileSync(path.join(process.cwd(), 'src', 'main.js'), 'utf8');
  const editorSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'editor.js'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'index.html'), 'utf8');
  const cssSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'styles.css'), 'utf8');

  assert.match(mainSource, /const ATLAS_TEMPORAL_LAYOUT_QUERY_ID = WORKSPACE_QUERY_IDS\.ATLAS_TEMPORAL_LAYOUT/u);
  assert.match(mainSource, /loadAtlasTemporalLayoutModule/u);
  assert.match(mainSource, /handleWorkspaceAtlasTemporalLayoutQuery/u);
  assert.match(mainSource, /safePayload\.explicitOpen !== true[\s\S]{0,500}ATLAS_TEMPORAL_LAYOUT_EXPLICIT_OPEN_REQUIRED/u);
  assert.match(mainSource, /\[ATLAS_TEMPORAL_LAYOUT_QUERY_ID,\s*handleWorkspaceAtlasTemporalLayoutQuery\]/u);
  assert.doesNotMatch(mainSource, /handleWorkspaceAtlasTemporalLayoutQuery[\s\S]{0,3200}writeFileAtomic/u);

  assert.match(htmlSource, /data-atlas-temporal-layout-shell[\s\S]{0,80}hidden/u);
  assert.match(htmlSource, /data-atlas-temporal-layout-host/u);
  assert.match(htmlSource, /data-atlas-temporal-layout-provider="query\.atlasTemporalLayout"/u);

  assert.match(editorSource, /const ATLAS_TEMPORAL_LAYOUT_QUERY_ID = WORKSPACE_QUERY_IDS\.ATLAS_TEMPORAL_LAYOUT/u);
  assert.match(editorSource, /dataset\.atlasTemporalLayoutOpen = 'true'/u);
  assert.match(editorSource, /function openAtlasTemporalLayoutSurface/u);
  assert.match(editorSource, /async function refreshAtlasTemporalLayout/u);
  assert.match(editorSource, /if \(atlasTemporalLayoutExplicitOpen !== true\) return/u);
  assert.match(editorSource, /data-atlas-temporal-slider/u);
  assert.match(editorSource, /handleAtlasTemporalLayoutKeydown/u);
  assert.match(editorSource, /function refreshActiveAtlasSurface\(\) \{[\s\S]*surface === 'temporal'[\s\S]*renderAtlasTemporalLayoutState\(\);[\s\S]*refreshAtlasTemporalLayout\(\);/u);
  assert.match(editorSource, /function applyRightTab\(tab\) \{[\s\S]*if \(tab === 'atlas'\) \{[\s\S]*refreshActiveAtlasSurface\(\);[\s\S]*\}/u);
  assert.doesNotMatch(editorSource, /function applyRightTab\(tab\) \{[\s\S]{0,900}refreshAtlasTemporalLayout/u);
  assert.doesNotMatch(editorSource, /PROJECT_APPLY_TEXT_EDIT[\s\S]{0,1200}refreshAtlasTemporalLayout/u);
  assert.doesNotMatch(editorSource, /ATLAS_TEMPORAL_LAYOUT_QUERY_ID[\s\S]{0,1000}dispatchUiCommand/u);

  assert.match(cssSource, /\.right-rail-surface--atlas-temporal-layout/u);
  assert.match(cssSource, /\.right-rail-atlas-temporal-slider/u);
  assert.match(cssSource, /\.right-rail-atlas-temporal-list-row:focus-visible/u);
});

test('E06 C06: Atlas temporal layout derived sources keep side-effect boundaries closed', () => {
  const sources = [
    'src/derived/atlas/deriveAtlasTemporalLayout.mjs',
    'src/derived/atlas/atlasTemporalLayoutTypes.mjs',
  ].map((relativePath) => [path.basename(relativePath), fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')]);
  const forbiddenPatterns = [
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
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
    /\bquerySelector\b/u,
    /\bdispatchEvent\b/u,
    /\bdocument\./u,
  ];
  for (const [basename, source] of sources) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${basename} matched ${pattern.source}`);
    }
  }
});
