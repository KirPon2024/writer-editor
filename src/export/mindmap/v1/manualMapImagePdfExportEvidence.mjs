import { hashCanonicalValue } from '../../../derived/deriveView.mjs';

export const MANUAL_MAP_IMAGE_PDF_EXPORT_EVIDENCE_SCHEMA_VERSION = 'manualMap.imagePdfExportEvidence.v1';

const MANUAL_MAP_IMAGE_PDF_EXPORT_OP = 'manualMap.imagePdfExportEvidence';
const FORBIDDEN_PRIVATE_KEYS = Object.freeze([
  'absolutePath',
  'base64',
  'bytes',
  'content',
  'data',
  'filePath',
  'localPath',
  'path',
  'uri',
  'url',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function utf8ByteLength(value) {
  return new TextEncoder().encode(String(value ?? '')).length;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function typedFailure(code, reason, details = {}) {
  const error = { code, op: MANUAL_MAP_IMAGE_PDF_EXPORT_OP, reason };
  if (isPlainObject(details) && Object.keys(details).length > 0) error.details = cloneJson(details);
  return { ok: false, error };
}

function findForbiddenPrivateKey(value, path = '$') {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenPrivateKey(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!isPlainObject(value)) return null;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_PRIVATE_KEYS.includes(key)) return { key, path: `${path}.${key}` };
    const found = findForbiddenPrivateKey(value[key], `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function normalizeNode(rawNode, index) {
  if (!isPlainObject(rawNode)) return null;
  const id = normalizeText(rawNode.id);
  const label = normalizeText(rawNode.label) || id;
  if (!id || !label) return null;
  const position = isPlainObject(rawNode.position) ? rawNode.position : {};
  return {
    id,
    label,
    kind: normalizeText(rawNode.kind) || 'note',
    position: {
      x: normalizeNumber(position.x) || (index % 6) * 180,
      y: normalizeNumber(position.y) || Math.floor(index / 6) * 120,
    },
  };
}

function normalizeEdge(rawEdge, validNodeIds) {
  if (!isPlainObject(rawEdge)) return null;
  const id = normalizeText(rawEdge.id);
  const from = normalizeText(rawEdge.from);
  const to = normalizeText(rawEdge.to);
  if (!id || !from || !to || from === to || !validNodeIds.has(from) || !validNodeIds.has(to)) return null;
  return {
    id,
    from,
    to,
    kind: normalizeText(rawEdge.kind) || 'link',
    label: normalizeText(rawEdge.label),
  };
}

function normalizeReferenceArray(value, validIds, idKey) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isPlainObject)
    .map((item) => ({
      id: normalizeText(item.id),
      label: normalizeText(item.label) || normalizeText(item.name) || normalizeText(item.id),
      [idKey]: normalizeText(item[idKey]),
    }))
    .filter((item) => item.id && item[idKey] && validIds.has(item[idKey]))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeTemplates(value, validNodeIds, validEdgeIds) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isPlainObject)
    .map((item) => ({
      id: normalizeText(item.id),
      templateId: normalizeText(item.templateId),
      name: normalizeText(item.name) || normalizeText(item.id),
      appliedNodeIds: Array.isArray(item.appliedNodeIds)
        ? item.appliedNodeIds.map(normalizeText).filter((nodeId) => validNodeIds.has(nodeId)).sort()
        : [],
      appliedEdgeIds: Array.isArray(item.appliedEdgeIds)
        ? item.appliedEdgeIds.map(normalizeText).filter((edgeId) => validEdgeIds.has(edgeId)).sort()
        : [],
    }))
    .filter((item) => item.id && item.appliedNodeIds.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function normalizePortals(value, validNodeIds) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isPlainObject)
    .map((item) => {
      const target = isPlainObject(item.target) ? item.target : {};
      return {
        id: normalizeText(item.id),
        fromNodeId: normalizeText(item.fromNodeId),
        target: {
          mapId: normalizeText(target.mapId),
          nodeId: normalizeText(target.nodeId),
        },
        label: normalizeText(item.label) || 'Portal',
      };
    })
    .filter((item) => item.id && validNodeIds.has(item.fromNodeId) && item.target.mapId)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeGraph(graph) {
  if (!isPlainObject(graph)) return typedFailure('E_MANUAL_MAP_IMAGE_PDF_GRAPH_INVALID', 'GRAPH_INVALID');
  const forbidden = findForbiddenPrivateKey(graph);
  if (forbidden) return typedFailure('E_MANUAL_MAP_IMAGE_PDF_PRIVATE_DATA_REJECTED', 'PRIVATE_DATA_REJECTED', forbidden);
  const projectId = normalizeText(graph.projectId);
  const mapId = normalizeText(graph.mapId);
  if (!projectId || !mapId) {
    return typedFailure('E_MANUAL_MAP_IMAGE_PDF_IDENTITY_REQUIRED', 'IDENTITY_REQUIRED', { projectId, mapId });
  }
  const nodes = (Array.isArray(graph.nodes) ? graph.nodes : [])
    .map(normalizeNode)
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));
  const uniqueNodeIds = new Set(nodes.map((node) => node.id));
  if (nodes.length === 0 || uniqueNodeIds.size !== nodes.length) {
    return typedFailure('E_MANUAL_MAP_IMAGE_PDF_NODES_INVALID', 'NODES_INVALID', { nodeCount: nodes.length });
  }
  const edges = (Array.isArray(graph.edges) ? graph.edges : [])
    .map((edge) => normalizeEdge(edge, uniqueNodeIds))
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));
  const validEdgeIds = new Set(edges.map((edge) => edge.id));
  return {
    ok: true,
    value: {
      projectId,
      mapId,
      title: normalizeText(graph.title) || mapId,
      nodes,
      edges,
      attachments: normalizeReferenceArray(graph.attachments, uniqueNodeIds, 'nodeId'),
      portals: normalizePortals(graph.portals, uniqueNodeIds),
      templates: normalizeTemplates(graph.templates, uniqueNodeIds, validEdgeIds),
    },
  };
}

function graphBounds(nodes) {
  const xs = nodes.map((node) => node.position.x);
  const ys = nodes.map((node) => node.position.y);
  const minX = Math.min(...xs, 0);
  const minY = Math.min(...ys, 0);
  const maxX = Math.max(...xs, 0);
  const maxY = Math.max(...ys, 0);
  return {
    minX,
    minY,
    width: Math.max(320, maxX - minX + 240),
    height: Math.max(220, maxY - minY + 180),
  };
}

function buildSvg(graph) {
  const bounds = graphBounds(graph.nodes);
  const offsetX = 90 - bounds.minX;
  const offsetY = 80 - bounds.minY;
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(graph.title)}" viewBox="0 0 ${bounds.width} ${bounds.height}">`,
    '<rect width="100%" height="100%" fill="#fbfbf8"/>',
    `<text x="24" y="34" font-family="system-ui, sans-serif" font-size="20" font-weight="700" fill="#202124">${escapeXml(graph.title)}</text>`,
  ];
  for (const edge of graph.edges) {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) continue;
    lines.push(`<line x1="${from.position.x + offsetX}" y1="${from.position.y + offsetY}" x2="${to.position.x + offsetX}" y2="${to.position.y + offsetY}" stroke="#6f766d" stroke-width="2"/>`);
  }
  for (const node of graph.nodes) {
    const x = node.position.x + offsetX;
    const y = node.position.y + offsetY;
    lines.push(`<circle cx="${x}" cy="${y}" r="22" fill="#f2d16b" stroke="#2f3b2f" stroke-width="2"/>`);
    lines.push(`<text x="${x + 32}" y="${y + 5}" font-family="system-ui, sans-serif" font-size="14" fill="#202124">${escapeXml(node.label)}</text>`);
  }
  const portability = [
    `${graph.attachments.length} attachments`,
    `${graph.portals.length} portals`,
    `${graph.templates.length} templates`,
  ].join(' / ');
  lines.push(`<text x="24" y="${bounds.height - 24}" font-family="system-ui, sans-serif" font-size="12" fill="#4f5b4d">${escapeXml(portability)}</text>`);
  lines.push('</svg>');
  return `${lines.join('\n')}\n`;
}

function buildPrintHtml(graph, svg) {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeXml(graph.title)}</title>`,
    '<style>body{margin:24px;font-family:system-ui,sans-serif;color:#202124}svg{max-width:100%;height:auto}pre{white-space:pre-wrap;font-size:12px}</style>',
    '</head>',
    '<body>',
    svg.trimEnd(),
    `<pre>${escapeXml(JSON.stringify({
      projectId: graph.projectId,
      mapId: graph.mapId,
      attachments: graph.attachments.length,
      portals: graph.portals.length,
      templates: graph.templates.length,
    }, null, 2))}</pre>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

export function buildManualMapImagePdfExportEvidence(graphInput = {}) {
  const normalized = normalizeGraph(graphInput);
  if (!normalized.ok) return normalized;
  const graph = normalized.value;
  const graphHash = hashCanonicalValue(graph);
  const svg = buildSvg(graph);
  const printHtml = buildPrintHtml(graph, svg);
  const evidence = {
    schemaVersion: MANUAL_MAP_IMAGE_PDF_EXPORT_EVIDENCE_SCHEMA_VERSION,
    projectId: graph.projectId,
    mapId: graph.mapId,
    title: graph.title,
    graphHash,
    image: {
      format: 'svg',
      mediaType: 'image/svg+xml',
      utf8ByteLength: utf8ByteLength(svg),
      sha256: hashCanonicalValue(svg),
      content: svg,
    },
    pdf: {
      format: 'pdf',
      sourceFormat: 'html-print-packet',
      adapterRequired: 'local-print-to-pdf-port',
      binaryGenerated: false,
      htmlUtf8ByteLength: utf8ByteLength(printHtml),
      htmlSha256: hashCanonicalValue(printHtml),
      content: printHtml,
    },
    summary: {
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      attachmentCount: graph.attachments.length,
      portalCount: graph.portals.length,
      templateCount: graph.templates.length,
    },
    directCoreMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
    projectTruthMutation: false,
  };
  return {
    ok: true,
    value: {
      ...evidence,
      meta: {
        evidenceHash: hashCanonicalValue({
          schemaVersion: evidence.schemaVersion,
          projectId: evidence.projectId,
          mapId: evidence.mapId,
          graphHash,
          imageSha256: evidence.image.sha256,
          pdfHtmlSha256: evidence.pdf.htmlSha256,
          summary: evidence.summary,
        }),
      },
    },
  };
}
