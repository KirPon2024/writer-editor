const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildIdeaFixture({ addOriginLink = true } = {}) {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'idea-projection-project';
  const sceneId = 'scene-a';
  const text = 'The bridge becomes a promise when Mira refuses the crown.';
  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Idea Projection Fixture', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId, text },
    },
    {
      type: runtime.CORE_COMMAND_IDS.IDEA_CREATE,
      payload: {
        projectId,
        ideaId: 'idea-promise',
        title: 'Promise over crown',
        summary: 'Mira chooses obligation over power.',
      },
    },
  ]);
  assert.equal(created.ok, true);

  if (!addOriginLink) return { runtime, derived, projectId, sceneId, text, state: created.state };

  const startOffset = text.indexOf('promise');
  const linked = runtime.applyCoreSequence(created.state, [
    {
      type: runtime.CORE_COMMAND_IDS.IDEA_ORIGIN_LINK_ADD,
      payload: {
        projectId,
        ideaId: 'idea-promise',
        linkId: 'link-promise',
        originRef: {
          schemaVersion: derived.IDEA_ORIGIN_REF_SCHEMA_VERSION,
          kind: 'sceneTextRange',
          sceneId,
          startOffset,
          endOffset: startOffset + 'promise'.length,
          sourceHash: derived.hashCanonicalValue(text),
          targetId: 'idea-promise',
        },
      },
    },
  ]);
  assert.equal(linked.ok, true);
  return { runtime, derived, projectId, sceneId, text, state: linked.state };
}

test('E03 C02: idea commands persist author truth and explicit origin refs without changing scene text', async () => {
  const { projectId, sceneId, text, state } = await buildIdeaFixture({ addOriginLink: true });
  const reopened = JSON.parse(JSON.stringify(state));
  const project = reopened.data.projects[projectId];

  assert.equal(project.scenes[sceneId].text, text);
  assert.equal(project.ideas.schemaVersion, 'idea.author.v1');
  assert.deepEqual(project.ideas.ideas['idea-promise'], {
    id: 'idea-promise',
    title: 'Promise over crown',
    summary: 'Mira chooses obligation over power.',
    originLinkIds: ['link-promise'],
    createdByCommandSeq: 3,
    updatedByCommandSeq: 4,
  });
  assert.equal(project.ideas.originLinks['link-promise'].ideaId, 'idea-promise');
  assert.equal(project.ideas.originLinks['link-promise'].originRef.schemaVersion, 'idea.originRef.v1');
  assert.equal(project.ideas.originLinks['link-promise'].originRef.sceneId, sceneId);
  assert.equal(project.ideas.originLinks['link-promise'].createdByCommandSeq, 4);
  assert.equal(reopened.data.lastCommandId, 4);
  assert.equal(Object.prototype.hasOwnProperty.call(project.ideas.originLinks['link-promise'].originRef, 'quote'), false);
});

