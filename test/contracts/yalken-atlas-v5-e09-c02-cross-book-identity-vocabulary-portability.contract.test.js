const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

function readSource(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readSource(relativePath));
}

function readReceipt(fileName) {
  return readJson(path.join('docs', 'OPS', 'STATUS', fileName));
}

async function buildSeriesFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'atlas-series-portability-project';
  const sceneId = 'scene-a';
  const text = 'Anna trusts Mira, and Mira protects Anna.';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas series', sceneId },
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
  return { runtime, derived, projectId, sceneId, text, state: built.state };
}

function buildPreviewInput({ derived, state, projectId }) {
  const annaHash = derived.hashCanonicalValue(state.data.projects[projectId].atlas.entities['entity-anna']);
  return {
    coreState: state,
    params: {
      projectId,
      seriesId: 'series-northern-letters',
      identityLinks: [
        {
          id: 'identity-link-anna',
          localEntityId: 'entity-anna',
          sharedIdentityId: 'series-person-anna',
          expectedEntityHash: annaHash,
          externalBookRefIds: ['series-book:volume-two'],
          aliases: ['Anna', 'A.'],
          evidenceIdentityHashes: ['0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'],
        },
      ],
      entityVocabularyRows: [
        {
          id: 'vocab-entity-character',
          label: 'Character',
          appliesTo: 'entityKind',
          aliases: ['Person'],
        },
      ],
      relationVocabularyRows: [
        {
          id: 'vocab-relation-ally',
          label: 'Ally',
          appliesTo: 'relationKind',
          aliases: ['Protector'],
        },
      ],
    },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasSeriesPortability: true } },
  };
}

test('E09 C02: preview builds a pathless apply plan with explicit collisions and no write authority', async () => {
  const { derived, projectId, state } = await buildSeriesFixture();
  const beforeHash = derived.hashCanonicalValue(state);
  const preview = derived.deriveAtlasSeriesPortabilityPreview(buildPreviewInput({ derived, state, projectId }));

  assert.equal(preview.ok, true);
  assert.equal(preview.value.schemaVersion, derived.ATLAS_SERIES_PORTABILITY_PREVIEW_SCHEMA_VERSION);
  assert.equal(preview.value.projectId, projectId);
  assert.equal(preview.value.applyAllowed, true);
  assert.equal(preview.value.summary.collisionCount, 0);
  assert.equal(preview.value.identityLinks[0].schemaVersion, derived.ATLAS_SERIES_IDENTITY_LINK_SCHEMA_VERSION);
  assert.equal(preview.value.entityVocabularyRows[0].schemaVersion, derived.ATLAS_CUSTOM_VOCABULARY_ROW_SCHEMA_VERSION);
  assert.equal(preview.value.relationVocabularyRows[0].vocabularyKind, 'relation');
  assert.equal(preview.value.applyInstructions.commandId, 'atlas.seriesPortability.apply');
  assert.equal(preview.value.applyInstructions.requiresAuthorConfirmation, true);
  assert.equal(preview.value.applyInstructions.noAutoMerge, true);
  assert.equal(preview.value.authority.previewOnly, true);
  assert.equal(preview.value.authority.projectTruthMutation, false);
  assert.equal(preview.value.authority.manuscriptMutation, false);
  assert.equal(preview.value.authority.storageMutation, false);
  assert.equal(preview.value.authority.networkMutation, false);
  assert.equal(derived.hashCanonicalValue(state), beforeHash);

  const colliding = derived.deriveAtlasSeriesPortabilityPreview({
    coreState: state,
    params: {
      projectId,
      identityLinks: [
        { id: 'identity-link-anna-a', localEntityId: 'entity-anna', sharedIdentityId: 'series-person-anna' },
        { id: 'identity-link-anna-b', localEntityId: 'entity-anna', sharedIdentityId: 'series-person-other' },
      ],
      entityVocabularyRows: [
        { id: 'vocab-character-a', label: 'Character' },
        { id: 'vocab-character-b', label: 'character' },
      ],
    },
  });
  assert.equal(colliding.ok, true);
  assert.equal(colliding.value.applyAllowed, false);
  assert.ok(colliding.value.collisionReport.some((row) => row.code === 'IDENTITY_LOCAL_COLLISION'));
  assert.ok(colliding.value.collisionReport.some((row) => row.code === 'VOCABULARY_LABEL_COLLISION'));
  assert.equal(colliding.value.collisionReport.every((row) => row.silent === false && row.blocksApply === true), true);

  const privateInput = derived.deriveAtlasSeriesPortabilityPreview({
    coreState: state,
    params: {
      projectId,
      identityLinks: [{ localEntityId: 'entity-anna', sharedIdentityId: 'series-person-anna', path: '/tmp/book.json' }],
    },
  });
  assert.equal(privateInput.ok, false);
  assert.equal(privateInput.error.reason, 'PRIVATE_FIELD_DENIED');
});

