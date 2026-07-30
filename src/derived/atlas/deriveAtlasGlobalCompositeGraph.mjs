import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import { deriveManualMapGraph } from '../mindmap/deriveManualMapGraph.mjs';
import { deriveIdeaProjection } from '../idea/deriveIdeaProjection.mjs';
import { deriveMeaningProjection } from '../meaning/deriveMeaningProjection.mjs';
import { derivePlotProjection } from '../plot/derivePlotProjection.mjs';
import { deriveCrossProjectionImpactPreview } from '../projections/deriveCrossProjectionImpactPreview.mjs';
import { deriveAtlasLocalGraph } from './deriveAtlasLocalGraph.mjs';
import { deriveAtlasTemporalContinuity } from './deriveAtlasTemporalContinuity.mjs';
import {
  ATLAS_GLOBAL_COMPOSITE_EDGE_KIND,
  ATLAS_GLOBAL_COMPOSITE_EDGE_SCHEMA_VERSION,
  ATLAS_GLOBAL_COMPOSITE_GRAPH_SCHEMA_VERSION,
  ATLAS_GLOBAL_COMPOSITE_NODE_KIND,
  ATLAS_GLOBAL_COMPOSITE_NODE_SCHEMA_VERSION,
  ATLAS_GLOBAL_COMPOSITE_SOURCE_REF_SCHEMA_VERSION,
  sortAtlasGlobalCompositeEdges,
  sortAtlasGlobalCompositeNodes,
  sortAtlasGlobalCompositeSourceRefs,
} from './atlasGlobalCompositeGraphTypes.mjs';

const VIEW_ID = ATLAS_GLOBAL_COMPOSITE_GRAPH_SCHEMA_VERSION;
const VIEW_OP = 'derived.atlas.globalCompositeGraph';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function safeIdPart(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9:_-]+/gu, '-')
    .replace(/^-+|-+$/gu, '') || 'item';
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function getManualMapIds(project) {
  const maps = isPlainObject(project?.manualMaps?.maps) ? project.manualMaps.maps : {};
  return Object.keys(maps).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }));
}

function isGlobalCompositeCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['atlas.globalCompositeGraph'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['atlas.globalCompositeGraph'] === false) return false;
  if (capabilities.atlasGlobalCompositeGraph === false) return false;
  if (isPlainObject(capabilities.atlas) && capabilities.atlas.globalCompositeGraph === false) return false;
  return true;
}

function sourceUnavailable(sourceProjection, result) {
  throw createDerivedError(
    'E_ATLAS_GLOBAL_COMPOSITE_SOURCE_UNAVAILABLE',
    VIEW_OP,
    'SOURCE_PROJECTION_UNAVAILABLE',
    {
      sourceProjection,
      sourceErrorCode: result?.error?.code || 'E_SOURCE_UNKNOWN',
    },
  );
}

function makeSourceRef({ sourceProjection, sourceId, schemaVersion, sourceHash, invalidationKey, coreStateHash }) {
  const normalized = {
    schemaVersion: ATLAS_GLOBAL_COMPOSITE_SOURCE_REF_SCHEMA_VERSION,
    sourceProjection: normalizeString(sourceProjection),
    sourceId: normalizeString(sourceId),
    sourceSchemaVersion: normalizeString(schemaVersion),
    sourceHash: normalizeString(sourceHash),
    invalidationKey: normalizeString(invalidationKey),
    coreStateHash: normalizeString(coreStateHash),
    readOnly: true,
    projectTruthMutation: false,
    storageMutation: false,
    sourceWriteBack: false,
  };
  return {
    ...normalized,
    sourceRefId: `global-source:${hashCanonicalValue(normalized)}`,
  };
}

function sourceRefIdsFor(sourceRefs, sourceProjection, sourceId = '') {
  return sourceRefs
    .filter((ref) => ref.sourceProjection === sourceProjection && (!sourceId || ref.sourceId === sourceId))
    .map((ref) => ref.sourceRefId)
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }));
}

