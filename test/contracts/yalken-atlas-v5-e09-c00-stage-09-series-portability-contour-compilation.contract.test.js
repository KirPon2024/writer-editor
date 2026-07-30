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

function readSource(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(process.cwd(), relativePath));
}

function buildStage08GraphFixture() {
  const sourceRefs = [
    {
      schemaVersion: 'derived.atlas.globalCompositeSourceRef.v1',
      sourceRefId: 'global-source:atlas',
      sourceProjection: 'atlas.localGraph',
      sourceId: 'atlas',
      sourceHash: 'a'.repeat(64),
      readOnly: true,
      projectTruthMutation: false,
      storageMutation: false,
      sourceWriteBack: false,
    },
    {
      schemaVersion: 'derived.atlas.globalCompositeSourceRef.v1',
      sourceRefId: 'global-source:manual',
      sourceProjection: 'manualMap',
      sourceId: 'manual',
      sourceHash: 'm'.repeat(64),
      readOnly: true,
      projectTruthMutation: false,
      storageMutation: false,
      sourceWriteBack: false,
    },
  ];
  const nodes = [
    ['global:atlas:a', 'atlasEntity', 'atlas.localGraph', 'A', 'ALGORITHMIC_OBSERVATION', 'global-source:atlas'],
    ['global:atlas:b', 'atlasEntity', 'atlas.localGraph', 'B', 'ALGORITHMIC_OBSERVATION', 'global-source:atlas'],
    ['global:manual:a', 'manualMapNode', 'manualMap', 'Manual A', 'AUTHOR_CONFIRMED', 'global-source:manual'],
    ['global:manual:b', 'manualMapNode', 'manualMap', 'Manual B', 'AUTHOR_CONFIRMED', 'global-source:manual'],
  ].map(([nodeId, nodeKind, sourceProjection, label, trustState, sourceRefId]) => ({
    schemaVersion: 'derived.atlas.globalCompositeNode.v1',
    nodeId,
    nodeKind,
    sourceProjection,
    sourceId: nodeId,
    label,
    trustState,
    sourceRefIds: [sourceRefId],
  }));
  const edges = [
    ['edge-atlas', 'atlasCooccurrence', 'global:atlas:a', 'global:atlas:b', 'ALGORITHMIC_OBSERVATION', 'global-source:atlas'],
    ['edge-manual', 'manualMapEdge', 'global:manual:a', 'global:manual:b', 'AUTHOR_CONFIRMED', 'global-source:manual'],
    ['edge-cross', 'crossProjectionLink', 'global:atlas:a', 'global:manual:a', 'ALGORITHMIC_OBSERVATION', 'global-source:atlas'],
  ].map(([edgeId, edgeKind, fromNodeId, toNodeId, trustState, sourceRefId]) => ({
    schemaVersion: 'derived.atlas.globalCompositeEdge.v1',
    edgeId,
    edgeKind,
    fromNodeId,
    toNodeId,
    sourceProjection: 'stage09.fixture',
    sourceId: edgeId,
    trustState,
    sourceRefIds: [sourceRefId],
  }));
  return {
    schemaVersion: 'derived.atlas.globalCompositeGraph.v1',
    state: 'ready',
    projectId: 'stage09-handoff-project',
    sourceRefs,
    nodes,
    edges,
    authority: {
      sourceOfTruth: 'project.core via derived source projections',
      readModelOnly: true,
      commandAuthority: 'none',
      sourceProjectionWriteBack: false,
      projectTruthMutation: false,
      manuscriptMutation: false,
      storageMutation: false,
      networkMutation: false,
      rendererMutation: false,
      persistentDerivedTruth: false,
    },
    summary: {
      sourceProjectionCount: sourceRefs.length,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      crossProjectionEdgeCount: 1,
      compositeHash: '9'.repeat(64),
    },
    meta: {
      compositeHash: '9'.repeat(64),
      invalidationKey: 'stage09-handoff-fixture',
    },
  };
}

function buildStage08SchedulerAcceptance(graph) {
  return {
    accepted: true,
    requestId: 'stage09-handoff-request',
    projectId: graph.projectId,
    sourceRevision: graph.meta.compositeHash,
    generation: 1,
    trigger: { mode: 'explicitOpen' },
    published: {
      schemaVersion: graph.schemaVersion,
      compositeHash: graph.meta.compositeHash,
      sourceProjectionCount: graph.sourceRefs.length,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      persistentDerivedTruth: false,
    },
  };
}