test('E03 C02: idea reducers fail closed for invalid payloads without mutation', async () => {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'idea-invalid-project';
  const sceneId = 'scene-a';
  const text = 'Visible text only becomes idea truth through commands.';
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

  const missingTitle = runtime.reduceCoreState(base.state, {
    type: runtime.CORE_COMMAND_IDS.IDEA_CREATE,
    payload: { projectId, ideaId: 'idea-empty', title: '   ' },
  });
  assert.equal(missingTitle.ok, false);
  assert.equal(missingTitle.error.code, 'E_IDEA_TITLE_REQUIRED');
  assert.equal(missingTitle.stateHash, beforeHash);

  const created = runtime.reduceCoreState(base.state, {
    type: runtime.CORE_COMMAND_IDS.IDEA_CREATE,
    payload: { projectId, ideaId: 'idea-one', title: 'One idea' },
  });
  assert.equal(created.ok, true);

  const duplicate = runtime.reduceCoreState(created.state, {
    type: runtime.CORE_COMMAND_IDS.IDEA_CREATE,
    payload: { projectId, ideaId: 'idea-one', title: 'Duplicate idea' },
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error.code, 'E_IDEA_ALREADY_EXISTS');
  assert.equal(duplicate.stateHash, runtime.hashCoreState(created.state));

  const badHash = runtime.reduceCoreState(created.state, {
    type: runtime.CORE_COMMAND_IDS.IDEA_ORIGIN_LINK_ADD,
    payload: {
      projectId,
      ideaId: 'idea-one',
      originRef: {
        schemaVersion: derived.IDEA_ORIGIN_REF_SCHEMA_VERSION,
        sceneId,
        startOffset: 0,
        endOffset: 7,
        sourceHash: '0'.repeat(64),
      },
    },
  });
  assert.equal(badHash.ok, false);
  assert.equal(badHash.error.code, 'E_IDEA_ORIGIN_REF_SOURCE_HASH_MISMATCH');
  assert.equal(badHash.stateHash, runtime.hashCoreState(created.state));

  const outOfBounds = runtime.reduceCoreState(created.state, {
    type: runtime.CORE_COMMAND_IDS.IDEA_ORIGIN_LINK_ADD,
    payload: {
      projectId,
      ideaId: 'idea-one',
      originRef: {
        schemaVersion: derived.IDEA_ORIGIN_REF_SCHEMA_VERSION,
        sceneId,
        startOffset: 0,
        endOffset: text.length + 1,
        sourceHash: derived.hashCanonicalValue(text),
      },
    },
  });
  assert.equal(outOfBounds.ok, false);
  assert.equal(outOfBounds.error.code, 'E_IDEA_ORIGIN_REF_RANGE_OUT_OF_BOUNDS');
  assert.equal(outOfBounds.stateHash, runtime.hashCoreState(created.state));
});

test('E03 C02: idea projection is deterministic and uses only explicit origin links as occurrence evidence', async () => {
  const { projectId, state, derived } = await buildIdeaFixture({ addOriginLink: true });
  const first = derived.deriveIdeaProjection({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { platformId: 'node', capabilities: { ideaProjection: true } },
  });
  const second = derived.deriveIdeaProjection({
    coreState: JSON.parse(JSON.stringify(state)),
    params: { projectId },
    capabilitySnapshot: { platformId: 'node', capabilities: { ideaProjection: true } },
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.value.schemaVersion, derived.IDEA_PROJECTION_SCHEMA_VERSION);
  assert.equal(first.value.meta.projectionHash, second.value.meta.projectionHash);
  assert.match(first.value.meta.projectionHash, /^[0-9a-f]{64}$/u);
  assert.equal(first.value.summary.ideaCount, 1);
  assert.equal(first.value.summary.originLinkCount, 1);
  assert.equal(first.value.summary.occurrenceEvidenceCount, 1);
  assert.equal(first.value.summary.automaticIdeaCount, 0);
  assert.equal(first.value.authority.sourceOfTruth, 'project.core.ideas');
  assert.equal(first.value.authority.commandAuthority, 'none');
  assert.equal(first.value.authority.automaticMining, false);
  assert.equal(first.value.authority.projectTruthMutation, false);
  assert.equal(first.value.authority.storageMutation, false);
  assert.equal(first.value.authority.networkMutation, false);
  assert.equal(first.value.occurrenceEvidence[0].evidenceKind, 'explicitOriginRef');
  assert.equal(first.value.occurrenceEvidence[0].authorPromotedTruth, true);
  assert.equal(Object.prototype.hasOwnProperty.call(first.value.occurrenceEvidence[0].originRef, 'quote'), false);
});

test('E03 C02: text occurrences alone never create idea truth or occurrence evidence', async () => {
  const { projectId, state, derived } = await buildIdeaFixture({ addOriginLink: false });
  const projection = derived.deriveIdeaProjection({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { platformId: 'node', capabilities: { ideaProjection: true } },
  });

  assert.equal(projection.ok, true);
  assert.equal(projection.value.summary.ideaCount, 1);
  assert.equal(projection.value.summary.originLinkCount, 0);
  assert.equal(projection.value.summary.occurrenceEvidenceCount, 0);
  assert.deepEqual(projection.value.occurrenceEvidence, []);
});

test('E03 C02: idea projection and commands fail closed through capability boundaries', async () => {
  const { runtime, projectId, state } = await buildIdeaFixture({ addOriginLink: false });
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const registryModule = await loadModule(path.join('src', 'renderer', 'commands', 'registry.mjs'));
  const runnerModule = await loadModule(path.join('src', 'renderer', 'commands', 'runCommand.mjs'));

  const missingProjectId = derived.deriveIdeaProjection({
    coreState: state,
    params: {},
    capabilitySnapshot: {},
  });
  assert.equal(missingProjectId.ok, false);
  assert.equal(missingProjectId.error.code, 'E_IDEA_PROJECT_ID_REQUIRED');

  const disabledProjection = derived.deriveIdeaProjection({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { capabilities: { ideaProjection: false } },
  });
  assert.equal(disabledProjection.ok, false);
  assert.equal(disabledProjection.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(disabledProjection.error.details.capabilityId, 'idea.projection');

  const capabilityPolicy = await loadModule(path.join('src', 'renderer', 'commands', 'capabilityPolicy.mjs'));
  const missingBinding = capabilityPolicy.enforceCapabilityForCommand('idea.unboundWrite', {}, { defaultPlatformId: 'node' });
  assert.equal(missingBinding.ok, false);
  assert.equal(missingBinding.error.code, 'E_CAPABILITY_ENFORCEMENT_MISSING');

  const registry = registryModule.createCommandRegistry();
  registry.registerCommand(runtime.CORE_COMMAND_IDS.IDEA_CREATE, (input) => {
    return runtime.reduceCoreState(input.state, {
      type: runtime.CORE_COMMAND_IDS.IDEA_CREATE,
      payload: input.payload,
    });
  });

  const webRunner = runnerModule.createCommandRunner(registry, {
    capability: { defaultPlatformId: 'web' },
  });
  const denied = await webRunner(runtime.CORE_COMMAND_IDS.IDEA_CREATE, {
    state,
    payload: { projectId, ideaId: 'idea-web', title: 'Web denied' },
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');

  const nodeRunner = runnerModule.createCommandRunner(registry, {
    capability: { defaultPlatformId: 'node', entitlementTier: 'free' },
  });
  const admitted = await nodeRunner(runtime.CORE_COMMAND_IDS.IDEA_CREATE, {
    state,
    payload: { projectId, ideaId: 'idea-node', title: 'Node admitted' },
  });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.state.data.projects[projectId].ideas.ideas['idea-node'].title, 'Node admitted');
});

test('E03 C02: idea author truth and projection add no storage, network, renderer, or UI bypass', () => {
  const sources = [
    path.join(process.cwd(), 'src', 'core', 'runtime.mjs'),
    path.join(process.cwd(), 'src', 'core', 'registry.ts'),
    path.join(process.cwd(), 'src', 'renderer', 'commands', 'capabilityPolicy.mjs'),
    path.join(process.cwd(), 'src', 'renderer', 'commands', 'localCapabilityProvider.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'idea', 'deriveIdeaProjection.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'idea', 'ideaProjectionTypes.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'idea', 'index.mjs'),
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
