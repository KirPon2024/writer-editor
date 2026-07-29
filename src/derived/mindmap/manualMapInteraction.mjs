import { hashCanonicalValue } from '../deriveView.mjs';
import { MANUAL_MAP_GRAPH_SCHEMA_VERSION } from './mindMapGraphTypes.mjs';

export const MANUAL_MAP_INTERACTION_SCHEMA_VERSION = 'manualMap.interaction.v1';
export const MANUAL_MAP_VIEW_STATE_SCHEMA_VERSION = 'manualMap.viewState.v1';

export const MANUAL_MAP_VIEW_INTENT = Object.freeze({
  PAN: 'manualMap.view.pan',
  ZOOM: 'manualMap.view.zoom',
  SELECT_NODE: 'manualMap.selection.node',
  SELECT_EDGE: 'manualMap.selection.edge',
  FOCUS_NODE: 'manualMap.focus.node',
  CLEAR_SELECTION: 'manualMap.selection.clear',
});

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const MAX_OFFSET = 1_000_000;
const MAX_VIEWPORT_SIZE = 100_000;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeIdList(value, validIds) {
  const seen = new Set();
  const out = [];
  const source = Array.isArray(value) ? value : [];
  for (const item of source) {
    const id = normalizeText(item);
    if (!id || seen.has(id) || (validIds && !validIds.has(id))) continue;
    seen.add(id);
    out.push(id);
  }
  out.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }));
  return out;
}

function normalizeViewport(value = {}) {
  const viewport = isPlainObject(value) ? value : {};
  return {
    x: clamp(normalizeNumber(viewport.x), -MAX_OFFSET, MAX_OFFSET),
    y: clamp(normalizeNumber(viewport.y), -MAX_OFFSET, MAX_OFFSET),
    width: clamp(normalizeNumber(viewport.width, 1024), 0, MAX_VIEWPORT_SIZE),
    height: clamp(normalizeNumber(viewport.height, 768), 0, MAX_VIEWPORT_SIZE),
    zoom: clamp(normalizeNumber(viewport.zoom, 1), MIN_ZOOM, MAX_ZOOM),
  };
}

function graphIds(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  return {
    nodeIds: new Set(nodes.map((node) => normalizeText(node?.id)).filter(Boolean)),
    edgeIds: new Set(edges.map((edge) => normalizeText(edge?.id)).filter(Boolean)),
  };
}

function normalizeSelection(value = {}, ids = graphIds({})) {
  const selection = isPlainObject(value) ? value : {};
  const nodeIds = normalizeIdList(selection.nodeIds, ids.nodeIds);
  const edgeIds = normalizeIdList(selection.edgeIds, ids.edgeIds);
  const primaryNodeId = normalizeText(selection.primaryNodeId);
  const focusedNodeId = normalizeText(selection.focusedNodeId);
  return {
    nodeIds,
    edgeIds,
    primaryNodeId: ids.nodeIds.has(primaryNodeId) ? primaryNodeId : nodeIds[0] || '',
    focusedNodeId: ids.nodeIds.has(focusedNodeId) ? focusedNodeId : '',
  };
}

export function normalizeManualMapViewState(viewState = {}, graph = {}) {
  const state = isPlainObject(viewState) ? viewState : {};
  return {
    schemaVersion: MANUAL_MAP_VIEW_STATE_SCHEMA_VERSION,
    viewport: normalizeViewport(state.viewport),
    selection: normalizeSelection(state.selection, graphIds(graph)),
  };
}

function withNodeSelection(viewState, nodeId, graph, options = {}) {
  const ids = graphIds(graph);
  const normalizedNodeId = normalizeText(nodeId);
  const current = normalizeManualMapViewState(viewState, graph);
  if (!ids.nodeIds.has(normalizedNodeId)) return current;
  const additive = options.additive === true;
  const nodeIds = additive
    ? normalizeIdList([...current.selection.nodeIds, normalizedNodeId], ids.nodeIds)
    : [normalizedNodeId];
  return normalizeManualMapViewState({
    ...current,
    selection: {
      ...current.selection,
      nodeIds,
      edgeIds: additive ? current.selection.edgeIds : [],
      primaryNodeId: normalizedNodeId,
    },
  }, graph);
}

