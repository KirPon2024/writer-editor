import { hashCanonicalValue } from './browser-safe-hash.mjs';

export const CORE_COMMAND_IDS = Object.freeze({
  PROJECT_CREATE: 'project.create',
  PROJECT_APPLY_TEXT_EDIT: 'project.applyTextEdit',
  ATLAS_ENTITY_CREATE: 'atlas.entity.create',
  ATLAS_ALIAS_ADD: 'atlas.alias.add',
  ATLAS_MENTION_CONFIRM: 'atlas.mention.confirm',
  IDEA_CREATE: 'idea.create',
  IDEA_ORIGIN_LINK_ADD: 'idea.originLink.add',
  MEANING_PROMOTE: 'meaning.promote',
  MANUAL_MAP_CREATE: 'manualMap.create',
  MANUAL_MAP_NODE_ADD: 'manualMap.node.add',
  MANUAL_MAP_EDGE_ADD: 'manualMap.edge.add',
  MANUAL_MAP_ATTACHMENT_ADD: 'manualMap.attachment.add',
  MANUAL_MAP_PORTAL_ADD: 'manualMap.portal.add',
  MANUAL_MAP_TEMPLATE_APPLY: 'manualMap.template.apply',
});

const ATLAS_AUTHOR_SCHEMA_VERSION = 'atlas.author.v1';
const MANUAL_MAP_AUTHOR_SCHEMA_VERSION = 'manualMap.author.v1';
const IDEA_AUTHOR_SCHEMA_VERSION = 'idea.author.v1';
const IDEA_ORIGIN_REF_SCHEMA_VERSION = 'idea.originRef.v1';
const MEANING_AUTHOR_SCHEMA_VERSION = 'meaning.author.v1';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function hashCoreState(state) {
  return hashCanonicalValue(state);
}

export function createInitialCoreState() {
  return {
    version: 1,
    data: {
      projects: {},
      lastCommandId: 0,
    },
  };
}

function typedError(code, op, reason, details) {
  const error = { code, op, reason };
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    error.details = cloneJson(details);
  }
  return error;
}

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function createEmptyAtlasAuthorData() {
  return {
    schemaVersion: ATLAS_AUTHOR_SCHEMA_VERSION,
    entities: {},
    decisions: {},
  };
}

function normalizeAtlasAuthorData(input) {
  if (!isPlainObject(input) || input.schemaVersion !== ATLAS_AUTHOR_SCHEMA_VERSION || !isPlainObject(input.entities)) {
    return createEmptyAtlasAuthorData();
  }

  return {
    schemaVersion: ATLAS_AUTHOR_SCHEMA_VERSION,
    entities: cloneJson(input.entities),
    decisions: isPlainObject(input.decisions) ? cloneJson(input.decisions) : {},
  };
}

function ensureAtlasAuthorData(project) {
  const current = normalizeAtlasAuthorData(project && project.atlas);
  project.atlas = current;
  return current;
}

function createEmptyIdeaAuthorData() {
  return {
    schemaVersion: IDEA_AUTHOR_SCHEMA_VERSION,
    ideas: {},
    originLinks: {},
  };
}

function normalizeIdeaAuthorData(input) {
  if (!isPlainObject(input) || input.schemaVersion !== IDEA_AUTHOR_SCHEMA_VERSION || !isPlainObject(input.ideas)) {
    return createEmptyIdeaAuthorData();
  }

  return {
    schemaVersion: IDEA_AUTHOR_SCHEMA_VERSION,
    ideas: cloneJson(input.ideas),
    originLinks: isPlainObject(input.originLinks) ? cloneJson(input.originLinks) : {},
  };
}

function ensureIdeaAuthorData(project) {
  const current = normalizeIdeaAuthorData(project && project.ideas);
  project.ideas = current;
  return current;
}

function createEmptyMeaningAuthorData() {
  return {
    schemaVersion: MEANING_AUTHOR_SCHEMA_VERSION,
    meanings: {},
  };
}

function normalizeMeaningAuthorData(input) {
  if (!isPlainObject(input) || input.schemaVersion !== MEANING_AUTHOR_SCHEMA_VERSION || !isPlainObject(input.meanings)) {
    return createEmptyMeaningAuthorData();
  }

  return {
    schemaVersion: MEANING_AUTHOR_SCHEMA_VERSION,
    meanings: cloneJson(input.meanings),
  };
}

function ensureMeaningAuthorData(project) {
  const current = normalizeMeaningAuthorData(project && project.meanings);
  project.meanings = current;
  return current;
}

function createEmptyManualMapData() {
  return {
    schemaVersion: MANUAL_MAP_AUTHOR_SCHEMA_VERSION,
    maps: {},
  };
}

function normalizeManualMapData(input) {
  if (!isPlainObject(input) || input.schemaVersion !== MANUAL_MAP_AUTHOR_SCHEMA_VERSION || !isPlainObject(input.maps)) {
    return createEmptyManualMapData();
  }
  return {
    schemaVersion: MANUAL_MAP_AUTHOR_SCHEMA_VERSION,
    maps: cloneJson(input.maps),
  };
}

function ensureManualMapData(project) {
  const current = normalizeManualMapData(project && project.manualMaps);
  project.manualMaps = current;
  return current;
}

function ok(state) {
  return {
    ok: true,
    state,
    stateHash: hashCoreState(state),
  };
}

function fail(state, code, op, reason, details) {
  return {
    ok: false,
    state,
    stateHash: hashCoreState(state),
    error: typedError(code, op, reason, details),
  };
}

function normalizeState(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return createInitialCoreState();
  }
  if (!input.data || typeof input.data !== 'object' || Array.isArray(input.data)) {
    return createInitialCoreState();
  }
  const projects = input.data.projects;
  if (!projects || typeof projects !== 'object' || Array.isArray(projects)) {
    return createInitialCoreState();
  }
  const version = Number.isInteger(input.version) ? input.version : 1;
  const lastCommandId = Number.isInteger(input.data.lastCommandId) ? input.data.lastCommandId : 0;
  return {
    version,
    data: {
      projects: cloneJson(projects),
      lastCommandId,
    },
  };
}

