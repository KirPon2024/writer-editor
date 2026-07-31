const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildCurrentSceneFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const projectId = 'atlas-current-scene-project';
  const sceneAId = 'scene-a';
  const sceneBId = 'scene-b';
  const sceneAText = 'Anna marked the Atlas keeper note. Mira watched Anna.';
  const sceneBText = 'Mira archived the bridge note.';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas current scene', sceneId: sceneAId },
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
        aliasId: 'alias-atlas-keeper',
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

  return { projectId, sceneAId, sceneBId, sceneAText, sceneBText, state };
}

test('E01 C03: current-scene Atlas dossier is a read-only surface projection with evidence focus intents', async () => {
  const { projectId, sceneAId, sceneAText, state } = await buildCurrentSceneFixture();
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'deriveAtlasCurrentSceneDossier.mjs'));

  const result = atlas.deriveAtlasCurrentSceneDossier({
    coreState: state,
    params: { projectId, sceneId: sceneAId, sceneTitle: 'Opening scene' },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasMentionIndex: true } },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.schemaVersion, 'derived.atlas.currentSceneDossier.v1');
  assert.equal(result.value.state, 'ready');
  assert.equal(result.value.projectId, projectId);
  assert.equal(result.value.sceneId, sceneAId);
  assert.equal(result.value.sceneTitle, 'Opening scene');
  assert.equal(result.value.summary.entityCount, 2);
  assert.equal(result.value.summary.mentionCount, 4);
  assert.equal(typeof result.value.summary.sceneTextHash, 'string');
  assert.equal(result.value.summary.sceneTextHash.length, 64);
  assert.equal(result.value.summary.indexHash.length, 64);
  assert.equal(result.value.summary.invalidationKey.length, 64);
  assert.equal(result.meta.invalidationKey.length, 64);
  assert.notEqual(result.value.summary.invalidationKey, result.meta.invalidationKey);

  assert.deepEqual(result.value.surfaceManifest, {
    schemaVersion: 'surface.atlas.currentSceneDossier.v1',
    surfaceId: 'surface.atlas.currentSceneDossier',
    providerId: 'query.atlasCurrentScene',
    host: 'rightRail',
    slotId: 'rightRail.context.atlas',
    contributionKind: 'readOnlyProjection',
    allowedStateClasses: ['PROJECT_STATE', 'DERIVED_STATE', 'TRANSIENT_STATE'],
    commandAuthority: 'none',
    productMutation: false,
    storageAuthority: false,
    fallback: {
      empty: 'ATLAS_DOSSIER_EMPTY',
      unavailable: 'ATLAS_DOSSIER_UNAVAILABLE',
    },
  });

  assert.deepEqual(
    result.value.entities.map((entity) => [entity.entityId, entity.mentionCount]),
    [
      ['entity-anna', 3],
      ['entity-mira', 1],
    ],
  );
  assert.equal(result.value.mentions.every((mention) => mention.sceneId === sceneAId), true);
  assert.deepEqual(
    result.value.mentions.map((mention) => mention.matchedText),
    ['Anna', 'Atlas keeper', 'Mira', 'Anna'],
  );

  const first = result.value.mentions[0];
  assert.equal(first.startOffset, sceneAText.indexOf('Anna'));
  assert.equal(first.endOffset, sceneAText.indexOf('Anna') + 'Anna'.length);
  assert.equal(first.context.quote, 'Anna');
  assert.equal(first.evidenceAnchor.schemaVersion, 'atlas.evidenceAnchor.v1');
  assert.deepEqual(first.focusIntent, {
    kind: 'localTextSelection',
    sceneId: sceneAId,
    startOffset: first.startOffset,
    endOffset: first.endOffset,
  });
});

test('E01 C03: dossier filters mention index to the requested current scene only', async () => {
  const { projectId, sceneBId, state } = await buildCurrentSceneFixture();
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'deriveAtlasCurrentSceneDossier.mjs'));

  const result = atlas.deriveAtlasCurrentSceneDossier({
    coreState: state,
    params: { projectId, sceneId: sceneBId, sceneTitle: 'Second scene' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.state, 'ready');
  assert.equal(result.value.sceneId, sceneBId);
  assert.equal(result.value.summary.entityCount, 1);
  assert.equal(result.value.summary.mentionCount, 1);
  assert.deepEqual(
    result.value.mentions.map((mention) => [mention.sceneId, mention.matchedText]),
    [[sceneBId, 'Mira']],
  );
});

