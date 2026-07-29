const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildScopedAliasFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const projectId = 'atlas-scope-project';
  const sceneAId = 'scene-a';
  const sceneBId = 'scene-b';
  const sceneAText = 'The Shadow met Scene-only at the gate.';
  const sceneBText = 'The Shadow ignored Scene-only in the market.';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas scope', sceneId: sceneAId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId: sceneAId, text: sceneAText },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-shadow', name: 'Nobody says this name', entityKind: 'character' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ALIAS_ADD,
      payload: { projectId, entityId: 'entity-shadow', aliasId: 'alias-shadow', value: 'The Shadow', scope: 'project' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-scoped', name: 'Hidden scoped name', entityKind: 'place' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ALIAS_ADD,
      payload: { projectId, entityId: 'entity-scoped', aliasId: 'alias-scene-only', value: 'Scene-only', scope: 'scene', sceneId: sceneAId },
    },
  ]);
  assert.equal(built.ok, true);

  const state = JSON.parse(JSON.stringify(built.state));
  state.data.projects[projectId].scenes[sceneBId] = {
    id: sceneBId,
    title: 'Second scene',
    text: sceneBText,
  };
  return { runtime, projectId, sceneAId, sceneBId, sceneAText, sceneBText, state };
}

test('E04 C02: scene-scoped aliases match only their declared scene while project aliases remain global', async () => {
  const { projectId, sceneAId, sceneBId, state } = await buildScopedAliasFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));

  const index = derived.deriveAtlasMentionIndex({ coreState: state, params: { projectId } });
  assert.equal(index.ok, true);
  assert.deepEqual(
    index.value.mentions.map((mention) => [mention.sceneId, mention.entityId, mention.matchedText]),
    [
      [sceneAId, 'entity-shadow', 'The Shadow'],
      [sceneAId, 'entity-scoped', 'Scene-only'],
      [sceneBId, 'entity-shadow', 'The Shadow'],
    ],
  );
  assert.equal(index.value.mentions.some((mention) => mention.sceneId === sceneBId && mention.entityId === 'entity-scoped'), false);

  const aggregate = derived.deriveAtlasObservationAggregate({ coreState: state, params: { projectId, languageCode: 'en' } });
  assert.equal(aggregate.ok, true);
  assert.equal(aggregate.value.summary.observationCount, 3);
  assert.equal(aggregate.value.summary.activeObservationCount, 3);
  assert.equal(aggregate.value.summary.suppressedObservationCount, 0);
  assert.equal(aggregate.value.summary.hiddenFilterApplied, false);
});

test('E04 C02: explicit suppression is author truth and projection readback never hides evidence', async () => {
  const { runtime, projectId, sceneAId, sceneAText, state } = await buildScopedAliasFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const beforeText = state.data.projects[projectId].scenes[sceneAId].text;
  const beforeAggregate = derived.deriveAtlasObservationAggregate({ coreState: state, params: { projectId, languageCode: 'en' } });
  assert.equal(beforeAggregate.ok, true);
  const target = beforeAggregate.value.observations.find((observation) => observation.entityId === 'entity-scoped');
  assert.ok(target);

  const suppressed = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_OBSERVATION_SUPPRESS,
    payload: {
      projectId,
      sceneId: target.sceneId,
      entityId: target.entityId,
      observationId: target.observationId,
      mentionId: target.mentionId,
      evidenceAnchor: target.evidenceAnchor,
      reason: 'Not a real place in this scene',
    },
  });
  assert.equal(suppressed.ok, true);
  assert.equal(suppressed.state.data.projects[projectId].scenes[sceneAId].text, beforeText);

  const reopened = JSON.parse(JSON.stringify(suppressed.state));
  const suppressions = reopened.data.projects[projectId].atlas.suppressions;
  const suppressionId = Object.keys(suppressions)[0];
  assert.match(suppressionId, /^atlas-suppression:/u);
  assert.deepEqual(suppressions[suppressionId], {
    id: suppressionId,
    suppressionKind: 'observation.suppress',
    projectId,
    sceneId: target.sceneId,
    entityId: target.entityId,
    observationId: target.observationId,
    mentionId: target.mentionId,
    reason: 'Not a real place in this scene',
    evidenceAnchor: target.evidenceAnchor,
    createdByCommandSeq: 7,
  });

  const afterAggregate = derived.deriveAtlasObservationAggregate({ coreState: reopened, params: { projectId, languageCode: 'en' } });
  assert.equal(afterAggregate.ok, true);
  assert.equal(afterAggregate.value.summary.observationCount, beforeAggregate.value.summary.observationCount);
  assert.equal(afterAggregate.value.summary.activeObservationCount, 2);
  assert.equal(afterAggregate.value.summary.suppressedObservationCount, 1);
  assert.equal(afterAggregate.value.summary.hiddenFilterApplied, false);
  const readback = afterAggregate.value.observations.find((observation) => observation.observationId === target.observationId);
  assert.equal(readback.suppressionState, 'SUPPRESSED');
  assert.equal(readback.suppressionId, suppressionId);
  assert.equal(readback.suppressionReason, 'Not a real place in this scene');
  assert.deepEqual(readback.evidenceAnchor, target.evidenceAnchor);
  assert.equal(readback.evidenceAnchor.quote, sceneAText.slice(target.startOffset, target.endOffset));
});

