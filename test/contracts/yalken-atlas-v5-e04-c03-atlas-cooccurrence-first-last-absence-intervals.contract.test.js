const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildTemporalFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const projectId = 'atlas-temporal-project';
  const sceneAId = 'scene-a';
  const sceneBId = 'scene-b';
  const sceneCId = 'scene-c';
  const sceneDId = 'scene-d';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas temporal', sceneId: sceneAId },
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
  assert.equal(built.ok, true);

  const state = JSON.parse(JSON.stringify(built.state));
  state.data.projects[projectId].scenes[sceneBId] = {
    id: sceneBId,
    title: 'Second',
    text: 'Mira crossed alone.',
  };
  state.data.projects[projectId].scenes[sceneCId] = {
    id: sceneCId,
    title: 'Third',
    text: 'Anna waited alone.',
  };
  state.data.projects[projectId].scenes[sceneDId] = {
    id: sceneDId,
    title: 'Fourth',
    text: 'Anna met Mira again.',
  };
  return { runtime, projectId, sceneAId, sceneBId, sceneCId, sceneDId, state };
}

function sceneOrderFromState(state, projectId) {
  const scenes = state.data.projects[projectId].scenes;
  return Object.keys(scenes).sort().map((sceneId, sceneOrdinal) => ({
    sceneId,
    sceneOrdinal,
    sceneTitle: scenes[sceneId].title || sceneId,
  }));
}

test('E04 C03: temporal continuity derives cooccurrence, first, last, and absence intervals deterministically', async () => {
  const { projectId, sceneAId, sceneBId, sceneCId, sceneDId, state } = await buildTemporalFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));

  const first = derived.deriveAtlasTemporalContinuity({ coreState: state, params: { projectId, languageCode: 'en' } });
  const second = derived.deriveAtlasTemporalContinuity({ coreState: JSON.parse(JSON.stringify(state)), params: { projectId, languageCode: 'en' } });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.value.schemaVersion, derived.ATLAS_TEMPORAL_CONTINUITY_SCHEMA_VERSION);
  assert.equal(first.value.summary.temporalHash, second.value.summary.temporalHash);
  assert.equal(first.meta.outputHash, second.meta.outputHash);
  assert.equal(first.value.summary.sceneCount, 4);
  assert.equal(first.value.summary.activeObservationCount, 6);
  assert.equal(first.value.summary.entityCount, 2);
  assert.equal(first.value.summary.cooccurrencePairCount, 1);
  assert.equal(first.value.summary.absenceIntervalCount, 2);

  assert.deepEqual(
    first.value.sceneOrder.map((scene) => [scene.sceneId, scene.sceneOrdinal]),
    [[sceneAId, 0], [sceneBId, 1], [sceneCId, 2], [sceneDId, 3]],
  );

  const anna = first.value.entityAppearances.find((entity) => entity.entityId === 'entity-anna');
  const mira = first.value.entityAppearances.find((entity) => entity.entityId === 'entity-mira');
  assert.equal(anna.schemaVersion, derived.ATLAS_TEMPORAL_ENTITY_APPEARANCE_SCHEMA_VERSION);
  assert.equal(anna.firstAppearance.sceneId, sceneAId);
  assert.equal(anna.lastAppearance.sceneId, sceneDId);
  assert.deepEqual(anna.appearances.map((ref) => ref.sceneId), [sceneAId, sceneCId, sceneDId]);
  assert.equal(mira.firstAppearance.sceneId, sceneAId);
  assert.equal(mira.lastAppearance.sceneId, sceneDId);
  assert.deepEqual(mira.appearances.map((ref) => ref.sceneId), [sceneAId, sceneBId, sceneDId]);

  assert.deepEqual(
    first.value.absenceIntervals.map((interval) => [interval.entityId, interval.sceneRefs.map((scene) => scene.sceneId)]),
    [
      ['entity-anna', [sceneBId]],
      ['entity-mira', [sceneCId]],
    ],
  );
  assert.equal(first.value.absenceIntervals.every((interval) => interval.schemaVersion === derived.ATLAS_ABSENCE_INTERVAL_SCHEMA_VERSION), true);

  assert.deepEqual(first.value.cooccurrences, [
    {
      schemaVersion: derived.ATLAS_COOCCURRENCE_SCHEMA_VERSION,
      pairId: first.value.cooccurrences[0].pairId,
      leftEntityId: 'entity-anna',
      rightEntityId: 'entity-mira',
      sceneRefs: [
        {
          sceneId: sceneAId,
          sceneOrdinal: 0,
          evidenceAnchorIds: first.value.cooccurrences[0].sceneRefs[0].evidenceAnchorIds,
        },
        {
          sceneId: sceneDId,
          sceneOrdinal: 3,
          evidenceAnchorIds: first.value.cooccurrences[0].sceneRefs[1].evidenceAnchorIds,
        },
      ],
      evidenceAnchorIds: first.value.cooccurrences[0].evidenceAnchorIds,
      sceneIds: [sceneAId, sceneDId],
      sceneCount: 2,
      occurrenceCount: 2,
    },
  ]);
  assert.match(first.value.cooccurrences[0].pairId, /^atlas-cooccurrence:/u);
  assert.equal(first.value.cooccurrences[0].evidenceAnchorIds.length, 4);
});

