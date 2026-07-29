const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildProjectFixture({ withIdeaAndMeaning = false } = {}) {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'projection-inspector-project';
  const sceneId = 'scene-a';
  const text = '# Opening\nMira chooses duty over crown.';
  const baseCommands = [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Projection Inspector Fixture', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId, text },
    },
  ];
  const base = runtime.applyCoreSequence(runtime.createInitialCoreState(), baseCommands);
  assert.equal(base.ok, true);
  if (!withIdeaAndMeaning) return { runtime, derived, projectId, sceneId, text, state: base.state };

  const dutyStart = text.indexOf('duty');
  const authored = runtime.applyCoreSequence(base.state, [
    {
      type: runtime.CORE_COMMAND_IDS.IDEA_CREATE,
      payload: { projectId, ideaId: 'idea-duty', title: 'Duty over crown' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.IDEA_ORIGIN_LINK_ADD,
      payload: {
        projectId,
        ideaId: 'idea-duty',
        linkId: 'link-duty',
        originRef: {
          schemaVersion: derived.IDEA_ORIGIN_REF_SCHEMA_VERSION,
          kind: 'sceneTextRange',
          sceneId,
          startOffset: dutyStart,
          endOffset: dutyStart + 'duty'.length,
          sourceHash: derived.hashCanonicalValue(text),
          targetId: 'idea-duty',
        },
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MEANING_PROMOTE,
      payload: {
        projectId,
        meaningId: 'meaning-duty',
        title: 'Duty is chosen',
        interpretation: 'The passage explicitly frames duty as a choice.',
        source: { kind: 'idea', ideaId: 'idea-duty' },
      },
    },
  ]);
  assert.equal(authored.ok, true);
  return { runtime, derived, projectId, sceneId, text, state: authored.state };
}

test('E03 C05: projection inspector manifests are bounded, read-only, and deterministic', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const manifests = derived.createProjectionInspectorManifests();
  const again = derived.createProjectionInspectorManifests();

  assert.equal(manifests.length, 3);
  assert.deepEqual(manifests.map((item) => item.projectionId), ['idea', 'meaning', 'plot']);
  assert.deepEqual(manifests, again);
  assert.ok(manifests.every((item) => item.schemaVersion === derived.PROJECTION_INSPECTOR_MANIFEST_SCHEMA_VERSION));
  assert.ok(manifests.every((item) => item.readOnly === true));
  assert.ok(manifests.every((item) => item.commandAuthority === 'none'));
  assert.ok(manifests.every((item) => Array.isArray(item.allowedActions) && item.allowedActions.length === 0));
  assert.ok(manifests.every((item) => item.slots.some((slot) => slot.slotKind === 'fallbackState')));
  assert.ok(manifests.every((item) => item.fallback.empty.schemaVersion === derived.PROJECTION_INSPECTOR_FALLBACK_SCHEMA_VERSION));
  assert.ok(manifests.every((item) => item.fallback.unavailable.state === derived.PROJECTION_INSPECTOR_STATE.UNAVAILABLE));
  assert.ok(manifests.every((item) => item.authority.projectTruthMutation === false));
  assert.ok(manifests.every((item) => item.authority.storageMutation === false));
  assert.ok(manifests.every((item) => item.authority.networkMutation === false));
  assert.ok(manifests.every((item) => item.authority.rendererMutation === false));
});