function applyCreateProject(state, payload) {
  const projectId = typeof payload?.projectId === 'string' ? payload.projectId.trim() : '';
  const title = typeof payload?.title === 'string' && payload.title.trim().length > 0
    ? payload.title.trim()
    : 'Untitled project';
  const sceneId = typeof payload?.sceneId === 'string' && payload.sceneId.trim().length > 0
    ? payload.sceneId.trim()
    : 'scene-1';

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'project.create', 'PROJECT_ID_REQUIRED');
  }

  if (state.data.projects[projectId]) {
    return fail(state, 'E_CORE_PROJECT_ALREADY_EXISTS', 'project.create', 'PROJECT_ALREADY_EXISTS', { projectId });
  }

  const next = cloneJson(state);
  next.data.projects[projectId] = {
    id: projectId,
    title,
    atlas: createEmptyAtlasAuthorData(),
    ideas: createEmptyIdeaAuthorData(),
    meanings: createEmptyMeaningAuthorData(),
    manualMaps: createEmptyManualMapData(),
    scenes: {
      [sceneId]: {
        id: sceneId,
        text: '',
      },
    },
  };
  next.data.lastCommandId += 1;
  return ok(next);
}

function normalizePosition(value) {
  const position = isPlainObject(value) ? value : {};
  const x = Number(position.x);
  const y = Number(position.y);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

function normalizePositiveInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.floor(number));
}

function normalizeAttachmentSource(value) {
  const source = isPlainObject(value) ? value : {};
  return {
    name: trimString(source.name),
    mediaType: trimString(source.mediaType),
    sourceHash: trimString(source.sourceHash),
    byteLength: normalizePositiveInteger(source.byteLength),
  };
}

function applyManualMapCreate(state, payload) {
  const projectId = trimString(payload?.projectId);
  const mapId = trimString(payload?.mapId);
  const title = trimString(payload?.title) || 'Untitled map';

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'manualMap.create', 'PROJECT_ID_REQUIRED');
  }
  if (!mapId) {
    return fail(state, 'E_MANUAL_MAP_ID_REQUIRED', 'manualMap.create', 'MAP_ID_REQUIRED', { projectId });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'manualMap.create', 'PROJECT_NOT_FOUND', { projectId });
  }
  const manualMaps = normalizeManualMapData(project.manualMaps);
  if (manualMaps.maps[mapId]) {
    return fail(state, 'E_MANUAL_MAP_ALREADY_EXISTS', 'manualMap.create', 'MAP_ALREADY_EXISTS', { projectId, mapId });
  }

  const next = cloneJson(state);
  const nextManualMaps = ensureManualMapData(next.data.projects[projectId]);
  nextManualMaps.maps[mapId] = {
    id: mapId,
    title,
    nodes: {},
    edges: {},
    createdByCommandSeq: next.data.lastCommandId + 1,
    updatedByCommandSeq: next.data.lastCommandId + 1,
  };
  next.data.lastCommandId += 1;
  return ok(next);
}

function applyManualMapNodeAdd(state, payload) {
  const projectId = trimString(payload?.projectId);
  const mapId = trimString(payload?.mapId);
  const nodeId = trimString(payload?.nodeId);
  const label = trimString(payload?.label);
  const nodeKind = trimString(payload?.nodeKind) || 'note';
  const targetKind = trimString(payload?.targetKind);
  const targetId = trimString(payload?.targetId);

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'manualMap.node.add', 'PROJECT_ID_REQUIRED');
  }
  if (!mapId) {
    return fail(state, 'E_MANUAL_MAP_ID_REQUIRED', 'manualMap.node.add', 'MAP_ID_REQUIRED', { projectId });
  }
  if (!nodeId) {
    return fail(state, 'E_MANUAL_MAP_NODE_ID_REQUIRED', 'manualMap.node.add', 'NODE_ID_REQUIRED', { projectId, mapId });
  }
  if (!label) {
    return fail(state, 'E_MANUAL_MAP_NODE_LABEL_REQUIRED', 'manualMap.node.add', 'NODE_LABEL_REQUIRED', { projectId, mapId, nodeId });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'manualMap.node.add', 'PROJECT_NOT_FOUND', { projectId });
  }
  const manualMaps = normalizeManualMapData(project.manualMaps);
  const map = manualMaps.maps[mapId];
  if (!isPlainObject(map)) {
    return fail(state, 'E_MANUAL_MAP_NOT_FOUND', 'manualMap.node.add', 'MAP_NOT_FOUND', { projectId, mapId });
  }
  const nodes = isPlainObject(map.nodes) ? map.nodes : {};
  if (nodes[nodeId]) {
    return fail(state, 'E_MANUAL_MAP_NODE_ALREADY_EXISTS', 'manualMap.node.add', 'NODE_ALREADY_EXISTS', { projectId, mapId, nodeId });
  }
  if (targetKind === 'scene' && (!targetId || !isPlainObject(project.scenes) || !project.scenes[targetId])) {
    return fail(state, 'E_MANUAL_MAP_NODE_TARGET_SCENE_NOT_FOUND', 'manualMap.node.add', 'TARGET_SCENE_NOT_FOUND', { projectId, mapId, nodeId, targetId });
  }

  const next = cloneJson(state);
  const nextManualMaps = ensureManualMapData(next.data.projects[projectId]);
  const nextMap = nextManualMaps.maps[mapId];
  if (!isPlainObject(nextMap.nodes)) nextMap.nodes = {};
  nextMap.nodes[nodeId] = {
    id: nodeId,
    label,
    nodeKind,
    position: normalizePosition(payload?.position),
    target: {
      kind: targetKind,
      id: targetId,
    },
    createdByCommandSeq: next.data.lastCommandId + 1,
    updatedByCommandSeq: next.data.lastCommandId + 1,
  };
  nextMap.updatedByCommandSeq = next.data.lastCommandId + 1;
  next.data.lastCommandId += 1;
  return ok(next);
}