test('E04 C03: suppressed observations are preserved upstream but excluded from active temporal relations', async () => {
  const { runtime, projectId, sceneDId, state } = await buildTemporalFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const aggregate = derived.deriveAtlasObservationAggregate({ coreState: state, params: { projectId, languageCode: 'en' } });
  assert.equal(aggregate.ok, true);
  const miraD = aggregate.value.observations.find((observation) => observation.entityId === 'entity-mira' && observation.sceneId === sceneDId);
  assert.ok(miraD);

  const suppressed = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_OBSERVATION_SUPPRESS,
    payload: {
      projectId,
      sceneId: miraD.sceneId,
      entityId: miraD.entityId,
      observationId: miraD.observationId,
      mentionId: miraD.mentionId,
      evidenceAnchor: miraD.evidenceAnchor,
      reason: 'Do not use for active temporal relations',
    },
  });
  assert.equal(suppressed.ok, true);

  const aggregateAfter = derived.deriveAtlasObservationAggregate({ coreState: suppressed.state, params: { projectId, languageCode: 'en' } });
  const temporal = derived.deriveAtlasTemporalContinuity({ coreState: suppressed.state, params: { projectId, languageCode: 'en' } });
  assert.equal(aggregateAfter.ok, true);
  assert.equal(aggregateAfter.value.summary.observationCount, 6);
  assert.equal(aggregateAfter.value.summary.suppressedObservationCount, 1);
  assert.equal(temporal.ok, true);
  assert.equal(temporal.value.summary.activeObservationCount, 5);
  assert.deepEqual(temporal.value.cooccurrences[0].sceneIds, ['scene-a']);
  const mira = temporal.value.entityAppearances.find((entity) => entity.entityId === 'entity-mira');
  assert.equal(mira.lastAppearance.sceneId, 'scene-b');
});

test('E04 C03: full rebuild and incremental temporal assembly produce the same canonical hash', async () => {
  const { projectId, state } = await buildTemporalFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const aggregate = derived.deriveAtlasObservationAggregate({ coreState: state, params: { projectId, languageCode: 'en' } });
  assert.equal(aggregate.ok, true);
  const sceneOrder = sceneOrderFromState(state, projectId);

  const full = derived.buildAtlasTemporalContinuityFromObservationAggregate({
    aggregate: aggregate.value,
    sceneOrder,
    invalidationKey: 'parity-key',
  });
  const incremental = derived.buildAtlasTemporalContinuityIncrementally({
    aggregate: aggregate.value,
    sceneOrder,
    invalidationKey: 'parity-key',
  });
  const proof = derived.buildAtlasTemporalContinuityParityProof({
    aggregate: aggregate.value,
    sceneOrder,
    invalidationKey: 'parity-key',
  });

  assert.equal(full.summary.temporalHash, incremental.summary.temporalHash);
  assert.equal(proof.schemaVersion, derived.ATLAS_TEMPORAL_PARITY_PROOF_SCHEMA_VERSION);
  assert.equal(proof.matches, true);
  assert.equal(proof.fullHash, full.summary.temporalHash);
  assert.equal(proof.incrementalHash, incremental.summary.temporalHash);

  const derivedView = derived.deriveAtlasTemporalContinuity({ coreState: state, params: { projectId, languageCode: 'en' } });
  assert.equal(derivedView.ok, true);
  assert.equal(derivedView.value.parityProof.matches, true);
  assert.equal(derivedView.value.parityProof.fullHash, derivedView.value.parityProof.incrementalHash);
});

test('E04 C03: temporal continuity fails closed for missing input and disabled capability', async () => {
  const { projectId, state } = await buildTemporalFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));

  const missingProjectId = derived.deriveAtlasTemporalContinuity({ coreState: state, params: {} });
  assert.equal(missingProjectId.ok, false);
  assert.equal(missingProjectId.error.code, 'E_ATLAS_PROJECT_ID_REQUIRED');

  const missingProject = derived.deriveAtlasTemporalContinuity({ coreState: state, params: { projectId: 'missing-project' } });
  assert.equal(missingProject.ok, false);
  assert.equal(missingProject.error.code, 'E_ATLAS_PROJECT_NOT_FOUND');

  const disabledTemporal = derived.deriveAtlasTemporalContinuity({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { capabilities: { atlasTemporalContinuity: false } },
  });
  assert.equal(disabledTemporal.ok, false);
  assert.equal(disabledTemporal.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(disabledTemporal.error.details.capabilityId, 'atlas.temporalContinuity');

  const disabledAggregate = derived.deriveAtlasTemporalContinuity({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { capabilities: { atlasObservationAggregate: false, atlasTemporalContinuity: true } },
  });
  assert.equal(disabledAggregate.ok, false);
  assert.equal(disabledAggregate.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(disabledAggregate.error.reason, 'ATLAS_OBSERVATION_AGGREGATE_DISABLED');
});

test('E04 C03: temporal continuity model adds no storage, network, UI, or platform bypass', () => {
  const derivedRoot = path.join(process.cwd(), 'src', 'derived', 'atlas');
  const derivedSources = fs.readdirSync(derivedRoot)
    .filter((basename) => basename.endsWith('.mjs'))
    .map((basename) => [basename, fs.readFileSync(path.join(derivedRoot, basename), 'utf8')]);
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
  ];

  for (const [basename, source] of derivedSources) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${basename} matched ${pattern.source}`);
    }
  }
});
