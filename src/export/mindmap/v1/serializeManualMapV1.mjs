import { hashCanonicalValue } from '../../../derived/deriveView.mjs';
import { MANUAL_MAP_GRAPH_SCHEMA_VERSION } from '../../../derived/mindmap/index.mjs';
import { appendLoss, createLossReport, finalizeLossReport } from './lossReport.mjs';

export const MANUAL_MAP_EXPORT_SCHEMA_VERSION = 'manualMap.export.json.v1';
export const MANUAL_MAP_EXPORT_FORMAT = 'manual-map-json';
export const MANUAL_MAP_EXPORT_SOURCE_SCHEMA_VERSION = MANUAL_MAP_GRAPH_SCHEMA_VERSION;

export const MANUAL_MAP_EXPORT_LOSS_REASON_CODES = Object.freeze({
  INVALID_GRAPH_SHAPE_DOWNGRADED: 'MMANV1_INVALID_GRAPH_SHAPE_DOWNGRADED',
  INVALID_NODE_SHAPE_DROPPED: 'MMANV1_INVALID_NODE_SHAPE_DROPPED',
  NODE_ID_NORMALIZED: 'MMANV1_NODE_ID_NORMALIZED',
  NODE_LABEL_NORMALIZED: 'MMANV1_NODE_LABEL_NORMALIZED',
  NODE_POSITION_NORMALIZED: 'MMANV1_NODE_POSITION_NORMALIZED',
  DUPLICATE_NODE_ID_REWRITTEN: 'MMANV1_DUPLICATE_NODE_ID_REWRITTEN',
  INVALID_EDGE_SHAPE_DROPPED: 'MMANV1_INVALID_EDGE_SHAPE_DROPPED',
  EDGE_ENDPOINT_MISSING_DROPPED: 'MMANV1_EDGE_ENDPOINT_MISSING_DROPPED',
  EDGE_ENDPOINT_UNKNOWN_DROPPED: 'MMANV1_EDGE_ENDPOINT_UNKNOWN_DROPPED',
});

function normalizeText(value) {
  return String(value ?? '').replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
}

function normalizeNumber(value, path, report) {
  const number = Number(value);
  if (Number.isFinite(number)) return number;
  appendLoss(report, {
    kind: 'EXPORT_DOWNGRADE',
    reasonCode: MANUAL_MAP_EXPORT_LOSS_REASON_CODES.NODE_POSITION_NORMALIZED,
    path,
    note: 'Node position normalized to 0.',
    evidence: String(value ?? ''),
  });
  return 0;
}

function normalizeNode(rawNode, index, usedIds, report) {
  const path = `node:${index + 1}`;
  if (!rawNode || typeof rawNode !== 'object' || Array.isArray(rawNode)) {
    appendLoss(report, {
      kind: 'EXPORT_DROP',
      reasonCode: MANUAL_MAP_EXPORT_LOSS_REASON_CODES.INVALID_NODE_SHAPE_DROPPED,
      path,
      note: 'Invalid manual map node shape dropped.',
      evidence: String(rawNode),
    });
    return null;
  }

  let id = normalizeText(rawNode.id);
  if (!id) {
    id = `node:${index + 1}`;
    appendLoss(report, {
      kind: 'EXPORT_DOWNGRADE',
      reasonCode: MANUAL_MAP_EXPORT_LOSS_REASON_CODES.NODE_ID_NORMALIZED,
      path,
      note: 'Manual map node id was missing and was normalized.',
      evidence: String(rawNode.id ?? ''),
    });
  }
  if (usedIds.has(id)) {
    const next = `${id}#${index + 1}`;
    appendLoss(report, {
      kind: 'EXPORT_DOWNGRADE',
      reasonCode: MANUAL_MAP_EXPORT_LOSS_REASON_CODES.DUPLICATE_NODE_ID_REWRITTEN,
      path,
      note: 'Duplicate manual map node id rewritten to deterministic suffix.',
      evidence: id,
    });
    id = next;
  }
  usedIds.add(id);

  let label = normalizeText(rawNode.label);
  if (!label) {
    label = id;
    appendLoss(report, {
      kind: 'EXPORT_DOWNGRADE',
      reasonCode: MANUAL_MAP_EXPORT_LOSS_REASON_CODES.NODE_LABEL_NORMALIZED,
      path,
      note: 'Manual map node label was empty and normalized from node id.',
      evidence: String(rawNode.label ?? ''),
    });
  }

  const position = rawNode.position && typeof rawNode.position === 'object' && !Array.isArray(rawNode.position)
    ? rawNode.position
    : {};
  const target = rawNode.target && typeof rawNode.target === 'object' && !Array.isArray(rawNode.target)
    ? rawNode.target
    : {};
  return {
    id,
    label,
    kind: normalizeText(rawNode.kind) || 'note',
    position: {
      x: normalizeNumber(position.x, `${path}.position.x`, report),
      y: normalizeNumber(position.y, `${path}.position.y`, report),
    },
    target: {
      kind: normalizeText(target.kind),
      id: normalizeText(target.id),
    },
  };
}