function applyManualMapEdgeAdd(state, payload) {
  const projectId = trimString(payload?.projectId);
  const mapId = trimString(payload?.mapId);
  const edgeId = trimString(payload?.edgeId);
  const fromNodeId = trimString(payload?.fromNodeId);
  const toNodeId = trimString(payload?.toNodeId);
  const label = trimString(payload?.label);
  const edgeKind = trimString(payload?.edgeKind) || 'link';

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'manualMap.edge.add', 'PROJECT_ID_REQUIRED');
  }
  if (!mapId) {
    return fail(state, 'E_MANUAL_MAP_ID_REQUIRED', 'manualMap.edge.add', 'MAP_ID_REQUIRED', { projectId });
  }
  if (!edgeId) {
    return fail(state, 'E_MANUAL_MAP_EDGE_ID_REQUIRED', 'manualMap.edge.add', 'EDGE_ID_REQUIRED', { projectId, mapId });
  }
  if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) {
    return fail(state, 'E_MANUAL_MAP_EDGE_ENDPOINTS_INVALID', 'manualMap.edge.add', 'EDGE_ENDPOINTS_INVALID', {
      projectId,
      mapId,
      edgeId,
      fromNodeId,
      toNodeId,
    });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'manualMap.edge.add', 'PROJECT_NOT_FOUND', { projectId });
  }
  const manualMaps = normalizeManualMapData(project.manualMaps);
  const map = manualMaps.maps[mapId];
  if (!isPlainObject(map)) {
    return fail(state, 'E_MANUAL_MAP_NOT_FOUND', 'manualMap.edge.add', 'MAP_NOT_FOUND', { projectId, mapId });
  }
  const nodes = isPlainObject(map.nodes) ? map.nodes : {};
  if (!nodes[fromNodeId] || !nodes[toNodeId]) {
    return fail(state, 'E_MANUAL_MAP_EDGE_ENDPOINT_NOT_FOUND', 'manualMap.edge.add', 'EDGE_ENDPOINT_NOT_FOUND', {
      projectId,
      mapId,
      edgeId,
      fromNodeId,
      toNodeId,
    });
  }
  const edges = isPlainObject(map.edges) ? map.edges : {};
  if (edges[edgeId]) {
    return fail(state, 'E_MANUAL_MAP_EDGE_ALREADY_EXISTS', 'manualMap.edge.add', 'EDGE_ALREADY_EXISTS', { projectId, mapId, edgeId });
  }

  const next = cloneJson(state);
  const nextManualMaps = ensureManualMapData(next.data.projects[projectId]);
  const nextMap = nextManualMaps.maps[mapId];
  if (!isPlainObject(nextMap.edges)) nextMap.edges = {};
  nextMap.edges[edgeId] = {
    id: edgeId,
    fromNodeId,
    toNodeId,
    edgeKind,
    label,
    createdByCommandSeq: next.data.lastCommandId + 1,
  };
  nextMap.updatedByCommandSeq = next.data.lastCommandId + 1;
  next.data.lastCommandId += 1;
  return ok(next);
}

function applyManualMapAttachmentAdd(state, payload) {
  const projectId = trimString(payload?.projectId);
  const mapId = trimString(payload?.mapId);
  const nodeId = trimString(payload?.nodeId);
  const attachmentId = trimString(payload?.attachmentId);
  const label = trimString(payload?.label);
  const attachmentKind = trimString(payload?.attachmentKind) || 'reference';
  const source = normalizeAttachmentSource(payload?.source);

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'manualMap.attachment.add', 'PROJECT_ID_REQUIRED');
  }
  if (!mapId) {
    return fail(state, 'E_MANUAL_MAP_ID_REQUIRED', 'manualMap.attachment.add', 'MAP_ID_REQUIRED', { projectId });
  }
  if (!nodeId) {
    return fail(state, 'E_MANUAL_MAP_NODE_ID_REQUIRED', 'manualMap.attachment.add', 'NODE_ID_REQUIRED', { projectId, mapId });
  }
  if (!attachmentId) {
    return fail(state, 'E_MANUAL_MAP_ATTACHMENT_ID_REQUIRED', 'manualMap.attachment.add', 'ATTACHMENT_ID_REQUIRED', { projectId, mapId, nodeId });
  }
  if (!label) {
    return fail(state, 'E_MANUAL_MAP_ATTACHMENT_LABEL_REQUIRED', 'manualMap.attachment.add', 'ATTACHMENT_LABEL_REQUIRED', { projectId, mapId, nodeId, attachmentId });
  }
  if (!source.sourceHash) {
    return fail(state, 'E_MANUAL_MAP_ATTACHMENT_SOURCE_HASH_REQUIRED', 'manualMap.attachment.add', 'ATTACHMENT_SOURCE_HASH_REQUIRED', { projectId, mapId, nodeId, attachmentId });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'manualMap.attachment.add', 'PROJECT_NOT_FOUND', { projectId });
  }
  const manualMaps = normalizeManualMapData(project.manualMaps);
  const map = manualMaps.maps[mapId];
  if (!isPlainObject(map)) {
    return fail(state, 'E_MANUAL_MAP_NOT_FOUND', 'manualMap.attachment.add', 'MAP_NOT_FOUND', { projectId, mapId });
  }
  const nodes = isPlainObject(map.nodes) ? map.nodes : {};
  if (!nodes[nodeId]) {
    return fail(state, 'E_MANUAL_MAP_NODE_NOT_FOUND', 'manualMap.attachment.add', 'NODE_NOT_FOUND', { projectId, mapId, nodeId });
  }
  const attachments = isPlainObject(map.attachments) ? map.attachments : {};
  if (attachments[attachmentId]) {
    return fail(state, 'E_MANUAL_MAP_ATTACHMENT_ALREADY_EXISTS', 'manualMap.attachment.add', 'ATTACHMENT_ALREADY_EXISTS', { projectId, mapId, attachmentId });
  }

  const next = cloneJson(state);
  const nextManualMaps = ensureManualMapData(next.data.projects[projectId]);
  const nextMap = nextManualMaps.maps[mapId];
  if (!isPlainObject(nextMap.attachments)) nextMap.attachments = {};
  nextMap.attachments[attachmentId] = {
    id: attachmentId,
    nodeId,
    label,
    attachmentKind,
    source,
    storedContent: false,
    createdByCommandSeq: next.data.lastCommandId + 1,
  };
  nextMap.updatedByCommandSeq = next.data.lastCommandId + 1;
  next.data.lastCommandId += 1;
  return ok(next);
}