test('E04 C02: suppression command fails closed for invalid evidence without mutation', async () => {
  const { runtime, projectId, state } = await buildScopedAliasFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const aggregate = derived.deriveAtlasObservationAggregate({ coreState: state, params: { projectId } });
  assert.equal(aggregate.ok, true);
  const target = aggregate.value.observations[0];
  const beforeHash = runtime.hashCoreState(state);

  const badEvidence = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_OBSERVATION_SUPPRESS,
    payload: {
      projectId,
      sceneId: target.sceneId,
      entityId: target.entityId,
      observationId: target.observationId,
      evidenceAnchor: {
        ...target.evidenceAnchor,
        sceneId: 'wrong-scene',
      },
    },
  });
  assert.equal(badEvidence.ok, false);
  assert.equal(badEvidence.error.code, 'E_ATLAS_EVIDENCE_SCENE_MISMATCH');
  assert.equal(badEvidence.stateHash, beforeHash);

  const missingObservation = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_OBSERVATION_SUPPRESS,
    payload: {
      projectId,
      sceneId: target.sceneId,
      entityId: target.entityId,
      evidenceAnchor: target.evidenceAnchor,
    },
  });
  assert.equal(missingObservation.ok, false);
  assert.equal(missingObservation.error.code, 'E_ATLAS_OBSERVATION_ID_REQUIRED');
  assert.equal(missingObservation.stateHash, beforeHash);
});

test('E04 C02: suppression command is admitted only through Command Kernel capability revalidation', async () => {
  const { runtime, projectId, state } = await buildScopedAliasFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const registryModule = await loadModule(path.join('src', 'renderer', 'commands', 'registry.mjs'));
  const runnerModule = await loadModule(path.join('src', 'renderer', 'commands', 'runCommand.mjs'));
  const capabilityPolicy = await loadModule(path.join('src', 'renderer', 'commands', 'capabilityPolicy.mjs'));
  const localCapability = await loadModule(path.join('src', 'renderer', 'commands', 'localCapabilityProvider.mjs'));
  const aggregate = derived.deriveAtlasObservationAggregate({ coreState: state, params: { projectId } });
  const target = aggregate.value.observations[0];

  assert.equal(capabilityPolicy.CAPABILITY_BINDING[runtime.CORE_COMMAND_IDS.ATLAS_OBSERVATION_SUPPRESS], 'cap.atlas.observation.suppress');
  assert.equal(localCapability.resolveCommandEntitlement(runtime.CORE_COMMAND_IDS.ATLAS_OBSERVATION_SUPPRESS, { entitlementTier: 'free' }).available, true);

  const registry = registryModule.createCommandRegistry();
  registry.registerCommand(runtime.CORE_COMMAND_IDS.ATLAS_OBSERVATION_SUPPRESS, (input) => {
    return runtime.reduceCoreState(input.state, {
      type: runtime.CORE_COMMAND_IDS.ATLAS_OBSERVATION_SUPPRESS,
      payload: input.payload,
    });
  });

  const webRunner = runnerModule.createCommandRunner(registry, {
    capability: { defaultPlatformId: 'web' },
  });
  const denied = await webRunner(runtime.CORE_COMMAND_IDS.ATLAS_OBSERVATION_SUPPRESS, {
    state,
    payload: {
      projectId,
      sceneId: target.sceneId,
      entityId: target.entityId,
      observationId: target.observationId,
      evidenceAnchor: target.evidenceAnchor,
    },
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');

  const nodeRunner = runnerModule.createCommandRunner(registry, {
    capability: { defaultPlatformId: 'node', entitlementTier: 'free' },
  });
  const admitted = await nodeRunner(runtime.CORE_COMMAND_IDS.ATLAS_OBSERVATION_SUPPRESS, {
    state,
    payload: {
      projectId,
      sceneId: target.sceneId,
      entityId: target.entityId,
      observationId: target.observationId,
      evidenceAnchor: target.evidenceAnchor,
    },
  });
  assert.equal(admitted.ok, true);
  assert.equal(Object.keys(admitted.state.data.projects[projectId].atlas.suppressions).length, 1);
});

test('E04 C02: alias scope and suppression boundary adds no storage, network, UI, or bypass routes', () => {
  const sources = [
    path.join(process.cwd(), 'src', 'core', 'runtime.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'deriveAtlasMentionIndex.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'deriveAtlasObservationAggregate.mjs'),
  ].map((filePath) => [path.basename(filePath), fs.readFileSync(filePath, 'utf8')]);
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

  for (const [basename, source] of sources) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${basename} matched ${pattern.source}`);
    }
  }
});
