const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildSceneAnchorFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'atlas-temporal-anchor-project';
  const sceneAId = 'scene-a';
  const sceneBId = 'scene-b';
  const sceneCId = 'scene-c';
  const sceneDId = 'scene-d';
  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas temporal anchors', sceneId: sceneAId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId: sceneAId, text: 'Anna arrives before the bells.' },
    },
  ]);
  assert.equal(created.ok, true);
  const state = JSON.parse(JSON.stringify(created.state));
  state.data.projects[projectId].scenes[sceneBId] = { id: sceneBId, title: 'Second', text: 'The bells begin.' };
  state.data.projects[projectId].scenes[sceneCId] = { id: sceneCId, title: 'Third', text: 'Nobody knows the date.' };
  state.data.projects[projectId].scenes[sceneDId] = { id: sceneDId, title: 'Fourth', text: 'The aftermath is shown later.' };

  const withCalendars = runtime.applyCoreSequence(state, [
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_CALENDAR_DEFINE,
      payload: {
        projectId,
        calendarId: 'calendar-gregorian-local',
        name: 'Local Gregorian',
        calendarKind: 'real',
        calendarSystem: 'gregorian-proleptic-local',
        conversionRules: [
          {
            ruleId: 'rule-gregorian-identity',
            ruleKind: 'identity',
            sourceScale: 'iso-date',
            targetScale: 'iso-date',
            precision: 'exact',
          },
        ],
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_CALENDAR_DEFINE,
      payload: {
        projectId,
        calendarId: 'calendar-bells',
        name: 'Bells of Yalken',
        calendarKind: 'fictional',
        calendarSystem: 'bells-cycle-local',
        dayZeroLabel: 'First Bell',
        conversionRules: [
          {
            ruleId: 'rule-bell-to-story-day',
            ruleKind: 'dayOffset',
            sourceScale: 'bell-day',
            targetScale: 'story-day',
            offsetDays: 10,
            precision: 'approximate',
          },
        ],
      },
    },
  ]);
  assert.equal(withCalendars.ok, true);
  return { runtime, derived, projectId, sceneAId, sceneBId, sceneCId, sceneDId, state: withCalendars.state };
}

function nodeCapabilitySnapshot() {
  return {
    platformId: 'node',
    capabilities: {
      atlasSceneTemporalAnchors: true,
      atlasCalendarDefinitions: true,
    },
  };
}

function exactIsoRange(calendarId, start, end = start) {
  return {
    rangeKind: 'exact',
    start: { pointKind: 'calendarDate', calendarId, value: start },
    end: { pointKind: 'calendarDate', calendarId, value: end },
  };
}

function exactNarrativeOrdinal(dayIndex) {
  return {
    rangeKind: 'exact',
    start: { pointKind: 'ordinalDay', dayIndex },
    end: { pointKind: 'ordinalDay', dayIndex },
  };
}

