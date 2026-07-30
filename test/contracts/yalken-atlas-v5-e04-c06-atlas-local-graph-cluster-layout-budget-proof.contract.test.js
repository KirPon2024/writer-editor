const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildAtlasGraphFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const projectId = 'atlas-local-graph-project';
  const sceneAId = 'scene-a';
  const sceneBId = 'scene-b';
  const sceneCId = 'scene-c';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas graph', sceneId: sceneAId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId: sceneAId, text: 'Anna met Mira.' },
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
  const state = JSON.parse(JSON.stringify(built.state));
  state.data.projects[projectId].scenes[sceneBId] = {
    id: sceneBId,
    title: 'Second',
    text: 'Anna waited.',
  };
  state.data.projects[projectId].scenes[sceneCId] = {
    id: sceneCId,
    title: 'Third',
    text: 'Mira met Anna again.',
  };
  return { projectId, state };
}

function buildLargeLocalGraphFixture(count = 10000) {
  const nodes = [];
  const edges = [];
  const nodeIds = [];
  const edgeIds = [];
  for (let index = 0; index < count; index += 1) {
    const entityId = `entity-${String(index).padStart(5, '0')}`;
    const nodeId = `atlas-entity:${entityId}`;
    nodes.push({
      schemaVersion: 'derived.atlas.localGraphNode.v1',
      nodeId,
      nodeKind: 'entity',
      entityId,
      label: `Entity ${index}`,
      entityKind: 'character',
      appearanceCount: index % 7,
      sceneCount: 1,
      firstSceneId: 'scene-a',
      lastSceneId: 'scene-a',
      evidenceAnchorIds: [`anchor-${index}`],
    });
    nodeIds.push(nodeId);
    if (index > 0) {
      const leftNodeId = `atlas-entity:entity-${String(index - 1).padStart(5, '0')}`;
      const edgeId = `atlas-local-edge:${String(index).padStart(5, '0')}`;
      edges.push({
        schemaVersion: 'derived.atlas.localGraphEdge.v1',
        edgeId,
        edgeKind: 'cooccurrence',
        leftNodeId,
        rightNodeId: nodeId,
        leftEntityId: `entity-${String(index - 1).padStart(5, '0')}`,
        rightEntityId: entityId,
        weight: 1,
        occurrenceCount: 1,
        sceneIds: ['scene-a'],
        evidenceAnchorIds: [`anchor-${index - 1}`, `anchor-${index}`],
      });
      edgeIds.push(edgeId);
    }
  }
  return {
    schemaVersion: 'derived.atlas.localGraph.v1',
    state: nodes.length > 0 ? 'ready' : 'empty',
    projectId: 'large-atlas-graph-project',
    authority: {
      sourceOfTruth: 'derived.atlas.temporalContinuity.v1',
      readModelOnly: true,
      commandAuthority: 'none',
      projectTruthMutation: false,
      storageMutation: false,
      networkMutation: false,
      persistentDerivedTruth: false,
    },
    summary: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      clusterCount: nodes.length > 0 ? 1 : 0,
      graphHash: '',
    },
    nodes,
    edges,
    clusters: nodes.length > 0
      ? [{
        schemaVersion: 'derived.atlas.localGraphCluster.v1',
        clusterId: 'atlas-local-cluster:large-line',
        ordinal: 0,
        clusterKind: 'connectedComponent',
        nodeIds,
        edgeIds,
        nodeCount: nodeIds.length,
        edgeCount: edgeIds.length,
      }]
      : [],
  };
}

test('E04 C06: local Atlas graph packet is deterministic and derived from temporal continuity only', async () => {
  const { projectId, state } = await buildAtlasGraphFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const before = JSON.stringify(state);
  const first = derived.deriveAtlasLocalGraph({ coreState: state, params: { projectId, languageCode: 'en' } });
  const second = derived.deriveAtlasLocalGraph({ coreState: JSON.parse(JSON.stringify(state)), params: { projectId, languageCode: 'en' } });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.value.schemaVersion, derived.ATLAS_LOCAL_GRAPH_SCHEMA_VERSION);
  assert.equal(first.value.state, 'ready');
  assert.equal(first.value.summary.nodeCount, 2);
  assert.equal(first.value.summary.edgeCount, 1);
  assert.equal(first.value.summary.clusterCount, 1);
  assert.equal(first.value.summary.graphHash, second.value.summary.graphHash);
  assert.equal(first.meta.outputHash, second.meta.outputHash);
  assert.deepEqual(first.value.authority, {
    sourceOfTruth: 'derived.atlas.temporalContinuity.v1',
    readModelOnly: true,
    commandAuthority: 'none',
    projectTruthMutation: false,
    storageMutation: false,
    networkMutation: false,
    persistentDerivedTruth: false,
  });
  assert.deepEqual(first.value.nodes.map((node) => [node.schemaVersion, node.entityId]), [
    [derived.ATLAS_LOCAL_GRAPH_NODE_SCHEMA_VERSION, 'entity-anna'],
    [derived.ATLAS_LOCAL_GRAPH_NODE_SCHEMA_VERSION, 'entity-mira'],
  ]);
  assert.equal(first.value.edges[0].schemaVersion, derived.ATLAS_LOCAL_GRAPH_EDGE_SCHEMA_VERSION);
  assert.equal(first.value.clusters[0].schemaVersion, derived.ATLAS_LOCAL_GRAPH_CLUSTER_SCHEMA_VERSION);
  assert.equal(JSON.stringify(state), before);
});

