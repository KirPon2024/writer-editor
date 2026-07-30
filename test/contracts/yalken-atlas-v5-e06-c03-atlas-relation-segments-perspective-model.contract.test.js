const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildRelationSegmentFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'atlas-relation-segment-project';
  const sceneAId = 'scene-a';
  const sceneBId = 'scene-b';
  const sceneCId = 'scene-c';
  const sceneDId = 'scene-d';
  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas relation segments', sceneId: sceneAId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId: sceneAId, text: 'Anna met Mira at dawn.' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-anna', name: 'Anna', entityKind: 'character' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-mira', name: 'Mira', entityKind: 'character' },
    },
  ]);
  assert.equal(created.ok, true);
  const state = JSON.parse(JSON.stringify(created.state));
  state.data.projects[projectId].scenes[sceneBId] = { id: sceneBId, title: 'Bridge', text: 'Anna and Mira crossed the bridge.' };
  state.data.projects[projectId].scenes[sceneCId] = { id: sceneCId, title: 'Waiting', text: 'Anna waited alone.' };
  state.data.projects[projectId].scenes[sceneDId] = { id: sceneDId, title: 'Later', text: 'Mira found Anna later.' };

  const seeded = runtime.applyCoreSequence(state, [
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
      type: runtime.CORE_COMMAND_IDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET,
      payload: {
        projectId,
        sceneId: sceneAId,
        storyRange: exactIsoRange('calendar-gregorian-local', '2026-07-01'),
        narrativeRange: exactNarrativeOrdinal(0),
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET,
      payload: {
        projectId,
        sceneId: sceneBId,
        storyRange: exactIsoRange('calendar-gregorian-local', '2026-07-02'),
        narrativeRange: exactNarrativeOrdinal(1),
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET,
      payload: {
        projectId,
        sceneId: sceneCId,
        storyRange: {
          rangeKind: 'unknown',
          precisionNote: 'The author has not placed this waiting scene yet.',
        },
        narrativeRange: exactNarrativeOrdinal(2),
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET,
      payload: {
        projectId,
        sceneId: sceneDId,
        storyRange: {
          rangeKind: 'open',
          start: { pointKind: 'calendarDate', calendarId: 'calendar-gregorian-local', value: '2026-07-04' },
          precisionNote: 'The aftermath starts here and may continue beyond the shown scene.',
        },
        narrativeRange: exactNarrativeOrdinal(3),
      },
    },
  ]);
  assert.equal(seeded.ok, true);
  return { runtime, derived, projectId, sceneAId, sceneBId, sceneCId, sceneDId, state: seeded.state };
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

function nodeCapabilitySnapshot() {
  return {
    platformId: 'node',
    capabilities: {
      atlasRelationSegmentsPerspective: true,
      atlasObservationAggregate: true,
      atlasTemporalContinuity: true,
      atlasSceneTemporalAnchors: true,
    },
  };
}

test('E06 C03: relation segments split contiguous relation runs and carry perspective temporal context', async () => {
  const { derived, projectId, sceneAId, sceneBId, sceneCId, sceneDId, state } = await buildRelationSegmentFixture();
  const result = derived.deriveAtlasRelationSegmentsPerspective({
    coreState: state,
    params: { projectId, languageCode: 'en' },
    capabilitySnapshot: nodeCapabilitySnapshot(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.schemaVersion, derived.ATLAS_RELATION_SEGMENTS_PERSPECTIVE_SCHEMA_VERSION);
  assert.equal(result.value.authority.projectTruthMutation, false);
  assert.equal(result.value.authority.storageMutation, false);
  assert.equal(result.value.authority.networkMutation, false);
  assert.equal(result.value.authority.hiddenMutation, false);
  assert.equal(result.value.summary.relationCount, 1);
  assert.equal(result.value.summary.segmentCount, 2);
  assert.equal(result.value.summary.perspectiveSceneCount, 4);
  assert.equal(result.value.summary.unknownTemporalSceneCount, 1);
  assert.equal(result.value.state, 'degraded');
  assert.equal(result.value.parityProof.schemaVersion, derived.ATLAS_RELATION_SEGMENT_PARITY_PROOF_SCHEMA_VERSION);
  assert.equal(result.value.parityProof.matches, true);

  const first = result.value.relationSegments[0];
  const second = result.value.relationSegments[1];
  assert.equal(first.schemaVersion, derived.ATLAS_RELATION_SEGMENT_SCHEMA_VERSION);
  assert.deepEqual(first.sceneIds, [sceneAId, sceneBId]);
  assert.equal(first.temporalState, 'anchored');
  assert.equal(first.evidenceState, 'evidenceBacked');
  assert.deepEqual(second.sceneIds, [sceneDId]);
  assert.equal(second.perspectiveScenes[0].storyRange.rangeKind, 'open');
  assert.ok(result.value.perspectiveScenes.some((scene) => scene.schemaVersion === derived.ATLAS_RELATION_PERSPECTIVE_SCENE_SCHEMA_VERSION && scene.sceneId === sceneCId && scene.temporalState === 'unknown'));
  assert.ok(first.evidenceAnchorIds.length >= 2);
  assert.equal(result.value.evidence.guarantees.fullIncrementalParity, true);
  assert.equal(result.value.evidence.guarantees.noAutomaticRelationMutation, true);
});

test('E06 C03: relation segments are deterministic and fail closed on disabled capability', async () => {
  const { derived, projectId, state } = await buildRelationSegmentFixture();
  const first = derived.deriveAtlasRelationSegmentsPerspective({
    coreState: state,
    params: { projectId, languageCode: 'en' },
    capabilitySnapshot: nodeCapabilitySnapshot(),
  });
  const second = derived.deriveAtlasRelationSegmentsPerspective({
    coreState: JSON.parse(JSON.stringify(state)),
    params: { projectId, languageCode: 'en' },
    capabilitySnapshot: nodeCapabilitySnapshot(),
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.meta.outputHash, second.meta.outputHash);
  assert.equal(first.value.summary.segmentHash, second.value.summary.segmentHash);

  const disabled = derived.deriveAtlasRelationSegmentsPerspective({
    coreState: state,
    params: { projectId, languageCode: 'en' },
    capabilitySnapshot: { capabilities: { atlasRelationSegmentsPerspective: false } },
  });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
});

test('E06 C03: relation segments expose empty state without inventing relation truth', async () => {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'atlas-relation-empty-project';
  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Empty relation', sceneId: 'scene-a' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId: 'scene-a', text: 'Anna walks alone.' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-anna', name: 'Anna', entityKind: 'character' },
    },
  ]);
  assert.equal(created.ok, true);
  const result = derived.deriveAtlasRelationSegmentsPerspective({
    coreState: created.state,
    params: { projectId, languageCode: 'en' },
    capabilitySnapshot: nodeCapabilitySnapshot(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.state, 'empty');
  assert.equal(result.value.summary.relationCount, 0);
  assert.equal(result.value.relationSegments.length, 0);
  assert.equal(result.value.authority.automaticRelationMutation, false);
});

test('E06 C03: relation segment derived sources keep side effects closed', () => {
  const sources = [
    'src/derived/atlas/deriveAtlasRelationSegmentsPerspective.mjs',
    'src/derived/atlas/atlasRelationSegmentTypes.mjs',
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
