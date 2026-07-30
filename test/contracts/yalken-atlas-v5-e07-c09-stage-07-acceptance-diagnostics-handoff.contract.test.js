const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

function readLanguageFixture(basename) {
  return JSON.parse(fs.readFileSync(
    path.join(process.cwd(), 'test', 'fixtures', 'atlas', 'language', basename),
    'utf8',
  ));
}

function languageParams(projectId) {
  return {
    projectId,
    languageCodes: ['und', 'en', 'ru', 'de', 'es', 'fr', 'pl', 'zh', 'zh-hant', 'ja', 'ko', 'ar', 'he', 'hi'],
    basicLanguagePackCorpus: readLanguageFixture('basic-language-pack-certification-corpus.json'),
    complexScriptGuardCorpus: readLanguageFixture('complex-script-exact-only-guard-corpus.json'),
    deepFixtureCertificationCorpus: readLanguageFixture('ru-en-deep-fixture-certification-corpus.json'),
    rollbackLanguages: ['ru'],
  };
}

function nodeCapabilitySnapshot() {
  return {
    platformId: 'node',
    capabilities: {
      atlasLanguageCapabilityReport: true,
      atlasMixedLanguageRouter: true,
      atlasLanguageStageAcceptance: true,
    },
  };
}

async function buildStage07Fixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'atlas-stage-07-acceptance-project';
  const sceneAId = 'scene-a';
  const sceneBId = 'scene-b';
  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas Stage 07 acceptance', sceneId: sceneAId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: {
        projectId,
        sceneId: sceneAId,
        text: 'Anna says hello. Затем Анна отвечает. שלום נשאר כאן. Cafe\u0301 stays exact.',
      },
    },
  ]);
  assert.equal(created.ok, true);
  const state = JSON.parse(JSON.stringify(created.state));
  state.data.projects[projectId].languageCode = 'en';
  state.data.projects[projectId].scenes[sceneBId] = {
    id: sceneBId,
    title: 'Russian scene',
    text: 'Анна пишет письмо, then adds an English note.',
  };
  const sceneAText = state.data.projects[projectId].scenes[sceneAId].text;
  const ruStart = sceneAText.indexOf('Затем');
  const ruEnd = sceneAText.indexOf('שלום') - 1;
  const heStart = sceneAText.indexOf('שלום');
  const heEnd = sceneAText.indexOf('Cafe') - 1;
  const tagged = runtime.applyCoreSequence(state, [
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET,
      payload: {
        projectId,
        scopeKind: 'project',
        languageCode: 'en',
        note: 'Project default language for Stage 07 acceptance.',
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
  return { derived, projectId, state: tagged.state };
}

test('E07 C09: language stage acceptance packet closes Stage 07 with all gates passing', async () => {
  const { derived, projectId, state } = await buildStage07Fixture();
  const acceptance = derived.deriveAtlasLanguageStageAcceptance({
    coreState: state,
    params: languageParams(projectId),
    capabilitySnapshot: nodeCapabilitySnapshot(),
  });

  assert.equal(acceptance.ok, true);
  assert.equal(acceptance.value.schemaVersion, derived.ATLAS_LANGUAGE_STAGE_ACCEPTANCE_SCHEMA_VERSION);
  assert.equal(acceptance.value.stageId, 'E07_STAGE_07_LANGUAGE_EXPANSION_AND_DEEP_CONTOURS');
  assert.equal(acceptance.value.state, 'ready');
  assert.equal(acceptance.value.designToolRouter, 'NOT_APPLICABLE');
  assert.equal(acceptance.value.summary.gateCount, 8);
  assert.equal(acceptance.value.summary.passedGateCount, 8);
  assert.equal(acceptance.value.summary.stageAcceptance, 'pass');
  assert.equal(acceptance.value.summary.englishFallbackCount, 0);
  assert.equal(acceptance.value.summary.falseDeepClaimCount, 0);
  assert.equal(acceptance.value.acceptanceProof.pass, true);
  assert.match(acceptance.value.acceptanceProof.proofHash, /^[0-9a-f]{64}$/u);
  assert.match(acceptance.value.summary.acceptanceHash, /^[0-9a-f]{64}$/u);

  const gateIds = acceptance.value.acceptanceProof.gates.map((gate) => gate.id);
  assert.deepEqual(gateIds, [
    'stage07-c01-language-capability-truth',
    'stage07-c02-unicode-offset-domain',
    'stage07-c03-mixed-language-router',
    'stage07-c04-basic-language-pack-certification',
    'stage07-c05-complex-script-exact-only-guards',
    'stage07-c06-deep-engine-decision',
    'stage07-c07-ru-en-deep-fixture-certification',
    'stage07-c08-rollback-resource-isolation',
  ]);
  for (const gate of acceptance.value.acceptanceProof.gates) {
    assert.equal(gate.status, derived.ATLAS_LANGUAGE_STAGE_GATE_STATUS.PASS, gate.id);
  }
});

test('E07 C09: acceptance handoff stays local, read-only, and explicit about out-of-scope runtime claims', async () => {
  const { derived, projectId, state } = await buildStage07Fixture();
  const acceptance = derived.deriveAtlasLanguageStageAcceptance({
    coreState: state,
    params: languageParams(projectId),
    capabilitySnapshot: nodeCapabilitySnapshot(),
  });

  assert.equal(acceptance.ok, true);
  assert.equal(acceptance.value.handoff.schemaVersion, derived.ATLAS_LANGUAGE_STAGE_HANDOFF_SCHEMA_VERSION);
  assert.equal(acceptance.value.handoff.nextContour, 'E08_C00_STAGE_08_ADVANCED_GRAPH_CROSS_PROJECTION_CONTOUR_COMPILATION');
  assert.equal(acceptance.value.handoff.readyForNextStage, true);
  assert.equal(acceptance.value.handoff.readyForFinalProgramDoD, false);
  assert.equal(acceptance.value.handoff.releaseReadinessClaim, false);
  assert.ok(acceptance.value.handoff.remainingScopeOut.includes('production Deep runtime resources'));
  assert.ok(acceptance.value.handoff.remainingScopeOut.includes('network language service'));
  assert.equal(acceptance.value.handoff.handoffGuards.noNewDependency, true);
  assert.equal(acceptance.value.handoff.handoffGuards.noUiRuntimeChange, true);
  assert.equal(acceptance.value.handoff.handoffGuards.noProjectTruthMutation, true);
  assert.equal(acceptance.value.handoff.handoffGuards.noManuscriptMutation, true);
  assert.equal(acceptance.value.handoff.handoffGuards.noStorageMutation, true);
  assert.equal(acceptance.value.handoff.handoffGuards.noNetworkMutation, true);
  assert.equal(acceptance.value.handoff.handoffGuards.noRuntimeDownload, true);
  assert.equal(acceptance.value.handoff.handoffGuards.noDynamicExecutablePlugin, true);
  assert.equal(acceptance.value.sourceHashes.languageCapabilityReportHash.length, 64);
  assert.equal(acceptance.value.sourceHashes.mixedLanguageRouterHash.length, 64);
  assert.equal(acceptance.value.sourceHashes.rollbackHash.length, 64);
});

test('E07 C09: acceptance degrades honestly when RU Deep fixture metrics fail', async () => {
  const { derived, projectId, state } = await buildStage07Fixture();
  const params = languageParams(projectId);
  const ruCase = params.deepFixtureCertificationCorpus.cases.find((corpusCase) => corpusCase.languageCode === 'ru');
  ruCase.observed = ruCase.observed.filter((signal) => signal.kind !== 'coreference');
  const acceptance = derived.deriveAtlasLanguageStageAcceptance({
    coreState: state,
    params,
    capabilitySnapshot: nodeCapabilitySnapshot(),
  });

  assert.equal(acceptance.ok, true);
  assert.equal(acceptance.value.state, 'degraded');
  assert.equal(acceptance.value.acceptanceProof.pass, false);
  const deepGate = acceptance.value.acceptanceProof.gates.find((gate) => gate.id === 'stage07-c07-ru-en-deep-fixture-certification');
  const rollbackGate = acceptance.value.acceptanceProof.gates.find((gate) => gate.id === 'stage07-c08-rollback-resource-isolation');
  assert.equal(deepGate.status, derived.ATLAS_LANGUAGE_STAGE_GATE_STATUS.DEGRADED);
  assert.equal(rollbackGate.status, derived.ATLAS_LANGUAGE_STAGE_GATE_STATUS.PASS);
  assert.equal(acceptance.value.summary.certifiedDeepCount, 1);
  assert.equal(acceptance.value.summary.englishFallbackCount, 0);
  assert.equal(acceptance.value.handoff.readyForNextStage, false);
  assert.equal(acceptance.value.handoff.readyForFinalProgramDoD, false);
});

test('E07 C09: disabled language stage acceptance capability fails closed', async () => {
  const { derived, projectId, state } = await buildStage07Fixture();
  const acceptance = derived.deriveAtlasLanguageStageAcceptance({
    coreState: state,
    params: languageParams(projectId),
    capabilitySnapshot: {
      platformId: 'node',
      capabilities: {
        atlasLanguageStageAcceptance: false,
      },
    },
  });

  assert.equal(acceptance.ok, false);
  assert.equal(acceptance.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(acceptance.error.reason, 'ATLAS_LANGUAGE_STAGE_ACCEPTANCE_DISABLED');
});

test('E07 C09: exports are present and acceptance sources keep side-effect boundaries closed', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));

  assert.equal(derived.ATLAS_LANGUAGE_STAGE_ACCEPTANCE_SCHEMA_VERSION, 'derived.atlas.languageStageAcceptance.v1');
  assert.equal(derived.ATLAS_LANGUAGE_STAGE_ACCEPTANCE_PROOF_SCHEMA_VERSION, 'derived.atlas.languageStageAcceptanceProof.v1');
  assert.equal(derived.ATLAS_LANGUAGE_STAGE_HANDOFF_SCHEMA_VERSION, 'derived.atlas.languageStageHandoff.v1');
  assert.equal(derived.ATLAS_LANGUAGE_STAGE_GATE_STATUS.PASS, 'PASS');
  assert.equal(typeof derived.deriveAtlasLanguageStageAcceptance, 'function');
  assert.equal(typeof atlas.sortAtlasLanguageStageGates, 'function');

  const sources = [
    'src/derived/atlas/atlasLanguageStageAcceptanceTypes.mjs',
    'src/derived/atlas/deriveAtlasLanguageStageAcceptance.mjs',
  ].map((relativePath) => [path.basename(relativePath), fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')]);
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
    /\bdocument\./u,
    /fetch\s*\(/u,
    /WebAssembly/u,
    /\bWorker\b/u,
    /\bnew\s+Function\b/u,
    /\bimport\s*\(/u,
    /productionRuntimeClaim:\s*true/u,
    /releaseReadinessClaim:\s*true/u,
    /projectTruthMutation:\s*true/u,
    /manuscriptMutation:\s*true/u,
    /storageMutation:\s*true/u,
    /networkMutation:\s*true/u,
    /runtimeDownload:\s*true/u,
    /dynamicExecutablePlugin:\s*true/u,
  ];
  for (const [basename, source] of sources) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${basename} matched ${pattern.source}`);
    }
  }
});
