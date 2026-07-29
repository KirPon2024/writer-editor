const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildMeaningFixture({ promoteMeaning = true, sourceKind = 'idea' } = {}) {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'meaning-projection-project';
  const sceneId = 'scene-a';
  const text = 'Mira refuses the crown, so duty becomes a chosen meaning.';
  const commands = [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Meaning Projection Fixture', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId, text },
    },
    {
      type: runtime.CORE_COMMAND_IDS.IDEA_CREATE,
      payload: { projectId, ideaId: 'idea-duty', title: 'Chosen duty' },
    },
  ];
  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), commands);
  assert.equal(created.ok, true);
  if (!promoteMeaning) return { runtime, derived, projectId, sceneId, text, state: created.state };

  const source = sourceKind === 'sceneOriginRef'
    ? {
        kind: 'sceneOriginRef',
        originRef: {
          schemaVersion: derived.IDEA_ORIGIN_REF_SCHEMA_VERSION,
          kind: 'sceneTextRange',
          sceneId,
          startOffset: text.indexOf('duty'),
          endOffset: text.indexOf('duty') + 'duty'.length,
          sourceHash: derived.hashCanonicalValue(text),
          targetId: 'meaning-duty',
        },
      }
    : {
        kind: 'idea',
        ideaId: 'idea-duty',
      };
  const promoted = runtime.applyCoreSequence(created.state, [
    {
      type: runtime.CORE_COMMAND_IDS.MEANING_PROMOTE,
      payload: {
        projectId,
        meaningId: 'meaning-duty',
        title: 'Duty is chosen',
        interpretation: 'The scene frames obligation as an authored choice rather than fate.',
        source,
      },
    },
  ]);
  assert.equal(promoted.ok, true);
  return { runtime, derived, projectId, sceneId, text, state: promoted.state };
}

test('E03 C03: meaning.promote persists explicit author promotion without changing scene text', async () => {
  const { projectId, sceneId, text, state } = await buildMeaningFixture({ promoteMeaning: true });
  const reopened = JSON.parse(JSON.stringify(state));
  const project = reopened.data.projects[projectId];

  assert.equal(project.scenes[sceneId].text, text);
  assert.equal(project.meanings.schemaVersion, 'meaning.author.v1');
  assert.deepEqual(project.meanings.meanings['meaning-duty'], {
    id: 'meaning-duty',
    title: 'Duty is chosen',
    interpretation: 'The scene frames obligation as an authored choice rather than fate.',
    source: { kind: 'idea', ideaId: 'idea-duty' },
    promotionKind: 'explicitAuthorPromotion',
    createdByCommandSeq: 4,
    updatedByCommandSeq: 4,
  });
  assert.equal(reopened.data.lastCommandId, 4);
});

test('E03 C03: meaning promotion supports explicit scene origin refs without copying quote text', async () => {
  const { projectId, state } = await buildMeaningFixture({ promoteMeaning: true, sourceKind: 'sceneOriginRef' });
  const meaning = state.data.projects[projectId].meanings.meanings['meaning-duty'];
  assert.equal(meaning.source.kind, 'sceneOriginRef');
  assert.equal(meaning.source.originRef.schemaVersion, 'idea.originRef.v1');
  assert.equal(Object.prototype.hasOwnProperty.call(meaning.source.originRef, 'quote'), false);
  assert.match(meaning.source.originRef.sourceHash, /^[0-9a-f]{64}$/u);
});

test('E03 C03: meaning reducers fail closed without mutating state for invalid or stale promotion inputs', async () => {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'meaning-invalid-project';
  const sceneId = 'scene-a';
  const text = 'Interpretation is not automatic truth.';
  const base = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId, text },
    },
  ]);
  assert.equal(base.ok, true);
  const beforeHash = runtime.hashCoreState(base.state);

  const missingSource = runtime.reduceCoreState(base.state, {
    type: runtime.CORE_COMMAND_IDS.MEANING_PROMOTE,
    payload: {
      projectId,
      meaningId: 'meaning-empty',
      title: 'Empty',
      interpretation: 'Has no source.',
    },
  });
  assert.equal(missingSource.ok, false);
  assert.equal(missingSource.error.code, 'E_MEANING_PROMOTION_SOURCE_REQUIRED');
  assert.equal(missingSource.stateHash, beforeHash);

  const missingIdea = runtime.reduceCoreState(base.state, {
    type: runtime.CORE_COMMAND_IDS.MEANING_PROMOTE,
    payload: {
      projectId,
      meaningId: 'meaning-missing-idea',
      title: 'Missing idea',
      interpretation: 'Source idea does not exist.',
      source: { kind: 'idea', ideaId: 'idea-missing' },
    },
  });
  assert.equal(missingIdea.ok, false);
  assert.equal(missingIdea.error.code, 'E_MEANING_SOURCE_IDEA_NOT_FOUND');
  assert.equal(missingIdea.stateHash, beforeHash);

  const staleHash = runtime.reduceCoreState(base.state, {
    type: runtime.CORE_COMMAND_IDS.MEANING_PROMOTE,
    payload: {
      projectId,
      meaningId: 'meaning-stale',
      title: 'Stale origin',
      interpretation: 'Origin hash is stale.',
      source: {
        kind: 'sceneOriginRef',
        originRef: {
          schemaVersion: derived.IDEA_ORIGIN_REF_SCHEMA_VERSION,
          sceneId,
          startOffset: 0,
          endOffset: 14,
          sourceHash: '1'.repeat(64),
        },
      },
    },
  });
  assert.equal(staleHash.ok, false);
  assert.equal(staleHash.error.code, 'E_MEANING_ORIGIN_REF_SOURCE_HASH_MISMATCH');
  assert.equal(staleHash.stateHash, beforeHash);
});