function normalizeEdge(rawEdge, index, validNodeIds, report) {
  const path = `edge:${index + 1}`;
  if (!rawEdge || typeof rawEdge !== 'object' || Array.isArray(rawEdge)) {
    appendLoss(report, {
      kind: 'EXPORT_DROP',
      reasonCode: MANUAL_MAP_EXPORT_LOSS_REASON_CODES.INVALID_EDGE_SHAPE_DROPPED,
      path,
      note: 'Invalid manual map edge shape dropped.',
      evidence: String(rawEdge),
    });
    return null;
  }
  const from = normalizeText(rawEdge.from);
  const to = normalizeText(rawEdge.to);
  if (!from || !to) {
    appendLoss(report, {
      kind: 'EXPORT_DROP',
      reasonCode: MANUAL_MAP_EXPORT_LOSS_REASON_CODES.EDGE_ENDPOINT_MISSING_DROPPED,
      path,
      note: 'Manual map edge endpoints are required.',
      evidence: JSON.stringify({ from: rawEdge.from, to: rawEdge.to }),
    });
    return null;
  }
  if (!validNodeIds.has(from) || !validNodeIds.has(to)) {
    appendLoss(report, {
      kind: 'EXPORT_DROP',
      reasonCode: MANUAL_MAP_EXPORT_LOSS_REASON_CODES.EDGE_ENDPOINT_UNKNOWN_DROPPED,
      path,
      note: 'Manual map edge references unknown node ids and was dropped.',
      evidence: JSON.stringify({ from, to }),
    });
    return null;
  }
  return {
    id: normalizeText(rawEdge.id) || `edge:${index + 1}`,
    from,
    to,
    kind: normalizeText(rawEdge.kind) || 'link',
    label: normalizeText(rawEdge.label),
  };
}

function normalizeGraph(graph, report) {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
    appendLoss(report, {
      kind: 'EXPORT_DOWNGRADE',
      reasonCode: MANUAL_MAP_EXPORT_LOSS_REASON_CODES.INVALID_GRAPH_SHAPE_DOWNGRADED,
      path: 'graph',
      note: 'Invalid manual map graph shape downgraded to empty export.',
      evidence: String(graph),
    });
    return {
      projectId: '',
      mapId: '',
      title: '',
      sourceSchemaVersion: MANUAL_MAP_EXPORT_SOURCE_SCHEMA_VERSION,
      nodes: [],
      edges: [],
    };
  }

  const usedIds = new Set();
  const nodes = [];
  const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  for (let index = 0; index < rawNodes.length; index += 1) {
    const node = normalizeNode(rawNodes[index], index, usedIds, report);
    if (node) nodes.push(node);
  }

  const validNodeIds = new Set(nodes.map((node) => node.id));
  const edges = [];
  const rawEdges = Array.isArray(graph.edges) ? graph.edges : [];
  for (let index = 0; index < rawEdges.length; index += 1) {
    const edge = normalizeEdge(rawEdges[index], index, validNodeIds, report);
    if (edge) edges.push(edge);
  }

  nodes.sort((a, b) => a.id.localeCompare(b.id, 'en', { sensitivity: 'variant' }));
  edges.sort((a, b) => a.id.localeCompare(b.id, 'en', { sensitivity: 'variant' }));
  return {
    projectId: normalizeText(graph.projectId),
    mapId: normalizeText(graph.mapId),
    title: normalizeText(graph.title),
    sourceSchemaVersion: normalizeText(graph.schemaVersion) || MANUAL_MAP_EXPORT_SOURCE_SCHEMA_VERSION,
    nodes,
    edges,
  };
}

export function serializeManualMapExportJsonV1WithLossReport(graph) {
  const lossReport = createLossReport();
  const normalized = normalizeGraph(graph, lossReport);
  const payload = {
    schemaVersion: MANUAL_MAP_EXPORT_SCHEMA_VERSION,
    format: MANUAL_MAP_EXPORT_FORMAT,
    sourceSchemaVersion: normalized.sourceSchemaVersion,
    projectId: normalized.projectId,
    mapId: normalized.mapId,
    title: normalized.title,
    nodes: normalized.nodes,
    edges: normalized.edges,
    recovery: {
      humanReadable: true,
      summary: `${normalized.title || normalized.mapId || 'Untitled manual map'}: ${normalized.nodes.length} nodes, ${normalized.edges.length} edges`,
      graphHash: hashCanonicalValue({
        projectId: normalized.projectId,
        mapId: normalized.mapId,
        title: normalized.title,
        nodes: normalized.nodes,
        edges: normalized.edges,
      }),
    },
  };
  return {
    json: `${JSON.stringify(payload, null, 2)}\n`,
    lossReport: finalizeLossReport(lossReport),
  };
}

export function serializeManualMapExportJsonV1(graph) {
  return serializeManualMapExportJsonV1WithLossReport(graph).json;
}
