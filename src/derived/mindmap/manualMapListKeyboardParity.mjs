import { hashCanonicalValue } from '../deriveView.mjs';
import {
  MANUAL_MAP_VIEW_INTENT,
  normalizeManualMapViewState,
  reduceManualMapViewIntent,
} from './manualMapInteraction.mjs';
import { MANUAL_MAP_GRAPH_SCHEMA_VERSION } from './mindMapGraphTypes.mjs';

export const MANUAL_MAP_LIST_PARITY_SCHEMA_VERSION = 'manualMap.listParity.v1';
export const MANUAL_MAP_LIST_STATE_SCHEMA_VERSION = 'manualMap.listState.v1';
export const MANUAL_MAP_KEYBOARD_INTENT_SCHEMA_VERSION = 'manualMap.keyboardIntent.v1';

export const MANUAL_MAP_LIST_ROW_KIND = Object.freeze({
  NODE: 'node',
  EDGE: 'edge',
});

export const MANUAL_MAP_LIST_KEY_ACTION = Object.freeze({
  NEXT: 'next',
  PREVIOUS: 'previous',
  FIRST: 'first',
  LAST: 'last',
  ACTIVATE: 'activate',
  CLEAR_SELECTION: 'clearSelection',
  NOOP: 'noop',
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

function compareText(a, b) {
  return String(a).localeCompare(String(b), 'en', { sensitivity: 'variant' });
}

function normalizeNode(rawNode, index) {
  const position = isPlainObject(rawNode?.position) ? rawNode.position : {};
  const id = normalizeText(rawNode?.id) || `node:${index + 1}`;
  const label = normalizeText(rawNode?.label) || id;
  return {
    id,
    label,
    kind: normalizeText(rawNode?.kind) || 'note',
    x: normalizeNumber(position.x),
    y: normalizeNumber(position.y),
    target: {
      kind: normalizeText(rawNode?.target?.kind),
      id: normalizeText(rawNode?.target?.id),
    },
  };
}

function normalizeEdge(rawEdge, index) {
  const id = normalizeText(rawEdge?.id) || `edge:${index + 1}`;
  const from = normalizeText(rawEdge?.from);
  const to = normalizeText(rawEdge?.to);
  return {
    id,
    from,
    to,
    kind: normalizeText(rawEdge?.kind) || 'link',
    label: normalizeText(rawEdge?.label) || `${from} -> ${to}`.trim(),
  };
}

function compareNodeForList(a, b) {
  if (a.y !== b.y) return a.y - b.y;
  if (a.x !== b.x) return a.x - b.x;
  return compareText(a.id, b.id);
}

function compareEdgeForList(a, b) {
  const from = compareText(a.from, b.from);
  if (from !== 0) return from;
  const to = compareText(a.to, b.to);
  if (to !== 0) return to;
  return compareText(a.id, b.id);
}

function normalizeGraph(graph = {}) {
  const source = isPlainObject(graph) ? graph : {};
  const nodes = (Array.isArray(source.nodes) ? source.nodes : [])
    .map((node, index) => normalizeNode(node, index))
    .sort(compareNodeForList);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (Array.isArray(source.edges) ? source.edges : [])
    .map((edge, index) => normalizeEdge(edge, index))
    .filter((edge) => edge.from && edge.to && nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .sort(compareEdgeForList);
  return {
    source,
    nodes,
    edges,
  };
}

function rowIdFor(kind, id) {
  return `${kind}:${id}`;
}

function rowIntent(kind, id) {
  if (kind === MANUAL_MAP_LIST_ROW_KIND.NODE) {
    return {
      type: MANUAL_MAP_VIEW_INTENT.SELECT_NODE,
      payload: { nodeId: id },
    };
  }
  return {
    type: MANUAL_MAP_VIEW_INTENT.SELECT_EDGE,
    payload: { edgeId: id },
  };
}

function buildRows(graph, viewState) {
  const selectedNodeIds = new Set(viewState.selection.nodeIds);
  const selectedEdgeIds = new Set(viewState.selection.edgeIds);
  const nodeRows = graph.nodes.map((node) => {
    const selected = selectedNodeIds.has(node.id);
    const focused = viewState.selection.focusedNodeId === node.id;
    const primary = viewState.selection.primaryNodeId === node.id;
    return {
      rowId: rowIdFor(MANUAL_MAP_LIST_ROW_KIND.NODE, node.id),
      rowKind: MANUAL_MAP_LIST_ROW_KIND.NODE,
      itemId: node.id,
      label: node.label,
      kind: node.kind,
      target: node.target,
      selected,
      focused,
      primary,
      position: { x: node.x, y: node.y },
      selectionIntent: rowIntent(MANUAL_MAP_LIST_ROW_KIND.NODE, node.id),
    };
  });
  const edgeRows = graph.edges.map((edge) => ({
    rowId: rowIdFor(MANUAL_MAP_LIST_ROW_KIND.EDGE, edge.id),
    rowKind: MANUAL_MAP_LIST_ROW_KIND.EDGE,
    itemId: edge.id,
    label: edge.label,
    kind: edge.kind,
    endpoints: { from: edge.from, to: edge.to },
    selected: selectedEdgeIds.has(edge.id),
    focused: false,
    primary: false,
    selectionIntent: rowIntent(MANUAL_MAP_LIST_ROW_KIND.EDGE, edge.id),
  }));
  return [...nodeRows, ...edgeRows];
}

function normalizeActiveRowId(listState, rows, viewState) {
  const rowIds = new Set(rows.map((row) => row.rowId));
  const input = isPlainObject(listState) ? listState : {};
  const explicit = normalizeText(input.activeRowId);
  if (rowIds.has(explicit)) return explicit;
  if (viewState.selection.focusedNodeId) {
    const focused = rowIdFor(MANUAL_MAP_LIST_ROW_KIND.NODE, viewState.selection.focusedNodeId);
    if (rowIds.has(focused)) return focused;
  }
  if (viewState.selection.primaryNodeId) {
    const primary = rowIdFor(MANUAL_MAP_LIST_ROW_KIND.NODE, viewState.selection.primaryNodeId);
    if (rowIds.has(primary)) return primary;
  }
  const selectedNode = viewState.selection.nodeIds[0];
  if (selectedNode) {
    const rowId = rowIdFor(MANUAL_MAP_LIST_ROW_KIND.NODE, selectedNode);
    if (rowIds.has(rowId)) return rowId;
  }
  const selectedEdge = viewState.selection.edgeIds[0];
  if (selectedEdge) {
    const rowId = rowIdFor(MANUAL_MAP_LIST_ROW_KIND.EDGE, selectedEdge);
    if (rowIds.has(rowId)) return rowId;
  }
  return rows[0]?.rowId || '';
}

export function normalizeManualMapListState(listState = {}, rows = [], viewState = {}) {
  const activeRowId = normalizeActiveRowId(listState, rows, viewState);
  return {
    schemaVersion: MANUAL_MAP_LIST_STATE_SCHEMA_VERSION,
    activeRowId,
  };
}

function attachListSemantics(rows, activeRowId) {
  const setSize = rows.length;
  return rows.map((row, index) => ({
    ...row,
    active: row.rowId === activeRowId,
    accessibility: {
      role: 'option',
      selected: row.selected,
      label: row.label,
      posInSet: index + 1,
      setSize,
    },
  }));
}

export function buildManualMapListParityModel(input = {}) {
  const graph = normalizeGraph(input.graph);
  const viewState = normalizeManualMapViewState(input.viewState, graph.source);
  const rowsWithoutState = buildRows(graph, viewState);
  const listState = normalizeManualMapListState(input.listState, rowsWithoutState, viewState);
  const rows = attachListSemantics(rowsWithoutState, listState.activeRowId);
  const model = {
    schemaVersion: MANUAL_MAP_LIST_PARITY_SCHEMA_VERSION,
    sourceSchemaVersion: normalizeText(graph.source.schemaVersion) || MANUAL_MAP_GRAPH_SCHEMA_VERSION,
    projectId: normalizeText(graph.source.projectId),
    mapId: normalizeText(graph.source.mapId),
    viewState,
    listState,
    rows,
    counts: {
      rows: rows.length,
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      selectedRows: rows.filter((row) => row.selected).length,
    },
  };
  return {
    ...model,
    meta: {
      listParityHash: hashCanonicalValue(model),
    },
  };
}

function normalizeKeyAction(key) {
  if (key === ' ') return MANUAL_MAP_LIST_KEY_ACTION.ACTIVATE;
  const normalized = normalizeText(key);
  if (normalized === 'ArrowDown' || normalized === 'Down') return MANUAL_MAP_LIST_KEY_ACTION.NEXT;
  if (normalized === 'ArrowUp' || normalized === 'Up') return MANUAL_MAP_LIST_KEY_ACTION.PREVIOUS;
  if (normalized === 'Home') return MANUAL_MAP_LIST_KEY_ACTION.FIRST;
  if (normalized === 'End') return MANUAL_MAP_LIST_KEY_ACTION.LAST;
  if (normalized === 'Enter' || normalized === ' ') return MANUAL_MAP_LIST_KEY_ACTION.ACTIVATE;
  if (normalized === 'Escape' || normalized === 'Esc') return MANUAL_MAP_LIST_KEY_ACTION.CLEAR_SELECTION;
  return MANUAL_MAP_LIST_KEY_ACTION.NOOP;
}

function moveIndex(currentIndex, action, rowCount) {
  if (rowCount <= 0) return -1;
  if (action === MANUAL_MAP_LIST_KEY_ACTION.FIRST) return 0;
  if (action === MANUAL_MAP_LIST_KEY_ACTION.LAST) return rowCount - 1;
  if (action === MANUAL_MAP_LIST_KEY_ACTION.NEXT) return Math.min(rowCount - 1, currentIndex + 1);
  if (action === MANUAL_MAP_LIST_KEY_ACTION.PREVIOUS) return Math.max(0, currentIndex - 1);
  return currentIndex;
}

export function reduceManualMapListKeyboardIntent(input = {}) {
  const model = buildManualMapListParityModel(input);
  const action = normalizeKeyAction(input.key);
  const currentIndex = model.rows.findIndex((row) => row.rowId === model.listState.activeRowId);
  if (action === MANUAL_MAP_LIST_KEY_ACTION.NOOP || !model.rows.length || currentIndex < 0) {
    return {
      schemaVersion: MANUAL_MAP_KEYBOARD_INTENT_SCHEMA_VERSION,
      action: MANUAL_MAP_LIST_KEY_ACTION.NOOP,
      key: normalizeText(input.key),
      viewState: model.viewState,
      listState: model.listState,
      selectionIntent: null,
      reason: 'NO_MATCHING_KEY',
      meta: { keyboardIntentHash: hashCanonicalValue({ action, model }) },
    };
  }
  if (
    action === MANUAL_MAP_LIST_KEY_ACTION.NEXT
    || action === MANUAL_MAP_LIST_KEY_ACTION.PREVIOUS
    || action === MANUAL_MAP_LIST_KEY_ACTION.FIRST
    || action === MANUAL_MAP_LIST_KEY_ACTION.LAST
  ) {
    const nextIndex = moveIndex(currentIndex, action, model.rows.length);
    const nextListState = {
      schemaVersion: MANUAL_MAP_LIST_STATE_SCHEMA_VERSION,
      activeRowId: model.rows[nextIndex].rowId,
    };
    const result = {
      schemaVersion: MANUAL_MAP_KEYBOARD_INTENT_SCHEMA_VERSION,
      action,
      key: normalizeText(input.key),
      viewState: model.viewState,
      listState: nextListState,
      selectionIntent: null,
      reason: 'NAVIGATED_LIST',
    };
    return {
      ...result,
      meta: { keyboardIntentHash: hashCanonicalValue(result) },
    };
  }
  if (action === MANUAL_MAP_LIST_KEY_ACTION.CLEAR_SELECTION) {
    const nextViewState = reduceManualMapViewIntent(model.viewState, {
      type: MANUAL_MAP_VIEW_INTENT.CLEAR_SELECTION,
    }, input.graph);
    const result = {
      schemaVersion: MANUAL_MAP_KEYBOARD_INTENT_SCHEMA_VERSION,
      action,
      key: normalizeText(input.key),
      viewState: nextViewState,
      listState: model.listState,
      selectionIntent: { type: MANUAL_MAP_VIEW_INTENT.CLEAR_SELECTION, payload: {} },
      reason: 'CLEARED_SELECTION',
    };
    return {
      ...result,
      meta: { keyboardIntentHash: hashCanonicalValue(result) },
    };
  }
  const activeRow = model.rows[currentIndex];
  const selectionIntent = {
    ...activeRow.selectionIntent,
    payload: {
      ...activeRow.selectionIntent.payload,
      additive: input.additive === true,
    },
  };
  const nextViewState = reduceManualMapViewIntent(model.viewState, selectionIntent, input.graph);
  const result = {
    schemaVersion: MANUAL_MAP_KEYBOARD_INTENT_SCHEMA_VERSION,
    action,
    key: normalizeText(input.key),
    viewState: nextViewState,
    listState: model.listState,
    selectionIntent,
    reason: 'ACTIVATED_ROW',
  };
  return {
    ...result,
    meta: { keyboardIntentHash: hashCanonicalValue(result) },
  };
}
