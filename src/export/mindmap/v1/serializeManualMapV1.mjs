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
  INVALID_ATTACHMENT_SHAPE_DROPPED: 'MMANV1_INVALID_ATTACHMENT_SHAPE_DROPPED',
  ATTACHMENT_NODE_UNKNOWN_DROPPED: 'MMANV1_ATTACHMENT_NODE_UNKNOWN_DROPPED',
  ATTACHMENT_SOURCE_HASH_MISSING_DROPPED: 'MMANV1_ATTACHMENT_SOURCE_HASH_MISSING_DROPPED',
  INVALID_PORTAL_SHAPE_DROPPED: 'MMANV1_INVALID_PORTAL_SHAPE_DROPPED',
  PORTAL_SOURCE_NODE_UNKNOWN_DROPPED: 'MMANV1_PORTAL_SOURCE_NODE_UNKNOWN_DROPPED',
  PORTAL_TARGET_MAP_MISSING_DROPPED: 'MMANV1_PORTAL_TARGET_MAP_MISSING_DROPPED',
  INVALID_TEMPLATE_SHAPE_DROPPED: 'MMANV1_INVALID_TEMPLATE_SHAPE_DROPPED',
  TEMPLATE_NODE_REFERENCES_EMPTY_DROPPED: 'MMANV1_TEMPLATE_NODE_REFERENCES_EMPTY_DROPPED',
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

function normalizePositiveInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.floor(number));
}

function normalizeAttachment(rawAttachment, index, validNodeIds, report) {
  const path = `attachment:${index + 1}`;
  if (!rawAttachment || typeof rawAttachment !== 'object' || Array.isArray(rawAttachment)) {
    appendLoss(report, {
      kind: 'EXPORT_DROP',
      reasonCode: MANUAL_MAP_EXPORT_LOSS_REASON_CODES.INVALID_ATTACHMENT_SHAPE_DROPPED,
      path,
      note: 'Invalid manual map attachment shape dropped.',
      evidence: String(rawAttachment),
    });
    return null;
  }
  const nodeId = normalizeText(rawAttachment.nodeId);
  if (!nodeId || !validNodeIds.has(nodeId)) {
    appendLoss(report, {
      kind: 'EXPORT_DROP',
      reasonCode: MANUAL_MAP_EXPORT_LOSS_REASON_CODES.ATTACHMENT_NODE_UNKNOWN_DROPPED,
      path,
      note: 'Manual map attachment references an unknown node and was dropped.',
      evidence: nodeId,
    });
    return null;
  }
  const source = rawAttachment.source && typeof rawAttachment.source === 'object' && !Array.isArray(rawAttachment.source)
    ? rawAttachment.source
    : {};
  const sourceHash = normalizeText(source.sourceHash);
  if (!sourceHash) {
    appendLoss(report, {
      kind: 'EXPORT_DROP',
      reasonCode: MANUAL_MAP_EXPORT_LOSS_REASON_CODES.ATTACHMENT_SOURCE_HASH_MISSING_DROPPED,
      path,
      note: 'Manual map attachment source hash is required for pathless recovery.',
      evidence: normalizeText(rawAttachment.id),
    });
    return null;
  }
  const id = normalizeText(rawAttachment.id) || `attachment:${index + 1}`;
  return {
    id,
    nodeId,
    label: normalizeText(rawAttachment.label) || id,
    kind: normalizeText(rawAttachment.kind) || normalizeText(rawAttachment.attachmentKind) || 'reference',
    source: {
      name: normalizeText(source.name),
      mediaType: normalizeText(source.mediaType),
      sourceHash,
      byteLength: normalizePositiveInteger(source.byteLength),
    },
    storedContent: rawAttachment.storedContent === true,
  };
}

function normalizePortal(rawPortal, index, validNodeIds, report) {
  const path = `portal:${index + 1}`;
  if (!rawPortal || typeof rawPortal !== 'object' || Array.isArray(rawPortal)) {
    appendLoss(report, {
      kind: 'EXPORT_DROP',
      reasonCode: MANUAL_MAP_EXPORT_LOSS_REASON_CODES.INVALID_PORTAL_SHAPE_DROPPED,
      path,
      note: 'Invalid manual map portal shape dropped.',
      evidence: String(rawPortal),
    });
    return null;
  }
  const fromNodeId = normalizeText(rawPortal.fromNodeId);
  if (!fromNodeId || !validNodeIds.has(fromNodeId)) {
    appendLoss(report, {
      kind: 'EXPORT_DROP',
      reasonCode: MANUAL_MAP_EXPORT_LOSS_REASON_CODES.PORTAL_SOURCE_NODE_UNKNOWN_DROPPED,
      path,
      note: 'Manual map portal source node is missing or unknown.',
      evidence: fromNodeId,
    });
    return null;
  }
  const target = rawPortal.target && typeof rawPortal.target === 'object' && !Array.isArray(rawPortal.target)
    ? rawPortal.target
    : {};
  const targetMapId = normalizeText(target.mapId);
  if (!targetMapId) {
    appendLoss(report, {
      kind: 'EXPORT_DROP',
      reasonCode: MANUAL_MAP_EXPORT_LOSS_REASON_CODES.PORTAL_TARGET_MAP_MISSING_DROPPED,
      path,
      note: 'Manual map portal target map id is required.',
      evidence: normalizeText(rawPortal.id),
    });
    return null;
  }
  const id = normalizeText(rawPortal.id) || `portal:${index + 1}`;
  return {
    id,
    fromNodeId,
    target: {
      mapId: targetMapId,
      nodeId: normalizeText(target.nodeId),
    },
    label: normalizeText(rawPortal.label) || 'Portal',
  };
}

