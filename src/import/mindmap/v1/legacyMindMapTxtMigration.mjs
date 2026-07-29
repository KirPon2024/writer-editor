import { hashCanonicalValue } from '../../../derived/deriveView.mjs';

export const LEGACY_MINDMAP_TXT_INVENTORY_SCHEMA_VERSION = 'manualMap.legacyTxtInventory.v1';
export const LEGACY_MINDMAP_TXT_PREVIEW_SCHEMA_VERSION = 'manualMap.legacyTxtMigrationPreview.v1';
export const LEGACY_MINDMAP_TXT_SHADOW_SCHEMA_VERSION = 'manualMap.legacyTxtShadowMigration.v1';
export const LEGACY_MINDMAP_TXT_ROLLBACK_SCHEMA_VERSION = 'manualMap.legacyTxtRollback.v1';

const LEGACY_MINDMAP_OP = 'manualMap.legacyTxtMigration';
const DEFAULT_MAX_CHARS = 1_000_000;
const DEFAULT_MAX_DEPTH = 8;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeContent(value) {
  return String(value ?? '').replace(/^\uFEFF/u, '').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) return fallback;
  return number;
}

function shortHash(value, length = 12) {
  return hashCanonicalValue(value).slice(0, length);
}

function safeBasename(name) {
  const value = normalizeText(name).split(/[\\/]/u).pop() || 'legacy-mindmap.txt';
  return value.replace(/[^\w .@()-]+/gu, '_').slice(0, 96) || 'legacy-mindmap.txt';
}

function titleFromName(name) {
  return safeBasename(name).replace(/\.txt$/iu, '').trim() || 'Legacy Mind Map';
}

function normalizeSource(source, index, options = {}) {
  const raw = isPlainObject(source) ? source : {};
  const name = safeBasename(raw.name || raw.sourceName || `legacy-mindmap-${index + 1}.txt`);
  const content = normalizeContent(raw.text || raw.content || '');
  const maxChars = normalizePositiveInteger(options.maxChars, DEFAULT_MAX_CHARS);
  const sourceHash = hashCanonicalValue({ name, content });
  const reasons = [];
  if (!name.toLowerCase().endsWith('.txt')) reasons.push('EXTENSION_UNSUPPORTED');
  if (!content.trim()) reasons.push('CONTENT_EMPTY');
  if (content.length > maxChars) reasons.push('CONTENT_TOO_LARGE');
  return {
    sourceId: normalizeText(raw.sourceId) || `legacy-txt:${shortHash({ index, name, sourceHash })}`,
    name,
    sourceHash,
    charLength: content.length,
    lineCount: content ? content.split('\n').length : 0,
    admissible: reasons.length === 0,
    reasons,
    content,
  };
}

function migrationError(code, reason, details = {}) {
  const error = {
    code,
    op: LEGACY_MINDMAP_OP,
    reason,
  };
  if (isPlainObject(details) && Object.keys(details).length > 0) error.details = cloneJson(details);
  return { ok: false, error };
}

export function inventoryLegacyMindMapTxtSources(sources = [], options = {}) {
  const entries = (Array.isArray(sources) ? sources : [])
    .map((source, index) => normalizeSource(source, index, options))
    .map(({ content, ...entry }) => entry);
  const inventory = {
    schemaVersion: LEGACY_MINDMAP_TXT_INVENTORY_SCHEMA_VERSION,
    entries,
    counts: {
      total: entries.length,
      admissible: entries.filter((entry) => entry.admissible).length,
      rejected: entries.filter((entry) => !entry.admissible).length,
    },
  };
  return {
    ...inventory,
    meta: {
      inventoryHash: hashCanonicalValue(inventory),
    },
  };
}

function parseLine(rawLine, lineNumber, options, losses) {
  const line = String(rawLine ?? '').replace(/\t/gu, '  ');
  if (!line.trim()) return null;
  const leading = line.match(/^ */u)?.[0].length || 0;
  const rawDepth = Math.floor(leading / 2);
  const maxDepth = normalizePositiveInteger(options.maxDepth, DEFAULT_MAX_DEPTH);
  const depth = Math.min(rawDepth, maxDepth);
  if (rawDepth > maxDepth) {
    losses.push({
      kind: 'PREVIEW_DOWNGRADE',
      reasonCode: 'LEGACY_MINDMAP_DEPTH_CLAMPED',
      lineNumber,
      note: 'Legacy indentation depth was clamped for preview.',
    });
  }
  const body = line.trim().replace(/^[-*+]\s+/u, '').replace(/^\d+[.)]\s+/u, '').trim();
  if (!body) return null;
  return { lineNumber, depth, body };
}

