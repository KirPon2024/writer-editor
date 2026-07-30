const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

function buildLargeCompositeGraph(count = 10000) {
  const nodes = [];
  const edges = [];
  for (let index = 0; index < count; index += 1) {
    const id = `global:synthetic:${String(index).padStart(5, '0')}`;
    nodes.push({
      schemaVersion: 'derived.atlas.globalCompositeNode.v1',
      nodeId: id,
      nodeKind: index % 7 === 0 ? 'originRef' : 'atlasEntity',
      sourceProjection: 'synthetic',
      sourceId: id,
      label: `Node ${index}`,
      sourceRefIds: [`global-source:${index % 11}`],
    });
    if (index > 0) {
      edges.push({
        schemaVersion: 'derived.atlas.globalCompositeEdge.v1',
        edgeId: `global:synthetic-edge:${String(index).padStart(5, '0')}`,
        edgeKind: index % 5 === 0 ? 'crossProjectionLink' : 'atlasCooccurrence',
        fromNodeId: `global:synthetic:${String(index - 1).padStart(5, '0')}`,
        toNodeId: id,
        sourceProjection: 'synthetic',
        sourceId: `edge-${index}`,
        sourceRefIds: [`global-source:${index % 11}`],
      });
    }
  }
  return {
    schemaVersion: 'derived.atlas.globalCompositeGraph.v1',
    projectId: 'large-global-composite-project',
    sourceRefs: [],
    nodes,
    edges,
    summary: {
      sourceProjectionCount: 1,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      sourceProjectionHashes: {
        synthetic: 'a'.repeat(64),
      },
      compositeHash: 'b'.repeat(64),
    },
    meta: {
      compositeHash: 'b'.repeat(64),
    },
  };
}

test('E08 C03: LOD plan keeps large global graphs bounded without render-all', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const graph = buildLargeCompositeGraph();
  const plan = derived.buildAtlasGlobalCompositeGraphLodPlan({
    graph,
    limits: { maxNodes: 320, maxEdges: 240, labelNodeBudget: 80 },
  });

  assert.equal(plan.schemaVersion, derived.ATLAS_GLOBAL_COMPOSITE_LOD_PLAN_SCHEMA_VERSION);
  assert.equal(plan.resourceBudgetProof.schemaVersion, derived.ATLAS_GLOBAL_COMPOSITE_RESOURCE_BUDGET_PROOF_SCHEMA_VERSION);
  assert.equal(plan.sourceRevision, graph.meta.compositeHash);
  assert.equal(plan.nodes.length <= 320, true);
  assert.equal(plan.edges.length <= 240, true);
  assert.equal(plan.summary.sourceNodeCount, 10000);
  assert.equal(plan.summary.sourceEdgeCount, 9999);
  assert.equal(plan.summary.renderAllNodes, false);
  assert.equal(plan.summary.renderAllEdges, false);
  assert.equal(plan.resourceBudgetProof.withinBudget.nodes, true);
  assert.equal(plan.resourceBudgetProof.withinBudget.edges, true);
  assert.equal(plan.resourceBudgetProof.renderAll.nodes, false);
  assert.equal(plan.resourceBudgetProof.renderAll.edges, false);
  assert.match(plan.meta.lodPlanHash, /^[0-9a-f]{64}$/u);
  assert.match(plan.resourceBudgetProof.meta.resourceBudgetProofHash, /^[0-9a-f]{64}$/u);
});

test('E08 C03: stable positions are deterministic and source-hash bound', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const graph = buildLargeCompositeGraph(256);
  const first = derived.buildAtlasGlobalCompositeGraphLodPlan({ graph, limits: { maxNodes: 128, maxEdges: 128 } });
  const second = derived.buildAtlasGlobalCompositeGraphLodPlan({
    graph: JSON.parse(JSON.stringify(graph)),
    limits: { maxNodes: 128, maxEdges: 128 },
  });
  const changedSource = {
    ...graph,
    summary: {
      ...graph.summary,
      sourceProjectionHashes: { synthetic: 'c'.repeat(64) },
      compositeHash: 'd'.repeat(64),
    },
    meta: { compositeHash: 'd'.repeat(64) },
  };
  const changed = derived.buildAtlasGlobalCompositeGraphLodPlan({ graph: changedSource, limits: { maxNodes: 128, maxEdges: 128 } });

  assert.equal(first.meta.lodPlanHash, second.meta.lodPlanHash);
  assert.deepEqual(
    first.nodes.map((node) => [node.nodeId, node.position.x, node.position.y, node.position.positionHash]),
    second.nodes.map((node) => [node.nodeId, node.position.x, node.position.y, node.position.positionHash]),
  );
  assert.notEqual(first.stableSeed, changed.stableSeed);
  assert.notDeepEqual(
    first.nodes.map((node) => [node.nodeId, node.position.x, node.position.y]),
    changed.nodes.map((node) => [node.nodeId, node.position.x, node.position.y]),
  );
  assert.equal(first.nodes.every((node) => node.position.schemaVersion === derived.ATLAS_GLOBAL_COMPOSITE_STABLE_POSITION_SCHEMA_VERSION), true);
});

test('E08 C03: LOD output is independent of source node and edge order', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const graph = buildLargeCompositeGraph(512);
  const shuffled = {
    ...graph,
    nodes: [...graph.nodes].reverse(),
    edges: [...graph.edges].reverse(),
  };
  const first = derived.buildAtlasGlobalCompositeGraphLodPlan({ graph, limits: { maxNodes: 200, maxEdges: 120 } });
  const second = derived.buildAtlasGlobalCompositeGraphLodPlan({ graph: shuffled, limits: { maxNodes: 200, maxEdges: 120 } });

  assert.equal(first.meta.lodPlanHash, second.meta.lodPlanHash);
  assert.deepEqual(first.nodes.map((node) => node.nodeId), second.nodes.map((node) => node.nodeId));
  assert.deepEqual(first.edges.map((edge) => edge.edgeId), second.edges.map((edge) => edge.edgeId));
});

test('E08 C03: LOD planner exports through barrels and adds no persistent layout or runtime bypass', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));

  assert.equal(derived.buildAtlasGlobalCompositeGraphLodPlan, atlas.buildAtlasGlobalCompositeGraphLodPlan);
  assert.equal(derived.ATLAS_GLOBAL_COMPOSITE_LOD_PLAN_SCHEMA_VERSION, 'atlas.globalCompositeGraph.lodPlan.v1');
  assert.equal(derived.ATLAS_GLOBAL_COMPOSITE_RESOURCE_BUDGET_PROOF_SCHEMA_VERSION, 'atlas.globalCompositeGraph.resourceBudgetProof.v1');

  const sources = [
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'atlasGlobalCompositeGraphLayoutPlanner.mjs'),
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
    /new\s+Worker\b/u,
    /\bsetTimeout\b/u,
    /\bsetInterval\b/u,
    /\bDate\.now\b/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
    /dispatchUiCommand/u,
    /persistentLayoutTruth:\s*true/u,
    /projectTruthMutation:\s*true/u,
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