test('E09 C00: Stage 08 acceptance hands off to Stage 09, not final Program DoD', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  assert.equal(
    derived.ATLAS_GLOBAL_COMPOSITE_STAGE_08_NEXT_CONTOUR,
    'E09_C00_STAGE_09_SERIES_AND_PORTABILITY_CONTOUR_COMPILATION',
  );

  const graph = buildStage08GraphFixture();
  const lodPlan = derived.buildAtlasGlobalCompositeGraphLodPlan({
    graph,
    limits: { maxNodes: 3, maxEdges: 2, labelNodeBudget: 2 },
  });
  const navigationPacket = derived.deriveAtlasGlobalCompositeGraphNavigationPacket({
    graph,
    trustFilter: { allowedTrustStates: ['AUTHOR_CONFIRMED', 'ALGORITHMIC_OBSERVATION'] },
    selectedNodeIds: ['global:manual:a', 'global:atlas:a'],
    batchLimit: 2,
  });
  const rendererAdapterProfile = derived.buildAtlasGlobalCompositeRendererAdapterProfilingPacket({
    graph,
    lodPlan,
    navigationPacket,
    metrics: {
      typingHotPathBudgetMs: 4,
      graphOpenBudgetMs: 32,
      typingHotPathMs: 0.2,
      graphProjectionMs: 9,
      adapterProjectionMs: 4,
    },
    graphWorkOnTypingHotPath: false,
  });
  const acceptance = derived.deriveAtlasGlobalCompositeStageAcceptance({
    graph,
    lodPlan,
    navigationPacket,
    schedulerAcceptance: buildStage08SchedulerAcceptance(graph),
    rendererAdapterProfile,
  });

  assert.equal(acceptance.state, 'ready');
  assert.equal(acceptance.handoff.nextContour, 'E09_C00_STAGE_09_SERIES_AND_PORTABILITY_CONTOUR_COMPILATION');
  assert.equal(acceptance.handoff.readyForFinalProgramDoD, false);
  assert.equal(acceptance.handoff.releaseReadinessClaim, false);
});

test('E09 C00: compilation receipt binds Stage 09 scope to a bounded linear queue', () => {
  const receipt = readReceipt('YALKEN_ATLAS_V5_E09_C00_STAGE_09_SERIES_PORTABILITY_CONTOUR_COMPILATION_RECEIPT.json');

  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.contourId, 'E09_C00_STAGE_09_SERIES_AND_PORTABILITY_CONTOUR_COMPILATION');
  assert.equal(receipt.programStage, 'E09_STAGE_09_SERIES_AND_PORTABILITY_CONTOURS');
  assert.equal(receipt.baseSha, '835d0a9d84438f6243a789f06a81f35547440998');
  assert.equal(receipt.designToolRouter, 'NOT_APPLICABLE');
  assert.equal(receipt.runtimeFacts.stage08AcceptanceExists, true);
  assert.equal(receipt.runtimeFacts.stage08HandoffTarget, 'E09_C00_STAGE_09_SERIES_AND_PORTABILITY_CONTOUR_COMPILATION');
  assert.equal(receipt.runtimeFacts.stage08FinalProgramDoDClaim, false);
  assert.equal(receipt.runtimeFacts.seriesAtlasExists, false);
  assert.equal(receipt.runtimeFacts.crossBookIdentityModelExists, false);
  assert.equal(receipt.runtimeFacts.customVocabularyModelExists, false);
  assert.equal(receipt.runtimeFacts.fullAtlasExportIrExists, false);
  assert.equal(receipt.runtimeFacts.atlasUnknownFieldPreservingPackageExists, false);
  assert.equal(receipt.runtimeFacts.stage09AcceptanceExists, false);

  assert.deepEqual(receipt.compiledQueue.map((row) => row.contourId), [
    'E09_C01_SERIES_ATLAS_PACKAGE_MANIFEST_AND_AUTONOMY_BOUNDARY',
    'E09_C02_CROSS_BOOK_IDENTITY_AND_VOCABULARY_PORTABILITY',
    'E09_C03_ATLAS_EXPORT_IR_READABLE_JSON_AND_UNKNOWN_FIELD_PRESERVATION',
    'E09_C04_GRAPH_PACKAGE_ARCHIVE_REPEAT_IMPORT_AND_LOSS_REPORT',
    'E09_C05_SAVED_VIEWS_BATCH_OPERATIONS_AND_STAGE_09_ACCEPTANCE',
  ]);

  for (const row of receipt.compiledQueue) {
    assert.ok(row.userOutcome);
    assert.ok(Array.isArray(row.scopeIn) && row.scopeIn.length > 0);
    assert.ok(Array.isArray(row.scopeOut));
    assert.ok(Array.isArray(row.expectedWriteSet) && row.expectedWriteSet.length > 0);
    assert.ok(Array.isArray(row.designRoute) && row.designRoute.length > 0);
    assert.ok(!row.contourId.includes('EFINAL'));
  }
  assert.equal(receipt.nextContour, 'E09_C01_SERIES_ATLAS_PACKAGE_MANIFEST_AND_AUTONOMY_BOUNDARY');
});