test('E04 C06: cluster layout planner proves 10k resource budget without render-all', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const graph = buildLargeLocalGraphFixture();
  const before = JSON.stringify(graph);
  const job = derived.createAtlasLocalGraphLayoutJob({
    graph,
    limits: { maxNodes: 320, maxEdges: 240, maxClusters: 8, clusterColumnSize: 20 },
    focusNodeIds: ['atlas-entity:entity-09999'],
    sequence: 3,
  });
  assert.equal(job.ok, true);
  assert.equal(job.value.schemaVersion, derived.ATLAS_LOCAL_GRAPH_LAYOUT_JOB_SCHEMA_VERSION);
  assert.match(job.value.requestId, /^atlas-local-graph-layout-request:/u);
  assert.deepEqual(job.value.adapter.authority, {
    filesystem: false,
    network: false,
    writer: false,
    projectMutation: false,
    persistentDerivedTruth: false,
    workerScheduling: false,
  });

  const result = derived.runAtlasLocalGraphLayoutJob(job.value);
  const accepted = derived.acceptAtlasLocalGraphLayoutResult({
    activeJob: job.value,
    result: result.value,
    currentGraph: graph,
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.schemaVersion, derived.ATLAS_LOCAL_GRAPH_LAYOUT_RESULT_SCHEMA_VERSION);
  assert.equal(result.value.layoutPlan.schemaVersion, derived.ATLAS_LOCAL_GRAPH_LAYOUT_PLAN_SCHEMA_VERSION);
  assert.equal(result.value.resourceBudgetProof.schemaVersion, derived.ATLAS_LOCAL_GRAPH_RESOURCE_BUDGET_PROOF_SCHEMA_VERSION);
  assert.equal(result.value.resourceBudgetProof.input.nodes, 10000);
  assert.equal(result.value.resourceBudgetProof.input.edges, 9999);
  assert.equal(result.value.resourceBudgetProof.largeProject.nodeThresholdMet, true);
  assert.equal(result.value.resourceBudgetProof.largeProject.edgeThresholdMet, true);
  assert.equal(result.value.resourceBudgetProof.withinBudget.nodes, true);
  assert.equal(result.value.resourceBudgetProof.withinBudget.edges, true);
  assert.equal(result.value.resourceBudgetProof.renderAll.nodes, false);
  assert.equal(result.value.resourceBudgetProof.renderAll.edges, false);
  assert.equal(result.value.layoutPlan.nodes.length <= 320, true);
  assert.equal(result.value.layoutPlan.edges.length <= 240, true);
  assert.equal(result.value.layoutPlan.nodes[0].nodeId, 'atlas-entity:entity-09999');
  assert.match(result.value.resultHash, /^[0-9a-f]{64}$/u);
  assert.match(result.value.resourceBudgetProof.meta.resourceBudgetProofHash, /^[0-9a-f]{64}$/u);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.value.published.persistentDerivedTruth, false);
  assert.equal(Object.hasOwn(accepted.value.published, 'layoutPlan'), false);
  assert.equal(JSON.stringify(graph), before);
});