function mergeNode(nodesById, node) {
  if (!node.nodeId) return;
  const existing = nodesById.get(node.nodeId);
  if (!existing) {
    nodesById.set(node.nodeId, {
      schemaVersion: ATLAS_GLOBAL_COMPOSITE_NODE_SCHEMA_VERSION,
      ...node,
      sourceRefIds: [...new Set(Array.isArray(node.sourceRefIds) ? node.sourceRefIds : [])].sort(),
    });
    return;
  }
  existing.sourceRefIds = [...new Set([
    ...existing.sourceRefIds,
    ...(Array.isArray(node.sourceRefIds) ? node.sourceRefIds : []),
  ])].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }));
}

function mergeEdge(edgesById, edge) {
  if (!edge.edgeId || !edge.fromNodeId || !edge.toNodeId || edge.fromNodeId === edge.toNodeId) return;
  const existing = edgesById.get(edge.edgeId);
  if (!existing) {
    edgesById.set(edge.edgeId, {
      schemaVersion: ATLAS_GLOBAL_COMPOSITE_EDGE_SCHEMA_VERSION,
      ...edge,
      sourceRefIds: [...new Set(Array.isArray(edge.sourceRefIds) ? edge.sourceRefIds : [])].sort(),
    });
    return;
  }
  existing.sourceRefIds = [...new Set([
    ...existing.sourceRefIds,
    ...(Array.isArray(edge.sourceRefIds) ? edge.sourceRefIds : []),
  ])].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }));
}

function atlasNodeId(localNodeId) {
  return `global:atlas:${localNodeId}`;
}

function temporalNodeId(entityId) {
  return `global:temporal:entity:${safeIdPart(entityId)}`;
}

function manualNodeId(mapId, nodeId) {
  return `global:manualMap:${safeIdPart(mapId)}:${safeIdPart(nodeId)}`;
}

function plotNodeId(nodeId) {
  return `global:plot:${safeIdPart(nodeId)}`;
}

function ideaNodeId(ideaId) {
  return `global:idea:${safeIdPart(ideaId)}`;
}

function meaningNodeId(meaningId) {
  return `global:meaning:${safeIdPart(meaningId)}`;
}

function originNodeId(originKey) {
  return `global:originRef:${safeIdPart(originKey)}`;
}

function mapCrossNodeId(node) {
  if (node?.kind === 'originRef') return originNodeId(node.originKey);
  if (node?.projection === 'plot') return plotNodeId(node.objectId);
  if (node?.projection === 'idea') return ideaNodeId(node.objectId);
  if (node?.projection === 'meaning') return meaningNodeId(node.objectId);
  return `global:cross:${safeIdPart(node?.id)}`;
}

function addAtlasLocalGraph({ nodesById, edgesById, sourceRefs, localGraph }) {
  const refIds = sourceRefIdsFor(sourceRefs, 'atlas.localGraph');
  for (const node of Array.isArray(localGraph.nodes) ? localGraph.nodes : []) {
    mergeNode(nodesById, {
      nodeId: atlasNodeId(node.nodeId),
      nodeKind: ATLAS_GLOBAL_COMPOSITE_NODE_KIND.ATLAS_ENTITY,
      sourceProjection: 'atlas.localGraph',
      sourceId: node.nodeId,
      label: node.label,
      entityId: node.entityId,
      sourceRefIds: refIds,
    });
  }
  for (const edge of Array.isArray(localGraph.edges) ? localGraph.edges : []) {
    mergeEdge(edgesById, {
      edgeId: `global:atlas-edge:${safeIdPart(edge.edgeId)}`,
      edgeKind: ATLAS_GLOBAL_COMPOSITE_EDGE_KIND.ATLAS_COOCCURRENCE,
      fromNodeId: atlasNodeId(edge.leftNodeId),
      toNodeId: atlasNodeId(edge.rightNodeId),
      sourceProjection: 'atlas.localGraph',
      sourceId: edge.edgeId,
      weight: numberOrZero(edge.weight),
      sourceRefIds: refIds,
    });
  }
}

