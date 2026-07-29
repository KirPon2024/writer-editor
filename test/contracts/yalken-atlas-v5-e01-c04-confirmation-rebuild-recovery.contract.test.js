const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildConfirmationFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const atlasIndex = await loadModule(path.join('src', 'derived', 'atlas', 'deriveAtlasMentionIndex.mjs'));
  const projectId = 'atlas-confirm-project';
  const sceneId = 'scene-a';
  const text = 'Anna met the Atlas keeper. Anna wrote a note.';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas confirm', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId, text },
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
        aliasId: 'alias-atlas-keeper',
        value: 'Atlas keeper',
      },
    },
  ]);
  assert.equal(built.ok, true);
  const index = atlasIndex.deriveAtlasMentionIndex({
    coreState: built.state,
    params: { projectId },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasMentionIndex: true } },
  });
  assert.equal(index.ok, true);
  const mention = index.value.mentions[0];
  assert.equal(mention.matchedText, 'Anna');
  return { runtime, projectId, sceneId, text, state: built.state, mention };
}

test('E01 C04: author confirmation is a Core command that records decision truth without changing scene text', async () => {
  const { runtime, projectId, sceneId, text, state, mention } = await buildConfirmationFixture();
  const beforeHash = runtime.hashCoreState(state);
  const confirmed = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_MENTION_CONFIRM,
    payload: {
      projectId,
      sceneId,
      entityId: mention.entityId,
      mentionId: mention.mentionId,
      evidenceAnchor: mention.evidenceAnchor,
    },
  });

  assert.equal(confirmed.ok, true);
  assert.notEqual(confirmed.stateHash, beforeHash);
  assert.equal(confirmed.state.data.projects[projectId].scenes[sceneId].text, text);
  assert.equal(confirmed.state.data.lastCommandId, 5);

  const decisions = confirmed.state.data.projects[projectId].atlas.decisions;
  const decisionIds = Object.keys(decisions);
  assert.equal(decisionIds.length, 1);
  const decision = decisions[decisionIds[0]];
  assert.equal(decision.decisionKind, 'mention.confirm');
  assert.equal(decision.trustState, 'AUTHOR_CONFIRMED');
  assert.equal(decision.projectId, projectId);
  assert.equal(decision.sceneId, sceneId);
  assert.equal(decision.entityId, mention.entityId);
  assert.equal(decision.mentionId, mention.mentionId);
  assert.deepEqual(decision.evidenceAnchor, mention.evidenceAnchor);

  const duplicate = runtime.reduceCoreState(confirmed.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_MENTION_CONFIRM,
    payload: {
      projectId,
      sceneId,
      entityId: mention.entityId,
      mentionId: mention.mentionId,
      evidenceAnchor: mention.evidenceAnchor,
      decisionId: decision.id,
    },
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error.code, 'E_ATLAS_DECISION_ALREADY_EXISTS');
  assert.equal(duplicate.stateHash, runtime.hashCoreState(confirmed.state));
});

test('E01 C04: malformed or mismatched confirmation evidence fails closed without mutation', async () => {
  const { runtime, projectId, sceneId, state, mention } = await buildConfirmationFixture();
  const beforeHash = runtime.hashCoreState(state);

  const missingEvidence = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_MENTION_CONFIRM,
    payload: {
      projectId,
      sceneId,
      entityId: mention.entityId,
      mentionId: mention.mentionId,
    },
  });
  assert.equal(missingEvidence.ok, false);
  assert.equal(missingEvidence.error.code, 'E_ATLAS_EVIDENCE_ANCHOR_REQUIRED');
  assert.equal(missingEvidence.stateHash, beforeHash);

  const mismatchedEntity = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_MENTION_CONFIRM,
    payload: {
      projectId,
      sceneId,
      entityId: mention.entityId,
      mentionId: mention.mentionId,
      evidenceAnchor: { ...mention.evidenceAnchor, entityId: 'entity-other' },
    },
  });
  assert.equal(mismatchedEntity.ok, false);
  assert.equal(mismatchedEntity.error.code, 'E_ATLAS_EVIDENCE_ENTITY_MISMATCH');
  assert.equal(mismatchedEntity.stateHash, beforeHash);
});

test('E01 C04: confirmation travels through Command Kernel capability revalidation', async () => {
  const { runtime, projectId, sceneId, state, mention } = await buildConfirmationFixture();
  const registryModule = await loadModule(path.join('src', 'renderer', 'commands', 'registry.mjs'));
  const runnerModule = await loadModule(path.join('src', 'renderer', 'commands', 'runCommand.mjs'));
  const registry = registryModule.createCommandRegistry();
  registry.registerCommand(runtime.CORE_COMMAND_IDS.ATLAS_MENTION_CONFIRM, (input) => {
    return runtime.reduceCoreState(input.state, {
      type: runtime.CORE_COMMAND_IDS.ATLAS_MENTION_CONFIRM,
      payload: input.payload,
    });
  });
  const payload = {
    projectId,
    sceneId,
    entityId: mention.entityId,
    mentionId: mention.mentionId,
    evidenceAnchor: mention.evidenceAnchor,
  };

  const webRunner = runnerModule.createCommandRunner(registry, {
    capability: { defaultPlatformId: 'web' },
  });
  const denied = await webRunner(runtime.CORE_COMMAND_IDS.ATLAS_MENTION_CONFIRM, { state, payload });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');

  const nodeRunner = runnerModule.createCommandRunner(registry, {
    capability: { defaultPlatformId: 'node', entitlementTier: 'free' },
  });
  const admitted = await nodeRunner(runtime.CORE_COMMAND_IDS.ATLAS_MENTION_CONFIRM, { state, payload });
  assert.equal(admitted.ok, true);
  assert.equal(Object.keys(admitted.state.data.projects[projectId].atlas.decisions).length, 1);
});

