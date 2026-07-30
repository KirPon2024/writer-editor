const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

function buildCompositeGraph() {
  const sourceRefs = [
    {
      schemaVersion: 'derived.atlas.globalCompositeSourceRef.v1',
      sourceRefId: 'global-source:manual',
      sourceProjection: 'manualMap',
      sourceId: 'manual-map-alpha',
      sourceHash: 'm'.repeat(64),
      readOnly: true,
      projectTruthMutation: false,
      storageMutation: false,
      sourceWriteBack: false,
    },
    {
      schemaVersion: 'derived.atlas.globalCompositeSourceRef.v1',
      sourceRefId: 'global-source:atlas',
      sourceProjection: 'atlas.localGraph',
      sourceId: 'atlas-alpha',
      sourceHash: 'a'.repeat(64),
      readOnly: true,
      projectTruthMutation: false,
      storageMutation: false,
      sourceWriteBack: false,
    },
  ];
  const nodes = [
    {
      schemaVersion: 'derived.atlas.globalCompositeNode.v1',
      nodeId: 'global:manualMap:main:confirmed',
      nodeKind: 'manualMapNode',
      sourceProjection: 'manualMap',
      sourceId: 'confirmed',
      label: 'Confirmed path',
      trustState: 'AUTHOR_CONFIRMED',
      sourceRefIds: ['global-source:manual'],
    },
    {
      schemaVersion: 'derived.atlas.globalCompositeNode.v1',
      nodeId: 'global:manualMap:main:confirmed-b',
      nodeKind: 'manualMapNode',
      sourceProjection: 'manualMap',
      sourceId: 'confirmed-b',
      label: 'Confirmed branch',
      trustState: 'AUTHOR_CONFIRMED',
      sourceRefIds: ['global-source:manual'],
    },
    {
      schemaVersion: 'derived.atlas.globalCompositeNode.v1',
      nodeId: 'global:atlas:algorithmic',
      nodeKind: 'atlasEntity',
      sourceProjection: 'atlas.localGraph',
      sourceId: 'algorithmic',
      label: 'Algorithmic mention',
      trustState: 'ALGORITHMIC_OBSERVATION',
      sourceRefIds: ['global-source:atlas'],
    },
    {
      schemaVersion: 'derived.atlas.globalCompositeNode.v1',
      nodeId: 'global:atlas:implicit',
      nodeKind: 'atlasEntity',
      sourceProjection: 'atlas.localGraph',
      sourceId: 'implicit',
      label: 'Implicit algorithmic',
      sourceRefIds: ['global-source:atlas'],
    },
  ];
  const edges = [
    {
      schemaVersion: 'derived.atlas.globalCompositeEdge.v1',
      edgeId: 'edge-confirmed',
      edgeKind: 'manualMapEdge',
      fromNodeId: 'global:manualMap:main:confirmed',
      toNodeId: 'global:manualMap:main:confirmed-b',
      sourceProjection: 'manualMap',
      sourceId: 'edge-confirmed',
      trustState: 'AUTHOR_CONFIRMED',
      sourceRefIds: ['global-source:manual'],
    },
    {
      schemaVersion: 'derived.atlas.globalCompositeEdge.v1',
      edgeId: 'edge-mixed',
      edgeKind: 'crossProjectionLink',
      fromNodeId: 'global:manualMap:main:confirmed',
      toNodeId: 'global:atlas:algorithmic',
      sourceProjection: 'crossProjection.impactPreview',
      sourceId: 'edge-mixed',
      trustState: 'ALGORITHMIC_OBSERVATION',
      sourceRefIds: ['global-source:atlas'],
    },
  ];
  return {
    schemaVersion: 'derived.atlas.globalCompositeGraph.v1',
    projectId: 'e08-c04-project',
    sourceRefs,
    nodes,
    edges,
    summary: {
      compositeHash: 'c'.repeat(64),
      sourceProjectionHashes: {
        manualMap: 'm'.repeat(64),
        atlas: 'a'.repeat(64),
      },
    },
    meta: {
      compositeHash: 'c'.repeat(64),
    },
  };
}

test('E08 C04: trust filter keeps confirmed composite graph rows without automatic apply', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const graph = buildCompositeGraph();
  const packet = derived.deriveAtlasGlobalCompositeGraphNavigationPacket({
    graph,
    trustFilter: { allowedTrustStates: ['AUTHOR_CONFIRMED'] },
  });

  assert.equal(packet.trustFilter.schemaVersion, derived.ATLAS_GLOBAL_COMPOSITE_TRUST_FILTER_SCHEMA_VERSION);
  assert.deepEqual(packet.trustFilter.allowedTrustStates, ['AUTHOR_CONFIRMED']);
  assert.equal(packet.nodes.length, 2);
  assert.equal(packet.edges.length, 1);
  assert.equal(packet.nodes.every((node) => node.trustState === 'AUTHOR_CONFIRMED'), true);
  assert.equal(packet.edges.every((edge) => edge.trustState === 'AUTHOR_CONFIRMED'), true);
  assert.equal(packet.summary.automaticApply, false);
  assert.equal(packet.authority.automaticApply, false);
  assert.equal(packet.authority.commandDispatch, false);
  assert.equal(packet.authority.projectTruthMutation, false);
});