test('E03 C03: meaning projection is deterministic and contains only explicit promotion evidence', async () => {
  const { projectId, state, derived } = await buildMeaningFixture({ promoteMeaning: true });
  const first = derived.deriveMeaningProjection({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { platformId: 'node', capabilities: { meaningProjection: true } },
  });
  const second = derived.deriveMeaningProjection({
    coreState: JSON.parse(JSON.stringify(state)),
    params: { projectId },
    capabilitySnapshot: { platformId: 'node', capabilities: { meaningProjection: true } },
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.value.schemaVersion, derived.MEANING_PROJECTION_SCHEMA_VERSION);
  assert.equal(first.value.meta.projectionHash, second.value.meta.projectionHash);
  assert.match(first.value.meta.projectionHash, /^[0-9a-f]{64}$/u);
  assert.equal(first.value.summary.meaningCount, 1);
  assert.equal(first.value.summary.promotionEvidenceCount, 1);
  assert.equal(first.value.summary.automaticMeaningCount, 0);
  assert.equal(first.value.authority.sourceOfTruth, 'project.core.meanings');
  assert.equal(first.value.authority.commandAuthority, 'none');
  assert.equal(first.value.authority.automaticInference, false);
  assert.equal(first.value.authority.projectTruthMutation, false);
  assert.equal(first.value.authority.storageMutation, false);
  assert.equal(first.value.authority.networkMutation, false);
  assert.equal(first.value.promotionEvidence[0].evidenceKind, 'explicitAuthorPromotion');
  assert.equal(first.value.promotionEvidence[0].authorPromotedTruth, true);
});

test('E03 C03: text and idea objects alone never create meaning truth', async () => {
  const { projectId, state, derived } = await buildMeaningFixture({ promoteMeaning: false });
  const projection = derived.deriveMeaningProjection({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { platformId: 'node', capabilities: { meaningProjection: true } },
  });

  assert.equal(projection.ok, true);
  assert.equal(projection.value.summary.meaningCount, 0);
  assert.equal(projection.value.summary.promotionEvidenceCount, 0);
  assert.equal(projection.value.summary.automaticMeaningCount, 0);
  assert.deepEqual(projection.value.meanings, []);
});

test('E03 C03: meaning projection and command fail closed through capability boundaries', async () => {
  const { runtime, projectId, state } = await buildMeaningFixture({ promoteMeaning: false });
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const registryModule = await loadModule(path.join('src', 'renderer', 'commands', 'registry.mjs'));
  const runnerModule = await loadModule(path.join('src', 'renderer', 'commands', 'runCommand.mjs'));

  const disabledProjection = derived.deriveMeaningProjection({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { capabilities: { meaningProjection: false } },
  });
  assert.equal(disabledProjection.ok, false);
  assert.equal(disabledProjection.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(disabledProjection.error.details.capabilityId, 'meaning.projection');

  const capabilityPolicy = await loadModule(path.join('src', 'renderer', 'commands', 'capabilityPolicy.mjs'));
  const missingBinding = capabilityPolicy.enforceCapabilityForCommand('meaning.unboundWrite', {}, { defaultPlatformId: 'node' });
  assert.equal(missingBinding.ok, false);
  assert.equal(missingBinding.error.code, 'E_CAPABILITY_ENFORCEMENT_MISSING');

  const registry = registryModule.createCommandRegistry();
  registry.registerCommand(runtime.CORE_COMMAND_IDS.MEANING_PROMOTE, (input) => {
    return runtime.reduceCoreState(input.state, {
      type: runtime.CORE_COMMAND_IDS.MEANING_PROMOTE,
      payload: input.payload,
    });
  });
  const payload = {
    projectId,
    meaningId: 'meaning-node',
    title: 'Node admitted',
    interpretation: 'Capability gate admits local node promotion.',
    source: { kind: 'idea', ideaId: 'idea-duty' },
  };

  const webRunner = runnerModule.createCommandRunner(registry, {
    capability: { defaultPlatformId: 'web' },
  });
  const denied = await webRunner(runtime.CORE_COMMAND_IDS.MEANING_PROMOTE, { state, payload });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');

  const nodeRunner = runnerModule.createCommandRunner(registry, {
    capability: { defaultPlatformId: 'node', entitlementTier: 'free' },
  });
  const admitted = await nodeRunner(runtime.CORE_COMMAND_IDS.MEANING_PROMOTE, { state, payload });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.state.data.projects[projectId].meanings.meanings['meaning-node'].title, 'Node admitted');
});

test('E03 C03: meaning boundary adds no storage, network, renderer, or UI bypass', () => {
  const sources = [
    path.join(process.cwd(), 'src', 'core', 'runtime.mjs'),
    path.join(process.cwd(), 'src', 'core', 'registry.ts'),
    path.join(process.cwd(), 'src', 'renderer', 'commands', 'capabilityPolicy.mjs'),
    path.join(process.cwd(), 'src', 'renderer', 'commands', 'localCapabilityProvider.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'meaning', 'deriveMeaningProjection.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'meaning', 'meaningProjectionTypes.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'meaning', 'index.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'index.mjs'),
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
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
    /\baddEventListener\s*\(/u,
    /dispatchUiCommand/u,
  ];

  for (const sourcePath of sources) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${path.basename(sourcePath)} matched ${pattern.source}`);
    }
  }
});
