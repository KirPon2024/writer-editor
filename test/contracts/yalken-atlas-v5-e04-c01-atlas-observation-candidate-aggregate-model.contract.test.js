const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildObservationFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const projectId = 'atlas-observation-project';
  const sceneAId = 'scene-a';
  const sceneBId = 'scene-b';
  const sceneAText = 'Anna met the Atlas keeper. Annabel ignored Anna.';
  const sceneBText = 'Mira met Anna at the bridge.';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas observations', sceneId: sceneAId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId: sceneAId, text: sceneAText },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: {
        projectId,
        entityId: 'entity-anna',
        name: 'Anna',
        entityKind: 'character',
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ALIAS_ADD,
      payload: {
        projectId,
        entityId: 'entity-anna',
        aliasId: 'alias-keeper',
        value: 'Atlas keeper',
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: {
        projectId,
        entityId: 'entity-mira',
        name: 'Mira',
        entityKind: 'character',
      },
    },
  ]);
  assert.equal(built.ok, true);

  const state = JSON.parse(JSON.stringify(built.state));
  state.data.projects[projectId].scenes[sceneBId] = {
    id: sceneBId,
    title: 'Second scene',
    text: sceneBText,
  };
  state.data.projects[projectId].languageCode = 'en';
  return { runtime, projectId, sceneAId, sceneBId, sceneAText, sceneBText, state };
}

test('E04 C01: BASIC Atlas observation aggregate emits candidates and observations with evidence for every hit', async () => {
  const { projectId, sceneAId, sceneBId, state } = await buildObservationFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));

  const result = derived.deriveAtlasObservationAggregate({
    coreState: state,
    params: { projectId, languageCode: 'en' },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasMentionIndex: true, atlasObservationAggregate: true } },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.schemaVersion, derived.ATLAS_OBSERVATION_AGGREGATE_SCHEMA_VERSION);
  assert.equal(result.value.analyzer.analyzerId, derived.ATLAS_OBSERVATION_ANALYZER_ID);
  assert.equal(result.value.analyzer.analyzerKind, 'BASIC');
  assert.equal(result.value.analyzer.fuzzyMatching, false);
  assert.equal(result.value.analyzer.automaticEntityCreation, false);
  assert.equal(result.value.analyzer.languagePolicy.policy, derived.ATLAS_OBSERVATION_LANGUAGE_POLICY.BASIC_SUPPORTED);
  assert.equal(result.value.summary.candidateCount, 5);
  assert.equal(result.value.summary.observationCount, 5);
  assert.equal(result.value.summary.entityCount, 2);
  assert.equal(result.value.summary.sceneCount, 2);
  assert.equal(result.value.summary.evidenceAnchorCount, 5);
  assert.equal(result.value.summary.everyObservationHasEvidence, true);
  assert.match(result.value.summary.aggregateHash, /^[0-9a-f]{64}$/u);
  assert.equal(result.value.summary.invalidationKey, result.meta.invalidationKey);

  assert.deepEqual(
    result.value.candidates.map((candidate) => [candidate.sceneId, candidate.matchedText]),
    [
      [sceneAId, 'Anna'],
      [sceneAId, 'Atlas keeper'],
      [sceneAId, 'Anna'],
      [sceneBId, 'Mira'],
      [sceneBId, 'Anna'],
    ],
  );
  assert.equal(result.value.candidates.some((candidate) => candidate.matchedText === 'Annabel'), false);
  assert.equal(result.value.candidates.every((candidate) => candidate.schemaVersion === derived.ATLAS_OBSERVATION_CANDIDATE_SCHEMA_VERSION), true);
  assert.equal(result.value.candidates.every((candidate) => candidate.evidenceRequired === true), true);
  assert.equal(result.value.candidates.every((candidate) => candidate.evidenceAnchor && candidate.evidenceAnchor.anchorId === candidate.evidenceAnchorId), true);
  assert.equal(result.value.observations.every((observation) => observation.schemaVersion === derived.ATLAS_OBSERVATION_SCHEMA_VERSION), true);
  assert.equal(result.value.observations.every((observation) => observation.evidenceAnchor && observation.evidenceAnchorId), true);

  assert.deepEqual(
    result.value.entities.map((entity) => [entity.entityId, entity.observationCount, entity.sceneIds]),
    [
      ['entity-anna', 4, [sceneAId, sceneBId]],
      ['entity-mira', 1, [sceneBId]],
    ],
  );
  assert.deepEqual(result.value.authority, {
    sourceOfTruth: 'project.core.atlas.entities + project.core.scenes',
    readModelOnly: true,
    commandAuthority: 'none',
    projectTruthMutation: false,
    storageMutation: false,
    networkMutation: false,
    authorApprovalRequiredForTruthMutation: true,
  });
});

