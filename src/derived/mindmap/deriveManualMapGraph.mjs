import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import {
  MANUAL_MAP_GRAPH_SCHEMA_VERSION,
  sortMindMapEdges,
  sortMindMapNodes,
} from './mindMapGraphTypes.mjs';

const VIEW_ID = 'derived.manualMap.graph.v1';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function isManualMapCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['manualMap.view'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['manualMap.view'] === false) return false;
  if (capabilities.manualMapView === false) return false;
  if (isPlainObject(capabilities.manualMap) && capabilities.manualMap.view === false) return false;
  return true;
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function getManualMap(project, mapId) {
  const maps = isPlainObject(project?.manualMaps?.maps) ? project.manualMaps.maps : {};
  return isPlainObject(maps[mapId]) ? maps[mapId] : null;
}

function normalizeManualNode(node, nodeId) {
  const position = isPlainObject(node.position) ? node.position : {};
  const target = isPlainObject(node.target) ? node.target : {};
  return {
    id: normalizeString(node.id) || nodeId,
    label: normalizeString(node.label) || nodeId,
    kind: normalizeString(node.nodeKind) || 'note',
    depth: 1,
    position: {
      x: normalizeNumber(position.x),
      y: normalizeNumber(position.y),
    },
    target: {
      kind: normalizeString(target.kind),
      id: normalizeString(target.id),
    },
  };
}

function normalizeManualEdge(edge, edgeId, validNodeIds) {
  const from = normalizeString(edge.fromNodeId);
  const to = normalizeString(edge.toNodeId);
  if (!from || !to || !validNodeIds.has(from) || !validNodeIds.has(to) || from === to) return null;
  return {
    id: normalizeString(edge.id) || edgeId,
    from,
    to,
    kind: normalizeString(edge.edgeKind) || 'link',
    label: normalizeString(edge.label),
  };
}

function buildManualMapGraph(coreState, projectId, mapId) {
  const project = getProject(coreState, projectId);
  if (!project) {
    throw createDerivedError(
      'E_DERIVED_PROJECT_NOT_FOUND',
      VIEW_ID,
      'PROJECT_NOT_FOUND',
      { projectId },
    );
  }
  const map = getManualMap(project, mapId);
  if (!map) {
    throw createDerivedError(
      'E_MANUAL_MAP_NOT_FOUND',
      VIEW_ID,
      'MAP_NOT_FOUND',
      { projectId, mapId },
    );
  }
  const rawNodes = isPlainObject(map.nodes) ? map.nodes : {};
  const nodes = Object.keys(rawNodes)
    .sort()
    .map((nodeId) => normalizeManualNode(isPlainObject(rawNodes[nodeId]) ? rawNodes[nodeId] : {}, nodeId));
  const validNodeIds = new Set(nodes.map((node) => node.id));
  const rawEdges = isPlainObject(map.edges) ? map.edges : {};
  const edges = Object.keys(rawEdges)
    .sort()
    .map((edgeId) => normalizeManualEdge(isPlainObject(rawEdges[edgeId]) ? rawEdges[edgeId] : {}, edgeId, validNodeIds))
    .filter(Boolean);
  return {
    schemaVersion: MANUAL_MAP_GRAPH_SCHEMA_VERSION,
    projectId,
    mapId,
    title: normalizeString(map.title) || mapId,
    nodes: sortMindMapNodes(nodes),
    edges: sortMindMapEdges(edges),
  };
}

export function deriveManualMapGraph(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  const mapId = normalizeString(input?.params?.mapId);
  if (!projectId) {
    return {
      ok: false,
      error: {
        code: 'E_DERIVED_PROJECT_ID_REQUIRED',
        op: VIEW_ID,
        reason: 'PROJECT_ID_REQUIRED',
      },
    };
  }
  if (!mapId) {
    return {
      ok: false,
      error: {
        code: 'E_MANUAL_MAP_ID_REQUIRED',
        op: VIEW_ID,
        reason: 'MAP_ID_REQUIRED',
      },
    };
  }

  return deriveView({
    viewId: VIEW_ID,
    coreState: input.coreState,
    params: {
      ...input.params,
      projectId,
      mapId,
    },
    capabilitySnapshot: input.capabilitySnapshot,
    derive: ({ coreState, params, capabilitySnapshot, meta }) => {
      if (!isManualMapCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          VIEW_ID,
          'MANUAL_MAP_VIEW_DISABLED',
          { capabilityId: 'manualMap.view' },
        );
      }
      const graph = buildManualMapGraph(coreState, params.projectId, params.mapId);
      const graphHash = hashCanonicalValue({
        projectId: graph.projectId,
        mapId: graph.mapId,
        title: graph.title,
        nodes: graph.nodes,
        edges: graph.edges,
      });
      return {
        ...graph,
        meta: {
          graphHash,
          invalidationKey: meta.invalidationKey,
        },
      };
    },
  });
}

export { VIEW_ID as MANUAL_MAP_GRAPH_VIEW_ID };