test('E06 C02: Atlas scene temporal anchors persist exact approximate open and unknown ranges separately for story and narrative time', async () => {
  const { runtime, derived, projectId, sceneAId, sceneBId, sceneCId, sceneDId, state } = await buildSceneAnchorFixture();
  const sceneTextBefore = state.data.projects[projectId].scenes[sceneAId].text;

  const anchored = runtime.applyCoreSequence(state, [
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET,
      payload: {
        projectId,
        sceneId: sceneAId,
        storyRange: exactIsoRange('calendar-gregorian-local', '2026-07-01'),
        narrativeRange: exactNarrativeOrdinal(0),
        note: 'Opening scene has exact story date and first narrative position.',
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET,
      payload: {
        projectId,
        sceneId: sceneBId,
        storyRange: {
          rangeKind: 'approximate',
          start: { pointKind: 'label', calendarId: 'calendar-bells', label: 'Second Bell' },
          end: { pointKind: 'label', calendarId: 'calendar-bells', label: 'Third Bell' },
          precisionNote: 'The manuscript says around the second bell, not an exact day.',
        },
        narrativeRange: {
          rangeKind: 'open',
          start: { pointKind: 'ordinalDay', dayIndex: 1 },
          precisionNote: 'The scene begins at narrative position 1 and continues into an unstated interval.',
        },
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET,
      payload: {
        projectId,
        sceneId: sceneCId,
        storyRange: {
          rangeKind: 'unknown',
          precisionNote: 'The author has not decided the story date.',
        },
        narrativeRange: exactNarrativeOrdinal(2),
      },
    },
  ]);
  assert.equal(anchored.ok, true);
  const reopened = JSON.parse(JSON.stringify(anchored.state));
  const project = reopened.data.projects[projectId];
  assert.equal(project.scenes[sceneAId].text, sceneTextBefore);
  assert.equal(project.atlas.sceneTemporalAnchors[sceneAId].schemaVersion, 'atlas.sceneTemporalAnchor.v1');
  assert.equal(project.atlas.sceneTemporalAnchors[sceneBId].storyRange.rangeKind, 'approximate');
  assert.equal(project.atlas.sceneTemporalAnchors[sceneBId].narrativeRange.rangeKind, 'open');
  assert.equal(project.atlas.sceneTemporalAnchors[sceneCId].storyRange.explicitUnknown, true);
  assert.match(project.atlas.sceneTemporalAnchors[sceneAId].sourceHash, /^[0-9a-f]{64}$/u);

  const readback = derived.deriveAtlasSceneTemporalAnchors({
    coreState: reopened,
    params: { projectId },
    capabilitySnapshot: nodeCapabilitySnapshot(),
  });
  assert.equal(readback.ok, true);
  assert.equal(readback.value.schemaVersion, derived.ATLAS_SCENE_TEMPORAL_ANCHORS_SCHEMA_VERSION);
  assert.equal(readback.value.surfaceManifest.schemaVersion, derived.ATLAS_SCENE_TEMPORAL_ANCHORS_SURFACE_MANIFEST_VERSION);
  assert.deepEqual(readback.value.surfaceManifest.commandIds, ['atlas.sceneTemporalAnchor.set']);
  assert.equal(readback.value.authority.projectTruthMutation, false);
  assert.equal(readback.value.authority.storageMutation, false);
  assert.equal(readback.value.authority.networkMutation, false);
  assert.equal(readback.value.authority.hiddenMutation, false);
  assert.equal(readback.value.state, 'degraded');
  assert.equal(readback.value.summary.sceneCount, 4);
  assert.equal(readback.value.summary.anchoredSceneCount, 3);
  assert.equal(readback.value.summary.missingAnchorSceneCount, 1);
  assert.equal(readback.value.summary.storyExactCount, 1);
  assert.equal(readback.value.summary.storyApproximateCount, 1);
  assert.equal(readback.value.summary.storyUnknownCount, 2);
  assert.equal(readback.value.summary.narrativeExactCount, 2);
  assert.equal(readback.value.summary.narrativeOpenCount, 1);
  assert.equal(readback.value.summary.narrativeUnknownCount, 1);
  assert.ok(readback.value.degradedStates.some((row) => row.sceneId === sceneDId && row.code === 'SCENE_TEMPORAL_ANCHOR_MISSING'));
  assert.ok(readback.value.degradedStates.some((row) => row.sceneId === sceneCId && row.code === 'SCENE_TEMPORAL_RANGE_UNKNOWN'));
  assert.equal(readback.value.evidence.guarantees.storyNarrativeSeparated, true);
  assert.equal(readback.value.evidence.guarantees.unknownTimeExplicit, true);
  assert.equal(readback.value.evidence.guarantees.externalCalendarService, false);
});

test('E06 C02: Atlas scene temporal anchor command fails closed for implicit ranges and stale anchors', async () => {
  const { runtime, projectId, sceneAId, state } = await buildSceneAnchorFixture();
  const beforeHash = runtime.hashCoreState(state);

  const missingStoryRange = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET,
    payload: {
      projectId,
      sceneId: sceneAId,
      narrativeRange: exactNarrativeOrdinal(0),
    },
  });
  assert.equal(missingStoryRange.ok, false);
  assert.equal(missingStoryRange.error.code, 'E_ATLAS_SCENE_TEMPORAL_RANGE_OBJECT_REQUIRED');
  assert.equal(missingStoryRange.stateHash, beforeHash);

  const exactMissingEnd = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET,
    payload: {
      projectId,
      sceneId: sceneAId,
      storyRange: {
        rangeKind: 'exact',
        start: { pointKind: 'calendarDate', calendarId: 'calendar-gregorian-local', value: '2026-07-01' },
      },
      narrativeRange: exactNarrativeOrdinal(0),
    },
  });
  assert.equal(exactMissingEnd.ok, false);
  assert.equal(exactMissingEnd.error.code, 'E_ATLAS_SCENE_TEMPORAL_RANGE_EXACT_BOUNDS_REQUIRED');
  assert.equal(exactMissingEnd.stateHash, beforeHash);

  const missingCalendar = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET,
    payload: {
      projectId,
      sceneId: sceneAId,
      storyRange: exactIsoRange('calendar-missing', '2026-07-01'),
      narrativeRange: exactNarrativeOrdinal(0),
    },
  });
  assert.equal(missingCalendar.ok, false);
  assert.equal(missingCalendar.error.code, 'E_ATLAS_SCENE_TEMPORAL_POINT_CALENDAR_NOT_FOUND');
  assert.equal(missingCalendar.stateHash, beforeHash);

  const saved = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET,
    payload: {
      projectId,
      sceneId: sceneAId,
      storyRange: exactIsoRange('calendar-gregorian-local', '2026-07-01'),
      narrativeRange: exactNarrativeOrdinal(0),
    },
  });
  assert.equal(saved.ok, true);
  const stale = runtime.reduceCoreState(saved.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET,
    payload: {
      projectId,
      sceneId: sceneAId,
      expectedAnchorHash: 'deadbeef',
      storyRange: exactIsoRange('calendar-gregorian-local', '2026-07-02'),
      narrativeRange: exactNarrativeOrdinal(0),
    },
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, 'E_ATLAS_SCENE_TEMPORAL_ANCHOR_STALE');
  assert.equal(stale.stateHash, runtime.hashCoreState(saved.state));
});