function applyManualMapPortalAdd(state, payload) {
  const projectId = trimString(payload?.projectId);
  const mapId = trimString(payload?.mapId);
  const portalId = trimString(payload?.portalId);
  const fromNodeId = trimString(payload?.fromNodeId);
  const targetMapId = trimString(payload?.targetMapId);
  const targetNodeId = trimString(payload?.targetNodeId);
  const label = trimString(payload?.label) || 'Portal';

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'manualMap.portal.add', 'PROJECT_ID_REQUIRED');
  }
  if (!mapId || !targetMapId) {
    return fail(state, 'E_MANUAL_MAP_ID_REQUIRED', 'manualMap.portal.add', 'MAP_ID_REQUIRED', { projectId, mapId, targetMapId });
  }
  if (!portalId) {
    return fail(state, 'E_MANUAL_MAP_PORTAL_ID_REQUIRED', 'manualMap.portal.add', 'PORTAL_ID_REQUIRED', { projectId, mapId });
  }
  if (!fromNodeId) {
    return fail(state, 'E_MANUAL_MAP_NODE_ID_REQUIRED', 'manualMap.portal.add', 'NODE_ID_REQUIRED', { projectId, mapId, portalId });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'manualMap.portal.add', 'PROJECT_NOT_FOUND', { projectId });
  }
  const manualMaps = normalizeManualMapData(project.manualMaps);
  const map = manualMaps.maps[mapId];
  const targetMap = manualMaps.maps[targetMapId];
  if (!isPlainObject(map) || !isPlainObject(targetMap)) {
    return fail(state, 'E_MANUAL_MAP_NOT_FOUND', 'manualMap.portal.add', 'MAP_NOT_FOUND', { projectId, mapId, targetMapId });
  }
  const nodes = isPlainObject(map.nodes) ? map.nodes : {};
  const targetNodes = isPlainObject(targetMap.nodes) ? targetMap.nodes : {};
  if (!nodes[fromNodeId]) {
    return fail(state, 'E_MANUAL_MAP_NODE_NOT_FOUND', 'manualMap.portal.add', 'NODE_NOT_FOUND', { projectId, mapId, fromNodeId });
  }
  if (targetNodeId && !targetNodes[targetNodeId]) {
    return fail(state, 'E_MANUAL_MAP_PORTAL_TARGET_NODE_NOT_FOUND', 'manualMap.portal.add', 'PORTAL_TARGET_NODE_NOT_FOUND', { projectId, targetMapId, targetNodeId });
  }
  const portals = isPlainObject(map.portals) ? map.portals : {};
  if (portals[portalId]) {
    return fail(state, 'E_MANUAL_MAP_PORTAL_ALREADY_EXISTS', 'manualMap.portal.add', 'PORTAL_ALREADY_EXISTS', { projectId, mapId, portalId });
  }

  const next = cloneJson(state);
  const nextManualMaps = ensureManualMapData(next.data.projects[projectId]);
  const nextMap = nextManualMaps.maps[mapId];
  if (!isPlainObject(nextMap.portals)) nextMap.portals = {};
  nextMap.portals[portalId] = {
    id: portalId,
    fromNodeId,
    target: {
      mapId: targetMapId,
      nodeId: targetNodeId,
    },
    label,
    createdByCommandSeq: next.data.lastCommandId + 1,
  };
  nextMap.updatedByCommandSeq = next.data.lastCommandId + 1;
  next.data.lastCommandId += 1;
  return ok(next);
}

function normalizeTemplateItems(value, limit) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit);
}

function applyManualMapTemplateApply(state, payload) {
  const projectId = trimString(payload?.projectId);
  const mapId = trimString(payload?.mapId);
  const templateInstanceId = trimString(payload?.templateInstanceId);
  const templateId = trimString(payload?.templateId);
  const templateName = trimString(payload?.templateName) || 'Manual map template';
  const templateNodes = normalizeTemplateItems(payload?.nodes, 32);
  const templateEdges = normalizeTemplateItems(payload?.edges, 64);

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'manualMap.template.apply', 'PROJECT_ID_REQUIRED');
  }
  if (!mapId) {
    return fail(state, 'E_MANUAL_MAP_ID_REQUIRED', 'manualMap.template.apply', 'MAP_ID_REQUIRED', { projectId });
  }
  if (!templateInstanceId || !templateId) {
    return fail(state, 'E_MANUAL_MAP_TEMPLATE_ID_REQUIRED', 'manualMap.template.apply', 'TEMPLATE_ID_REQUIRED', { projectId, mapId });
  }
  if (templateNodes.length === 0) {
    return fail(state, 'E_MANUAL_MAP_TEMPLATE_EMPTY', 'manualMap.template.apply', 'TEMPLATE_EMPTY', { projectId, mapId, templateId });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'manualMap.template.apply', 'PROJECT_NOT_FOUND', { projectId });
  }
  const manualMaps = normalizeManualMapData(project.manualMaps);
  const map = manualMaps.maps[mapId];
  if (!isPlainObject(map)) {
    return fail(state, 'E_MANUAL_MAP_NOT_FOUND', 'manualMap.template.apply', 'MAP_NOT_FOUND', { projectId, mapId });
  }
  const nodes = isPlainObject(map.nodes) ? map.nodes : {};
  const edges = isPlainObject(map.edges) ? map.edges : {};
  const templates = isPlainObject(map.templates) ? map.templates : {};
  if (templates[templateInstanceId]) {
    return fail(state, 'E_MANUAL_MAP_TEMPLATE_ALREADY_APPLIED', 'manualMap.template.apply', 'TEMPLATE_ALREADY_APPLIED', { projectId, mapId, templateInstanceId });
  }

  const nextNodeIds = new Set(Object.keys(nodes));
  const normalizedNodes = [];
  for (const rawNode of templateNodes) {
    const nodeId = trimString(rawNode?.nodeId);
    const label = trimString(rawNode?.label);
    if (!nodeId || !label || nextNodeIds.has(nodeId)) {
      return fail(state, 'E_MANUAL_MAP_TEMPLATE_NODE_INVALID', 'manualMap.template.apply', 'TEMPLATE_NODE_INVALID', { projectId, mapId, templateId, nodeId });
    }
    const targetKind = trimString(rawNode?.targetKind);
    const targetId = trimString(rawNode?.targetId);
    if (targetKind === 'scene' && (!targetId || !isPlainObject(project.scenes) || !project.scenes[targetId])) {
      return fail(state, 'E_MANUAL_MAP_TEMPLATE_TARGET_SCENE_NOT_FOUND', 'manualMap.template.apply', 'TEMPLATE_TARGET_SCENE_NOT_FOUND', {
        projectId,
        mapId,
        templateId,
        nodeId,
        targetId,
      });
    }
    nextNodeIds.add(nodeId);
    normalizedNodes.push({
      id: nodeId,
      label,
      nodeKind: trimString(rawNode?.nodeKind) || 'note',
      position: normalizePosition(rawNode?.position),
      target: {
        kind: targetKind,
        id: targetId,
      },
    });
  }

  const nextEdgeIds = new Set(Object.keys(edges));
  const normalizedEdges = [];
  for (const rawEdge of templateEdges) {
    const edgeId = trimString(rawEdge?.edgeId);
    const fromNodeId = trimString(rawEdge?.fromNodeId);
    const toNodeId = trimString(rawEdge?.toNodeId);
    if (!edgeId || nextEdgeIds.has(edgeId) || !fromNodeId || !toNodeId || fromNodeId === toNodeId || !nextNodeIds.has(fromNodeId) || !nextNodeIds.has(toNodeId)) {
      return fail(state, 'E_MANUAL_MAP_TEMPLATE_EDGE_INVALID', 'manualMap.template.apply', 'TEMPLATE_EDGE_INVALID', {
        projectId,
        mapId,
        templateId,
        edgeId,
        fromNodeId,
        toNodeId,
      });
    }
    nextEdgeIds.add(edgeId);
    normalizedEdges.push({
      id: edgeId,
      fromNodeId,
      toNodeId,
      edgeKind: trimString(rawEdge?.edgeKind) || 'link',
      label: trimString(rawEdge?.label),
    });
  }

  const next = cloneJson(state);
  const nextManualMaps = ensureManualMapData(next.data.projects[projectId]);
  const nextMap = nextManualMaps.maps[mapId];
  if (!isPlainObject(nextMap.nodes)) nextMap.nodes = {};
  if (!isPlainObject(nextMap.edges)) nextMap.edges = {};
  if (!isPlainObject(nextMap.templates)) nextMap.templates = {};
  const commandSeq = next.data.lastCommandId + 1;
  for (const node of normalizedNodes) {
    nextMap.nodes[node.id] = {
      id: node.id,
      label: node.label,
      nodeKind: node.nodeKind,
      position: node.position,
      target: node.target,
      createdByCommandSeq: commandSeq,
      updatedByCommandSeq: commandSeq,
      templateInstanceId,
    };
  }
  for (const edge of normalizedEdges) {
    nextMap.edges[edge.id] = {
      id: edge.id,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      edgeKind: edge.edgeKind,
      label: edge.label,
      createdByCommandSeq: commandSeq,
      templateInstanceId,
    };
  }
  nextMap.templates[templateInstanceId] = {
    id: templateInstanceId,
    templateId,
    name: templateName,
    appliedNodeIds: normalizedNodes.map((node) => node.id).sort(),
    appliedEdgeIds: normalizedEdges.map((edge) => edge.id).sort(),
    createdByCommandSeq: commandSeq,
  };
  nextMap.updatedByCommandSeq = commandSeq;
  next.data.lastCommandId += 1;
  return ok(next);
}

