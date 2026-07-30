import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import { deriveAtlasTemporalContinuity } from './deriveAtlasTemporalContinuity.mjs';
import {
  ATLAS_LOCAL_GRAPH_CLUSTER_SCHEMA_VERSION,
  ATLAS_LOCAL_GRAPH_EDGE_SCHEMA_VERSION,
  ATLAS_LOCAL_GRAPH_NODE_SCHEMA_VERSION,
  ATLAS_LOCAL_GRAPH_SCHEMA_VERSION,
  sortAtlasLocalGraphClusters,
  sortAtlasLocalGraphEdges,
  sortAtlasLocalGraphNodes,
} from './atlasLocalGraphTypes.mjs';

const VIEW_ID = 'derived.atlas.localGraph.v1';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function plainString(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))]
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }));
}

function normalizePositiveInteger(value, fallback, max) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) return fallback;
  return Math.min(number, max);
}

function nodeIdForEntity(entityId) {
  return `atlas-entity:${entityId}`;
}

function buildNode(entity) {
  const entityId = plainString(entity.entityId);
  return {
    schemaVersion: ATLAS_LOCAL_GRAPH_NODE_SCHEMA_VERSION,
    nodeId: nodeIdForEntity(entityId),
    nodeKind: 'entity',
    entityId,
    label: plainString(entity.name) || entityId,
    entityKind: plainString(entity.entityKind) || 'entity',
    appearanceCount: Number(entity.appearanceCount || 0),
    sceneCount: Number(entity.sceneCount || 0),
    firstSceneId: plainString(entity.firstAppearance?.sceneId),
    lastSceneId: plainString(entity.lastAppearance?.sceneId),
    evidenceAnchorIds: uniqueSorted((Array.isArray(entity.appearances) ? entity.appearances : [])
      .map((appearance) => plainString(appearance.evidenceAnchorId))),
  };
}

function buildEdge(cooccurrence) {
  const leftEntityId = plainString(cooccurrence.leftEntityId);
  const rightEntityId = plainString(cooccurrence.rightEntityId);
  const leftNodeId = nodeIdForEntity(leftEntityId);
  const rightNodeId = nodeIdForEntity(rightEntityId);
  return {
    schemaVersion: ATLAS_LOCAL_GRAPH_EDGE_SCHEMA_VERSION,
    edgeId: `atlas-local-edge:${hashCanonicalValue({ leftNodeId, rightNodeId })}`,
    edgeKind: 'cooccurrence',
    leftNodeId,
    rightNodeId,
    leftEntityId,
    rightEntityId,
    weight: Number(cooccurrence.sceneCount || 0),
    occurrenceCount: Number(cooccurrence.occurrenceCount || 0),
    sceneIds: uniqueSorted(Array.isArray(cooccurrence.sceneIds) ? cooccurrence.sceneIds : []),
    evidenceAnchorIds: uniqueSorted(Array.isArray(cooccurrence.evidenceAnchorIds) ? cooccurrence.evidenceAnchorIds : []),
  };
}

function buildAdjacency(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node.nodeId, new Set()]));
  for (const edge of edges) {
    if (!adjacency.has(edge.leftNodeId) || !adjacency.has(edge.rightNodeId)) continue;
    adjacency.get(edge.leftNodeId).add(edge.rightNodeId);
    adjacency.get(edge.rightNodeId).add(edge.leftNodeId);
  }
  return adjacency;
}

function buildClusters(nodes, edges) {
  const adjacency = buildAdjacency(nodes, edges);
  const edgeIdsByNode = new Map(nodes.map((node) => [node.nodeId, []]));
  for (const edge of edges) {
    if (edgeIdsByNode.has(edge.leftNodeId)) edgeIdsByNode.get(edge.leftNodeId).push(edge.edgeId);
    if (edgeIdsByNode.has(edge.rightNodeId)) edgeIdsByNode.get(edge.rightNodeId).push(edge.edgeId);
  }
  const visited = new Set();
  const clusters = [];
  const seeds = nodes.map((node) => node.nodeId).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }));
  for (const seed of seeds) {
    if (visited.has(seed)) continue;
    const queue = [seed];
    visited.add(seed);
    const nodeIds = [];
    const edgeIds = [];
    for (let index = 0; index < queue.length; index += 1) {
      const nodeId = queue[index];
      nodeIds.push(nodeId);
      edgeIds.push(...(edgeIdsByNode.get(nodeId) || []));
      for (const next of [...(adjacency.get(nodeId) || [])].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }))) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    const sortedNodeIds = uniqueSorted(nodeIds);
    const sortedEdgeIds = uniqueSorted(edgeIds);
    clusters.push({
      schemaVersion: ATLAS_LOCAL_GRAPH_CLUSTER_SCHEMA_VERSION,
      clusterId: `atlas-local-cluster:${hashCanonicalValue({ nodeIds: sortedNodeIds, edgeIds: sortedEdgeIds })}`,
      ordinal: clusters.length,
      clusterKind: sortedEdgeIds.length > 0 ? 'connectedComponent' : 'isolatedNode',
      nodeIds: sortedNodeIds,
      edgeIds: sortedEdgeIds,
      nodeCount: sortedNodeIds.length,
      edgeCount: sortedEdgeIds.length,
    });
  }
  return sortAtlasLocalGraphClusters(clusters)
    .map((cluster, ordinal) => ({ ...cluster, ordinal }));
}

function isAtlasLocalGraphCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['atlas.localGraph'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['atlas.localGraph'] === false) return false;
  if (capabilities.atlasLocalGraph === false) return false;
  if (isPlainObject(capabilities.atlas) && capabilities.atlas.localGraph === false) return false;
  return true;
}

export function buildAtlasLocalGraphFromTemporalContinuity({ temporal, limits = {}, invalidationKey = '' } = {}) {
  const maxNodes = normalizePositiveInteger(limits.maxNodes, 50_000, 100_000);
  const maxEdges = normalizePositiveInteger(limits.maxEdges, 100_000, 200_000);
  const allNodes = sortAtlasLocalGraphNodes((Array.isArray(temporal?.entityAppearances) ? temporal.entityAppearances : [])
    .map((entity) => buildNode(entity)));
  const nodeIdSet = new Set(allNodes.slice(0, maxNodes).map((node) => node.nodeId));
  const allEdges = sortAtlasLocalGraphEdges((Array.isArray(temporal?.cooccurrences) ? temporal.cooccurrences : [])
    .map((cooccurrence) => buildEdge(cooccurrence))
    .filter((edge) => nodeIdSet.has(edge.leftNodeId) && nodeIdSet.has(edge.rightNodeId)));
  const nodes = allNodes.slice(0, maxNodes);
  const edges = allEdges.slice(0, maxEdges);
  const clusters = buildClusters(nodes, edges);
  const graphHash = hashCanonicalValue({
    projectId: temporal?.projectId || '',
    nodes,
    edges,
    clusters,
    temporalHash: temporal?.summary?.temporalHash || '',
  });

  return {
    schemaVersion: ATLAS_LOCAL_GRAPH_SCHEMA_VERSION,
    state: nodes.length > 0 ? 'ready' : 'empty',
    projectId: plainString(temporal?.projectId),
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
      clusterCount: clusters.length,
      sourceNodeCount: allNodes.length,
      sourceEdgeCount: allEdges.length,
      omittedNodeCount: Math.max(0, allNodes.length - nodes.length),
      omittedEdgeCount: Math.max(0, allEdges.length - edges.length),
      temporalHash: temporal?.summary?.temporalHash || '',
      graphHash,
      invalidationKey,
    },
    nodes,
    edges,
    clusters,
  };
}

export function deriveAtlasLocalGraph(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  const languageCode = normalizeString(input?.params?.languageCode);
  if (!projectId) {
    return {
      ok: false,
      error: {
        code: 'E_ATLAS_PROJECT_ID_REQUIRED',
        op: VIEW_ID,
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
      languageCode,
    },
    capabilitySnapshot: input.capabilitySnapshot,
    derive: ({ coreState, params, capabilitySnapshot, meta }) => {
      if (!isAtlasLocalGraphCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          VIEW_ID,
          'ATLAS_LOCAL_GRAPH_DISABLED',
          { capabilityId: 'atlas.localGraph' },
        );
      }
      const temporalResult = deriveAtlasTemporalContinuity({
        coreState,
        params: { projectId: params.projectId, languageCode: params.languageCode },
        capabilitySnapshot,
      });
      if (!temporalResult.ok) {
        throw createDerivedError(
          temporalResult.error?.code || 'E_ATLAS_TEMPORAL_CONTINUITY_UNAVAILABLE',
          VIEW_ID,
          temporalResult.error?.reason || 'ATLAS_TEMPORAL_CONTINUITY_UNAVAILABLE',
          temporalResult.error?.details || {},
        );
      }
      return buildAtlasLocalGraphFromTemporalContinuity({
        temporal: temporalResult.value,
        limits: params.limits,
        invalidationKey: meta.invalidationKey,
      });
    },
  });
}

export { VIEW_ID as ATLAS_LOCAL_GRAPH_VIEW_ID };