function addTemporalContinuity({ nodesById, edgesById, sourceRefs, temporal }) {
  const refIds = sourceRefIdsFor(sourceRefs, 'atlas.temporalContinuity');
  for (const entity of Array.isArray(temporal.entityAppearances) ? temporal.entityAppearances : []) {
    mergeNode(nodesById, {
      nodeId: temporalNodeId(entity.entityId),
      nodeKind: ATLAS_GLOBAL_COMPOSITE_NODE_KIND.TEMPORAL_ENTITY,
      sourceProjection: 'atlas.temporalContinuity',
      sourceId: entity.entityId,
      label: entity.name || entity.entityId,
      entityId: entity.entityId,
      firstSceneId: entity.firstAppearance?.sceneId || '',
      lastSceneId: entity.lastAppearance?.sceneId || '',
      sourceRefIds: refIds,
    });
  }
  for (const relation of Array.isArray(temporal.cooccurrences) ? temporal.cooccurrences : []) {
    mergeEdge(edgesById, {
      edgeId: `global:temporal-edge:${safeIdPart(relation.relationId || hashCanonicalValue(relation))}`,
      edgeKind: ATLAS_GLOBAL_COMPOSITE_EDGE_KIND.TEMPORAL_COOCCURRENCE,
      fromNodeId: temporalNodeId(relation.leftEntityId),
      toNodeId: temporalNodeId(relation.rightEntityId),
      sourceProjection: 'atlas.temporalContinuity',
      sourceId: relation.relationId || '',
      weight: numberOrZero(relation.sceneCount),
      sourceRefIds: refIds,
    });
  }
}

function addManualMap({ nodesById, edgesById, sourceRefs, manualMap }) {
  const refIds = sourceRefIdsFor(sourceRefs, 'manualMap.graph', manualMap.mapId);
  for (const node of Array.isArray(manualMap.nodes) ? manualMap.nodes : []) {
    mergeNode(nodesById, {
      nodeId: manualNodeId(manualMap.mapId, node.id),
      nodeKind: ATLAS_GLOBAL_COMPOSITE_NODE_KIND.MANUAL_MAP_NODE,
      sourceProjection: 'manualMap.graph',
      sourceId: `${manualMap.mapId}:${node.id}`,
      label: node.label,
      mapId: manualMap.mapId,
      sourceRefIds: refIds,
    });
    if (node.target?.kind === 'scene' && node.target.id) {
      mergeEdge(edgesById, {
        edgeId: `global:manual-target:${safeIdPart(manualMap.mapId)}:${safeIdPart(node.id)}:${safeIdPart(node.target.id)}`,
        edgeKind: ATLAS_GLOBAL_COMPOSITE_EDGE_KIND.MANUAL_TARGET_REF,
        fromNodeId: manualNodeId(manualMap.mapId, node.id),
        toNodeId: plotNodeId(`plot-scene:${node.target.id}`),
        sourceProjection: 'manualMap.graph',
        sourceId: `${manualMap.mapId}:${node.id}`,
        sourceRefIds: refIds,
      });
    }
  }
  for (const edge of Array.isArray(manualMap.edges) ? manualMap.edges : []) {
    mergeEdge(edgesById, {
      edgeId: `global:manual-edge:${safeIdPart(manualMap.mapId)}:${safeIdPart(edge.id)}`,
      edgeKind: ATLAS_GLOBAL_COMPOSITE_EDGE_KIND.MANUAL_MAP_EDGE,
      fromNodeId: manualNodeId(manualMap.mapId, edge.from),
      toNodeId: manualNodeId(manualMap.mapId, edge.to),
      sourceProjection: 'manualMap.graph',
      sourceId: `${manualMap.mapId}:${edge.id}`,
      label: edge.label,
      sourceRefIds: refIds,
    });
  }
}