test('E06 C02: Atlas scene temporal anchor command is admitted only through node capability revalidation', async () => {
  const { runtime, projectId, sceneAId, state } = await buildSceneAnchorFixture();
  const registryModule = await loadModule(path.join('src', 'renderer', 'commands', 'registry.mjs'));
  const runnerModule = await loadModule(path.join('src', 'renderer', 'commands', 'runCommand.mjs'));
  const registry = registryModule.createCommandRegistry();
  registry.registerCommand(runtime.CORE_COMMAND_IDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET, (input) => {
    return runtime.reduceCoreState(input.state, {
      type: runtime.CORE_COMMAND_IDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET,
      payload: input.payload,
    });
  });
  const payload = {
    projectId,
    sceneId: sceneAId,
    storyRange: exactIsoRange('calendar-gregorian-local', '2026-07-01'),
    narrativeRange: exactNarrativeOrdinal(0),
  };
  const webRunner = runnerModule.createCommandRunner(registry, {
    capability: { defaultPlatformId: 'web' },
  });
  const denied = await webRunner(runtime.CORE_COMMAND_IDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET, { state, payload });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');

  const nodeRunner = runnerModule.createCommandRunner(registry, {
    capability: { defaultPlatformId: 'node', entitlementTier: 'free' },
  });
  const admitted = await nodeRunner(runtime.CORE_COMMAND_IDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET, { state, payload });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.state.data.projects[projectId].atlas.sceneTemporalAnchors[sceneAId].storyRange.rangeKind, 'exact');
});

test('E06 C02: Atlas scene temporal anchor derived and core sources keep side effects closed', () => {
  const sources = [
    'src/core/runtime.mjs',
    'src/derived/atlas/deriveAtlasSceneTemporalAnchors.mjs',
    'src/derived/atlas/atlasTemporalRangeTypes.mjs',
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