function normalizeTemplate(rawTemplate, index, validNodeIds, validEdgeIds, report) {
  const path = `template:${index + 1}`;
  if (!rawTemplate || typeof rawTemplate !== 'object' || Array.isArray(rawTemplate)) {
    appendLoss(report, {
      kind: 'EXPORT_DROP',
      reasonCode: MANUAL_MAP_EXPORT_LOSS_REASON_CODES.INVALID_TEMPLATE_SHAPE_DROPPED,
      path,
      note: 'Invalid manual map template shape dropped.',
      evidence: String(rawTemplate),
    });
    return null;
  }
  const appliedNodeIds = Array.isArray(rawTemplate.appliedNodeIds)
    ? rawTemplate.appliedNodeIds.map(normalizeText).filter((nodeId) => validNodeIds.has(nodeId)).sort()
    : [];
  if (appliedNodeIds.length === 0) {
    appendLoss(report, {
      kind: 'EXPORT_DROP',
      reasonCode: MANUAL_MAP_EXPORT_LOSS_REASON_CODES.TEMPLATE_NODE_REFERENCES_EMPTY_DROPPED,
      path,
      note: 'Manual map template has no valid applied node references.',
      evidence: normalizeText(rawTemplate.id),
    });
    return null;
  }
  const id = normalizeText(rawTemplate.id) || `template:${index + 1}`;
  return {
    id,
    templateId: normalizeText(rawTemplate.templateId),
    name: normalizeText(rawTemplate.name) || 'Manual map template',
    appliedNodeIds,
    appliedEdgeIds: Array.isArray(rawTemplate.appliedEdgeIds)
      ? rawTemplate.appliedEdgeIds.map(normalizeText).filter((edgeId) => validEdgeIds.has(edgeId)).sort()
      : [],
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
      attachments: [],
      portals: [],
      templates: [],
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
  const validEdgeIds = new Set(edges.map((edge) => edge.id));

  const attachments = [];
  const rawAttachments = Array.isArray(graph.attachments) ? graph.attachments : [];
  for (let index = 0; index < rawAttachments.length; index += 1) {
    const attachment = normalizeAttachment(rawAttachments[index], index, validNodeIds, report);
    if (attachment) attachments.push(attachment);
  }

  const portals = [];
  const rawPortals = Array.isArray(graph.portals) ? graph.portals : [];
  for (let index = 0; index < rawPortals.length; index += 1) {
    const portal = normalizePortal(rawPortals[index], index, validNodeIds, report);
    if (portal) portals.push(portal);
  }

  const templates = [];
  const rawTemplates = Array.isArray(graph.templates) ? graph.templates : [];
  for (let index = 0; index < rawTemplates.length; index += 1) {
    const template = normalizeTemplate(rawTemplates[index], index, validNodeIds, validEdgeIds, report);
    if (template) templates.push(template);
  }

  nodes.sort((a, b) => a.id.localeCompare(b.id, 'en', { sensitivity: 'variant' }));
  edges.sort((a, b) => a.id.localeCompare(b.id, 'en', { sensitivity: 'variant' }));
  attachments.sort((a, b) => a.id.localeCompare(b.id, 'en', { sensitivity: 'variant' }));
  portals.sort((a, b) => a.id.localeCompare(b.id, 'en', { sensitivity: 'variant' }));
  templates.sort((a, b) => a.id.localeCompare(b.id, 'en', { sensitivity: 'variant' }));
  return {
    projectId: normalizeText(graph.projectId),
    mapId: normalizeText(graph.mapId),
    title: normalizeText(graph.title),
    sourceSchemaVersion: normalizeText(graph.schemaVersion) || MANUAL_MAP_EXPORT_SOURCE_SCHEMA_VERSION,
    nodes,
    edges,
    attachments,
    portals,
    templates,
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
    attachments: normalized.attachments,
    portals: normalized.portals,
    templates: normalized.templates,
    recovery: {
      humanReadable: true,
      summary: `${normalized.title || normalized.mapId || 'Untitled manual map'}: ${normalized.nodes.length} nodes, ${normalized.edges.length} edges`,
      portabilitySummary: `${normalized.attachments.length} attachments, ${normalized.portals.length} portals, ${normalized.templates.length} templates`,
      graphHash: hashCanonicalValue({
        projectId: normalized.projectId,
        mapId: normalized.mapId,
        title: normalized.title,
        nodes: normalized.nodes,
        edges: normalized.edges,
        attachments: normalized.attachments,
        portals: normalized.portals,
        templates: normalized.templates,
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