function applyAtlasEntityCreate(state, payload) {
  const projectId = trimString(payload?.projectId);
  const entityId = trimString(payload?.entityId);
  const name = trimString(payload?.name);
  const entityKind = trimString(payload?.entityKind) || 'entity';

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'atlas.entity.create', 'PROJECT_ID_REQUIRED');
  }
  if (!entityId) {
    return fail(state, 'E_ATLAS_ENTITY_ID_REQUIRED', 'atlas.entity.create', 'ENTITY_ID_REQUIRED');
  }
  if (!name) {
    return fail(state, 'E_ATLAS_ENTITY_NAME_REQUIRED', 'atlas.entity.create', 'ENTITY_NAME_REQUIRED', { entityId });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'atlas.entity.create', 'PROJECT_NOT_FOUND', { projectId });
  }

  const atlas = normalizeAtlasAuthorData(project.atlas);
  if (atlas.entities[entityId]) {
    return fail(state, 'E_ATLAS_ENTITY_ALREADY_EXISTS', 'atlas.entity.create', 'ENTITY_ALREADY_EXISTS', { projectId, entityId });
  }

  const next = cloneJson(state);
  const nextProject = next.data.projects[projectId];
  const nextAtlas = ensureAtlasAuthorData(nextProject);
  nextAtlas.entities[entityId] = {
    id: entityId,
    name,
    entityKind,
    aliases: {},
    createdByCommandSeq: next.data.lastCommandId + 1,
    updatedByCommandSeq: next.data.lastCommandId + 1,
  };
  next.data.lastCommandId += 1;
  return ok(next);
}

function applyAtlasAliasAdd(state, payload) {
  const projectId = trimString(payload?.projectId);
  const entityId = trimString(payload?.entityId);
  const aliasId = trimString(payload?.aliasId);
  const value = trimString(payload?.value);
  const scope = trimString(payload?.scope) || 'project';
  const sceneId = trimString(payload?.sceneId);

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'atlas.alias.add', 'PROJECT_ID_REQUIRED');
  }
  if (!entityId) {
    return fail(state, 'E_ATLAS_ENTITY_ID_REQUIRED', 'atlas.alias.add', 'ENTITY_ID_REQUIRED');
  }
  if (!aliasId) {
    return fail(state, 'E_ATLAS_ALIAS_ID_REQUIRED', 'atlas.alias.add', 'ALIAS_ID_REQUIRED', { entityId });
  }
  if (!value) {
    return fail(state, 'E_ATLAS_ALIAS_VALUE_REQUIRED', 'atlas.alias.add', 'ALIAS_VALUE_REQUIRED', { entityId, aliasId });
  }
  if (scope !== 'project' && scope !== 'scene') {
    return fail(state, 'E_ATLAS_ALIAS_SCOPE_INVALID', 'atlas.alias.add', 'ALIAS_SCOPE_INVALID', { scope });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'atlas.alias.add', 'PROJECT_NOT_FOUND', { projectId });
  }
  if (scope === 'scene') {
    if (!sceneId) {
      return fail(state, 'E_CORE_SCENE_ID_REQUIRED', 'atlas.alias.add', 'SCENE_ID_REQUIRED', { projectId, entityId });
    }
    if (!project.scenes || !project.scenes[sceneId]) {
      return fail(state, 'E_CORE_SCENE_NOT_FOUND', 'atlas.alias.add', 'SCENE_NOT_FOUND', { projectId, sceneId });
    }
  }

  const atlas = normalizeAtlasAuthorData(project.atlas);
  const entity = atlas.entities[entityId];
  if (!entity) {
    return fail(state, 'E_ATLAS_ENTITY_NOT_FOUND', 'atlas.alias.add', 'ENTITY_NOT_FOUND', { projectId, entityId });
  }
  const aliases = isPlainObject(entity.aliases) ? entity.aliases : {};
  if (aliases[aliasId]) {
    return fail(state, 'E_ATLAS_ALIAS_ALREADY_EXISTS', 'atlas.alias.add', 'ALIAS_ALREADY_EXISTS', { projectId, entityId, aliasId });
  }

  const duplicateAlias = Object.values(aliases)
    .find((alias) => isPlainObject(alias) && trimString(alias.value).toLowerCase() === value.toLowerCase());
  if (duplicateAlias) {
    return fail(state, 'E_ATLAS_ALIAS_VALUE_ALREADY_EXISTS', 'atlas.alias.add', 'ALIAS_VALUE_ALREADY_EXISTS', { projectId, entityId, value });
  }

  const next = cloneJson(state);
  const nextProject = next.data.projects[projectId];
  const nextAtlas = ensureAtlasAuthorData(nextProject);
  const nextEntity = nextAtlas.entities[entityId];
  if (!isPlainObject(nextEntity.aliases)) nextEntity.aliases = {};
  nextEntity.aliases[aliasId] = {
    id: aliasId,
    value,
    scope,
    sceneId: scope === 'scene' ? sceneId : '',
    createdByCommandSeq: next.data.lastCommandId + 1,
  };
  nextEntity.updatedByCommandSeq = next.data.lastCommandId + 1;
  next.data.lastCommandId += 1;
  return ok(next);
}

