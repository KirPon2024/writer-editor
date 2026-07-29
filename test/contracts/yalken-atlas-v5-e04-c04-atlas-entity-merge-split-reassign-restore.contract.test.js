const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildMergeFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const projectId = 'atlas-merge-project';
  const sceneId = 'scene-a';
  const text = 'Anna met Mira beside the river.';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas merge', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId, text },
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
  return { runtime, projectId, sceneId, text, state: built.state };
}

test('E04 C04: explicit entity merge rewires derived mentions without deleting source truth', async () => {
  const { runtime, projectId, state } = await buildMergeFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const before = derived.deriveAtlasObservationAggregate({ coreState: state, params: { projectId, languageCode: 'en' } });
  assert.equal(before.ok, true);
  assert.deepEqual(before.value.entities.map((entity) => entity.entityId), ['entity-anna', 'entity-mira']);

  const merged = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_MERGE,
    payload: {
      projectId,
      sourceEntityId: 'entity-mira',
      targetEntityId: 'entity-anna',
      operationId: 'merge-mira-into-anna',
      reason: 'Author confirmed same character',
    },
  });
  assert.equal(merged.ok, true);
  const atlas = merged.state.data.projects[projectId].atlas;
  assert.equal(atlas.entities['entity-mira'].mergeState, 'MERGED');
  assert.equal(atlas.entities['entity-mira'].mergedIntoEntityId, 'entity-anna');
  assert.deepEqual(atlas.entities['entity-anna'].mergedSourceEntityIds, ['entity-mira']);
  assert.equal(atlas.entityOperations['merge-mira-into-anna'].operationKind, 'entity.merge');
  assert.equal(atlas.entityOperations['merge-mira-into-anna'].restoredByCommandSeq, 0);

  const after = derived.deriveAtlasObservationAggregate({ coreState: merged.state, params: { projectId, languageCode: 'en' } });
  assert.equal(after.ok, true);
  assert.deepEqual(after.value.observations.map((observation) => [observation.matchedText, observation.entityId]), [
    ['Anna', 'entity-anna'],
    ['Mira', 'entity-anna'],
  ]);
  assert.deepEqual(after.value.entities.map((entity) => [entity.entityId, entity.observationCount]), [['entity-anna', 2]]);
  assert.equal(merged.state.data.projects[projectId].atlas.entities['entity-mira'].name, 'Mira');
});

test('E04 C04: split restore reverses only an unstale explicit merge operation', async () => {
  const { runtime, projectId, state } = await buildMergeFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const merged = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_MERGE,
    payload: {
      projectId,
      sourceEntityId: 'entity-mira',
      targetEntityId: 'entity-anna',
      operationId: 'merge-mira-into-anna',
    },
  });
  assert.equal(merged.ok, true);

  const restored = runtime.reduceCoreState(merged.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_SPLIT_RESTORE,
    payload: { projectId, operationId: 'merge-mira-into-anna', restoreOperationId: 'restore-mira' },
  });
  assert.equal(restored.ok, true);
  assert.equal(restored.state.data.projects[projectId].atlas.entities['entity-mira'].mergeState, undefined);
  assert.equal(restored.state.data.projects[projectId].atlas.entityOperations['merge-mira-into-anna'].restoreOperationId, 'restore-mira');

  const afterRestore = derived.deriveAtlasObservationAggregate({ coreState: restored.state, params: { projectId, languageCode: 'en' } });
  assert.equal(afterRestore.ok, true);
  assert.deepEqual(afterRestore.value.entities.map((entity) => entity.entityId), ['entity-anna', 'entity-mira']);

  const editedAfterMerge = runtime.reduceCoreState(merged.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_ALIAS_ADD,
    payload: { projectId, entityId: 'entity-anna', aliasId: 'alias-river-anna', value: 'River Anna' },
  });
  assert.equal(editedAfterMerge.ok, true);
  const staleRestore = runtime.reduceCoreState(editedAfterMerge.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_SPLIT_RESTORE,
    payload: { projectId, operationId: 'merge-mira-into-anna' },
  });
  assert.equal(staleRestore.ok, false);
  assert.equal(staleRestore.error.code, 'E_ATLAS_OPERATION_STALE');
  assert.equal(staleRestore.stateHash, runtime.hashCoreState(editedAfterMerge.state));
});