test('E09 C02: apply is Command Kernel gated and writes identity plus vocabulary without auto merge', async () => {
  const { runtime, derived, projectId, text, state } = await buildSeriesFixture();
  const registryModule = await loadModule(path.join('src', 'renderer', 'commands', 'registry.mjs'));
  const runnerModule = await loadModule(path.join('src', 'renderer', 'commands', 'runCommand.mjs'));
  const capabilityPolicy = await loadModule(path.join('src', 'renderer', 'commands', 'capabilityPolicy.mjs'));
  const localCapability = await loadModule(path.join('src', 'renderer', 'commands', 'localCapabilityProvider.mjs'));
  const preview = derived.deriveAtlasSeriesPortabilityPreview(buildPreviewInput({ derived, state, projectId }));
  assert.equal(preview.ok, true);

  const directWithoutConfirmation = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_SERIES_PORTABILITY_APPLY,
    payload: { projectId, previewPlan: preview.value, previewHash: preview.value.previewHash },
  });
  assert.equal(directWithoutConfirmation.ok, false);
  assert.equal(directWithoutConfirmation.error.code, 'E_ATLAS_SERIES_PORTABILITY_CONFIRMATION_REQUIRED');

  const registry = registryModule.createCommandRegistry();
  registry.registerCommand(runtime.CORE_COMMAND_IDS.ATLAS_SERIES_PORTABILITY_APPLY, (input) => {
    return runtime.reduceCoreState(input.state, {
      type: runtime.CORE_COMMAND_IDS.ATLAS_SERIES_PORTABILITY_APPLY,
      payload: input.payload,
    });
  });
  assert.equal(
    capabilityPolicy.CAPABILITY_BINDING[runtime.CORE_COMMAND_IDS.ATLAS_SERIES_PORTABILITY_APPLY],
    'cap.atlas.seriesPortability.apply',
  );
  assert.equal(
    localCapability.resolveCommandEntitlement(runtime.CORE_COMMAND_IDS.ATLAS_SERIES_PORTABILITY_APPLY, { entitlementTier: 'free' }).available,
    true,
  );

  const webRunner = runnerModule.createCommandRunner(registry, { capability: { defaultPlatformId: 'web' } });
  const denied = await webRunner(runtime.CORE_COMMAND_IDS.ATLAS_SERIES_PORTABILITY_APPLY, {
    state,
    payload: { projectId, previewPlan: preview.value, previewHash: preview.value.previewHash, authorConfirmed: true },
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');

  const nodeRunner = runnerModule.createCommandRunner(registry, { capability: { defaultPlatformId: 'node' } });
  const accepted = await nodeRunner(runtime.CORE_COMMAND_IDS.ATLAS_SERIES_PORTABILITY_APPLY, {
    state,
    payload: { projectId, previewPlan: preview.value, previewHash: preview.value.previewHash, authorConfirmed: true },
    entitlementTier: localCapability.LOCAL_ENTITLEMENT_TIERS.FREE,
  });
  assert.equal(accepted.ok, true);
  const atlas = accepted.state.data.projects[projectId].atlas;
  assert.equal(atlas.seriesIdentityLinks['identity-link-anna'].sharedIdentityId, 'series-person-anna');
  assert.equal(atlas.entityVocabulary['vocab-entity-character'].label, 'Character');
  assert.equal(atlas.relationVocabulary['vocab-relation-ally'].label, 'Ally');
  assert.equal(atlas.entities['entity-anna'].mergeState, undefined);
  assert.equal(accepted.state.data.projects[projectId].scenes['scene-a'].text, text);
  const operation = atlas.seriesPortabilityOperations[preview.value.operationId];
  assert.equal(operation.schemaVersion, derived.ATLAS_SERIES_PORTABILITY_APPLY_RECEIPT_SCHEMA_VERSION);
  assert.equal(operation.noAutoMerge, true);
  assert.equal(operation.rollbackProof.schemaVersion, derived.ATLAS_SERIES_PORTABILITY_ROLLBACK_PROOF_SCHEMA_VERSION);
  assert.equal(operation.rollbackProof.canRollback, true);
});