function addNode(nodes, nodeByLabel, label, depth, lineNumber) {
  const id = `legacy-node-${shortHash({ label, depth, lineNumber, ordinal: nodes.length })}`;
  const node = {
    id,
    label,
    kind: 'note',
    position: {
      x: depth * 180,
      y: nodes.length * 84,
    },
    target: { kind: '', id: '' },
    sourceLine: lineNumber,
  };
  nodes.push(node);
  if (!nodeByLabel.has(label)) nodeByLabel.set(label, node);
  return node;
}

function addEdge(edges, from, to, kind = 'legacy-link') {
  if (!from || !to || from.id === to.id) return null;
  const id = `legacy-edge-${shortHash({ from: from.id, to: to.id, kind, ordinal: edges.length })}`;
  const edge = {
    id,
    from: from.id,
    to: to.id,
    kind,
    label: '',
  };
  edges.push(edge);
  return edge;
}

function parseLegacyContent(source, options = {}) {
  const lines = source.content.split('\n');
  const losses = [];
  const nodes = [];
  const edges = [];
  const nodeByLabel = new Map();
  const stack = [];
  let title = titleFromName(source.name);
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const parsed = parseLine(lines[index], lineNumber, options, losses);
    if (!parsed) continue;
    if (nodes.length === 0 && /^#{1,6}\s+/u.test(parsed.body)) {
      title = parsed.body.replace(/^#{1,6}\s+/u, '').trim() || title;
      continue;
    }
    const arrow = parsed.body.split(/\s+->\s+/u);
    if (arrow.length === 2 && arrow[0].trim() && arrow[1].trim()) {
      const fromLabel = arrow[0].trim();
      const toLabel = arrow[1].trim();
      const from = nodeByLabel.get(fromLabel) || addNode(nodes, nodeByLabel, fromLabel, parsed.depth, lineNumber);
      const to = nodeByLabel.get(toLabel) || addNode(nodes, nodeByLabel, toLabel, parsed.depth + 1, lineNumber);
      addEdge(edges, from, to, 'legacy-explicit-link');
      continue;
    }
    if (parsed.body.includes('->')) {
      losses.push({
        kind: 'PREVIEW_DROP',
        reasonCode: 'LEGACY_MINDMAP_ARROW_MALFORMED',
        lineNumber,
        note: 'Malformed arrow line was skipped.',
      });
      continue;
    }
    const node = addNode(nodes, nodeByLabel, parsed.body, parsed.depth, lineNumber);
    const parent = stack[parsed.depth - 1];
    if (parent) addEdge(edges, parent, node, 'legacy-parent-child');
    stack[parsed.depth] = node;
    stack.length = parsed.depth + 1;
  }
  return { title, nodes, edges, losses };
}

function buildCommandPlan(projectId, mapId, title, graph) {
  const commands = [
    {
      type: 'manualMap.create',
      payload: { projectId, mapId, title },
    },
  ];
  for (const node of graph.nodes) {
    commands.push({
      type: 'manualMap.node.add',
      payload: {
        projectId,
        mapId,
        nodeId: node.id,
        label: node.label,
        nodeKind: node.kind,
        position: node.position,
      },
    });
  }
  for (const edge of graph.edges) {
    commands.push({
      type: 'manualMap.edge.add',
      payload: {
        projectId,
        mapId,
        edgeId: edge.id,
        fromNodeId: edge.from,
        toNodeId: edge.to,
        edgeKind: edge.kind,
        label: edge.label,
      },
    });
  }
  return commands;
}