function normalizeEvidenceAnchor(value) {
  if (!isPlainObject(value)) return null;
  const anchorId = trimString(value.anchorId);
  const quote = typeof value.quote === 'string' ? value.quote : '';
  const quoteHash = trimString(value.quoteHash);
  const sceneTextHash = trimString(value.sceneTextHash);
  const startOffset = Number(value.startOffset);
  const endOffset = Number(value.endOffset);
  if (!anchorId || !quoteHash || !sceneTextHash || !Number.isInteger(startOffset) || !Number.isInteger(endOffset) || endOffset < startOffset) {
    return null;
  }
  return {
    schemaVersion: trimString(value.schemaVersion) || 'atlas.evidenceAnchor.v1',
    anchorId,
    projectId: trimString(value.projectId),
    sceneId: trimString(value.sceneId),
    entityId: trimString(value.entityId),
    startOffset,
    endOffset,
    quote,
    quoteHash,
    sceneTextHash,
  };
}

function applyAtlasMentionConfirm(state, payload) {
  const projectId = trimString(payload?.projectId);
  const sceneId = trimString(payload?.sceneId);
  const entityId = trimString(payload?.entityId);
  const mentionId = trimString(payload?.mentionId);
  const evidenceAnchor = normalizeEvidenceAnchor(payload?.evidenceAnchor);
  const decisionId = trimString(payload?.decisionId) || `atlas-decision:${hashCanonicalValue({
    projectId,
    sceneId,
    entityId,
    mentionId,
    anchorId: evidenceAnchor?.anchorId || '',
    trustState: 'AUTHOR_CONFIRMED',
  })}`;

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'atlas.mention.confirm', 'PROJECT_ID_REQUIRED');
  }
  if (!sceneId) {
    return fail(state, 'E_CORE_SCENE_ID_REQUIRED', 'atlas.mention.confirm', 'SCENE_ID_REQUIRED', { projectId });
  }
  if (!entityId) {
    return fail(state, 'E_ATLAS_ENTITY_ID_REQUIRED', 'atlas.mention.confirm', 'ENTITY_ID_REQUIRED', { projectId, sceneId });
  }
  if (!mentionId) {
    return fail(state, 'E_ATLAS_MENTION_ID_REQUIRED', 'atlas.mention.confirm', 'MENTION_ID_REQUIRED', { projectId, sceneId, entityId });
  }
  if (!evidenceAnchor) {
    return fail(state, 'E_ATLAS_EVIDENCE_ANCHOR_REQUIRED', 'atlas.mention.confirm', 'EVIDENCE_ANCHOR_REQUIRED', { projectId, sceneId, entityId, mentionId });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'atlas.mention.confirm', 'PROJECT_NOT_FOUND', { projectId });
  }
  if (!project.scenes || !project.scenes[sceneId]) {
    return fail(state, 'E_CORE_SCENE_NOT_FOUND', 'atlas.mention.confirm', 'SCENE_NOT_FOUND', { projectId, sceneId });
  }
  const atlas = normalizeAtlasAuthorData(project.atlas);
  if (!atlas.entities[entityId]) {
    return fail(state, 'E_ATLAS_ENTITY_NOT_FOUND', 'atlas.mention.confirm', 'ENTITY_NOT_FOUND', { projectId, entityId });
  }
  if (evidenceAnchor.sceneId && evidenceAnchor.sceneId !== sceneId) {
    return fail(state, 'E_ATLAS_EVIDENCE_SCENE_MISMATCH', 'atlas.mention.confirm', 'EVIDENCE_SCENE_MISMATCH', { sceneId, evidenceSceneId: evidenceAnchor.sceneId });
  }
  if (evidenceAnchor.entityId && evidenceAnchor.entityId !== entityId) {
    return fail(state, 'E_ATLAS_EVIDENCE_ENTITY_MISMATCH', 'atlas.mention.confirm', 'EVIDENCE_ENTITY_MISMATCH', { entityId, evidenceEntityId: evidenceAnchor.entityId });
  }
  if (atlas.decisions && atlas.decisions[decisionId]) {
    return fail(state, 'E_ATLAS_DECISION_ALREADY_EXISTS', 'atlas.mention.confirm', 'DECISION_ALREADY_EXISTS', { projectId, decisionId });
  }

  const next = cloneJson(state);
  const nextProject = next.data.projects[projectId];
  const nextAtlas = ensureAtlasAuthorData(nextProject);
  if (!isPlainObject(nextAtlas.decisions)) nextAtlas.decisions = {};
  nextAtlas.decisions[decisionId] = {
    id: decisionId,
    decisionKind: 'mention.confirm',
    trustState: 'AUTHOR_CONFIRMED',
    projectId,
    sceneId,
    entityId,
    mentionId,
    evidenceAnchor,
    createdByCommandSeq: next.data.lastCommandId + 1,
  };
  const nextEntity = nextAtlas.entities[entityId];
  if (isPlainObject(nextEntity)) {
    nextEntity.updatedByCommandSeq = next.data.lastCommandId + 1;
  }
  next.data.lastCommandId += 1;
  return ok(next);
}