test('E09 C02: stale previews and unresolved collisions fail closed before project truth mutation', async () => {
  const { runtime, derived, projectId, state } = await buildSeriesFixture();
  const preview = derived.deriveAtlasSeriesPortabilityPreview(buildPreviewInput({ derived, state, projectId }));
  assert.equal(preview.ok, true);
  const changed = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_ALIAS_ADD,
    payload: { projectId, entityId: 'entity-anna', aliasId: 'alias-northern-anna', value: 'Northern Anna' },
  });
  assert.equal(changed.ok, true);
  const stale = runtime.reduceCoreState(changed.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_SERIES_PORTABILITY_APPLY,
    payload: { projectId, previewPlan: preview.value, previewHash: preview.value.previewHash, authorConfirmed: true },
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, 'E_ATLAS_SERIES_PORTABILITY_PREVIEW_STALE');
  assert.equal(stale.stateHash, runtime.hashCoreState(changed.state));

  const colliding = derived.deriveAtlasSeriesPortabilityPreview({
    coreState: state,
    params: {
      projectId,
      identityLinks: [
        { id: 'identity-link-missing', localEntityId: 'entity-missing', sharedIdentityId: 'series-person-missing' },
      ],
    },
  });
  assert.equal(colliding.ok, true);
  assert.equal(colliding.value.applyAllowed, false);
  const blocked = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_SERIES_PORTABILITY_APPLY,
    payload: { projectId, previewPlan: colliding.value, previewHash: colliding.value.previewHash, authorConfirmed: true },
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error.code, 'E_ATLAS_SERIES_PORTABILITY_COLLISIONS_UNRESOLVED');
  assert.equal(blocked.stateHash, runtime.hashCoreState(state));
});

test('E09 C02: rollback restores portability buckets after reopen validation and blocks stale repeat rollback', async () => {
  const { runtime, derived, projectId, state } = await buildSeriesFixture();
  const registryModule = await loadModule(path.join('src', 'renderer', 'commands', 'registry.mjs'));
  const runnerModule = await loadModule(path.join('src', 'renderer', 'commands', 'runCommand.mjs'));
  const preview = derived.deriveAtlasSeriesPortabilityPreview(buildPreviewInput({ derived, state, projectId }));
  assert.equal(preview.ok, true);
  const applied = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_SERIES_PORTABILITY_APPLY,
    payload: { projectId, previewPlan: preview.value, previewHash: preview.value.previewHash, authorConfirmed: true },
  });
  assert.equal(applied.ok, true);
  const reopened = JSON.parse(JSON.stringify(applied.state));
  const operation = reopened.data.projects[projectId].atlas.seriesPortabilityOperations[preview.value.operationId];
  assert.match(operation.rollbackProof.reopenValidationHash, /^[0-9a-f]{64}$/u);

  const registry = registryModule.createCommandRegistry();
  registry.registerCommand(runtime.CORE_COMMAND_IDS.ATLAS_SERIES_PORTABILITY_ROLLBACK, (input) => {
    return runtime.reduceCoreState(input.state, {
      type: runtime.CORE_COMMAND_IDS.ATLAS_SERIES_PORTABILITY_ROLLBACK,
      payload: input.payload,
    });
  });
  const nodeRunner = runnerModule.createCommandRunner(registry, { capability: { defaultPlatformId: 'node' } });
  const rolledBack = await nodeRunner(runtime.CORE_COMMAND_IDS.ATLAS_SERIES_PORTABILITY_ROLLBACK, {
    state: reopened,
    payload: {
      projectId,
      operationId: preview.value.operationId,
      expectedOperationHash: derived.hashCanonicalValue(operation),
      authorConfirmed: true,
    },
  });
  assert.equal(rolledBack.ok, true);
  const atlas = rolledBack.state.data.projects[projectId].atlas;
  assert.deepEqual(atlas.seriesIdentityLinks, {});
  assert.deepEqual(atlas.entityVocabulary, {});
  assert.deepEqual(atlas.relationVocabulary, {});
  assert.equal(atlas.seriesPortabilityOperations[preview.value.operationId].rollbackProof.restored, true);
  assert.equal(atlas.seriesPortabilityOperations[preview.value.operationId].rollbackProof.canRollback, false);

  const repeat = runtime.reduceCoreState(rolledBack.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_SERIES_PORTABILITY_ROLLBACK,
    payload: { projectId, operationId: preview.value.operationId, authorConfirmed: true },
  });
  assert.equal(repeat.ok, false);
  assert.equal(repeat.error.code, 'E_ATLAS_SERIES_PORTABILITY_OPERATION_ALREADY_RESTORED');
});