test('E01 C04: current-scene dossier reflects author-confirmed trust without losing algorithmic observations', async () => {
  const { runtime, projectId, sceneId, state, mention } = await buildConfirmationFixture();
  const dossierModule = await loadModule(path.join('src', 'derived', 'atlas', 'deriveAtlasCurrentSceneDossier.mjs'));

  const before = dossierModule.deriveAtlasCurrentSceneDossier({
    coreState: state,
    params: { projectId, sceneId },
  });
  assert.equal(before.ok, true);
  assert.equal(before.value.summary.mentionCount, 3);
  assert.equal(before.value.summary.confirmedMentionCount, 0);
  assert.equal(before.value.mentions.every((item) => item.trustState === 'ALGORITHMIC_OBSERVATION'), true);

  const confirmed = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_MENTION_CONFIRM,
    payload: {
      projectId,
      sceneId,
      entityId: mention.entityId,
      mentionId: mention.mentionId,
      evidenceAnchor: mention.evidenceAnchor,
    },
  });
  assert.equal(confirmed.ok, true);
  const after = dossierModule.deriveAtlasCurrentSceneDossier({
    coreState: confirmed.state,
    params: { projectId, sceneId },
  });
  assert.equal(after.ok, true);
  assert.equal(after.value.summary.mentionCount, 3);
  assert.equal(after.value.summary.confirmedMentionCount, 1);
  assert.equal(after.value.mentions.find((item) => item.mentionId === mention.mentionId).trustState, 'AUTHOR_CONFIRMED');
  assert.equal(after.value.mentions.filter((item) => item.trustState === 'ALGORITHMIC_OBSERVATION').length, 2);
});

test('E01 C04: Atlas generation rebuild is deterministic, cache-delete safe, and rejects stale publish', async () => {
  const { runtime, projectId, sceneId, state, mention } = await buildConfirmationFixture();
  const rebuildModule = await loadModule(path.join('src', 'derived', 'atlas', 'rebuildAtlasGeneration.mjs'));
  const confirmed = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_MENTION_CONFIRM,
    payload: {
      projectId,
      sceneId,
      entityId: mention.entityId,
      mentionId: mention.mentionId,
      evidenceAnchor: mention.evidenceAnchor,
    },
  });
  assert.equal(confirmed.ok, true);
  const sourceRevision = runtime.hashCoreState(confirmed.state);
  const first = rebuildModule.deriveAtlasGenerationManifest({
    coreState: confirmed.state,
    params: { projectId, sourceRevision },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasMentionIndex: true } },
  });
  const second = rebuildModule.deriveAtlasGenerationManifest({
    coreState: confirmed.state,
    params: { projectId, sourceRevision },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasMentionIndex: true } },
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(first.value, second.value);
  assert.equal(first.value.schemaVersion, 'derived.atlas.generationManifest.v1');
  assert.equal(first.value.recovery.persistentDerivedTruth, false);
  assert.equal(first.value.recovery.cacheDeletionSafe, true);
  assert.equal(first.value.aggregate.decisionCount, 1);

  const recoveredAfterCacheDelete = rebuildModule.recoverAtlasGenerationFromManifest({
    coreState: confirmed.state,
    manifest: first.value,
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasMentionIndex: true } },
  });
  assert.equal(recoveredAfterCacheDelete.ok, true);
  assert.deepEqual(recoveredAfterCacheDelete.value, first.value);
  assert.deepEqual(rebuildModule.canPublishAtlasGeneration(first.value, sourceRevision), { ok: true, reason: '' });

  const edited = runtime.reduceCoreState(confirmed.state, {
    type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payload: {
      projectId,
      sceneId,
      text: 'Anna rewrote the scene.',
    },
  });
  assert.equal(edited.ok, true);
  const nextRevision = runtime.hashCoreState(edited.state);
  assert.deepEqual(rebuildModule.canPublishAtlasGeneration(first.value, nextRevision), {
    ok: false,
    reason: 'STALE_SOURCE_REVISION',
  });
});

test('E01 C04: confirmation and rebuild boundary add no filesystem, network, Electron, or renderer storage bypass', () => {
  const sources = [
    path.join(process.cwd(), 'src', 'core', 'runtime.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'rebuildAtlasGeneration.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'deriveAtlasCurrentSceneDossier.mjs'),
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
    /\bmkdir(?:Sync)?\s*\(/u,
    /\brename(?:Sync)?\s*\(/u,
    /\bunlink(?:Sync)?\s*\(/u,
    /\brm(?:Sync)?\s*\(/u,
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
  ];

  for (const sourcePath of sources) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${path.basename(sourcePath)} matched ${pattern.source}`);
    }
  }
});
