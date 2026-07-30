const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildGlobalCompositeFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'deriveAtlasMentionIndex.mjs'));
  const projectId = 'atlas-global-composite-project';
  const sceneId = 'scene-a';
  const text = '# Opening\nMira chooses duty over crown.';
  const dutyStart = text.indexOf('duty');
  const dutyEnd = dutyStart + 'duty'.length;
  const textHash = derived.hashCanonicalValue(text);

  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Global Composite Fixture', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId, text },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'duty-entity', name: 'duty', entityKind: 'theme' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'crown-entity', name: 'crown', entityKind: 'symbol' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.IDEA_CREATE,
      payload: { projectId, ideaId: 'idea-duty', title: 'Duty over crown' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
      payload: { projectId, mapId: 'map-main', title: 'Author Map' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
      payload: {
        projectId,
        mapId: 'map-main',
        nodeId: 'node-scene',
        label: 'Opening scene',
        nodeKind: 'sceneRef',
        targetKind: 'scene',
        targetId: sceneId,
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
      payload: {
        projectId,
        mapId: 'map-main',
        nodeId: 'node-theme',
        label: 'Duty theme',
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_EDGE_ADD,
      payload: {
        projectId,
        mapId: 'map-main',
        edgeId: 'edge-duty',
        fromNodeId: 'node-scene',
        toNodeId: 'node-theme',
        edgeKind: 'annotates',
      },
    },
  ]);
  assert.equal(created.ok, true);

  const mentionIndex = atlas.deriveAtlasMentionIndex({
    coreState: created.state,
    params: { projectId },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasMentionIndex: true } },
  });
  assert.equal(mentionIndex.ok, true);
  const dutyMention = mentionIndex.value.mentions.find((item) => item.sceneId === sceneId && item.entityId === 'duty-entity');
  assert.ok(dutyMention);

  const authored = runtime.applyCoreSequence(created.state, [
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_MENTION_CONFIRM,
      payload: {
        projectId,
        sceneId: dutyMention.sceneId,
        entityId: dutyMention.entityId,
        mentionId: dutyMention.mentionId,
        evidenceAnchor: dutyMention.evidenceAnchor,
      },
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
          endOffset: dutyEnd,
          sourceHash: textHash,
          targetId: 'idea-duty',
        },
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MEANING_PROMOTE,
      payload: {
        projectId,
        meaningId: 'meaning-duty-origin',
        title: 'Duty is chosen',
        interpretation: 'The passage explicitly frames duty as a choice.',
        source: {
          kind: 'sceneOriginRef',
          originRef: {
            schemaVersion: derived.IDEA_ORIGIN_REF_SCHEMA_VERSION,
            kind: 'sceneTextRange',
            sceneId,
            startOffset: dutyStart,
            endOffset: dutyEnd,
            sourceHash: textHash,
            targetId: 'meaning-duty-origin',
          },
        },
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MEANING_PROMOTE,
      payload: {
        projectId,
        meaningId: 'meaning-duty-idea',
        title: 'Duty defeats power',
        interpretation: 'The idea promotes duty above the crown.',
        source: { kind: 'idea', ideaId: 'idea-duty' },
      },
    },
  ]);
  assert.equal(authored.ok, true);
  return { derived, projectId, state: authored.state };
}

function capabilitySnapshot() {
  return {
    platformId: 'node',
    capabilities: {
      atlasGlobalCompositeGraph: true,
      atlasMentionIndex: true,
      atlasLocalGraph: true,
      plotProjection: true,
      ideaProjection: true,
      meaningProjection: true,
      crossProjectionImpactPreview: true,
      manualMapView: true,
    },
  };
}