test('E03 C05: inspector provider returns deterministic ready and empty fallback states', async () => {
  const { derived, projectId, state } = await buildProjectFixture({ withIdeaAndMeaning: false });
  const first = derived.deriveProjectionInspectorProvider({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { platformId: 'node', capabilities: { plotProjection: true, ideaProjection: true, meaningProjection: true } },
  });
  const second = derived.deriveProjectionInspectorProvider({
    coreState: JSON.parse(JSON.stringify(state)),
    params: { projectId },
    capabilitySnapshot: { platformId: 'node', capabilities: { plotProjection: true, ideaProjection: true, meaningProjection: true } },
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.value.schemaVersion, derived.PROJECTION_INSPECTOR_PROVIDER_SCHEMA_VERSION);
  assert.equal(first.value.meta.providerHash, second.value.meta.providerHash);
  assert.match(first.value.meta.providerHash, /^[0-9a-f]{64}$/u);
  assert.equal(first.value.authority.commandAuthority, 'none');
  assert.equal(first.value.authority.readOnlyProvider, true);
  assert.equal(first.value.authority.projectTruthMutation, false);
  assert.equal(first.value.authority.storageMutation, false);
  assert.equal(first.value.authority.networkMutation, false);
  assert.equal(first.value.summary.manifestCount, 3);
  assert.equal(first.value.summary.readyCount, 1);
  assert.equal(first.value.summary.emptyCount, 2);
  assert.equal(first.value.summary.unavailableCount, 0);

  const plot = first.value.projectionStates.find((item) => item.projectionId === 'plot');
  const idea = first.value.projectionStates.find((item) => item.projectionId === 'idea');
  const meaning = first.value.projectionStates.find((item) => item.projectionId === 'meaning');
  assert.equal(plot.state, derived.PROJECTION_INSPECTOR_STATE.READY);
  assert.equal(plot.fallbackCode, '');
  assert.equal(idea.state, derived.PROJECTION_INSPECTOR_STATE.EMPTY);
  assert.equal(idea.fallbackCode, 'IDEA_PROJECTION_EMPTY');
  assert.equal(meaning.state, derived.PROJECTION_INSPECTOR_STATE.EMPTY);
  assert.equal(meaning.fallbackCode, 'MEANING_PROJECTION_EMPTY');
  assert.ok(first.value.projectionStates.every((item) => /^[0-9a-f]{64}$/u.test(item.manifestHash)));
});

test('E03 C05: inspector provider reports ready authored projections without creating write authority', async () => {
  const { derived, projectId, state } = await buildProjectFixture({ withIdeaAndMeaning: true });
  const provider = derived.deriveProjectionInspectorProvider({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { platformId: 'node', capabilities: { plotProjection: true, ideaProjection: true, meaningProjection: true } },
  });

  assert.equal(provider.ok, true);
  assert.equal(provider.value.summary.readyCount, 3);
  assert.equal(provider.value.summary.emptyCount, 0);
  assert.equal(provider.value.summary.unavailableCount, 0);
  const idea = provider.value.projectionStates.find((item) => item.projectionId === 'idea');
  const meaning = provider.value.projectionStates.find((item) => item.projectionId === 'meaning');
  assert.equal(idea.itemCount, 1);
  assert.equal(meaning.itemCount, 1);
  assert.match(idea.projectionHash, /^[0-9a-f]{64}$/u);
  assert.match(meaning.projectionHash, /^[0-9a-f]{64}$/u);
  assert.ok(provider.value.manifests.every((manifest) => manifest.allowedActions.length === 0));
});

test('E03 C05: inspector provider fails closed at the provider boundary and maps source failures to unavailable fallback', async () => {
  const { runtime, derived, projectId, state } = await buildProjectFixture({ withIdeaAndMeaning: false });

  const missingProjectId = derived.deriveProjectionInspectorProvider({
    coreState: state,
    params: {},
    capabilitySnapshot: {},
  });
  assert.equal(missingProjectId.ok, false);
  assert.equal(missingProjectId.error.code, 'E_PROJECTION_INSPECTOR_PROJECT_ID_REQUIRED');

  const missingProject = derived.deriveProjectionInspectorProvider({
    coreState: runtime.createInitialCoreState(),
    params: { projectId: 'absent-project' },
    capabilitySnapshot: {},
  });
  assert.equal(missingProject.ok, true);
  assert.equal(missingProject.value.summary.unavailableCount, 3);
  assert.deepEqual(
    missingProject.value.projectionStates.map((item) => item.unavailableReason).sort(),
    ['E_IDEA_PROJECT_NOT_FOUND', 'E_MEANING_PROJECT_NOT_FOUND', 'E_PLOT_PROJECT_NOT_FOUND'],
  );

  const disabledPlot = derived.deriveProjectionInspectorProvider({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { capabilities: { plotProjection: false } },
  });
  assert.equal(disabledPlot.ok, true);
  const plot = disabledPlot.value.projectionStates.find((item) => item.projectionId === 'plot');
  assert.equal(plot.state, derived.PROJECTION_INSPECTOR_STATE.UNAVAILABLE);
  assert.equal(plot.fallbackCode, 'PLOT_PROJECTION_UNAVAILABLE');
  assert.equal(plot.unavailableReason, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
});

test('E03 C05: inspector provider exports through the derived barrel and adds no storage, network, renderer, or UI bypass', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projections = await loadModule(path.join('src', 'derived', 'projections', 'index.mjs'));
  assert.equal(derived.deriveProjectionInspectorProvider, projections.deriveProjectionInspectorProvider);
  assert.equal(derived.createProjectionInspectorManifests, projections.createProjectionInspectorManifests);
  assert.equal(derived.PROJECTION_INSPECTOR_PROVIDER_SCHEMA_VERSION, projections.PROJECTION_INSPECTOR_PROVIDER_SCHEMA_VERSION);

  const sources = [
    path.join(process.cwd(), 'src', 'derived', 'projections', 'projectionInspectorManifests.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'projections', 'projectionInspectorTypes.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'projections', 'index.mjs'),
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
