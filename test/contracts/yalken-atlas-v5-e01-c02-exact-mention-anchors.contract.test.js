const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildAtlasFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const projectId = 'atlas-mentions-project';
  const sceneId = 'scene-a';
  const text = 'Anna met the Atlas keeper. Annabel ignored Anna. atlas keeper stayed lowercase.';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas mentions', sceneId },
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
  return { runtime, projectId, sceneId, text, state: built.state };
}

test('E01 C02: exact Atlas mention index emits stable evidence anchors without fuzzy matches', async () => {
  const { projectId, sceneId, text, state } = await buildAtlasFixture();
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'deriveAtlasMentionIndex.mjs'));

  const result = atlas.deriveAtlasMentionIndex({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasMentionIndex: true } },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.schemaVersion, 'derived.atlas.mentionIndex.v1');
  assert.equal(result.value.projectId, projectId);
  assert.equal(result.value.mentions.length, 3);
  assert.deepEqual(
    result.value.mentions.map((mention) => mention.matchedText),
    ['Anna', 'Atlas keeper', 'Anna'],
  );
  assert.equal(result.value.mentions.some((mention) => mention.matchedText === 'Annabel'), false);
  assert.equal(result.value.mentions.some((mention) => mention.matchedText === 'atlas keeper'), false);

  const firstAnna = result.value.mentions[0];
  assert.equal(firstAnna.sceneId, sceneId);
  assert.equal(firstAnna.startOffset, text.indexOf('Anna'));
  assert.equal(firstAnna.endOffset, text.indexOf('Anna') + 'Anna'.length);
  assert.equal(firstAnna.evidenceAnchor.schemaVersion, 'atlas.evidenceAnchor.v1');
  assert.equal(firstAnna.evidenceAnchor.quote, 'Anna');
  assert.equal(firstAnna.evidenceAnchor.startOffset, firstAnna.startOffset);
  assert.equal(firstAnna.evidenceAnchor.endOffset, firstAnna.endOffset);
  assert.equal(typeof firstAnna.evidenceAnchor.quoteHash, 'string');
  assert.equal(firstAnna.evidenceAnchor.quoteHash.length, 64);
  assert.equal(typeof firstAnna.evidenceAnchor.sceneTextHash, 'string');
  assert.equal(firstAnna.evidenceAnchor.sceneTextHash.length, 64);

  assert.deepEqual(result.value.sceneShards, [
    {
      sceneId,
      sceneTextHash: firstAnna.evidenceAnchor.sceneTextHash,
      mentionIds: result.value.mentions.map((mention) => mention.mentionId),
      mentionCount: 3,
    },
  ]);
});

test('E01 C02: exact Atlas mention index is deterministic and canonical-hashed', async () => {
  const { projectId, state } = await buildAtlasFixture();
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'deriveAtlasMentionIndex.mjs'));

  const input = {
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasMentionIndex: true } },
  };
  const first = atlas.deriveAtlasMentionIndex(input);
  const second = atlas.deriveAtlasMentionIndex(input);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(first.value.mentions, second.value.mentions);
  assert.deepEqual(first.value.sceneShards, second.value.sceneShards);
  assert.equal(first.value.meta.indexHash, second.value.meta.indexHash);
  assert.equal(first.value.meta.invalidationKey, first.meta.invalidationKey);
  assert.equal(first.meta.invalidationKey, second.meta.invalidationKey);
  assert.equal(first.meta.outputHash, second.meta.outputHash);
});

test('E01 C02: stale Atlas mention generations are detectable by invalidation key changes', async () => {
  const { runtime, projectId, sceneId, state } = await buildAtlasFixture();
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'deriveAtlasMentionIndex.mjs'));

  const first = atlas.deriveAtlasMentionIndex({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasMentionIndex: true } },
  });
  assert.equal(first.ok, true);

  const edited = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payload: {
      projectId,
      sceneId,
      text: 'Anna revised the Atlas keeper note.',
    },
  });
  assert.equal(edited.ok, true);

  const second = atlas.deriveAtlasMentionIndex({
    coreState: edited.state,
    params: { projectId },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasMentionIndex: true } },
  });
  assert.equal(second.ok, true);
  assert.notEqual(first.meta.invalidationKey, second.meta.invalidationKey);
  assert.notEqual(first.value.meta.indexHash, second.value.meta.indexHash);
  assert.equal(second.value.mentions.length, 2);
});

test('E01 C02: Atlas mention index fails closed for missing project and disabled capability', async () => {
  const { state } = await buildAtlasFixture();
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'deriveAtlasMentionIndex.mjs'));

  const missingProject = atlas.deriveAtlasMentionIndex({
    coreState: state,
    params: { projectId: 'missing-project' },
  });
  assert.equal(missingProject.ok, false);
  assert.equal(missingProject.error.code, 'E_ATLAS_PROJECT_NOT_FOUND');

  const disabled = atlas.deriveAtlasMentionIndex({
    coreState: state,
    params: { projectId: 'atlas-mentions-project' },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasMentionIndex: false } },
  });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(disabled.error.reason, 'ATLAS_MENTION_INDEX_DISABLED');
});

test('E01 C02: Atlas mention analyzer introduces no storage, network, or platform bypass', () => {
  const root = path.join(process.cwd(), 'src', 'derived', 'atlas');
  const files = fs.readdirSync(root)
    .filter((basename) => basename.endsWith('.mjs'))
    .map((basename) => path.join(root, basename));
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
  ];

  for (const filePath of files) {
    const source = fs.readFileSync(filePath, 'utf8');
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${path.basename(filePath)} matched ${pattern.source}`);
    }
  }
});