function applyIdeaCreate(state, payload) {
  const projectId = trimString(payload?.projectId);
  const ideaId = trimString(payload?.ideaId);
  const title = trimString(payload?.title);
  const summary = typeof payload?.summary === 'string' ? payload.summary.trim() : '';

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'idea.create', 'PROJECT_ID_REQUIRED');
  }
  if (!ideaId) {
    return fail(state, 'E_IDEA_ID_REQUIRED', 'idea.create', 'IDEA_ID_REQUIRED', { projectId });
  }
  if (!title) {
    return fail(state, 'E_IDEA_TITLE_REQUIRED', 'idea.create', 'IDEA_TITLE_REQUIRED', { projectId, ideaId });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'idea.create', 'PROJECT_NOT_FOUND', { projectId });
  }
  const ideas = normalizeIdeaAuthorData(project.ideas);
  if (ideas.ideas[ideaId]) {
    return fail(state, 'E_IDEA_ALREADY_EXISTS', 'idea.create', 'IDEA_ALREADY_EXISTS', { projectId, ideaId });
  }

  const next = cloneJson(state);
  const nextIdeas = ensureIdeaAuthorData(next.data.projects[projectId]);
  nextIdeas.ideas[ideaId] = {
    id: ideaId,
    title,
    summary,
    originLinkIds: [],
    createdByCommandSeq: next.data.lastCommandId + 1,
    updatedByCommandSeq: next.data.lastCommandId + 1,
  };
  next.data.lastCommandId += 1;
  return ok(next);
}

function normalizeIdeaOriginRef(value) {
  if (!isPlainObject(value)) return null;
  const sceneId = trimString(value.sceneId);
  const kind = trimString(value.kind) || 'sceneTextRange';
  const sourceHash = trimString(value.sourceHash);
  const startOffset = Number(value.startOffset);
  const endOffset = Number(value.endOffset);
  if (!sceneId || !sourceHash || !Number.isInteger(startOffset) || !Number.isInteger(endOffset) || endOffset <= startOffset) {
    return null;
  }
  return {
    schemaVersion: trimString(value.schemaVersion) || IDEA_ORIGIN_REF_SCHEMA_VERSION,
    kind,
    sceneId,
    startOffset,
    endOffset,
    sourceHash,
    targetId: trimString(value.targetId),
  };
}

function applyIdeaOriginLinkAdd(state, payload) {
  const projectId = trimString(payload?.projectId);
  const ideaId = trimString(payload?.ideaId);
  const originRef = normalizeIdeaOriginRef(payload?.originRef);
  const linkId = trimString(payload?.linkId) || `idea-origin-link:${hashCanonicalValue({
    projectId,
    ideaId,
    originRef,
  })}`;

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'idea.originLink.add', 'PROJECT_ID_REQUIRED');
  }
  if (!ideaId) {
    return fail(state, 'E_IDEA_ID_REQUIRED', 'idea.originLink.add', 'IDEA_ID_REQUIRED', { projectId });
  }
  if (!originRef) {
    return fail(state, 'E_IDEA_ORIGIN_REF_REQUIRED', 'idea.originLink.add', 'ORIGIN_REF_REQUIRED', { projectId, ideaId });
  }
  if (!linkId) {
    return fail(state, 'E_IDEA_ORIGIN_LINK_ID_REQUIRED', 'idea.originLink.add', 'ORIGIN_LINK_ID_REQUIRED', { projectId, ideaId });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'idea.originLink.add', 'PROJECT_NOT_FOUND', { projectId });
  }
  const ideas = normalizeIdeaAuthorData(project.ideas);
  const idea = ideas.ideas[ideaId];
  if (!idea) {
    return fail(state, 'E_IDEA_NOT_FOUND', 'idea.originLink.add', 'IDEA_NOT_FOUND', { projectId, ideaId });
  }
  const scene = project.scenes && project.scenes[originRef.sceneId];
  if (!scene) {
    return fail(state, 'E_CORE_SCENE_NOT_FOUND', 'idea.originLink.add', 'SCENE_NOT_FOUND', { projectId, sceneId: originRef.sceneId });
  }
  const sceneText = typeof scene.text === 'string' ? scene.text : '';
  if (originRef.endOffset > sceneText.length) {
    return fail(state, 'E_IDEA_ORIGIN_REF_RANGE_OUT_OF_BOUNDS', 'idea.originLink.add', 'ORIGIN_REF_RANGE_OUT_OF_BOUNDS', {
      projectId,
      ideaId,
      sceneId: originRef.sceneId,
      textLength: sceneText.length,
    });
  }
  const sceneTextHash = hashCanonicalValue(sceneText);
  if (originRef.sourceHash !== sceneTextHash) {
    return fail(state, 'E_IDEA_ORIGIN_REF_SOURCE_HASH_MISMATCH', 'idea.originLink.add', 'ORIGIN_REF_SOURCE_HASH_MISMATCH', {
      projectId,
      ideaId,
      sceneId: originRef.sceneId,
      expectedHash: sceneTextHash,
      receivedHash: originRef.sourceHash,
    });
  }
  if (ideas.originLinks[linkId]) {
    return fail(state, 'E_IDEA_ORIGIN_LINK_ALREADY_EXISTS', 'idea.originLink.add', 'ORIGIN_LINK_ALREADY_EXISTS', { projectId, ideaId, linkId });
  }

  const next = cloneJson(state);
  const nextIdeas = ensureIdeaAuthorData(next.data.projects[projectId]);
  const nextIdea = nextIdeas.ideas[ideaId];
  if (!Array.isArray(nextIdea.originLinkIds)) nextIdea.originLinkIds = [];
  nextIdeas.originLinks[linkId] = {
    id: linkId,
    ideaId,
    originRef,
    createdByCommandSeq: next.data.lastCommandId + 1,
  };
  nextIdea.originLinkIds.push(linkId);
  nextIdea.updatedByCommandSeq = next.data.lastCommandId + 1;
  next.data.lastCommandId += 1;
  return ok(next);
}

function normalizeMeaningPromotionSource(value) {
  if (!isPlainObject(value)) return null;
  const kind = trimString(value.kind);
  if (kind === 'idea') {
    const ideaId = trimString(value.ideaId || value.sourceId);
    if (!ideaId) return null;
    return { kind, ideaId };
  }
  if (kind === 'sceneOriginRef') {
    const originRef = normalizeIdeaOriginRef(value.originRef);
    if (!originRef) return null;
    return { kind, originRef };
  }
  return null;
}