test('E01 C03: dossier returns empty and unavailable states without mutating project truth', async () => {
  const { projectId, sceneAId, state } = await buildCurrentSceneFixture();
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'deriveAtlasCurrentSceneDossier.mjs'));
  const before = JSON.stringify(state);

  const emptyState = JSON.parse(JSON.stringify(state));
  emptyState.data.projects[projectId].atlas.entities = {};
  const empty = atlas.deriveAtlasCurrentSceneDossier({
    coreState: emptyState,
    params: { projectId, sceneId: sceneAId },
  });
  assert.equal(empty.ok, true);
  assert.equal(empty.value.state, 'empty');
  assert.equal(empty.value.summary.mentionCount, 0);
  assert.equal(empty.value.surfaceManifest.productMutation, false);

  const disabled = atlas.deriveAtlasCurrentSceneDossier({
    coreState: state,
    params: { projectId, sceneId: sceneAId },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasMentionIndex: false } },
  });
  assert.equal(disabled.ok, true);
  assert.equal(disabled.value.state, 'unavailable');
  assert.equal(disabled.value.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');

  const missingScene = atlas.deriveAtlasCurrentSceneDossier({
    coreState: state,
    params: { projectId, sceneId: 'missing-scene' },
  });
  assert.equal(missingScene.ok, false);
  assert.equal(missingScene.error.code, 'E_ATLAS_SCENE_NOT_FOUND');
  assert.equal(JSON.stringify(state), before);
});

test('E01 C03: surface wiring uses query bridge and does not bypass command or storage authority', () => {
  const derivedRoot = path.join(process.cwd(), 'src', 'derived', 'atlas');
  const derivedSources = fs.readdirSync(derivedRoot)
    .filter((basename) => basename.endsWith('.mjs'))
    .map((basename) => [basename, fs.readFileSync(path.join(derivedRoot, basename), 'utf8')]);
  const forbiddenDerivedPatterns = [
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

  for (const [basename, source] of derivedSources) {
    for (const pattern of forbiddenDerivedPatterns) {
      assert.doesNotMatch(source, pattern, `${basename} matched ${pattern.source}`);
    }
  }

  const mainSource = fs.readFileSync(path.join(process.cwd(), 'src', 'main.js'), 'utf8');
  assert.match(mainSource, /ATLAS_CURRENT_SCENE_QUERY_ID\s*=\s*WORKSPACE_QUERY_IDS\.ATLAS_CURRENT_SCENE/u);
  assert.match(mainSource, /\[ATLAS_CURRENT_SCENE_QUERY_ID,\s*handleWorkspaceAtlasCurrentSceneQuery\]/u);
  assert.match(mainSource, /function handleWorkspaceAtlasCurrentSceneQuery/u);
  assert.match(mainSource, /resolveProjectTreeNodeIdentity/u);
  assert.match(mainSource, /sanitizePayloadWithinProjectRoot/u);
  assert.match(mainSource, /parseObservablePayload/u);
  assert.match(mainSource, /atlasCurrentScene/u);

  const rendererSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'editor.js'), 'utf8');
  assert.match(rendererSource, /ATLAS_CURRENT_SCENE_QUERY_ID\s*=\s*WORKSPACE_QUERY_IDS\.ATLAS_CURRENT_SCENE/u);
  assert.match(rendererSource, /RIGHT_RAIL_SURFACE_PROVIDERS[\s\S]*atlas:\s*ATLAS_CURRENT_SCENE_QUERY_ID/u);
  assert.match(rendererSource, /refreshAtlasCurrentScene/u);
  assert.match(rendererSource, /focusAtlasMention/u);
  assert.match(rendererSource, /invokeWorkspaceQueryBridge\(ATLAS_CURRENT_SCENE_QUERY_ID/u);
  assert.match(rendererSource, /setSelectionRange\(start,\s*end\)/u);
  assert.doesNotMatch(rendererSource, /dispatchUiCommand\([^)]*ATLAS_CURRENT_SCENE_QUERY_ID/u);

  const htmlSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'index.html'), 'utf8');
  assert.match(htmlSource, /data-right-tab="atlas"/u);
  assert.match(htmlSource, /data-right-panel-atlas/u);
  assert.match(htmlSource, /data-atlas-current-scene-host/u);
  assert.match(htmlSource, /data-atlas-current-scene-provider="query\.atlasCurrentScene"/u);
});