function withEdgeSelection(viewState, edgeId, graph, options = {}) {
  const ids = graphIds(graph);
  const normalizedEdgeId = normalizeText(edgeId);
  const current = normalizeManualMapViewState(viewState, graph);
  if (!ids.edgeIds.has(normalizedEdgeId)) return current;
  const additive = options.additive === true;
  const edgeIds = additive
    ? normalizeIdList([...current.selection.edgeIds, normalizedEdgeId], ids.edgeIds)
    : [normalizedEdgeId];
  return normalizeManualMapViewState({
    ...current,
    selection: {
      ...current.selection,
      nodeIds: additive ? current.selection.nodeIds : [],
      edgeIds,
      primaryNodeId: additive ? current.selection.primaryNodeId : '',
    },
  }, graph);
}

export function reduceManualMapViewIntent(viewState = {}, intent = {}, graph = {}) {
  const type = normalizeText(intent?.type);
  const payload = isPlainObject(intent?.payload) ? intent.payload : {};
  const current = normalizeManualMapViewState(viewState, graph);
  if (type === MANUAL_MAP_VIEW_INTENT.PAN) {
    return normalizeManualMapViewState({
      ...current,
      viewport: {
        ...current.viewport,
        x: current.viewport.x + normalizeNumber(payload.dx),
        y: current.viewport.y + normalizeNumber(payload.dy),
      },
    }, graph);
  }
  if (type === MANUAL_MAP_VIEW_INTENT.ZOOM) {
    const factor = normalizeNumber(payload.factor, 1);
    const nextZoom = factor > 0 ? current.viewport.zoom * factor : current.viewport.zoom;
    return normalizeManualMapViewState({
      ...current,
      viewport: {
        ...current.viewport,
        zoom: nextZoom,
      },
    }, graph);
  }
  if (type === MANUAL_MAP_VIEW_INTENT.SELECT_NODE) {
    return withNodeSelection(current, payload.nodeId, graph, payload);
  }
  if (type === MANUAL_MAP_VIEW_INTENT.SELECT_EDGE) {
    return withEdgeSelection(current, payload.edgeId, graph, payload);
  }
  if (type === MANUAL_MAP_VIEW_INTENT.FOCUS_NODE) {
    const ids = graphIds(graph);
    const focusedNodeId = normalizeText(payload.nodeId);
    return normalizeManualMapViewState({
      ...current,
      selection: {
        ...current.selection,
        focusedNodeId: ids.nodeIds.has(focusedNodeId) ? focusedNodeId : current.selection.focusedNodeId,
      },
    }, graph);
  }
  if (type === MANUAL_MAP_VIEW_INTENT.CLEAR_SELECTION) {
    return normalizeManualMapViewState({
      ...current,
      selection: {
        nodeIds: [],
        edgeIds: [],
        primaryNodeId: '',
        focusedNodeId: current.selection.focusedNodeId,
      },
    }, graph);
  }
  return current;
}

export function buildManualMapInteractionModel(input = {}) {
  const graph = isPlainObject(input.graph) ? input.graph : {};
  const viewState = normalizeManualMapViewState(input.viewState, graph);
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const selectedNodeIds = new Set(viewState.selection.nodeIds);
  const selectedEdgeIds = new Set(viewState.selection.edgeIds);
  const focusedNodeId = viewState.selection.focusedNodeId;
  const projectedNodes = nodes.map((node) => ({
    id: normalizeText(node?.id),
    selected: selectedNodeIds.has(normalizeText(node?.id)),
    focused: focusedNodeId === normalizeText(node?.id),
  }));
  const projectedEdges = edges.map((edge) => ({
    id: normalizeText(edge?.id),
    selected: selectedEdgeIds.has(normalizeText(edge?.id)),
  }));
  const model = {
    schemaVersion: MANUAL_MAP_INTERACTION_SCHEMA_VERSION,
    sourceSchemaVersion: normalizeText(graph.schemaVersion) || MANUAL_MAP_GRAPH_SCHEMA_VERSION,
    projectId: normalizeText(graph.projectId),
    mapId: normalizeText(graph.mapId),
    title: normalizeText(graph.title),
    viewState,
    nodes: projectedNodes,
    edges: projectedEdges,
    counts: {
      nodes: projectedNodes.length,
      edges: projectedEdges.length,
      selectedNodes: viewState.selection.nodeIds.length,
      selectedEdges: viewState.selection.edgeIds.length,
    },
  };
  return {
    ...model,
    meta: {
      interactionHash: hashCanonicalValue(model),
    },
  };
}