test('E08 C01: global composite graph assembles read-only source refs from every Stage 08 source family', async () => {
  const { derived, projectId, state } = await buildGlobalCompositeFixture();
  const first = derived.deriveAtlasGlobalCompositeGraph({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: capabilitySnapshot(),
  });
  const second = derived.deriveAtlasGlobalCompositeGraph({
    coreState: JSON.parse(JSON.stringify(state)),
    params: { projectId },
    capabilitySnapshot: capabilitySnapshot(),
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.value.schemaVersion, derived.ATLAS_GLOBAL_COMPOSITE_GRAPH_SCHEMA_VERSION);
  assert.equal(first.value.meta.compositeHash, second.value.meta.compositeHash);
  assert.match(first.value.meta.compositeHash, /^[0-9a-f]{64}$/u);
  assert.equal(first.value.authority.readModelOnly, true);
  assert.equal(first.value.authority.commandAuthority, 'none');
  assert.equal(first.value.authority.sourceProjectionWriteBack, false);
  assert.equal(first.value.authority.projectTruthMutation, false);
  assert.equal(first.value.authority.manuscriptMutation, false);
  assert.equal(first.value.authority.storageMutation, false);
  assert.equal(first.value.authority.networkMutation, false);
  assert.equal(first.value.authority.rendererMutation, false);

  const sourceFamilies = first.value.sourceRefs.map((ref) => `${ref.sourceProjection}:${ref.sourceId}`);
  assert.deepEqual(sourceFamilies, [
    'atlas.localGraph:',
    'atlas.temporalContinuity:',
    'crossProjection.impactPreview:',
    'idea.projection:',
    'manualMap.graph:map-main',
    'meaning.projection:',
    'plot.projection:',
  ]);
  for (const ref of first.value.sourceRefs) {
    assert.equal(ref.schemaVersion, derived.ATLAS_GLOBAL_COMPOSITE_SOURCE_REF_SCHEMA_VERSION);
    assert.equal(ref.readOnly, true);
    assert.equal(ref.projectTruthMutation, false);
    assert.equal(ref.storageMutation, false);
    assert.equal(ref.sourceWriteBack, false);
    assert.match(ref.sourceHash, /^[0-9a-f]{64}$/u);
    assert.match(ref.invalidationKey, /^[0-9a-f]{64}$/u);
    assert.match(ref.coreStateHash, /^[0-9a-f]{64}$/u);
  }
  assert.equal(first.value.summary.sourceProjectionCount, 7);
  assert.equal(first.value.summary.manualMapCount, 1);
  assert.deepEqual(
    Object.keys(first.value.summary.sourceProjectionHashes),
    [
      'atlas.localGraph',
      'atlas.temporalContinuity',
      'crossProjection.impactPreview',
      'idea.projection',
      'manualMap.graph:map-main',
      'meaning.projection',
      'plot.projection',
    ],
  );
});

test('E08 C01: composite graph contains typed nodes and cross-links without mutating source projections', async () => {
  const { derived, projectId, state } = await buildGlobalCompositeFixture();
  const graph = derived.deriveAtlasGlobalCompositeGraph({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: capabilitySnapshot(),
  });

  assert.equal(graph.ok, true);
  const nodeKinds = new Set(graph.value.nodes.map((node) => node.nodeKind));
  for (const kind of [
    derived.ATLAS_GLOBAL_COMPOSITE_NODE_KIND.ATLAS_ENTITY,
    derived.ATLAS_GLOBAL_COMPOSITE_NODE_KIND.TEMPORAL_ENTITY,
    derived.ATLAS_GLOBAL_COMPOSITE_NODE_KIND.MANUAL_MAP_NODE,
    derived.ATLAS_GLOBAL_COMPOSITE_NODE_KIND.PLOT_NODE,
    derived.ATLAS_GLOBAL_COMPOSITE_NODE_KIND.IDEA,
    derived.ATLAS_GLOBAL_COMPOSITE_NODE_KIND.MEANING,
    derived.ATLAS_GLOBAL_COMPOSITE_NODE_KIND.ORIGIN_REF,
  ]) {
    assert.equal(nodeKinds.has(kind), true, kind);
  }
  const edgeKinds = new Set(graph.value.edges.map((edge) => edge.edgeKind));
  assert.equal(edgeKinds.has(derived.ATLAS_GLOBAL_COMPOSITE_EDGE_KIND.MANUAL_MAP_EDGE), true);
  assert.equal(edgeKinds.has(derived.ATLAS_GLOBAL_COMPOSITE_EDGE_KIND.MANUAL_TARGET_REF), true);
  assert.equal(edgeKinds.has(derived.ATLAS_GLOBAL_COMPOSITE_EDGE_KIND.PLOT_EDGE), true);
  assert.equal(edgeKinds.has(derived.ATLAS_GLOBAL_COMPOSITE_EDGE_KIND.CROSS_PROJECTION_LINK), true);
  assert.ok(graph.value.summary.crossProjectionEdgeCount > 0);

  const ideaNode = graph.value.nodes.find((node) => node.nodeId === 'global:idea:idea-duty');
  const meaningNode = graph.value.nodes.find((node) => node.nodeId === 'global:meaning:meaning-duty-idea');
  assert.ok(ideaNode);
  assert.ok(meaningNode);
  assert.ok(ideaNode.sourceRefIds.length > 0);
  assert.ok(meaningNode.sourceRefIds.length > 0);
  const promotionEdge = graph.value.edges.find((edge) => (
    edge.edgeKind === derived.ATLAS_GLOBAL_COMPOSITE_EDGE_KIND.CROSS_PROJECTION_LINK
    && edge.fromNodeId === ideaNode.nodeId
    && edge.toNodeId === meaningNode.nodeId
  ));
  assert.ok(promotionEdge);
  assert.equal(promotionEdge.relationKind, derived.CROSS_PROJECTION_EDGE_KIND.MEANING_PROMOTED_FROM_IDEA);
  assert.ok(promotionEdge.sourceRefIds.every((sourceRefId) => sourceRefId.startsWith('global-source:')));
});

test('E08 C01: global composite graph fails closed for missing project id, disabled capability, and disabled source projection', async () => {
  const { derived, projectId, state } = await buildGlobalCompositeFixture();

  const missingProjectId = derived.deriveAtlasGlobalCompositeGraph({
    coreState: state,
    params: {},
    capabilitySnapshot: capabilitySnapshot(),
  });
  assert.equal(missingProjectId.ok, false);
  assert.equal(missingProjectId.error.code, 'E_ATLAS_GLOBAL_COMPOSITE_PROJECT_ID_REQUIRED');

  const disabledComposite = derived.deriveAtlasGlobalCompositeGraph({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { capabilities: { atlasGlobalCompositeGraph: false } },
  });
  assert.equal(disabledComposite.ok, false);
  assert.equal(disabledComposite.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(disabledComposite.error.details.capabilityId, 'atlas.globalCompositeGraph');

  const disabledSource = derived.deriveAtlasGlobalCompositeGraph({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: {
      ...capabilitySnapshot(),
      capabilities: {
        ...capabilitySnapshot().capabilities,
        plotProjection: false,
      },
    },
  });
  assert.equal(disabledSource.ok, false);
  assert.equal(disabledSource.error.code, 'E_ATLAS_GLOBAL_COMPOSITE_SOURCE_UNAVAILABLE');
  assert.equal(disabledSource.error.details.sourceProjection, 'plot.projection');
  assert.equal(disabledSource.error.details.sourceErrorCode, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
});

test('E08 C01: global composite graph exports through barrels and keeps local non-runtime source boundaries', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));

  assert.equal(derived.deriveAtlasGlobalCompositeGraph, atlas.deriveAtlasGlobalCompositeGraph);
  assert.equal(derived.ATLAS_GLOBAL_COMPOSITE_GRAPH_VIEW_ID, atlas.ATLAS_GLOBAL_COMPOSITE_GRAPH_VIEW_ID);
  assert.equal(derived.ATLAS_GLOBAL_COMPOSITE_EDGE_KIND.CROSS_PROJECTION_LINK, 'crossProjectionLink');

  const sources = [
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'deriveAtlasGlobalCompositeGraph.mjs'),
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
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
    /\baddEventListener\s*\(/u,
    /dispatchUiCommand/u,
    /sourceProjectionWriteBack:\s*true/u,
    /projectTruthMutation:\s*true/u,
    /manuscriptMutation:\s*true/u,
    /storageMutation:\s*true/u,
    /networkMutation:\s*true/u,
  ];

  for (const sourcePath of sources) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${path.basename(sourcePath)} matched ${pattern.source}`);
    }
  }
});
