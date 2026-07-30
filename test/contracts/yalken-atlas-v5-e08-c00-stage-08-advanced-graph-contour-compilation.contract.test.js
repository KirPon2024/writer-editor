const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

function readReceipt(basename) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'docs', 'OPS', 'STATUS', basename), 'utf8'));
}

async function buildMinimalLanguageState() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const projectId = 'atlas-e08-c00-handoff-project';
  const sceneId = 'scene-a';
  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas E08 C00 handoff', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: {
        projectId,
        sceneId,
        text: 'Anna says hello. Затем Анна отвечает.',
      },
    },
  ]);
  assert.equal(created.ok, true);
  return { projectId, state: created.state };
}

test('E08 C00: Stage 07 language acceptance hands off to Stage 08, not final Program DoD', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const { projectId, state } = await buildMinimalLanguageState();
  const acceptance = derived.deriveAtlasLanguageStageAcceptance({
    coreState: state,
    params: { projectId, languageCodes: ['en', 'ru', 'he'] },
    capabilitySnapshot: {
      platformId: 'node',
      capabilities: {
        atlasLanguageStageAcceptance: true,
        atlasLanguageCapabilityReport: true,
        atlasMixedLanguageRouter: true,
      },
    },
  });

  assert.equal(acceptance.ok, true);
  assert.equal(acceptance.value.handoff.nextContour, 'E08_C00_STAGE_08_ADVANCED_GRAPH_CROSS_PROJECTION_CONTOUR_COMPILATION');
  assert.equal(acceptance.value.handoff.readyForFinalProgramDoD, false);
  assert.equal(acceptance.value.handoff.releaseReadinessClaim, false);
});

test('E08 C00: compilation receipt binds Stage 08 scope to a bounded linear queue', () => {
  const receipt = readReceipt('YALKEN_ATLAS_V5_E08_C00_STAGE_08_ADVANCED_GRAPH_CROSS_PROJECTION_CONTOUR_COMPILATION_RECEIPT.json');

  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.contourId, 'E08_C00_STAGE_08_ADVANCED_GRAPH_CROSS_PROJECTION_CONTOUR_COMPILATION');
  assert.equal(receipt.programStage, 'E08_STAGE_08_ADVANCED_GRAPH_CROSS_PROJECTION_CONTOURS');
  assert.equal(receipt.baseSha, 'b6bfc17f7e5088a4b4c7c7203f54671fb9455f22');
  assert.equal(receipt.designToolRouter, 'NOT_APPLICABLE');
  assert.equal(receipt.runtimeFacts.stage07HandoffCorrectedToE08, true);
  assert.equal(receipt.runtimeFacts.stage07FinalProgramDoDClaim, false);
  assert.equal(receipt.runtimeFacts.globalCompositeGraphExists, false);
  assert.equal(receipt.runtimeFacts.compositeModeExists, false);

  assert.deepEqual(receipt.compiledQueue.map((row) => row.contourId), [
    'E08_C01_GLOBAL_COMPOSITE_GRAPH_READ_MODEL_AND_SOURCE_ISOLATION',
    'E08_C02_GLOBAL_GRAPH_ON_DEMAND_IDLE_SCHEDULER_AND_STALE_DISCARD',
    'E08_C03_ADVANCED_LOD_STABLE_POSITIONS_AND_LARGE_GRAPH_BUDGET',
    'E08_C04_TRUST_FILTERS_BATCH_NAVIGATION_AND_ACCESSIBILITY_PARITY',
    'E08_C05_RENDERER_ADAPTER_PROFILING_AND_STAGE_08_ACCEPTANCE',
  ]);
  for (const row of receipt.compiledQueue) {
    assert.ok(row.userOutcome);
    assert.ok(Array.isArray(row.scopeIn) && row.scopeIn.length > 0);
    assert.ok(Array.isArray(row.scopeOut));
    assert.ok(Array.isArray(row.expectedWriteSet) && row.expectedWriteSet.length > 0);
    assert.ok(Array.isArray(row.designRoute) && row.designRoute.length > 0);
    assert.ok(!row.contourId.includes('EFINAL'));
  }
  assert.equal(receipt.nextContour, 'E08_C01_GLOBAL_COMPOSITE_GRAPH_READ_MODEL_AND_SOURCE_ISOLATION');
});

test('E08 C00: compiled queue covers Stage 08 acceptance gates without series collab platform or final scope', () => {
  const receipt = readReceipt('YALKEN_ATLAS_V5_E08_C00_STAGE_08_ADVANCED_GRAPH_CROSS_PROJECTION_CONTOUR_COMPILATION_RECEIPT.json');
  const allScope = receipt.compiledQueue.flatMap((row) => [...row.scopeIn, ...row.scopeOut, ...row.designRoute]);
  const requiredPhrases = [
    'composite graph schema',
    'on-demand open gate',
    'advanced LOD planner',
    'trust filter model',
    'renderer adapter profiling packet',
  ];
  for (const phrase of requiredPhrases) {
    assert.ok(allScope.some((item) => item.includes(phrase)), phrase);
  }
  assert.ok(receipt.stageScopeBinding.scopeOut.includes('series atlas packaging'));
  assert.ok(receipt.stageScopeBinding.scopeOut.includes('collaboration transport'));
  assert.ok(receipt.stageScopeBinding.scopeOut.includes('platform certification'));
  assert.ok(receipt.stageScopeBinding.scopeOut.includes('final Program DoD'));
  assert.equal(receipt.corrections[0].newHandoffTarget, 'E08_C00_STAGE_08_ADVANCED_GRAPH_CROSS_PROJECTION_CONTOUR_COMPILATION');
  assert.equal(receipt.corrections[0].finalProgramDoDClaim, false);
});

test('E08 C00: compilation receipt and contract sources stay local and non-runtime', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  assert.equal(derived.ATLAS_LANGUAGE_STAGE_HANDOFF_SCHEMA_VERSION, 'derived.atlas.languageStageHandoff.v1');

  const sources = [
    'docs/OPS/STATUS/YALKEN_ATLAS_V5_E08_C00_STAGE_08_ADVANCED_GRAPH_CROSS_PROJECTION_CONTOUR_COMPILATION_RECEIPT.json',
    'test/contracts/yalken-atlas-v5-e08-c00-stage-08-advanced-graph-contour-compilation.contract.test.js',
  ].map((relativePath) => [path.basename(relativePath), fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')]);
  const forbiddenPatterns = [
    /networkMutation:\s*true/u,
    /runtimeDownload:\s*true/u,
    /dynamicExecutablePlugin:\s*true/u,
    /releaseReadinessClaim:\s*true/u,
    /projectTruthMutation:\s*true/u,
    /manuscriptMutation:\s*true/u,
    /storageMutation:\s*true/u,
    /readyForFinalProgramDoD:\s*true/u,
  ];
  for (const [basename, source] of sources) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${basename} matched ${pattern.source}`);
    }
  }
});