function validateMeaningPromotionSource(state, projectId, source) {
  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'meaning.promote', 'PROJECT_NOT_FOUND', { projectId });
  }
  if (source.kind === 'idea') {
    const ideas = normalizeIdeaAuthorData(project.ideas);
    if (!ideas.ideas[source.ideaId]) {
      return fail(state, 'E_MEANING_SOURCE_IDEA_NOT_FOUND', 'meaning.promote', 'SOURCE_IDEA_NOT_FOUND', {
        projectId,
        ideaId: source.ideaId,
      });
    }
    return null;
  }

  const originRef = source.originRef;
  const scene = project.scenes && project.scenes[originRef.sceneId];
  if (!scene) {
    return fail(state, 'E_CORE_SCENE_NOT_FOUND', 'meaning.promote', 'SCENE_NOT_FOUND', {
      projectId,
      sceneId: originRef.sceneId,
    });
  }
  const sceneText = typeof scene.text === 'string' ? scene.text : '';
  if (originRef.endOffset > sceneText.length) {
    return fail(state, 'E_MEANING_ORIGIN_REF_RANGE_OUT_OF_BOUNDS', 'meaning.promote', 'ORIGIN_REF_RANGE_OUT_OF_BOUNDS', {
      projectId,
      sceneId: originRef.sceneId,
      textLength: sceneText.length,
    });
  }
  const sceneTextHash = hashCanonicalValue(sceneText);
  if (originRef.sourceHash !== sceneTextHash) {
    return fail(state, 'E_MEANING_ORIGIN_REF_SOURCE_HASH_MISMATCH', 'meaning.promote', 'ORIGIN_REF_SOURCE_HASH_MISMATCH', {
      projectId,
      sceneId: originRef.sceneId,
      expectedHash: sceneTextHash,
      receivedHash: originRef.sourceHash,
    });
  }
  return null;
}

function applyMeaningPromote(state, payload) {
  const projectId = trimString(payload?.projectId);
  const meaningId = trimString(payload?.meaningId);
  const title = trimString(payload?.title);
  const interpretation = typeof payload?.interpretation === 'string' ? payload.interpretation.trim() : '';
  const source = normalizeMeaningPromotionSource(payload?.source);

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'meaning.promote', 'PROJECT_ID_REQUIRED');
  }
  if (!meaningId) {
    return fail(state, 'E_MEANING_ID_REQUIRED', 'meaning.promote', 'MEANING_ID_REQUIRED', { projectId });
  }
  if (!title) {
    return fail(state, 'E_MEANING_TITLE_REQUIRED', 'meaning.promote', 'MEANING_TITLE_REQUIRED', { projectId, meaningId });
  }
  if (!interpretation) {
    return fail(state, 'E_MEANING_INTERPRETATION_REQUIRED', 'meaning.promote', 'MEANING_INTERPRETATION_REQUIRED', { projectId, meaningId });
  }
  if (!source) {
    return fail(state, 'E_MEANING_PROMOTION_SOURCE_REQUIRED', 'meaning.promote', 'PROMOTION_SOURCE_REQUIRED', { projectId, meaningId });
  }

  const sourceFailure = validateMeaningPromotionSource(state, projectId, source);
  if (sourceFailure) return sourceFailure;

  const project = state.data.projects[projectId];
  const meanings = normalizeMeaningAuthorData(project.meanings);
  if (meanings.meanings[meaningId]) {
    return fail(state, 'E_MEANING_ALREADY_EXISTS', 'meaning.promote', 'MEANING_ALREADY_EXISTS', { projectId, meaningId });
  }

  const next = cloneJson(state);
  const nextMeanings = ensureMeaningAuthorData(next.data.projects[projectId]);
  nextMeanings.meanings[meaningId] = {
    id: meaningId,
    title,
    interpretation,
    source,
    promotionKind: 'explicitAuthorPromotion',
    createdByCommandSeq: next.data.lastCommandId + 1,
    updatedByCommandSeq: next.data.lastCommandId + 1,
  };
  next.data.lastCommandId += 1;
  return ok(next);
}

function applyTextEdit(state, payload) {
  const projectId = typeof payload?.projectId === 'string' ? payload.projectId.trim() : '';
  const sceneId = typeof payload?.sceneId === 'string' ? payload.sceneId.trim() : '';
  const text = typeof payload?.text === 'string' ? payload.text : '';

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'project.applyTextEdit', 'PROJECT_ID_REQUIRED');
  }
  if (!sceneId) {
    return fail(state, 'E_CORE_SCENE_ID_REQUIRED', 'project.applyTextEdit', 'SCENE_ID_REQUIRED');
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'project.applyTextEdit', 'PROJECT_NOT_FOUND', { projectId });
  }

  const scene = project.scenes && project.scenes[sceneId];
  if (!scene) {
    return fail(state, 'E_CORE_SCENE_NOT_FOUND', 'project.applyTextEdit', 'SCENE_NOT_FOUND', { projectId, sceneId });
  }

  const next = cloneJson(state);
  next.data.projects[projectId].scenes[sceneId].text = text;
  next.data.lastCommandId += 1;
  return ok(next);
}

export function reduceCoreState(stateInput, commandInput) {
  const state = normalizeState(stateInput);
  const command = commandInput && typeof commandInput === 'object' && !Array.isArray(commandInput)
    ? commandInput
    : { type: '' };
  const type = typeof command.type === 'string' ? command.type : '';

  if (type === CORE_COMMAND_IDS.PROJECT_CREATE) {
    return applyCreateProject(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT) {
    return applyTextEdit(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE) {
    return applyAtlasEntityCreate(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.ATLAS_ALIAS_ADD) {
    return applyAtlasAliasAdd(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.ATLAS_MENTION_CONFIRM) {
    return applyAtlasMentionConfirm(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.IDEA_CREATE) {
    return applyIdeaCreate(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.IDEA_ORIGIN_LINK_ADD) {
    return applyIdeaOriginLinkAdd(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.MEANING_PROMOTE) {
    return applyMeaningPromote(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.MANUAL_MAP_CREATE) {
    return applyManualMapCreate(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD) {
    return applyManualMapNodeAdd(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.MANUAL_MAP_EDGE_ADD) {
    return applyManualMapEdgeAdd(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.MANUAL_MAP_ATTACHMENT_ADD) {
    return applyManualMapAttachmentAdd(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.MANUAL_MAP_PORTAL_ADD) {
    return applyManualMapPortalAdd(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.MANUAL_MAP_TEMPLATE_APPLY) {
    return applyManualMapTemplateApply(state, command.payload || {});
  }

  return fail(state, 'E_CORE_COMMAND_NOT_FOUND', type || 'unknown', 'COMMAND_NOT_FOUND', { type });
}

export function reduceCoreStateUnsafe(stateInput, commandInput) {
  const result = reduceCoreState(stateInput, commandInput);
  return result.state;
}

export function applyCoreSequence(initialState, commands) {
  let current = normalizeState(initialState);
  for (const command of Array.isArray(commands) ? commands : []) {
    const result = reduceCoreState(current, command);
    if (!result.ok) return result;
    current = result.state;
  }
  return ok(current);
}
