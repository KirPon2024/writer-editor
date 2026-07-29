const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function loadRuntime() {
  return loadModule(path.join('src', 'core', 'runtime.mjs'));
}

function reopenState(state) {
  return JSON.parse(JSON.stringify(state));
}

test('E01 C01: author-created Atlas entity and alias survive JSON save/reopen without changing scene text', async () => {
  const runtime = await loadRuntime();
  const initial = runtime.createInitialCoreState();

  const created = runtime.reduceCoreState(initial, {
    type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
    payload: { projectId: 'atlas-project', title: 'Atlas draft', sceneId: 'scene-a' },
  });
  assert.equal(created.ok, true);

  const edited = runtime.reduceCoreState(created.state, {
    type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payload: { projectId: 'atlas-project', sceneId: 'scene-a', text: 'Anna met the Atlas keeper.' },
  });
  assert.equal(edited.ok, true);
  const sceneBeforeAtlas = edited.state.data.projects['atlas-project'].scenes['scene-a'].text;

  const entityCreated = runtime.reduceCoreState(edited.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
    payload: {
      projectId: 'atlas-project',
      entityId: 'entity-anna',
      name: 'Anna',
      entityKind: 'character',
    },
  });
  assert.equal(entityCreated.ok, true);

  const aliasAdded = runtime.reduceCoreState(entityCreated.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_ALIAS_ADD,
    payload: {
      projectId: 'atlas-project',
      entityId: 'entity-anna',
      aliasId: 'alias-atlas-keeper',
      value: 'Atlas keeper',
      scope: 'scene',
      sceneId: 'scene-a',
    },
  });

  assert.equal(aliasAdded.ok, true);
  const reopened = reopenState(aliasAdded.state);
  const project = reopened.data.projects['atlas-project'];
  assert.equal(project.scenes['scene-a'].text, sceneBeforeAtlas);
  assert.equal(project.atlas.schemaVersion, 'atlas.author.v1');
  assert.equal(project.atlas.entities['entity-anna'].name, 'Anna');
  assert.equal(project.atlas.entities['entity-anna'].entityKind, 'character');
  assert.deepEqual(project.atlas.entities['entity-anna'].aliases['alias-atlas-keeper'], {
    id: 'alias-atlas-keeper',
    value: 'Atlas keeper',
    scope: 'scene',
    sceneId: 'scene-a',
    createdByCommandSeq: 4,
  });
  assert.equal(project.atlas.entities['entity-anna'].createdByCommandSeq, 3);
  assert.equal(project.atlas.entities['entity-anna'].updatedByCommandSeq, 4);
  assert.equal(reopened.data.lastCommandId, 4);
});

test('E01 C01: Atlas author commands reject invalid payloads without mutating core state hash', async () => {
  const runtime = await loadRuntime();
  const createProject = runtime.reduceCoreState(runtime.createInitialCoreState(), {
    type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
    payload: { projectId: 'atlas-project', sceneId: 'scene-a' },
  });
  assert.equal(createProject.ok, true);

  const beforeHash = runtime.hashCoreState(createProject.state);
  const missingName = runtime.reduceCoreState(createProject.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
    payload: { projectId: 'atlas-project', entityId: 'entity-1', name: '   ' },
  });
  assert.equal(missingName.ok, false);
  assert.equal(missingName.error.code, 'E_ATLAS_ENTITY_NAME_REQUIRED');
  assert.equal(missingName.stateHash, beforeHash);

  const entityCreated = runtime.reduceCoreState(createProject.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
    payload: { projectId: 'atlas-project', entityId: 'entity-1', name: 'Mira' },
  });
  assert.equal(entityCreated.ok, true);

  const duplicateEntity = runtime.reduceCoreState(entityCreated.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
    payload: { projectId: 'atlas-project', entityId: 'entity-1', name: 'Mira again' },
  });
  assert.equal(duplicateEntity.ok, false);
  assert.equal(duplicateEntity.error.code, 'E_ATLAS_ENTITY_ALREADY_EXISTS');
  assert.equal(duplicateEntity.stateHash, runtime.hashCoreState(entityCreated.state));

  const missingScene = runtime.reduceCoreState(entityCreated.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_ALIAS_ADD,
    payload: {
      projectId: 'atlas-project',
      entityId: 'entity-1',
      aliasId: 'alias-1',
      value: 'Mirror',
      scope: 'scene',
      sceneId: 'missing-scene',
    },
  });
  assert.equal(missingScene.ok, false);
  assert.equal(missingScene.error.code, 'E_CORE_SCENE_NOT_FOUND');
  assert.equal(missingScene.stateHash, runtime.hashCoreState(entityCreated.state));
});

test('E01 C01: Atlas commands are admitted only through Command Kernel capability revalidation', async () => {
  const runtime = await loadRuntime();
  const registryModule = await loadModule(path.join('src', 'renderer', 'commands', 'registry.mjs'));
  const runnerModule = await loadModule(path.join('src', 'renderer', 'commands', 'runCommand.mjs'));

  const registry = registryModule.createCommandRegistry();
  registry.registerCommand(runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE, (input) => {
    return runtime.reduceCoreState(input.state, {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: input.payload,
    });
  });

  const state = runtime.reduceCoreState(runtime.createInitialCoreState(), {
    type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
    payload: { projectId: 'atlas-project', sceneId: 'scene-a' },
  }).state;

  const webRunner = runnerModule.createCommandRunner(registry, {
    capability: { defaultPlatformId: 'web' },
  });
  const denied = await webRunner(runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE, {
    state,
    payload: { projectId: 'atlas-project', entityId: 'entity-web', name: 'Web denied' },
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');

  const nodeRunner = runnerModule.createCommandRunner(registry, {
    capability: { defaultPlatformId: 'node', entitlementTier: 'free' },
  });
  const admitted = await nodeRunner(runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE, {
    state,
    payload: { projectId: 'atlas-project', entityId: 'entity-node', name: 'Node admitted' },
  });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.state.data.projects['atlas-project'].atlas.entities['entity-node'].name, 'Node admitted');
});

test('E01 C01: Atlas author-data boundary does not add private storage or platform bypasses to Core', () => {
  const runtimeSource = fs.readFileSync(path.join(process.cwd(), 'src', 'core', 'runtime.mjs'), 'utf8');
  const forbiddenPatterns = [
    /\bfs\b/u,
    /\bwriteFile(Sync)?\b/u,
    /\breadFile(Sync)?\b/u,
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
    /\bipc(Renderer|Main)\b/u,
    /from\s+['"]electron['"]/u,
    /require\(['"]electron['"]\)/u,
  ];

  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(runtimeSource, pattern);
  }
});