test('E08 C04: batch navigation rows are intent-only evidence jumps with list parity', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const graph = buildCompositeGraph();
  const packet = derived.deriveAtlasGlobalCompositeGraphNavigationPacket({
    graph,
    trustFilter: { allowedTrustStates: ['AUTHOR_CONFIRMED', 'ALGORITHMIC_OBSERVATION'] },
    selectedNodeIds: ['global:manualMap:main:confirmed', 'global:atlas:algorithmic'],
    batchLimit: 2,
  });

  assert.equal(packet.batchNavigation.schemaVersion, derived.ATLAS_GLOBAL_COMPOSITE_BATCH_NAVIGATION_INTENT_SCHEMA_VERSION);
  assert.equal(packet.batchNavigation.intents.length, 2);
  assert.equal(packet.batchNavigation.authority.routeAuthority, 'intent-only');
  assert.equal(packet.batchNavigation.authority.automaticApply, false);
  assert.equal(packet.batchNavigation.authority.commandDispatch, false);
  for (const intent of packet.batchNavigation.intents) {
    assert.equal(intent.intentKind, 'atlas.globalCompositeGraph.evidenceJump');
    assert.equal(intent.target.routeKind, 'evidenceJump');
    assert.equal(intent.target.routeAuthority, 'intent-only');
    assert.equal(intent.automaticApply, false);
    assert.equal(intent.commandDispatch, false);
    assert.equal(intent.manualReviewRequired, true);
    assert.match(intent.intentId, /^atlas-global-navigation:[0-9a-f]{64}$/u);
  }
  assert.equal(packet.accessibilityParity.schemaVersion, derived.ATLAS_GLOBAL_COMPOSITE_ACCESSIBILITY_PARITY_SCHEMA_VERSION);
  assert.equal(packet.accessibilityParity.graphEquivalentList, true);
  assert.equal(packet.accessibilityParity.pointerOnlyGraphAction, false);
  assert.deepEqual(packet.accessibilityParity.keyboardNavigation.supportedKeys, ['ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', 'Space']);
  assert.equal(packet.accessibilityParity.batchNavigationListRows, 2);
});

test('E08 C04: navigation packet is deterministic and independent of source ordering', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const graph = buildCompositeGraph();
  const shuffled = {
    ...graph,
    sourceRefs: [...graph.sourceRefs].reverse(),
    nodes: [...graph.nodes].reverse(),
    edges: [...graph.edges].reverse(),
  };
  const first = derived.deriveAtlasGlobalCompositeGraphNavigationPacket({
    graph,
    trustFilter: { allowedTrustStates: ['AUTHOR_CONFIRMED', 'ALGORITHMIC_OBSERVATION'] },
    selectedNodeIds: ['global:atlas:algorithmic', 'global:manualMap:main:confirmed'],
    batchLimit: 3,
  });
  const second = derived.deriveAtlasGlobalCompositeGraphNavigationPacket({
    graph: shuffled,
    trustFilter: { allowedTrustStates: ['ALGORITHMIC_OBSERVATION', 'AUTHOR_CONFIRMED'] },
    selectedNodeIds: ['global:manualMap:main:confirmed', 'global:atlas:algorithmic'],
    batchLimit: 3,
  });

  assert.equal(first.meta.navigationPacketHash, second.meta.navigationPacketHash);
  assert.deepEqual(first.nodes.map((node) => node.nodeId), second.nodes.map((node) => node.nodeId));
  assert.deepEqual(first.batchNavigation.intents.map((intent) => intent.intentId), second.batchNavigation.intents.map((intent) => intent.intentId));
});

test('E08 C04: navigation exports through barrels and has no UI, storage, network, or apply bypass', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));

  assert.equal(derived.deriveAtlasGlobalCompositeGraphNavigationPacket, atlas.deriveAtlasGlobalCompositeGraphNavigationPacket);
  assert.equal(derived.buildAtlasGlobalCompositeTrustFilter, atlas.buildAtlasGlobalCompositeTrustFilter);
  assert.equal(derived.ATLAS_GLOBAL_COMPOSITE_ACCESSIBILITY_PARITY_SCHEMA_VERSION, 'atlas.globalCompositeGraph.accessibilityParity.v1');

  const sources = [
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
    /automaticApply:\s*true/u,
    /commandDispatch:\s*true/u,
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