test('E09 C02: receipt and capability canon bind Command Kernel preview apply rollback scope', () => {
  const receipt = readReceipt('YALKEN_ATLAS_V5_E09_C02_CROSS_BOOK_IDENTITY_VOCABULARY_PORTABILITY_RECEIPT.json');
  const commandBinding = readJson(path.join('docs', 'OPS', 'STATUS', 'COMMAND_CAPABILITY_BINDING.json'));
  const commandRows = new Map(commandBinding.items.map((item) => [item.commandId, item.capabilityId]));

  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.contourId, 'E09_C02_CROSS_BOOK_IDENTITY_AND_VOCABULARY_PORTABILITY');
  assert.equal(receipt.baseSha, '08a79d005f93b1afbe088ee669b6ad0ebcac2ca0');
  assert.equal(receipt.designToolRouter, 'NOT_APPLICABLE');
  assert.equal(receipt.runtimeFacts.crossBookIdentityApplyExists, true);
  assert.equal(receipt.runtimeFacts.customVocabularyApplyExists, true);
  assert.equal(receipt.runtimeFacts.commandKernelCapabilityRevalidation, true);
  assert.equal(receipt.runtimeFacts.autoMerge, false);
  assert.equal(receipt.runtimeFacts.silentProjectRewrite, false);
  assert.ok(receipt.implementedBoundary.scopeIn.includes('conflict and collision report'));
  assert.ok(receipt.implementedBoundary.scopeIn.includes('rollback and reopen validation'));
  assert.ok(receipt.implementedBoundary.scopeOut.includes('network vocabulary registry'));
  assert.equal(receipt.nextContour, 'E09_C03_ATLAS_EXPORT_IR_READABLE_JSON_AND_UNKNOWN_FIELD_PRESERVATION');
  assert.equal(commandRows.get('atlas.seriesPortability.apply'), 'cap.atlas.seriesPortability.apply');
  assert.equal(commandRows.get('atlas.seriesPortability.rollback'), 'cap.atlas.seriesPortability.rollback');
});

test('E09 C02: exports and sources contain no storage network UI auto merge or bypass routes', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));

  assert.equal(derived.deriveAtlasSeriesPortabilityPreview, atlas.deriveAtlasSeriesPortabilityPreview);
  assert.equal(derived.ATLAS_SERIES_PORTABILITY_PREVIEW_SCHEMA_VERSION, 'derived.atlas.seriesPortabilityPreview.v1');
  assert.equal(runtime.CORE_COMMAND_IDS.ATLAS_SERIES_PORTABILITY_APPLY, 'atlas.seriesPortability.apply');
  assert.equal(runtime.CORE_COMMAND_IDS.ATLAS_SERIES_PORTABILITY_ROLLBACK, 'atlas.seriesPortability.rollback');

  const sources = [
    'src/derived/atlas/atlasSeriesPortabilityTypes.mjs',
    'src/derived/atlas/deriveAtlasSeriesPortabilityPreview.mjs',
    'src/derived/atlas/index.mjs',
    'src/derived/index.mjs',
    'src/core/runtime.mjs',
    'src/renderer/commands/capabilityPolicy.mjs',
  ];
  const forbidden = [
    /from\s+['"]node:fs['"]/u,
    /from\s+['"]node:child_process['"]/u,
    /from\s+['"]node:http['"]/u,
    /from\s+['"]node:https['"]/u,
    /from\s+['"]node:net['"]/u,
    /from\s+['"]electron['"]/u,
    /\bdocument\.(?:querySelector|querySelectorAll|createElement|body|addEventListener)\b/u,
    /querySelector/u,
    /new\s+Worker\b/u,
    /\bsetTimeout\b/u,
    /\bsetInterval\b/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
    /autoMerge:\s*true/u,
    /silentProjectRewrite:\s*true/u,
    /automaticManuscriptRewrite:\s*true/u,
    /networkMutation:\s*true/u,
    /rendererMutation:\s*true/u,
  ];
  for (const relativePath of sources) {
    const source = readSource(relativePath);
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${path.basename(relativePath)} matched ${pattern.source}`);
    }
  }
});