export function buildLegacyMindMapTxtMigrationPreview(input = {}) {
  const projectId = normalizeText(input.projectId);
  if (!projectId) return migrationError('E_LEGACY_MINDMAP_PROJECT_ID_REQUIRED', 'PROJECT_ID_REQUIRED');
  const source = normalizeSource(input.source || input, 0, input);
  if (!source.admissible) {
    return migrationError('E_LEGACY_MINDMAP_SOURCE_NOT_ADMISSIBLE', 'SOURCE_NOT_ADMISSIBLE', { reasons: source.reasons });
  }
  const parsed = parseLegacyContent(source, input);
  if (!parsed.nodes.length) return migrationError('E_LEGACY_MINDMAP_EMPTY_GRAPH', 'EMPTY_GRAPH');
  const mapId = normalizeText(input.mapId) || `legacy-map-${shortHash({ projectId, sourceHash: source.sourceHash })}`;
  const title = normalizeText(input.title) || parsed.title;
  const graph = {
    schemaVersion: 'derived.manualMap.graph.v1',
    projectId,
    mapId,
    title,
    nodes: parsed.nodes.map(({ sourceLine, ...node }) => node),
    edges: parsed.edges,
  };
  const preview = {
    schemaVersion: LEGACY_MINDMAP_TXT_PREVIEW_SCHEMA_VERSION,
    projectId,
    mapId,
    title,
    source: {
      sourceId: source.sourceId,
      name: source.name,
      sourceHash: source.sourceHash,
      charLength: source.charLength,
      lineCount: source.lineCount,
    },
    graph,
    sourceLineMap: parsed.nodes.map((node) => ({
      nodeId: node.id,
      lineNumber: node.sourceLine,
    })),
    commandPlan: buildCommandPlan(projectId, mapId, title, graph),
    lossReport: {
      humanReadable: true,
      losses: parsed.losses,
      lossCount: parsed.losses.length,
    },
    projectTruthMutation: false,
    applyRequiresCommandKernel: true,
  };
  return {
    ok: true,
    value: {
      ...preview,
      meta: {
        previewHash: hashCanonicalValue(preview),
      },
    },
  };
}

export function createLegacyMindMapShadowMigration(input = {}) {
  const preview = isPlainObject(input.preview) ? input.preview : {};
  if (preview.schemaVersion !== LEGACY_MINDMAP_TXT_PREVIEW_SCHEMA_VERSION) {
    return migrationError('E_LEGACY_MINDMAP_PREVIEW_INVALID', 'PREVIEW_INVALID');
  }
  const existingMapIds = new Set(Array.isArray(input.existingMapIds) ? input.existingMapIds.map(normalizeText) : []);
  if (existingMapIds.has(normalizeText(preview.mapId))) {
    return migrationError('E_LEGACY_MINDMAP_TARGET_EXISTS', 'TARGET_MAP_EXISTS', { mapId: preview.mapId });
  }
  const shadow = {
    schemaVersion: LEGACY_MINDMAP_TXT_SHADOW_SCHEMA_VERSION,
    projectId: normalizeText(preview.projectId),
    mapId: normalizeText(preview.mapId),
    previewHash: normalizeText(preview.meta?.previewHash) || hashCanonicalValue(preview),
    commandPlan: cloneJson(preview.commandPlan),
    rollbackPlan: {
      schemaVersion: LEGACY_MINDMAP_TXT_ROLLBACK_SCHEMA_VERSION,
      mode: 'discard-shadow-only',
      reversible: true,
      projectTruthMutation: false,
    },
    projectTruthMutation: false,
    applyRequiresCommandKernel: true,
  };
  return {
    ok: true,
    value: {
      ...shadow,
      meta: {
        shadowHash: hashCanonicalValue(shadow),
      },
    },
  };
}

export function rollbackLegacyMindMapShadowMigration(shadow = {}) {
  if (!isPlainObject(shadow) || shadow.schemaVersion !== LEGACY_MINDMAP_TXT_SHADOW_SCHEMA_VERSION) {
    return migrationError('E_LEGACY_MINDMAP_SHADOW_INVALID', 'SHADOW_INVALID');
  }
  const rollback = {
    schemaVersion: LEGACY_MINDMAP_TXT_ROLLBACK_SCHEMA_VERSION,
    rolledBack: true,
    mode: 'discard-shadow-only',
    projectTruthMutation: false,
    discardedCommandCount: Array.isArray(shadow.commandPlan) ? shadow.commandPlan.length : 0,
    previewHash: normalizeText(shadow.previewHash),
  };
  return {
    ok: true,
    value: {
      ...rollback,
      meta: {
        rollbackHash: hashCanonicalValue(rollback),
      },
    },
  };
}