function addPlotProjection({ nodesById, edgesById, sourceRefs, plot }) {
  const refIds = sourceRefIdsFor(sourceRefs, 'plot.projection');
  for (const node of Array.isArray(plot.nodes) ? plot.nodes : []) {
    mergeNode(nodesById, {
      nodeId: plotNodeId(node.id),
      nodeKind: ATLAS_GLOBAL_COMPOSITE_NODE_KIND.PLOT_NODE,
      sourceProjection: 'plot.projection',
      sourceId: node.id,
      label: node.label,
      sourceRefIds: refIds,
    });
  }
  for (const edge of Array.isArray(plot.edges) ? plot.edges : []) {
    mergeEdge(edgesById, {
      edgeId: `global:plot-edge:${hashCanonicalValue(edge)}`,
      edgeKind: ATLAS_GLOBAL_COMPOSITE_EDGE_KIND.PLOT_EDGE,
      fromNodeId: plotNodeId(edge.from),
      toNodeId: plotNodeId(edge.to),
      sourceProjection: 'plot.projection',
      sourceId: `${edge.from}:${edge.to}:${edge.kind}`,
      sourceRefIds: refIds,
    });
  }
}

function addIdeaProjection({ nodesById, sourceRefs, idea }) {
  const refIds = sourceRefIdsFor(sourceRefs, 'idea.projection');
  for (const item of Array.isArray(idea.ideas) ? idea.ideas : []) {
    mergeNode(nodesById, {
      nodeId: ideaNodeId(item.id),
      nodeKind: ATLAS_GLOBAL_COMPOSITE_NODE_KIND.IDEA,
      sourceProjection: 'idea.projection',
      sourceId: item.id,
      label: item.title || item.id,
      sourceRefIds: refIds,
    });
  }
}

function addMeaningProjection({ nodesById, sourceRefs, meaning }) {
  const refIds = sourceRefIdsFor(sourceRefs, 'meaning.projection');
  for (const item of Array.isArray(meaning.meanings) ? meaning.meanings : []) {
    mergeNode(nodesById, {
      nodeId: meaningNodeId(item.id),
      nodeKind: ATLAS_GLOBAL_COMPOSITE_NODE_KIND.MEANING,
      sourceProjection: 'meaning.projection',
      sourceId: item.id,
      label: item.title || item.id,
      sourceRefIds: refIds,
    });
  }
}

function addCrossProjection({ nodesById, edgesById, sourceRefs, cross }) {
  const refIds = sourceRefIdsFor(sourceRefs, 'crossProjection.impactPreview');
  const canvasNodes = new Map((Array.isArray(cross.canvasGraphPacket?.nodes) ? cross.canvasGraphPacket.nodes : [])
    .map((node) => [node.id, node]));
  for (const ref of Array.isArray(cross.originRefs) ? cross.originRefs : []) {
    mergeNode(nodesById, {
      nodeId: originNodeId(ref.originKey),
      nodeKind: ATLAS_GLOBAL_COMPOSITE_NODE_KIND.ORIGIN_REF,
      sourceProjection: 'crossProjection.impactPreview',
      sourceId: ref.originKey,
      label: `${ref.sceneId}:${ref.startOffset}-${ref.endOffset}`,
      sceneId: ref.sceneId,
      sourceRefIds: refIds,
    });
  }
  for (const edge of Array.isArray(cross.canvasGraphPacket?.edges) ? cross.canvasGraphPacket.edges : []) {
    const fromNode = canvasNodes.get(edge.from);
    const toNode = canvasNodes.get(edge.to);
    const fromNodeId = mapCrossNodeId(fromNode || { id: edge.from });
    const toNodeId = mapCrossNodeId(toNode || { id: edge.to });
    mergeEdge(edgesById, {
      edgeId: `global:cross-edge:${safeIdPart(edge.id)}`,
      edgeKind: ATLAS_GLOBAL_COMPOSITE_EDGE_KIND.CROSS_PROJECTION_LINK,
      fromNodeId,
      toNodeId,
      sourceProjection: 'crossProjection.impactPreview',
      sourceId: edge.id,
      relationKind: edge.kind,
      sourceRefIds: refIds,
    });
  }
}

function buildSourceProjectionHashes(sourceRefs) {
  const result = {};
  for (const ref of sourceRefs) {
    const key = ref.sourceId
      ? `${ref.sourceProjection}:${ref.sourceId}`
      : ref.sourceProjection;
    result[key] = ref.sourceHash;
  }
  return Object.keys(result)
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }))
    .reduce((acc, key) => {
      acc[key] = result[key];
      return acc;
    }, {});
}