test('E09 C00: compiled queue covers series, portability, unknown fields, archive, loss, and acceptance gates', () => {
  const receipt = readReceipt('YALKEN_ATLAS_V5_E09_C00_STAGE_09_SERIES_PORTABILITY_CONTOUR_COMPILATION_RECEIPT.json');
  const allScope = receipt.compiledQueue.flatMap((row) => [...row.scopeIn, ...row.scopeOut, ...row.designRoute]);
  const requiredPhrases = [
    'series package manifest schema',
    'cross-book identity link schema',
    'custom entity vocabulary rows',
    'Command Kernel capability revalidation',
    'rollback and reopen validation',
    'unknown field preservation envelope',
    'graph package schema',
    'full archive integration proof',
    'full archive includes author truth, language tags, evidence identities, custom vocabularies, series references, and unknown fields',
    'Atlas image evidence adapter over versioned ExportIR graph package',
    'Atlas PDF evidence adapter over the existing local SVG and HTML print packet pattern',
    'derived data omitted only with deterministic rebuild proof and explicit loss report',
    'explicit loss report',
    'saved view portability packet',
    'batch operation preview rows',
    'batch apply Command Kernel boundary',
    'Stage 09 acceptance proof',
  ];
  for (const phrase of requiredPhrases) {
    assert.ok(allScope.some((item) => item.includes(phrase)), phrase);
  }

  assert.ok(receipt.stageScopeBinding.acceptance.includes('each book remains autonomous and can be opened without its series package'));
  assert.ok(receipt.stageScopeBinding.acceptance.includes('series links never silently rewrite project truth'));
  assert.ok(receipt.stageScopeBinding.acceptance.includes('round-trip preserves author data, language tags, evidence identity, and unknown fields'));
  assert.ok(receipt.stageScopeBinding.scopeOut.includes('collaboration transport'));
  assert.ok(receipt.stageScopeBinding.scopeOut.includes('platform certification'));
  assert.ok(receipt.stageScopeBinding.scopeOut.includes('final Program DoD'));
  assert.equal(receipt.handoffBinding.previousContour, 'E08_C05_RENDERER_ADAPTER_PROFILING_AND_STAGE_08_ACCEPTANCE');
  assert.equal(receipt.handoffBinding.finalProgramDoDClaim, false);
});

test('E09 C00: validation receipt cannot claim false green before evidence exists', () => {
  const receipt = readReceipt('YALKEN_ATLAS_V5_E09_C00_STAGE_09_SERIES_PORTABILITY_CONTOUR_COMPILATION_RECEIPT.json');
  for (const row of receipt.validation) {
    const summary = String(row.summary || '').toLowerCase();
    assert.ok(['PENDING', 'NOT_RUN', 'PASS'].includes(row.result), row.command);
    assert.ok(row.result !== 'PASS' || !summary.includes('pending'), row.command);
    assert.ok(row.result !== 'PASS' || !summary.includes('not_run'), row.command);
  }
});

test('E09 C00: factual runtime probes distinguish existing local portability from missing Stage 09 runtime', () => {
  assert.equal(fileExists('src/import/mindmap/v1/manualMapJsonRepeatImport.mjs'), true);
  assert.equal(fileExists('src/import/mindmap/v1/manualMapMarkdownPortabilityBridge.mjs'), true);
  assert.equal(fileExists('src/export/mindmap/v1/manualMapImagePdfExportEvidence.mjs'), true);
  assert.equal(fileExists('src/export/archive/projectArchiveExportHandler.js'), true);
  assert.equal(fileExists('src/derived/atlas/deriveAtlasReportsSavedQueries.mjs'), true);

  assert.equal(fileExists('src/derived/atlas/deriveAtlasSeriesPackage.mjs'), false);
  assert.equal(fileExists('src/core/atlasSeriesVocabulary.mjs'), false);
  assert.equal(fileExists('src/export/atlas/exportAtlasIrV1.mjs'), false);
  assert.equal(fileExists('src/import/atlas/importAtlasIrV1.mjs'), false);
  assert.equal(fileExists('src/derived/atlas/deriveAtlasStage09Acceptance.mjs'), false);
});

test('E09 C00: compilation receipt and contract sources stay local and non-runtime', () => {
  const sources = [
    'docs/OPS/STATUS/YALKEN_ATLAS_V5_E09_C00_STAGE_09_SERIES_PORTABILITY_CONTOUR_COMPILATION_RECEIPT.json',
    'test/contracts/yalken-atlas-v5-e09-c00-stage-09-series-portability-contour-compilation.contract.test.js',
  ].map((relativePath) => [path.basename(relativePath), readSource(relativePath)]);
  const forbiddenPatterns = [
    /networkMutation:\s*true/u,
    /runtimeDownload:\s*true/u,
    /dynamicExecutablePlugin:\s*true/u,
    /releaseReadinessClaim:\s*true/u,
    /projectTruthMutation:\s*true/u,
    /manuscriptMutation:\s*true/u,
    /storageMutation:\s*true/u,
    /rendererMutation:\s*true/u,
    /readyForFinalProgramDoD:\s*true/u,
  ];
  for (const [basename, source] of sources) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${basename} matched ${pattern.source}`);
    }
  }
});