test('E04 C04: explicit observation reassign changes one active observation without mutating text', async () => {
  const { runtime, projectId, sceneId, text, state } = await buildMergeFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const before = derived.deriveAtlasObservationAggregate({ coreState: state, params: { projectId, languageCode: 'en' } });
  assert.equal(before.ok, true);
  const mira = before.value.observations.find((observation) => observation.entityId === 'entity-mira');
  assert.ok(mira);

  const reassigned = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_OBSERVATION_REASSIGN,
    payload: {
      projectId,
      sceneId,
      sourceEntityId: 'entity-mira',
      targetEntityId: 'entity-anna',
      observationId: mira.observationId,
      mentionId: mira.mentionId,
      evidenceAnchor: mira.evidenceAnchor,
      reassignmentId: 'reassign-mira-mention-to-anna',
      reason: 'Author says this mention points to Anna',
    },
  });
  assert.equal(reassigned.ok, true);
  assert.equal(reassigned.state.data.projects[projectId].scenes[sceneId].text, text);

  const after = derived.deriveAtlasObservationAggregate({ coreState: reassigned.state, params: { projectId, languageCode: 'en' } });
  assert.equal(after.ok, true);
  assert.equal(after.value.summary.observationCount, 2);
  assert.equal(after.value.summary.reassignedObservationCount, 1);
  const readback = after.value.observations.find((observation) => observation.observationId === mira.observationId);
  assert.equal(readback.entityId, 'entity-anna');
  assert.equal(readback.originalEntityId, 'entity-mira');
  assert.equal(readback.reassignmentState, 'REASSIGNED');
  assert.equal(readback.reassignmentId, 'reassign-mira-mention-to-anna');
  assert.deepEqual(readback.evidenceAnchor, mira.evidenceAnchor);
  assert.deepEqual(after.value.entities.map((entity) => [entity.entityId, entity.observationCount]), [['entity-anna', 2]]);
});

test('E04 C04: stale evidence and stale entity hashes fail closed without mutation', async () => {
  const { runtime, projectId, sceneId, state } = await buildMergeFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const before = derived.deriveAtlasObservationAggregate({ coreState: state, params: { projectId, languageCode: 'en' } });
  assert.equal(before.ok, true);
  const mira = before.value.observations.find((observation) => observation.entityId === 'entity-mira');
  assert.ok(mira);

  const staleScene = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payload: { projectId, sceneId, text: 'Anna met nobody beside the river.' },
  });
  assert.equal(staleScene.ok, true);
  const staleReassign = runtime.reduceCoreState(staleScene.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_OBSERVATION_REASSIGN,
    payload: {
      projectId,
      sceneId,
      sourceEntityId: 'entity-mira',
      targetEntityId: 'entity-anna',
      observationId: mira.observationId,
      mentionId: mira.mentionId,
      evidenceAnchor: mira.evidenceAnchor,
    },
  });
  assert.equal(staleReassign.ok, false);
  assert.equal(staleReassign.error.code, 'E_ATLAS_EVIDENCE_STALE');
  assert.equal(staleReassign.stateHash, runtime.hashCoreState(staleScene.state));

  const staleMerge = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_MERGE,
    payload: {
      projectId,
      sourceEntityId: 'entity-mira',
      targetEntityId: 'entity-anna',
      expectedSourceEntityHash: 'not-the-current-source-hash',
    },
  });
  assert.equal(staleMerge.ok, false);
  assert.equal(staleMerge.error.code, 'E_ATLAS_ENTITY_STALE');
  assert.equal(staleMerge.stateHash, runtime.hashCoreState(state));
});

test('E04 C04: merge split and reassign commands are admitted only through Command Kernel capability revalidation', async () => {
  const { runtime, projectId, state } = await buildMergeFixture();
  const registryModule = await loadModule(path.join('src', 'renderer', 'commands', 'registry.mjs'));
  const runnerModule = await loadModule(path.join('src', 'renderer', 'commands', 'runCommand.mjs'));
  const capabilityPolicy = await loadModule(path.join('src', 'renderer', 'commands', 'capabilityPolicy.mjs'));
  const localCapability = await loadModule(path.join('src', 'renderer', 'commands', 'localCapabilityProvider.mjs'));

  for (const commandId of [
    runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_MERGE,
    runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_SPLIT_RESTORE,
    runtime.CORE_COMMAND_IDS.ATLAS_OBSERVATION_REASSIGN,
  ]) {
    assert.equal(capabilityPolicy.CAPABILITY_BINDING[commandId].startsWith('cap.atlas.'), true);
    assert.equal(localCapability.resolveCommandEntitlement(commandId, { entitlementTier: 'free' }).available, true);
  }

  const registry = registryModule.createCommandRegistry();
  registry.registerCommand(runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_MERGE, (input) => {
    return runtime.reduceCoreState(input.state, {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_MERGE,
      payload: input.payload,
    });
  });

  const payload = {
    projectId,
    sourceEntityId: 'entity-mira',
    targetEntityId: 'entity-anna',
    operationId: 'merge-via-runner',
  };
  const webRunner = runnerModule.createCommandRunner(registry, { capability: { defaultPlatformId: 'web' } });
  const denied = await webRunner(runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_MERGE, { state, payload });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');

  const nodeRunner = runnerModule.createCommandRunner(registry, { capability: { defaultPlatformId: 'node', entitlementTier: 'free' } });
  const admitted = await nodeRunner(runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_MERGE, { state, payload });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.state.data.projects[projectId].atlas.entityOperations['merge-via-runner'].operationKind, 'entity.merge');
});

test('E04 C04: merge split reassign runtime adds no storage, network, UI, or bypass routes', () => {
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