function buildGlobalCompositeGraph({ coreState, projectId, capabilitySnapshot, meta, params }) {
  const project = getProject(coreState, projectId);
  if (!project) {
    throw createDerivedError(
      'E_ATLAS_GLOBAL_COMPOSITE_PROJECT_NOT_FOUND',
      VIEW_OP,
      'PROJECT_NOT_FOUND',
      { projectId },
    );
  }

  const temporalResult = deriveAtlasTemporalContinuity({ coreState, params: { projectId }, capabilitySnapshot });
  if (!temporalResult.ok) sourceUnavailable('atlas.temporalContinuity', temporalResult);
  const localGraphResult = deriveAtlasLocalGraph({ coreState, params: { projectId, limits: params.limits }, capabilitySnapshot });
  if (!localGraphResult.ok) sourceUnavailable('atlas.localGraph', localGraphResult);
  const plotResult = derivePlotProjection({ coreState, params: { projectId }, capabilitySnapshot });
  if (!plotResult.ok) sourceUnavailable('plot.projection', plotResult);
  const ideaResult = deriveIdeaProjection({ coreState, params: { projectId }, capabilitySnapshot });
  if (!ideaResult.ok) sourceUnavailable('idea.projection', ideaResult);
  const meaningResult = deriveMeaningProjection({ coreState, params: { projectId }, capabilitySnapshot });
  if (!meaningResult.ok) sourceUnavailable('meaning.projection', meaningResult);
  const crossResult = deriveCrossProjectionImpactPreview({
    coreState,
    params: { projectId, expectedCoreStateHash: meta.coreStateHash },
    capabilitySnapshot,
  });
  if (!crossResult.ok) sourceUnavailable('crossProjection.impactPreview', crossResult);

  const sourceRefs = [
    makeSourceRef({
      sourceProjection: 'atlas.temporalContinuity',
      sourceId: '',
      schemaVersion: temporalResult.value.schemaVersion,
      sourceHash: temporalResult.value.summary?.temporalHash,
      invalidationKey: temporalResult.meta?.invalidationKey,
      coreStateHash: temporalResult.meta?.coreStateHash,
    }),
    makeSourceRef({
      sourceProjection: 'atlas.localGraph',
      sourceId: '',
      schemaVersion: localGraphResult.value.schemaVersion,
      sourceHash: localGraphResult.value.summary?.graphHash,
      invalidationKey: localGraphResult.meta?.invalidationKey,
      coreStateHash: localGraphResult.meta?.coreStateHash,
    }),
    makeSourceRef({
      sourceProjection: 'plot.projection',
      sourceId: '',
      schemaVersion: plotResult.value.schemaVersion,
      sourceHash: plotResult.value.meta?.projectionHash,
      invalidationKey: plotResult.meta?.invalidationKey,
      coreStateHash: plotResult.meta?.coreStateHash,
    }),
    makeSourceRef({
      sourceProjection: 'idea.projection',
      sourceId: '',
      schemaVersion: ideaResult.value.schemaVersion,
      sourceHash: ideaResult.value.meta?.projectionHash,
      invalidationKey: ideaResult.meta?.invalidationKey,
      coreStateHash: ideaResult.meta?.coreStateHash,
    }),
    makeSourceRef({
      sourceProjection: 'meaning.projection',
      sourceId: '',
      schemaVersion: meaningResult.value.schemaVersion,
      sourceHash: meaningResult.value.meta?.projectionHash,
      invalidationKey: meaningResult.meta?.invalidationKey,
      coreStateHash: meaningResult.meta?.coreStateHash,
    }),
    makeSourceRef({
      sourceProjection: 'crossProjection.impactPreview',
      sourceId: '',
      schemaVersion: crossResult.value.schemaVersion,
      sourceHash: crossResult.value.meta?.previewHash,
      invalidationKey: crossResult.meta?.invalidationKey,
      coreStateHash: crossResult.meta?.coreStateHash,
    }),
  ];
  const manualMapResults = [];
  for (const mapId of getManualMapIds(project)) {
    const manualResult = deriveManualMapGraph({ coreState, params: { projectId, mapId }, capabilitySnapshot });
    if (!manualResult.ok) sourceUnavailable(`manualMap.graph:${mapId}`, manualResult);
    manualMapResults.push(manualResult.value);
    sourceRefs.push(makeSourceRef({
      sourceProjection: 'manualMap.graph',
      sourceId: mapId,
      schemaVersion: manualResult.value.schemaVersion,
      sourceHash: manualResult.value.meta?.graphHash,
      invalidationKey: manualResult.meta?.invalidationKey,
      coreStateHash: manualResult.meta?.coreStateHash,
    }));
  }

  const sortedSourceRefs = sortAtlasGlobalCompositeSourceRefs(sourceRefs);
  const nodesById = new Map();
  const edgesById = new Map();
  addAtlasLocalGraph({ nodesById, edgesById, sourceRefs: sortedSourceRefs, localGraph: localGraphResult.value });
  addTemporalContinuity({ nodesById, edgesById, sourceRefs: sortedSourceRefs, temporal: temporalResult.value });
  for (const manualMap of manualMapResults) {
    addManualMap({ nodesById, edgesById, sourceRefs: sortedSourceRefs, manualMap });
  }
  addPlotProjection({ nodesById, edgesById, sourceRefs: sortedSourceRefs, plot: plotResult.value });
  addIdeaProjection({ nodesById, sourceRefs: sortedSourceRefs, idea: ideaResult.value });
  addMeaningProjection({ nodesById, sourceRefs: sortedSourceRefs, meaning: meaningResult.value });
  addCrossProjection({ nodesById, edgesById, sourceRefs: sortedSourceRefs, cross: crossResult.value });

  const nodes = sortAtlasGlobalCompositeNodes([...nodesById.values()]);
  const edges = sortAtlasGlobalCompositeEdges([...edgesById.values()]
    .filter((edge) => nodesById.has(edge.fromNodeId) && nodesById.has(edge.toNodeId)));
  const sourceProjectionHashes = buildSourceProjectionHashes(sortedSourceRefs);
  const compositeHash = hashCanonicalValue({
    projectId,
    coreStateHash: meta.coreStateHash,
    sourceRefs: sortedSourceRefs,
    nodes,
    edges,
    sourceProjectionHashes,
  });

  return {
    schemaVersion: ATLAS_GLOBAL_COMPOSITE_GRAPH_SCHEMA_VERSION,
    state: nodes.length > 0 ? 'ready' : 'empty',
    projectId,
    sourceRefs: sortedSourceRefs,
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
      sourceProjectionCount: sortedSourceRefs.length,
      manualMapCount: manualMapResults.length,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      crossProjectionEdgeCount: edges.filter((edge) => edge.edgeKind === ATLAS_GLOBAL_COMPOSITE_EDGE_KIND.CROSS_PROJECTION_LINK).length,
      sourceProjectionHashes,
      coreStateHash: meta.coreStateHash,
      compositeHash,
    },
    meta: {
      compositeHash,
      invalidationKey: meta.invalidationKey,
    },
  };
}

export function deriveAtlasGlobalCompositeGraph(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  if (!projectId) {
    return {
      ok: false,
      error: {
        code: 'E_ATLAS_GLOBAL_COMPOSITE_PROJECT_ID_REQUIRED',
        op: VIEW_OP,
        reason: 'PROJECT_ID_REQUIRED',
      },
    };
  }

  return deriveView({
    viewId: VIEW_ID,
    coreState: input.coreState,
    params: {
      ...input.params,
      projectId,
    },
    capabilitySnapshot: input.capabilitySnapshot,
    derive: ({ coreState, params, capabilitySnapshot, meta }) => {
      if (!isGlobalCompositeCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          VIEW_OP,
          'ATLAS_GLOBAL_COMPOSITE_GRAPH_DISABLED',
          { capabilityId: 'atlas.globalCompositeGraph' },
        );
      }
      return buildGlobalCompositeGraph({ coreState, projectId: params.projectId, capabilitySnapshot, meta, params });
    },
  });
}

export { VIEW_ID as ATLAS_GLOBAL_COMPOSITE_GRAPH_VIEW_ID };
