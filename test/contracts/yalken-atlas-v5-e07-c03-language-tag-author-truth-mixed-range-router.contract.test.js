const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildLanguageTagFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'atlas-language-tag-project';
  const sceneAId = 'scene-a';
  const sceneBId = 'scene-b';
  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas language tags', sceneId: sceneAId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: {
        projectId,
        sceneId: sceneAId,
        text: 'Anna says hello. Затем Анна отвечает. שלום נשאר כאן.',
      },
    },
  ]);
  assert.equal(created.ok, true);
  const state = JSON.parse(JSON.stringify(created.state));
  state.data.projects[projectId].languageCode = 'en';
  state.data.projects[projectId].scenes[sceneBId] = {
    id: sceneBId,
    title: 'Russian default scene',
    text: 'Анна пишет письмо, then adds an English note.',
  };
  return { runtime, derived, projectId, sceneAId, sceneBId, state };
}

function nodeCapabilitySnapshot() {
  return {
    platformId: 'node',
    capabilities: {
      atlasMixedLanguageRouter: true,
    },
  };
}

test('E07 C03: Atlas language tag commands persist author truth and route mixed ranges without manuscript mutation', async () => {
  const { runtime, derived, projectId, sceneAId, sceneBId, state } = await buildLanguageTagFixture();
  const sceneATextBefore = state.data.projects[projectId].scenes[sceneAId].text;
  const sceneBTextBefore = state.data.projects[projectId].scenes[sceneBId].text;
  const ruStart = sceneATextBefore.indexOf('Затем');
  const ruEnd = sceneATextBefore.indexOf('שלום') - 1;
  const heStart = sceneATextBefore.indexOf('שלום');
  const heEnd = sceneATextBefore.length;

  const tagged = runtime.applyCoreSequence(state, [
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET,
      payload: {
        projectId,
        scopeKind: 'project',
        languageCode: 'en',
        note: 'Project default is English.',
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET,
      payload: {
        projectId,
        scopeKind: 'scene',
        sceneId: sceneBId,
        languageCode: 'ru',
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET,
      payload: {
        projectId,
        scopeKind: 'range',
        sceneId: sceneAId,
        startOffset: ruStart,
        endOffset: ruEnd,
        languageCode: 'ru',
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET,
      payload: {
        projectId,
        scopeKind: 'range',
        sceneId: sceneAId,
        startOffset: heStart,
        endOffset: heEnd,
        languageCode: 'he',
      },
    },
  ]);
  assert.equal(tagged.ok, true);
  const reopened = JSON.parse(JSON.stringify(tagged.state));
  const project = reopened.data.projects[projectId];
  assert.equal(project.scenes[sceneAId].text, sceneATextBefore);
  assert.equal(project.scenes[sceneBId].text, sceneBTextBefore);
  assert.equal(project.atlas.languageTags.project.schemaVersion, derived.ATLAS_LANGUAGE_TAG_SCHEMA_VERSION);
  assert.equal(project.atlas.languageTags.project.languageCode, 'en');
  assert.equal(Object.keys(project.atlas.languageTags.ranges).length, 2);
  assert.match(project.atlas.languageTags.project.sourceHash, /^[0-9a-f]{64}$/u);

  const routed = derived.deriveAtlasMixedLanguageRouter({
    coreState: reopened,
    params: { projectId },
    capabilitySnapshot: nodeCapabilitySnapshot(),
  });
  assert.equal(routed.ok, true);
  assert.equal(routed.value.schemaVersion, derived.ATLAS_MIXED_LANGUAGE_ROUTER_SCHEMA_VERSION);
  assert.deepEqual(routed.value.surfaceManifest.commandIds, ['atlas.languageTag.set', 'atlas.languageTag.clear']);
  assert.equal(routed.value.authority.projectTruthMutation, false);
  assert.equal(routed.value.authority.manuscriptMutation, false);
  assert.equal(routed.value.authority.storageMutation, false);
  assert.equal(routed.value.authority.networkMutation, false);
  assert.equal(routed.value.authority.automaticLanguageDetection, false);
  assert.equal(routed.value.summary.languageTagCount, 4);
  assert.equal(routed.value.summary.englishFallbackCount, 0);
  assert.equal(routed.value.summary.deepRouteCount, 0);
  assert.equal(routed.value.summary.unsupportedExactOnlyRouteCount, 1);
  assert.ok(routed.value.routes.some((route) => route.sceneId === sceneAId && route.languageCode === 'ru' && route.policy.analysisMode === 'BASIC_EXACT_TERM'));
  const hebrewRoute = routed.value.routes.find((route) => route.sceneId === sceneAId && route.languageCode === 'he');
  assert.ok(hebrewRoute);
  assert.equal(hebrewRoute.policy.languagePolicy, derived.ATLAS_OBSERVATION_LANGUAGE_POLICY.UNSUPPORTED_EXACT_ONLY);
  assert.equal(hebrewRoute.policy.analysisMode, 'GLOBAL_EXACT_ONLY');
  assert.equal(hebrewRoute.policy.exactOnly, true);
  assert.equal(hebrewRoute.policy.englishFallback, false);
  assert.equal(hebrewRoute.adapterOffsetDomain, 'UTF16_JS_CODE_UNIT');
  assert.ok(Number.isInteger(hebrewRoute.codePointRange.start));
  assert.ok(Number.isInteger(hebrewRoute.graphemeRange.start));
  assert.ok(routed.value.routes.some((route) => route.sceneId === sceneBId && route.languageCode === 'ru'));
});

test('E07 C03: Atlas language tag commands fail closed for invalid ranges stale hashes and overlapping overrides', async () => {
  const { runtime, projectId, sceneAId, state } = await buildLanguageTagFixture();
  const beforeHash = runtime.hashCoreState(state);
  const text = state.data.projects[projectId].scenes[sceneAId].text;
  const invalid = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET,
    payload: {
      projectId,
      scopeKind: 'range',
      sceneId: sceneAId,
      startOffset: 10,
      endOffset: text.length + 10,
      languageCode: 'ru',
    },
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, 'E_ATLAS_LANGUAGE_TAG_RANGE_INVALID');
  assert.equal(invalid.stateHash, beforeHash);

  const saved = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET,
    payload: {
      projectId,
      scopeKind: 'range',
      sceneId: sceneAId,
      startOffset: 0,
      endOffset: 16,
      languageCode: 'en',
    },
  });
  assert.equal(saved.ok, true);
  const overlap = runtime.reduceCoreState(saved.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET,
    payload: {
      projectId,
      scopeKind: 'range',
      sceneId: sceneAId,
      startOffset: 8,
      endOffset: 24,
      languageCode: 'ru',
    },
  });
  assert.equal(overlap.ok, false);
  assert.equal(overlap.error.code, 'E_ATLAS_LANGUAGE_TAG_RANGE_OVERLAP');
  assert.equal(overlap.stateHash, runtime.hashCoreState(saved.state));

  const stale = runtime.reduceCoreState(saved.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_CLEAR,
    payload: {
      projectId,
      scopeKind: 'range',
      sceneId: sceneAId,
      startOffset: 0,
      endOffset: 16,
      expectedTagHash: 'deadbeef',
    },
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, 'E_ATLAS_LANGUAGE_TAG_STALE');
  assert.equal(stale.stateHash, runtime.hashCoreState(saved.state));

  const storedTag = Object.values(saved.state.data.projects[projectId].atlas.languageTags.ranges)[0];
  const cleared = runtime.reduceCoreState(saved.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_CLEAR,
    payload: {
      projectId,
      scopeKind: 'range',
      sceneId: sceneAId,
      startOffset: 0,
      endOffset: 16,
      expectedTagHash: runtime.hashCoreState(storedTag),
    },
  });
  assert.equal(cleared.ok, true);
  assert.equal(Object.keys(cleared.state.data.projects[projectId].atlas.languageTags.ranges).length, 0);
  assert.equal(cleared.state.data.projects[projectId].scenes[sceneAId].text, text);
});