test('E04 C06: stale cluster layout results fail closed on graph revision or request mismatch', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const graph = buildLargeLocalGraphFixture(60);
  const job = derived.createAtlasLocalGraphLayoutJob({
    graph,
    limits: { maxNodes: 16, maxEdges: 12 },
    sequence: 1,
  }).value;
  const result = derived.runAtlasLocalGraphLayoutJob(job).value;
  const changedGraph = {
    ...graph,
    nodes: graph.nodes.map((node) => (node.nodeId === 'atlas-entity:entity-00003' ? { ...node, label: 'Changed' } : node)),
  };
  const staleSource = derived.acceptAtlasLocalGraphLayoutResult({
    activeJob: job,
    result,
    currentGraph: changedGraph,
  });
  const nextJob = derived.createAtlasLocalGraphLayoutJob({
    graph,
    limits: { maxNodes: 16, maxEdges: 12 },
    sequence: 2,
  }).value;
  const staleIdentity = derived.acceptAtlasLocalGraphLayoutResult({
    activeJob: nextJob,
    result,
    currentGraph: graph,
  });

  assert.equal(staleSource.ok, false);
  assert.equal(staleSource.error.code, 'E_ATLAS_LOCAL_GRAPH_STALE_LAYOUT_RESULT');
  assert.equal(staleSource.error.reason, 'STALE_LAYOUT_RESULT_SOURCE_REVISION');
  assert.equal(staleIdentity.ok, false);
  assert.equal(staleIdentity.error.code, 'E_ATLAS_LOCAL_GRAPH_STALE_LAYOUT_RESULT');
  assert.equal(staleIdentity.error.reason, 'STALE_LAYOUT_RESULT_IDENTITY_MISMATCH');
  assert.deepEqual(staleIdentity.error.details.mismatches, ['requestId', 'generation']);
});

test('E04 C06: local graph has deterministic empty and unavailable fallbacks', async () => {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'atlas-empty-local-graph-project';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Empty Atlas graph', sceneId: 'scene-empty' },
    },
  ]);
  assert.equal(built.ok, true);

  const empty = derived.deriveAtlasLocalGraph({ coreState: built.state, params: { projectId, languageCode: 'en' } });
  const missingProjectId = derived.deriveAtlasLocalGraph({ coreState: built.state, params: {} });
  const disabled = derived.deriveAtlasLocalGraph({
    coreState: built.state,
    params: { projectId, languageCode: 'en' },
    capabilitySnapshot: { capabilities: { atlasLocalGraph: false } },
  });
  const disabledTemporal = derived.deriveAtlasLocalGraph({
    coreState: built.state,
    params: { projectId, languageCode: 'en' },
    capabilitySnapshot: { capabilities: { atlasLocalGraph: true, atlasTemporalContinuity: false } },
  });

  assert.equal(empty.ok, true);
  assert.equal(empty.value.state, 'empty');
  assert.equal(empty.value.summary.nodeCount, 0);
  assert.equal(empty.value.summary.edgeCount, 0);
  assert.equal(empty.value.summary.clusterCount, 0);
  assert.equal(missingProjectId.ok, false);
  assert.equal(missingProjectId.error.code, 'E_ATLAS_PROJECT_ID_REQUIRED');
  assert.equal(disabled.ok, false);
  assert.equal(disabled.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(disabled.error.reason, 'ATLAS_LOCAL_GRAPH_DISABLED');
  assert.equal(disabledTemporal.ok, false);
  assert.equal(disabledTemporal.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(disabledTemporal.error.reason, 'ATLAS_TEMPORAL_CONTINUITY_DISABLED');
});

test('E04 C06: cluster layout budget proof is exported through derived barrels', async () => {
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));

  assert.equal(atlas.ATLAS_LOCAL_GRAPH_SCHEMA_VERSION, 'derived.atlas.localGraph.v1');
  assert.equal(atlas.ATLAS_LOCAL_GRAPH_LAYOUT_JOB_SCHEMA_VERSION, 'atlas.localGraph.layoutJob.v1');
  assert.equal(derived.ATLAS_LOCAL_GRAPH_LAYOUT_RESULT_SCHEMA_VERSION, 'atlas.localGraph.layoutResult.v1');
  assert.equal(derived.ATLAS_LOCAL_GRAPH_RESOURCE_BUDGET_PROOF_SCHEMA_VERSION, 'atlas.localGraph.resourceBudgetProof.v1');
  assert.equal(typeof atlas.deriveAtlasLocalGraph, 'function');
  assert.equal(typeof derived.createAtlasLocalGraphLayoutJob, 'function');
  assert.equal(typeof derived.acceptAtlasLocalGraphLayoutResult, 'function');
});

test('E04 C06: Atlas local graph modules add no storage, network, UI, worker scheduling, or command bypass', () => {
  const sources = [
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'atlasLocalGraphTypes.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'deriveAtlasLocalGraph.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'atlasLocalGraphLayoutPlanner.mjs'),
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
    /new\s+Worker\b/u,
    /\bsetTimeout\b/u,
    /\bsetInterval\b/u,
    /\bDate\.now\b/u,
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
    /dispatchUiCommand/u,
  ];

  for (const sourcePath of sources) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${path.basename(sourcePath)} matched ${pattern.source}`);
    }
  }
});
