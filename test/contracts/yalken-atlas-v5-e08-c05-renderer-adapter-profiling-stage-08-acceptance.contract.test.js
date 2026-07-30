const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

function buildGraph() {
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
    sourceProjection: 'stage08.fixture',
    sourceId: edgeId,
    trustState,
    sourceRefIds: [sourceRefId],
  }));
  return {
    schemaVersion: 'derived.atlas.globalCompositeGraph.v1',
    state: 'ready',
    projectId: 'stage08-acceptance-project',
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
      sourceProjectionCount: 2,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      crossProjectionEdgeCount: 1,
      compositeHash: '8'.repeat(64),
      sourceProjectionHashes: {
        atlas: 'a'.repeat(64),
        manual: 'm'.repeat(64),
      },
    },
    meta: {
      compositeHash: '8'.repeat(64),
      invalidationKey: 'stage08-acceptance-fixture',
    },
  };
}

function schedulerAcceptance(graph) {
  return {
    accepted: true,
    requestId: 'stage08-acceptance-request',
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

async function buildAcceptanceFixture(overrides = {}) {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const graph = buildGraph();
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
      typingHotPathMs: overrides.typingHotPathMs ?? 0.3,
      graphProjectionMs: 9,
      adapterProjectionMs: 4,
    },
    graphWorkOnTypingHotPath: overrides.graphWorkOnTypingHotPath === true,
  });
  const acceptance = derived.deriveAtlasGlobalCompositeStageAcceptance({
    graph,
    lodPlan,
    navigationPacket,
    schedulerAcceptance: schedulerAcceptance(graph),
    rendererAdapterProfile,
  });
  return { derived, graph, lodPlan, navigationPacket, rendererAdapterProfile, acceptance };
}

test('E08 C05: Stage 08 acceptance closes all advanced graph gates and hands off to Stage 09', async () => {
  const { derived, acceptance } = await buildAcceptanceFixture();

  assert.equal(acceptance.schemaVersion, derived.ATLAS_GLOBAL_COMPOSITE_STAGE_08_ACCEPTANCE_SCHEMA_VERSION);
  assert.equal(acceptance.stageId, derived.ATLAS_GLOBAL_COMPOSITE_STAGE_08_ID);
  assert.equal(acceptance.state, 'ready');
  assert.equal(acceptance.designToolRouter, 'NOT_APPLICABLE');
  assert.equal(acceptance.acceptanceProof.pass, true);
  assert.equal(acceptance.summary.gateCount, 6);
  assert.equal(acceptance.summary.passedGateCount, 6);
  assert.equal(acceptance.summary.stageAcceptance, 'pass');
  assert.deepEqual(acceptance.acceptanceProof.gates.map((gate) => gate.id), [
    'stage08-c01-global-composite-source-isolation',
    'stage08-c02-on-demand-idle-scheduler-stale-discard',
    'stage08-c03-lod-stable-position-budget',
    'stage08-c04-trust-navigation-accessibility-parity',
    'stage08-c05-renderer-adapter-profile-budget',
    'stage08-handoff-stage09-boundary',
  ]);
  assert.equal(acceptance.handoff.nextContour, derived.ATLAS_GLOBAL_COMPOSITE_STAGE_08_NEXT_CONTOUR);
  assert.equal(acceptance.handoff.readyForNextStage, true);
  assert.equal(acceptance.handoff.readyForFinalProgramDoD, false);
  assert.equal(acceptance.handoff.releaseReadinessClaim, false);
  assert.match(acceptance.acceptanceProof.proofHash, /^[0-9a-f]{64}$/u);
  assert.match(acceptance.meta.acceptanceHash, /^[0-9a-f]{64}$/u);
});

test('E08 C05: renderer adapter profile proves graph work stays off typing hot path', async () => {
  const { rendererAdapterProfile } = await buildAcceptanceFixture();

  assert.equal(rendererAdapterProfile.schemaVersion, 'atlas.globalCompositeGraph.rendererAdapterProfile.v1');
  assert.equal(rendererAdapterProfile.rendererAdapterRuntimeChanged, false);
  assert.equal(rendererAdapterProfile.graphWorkOnTypingHotPath, false);
  assert.equal(rendererAdapterProfile.withinBudget.typingHotPath, true);
  assert.equal(rendererAdapterProfile.withinBudget.graphOpen, true);
  assert.equal(rendererAdapterProfile.withinBudget.lodRenderAll, true);
  assert.equal(rendererAdapterProfile.withinBudget.accessibilityParity, true);
  assert.equal(rendererAdapterProfile.authority.rendererMutation, false);
  assert.equal(rendererAdapterProfile.authority.storageMutation, false);
  assert.equal(rendererAdapterProfile.authority.networkMutation, false);
});

test('E08 C05: typing hot-path regression degrades Stage 08 without claiming release readiness', async () => {
  const { acceptance } = await buildAcceptanceFixture({ graphWorkOnTypingHotPath: true, typingHotPathMs: 5 });
  const profileGate = acceptance.acceptanceProof.gates.find((gate) => gate.id === 'stage08-c05-renderer-adapter-profile-budget');

  assert.equal(acceptance.state, 'degraded');
  assert.equal(acceptance.acceptanceProof.pass, false);
  assert.equal(profileGate.status, 'DEGRADED');
  assert.equal(acceptance.handoff.readyForNextStage, false);
  assert.equal(acceptance.handoff.readyForFinalProgramDoD, false);
  assert.equal(acceptance.summary.releaseReadinessClaim, false);
});

test('E08 C05: stage acceptance exports through barrels and has no UI storage network or final DoD bypass', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));

  assert.equal(derived.deriveAtlasGlobalCompositeStageAcceptance, atlas.deriveAtlasGlobalCompositeStageAcceptance);
  assert.equal(derived.buildAtlasGlobalCompositeRendererAdapterProfilingPacket, atlas.buildAtlasGlobalCompositeRendererAdapterProfilingPacket);
  assert.equal(derived.ATLAS_GLOBAL_COMPOSITE_STAGE_08_NEXT_CONTOUR, 'E09_C00_STAGE_09_SERIES_AND_PORTABILITY_CONTOUR_COMPILATION');

  const sources = [
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'deriveAtlasGlobalCompositeStageAcceptance.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'deriveAtlasGlobalCompositeGraphNavigation.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'atlasGlobalCompositeGraphTypes.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'index.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'index.mjs'),
  ];
  const forbidden = [
    /from\s+['"]node:fs['"]/u,
    /from\s+['"]node:child_process['"]/u,
    /from\s+['"]node:http['"]/u,
    /from\s+['"]node:https['"]/u,
    /from\s+['"]node:net['"]/u,
    /from\s+['"]electron['"]/u,
    /document\./u,
    /querySelector/u,
    /new\s+Worker\b/u,
    /\bsetTimeout\b/u,
    /\bsetInterval\b/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
    /dispatchUiCommand/u,
    /sendCanonicalRuntimeCommand/u,
    /readyForFinalProgramDoD:\s*true/u,
    /releaseReadinessClaim:\s*true/u,
    /projectTruthMutation:\s*true/u,
    /manuscriptMutation:\s*true/u,
    /storageMutation:\s*true/u,
    /networkMutation:\s*true/u,
    /rendererMutation:\s*true/u,
  ];

  for (const sourcePath of sources) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${path.basename(sourcePath)} matched ${pattern.source}`);
    }
  }
});