test('E04 C01: unsupported languages remain exact-only and never widen into fuzzy candidates', async () => {
  const { projectId, state } = await buildObservationFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));

  const unsupported = derived.deriveAtlasObservationAggregate({
    coreState: state,
    params: { projectId, languageCode: 'zz' },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasMentionIndex: true, atlasObservationAggregate: true } },
  });
  const supported = derived.deriveAtlasObservationAggregate({
    coreState: state,
    params: { projectId, languageCode: 'en' },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasMentionIndex: true, atlasObservationAggregate: true } },
  });

  assert.equal(unsupported.ok, true);
  assert.equal(supported.ok, true);
  assert.equal(unsupported.value.analyzer.languagePolicy.policy, derived.ATLAS_OBSERVATION_LANGUAGE_POLICY.UNSUPPORTED_EXACT_ONLY);
  assert.equal(unsupported.value.analyzer.languagePolicy.supported, false);
  assert.equal(unsupported.value.analyzer.languagePolicy.exactOnly, true);
  assert.equal(unsupported.value.analyzer.languagePolicy.fuzzyMatching, false);
  assert.equal(unsupported.value.analyzer.languagePolicy.unsupportedLanguageExactOnly, true);
  assert.deepEqual(
    unsupported.value.candidates.map((candidate) => [candidate.sceneId, candidate.startOffset, candidate.endOffset, candidate.matchedText]),
    supported.value.candidates.map((candidate) => [candidate.sceneId, candidate.startOffset, candidate.endOffset, candidate.matchedText]),
  );
});

test('E04 C01: observation aggregate is deterministic and invalidates after scene text changes', async () => {
  const { runtime, projectId, sceneBId, state } = await buildObservationFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));

  const first = derived.deriveAtlasObservationAggregate({ coreState: state, params: { projectId, languageCode: 'en' } });
  const second = derived.deriveAtlasObservationAggregate({ coreState: JSON.parse(JSON.stringify(state)), params: { projectId, languageCode: 'en' } });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.value.summary.aggregateHash, second.value.summary.aggregateHash);
  assert.equal(first.meta.outputHash, second.meta.outputHash);

  const edited = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payload: { projectId, sceneId: sceneBId, text: 'Mira watched the bridge.' },
  });
  assert.equal(edited.ok, true);
  const changed = derived.deriveAtlasObservationAggregate({ coreState: edited.state, params: { projectId, languageCode: 'en' } });
  assert.equal(changed.ok, true);
  assert.notEqual(first.meta.invalidationKey, changed.meta.invalidationKey);
  assert.notEqual(first.value.summary.aggregateHash, changed.value.summary.aggregateHash);
  assert.equal(changed.value.summary.observationCount, 4);
});

test('E04 C01: observation aggregate fails closed for missing inputs and disabled capabilities', async () => {
  const { projectId, state } = await buildObservationFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));

  const missingProjectId = derived.deriveAtlasObservationAggregate({ coreState: state, params: {} });
  assert.equal(missingProjectId.ok, false);
  assert.equal(missingProjectId.error.code, 'E_ATLAS_PROJECT_ID_REQUIRED');

  const missingProject = derived.deriveAtlasObservationAggregate({ coreState: state, params: { projectId: 'missing-project' } });
  assert.equal(missingProject.ok, false);
  assert.equal(missingProject.error.code, 'E_ATLAS_PROJECT_NOT_FOUND');

  const disabledAggregate = derived.deriveAtlasObservationAggregate({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { capabilities: { atlasObservationAggregate: false } },
  });
  assert.equal(disabledAggregate.ok, false);
  assert.equal(disabledAggregate.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(disabledAggregate.error.details.capabilityId, 'atlas.observationAggregate');

  const disabledIndex = derived.deriveAtlasObservationAggregate({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { capabilities: { atlasMentionIndex: false, atlasObservationAggregate: true } },
  });
  assert.equal(disabledIndex.ok, false);
  assert.equal(disabledIndex.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(disabledIndex.error.reason, 'ATLAS_MENTION_INDEX_DISABLED');
});

test('E04 C01: observation aggregate introduces no storage, network, UI, or platform bypass', () => {
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