test('E07 C03: Atlas language tag commands are admitted only through node capability revalidation', async () => {
  const { runtime, projectId, sceneAId, state } = await buildLanguageTagFixture();
  const registryModule = await loadModule(path.join('src', 'renderer', 'commands', 'registry.mjs'));
  const runnerModule = await loadModule(path.join('src', 'renderer', 'commands', 'runCommand.mjs'));
  const capabilityPolicy = await loadModule(path.join('src', 'renderer', 'commands', 'capabilityPolicy.mjs'));
  const localCapability = await loadModule(path.join('src', 'renderer', 'commands', 'localCapabilityProvider.mjs'));
  const registry = registryModule.createCommandRegistry();
  registry.registerCommand(runtime.CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET, (input) => {
    return runtime.reduceCoreState(input.state, {
      type: runtime.CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET,
      payload: input.payload,
    });
  });
  registry.registerCommand(runtime.CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_CLEAR, (input) => {
    return runtime.reduceCoreState(input.state, {
      type: runtime.CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_CLEAR,
      payload: input.payload,
    });
  });

  assert.equal(
    capabilityPolicy.CAPABILITY_BINDING[runtime.CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET],
    'cap.atlas.languageTag.edit',
  );
  const runner = runnerModule.createCommandRunner(registry, { capability: { defaultPlatformId: 'node' } });
  const accepted = await runner(runtime.CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET, {
    state,
    payload: {
      projectId,
      scopeKind: 'scene',
      sceneId: sceneAId,
      languageCode: 'en',
    },
    entitlementTier: localCapability.LOCAL_ENTITLEMENT_TIERS.FREE,
  });
  assert.equal(accepted.ok, true);

  const deniedRunner = runnerModule.createCommandRunner(registry, { capability: { defaultPlatformId: 'web' } });
  const denied = await deniedRunner(runtime.CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET, {
    state,
    payload: {
      projectId,
      scopeKind: 'scene',
      sceneId: sceneAId,
      languageCode: 'en',
    },
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
});

test('E07 C03: mixed-language router exports and side-effect boundaries remain pure', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  assert.equal(typeof derived.deriveAtlasMixedLanguageRouter, 'function');
  assert.equal(derived.ATLAS_LANGUAGE_TAG_SCOPE_KIND.RANGE, 'range');
  assert.equal(derived.ATLAS_MIXED_LANGUAGE_ROUTER_VIEW_ID, 'derived.atlas.mixedLanguageRouter.v1');

  const sourceFiles = [
    path.join('src', 'derived', 'atlas', 'deriveAtlasMixedLanguageRouter.mjs'),
    path.join('src', 'derived', 'atlas', 'atlasLanguageTagTypes.mjs'),
  ];
  for (const file of sourceFiles) {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    assert.doesNotMatch(source, /\bwriteFile(?:Sync)?\b/u);
    assert.doesNotMatch(source, /\bfetch\s*\(/u);
    assert.doesNotMatch(source, /\bXMLHttpRequest\b/u);
    assert.doesNotMatch(source, /\bipcRenderer\b/u);
    assert.doesNotMatch(source, /\bdispatchUiCommand\b/u);
    assert.doesNotMatch(source, /\bWorker\b/u);
    assert.doesNotMatch(source, /\bchild_process\b/u);
    assert.doesNotMatch(source, /\bimport\s*\(/u);
    assert.doesNotMatch(source, /englishFallback:\s*true/u);
    assert.doesNotMatch(source, /deepSupported:\s*true/u);
  }
});
