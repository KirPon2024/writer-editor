import { hashCanonicalValue } from '../deriveView.mjs';
import { normalizeManualMapViewState } from './manualMapInteraction.mjs';
import { MANUAL_MAP_GRAPH_SCHEMA_VERSION } from './mindMapGraphTypes.mjs';

export const MANUAL_MAP_VIEWPORT_PLAN_SCHEMA_VERSION = 'manualMap.viewportPlan.v1';

const DEFAULT_LIMITS = Object.freeze({
  overscanPx: 160,
  maxNodes: 500,
  maxEdges: 750,
  labelZoomThreshold: 0.65,
});

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

function normalizePositiveInteger(value, fallback, max) {
  const number = Math.floor(normalizeNumber(value, fallback));
  if (number < 0) return 0;
  return Math.min(max, number);
}

function normalizeLimits(value = {}) {
  const input = isPlainObject(value) ? value : {};
  return {
    overscanPx: normalizePositiveInteger(input.overscanPx, DEFAULT_LIMITS.overscanPx, 10_000),
    maxNodes: normalizePositiveInteger(input.maxNodes, DEFAULT_LIMITS.maxNodes, 100_000),
    maxEdges: normalizePositiveInteger(input.maxEdges, DEFAULT_LIMITS.maxEdges, 200_000),
    labelZoomThreshold: Math.max(0, normalizeNumber(input.labelZoomThreshold, DEFAULT_LIMITS.labelZoomThreshold)),
  };
}

function normalizeNode(rawNode, index) {
  const position = isPlainObject(rawNode?.position) ? rawNode.position : {};
  const id = normalizeText(rawNode?.id) || `node:${index + 1}`;
  return {
    id,
    label: normalizeText(rawNode?.label) || id,
    kind: normalizeText(rawNode?.kind) || 'note',
    x: normalizeNumber(position.x),
    y: normalizeNumber(position.y),
  };
}

function normalizeEdge(rawEdge, index) {
  return {
    id: normalizeText(rawEdge?.id) || `edge:${index + 1}`,
    from: normalizeText(rawEdge?.from),
    to: normalizeText(rawEdge?.to),
    kind: normalizeText(rawEdge?.kind) || 'link',
  };
}

function compareNode(a, b) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  if (a.y !== b.y) return a.y - b.y;
  if (a.x !== b.x) return a.x - b.x;
  return a.id.localeCompare(b.id, 'en', { sensitivity: 'variant' });
}

function compareEdge(a, b) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  const from = a.from.localeCompare(b.from, 'en', { sensitivity: 'variant' });
  if (from !== 0) return from;
  const to = a.to.localeCompare(b.to, 'en', { sensitivity: 'variant' });
  if (to !== 0) return to;
  return a.id.localeCompare(b.id, 'en', { sensitivity: 'variant' });
}

function computeWorldBounds(nodes) {
  if (!nodes.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  let minX = nodes[0].x;
  let minY = nodes[0].y;
  let maxX = nodes[0].x;
  let maxY = nodes[0].y;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x);
    maxY = Math.max(maxY, node.y);
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function computeVisibleWorldRect(viewport, overscanPx) {
  const zoom = viewport.zoom > 0 ? viewport.zoom : 1;
  const overscan = overscanPx / zoom;
  return {
    minX: viewport.x - overscan,
    minY: viewport.y - overscan,
    maxX: viewport.x + (viewport.width / zoom) + overscan,
    maxY: viewport.y + (viewport.height / zoom) + overscan,
  };
}

function isNodeInRect(node, rect) {
  return node.x >= rect.minX && node.x <= rect.maxX && node.y >= rect.minY && node.y <= rect.maxY;
}

function renderModeForNode(node, viewState, limits) {
  if (viewState.selection.focusedNodeId === node.id || viewState.selection.primaryNodeId === node.id) return 'label';
  if (viewState.selection.nodeIds.includes(node.id)) return 'label';
  return viewState.viewport.zoom >= limits.labelZoomThreshold ? 'label' : 'dot';
}

export function buildManualMapViewportPlan(input = {}) {
  const graph = isPlainObject(input.graph) ? input.graph : {};
  const limits = normalizeLimits(input.limits);
  const viewState = normalizeManualMapViewState(input.viewState, graph);
  const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const rawEdges = Array.isArray(graph.edges) ? graph.edges : [];
  const nodes = rawNodes.map((node, index) => normalizeNode(node, index));
  const edges = rawEdges.map((edge, index) => normalizeEdge(edge, index));
  const selectedNodeIds = new Set(viewState.selection.nodeIds);
  if (viewState.selection.focusedNodeId) selectedNodeIds.add(viewState.selection.focusedNodeId);
  if (viewState.selection.primaryNodeId) selectedNodeIds.add(viewState.selection.primaryNodeId);
  const selectedEdgeIds = new Set(viewState.selection.edgeIds);
  const visibleWorldRect = computeVisibleWorldRect(viewState.viewport, limits.overscanPx);
  const candidateNodes = nodes
    .map((node) => ({
      ...node,
      pinned: selectedNodeIds.has(node.id),
      inViewport: isNodeInRect(node, visibleWorldRect),
    }))
    .filter((node) => node.inViewport || node.pinned)
    .sort(compareNode);
  const plannedNodes = candidateNodes.slice(0, limits.maxNodes).map((node) => ({
    id: node.id,
    x: node.x,
    y: node.y,
    kind: node.kind,
    renderMode: renderModeForNode(node, viewState, limits),
    pinned: node.pinned,
    inViewport: node.inViewport,
  }));
  const plannedNodeIds = new Set(plannedNodes.map((node) => node.id));
  const candidateEdges = edges
    .map((edge) => ({
      ...edge,
      pinned: selectedEdgeIds.has(edge.id),
    }))
    .filter((edge) => {
      if (!edge.from || !edge.to) return false;
      if (edge.pinned) return true;
      return plannedNodeIds.has(edge.from) && plannedNodeIds.has(edge.to);
    })
    .sort(compareEdge);
  const plannedEdges = candidateEdges.slice(0, limits.maxEdges).map((edge) => ({
    id: edge.id,
    from: edge.from,
    to: edge.to,
    kind: edge.kind,
    pinned: edge.pinned,
    complete: plannedNodeIds.has(edge.from) && plannedNodeIds.has(edge.to),
  }));
  const plan = {
    schemaVersion: MANUAL_MAP_VIEWPORT_PLAN_SCHEMA_VERSION,
    sourceSchemaVersion: normalizeText(graph.schemaVersion) || MANUAL_MAP_GRAPH_SCHEMA_VERSION,
    projectId: normalizeText(graph.projectId),
    mapId: normalizeText(graph.mapId),
    viewState,
    limits,
    visibleWorldRect,
    worldBounds: computeWorldBounds(nodes),
    nodes: plannedNodes,
    edges: plannedEdges,
    omitted: {
      nodes: Math.max(0, candidateNodes.length - plannedNodes.length),
      edges: Math.max(0, candidateEdges.length - plannedEdges.length),
      offscreenNodes: Math.max(0, nodes.length - candidateNodes.length),
    },
    resourceBudget: {
      inputNodes: nodes.length,
      inputEdges: edges.length,
      plannedNodes: plannedNodes.length,
      plannedEdges: plannedEdges.length,
      withinNodeBudget: plannedNodes.length <= limits.maxNodes,
      withinEdgeBudget: plannedEdges.length <= limits.maxEdges,
    },
  };
  return {
    ...plan,
    meta: {
      viewportPlanHash: hashCanonicalValue(plan),
    },
  };
}
