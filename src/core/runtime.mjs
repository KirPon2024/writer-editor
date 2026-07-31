import { hashCanonicalValue } from './browser-safe-hash.mjs';

export const CORE_COMMAND_IDS = Object.freeze({
  PROJECT_CREATE: 'project.create',
  PROJECT_APPLY_TEXT_EDIT: 'project.applyTextEdit',
  ATLAS_ENTITY_CREATE: 'atlas.entity.create',
  ATLAS_ALIAS_ADD: 'atlas.alias.add',
  ATLAS_MENTION_CONFIRM: 'atlas.mention.confirm',
  ATLAS_OBSERVATION_SUPPRESS: 'atlas.observation.suppress',
  ATLAS_ENTITY_MERGE: 'atlas.entity.merge',
  ATLAS_ENTITY_SPLIT_RESTORE: 'atlas.entity.splitRestore',
  ATLAS_OBSERVATION_REASSIGN: 'atlas.observation.reassign',
  ATLAS_EVIDENCE_REATTACH: 'atlas.evidence.reattach',
  ATLAS_SAVED_QUERY_SAVE: 'atlas.savedQuery.save',
  ATLAS_LANGUAGE_TAG_SET: 'atlas.languageTag.set',
  ATLAS_LANGUAGE_TAG_CLEAR: 'atlas.languageTag.clear',
  ATLAS_SERIES_PORTABILITY_APPLY: 'atlas.seriesPortability.apply',
  ATLAS_SERIES_PORTABILITY_ROLLBACK: 'atlas.seriesPortability.rollback',
  ATLAS_CALENDAR_DEFINE: 'atlas.calendar.define',
  ATLAS_SCENE_TEMPORAL_ANCHOR_SET: 'atlas.sceneTemporalAnchor.set',
  ATLAS_CONTINUITY_FACT_RECORD: 'atlas.continuityFact.record',
  IDEA_CREATE: 'idea.create',
  IDEA_ORIGIN_LINK_ADD: 'idea.originLink.add',
  MEANING_PROMOTE: 'meaning.promote',
  MANUAL_MAP_CREATE: 'manualMap.create',
  MANUAL_MAP_NODE_ADD: 'manualMap.node.add',
  MANUAL_MAP_NODE_UPDATE: 'manualMap.node.update',
  MANUAL_MAP_NODE_DELETE: 'manualMap.node.delete',
  MANUAL_MAP_EDGE_ADD: 'manualMap.edge.add',
  MANUAL_MAP_EDGE_UPDATE: 'manualMap.edge.update',
  MANUAL_MAP_EDGE_DELETE: 'manualMap.edge.delete',
  MANUAL_MAP_GROUP_CREATE: 'manualMap.group.create',
  MANUAL_MAP_GROUP_UPDATE: 'manualMap.group.update',
  MANUAL_MAP_GROUP_DELETE: 'manualMap.group.delete',
  MANUAL_MAP_ATTACHMENT_ADD: 'manualMap.attachment.add',
  MANUAL_MAP_PORTAL_ADD: 'manualMap.portal.add',
  MANUAL_MAP_TEMPLATE_APPLY: 'manualMap.template.apply',
});

const ATLAS_AUTHOR_SCHEMA_VERSION = 'atlas.author.v1';
const ATLAS_SERIES_IDENTITY_LINK_SCHEMA_VERSION = 'atlas.seriesIdentityLink.v1';
const ATLAS_CUSTOM_VOCABULARY_ROW_SCHEMA_VERSION = 'atlas.customVocabularyRow.v1';
const ATLAS_SERIES_PORTABILITY_PREVIEW_SCHEMA_VERSION = 'derived.atlas.seriesPortabilityPreview.v1';
const ATLAS_SERIES_PORTABILITY_APPLY_RECEIPT_SCHEMA_VERSION = 'atlas.seriesPortabilityApplyReceipt.v1';
const ATLAS_SERIES_PORTABILITY_ROLLBACK_PROOF_SCHEMA_VERSION = 'atlas.seriesPortabilityRollbackProof.v1';
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

function createEmptyAtlasContinuityFactLedgers() {
  return {
    location: {},
    knowledge: {},
    object: {},
    promise: {},
  };
}

function createEmptyAtlasLanguageTags() {
  return {
    project: null,
    scenes: {},
    blocks: {},
    ranges: {},
  };
}

function normalizeAtlasLanguageTags(input) {
  const source = isPlainObject(input) ? input : {};
  return {
    project: isPlainObject(source.project) ? cloneJson(source.project) : null,
    scenes: isPlainObject(source.scenes) ? cloneJson(source.scenes) : {},
    blocks: isPlainObject(source.blocks) ? cloneJson(source.blocks) : {},
    ranges: isPlainObject(source.ranges) ? cloneJson(source.ranges) : {},
  };
}

function normalizeAtlasContinuityFactLedgers(input) {
  const source = isPlainObject(input) ? input : {};
  const empty = createEmptyAtlasContinuityFactLedgers();
  return {
    location: isPlainObject(source.location) ? cloneJson(source.location) : empty.location,
    knowledge: isPlainObject(source.knowledge) ? cloneJson(source.knowledge) : empty.knowledge,
    object: isPlainObject(source.object) ? cloneJson(source.object) : empty.object,
    promise: isPlainObject(source.promise) ? cloneJson(source.promise) : empty.promise,
  };
}

function createEmptyAtlasAuthorData() {
  return {
    schemaVersion: ATLAS_AUTHOR_SCHEMA_VERSION,
    entities: {},
    decisions: {},
    suppressions: {},
    entityOperations: {},
    reassignments: {},
    evidenceReattachments: {},
    savedQueries: {},
    languageTags: createEmptyAtlasLanguageTags(),
    seriesIdentityLinks: {},
    entityVocabulary: {},
    relationVocabulary: {},
    seriesPortabilityOperations: {},
    calendarDefinitions: {},
    sceneTemporalAnchors: {},
    continuityFactLedgers: createEmptyAtlasContinuityFactLedgers(),
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
    suppressions: isPlainObject(input.suppressions) ? cloneJson(input.suppressions) : {},
    entityOperations: isPlainObject(input.entityOperations) ? cloneJson(input.entityOperations) : {},
    reassignments: isPlainObject(input.reassignments) ? cloneJson(input.reassignments) : {},
    evidenceReattachments: isPlainObject(input.evidenceReattachments) ? cloneJson(input.evidenceReattachments) : {},
    savedQueries: isPlainObject(input.savedQueries) ? cloneJson(input.savedQueries) : {},
    languageTags: normalizeAtlasLanguageTags(input.languageTags),
    seriesIdentityLinks: isPlainObject(input.seriesIdentityLinks) ? cloneJson(input.seriesIdentityLinks) : {},
    entityVocabulary: isPlainObject(input.entityVocabulary) ? cloneJson(input.entityVocabulary) : {},
    relationVocabulary: isPlainObject(input.relationVocabulary) ? cloneJson(input.relationVocabulary) : {},
    seriesPortabilityOperations: isPlainObject(input.seriesPortabilityOperations) ? cloneJson(input.seriesPortabilityOperations) : {},
    calendarDefinitions: isPlainObject(input.calendarDefinitions) ? cloneJson(input.calendarDefinitions) : {},
    sceneTemporalAnchors: isPlainObject(input.sceneTemporalAnchors) ? cloneJson(input.sceneTemporalAnchors) : {},
    continuityFactLedgers: normalizeAtlasContinuityFactLedgers(input.continuityFactLedgers),
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

function validateManualMapNodeTarget(project, targetKind, targetId, op, details = {}) {
  if (!targetKind) return null;
  if (targetKind === 'scene') {
    if (!targetId || !isPlainObject(project.scenes) || !project.scenes[targetId]) {
      return typedError('E_MANUAL_MAP_NODE_TARGET_SCENE_NOT_FOUND', op, 'TARGET_SCENE_NOT_FOUND', { ...details, targetId });
    }
    return null;
  }
  if (targetKind === 'entity') {
    const atlas = normalizeAtlasAuthorData(project.atlas);
    if (!targetId || !atlas.entities[targetId]) {
      return typedError('E_MANUAL_MAP_NODE_TARGET_ENTITY_NOT_FOUND', op, 'TARGET_ENTITY_NOT_FOUND', { ...details, targetId });
    }
    return null;
  }
  return typedError('E_MANUAL_MAP_NODE_TARGET_KIND_INVALID', op, 'TARGET_KIND_INVALID', { ...details, targetKind });
}

function normalizeManualMapGroupNodeIds(value, nodes) {
  const nodeIds = Array.isArray(value)
    ? value.map(trimString).filter(Boolean)
    : [];
  const unique = [...new Set(nodeIds)].sort();
  return {
    nodeIds: unique,
    missingNodeIds: unique.filter((nodeId) => !nodes[nodeId]),
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
  const targetError = validateManualMapNodeTarget(project, targetKind, targetId, 'manualMap.node.add', { projectId, mapId, nodeId });
  if (targetError) {
    return fail(state, targetError.code, targetError.op, targetError.reason, targetError.details);
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

function applyManualMapNodeUpdate(state, payload) {
  const projectId = trimString(payload?.projectId);
  const mapId = trimString(payload?.mapId);
  const nodeId = trimString(payload?.nodeId);
  const label = Object.prototype.hasOwnProperty.call(payload || {}, 'label') ? trimString(payload?.label) : null;
  const nodeKind = Object.prototype.hasOwnProperty.call(payload || {}, 'nodeKind') ? trimString(payload?.nodeKind) : null;
  const hasPosition = isPlainObject(payload?.position);
  const hasTarget = Object.prototype.hasOwnProperty.call(payload || {}, 'targetKind')
    || Object.prototype.hasOwnProperty.call(payload || {}, 'targetId');
  const targetKind = hasTarget ? trimString(payload?.targetKind) : '';
  const targetId = hasTarget ? trimString(payload?.targetId) : '';

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'manualMap.node.update', 'PROJECT_ID_REQUIRED');
  }
  if (!mapId) {
    return fail(state, 'E_MANUAL_MAP_ID_REQUIRED', 'manualMap.node.update', 'MAP_ID_REQUIRED', { projectId });
  }
  if (!nodeId) {
    return fail(state, 'E_MANUAL_MAP_NODE_ID_REQUIRED', 'manualMap.node.update', 'NODE_ID_REQUIRED', { projectId, mapId });
  }
  if (label !== null && !label) {
    return fail(state, 'E_MANUAL_MAP_NODE_LABEL_REQUIRED', 'manualMap.node.update', 'NODE_LABEL_REQUIRED', { projectId, mapId, nodeId });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'manualMap.node.update', 'PROJECT_NOT_FOUND', { projectId });
  }
  const manualMaps = normalizeManualMapData(project.manualMaps);
  const map = manualMaps.maps[mapId];
  if (!isPlainObject(map)) {
    return fail(state, 'E_MANUAL_MAP_NOT_FOUND', 'manualMap.node.update', 'MAP_NOT_FOUND', { projectId, mapId });
  }
  const nodes = isPlainObject(map.nodes) ? map.nodes : {};
  if (!nodes[nodeId]) {
    return fail(state, 'E_MANUAL_MAP_NODE_NOT_FOUND', 'manualMap.node.update', 'NODE_NOT_FOUND', { projectId, mapId, nodeId });
  }
  if (hasTarget) {
    const targetError = validateManualMapNodeTarget(project, targetKind, targetId, 'manualMap.node.update', { projectId, mapId, nodeId });
    if (targetError) {
      return fail(state, targetError.code, targetError.op, targetError.reason, targetError.details);
    }
  }

  const next = cloneJson(state);
  const nextManualMaps = ensureManualMapData(next.data.projects[projectId]);
  const nextMap = nextManualMaps.maps[mapId];
  const nextNode = nextMap.nodes[nodeId];
  const commandSeq = next.data.lastCommandId + 1;
  if (label !== null) nextNode.label = label;
  if (nodeKind !== null && nodeKind) nextNode.nodeKind = nodeKind;
  if (hasPosition) nextNode.position = normalizePosition(payload.position);
  if (hasTarget) {
    nextNode.target = { kind: targetKind, id: targetId };
  }
  nextNode.updatedByCommandSeq = commandSeq;
  nextMap.updatedByCommandSeq = commandSeq;
  next.data.lastCommandId = commandSeq;
  return ok(next);
}

function applyManualMapNodeDelete(state, payload) {
  const projectId = trimString(payload?.projectId);
  const mapId = trimString(payload?.mapId);
  const nodeId = trimString(payload?.nodeId);

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'manualMap.node.delete', 'PROJECT_ID_REQUIRED');
  }
  if (!mapId) {
    return fail(state, 'E_MANUAL_MAP_ID_REQUIRED', 'manualMap.node.delete', 'MAP_ID_REQUIRED', { projectId });
  }
  if (!nodeId) {
    return fail(state, 'E_MANUAL_MAP_NODE_ID_REQUIRED', 'manualMap.node.delete', 'NODE_ID_REQUIRED', { projectId, mapId });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'manualMap.node.delete', 'PROJECT_NOT_FOUND', { projectId });
  }
  const manualMaps = normalizeManualMapData(project.manualMaps);
  const map = manualMaps.maps[mapId];
  if (!isPlainObject(map)) {
    return fail(state, 'E_MANUAL_MAP_NOT_FOUND', 'manualMap.node.delete', 'MAP_NOT_FOUND', { projectId, mapId });
  }
  const nodes = isPlainObject(map.nodes) ? map.nodes : {};
  if (!nodes[nodeId]) {
    return fail(state, 'E_MANUAL_MAP_NODE_NOT_FOUND', 'manualMap.node.delete', 'NODE_NOT_FOUND', { projectId, mapId, nodeId });
  }

  const next = cloneJson(state);
  const nextManualMaps = ensureManualMapData(next.data.projects[projectId]);
  const nextMap = nextManualMaps.maps[mapId];
  const commandSeq = next.data.lastCommandId + 1;
  delete nextMap.nodes[nodeId];
  if (isPlainObject(nextMap.edges)) {
    Object.keys(nextMap.edges).forEach((edgeId) => {
      const edge = nextMap.edges[edgeId];
      if (edge?.fromNodeId === nodeId || edge?.toNodeId === nodeId) delete nextMap.edges[edgeId];
    });
  }
  if (isPlainObject(nextMap.attachments)) {
    Object.keys(nextMap.attachments).forEach((attachmentId) => {
      if (nextMap.attachments[attachmentId]?.nodeId === nodeId) delete nextMap.attachments[attachmentId];
    });
  }
  if (isPlainObject(nextMap.portals)) {
    Object.keys(nextMap.portals).forEach((portalId) => {
      if (nextMap.portals[portalId]?.fromNodeId === nodeId) delete nextMap.portals[portalId];
    });
  }
  if (isPlainObject(nextMap.groups)) {
    Object.keys(nextMap.groups).forEach((groupId) => {
      const group = nextMap.groups[groupId];
      const nodeIds = Array.isArray(group?.nodeIds)
        ? group.nodeIds.map(trimString).filter((id) => id && id !== nodeId).sort()
        : [];
      if (nodeIds.length === 0) {
        delete nextMap.groups[groupId];
      } else {
        nextMap.groups[groupId] = { ...group, nodeIds, updatedByCommandSeq: commandSeq };
      }
    });
  }
  if (isPlainObject(nextMap.templates)) {
    Object.keys(nextMap.templates).forEach((templateId) => {
      const template = nextMap.templates[templateId];
      const appliedNodeIds = Array.isArray(template?.appliedNodeIds)
        ? template.appliedNodeIds.map(trimString).filter((id) => id && id !== nodeId).sort()
        : [];
      const appliedEdgeIds = Array.isArray(template?.appliedEdgeIds)
        ? template.appliedEdgeIds.map(trimString).filter((edgeId) => isPlainObject(nextMap.edges) && nextMap.edges[edgeId]).sort()
        : [];
      if (appliedNodeIds.length === 0) {
        delete nextMap.templates[templateId];
      } else {
        nextMap.templates[templateId] = { ...template, appliedNodeIds, appliedEdgeIds };
      }
    });
  }
  nextMap.updatedByCommandSeq = commandSeq;
  next.data.lastCommandId = commandSeq;
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

function applyManualMapEdgeUpdate(state, payload) {
  const projectId = trimString(payload?.projectId);
  const mapId = trimString(payload?.mapId);
  const edgeId = trimString(payload?.edgeId);
  const hasFrom = Object.prototype.hasOwnProperty.call(payload || {}, 'fromNodeId');
  const hasTo = Object.prototype.hasOwnProperty.call(payload || {}, 'toNodeId');
  const hasKind = Object.prototype.hasOwnProperty.call(payload || {}, 'edgeKind');
  const hasLabel = Object.prototype.hasOwnProperty.call(payload || {}, 'label');

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'manualMap.edge.update', 'PROJECT_ID_REQUIRED');
  }
  if (!mapId) {
    return fail(state, 'E_MANUAL_MAP_ID_REQUIRED', 'manualMap.edge.update', 'MAP_ID_REQUIRED', { projectId });
  }
  if (!edgeId) {
    return fail(state, 'E_MANUAL_MAP_EDGE_ID_REQUIRED', 'manualMap.edge.update', 'EDGE_ID_REQUIRED', { projectId, mapId });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'manualMap.edge.update', 'PROJECT_NOT_FOUND', { projectId });
  }
  const manualMaps = normalizeManualMapData(project.manualMaps);
  const map = manualMaps.maps[mapId];
  if (!isPlainObject(map)) {
    return fail(state, 'E_MANUAL_MAP_NOT_FOUND', 'manualMap.edge.update', 'MAP_NOT_FOUND', { projectId, mapId });
  }
  const edges = isPlainObject(map.edges) ? map.edges : {};
  const edge = edges[edgeId];
  if (!edge) {
    return fail(state, 'E_MANUAL_MAP_EDGE_NOT_FOUND', 'manualMap.edge.update', 'EDGE_NOT_FOUND', { projectId, mapId, edgeId });
  }
  const nodes = isPlainObject(map.nodes) ? map.nodes : {};
  const fromNodeId = hasFrom ? trimString(payload?.fromNodeId) : trimString(edge.fromNodeId);
  const toNodeId = hasTo ? trimString(payload?.toNodeId) : trimString(edge.toNodeId);
  if (!fromNodeId || !toNodeId || fromNodeId === toNodeId || !nodes[fromNodeId] || !nodes[toNodeId]) {
    return fail(state, 'E_MANUAL_MAP_EDGE_ENDPOINTS_INVALID', 'manualMap.edge.update', 'EDGE_ENDPOINTS_INVALID', {
      projectId,
      mapId,
      edgeId,
      fromNodeId,
      toNodeId,
    });
  }

  const next = cloneJson(state);
  const nextManualMaps = ensureManualMapData(next.data.projects[projectId]);
  const nextMap = nextManualMaps.maps[mapId];
  const nextEdge = nextMap.edges[edgeId];
  const commandSeq = next.data.lastCommandId + 1;
  nextEdge.fromNodeId = fromNodeId;
  nextEdge.toNodeId = toNodeId;
  if (hasKind) nextEdge.edgeKind = trimString(payload?.edgeKind) || 'link';
  if (hasLabel) nextEdge.label = trimString(payload?.label);
  nextEdge.updatedByCommandSeq = commandSeq;
  nextMap.updatedByCommandSeq = commandSeq;
  next.data.lastCommandId = commandSeq;
  return ok(next);
}

function applyManualMapEdgeDelete(state, payload) {
  const projectId = trimString(payload?.projectId);
  const mapId = trimString(payload?.mapId);
  const edgeId = trimString(payload?.edgeId);

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'manualMap.edge.delete', 'PROJECT_ID_REQUIRED');
  }
  if (!mapId) {
    return fail(state, 'E_MANUAL_MAP_ID_REQUIRED', 'manualMap.edge.delete', 'MAP_ID_REQUIRED', { projectId });
  }
  if (!edgeId) {
    return fail(state, 'E_MANUAL_MAP_EDGE_ID_REQUIRED', 'manualMap.edge.delete', 'EDGE_ID_REQUIRED', { projectId, mapId });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'manualMap.edge.delete', 'PROJECT_NOT_FOUND', { projectId });
  }
  const manualMaps = normalizeManualMapData(project.manualMaps);
  const map = manualMaps.maps[mapId];
  if (!isPlainObject(map)) {
    return fail(state, 'E_MANUAL_MAP_NOT_FOUND', 'manualMap.edge.delete', 'MAP_NOT_FOUND', { projectId, mapId });
  }
  const edges = isPlainObject(map.edges) ? map.edges : {};
  if (!edges[edgeId]) {
    return fail(state, 'E_MANUAL_MAP_EDGE_NOT_FOUND', 'manualMap.edge.delete', 'EDGE_NOT_FOUND', { projectId, mapId, edgeId });
  }

  const next = cloneJson(state);
  const nextManualMaps = ensureManualMapData(next.data.projects[projectId]);
  const nextMap = nextManualMaps.maps[mapId];
  const commandSeq = next.data.lastCommandId + 1;
  delete nextMap.edges[edgeId];
  if (isPlainObject(nextMap.templates)) {
    Object.keys(nextMap.templates).forEach((templateId) => {
      const template = nextMap.templates[templateId];
      if (!Array.isArray(template?.appliedEdgeIds)) return;
      nextMap.templates[templateId] = {
        ...template,
        appliedEdgeIds: template.appliedEdgeIds.map(trimString).filter((id) => id && id !== edgeId).sort(),
      };
    });
  }
  nextMap.updatedByCommandSeq = commandSeq;
  next.data.lastCommandId = commandSeq;
  return ok(next);
}

function applyManualMapGroupCreate(state, payload) {
  const projectId = trimString(payload?.projectId);
  const mapId = trimString(payload?.mapId);
  const groupId = trimString(payload?.groupId);
  const label = trimString(payload?.label);
  const colorTag = trimString(payload?.colorTag);

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'manualMap.group.create', 'PROJECT_ID_REQUIRED');
  }
  if (!mapId) {
    return fail(state, 'E_MANUAL_MAP_ID_REQUIRED', 'manualMap.group.create', 'MAP_ID_REQUIRED', { projectId });
  }
  if (!groupId) {
    return fail(state, 'E_MANUAL_MAP_GROUP_ID_REQUIRED', 'manualMap.group.create', 'GROUP_ID_REQUIRED', { projectId, mapId });
  }
  if (!label) {
    return fail(state, 'E_MANUAL_MAP_GROUP_LABEL_REQUIRED', 'manualMap.group.create', 'GROUP_LABEL_REQUIRED', { projectId, mapId, groupId });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'manualMap.group.create', 'PROJECT_NOT_FOUND', { projectId });
  }
  const manualMaps = normalizeManualMapData(project.manualMaps);
  const map = manualMaps.maps[mapId];
  if (!isPlainObject(map)) {
    return fail(state, 'E_MANUAL_MAP_NOT_FOUND', 'manualMap.group.create', 'MAP_NOT_FOUND', { projectId, mapId });
  }
  const groups = isPlainObject(map.groups) ? map.groups : {};
  if (groups[groupId]) {
    return fail(state, 'E_MANUAL_MAP_GROUP_ALREADY_EXISTS', 'manualMap.group.create', 'GROUP_ALREADY_EXISTS', { projectId, mapId, groupId });
  }
  const nodes = isPlainObject(map.nodes) ? map.nodes : {};
  const normalizedNodes = normalizeManualMapGroupNodeIds(payload?.nodeIds, nodes);
  if (normalizedNodes.nodeIds.length === 0 || normalizedNodes.missingNodeIds.length > 0) {
    return fail(state, 'E_MANUAL_MAP_GROUP_NODE_IDS_INVALID', 'manualMap.group.create', 'GROUP_NODE_IDS_INVALID', {
      projectId,
      mapId,
      groupId,
      missingNodeIds: normalizedNodes.missingNodeIds,
    });
  }

  const next = cloneJson(state);
  const nextManualMaps = ensureManualMapData(next.data.projects[projectId]);
  const nextMap = nextManualMaps.maps[mapId];
  if (!isPlainObject(nextMap.groups)) nextMap.groups = {};
  const commandSeq = next.data.lastCommandId + 1;
  nextMap.groups[groupId] = {
    id: groupId,
    label,
    colorTag,
    nodeIds: normalizedNodes.nodeIds,
    createdByCommandSeq: commandSeq,
    updatedByCommandSeq: commandSeq,
  };
  nextMap.updatedByCommandSeq = commandSeq;
  next.data.lastCommandId = commandSeq;
  return ok(next);
}

function applyManualMapGroupUpdate(state, payload) {
  const projectId = trimString(payload?.projectId);
  const mapId = trimString(payload?.mapId);
  const groupId = trimString(payload?.groupId);
  const hasLabel = Object.prototype.hasOwnProperty.call(payload || {}, 'label');
  const hasColorTag = Object.prototype.hasOwnProperty.call(payload || {}, 'colorTag');
  const hasNodeIds = Object.prototype.hasOwnProperty.call(payload || {}, 'nodeIds');
  const label = hasLabel ? trimString(payload?.label) : '';
  const colorTag = hasColorTag ? trimString(payload?.colorTag) : '';

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'manualMap.group.update', 'PROJECT_ID_REQUIRED');
  }
  if (!mapId) {
    return fail(state, 'E_MANUAL_MAP_ID_REQUIRED', 'manualMap.group.update', 'MAP_ID_REQUIRED', { projectId });
  }
  if (!groupId) {
    return fail(state, 'E_MANUAL_MAP_GROUP_ID_REQUIRED', 'manualMap.group.update', 'GROUP_ID_REQUIRED', { projectId, mapId });
  }
  if (hasLabel && !label) {
    return fail(state, 'E_MANUAL_MAP_GROUP_LABEL_REQUIRED', 'manualMap.group.update', 'GROUP_LABEL_REQUIRED', { projectId, mapId, groupId });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'manualMap.group.update', 'PROJECT_NOT_FOUND', { projectId });
  }
  const manualMaps = normalizeManualMapData(project.manualMaps);
  const map = manualMaps.maps[mapId];
  if (!isPlainObject(map)) {
    return fail(state, 'E_MANUAL_MAP_NOT_FOUND', 'manualMap.group.update', 'MAP_NOT_FOUND', { projectId, mapId });
  }
  const groups = isPlainObject(map.groups) ? map.groups : {};
  if (!groups[groupId]) {
    return fail(state, 'E_MANUAL_MAP_GROUP_NOT_FOUND', 'manualMap.group.update', 'GROUP_NOT_FOUND', { projectId, mapId, groupId });
  }
  let normalizedNodes = null;
  if (hasNodeIds) {
    const nodes = isPlainObject(map.nodes) ? map.nodes : {};
    normalizedNodes = normalizeManualMapGroupNodeIds(payload?.nodeIds, nodes);
    if (normalizedNodes.nodeIds.length === 0 || normalizedNodes.missingNodeIds.length > 0) {
      return fail(state, 'E_MANUAL_MAP_GROUP_NODE_IDS_INVALID', 'manualMap.group.update', 'GROUP_NODE_IDS_INVALID', {
        projectId,
        mapId,
        groupId,
        missingNodeIds: normalizedNodes.missingNodeIds,
      });
    }
  }

  const next = cloneJson(state);
  const nextManualMaps = ensureManualMapData(next.data.projects[projectId]);
  const nextMap = nextManualMaps.maps[mapId];
  const nextGroup = nextMap.groups[groupId];
  const commandSeq = next.data.lastCommandId + 1;
  if (hasLabel) nextGroup.label = label;
  if (hasColorTag) nextGroup.colorTag = colorTag;
  if (normalizedNodes) nextGroup.nodeIds = normalizedNodes.nodeIds;
  nextGroup.updatedByCommandSeq = commandSeq;
  nextMap.updatedByCommandSeq = commandSeq;
  next.data.lastCommandId = commandSeq;
  return ok(next);
}

function applyManualMapGroupDelete(state, payload) {
  const projectId = trimString(payload?.projectId);
  const mapId = trimString(payload?.mapId);
  const groupId = trimString(payload?.groupId);

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'manualMap.group.delete', 'PROJECT_ID_REQUIRED');
  }
  if (!mapId) {
    return fail(state, 'E_MANUAL_MAP_ID_REQUIRED', 'manualMap.group.delete', 'MAP_ID_REQUIRED', { projectId });
  }
  if (!groupId) {
    return fail(state, 'E_MANUAL_MAP_GROUP_ID_REQUIRED', 'manualMap.group.delete', 'GROUP_ID_REQUIRED', { projectId, mapId });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'manualMap.group.delete', 'PROJECT_NOT_FOUND', { projectId });
  }
  const manualMaps = normalizeManualMapData(project.manualMaps);
  const map = manualMaps.maps[mapId];
  if (!isPlainObject(map)) {
    return fail(state, 'E_MANUAL_MAP_NOT_FOUND', 'manualMap.group.delete', 'MAP_NOT_FOUND', { projectId, mapId });
  }
  const groups = isPlainObject(map.groups) ? map.groups : {};
  if (!groups[groupId]) {
    return fail(state, 'E_MANUAL_MAP_GROUP_NOT_FOUND', 'manualMap.group.delete', 'GROUP_NOT_FOUND', { projectId, mapId, groupId });
  }

  const next = cloneJson(state);
  const nextManualMaps = ensureManualMapData(next.data.projects[projectId]);
  const nextMap = nextManualMaps.maps[mapId];
  const commandSeq = next.data.lastCommandId + 1;
  delete nextMap.groups[groupId];
  nextMap.updatedByCommandSeq = commandSeq;
  next.data.lastCommandId = commandSeq;
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
    const targetError = validateManualMapNodeTarget(project, targetKind, targetId, 'manualMap.template.apply', { projectId, mapId, templateId, nodeId });
    if (targetError) {
      return fail(
        state,
        targetError.code === 'E_MANUAL_MAP_NODE_TARGET_SCENE_NOT_FOUND'
          ? 'E_MANUAL_MAP_TEMPLATE_TARGET_SCENE_NOT_FOUND'
          : targetError.code === 'E_MANUAL_MAP_NODE_TARGET_ENTITY_NOT_FOUND'
            ? 'E_MANUAL_MAP_TEMPLATE_TARGET_ENTITY_NOT_FOUND'
            : targetError.code,
        targetError.op,
        targetError.reason === 'TARGET_SCENE_NOT_FOUND'
          ? 'TEMPLATE_TARGET_SCENE_NOT_FOUND'
          : targetError.reason === 'TARGET_ENTITY_NOT_FOUND'
            ? 'TEMPLATE_TARGET_ENTITY_NOT_FOUND'
            : targetError.reason,
        targetError.details,
      );
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

function normalizeAtlasCalendarKind(value) {
  const kind = trimString(value);
  if (kind === 'real' || kind === 'fictional') return kind;
  return '';
}

function normalizeAtlasCalendarRulePrecision(value) {
  const precision = trimString(value);
  if (precision === 'exact' || precision === 'approximate' || precision === 'unsupported') return precision;
  return '';
}

function normalizeAtlasCalendarConversionRule(rule) {
  if (!isPlainObject(rule)) return { ok: false, reason: 'CONVERSION_RULE_OBJECT_REQUIRED' };
  const id = trimString(rule.id || rule.ruleId);
  const ruleKind = trimString(rule.ruleKind);
  const sourceScale = trimString(rule.sourceScale);
  const targetScale = trimString(rule.targetScale);
  const precision = normalizeAtlasCalendarRulePrecision(rule.precision);
  const reason = trimString(rule.reason);
  if (!id) return { ok: false, reason: 'CONVERSION_RULE_ID_REQUIRED' };
  if (!['identity', 'dayOffset', 'unsupported'].includes(ruleKind)) {
    return { ok: false, reason: 'CONVERSION_RULE_KIND_INVALID', details: { id, ruleKind } };
  }
  if (!sourceScale) return { ok: false, reason: 'CONVERSION_RULE_SOURCE_SCALE_REQUIRED', details: { id } };
  if (!targetScale) return { ok: false, reason: 'CONVERSION_RULE_TARGET_SCALE_REQUIRED', details: { id } };
  if (!precision) return { ok: false, reason: 'CONVERSION_RULE_PRECISION_REQUIRED', details: { id } };
  if (ruleKind === 'unsupported' && precision !== 'unsupported') {
    return { ok: false, reason: 'CONVERSION_RULE_UNSUPPORTED_PRECISION_REQUIRED', details: { id, precision } };
  }
  if (ruleKind !== 'unsupported' && precision === 'unsupported') {
    return { ok: false, reason: 'CONVERSION_RULE_SUPPORTED_PRECISION_INVALID', details: { id, ruleKind } };
  }
  if (ruleKind === 'unsupported' && !reason) {
    return { ok: false, reason: 'CONVERSION_RULE_UNSUPPORTED_REASON_REQUIRED', details: { id } };
  }
  const offsetDays = Number(rule.offsetDays);
  if (ruleKind === 'dayOffset' && !Number.isSafeInteger(offsetDays)) {
    return { ok: false, reason: 'CONVERSION_RULE_OFFSET_DAYS_REQUIRED', details: { id } };
  }
  return {
    ok: true,
    value: {
      schemaVersion: 'atlas.calendarConversionRule.v1',
      id,
      ruleKind,
      sourceScale,
      targetScale,
      precision,
      canConvert: ruleKind !== 'unsupported',
      offsetDays: ruleKind === 'dayOffset' ? offsetDays : 0,
      reason: ruleKind === 'unsupported' ? reason : '',
    },
  };
}

function applyAtlasCalendarDefine(state, payload) {
  const projectId = trimString(payload?.projectId);
  const calendarId = trimString(payload?.calendarId);
  const name = trimString(payload?.name);
  const calendarKind = normalizeAtlasCalendarKind(payload?.calendarKind);
  const calendarSystem = trimString(payload?.calendarSystem);
  const dayZeroLabel = trimString(payload?.dayZeroLabel);
  const conversionRuleInputs = Array.isArray(payload?.conversionRules) ? payload.conversionRules : [];

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'atlas.calendar.define', 'PROJECT_ID_REQUIRED');
  }
  if (!calendarId) {
    return fail(state, 'E_ATLAS_CALENDAR_ID_REQUIRED', 'atlas.calendar.define', 'CALENDAR_ID_REQUIRED', { projectId });
  }
  if (!name) {
    return fail(state, 'E_ATLAS_CALENDAR_NAME_REQUIRED', 'atlas.calendar.define', 'CALENDAR_NAME_REQUIRED', { projectId, calendarId });
  }
  if (!calendarKind) {
    return fail(state, 'E_ATLAS_CALENDAR_KIND_INVALID', 'atlas.calendar.define', 'CALENDAR_KIND_INVALID', { projectId, calendarId });
  }
  if (!calendarSystem) {
    return fail(state, 'E_ATLAS_CALENDAR_SYSTEM_REQUIRED', 'atlas.calendar.define', 'CALENDAR_SYSTEM_REQUIRED', { projectId, calendarId });
  }
  if (conversionRuleInputs.length < 1) {
    return fail(state, 'E_ATLAS_CALENDAR_CONVERSION_RULE_REQUIRED', 'atlas.calendar.define', 'CONVERSION_RULE_REQUIRED', { projectId, calendarId });
  }

  const seenRuleIds = new Set();
  const conversionRules = [];
  for (const ruleInput of conversionRuleInputs) {
    const normalized = normalizeAtlasCalendarConversionRule(ruleInput);
    if (!normalized.ok) {
      return fail(state, `E_ATLAS_CALENDAR_${normalized.reason}`, 'atlas.calendar.define', normalized.reason, {
        projectId,
        calendarId,
        ...(isPlainObject(normalized.details) ? normalized.details : {}),
      });
    }
    if (seenRuleIds.has(normalized.value.id)) {
      return fail(state, 'E_ATLAS_CALENDAR_CONVERSION_RULE_DUPLICATE', 'atlas.calendar.define', 'CONVERSION_RULE_DUPLICATE', {
        projectId,
        calendarId,
        ruleId: normalized.value.id,
      });
    }
    seenRuleIds.add(normalized.value.id);
    conversionRules.push(normalized.value);
  }
  conversionRules.sort((a, b) => a.id.localeCompare(b.id, 'en', { sensitivity: 'variant' }));

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'atlas.calendar.define', 'PROJECT_NOT_FOUND', { projectId });
  }

  const atlas = normalizeAtlasAuthorData(project.atlas);
  const existing = isPlainObject(atlas.calendarDefinitions?.[calendarId])
    ? atlas.calendarDefinitions[calendarId]
    : null;
  const expectedCalendarHash = trimString(payload?.expectedCalendarHash);
  const actualCalendarHash = existing ? hashCanonicalValue(existing) : '';
  if (expectedCalendarHash && expectedCalendarHash !== actualCalendarHash) {
    return fail(state, 'E_ATLAS_CALENDAR_STALE', 'atlas.calendar.define', 'CALENDAR_STALE', {
      projectId,
      calendarId,
      expectedCalendarHash,
      actualCalendarHash,
    });
  }

  const commandSeq = state.data.lastCommandId + 1;
  const calendarBase = {
    schemaVersion: 'atlas.calendarDefinition.v1',
    id: calendarId,
    name,
    calendarKind,
    calendarSystem,
    dayZeroLabel,
    localePolicy: 'project-local',
    conversionRules,
    createdByCommandSeq: Number.isInteger(existing?.createdByCommandSeq) ? existing.createdByCommandSeq : commandSeq,
    updatedByCommandSeq: commandSeq,
  };
  const next = cloneJson(state);
  const nextProject = next.data.projects[projectId];
  const nextAtlas = ensureAtlasAuthorData(nextProject);
  if (!isPlainObject(nextAtlas.calendarDefinitions)) nextAtlas.calendarDefinitions = {};
  nextAtlas.calendarDefinitions[calendarId] = {
    ...calendarBase,
    sourceHash: hashCanonicalValue(calendarBase),
  };
  next.data.lastCommandId += 1;
  return ok(next);
}

function normalizeAtlasTemporalPoint(point, context) {
  if (!isPlainObject(point)) return { ok: false, reason: 'TEMPORAL_POINT_OBJECT_REQUIRED' };
  const pointKind = trimString(point.pointKind);
  const calendarId = trimString(point.calendarId);
  if (!['ordinalDay', 'calendarDate', 'label'].includes(pointKind)) {
    return { ok: false, reason: 'TEMPORAL_POINT_KIND_INVALID', details: { pointKind } };
  }
  if ((pointKind === 'calendarDate' || pointKind === 'label') && !calendarId) {
    return { ok: false, reason: 'TEMPORAL_POINT_CALENDAR_ID_REQUIRED', details: { pointKind } };
  }
  if (calendarId) {
    const atlas = normalizeAtlasAuthorData(context.project?.atlas);
    if (!isPlainObject(atlas.calendarDefinitions?.[calendarId])) {
      return { ok: false, reason: 'TEMPORAL_POINT_CALENDAR_NOT_FOUND', details: { calendarId } };
    }
  }
  if (pointKind === 'ordinalDay') {
    const dayIndex = Number(point.dayIndex);
    if (!Number.isSafeInteger(dayIndex)) {
      return { ok: false, reason: 'TEMPORAL_POINT_DAY_INDEX_REQUIRED' };
    }
    return {
      ok: true,
      value: {
        schemaVersion: 'atlas.temporalPoint.v1',
        pointKind,
        calendarId: '',
        dayIndex,
        value: '',
        label: '',
      },
    };
  }
  if (pointKind === 'calendarDate') {
    const value = trimString(point.value || point.date);
    if (!value) return { ok: false, reason: 'TEMPORAL_POINT_DATE_REQUIRED', details: { calendarId } };
    return {
      ok: true,
      value: {
        schemaVersion: 'atlas.temporalPoint.v1',
        pointKind,
        calendarId,
        dayIndex: 0,
        value,
        label: '',
      },
    };
  }
  const label = trimString(point.label || point.value);
  if (!label) return { ok: false, reason: 'TEMPORAL_POINT_LABEL_REQUIRED', details: { calendarId } };
  return {
    ok: true,
    value: {
      schemaVersion: 'atlas.temporalPoint.v1',
      pointKind,
      calendarId,
      dayIndex: 0,
      value: '',
      label,
    },
  };
}

function normalizeAtlasTemporalRange(range, context) {
  if (!isPlainObject(range)) return { ok: false, reason: 'TEMPORAL_RANGE_OBJECT_REQUIRED' };
  const rangeKind = trimString(range.rangeKind);
  const precisionNote = trimString(range.precisionNote || range.reason);
  if (!['exact', 'approximate', 'open', 'unknown'].includes(rangeKind)) {
    return { ok: false, reason: 'TEMPORAL_RANGE_KIND_INVALID', details: { rangeKind } };
  }
  if (rangeKind === 'unknown') {
    if (!precisionNote) return { ok: false, reason: 'TEMPORAL_RANGE_UNKNOWN_REASON_REQUIRED' };
    return {
      ok: true,
      value: {
        schemaVersion: 'atlas.temporalRange.v1',
        rangeKind,
        start: null,
        end: null,
        precisionNote,
        explicitUnknown: true,
      },
    };
  }

  const start = range.start == null ? null : normalizeAtlasTemporalPoint(range.start, context);
  const end = range.end == null ? null : normalizeAtlasTemporalPoint(range.end, context);
  if (start && !start.ok) return start;
  if (end && !end.ok) return end;
  if (rangeKind === 'exact' && (!start || !end)) {
    return { ok: false, reason: 'TEMPORAL_RANGE_EXACT_BOUNDS_REQUIRED' };
  }
  if (rangeKind === 'approximate') {
    if (!start && !end) return { ok: false, reason: 'TEMPORAL_RANGE_APPROXIMATE_BOUND_REQUIRED' };
    if (!precisionNote) return { ok: false, reason: 'TEMPORAL_RANGE_APPROXIMATE_NOTE_REQUIRED' };
  }
  if (rangeKind === 'open') {
    if ((start && end) || (!start && !end)) return { ok: false, reason: 'TEMPORAL_RANGE_OPEN_SINGLE_BOUND_REQUIRED' };
    if (!precisionNote) return { ok: false, reason: 'TEMPORAL_RANGE_OPEN_REASON_REQUIRED' };
  }
  return {
    ok: true,
    value: {
      schemaVersion: 'atlas.temporalRange.v1',
      rangeKind,
      start: start ? start.value : null,
      end: end ? end.value : null,
      precisionNote,
      explicitUnknown: false,
    },
  };
}

function applyAtlasSceneTemporalAnchorSet(state, payload) {
  const projectId = trimString(payload?.projectId);
  const sceneId = trimString(payload?.sceneId);
  const anchorId = trimString(payload?.anchorId) || `atlas-scene-temporal-anchor:${hashCanonicalValue({ projectId, sceneId })}`;
  const note = trimString(payload?.note);

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'atlas.sceneTemporalAnchor.set', 'PROJECT_ID_REQUIRED');
  }
  if (!sceneId) {
    return fail(state, 'E_CORE_SCENE_ID_REQUIRED', 'atlas.sceneTemporalAnchor.set', 'SCENE_ID_REQUIRED', { projectId });
  }
  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'atlas.sceneTemporalAnchor.set', 'PROJECT_NOT_FOUND', { projectId });
  }
  if (!project.scenes || !project.scenes[sceneId]) {
    return fail(state, 'E_CORE_SCENE_NOT_FOUND', 'atlas.sceneTemporalAnchor.set', 'SCENE_NOT_FOUND', { projectId, sceneId });
  }

  const storyRange = normalizeAtlasTemporalRange(payload?.storyRange, { project, projectId, sceneId, rangeField: 'storyRange' });
  if (!storyRange.ok) {
    return fail(state, `E_ATLAS_SCENE_${storyRange.reason}`, 'atlas.sceneTemporalAnchor.set', storyRange.reason, { projectId, sceneId });
  }
  const narrativeRange = normalizeAtlasTemporalRange(payload?.narrativeRange, { project, projectId, sceneId, rangeField: 'narrativeRange' });
  if (!narrativeRange.ok) {
    return fail(state, `E_ATLAS_SCENE_${narrativeRange.reason}`, 'atlas.sceneTemporalAnchor.set', narrativeRange.reason, { projectId, sceneId });
  }

  const atlas = normalizeAtlasAuthorData(project.atlas);
  const existing = isPlainObject(atlas.sceneTemporalAnchors?.[sceneId])
    ? atlas.sceneTemporalAnchors[sceneId]
    : null;
  const expectedAnchorHash = trimString(payload?.expectedAnchorHash);
  const actualAnchorHash = existing ? hashCanonicalValue(existing) : '';
  if (expectedAnchorHash && expectedAnchorHash !== actualAnchorHash) {
    return fail(state, 'E_ATLAS_SCENE_TEMPORAL_ANCHOR_STALE', 'atlas.sceneTemporalAnchor.set', 'SCENE_TEMPORAL_ANCHOR_STALE', {
      projectId,
      sceneId,
      expectedAnchorHash,
      actualAnchorHash,
    });
  }

  const commandSeq = state.data.lastCommandId + 1;
  const anchorBase = {
    schemaVersion: 'atlas.sceneTemporalAnchor.v1',
    id: anchorId,
    projectId,
    sceneId,
    storyRange: storyRange.value,
    narrativeRange: narrativeRange.value,
    note,
    source: 'author',
    createdByCommandSeq: Number.isInteger(existing?.createdByCommandSeq) ? existing.createdByCommandSeq : commandSeq,
    updatedByCommandSeq: commandSeq,
  };
  const next = cloneJson(state);
  const nextProject = next.data.projects[projectId];
  const nextAtlas = ensureAtlasAuthorData(nextProject);
  if (!isPlainObject(nextAtlas.sceneTemporalAnchors)) nextAtlas.sceneTemporalAnchors = {};
  nextAtlas.sceneTemporalAnchors[sceneId] = {
    ...anchorBase,
    sourceHash: hashCanonicalValue(anchorBase),
  };
  next.data.lastCommandId += 1;
  return ok(next);
}

function normalizeAtlasContinuityLedgerKind(value) {
  const ledgerKind = trimString(value);
  if (ledgerKind === 'location' || ledgerKind === 'knowledge' || ledgerKind === 'object' || ledgerKind === 'promise') return ledgerKind;
  return '';
}

function normalizeAtlasPromiseState(value) {
  const promiseState = trimString(value);
  if (promiseState === 'open' || promiseState === 'fulfilled' || promiseState === 'broken' || promiseState === 'unknown') return promiseState;
  return '';
}

function normalizeAtlasContinuityRelatedEntityIds(values) {
  return uniqueStringList(values).slice(0, 24);
}

function applyAtlasContinuityFactRecord(state, payload) {
  const projectId = trimString(payload?.projectId);
  const ledgerKind = normalizeAtlasContinuityLedgerKind(payload?.ledgerKind);
  const sceneId = trimString(payload?.sceneId);
  const subjectEntityId = trimString(payload?.subjectEntityId || payload?.entityId);
  const factLabel = trimString(payload?.factLabel || payload?.label);
  const factValue = trimString(payload?.factValue || payload?.value);
  const promiseState = ledgerKind === 'promise' ? normalizeAtlasPromiseState(payload?.promiseState) : '';
  const relatedEntityIds = normalizeAtlasContinuityRelatedEntityIds(payload?.relatedEntityIds);
  const note = trimString(payload?.note);
  const evidenceAnchor = normalizeEvidenceAnchor(payload?.evidenceAnchor);
  const factId = trimString(payload?.factId) || `atlas-continuity-fact:${hashCanonicalValue({
    projectId,
    ledgerKind,
    sceneId,
    subjectEntityId,
    factLabel,
  })}`;

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'atlas.continuityFact.record', 'PROJECT_ID_REQUIRED');
  }
  if (!ledgerKind) {
    return fail(state, 'E_ATLAS_CONTINUITY_FACT_LEDGER_KIND_INVALID', 'atlas.continuityFact.record', 'LEDGER_KIND_INVALID', { projectId });
  }
  if (!sceneId) {
    return fail(state, 'E_CORE_SCENE_ID_REQUIRED', 'atlas.continuityFact.record', 'SCENE_ID_REQUIRED', { projectId, ledgerKind });
  }
  if (!subjectEntityId) {
    return fail(state, 'E_ATLAS_ENTITY_ID_REQUIRED', 'atlas.continuityFact.record', 'ENTITY_ID_REQUIRED', { projectId, ledgerKind, sceneId });
  }
  if (!factLabel) {
    return fail(state, 'E_ATLAS_CONTINUITY_FACT_LABEL_REQUIRED', 'atlas.continuityFact.record', 'FACT_LABEL_REQUIRED', { projectId, ledgerKind, sceneId });
  }
  if (!factValue) {
    return fail(state, 'E_ATLAS_CONTINUITY_FACT_VALUE_REQUIRED', 'atlas.continuityFact.record', 'FACT_VALUE_REQUIRED', { projectId, ledgerKind, sceneId });
  }
  if (ledgerKind === 'promise' && !promiseState) {
    return fail(state, 'E_ATLAS_CONTINUITY_FACT_PROMISE_STATE_INVALID', 'atlas.continuityFact.record', 'PROMISE_STATE_INVALID', {
      projectId,
      ledgerKind,
      sceneId,
    });
  }
  if (!evidenceAnchor) {
    return fail(state, 'E_ATLAS_EVIDENCE_ANCHOR_REQUIRED', 'atlas.continuityFact.record', 'EVIDENCE_ANCHOR_REQUIRED', {
      projectId,
      ledgerKind,
      sceneId,
      subjectEntityId,
    });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'atlas.continuityFact.record', 'PROJECT_NOT_FOUND', { projectId });
  }
  if (!project.scenes || !project.scenes[sceneId]) {
    return fail(state, 'E_CORE_SCENE_NOT_FOUND', 'atlas.continuityFact.record', 'SCENE_NOT_FOUND', { projectId, sceneId });
  }

  const atlas = normalizeAtlasAuthorData(project.atlas);
  if (!atlas.entities[subjectEntityId]) {
    return fail(state, 'E_ATLAS_ENTITY_NOT_FOUND', 'atlas.continuityFact.record', 'ENTITY_NOT_FOUND', { projectId, subjectEntityId });
  }
  for (const relatedEntityId of relatedEntityIds) {
    if (!atlas.entities[relatedEntityId]) {
      return fail(state, 'E_ATLAS_RELATED_ENTITY_NOT_FOUND', 'atlas.continuityFact.record', 'RELATED_ENTITY_NOT_FOUND', {
        projectId,
        relatedEntityId,
      });
    }
  }
  if (evidenceAnchor.sceneId && evidenceAnchor.sceneId !== sceneId) {
    return fail(state, 'E_ATLAS_EVIDENCE_SCENE_MISMATCH', 'atlas.continuityFact.record', 'EVIDENCE_SCENE_MISMATCH', {
      sceneId,
      evidenceSceneId: evidenceAnchor.sceneId,
    });
  }
  if (evidenceAnchor.entityId && evidenceAnchor.entityId !== subjectEntityId) {
    return fail(state, 'E_ATLAS_EVIDENCE_ENTITY_MISMATCH', 'atlas.continuityFact.record', 'EVIDENCE_ENTITY_MISMATCH', {
      subjectEntityId,
      evidenceEntityId: evidenceAnchor.entityId,
    });
  }
  const staleEvidence = validateEvidenceStillMatchesScene({
    state,
    project,
    sceneId,
    evidenceAnchor,
    op: 'atlas.continuityFact.record',
    reasonDetails: { projectId, ledgerKind, factId },
  });
  if (staleEvidence) return staleEvidence;

  const ledgers = normalizeAtlasContinuityFactLedgers(atlas.continuityFactLedgers);
  const existing = isPlainObject(ledgers[ledgerKind]?.[factId]) ? ledgers[ledgerKind][factId] : null;
  const expectedFactHash = trimString(payload?.expectedFactHash);
  const actualFactHash = existing ? hashCanonicalValue(existing) : '';
  if (expectedFactHash && expectedFactHash !== actualFactHash) {
    return fail(state, 'E_ATLAS_CONTINUITY_FACT_STALE', 'atlas.continuityFact.record', 'CONTINUITY_FACT_STALE', {
      projectId,
      ledgerKind,
      factId,
      expectedFactHash,
      actualFactHash,
    });
  }

  const commandSeq = state.data.lastCommandId + 1;
  const factBase = {
    schemaVersion: 'atlas.continuityFact.v1',
    id: factId,
    projectId,
    ledgerKind,
    sceneId,
    subjectEntityId,
    relatedEntityIds,
    factLabel,
    factValue,
    promiseState,
    evidenceAnchor,
    note,
    source: 'author',
    createdByCommandSeq: Number.isInteger(existing?.createdByCommandSeq) ? existing.createdByCommandSeq : commandSeq,
    updatedByCommandSeq: commandSeq,
  };
  const next = cloneJson(state);
  const nextProject = next.data.projects[projectId];
  const nextAtlas = ensureAtlasAuthorData(nextProject);
  nextAtlas.continuityFactLedgers = normalizeAtlasContinuityFactLedgers(nextAtlas.continuityFactLedgers);
  nextAtlas.continuityFactLedgers[ledgerKind][factId] = {
    ...factBase,
    sourceHash: hashCanonicalValue(factBase),
  };
  next.data.lastCommandId += 1;
  return ok(next);
}

function normalizeAtlasSavedQueryFilter(input) {
  const source = isPlainObject(input) ? input : {};
  const entityIds = Array.isArray(source.entityIds)
    ? [...new Set(source.entityIds.map(trimString).filter(Boolean))].sort()
    : [];
  const sceneIds = Array.isArray(source.sceneIds)
    ? [...new Set(source.sceneIds.map(trimString).filter(Boolean))].sort()
    : [];
  const relationPairIds = Array.isArray(source.relationPairIds)
    ? [...new Set(source.relationPairIds.map(trimString).filter(Boolean))].sort()
    : [];
  const queryText = trimString(source.queryText);
  return {
    entityIds,
    sceneIds,
    relationPairIds,
    queryText,
  };
}

function normalizeAtlasLanguageCode(value) {
  const code = trimString(value).toLowerCase().replace(/_/gu, '-');
  return code || 'und';
}

function normalizeAtlasLanguageTagScope(value) {
  const scopeKind = trimString(value);
  if (scopeKind === 'project' || scopeKind === 'scene' || scopeKind === 'block' || scopeKind === 'range') return scopeKind;
  return '';
}

function normalizeRangeOffset(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : -1;
}

function getAtlasLanguageTagBucket(languageTags, scopeKind) {
  if (scopeKind === 'scene') return languageTags.scenes;
  if (scopeKind === 'block') return languageTags.blocks;
  if (scopeKind === 'range') return languageTags.ranges;
  return null;
}

function inferAtlasLanguageTagId({ projectId, scopeKind, sceneId, blockId, startOffset, endOffset }) {
  if (scopeKind === 'project') return `atlas-language-tag:project:${projectId}`;
  if (scopeKind === 'scene') return `atlas-language-tag:scene:${projectId}:${sceneId}`;
  if (scopeKind === 'block') return `atlas-language-tag:block:${projectId}:${sceneId}:${blockId}`;
  return `atlas-language-tag:range:${hashCanonicalValue({ projectId, sceneId, startOffset, endOffset })}`;
}

function normalizeAtlasLanguageTagPayload(payload) {
  const projectId = trimString(payload?.projectId);
  const scopeKind = normalizeAtlasLanguageTagScope(payload?.scopeKind || payload?.scope);
  const sceneId = trimString(payload?.sceneId);
  const blockId = trimString(payload?.blockId);
  const startOffset = normalizeRangeOffset(payload?.startOffset);
  const endOffset = normalizeRangeOffset(payload?.endOffset);
  return {
    projectId,
    scopeKind,
    sceneId,
    blockId,
    startOffset,
    endOffset,
    languageCode: normalizeAtlasLanguageCode(payload?.languageCode),
    note: trimString(payload?.note),
    expectedTagHash: trimString(payload?.expectedTagHash),
    tagId: trimString(payload?.tagId) || inferAtlasLanguageTagId({ projectId, scopeKind, sceneId, blockId, startOffset, endOffset }),
  };
}

function validateAtlasLanguageTagTarget(state, payload, op) {
  const { projectId, scopeKind, sceneId, blockId, startOffset, endOffset } = payload;
  if (!projectId) return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', op, 'PROJECT_ID_REQUIRED');
  if (!scopeKind) return fail(state, 'E_ATLAS_LANGUAGE_TAG_SCOPE_INVALID', op, 'LANGUAGE_TAG_SCOPE_INVALID', { projectId });
  const project = state.data.projects[projectId];
  if (!project) return fail(state, 'E_CORE_PROJECT_NOT_FOUND', op, 'PROJECT_NOT_FOUND', { projectId });
  if ((scopeKind === 'scene' || scopeKind === 'block' || scopeKind === 'range') && !sceneId) {
    return fail(state, 'E_CORE_SCENE_ID_REQUIRED', op, 'SCENE_ID_REQUIRED', { projectId, scopeKind });
  }
  if ((scopeKind === 'scene' || scopeKind === 'block' || scopeKind === 'range') && (!project.scenes || !project.scenes[sceneId])) {
    return fail(state, 'E_CORE_SCENE_NOT_FOUND', op, 'SCENE_NOT_FOUND', { projectId, sceneId, scopeKind });
  }
  if (scopeKind === 'block' && !blockId) {
    return fail(state, 'E_ATLAS_LANGUAGE_TAG_BLOCK_ID_REQUIRED', op, 'BLOCK_ID_REQUIRED', { projectId, sceneId });
  }
  if (scopeKind === 'range') {
    const text = typeof project.scenes?.[sceneId]?.text === 'string' ? project.scenes[sceneId].text : '';
    if (startOffset < 0 || endOffset < 0 || endOffset <= startOffset || endOffset > text.length) {
      return fail(state, 'E_ATLAS_LANGUAGE_TAG_RANGE_INVALID', op, 'LANGUAGE_TAG_RANGE_INVALID', {
        projectId,
        sceneId,
        startOffset,
        endOffset,
        textLength: text.length,
      });
    }
  }
  return { ok: true, project };
}

function findAtlasLanguageTag(languageTags, payload) {
  if (payload.scopeKind === 'project') return languageTags.project;
  const bucket = getAtlasLanguageTagBucket(languageTags, payload.scopeKind);
  return isPlainObject(bucket?.[payload.tagId]) ? bucket[payload.tagId] : null;
}

function rangeLanguageTagOverlaps(left, right) {
  return left.sceneId === right.sceneId
    && left.id !== right.id
    && Number(left.startOffset) < Number(right.endOffset)
    && Number(left.endOffset) > Number(right.startOffset);
}

function applyAtlasLanguageTagSet(state, payloadInput) {
  const payload = normalizeAtlasLanguageTagPayload(payloadInput);
  const validation = validateAtlasLanguageTagTarget(state, payload, 'atlas.languageTag.set');
  if (!validation.ok) return validation;
  const { project } = validation;
  if (!payload.tagId) {
    return fail(state, 'E_ATLAS_LANGUAGE_TAG_ID_REQUIRED', 'atlas.languageTag.set', 'LANGUAGE_TAG_ID_REQUIRED', {
      projectId: payload.projectId,
      scopeKind: payload.scopeKind,
    });
  }

  const atlas = normalizeAtlasAuthorData(project.atlas);
  const languageTags = normalizeAtlasLanguageTags(atlas.languageTags);
  const existing = findAtlasLanguageTag(languageTags, payload);
  const actualTagHash = existing ? hashCanonicalValue(existing) : '';
  if (payload.expectedTagHash && payload.expectedTagHash !== actualTagHash) {
    return fail(state, 'E_ATLAS_LANGUAGE_TAG_STALE', 'atlas.languageTag.set', 'LANGUAGE_TAG_STALE', {
      projectId: payload.projectId,
      tagId: payload.tagId,
      expectedTagHash: payload.expectedTagHash,
      actualTagHash,
    });
  }

  const commandSeq = state.data.lastCommandId + 1;
  const tagBase = {
    schemaVersion: 'atlas.languageTag.v1',
    id: payload.tagId,
    projectId: payload.projectId,
    scopeKind: payload.scopeKind,
    sceneId: payload.scopeKind === 'project' ? '' : payload.sceneId,
    blockId: payload.scopeKind === 'block' ? payload.blockId : '',
    startOffset: payload.scopeKind === 'range' ? payload.startOffset : 0,
    endOffset: payload.scopeKind === 'range' ? payload.endOffset : 0,
    languageCode: payload.languageCode,
    note: payload.note,
    source: 'author',
    manuscriptMutation: false,
    createdByCommandSeq: Number.isInteger(existing?.createdByCommandSeq) ? existing.createdByCommandSeq : commandSeq,
    updatedByCommandSeq: commandSeq,
  };
  if (payload.scopeKind === 'range') {
    const overlapping = Object.values(languageTags.ranges)
      .filter((tag) => isPlainObject(tag))
      .find((tag) => rangeLanguageTagOverlaps(tag, tagBase));
    if (overlapping) {
      return fail(state, 'E_ATLAS_LANGUAGE_TAG_RANGE_OVERLAP', 'atlas.languageTag.set', 'LANGUAGE_TAG_RANGE_OVERLAP', {
        projectId: payload.projectId,
        sceneId: payload.sceneId,
        tagId: payload.tagId,
        overlappingTagId: overlapping.id,
      });
    }
  }

  const next = cloneJson(state);
  const nextProject = next.data.projects[payload.projectId];
  const nextAtlas = ensureAtlasAuthorData(nextProject);
  nextAtlas.languageTags = normalizeAtlasLanguageTags(nextAtlas.languageTags);
  const tag = {
    ...tagBase,
    sourceHash: hashCanonicalValue(tagBase),
  };
  if (payload.scopeKind === 'project') {
    nextAtlas.languageTags.project = tag;
  } else {
    const bucket = getAtlasLanguageTagBucket(nextAtlas.languageTags, payload.scopeKind);
    bucket[payload.tagId] = tag;
  }
  next.data.lastCommandId += 1;
  return ok(next);
}

function applyAtlasLanguageTagClear(state, payloadInput) {
  const payload = normalizeAtlasLanguageTagPayload(payloadInput);
  const validation = validateAtlasLanguageTagTarget(state, payload, 'atlas.languageTag.clear');
  if (!validation.ok) return validation;
  const { project } = validation;
  const atlas = normalizeAtlasAuthorData(project.atlas);
  const languageTags = normalizeAtlasLanguageTags(atlas.languageTags);
  const existing = findAtlasLanguageTag(languageTags, payload);
  if (!existing) {
    return fail(state, 'E_ATLAS_LANGUAGE_TAG_NOT_FOUND', 'atlas.languageTag.clear', 'LANGUAGE_TAG_NOT_FOUND', {
      projectId: payload.projectId,
      tagId: payload.tagId,
      scopeKind: payload.scopeKind,
    });
  }
  const actualTagHash = hashCanonicalValue(existing);
  if (payload.expectedTagHash && payload.expectedTagHash !== actualTagHash) {
    return fail(state, 'E_ATLAS_LANGUAGE_TAG_STALE', 'atlas.languageTag.clear', 'LANGUAGE_TAG_STALE', {
      projectId: payload.projectId,
      tagId: payload.tagId,
      expectedTagHash: payload.expectedTagHash,
      actualTagHash,
    });
  }

  const next = cloneJson(state);
  const nextProject = next.data.projects[payload.projectId];
  const nextAtlas = ensureAtlasAuthorData(nextProject);
  nextAtlas.languageTags = normalizeAtlasLanguageTags(nextAtlas.languageTags);
  if (payload.scopeKind === 'project') {
    nextAtlas.languageTags.project = null;
  } else {
    const bucket = getAtlasLanguageTagBucket(nextAtlas.languageTags, payload.scopeKind);
    delete bucket[payload.tagId];
  }
  next.data.lastCommandId += 1;
  return ok(next);
}

const ATLAS_SERIES_PORTABILITY_PRIVATE_FIELD_NAMES = new Set([
  'path',
  'filepath',
  'file_path',
  'absolute_path',
  'relative_path',
  'source_path',
  'url',
  'uri',
  'content',
  'text',
  'bytes',
  'byte_content',
  'data',
  'base64',
  'raw',
  'buffer',
]);

function findAtlasSeriesPortabilityPrivateField(value, trail = []) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findAtlasSeriesPortabilityPrivateField(value[index], [...trail, String(index)]);
      if (found) return found;
    }
    return null;
  }
  if (!isPlainObject(value)) return null;
  for (const [key, child] of Object.entries(value)) {
    if (ATLAS_SERIES_PORTABILITY_PRIVATE_FIELD_NAMES.has(key.toLowerCase())) {
      return [...trail, key].join('.');
    }
    const found = findAtlasSeriesPortabilityPrivateField(child, [...trail, key]);
    if (found) return found;
  }
  return null;
}

function normalizeAtlasSeriesPortabilityRows(value) {
  return Array.isArray(value) ? cloneJson(value).filter(isPlainObject) : [];
}

function hashAtlasSeriesPortabilityPlan(plan) {
  return hashCanonicalValue({
    schemaVersion: plan?.schemaVersion,
    projectId: plan?.projectId,
    seriesId: plan?.seriesId,
    sourceCoreStateHash: plan?.sourceCoreStateHash,
    identityLinks: Array.isArray(plan?.identityLinks) ? plan.identityLinks : [],
    entityVocabularyRows: Array.isArray(plan?.entityVocabularyRows) ? plan.entityVocabularyRows : [],
    relationVocabularyRows: Array.isArray(plan?.relationVocabularyRows) ? plan.relationVocabularyRows : [],
    collisionReport: Array.isArray(plan?.collisionReport) ? plan.collisionReport : [],
    applyAllowed: plan?.applyAllowed === true,
  });
}

function assertAtlasSeriesIdentityLinksReady(state, atlas, links, op) {
  const entities = isPlainObject(atlas.entities) ? atlas.entities : {};
  const existingLinks = isPlainObject(atlas.seriesIdentityLinks) ? atlas.seriesIdentityLinks : {};
  const localToShared = new Map(Object.values(existingLinks)
    .filter(isPlainObject)
    .map((link) => [trimString(link.localEntityId), trimString(link.sharedIdentityId)]));
  const sharedToLocal = new Map(Object.values(existingLinks)
    .filter(isPlainObject)
    .map((link) => [trimString(link.sharedIdentityId), trimString(link.localEntityId)]));
  for (const link of links) {
    const linkId = trimString(link.id);
    const localEntityId = trimString(link.localEntityId);
    const sharedIdentityId = trimString(link.sharedIdentityId);
    if (link.schemaVersion !== ATLAS_SERIES_IDENTITY_LINK_SCHEMA_VERSION || !linkId || !localEntityId || !sharedIdentityId) {
      return fail(state, 'E_ATLAS_SERIES_PORTABILITY_IDENTITY_LINK_INVALID', op, 'IDENTITY_LINK_INVALID', { linkId, localEntityId, sharedIdentityId });
    }
    const entity = entities[localEntityId];
    if (!isPlainObject(entity)) {
      return fail(state, 'E_ATLAS_SERIES_PORTABILITY_ENTITY_NOT_FOUND', op, 'IDENTITY_LOCAL_ENTITY_NOT_FOUND', { linkId, localEntityId });
    }
    const expectedEntityHash = trimString(link.expectedEntityHash);
    const actualEntityHash = hashCanonicalValue(entity);
    if (expectedEntityHash && expectedEntityHash !== actualEntityHash) {
      return fail(state, 'E_ATLAS_SERIES_PORTABILITY_ENTITY_STALE', op, 'IDENTITY_LOCAL_ENTITY_STALE', {
        linkId,
        localEntityId,
        expectedEntityHash,
        actualEntityHash,
      });
    }
    if (isPlainObject(existingLinks[linkId])) {
      return fail(state, 'E_ATLAS_SERIES_PORTABILITY_LINK_EXISTS', op, 'IDENTITY_LINK_ALREADY_EXISTS', { linkId });
    }
    const existingShared = localToShared.get(localEntityId);
    if (existingShared && existingShared !== sharedIdentityId) {
      return fail(state, 'E_ATLAS_SERIES_PORTABILITY_COLLISION', op, 'IDENTITY_LOCAL_COLLISION', {
        linkId,
        localEntityId,
        existingSharedIdentityId: existingShared,
        incomingSharedIdentityId: sharedIdentityId,
      });
    }
    const existingLocal = sharedToLocal.get(sharedIdentityId);
    if (existingLocal && existingLocal !== localEntityId) {
      return fail(state, 'E_ATLAS_SERIES_PORTABILITY_COLLISION', op, 'IDENTITY_SHARED_COLLISION', {
        linkId,
        sharedIdentityId,
        existingLocalEntityId: existingLocal,
        incomingLocalEntityId: localEntityId,
      });
    }
    localToShared.set(localEntityId, sharedIdentityId);
    sharedToLocal.set(sharedIdentityId, localEntityId);
  }
  return null;
}

function assertAtlasVocabularyRowsReady(state, existingRows, rows, vocabularyKind, op) {
  const labelToId = new Map(Object.values(existingRows)
    .filter(isPlainObject)
    .map((row) => [`${trimString(row.vocabularyKind)}:${trimString(row.normalizedLabel)}`, trimString(row.id)]));
  for (const row of rows) {
    const rowId = trimString(row.id);
    const label = trimString(row.label);
    const normalizedLabel = trimString(row.normalizedLabel);
    if (row.schemaVersion !== ATLAS_CUSTOM_VOCABULARY_ROW_SCHEMA_VERSION || row.vocabularyKind !== vocabularyKind || !rowId || !label || !normalizedLabel) {
      return fail(state, 'E_ATLAS_SERIES_PORTABILITY_VOCABULARY_ROW_INVALID', op, 'VOCABULARY_ROW_INVALID', {
        rowId,
        vocabularyKind,
      });
    }
    if (isPlainObject(existingRows[rowId])) {
      return fail(state, 'E_ATLAS_SERIES_PORTABILITY_VOCABULARY_EXISTS', op, 'VOCABULARY_ROW_ALREADY_EXISTS', {
        rowId,
        vocabularyKind,
      });
    }
    const labelKey = `${vocabularyKind}:${normalizedLabel}`;
    const existingRowId = labelToId.get(labelKey);
    if (existingRowId && existingRowId !== rowId) {
      return fail(state, 'E_ATLAS_SERIES_PORTABILITY_COLLISION', op, 'VOCABULARY_LABEL_COLLISION', {
        rowId,
        existingRowId,
        vocabularyKind,
        normalizedLabel,
      });
    }
    labelToId.set(labelKey, rowId);
  }
  return null;
}

function applyAtlasSeriesPortabilityApply(state, payload) {
  const op = CORE_COMMAND_IDS.ATLAS_SERIES_PORTABILITY_APPLY;
  const previewPlan = isPlainObject(payload?.previewPlan) ? cloneJson(payload.previewPlan) : null;
  const projectId = trimString(payload?.projectId || previewPlan?.projectId);
  const suppliedPreviewHash = trimString(payload?.previewHash || payload?.expectedPreviewHash);

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', op, 'PROJECT_ID_REQUIRED');
  }
  if (!previewPlan || previewPlan.schemaVersion !== ATLAS_SERIES_PORTABILITY_PREVIEW_SCHEMA_VERSION) {
    return fail(state, 'E_ATLAS_SERIES_PORTABILITY_PREVIEW_REQUIRED', op, 'PREVIEW_PLAN_REQUIRED', { projectId });
  }
  if (previewPlan.projectId !== projectId) {
    return fail(state, 'E_ATLAS_SERIES_PORTABILITY_PROJECT_MISMATCH', op, 'PROJECT_MISMATCH', {
      projectId,
      previewProjectId: trimString(previewPlan.projectId),
    });
  }
  if (payload?.authorConfirmed !== true) {
    return fail(state, 'E_ATLAS_SERIES_PORTABILITY_CONFIRMATION_REQUIRED', op, 'AUTHOR_CONFIRMATION_REQUIRED', { projectId });
  }
  const privateField = findAtlasSeriesPortabilityPrivateField(previewPlan);
  if (privateField) {
    return fail(state, 'E_ATLAS_SERIES_PORTABILITY_PRIVATE_FIELD', op, 'PRIVATE_FIELD_DENIED', { projectId, field: privateField });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', op, 'PROJECT_NOT_FOUND', { projectId });
  }
  const actualPreviewHash = hashAtlasSeriesPortabilityPlan(previewPlan);
  if (!suppliedPreviewHash || suppliedPreviewHash !== actualPreviewHash || trimString(previewPlan.previewHash) !== actualPreviewHash) {
    return fail(state, 'E_ATLAS_SERIES_PORTABILITY_PREVIEW_HASH_MISMATCH', op, 'PREVIEW_HASH_MISMATCH', {
      projectId,
      suppliedPreviewHash,
      actualPreviewHash,
    });
  }
  if (trimString(previewPlan.sourceCoreStateHash) !== hashCoreState(state)) {
    return fail(state, 'E_ATLAS_SERIES_PORTABILITY_PREVIEW_STALE', op, 'PREVIEW_STALE', {
      projectId,
      expectedCoreStateHash: trimString(previewPlan.sourceCoreStateHash),
      actualCoreStateHash: hashCoreState(state),
    });
  }
  if (previewPlan.applyAllowed !== true || (Array.isArray(previewPlan.collisionReport) && previewPlan.collisionReport.length > 0)) {
    return fail(state, 'E_ATLAS_SERIES_PORTABILITY_COLLISIONS_UNRESOLVED', op, 'COLLISIONS_UNRESOLVED', {
      projectId,
      collisionCount: Array.isArray(previewPlan.collisionReport) ? previewPlan.collisionReport.length : 0,
    });
  }

  const identityLinks = normalizeAtlasSeriesPortabilityRows(previewPlan.identityLinks);
  const entityVocabularyRows = normalizeAtlasSeriesPortabilityRows(previewPlan.entityVocabularyRows);
  const relationVocabularyRows = normalizeAtlasSeriesPortabilityRows(previewPlan.relationVocabularyRows);
  if (identityLinks.length + entityVocabularyRows.length + relationVocabularyRows.length === 0) {
    return fail(state, 'E_ATLAS_SERIES_PORTABILITY_NO_OP', op, 'NO_PORTABILITY_ROWS', { projectId });
  }
  const atlas = normalizeAtlasAuthorData(project.atlas);
  const identityFailure = assertAtlasSeriesIdentityLinksReady(state, atlas, identityLinks, op);
  if (identityFailure) return identityFailure;
  const entityVocabularyFailure = assertAtlasVocabularyRowsReady(state, atlas.entityVocabulary, entityVocabularyRows, 'entity', op);
  if (entityVocabularyFailure) return entityVocabularyFailure;
  const relationVocabularyFailure = assertAtlasVocabularyRowsReady(state, atlas.relationVocabulary, relationVocabularyRows, 'relation', op);
  if (relationVocabularyFailure) return relationVocabularyFailure;

  const next = cloneJson(state);
  const commandSeq = next.data.lastCommandId + 1;
  const nextProject = next.data.projects[projectId];
  const nextAtlas = ensureAtlasAuthorData(nextProject);
  const operationId = trimString(payload?.operationId || previewPlan.operationId) || `atlas-series-portability:${actualPreviewHash}`;
  if (isPlainObject(nextAtlas.seriesPortabilityOperations[operationId])) {
    return fail(state, 'E_ATLAS_SERIES_PORTABILITY_OPERATION_EXISTS', op, 'OPERATION_ALREADY_EXISTS', { projectId, operationId });
  }
  const before = {
    seriesIdentityLinks: cloneJson(nextAtlas.seriesIdentityLinks),
    entityVocabulary: cloneJson(nextAtlas.entityVocabulary),
    relationVocabulary: cloneJson(nextAtlas.relationVocabulary),
  };
  for (const link of identityLinks) {
    nextAtlas.seriesIdentityLinks[link.id] = {
      ...link,
      source: 'author-confirmed',
      authorConfirmed: true,
      previewHash: actualPreviewHash,
      appliedByCommandSeq: commandSeq,
      updatedByCommandSeq: commandSeq,
    };
  }
  for (const row of entityVocabularyRows) {
    nextAtlas.entityVocabulary[row.id] = {
      ...row,
      source: 'author-confirmed',
      authorConfirmed: true,
      previewHash: actualPreviewHash,
      appliedByCommandSeq: commandSeq,
      updatedByCommandSeq: commandSeq,
    };
  }
  for (const row of relationVocabularyRows) {
    nextAtlas.relationVocabulary[row.id] = {
      ...row,
      source: 'author-confirmed',
      authorConfirmed: true,
      previewHash: actualPreviewHash,
      appliedByCommandSeq: commandSeq,
      updatedByCommandSeq: commandSeq,
    };
  }
  const after = {
    seriesIdentityLinks: cloneJson(nextAtlas.seriesIdentityLinks),
    entityVocabulary: cloneJson(nextAtlas.entityVocabulary),
    relationVocabulary: cloneJson(nextAtlas.relationVocabulary),
  };
  const rollbackProof = {
    schemaVersion: ATLAS_SERIES_PORTABILITY_ROLLBACK_PROOF_SCHEMA_VERSION,
    commandId: CORE_COMMAND_IDS.ATLAS_SERIES_PORTABILITY_ROLLBACK,
    operationId,
    canRollback: true,
    requiresAuthorConfirmation: true,
    beforeHash: hashCanonicalValue(before),
    afterHash: hashCanonicalValue(after),
    reopenValidationHash: hashCanonicalValue(JSON.parse(JSON.stringify({ projectId, operationId, before, after }))),
    pathless: true,
  };
  nextAtlas.seriesPortabilityOperations[operationId] = {
    schemaVersion: ATLAS_SERIES_PORTABILITY_APPLY_RECEIPT_SCHEMA_VERSION,
    id: operationId,
    operationKind: 'seriesPortability.apply',
    projectId,
    seriesId: trimString(previewPlan.seriesId),
    previewHash: actualPreviewHash,
    sourceCoreStateHash: trimString(previewPlan.sourceCoreStateHash),
    identityLinkIds: identityLinks.map((link) => link.id).sort(),
    entityVocabularyRowIds: entityVocabularyRows.map((row) => row.id).sort(),
    relationVocabularyRowIds: relationVocabularyRows.map((row) => row.id).sort(),
    authorConfirmed: true,
    noAutoMerge: true,
    manuscriptMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
    before,
    after,
    rollbackProof,
    createdByCommandSeq: commandSeq,
    restoredByCommandSeq: 0,
    rollbackOperationId: '',
  };
  next.data.lastCommandId += 1;
  return ok(next);
}

function applyAtlasSeriesPortabilityRollback(state, payload) {
  const op = CORE_COMMAND_IDS.ATLAS_SERIES_PORTABILITY_ROLLBACK;
  const projectId = trimString(payload?.projectId);
  const operationId = trimString(payload?.operationId);
  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', op, 'PROJECT_ID_REQUIRED');
  }
  if (!operationId) {
    return fail(state, 'E_ATLAS_SERIES_PORTABILITY_OPERATION_ID_REQUIRED', op, 'OPERATION_ID_REQUIRED', { projectId });
  }
  if (payload?.authorConfirmed !== true) {
    return fail(state, 'E_ATLAS_SERIES_PORTABILITY_CONFIRMATION_REQUIRED', op, 'AUTHOR_CONFIRMATION_REQUIRED', { projectId, operationId });
  }
  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', op, 'PROJECT_NOT_FOUND', { projectId });
  }
  const atlas = normalizeAtlasAuthorData(project.atlas);
  const operation = isPlainObject(atlas.seriesPortabilityOperations?.[operationId])
    ? atlas.seriesPortabilityOperations[operationId]
    : null;
  if (!operation || operation.operationKind !== 'seriesPortability.apply') {
    return fail(state, 'E_ATLAS_SERIES_PORTABILITY_OPERATION_NOT_FOUND', op, 'OPERATION_NOT_FOUND', { projectId, operationId });
  }
  if (operation.restoredByCommandSeq) {
    return fail(state, 'E_ATLAS_SERIES_PORTABILITY_OPERATION_ALREADY_RESTORED', op, 'OPERATION_ALREADY_RESTORED', { projectId, operationId });
  }
  const expectedOperationHash = trimString(payload?.expectedOperationHash);
  const actualOperationHash = hashCanonicalValue(operation);
  if (expectedOperationHash && expectedOperationHash !== actualOperationHash) {
    return fail(state, 'E_ATLAS_SERIES_PORTABILITY_OPERATION_STALE', op, 'OPERATION_STALE', {
      projectId,
      operationId,
      expectedOperationHash,
      actualOperationHash,
    });
  }
  const currentAfter = {
    seriesIdentityLinks: cloneJson(atlas.seriesIdentityLinks),
    entityVocabulary: cloneJson(atlas.entityVocabulary),
    relationVocabulary: cloneJson(atlas.relationVocabulary),
  };
  if (hashCanonicalValue(currentAfter) !== hashCanonicalValue(operation.after)) {
    return fail(state, 'E_ATLAS_SERIES_PORTABILITY_OPERATION_STALE', op, 'OPERATION_AFTER_SNAPSHOT_STALE', {
      projectId,
      operationId,
      expectedAfterHash: hashCanonicalValue(operation.after),
      actualAfterHash: hashCanonicalValue(currentAfter),
    });
  }

  const next = cloneJson(state);
  const commandSeq = next.data.lastCommandId + 1;
  const nextProject = next.data.projects[projectId];
  const nextAtlas = ensureAtlasAuthorData(nextProject);
  nextAtlas.seriesIdentityLinks = cloneJson(operation.before.seriesIdentityLinks);
  nextAtlas.entityVocabulary = cloneJson(operation.before.entityVocabulary);
  nextAtlas.relationVocabulary = cloneJson(operation.before.relationVocabulary);
  const rollbackOperationId = trimString(payload?.rollbackOperationId) || `atlas-series-portability-rollback:${hashCanonicalValue({ projectId, operationId })}`;
  nextAtlas.seriesPortabilityOperations[operationId] = {
    ...nextAtlas.seriesPortabilityOperations[operationId],
    restoredByCommandSeq: commandSeq,
    rollbackOperationId,
    rollbackProof: {
      ...nextAtlas.seriesPortabilityOperations[operationId].rollbackProof,
      canRollback: false,
      restored: true,
      restoredByCommandSeq: commandSeq,
      rollbackOperationId,
      restoredStateHash: hashCanonicalValue({
        seriesIdentityLinks: nextAtlas.seriesIdentityLinks,
        entityVocabulary: nextAtlas.entityVocabulary,
        relationVocabulary: nextAtlas.relationVocabulary,
      }),
      reopenValidationHash: hashCanonicalValue(JSON.parse(JSON.stringify({
        projectId,
        operationId,
        restoredBuckets: {
          seriesIdentityLinks: nextAtlas.seriesIdentityLinks,
          entityVocabulary: nextAtlas.entityVocabulary,
          relationVocabulary: nextAtlas.relationVocabulary,
        },
      }))),
    },
  };
  next.data.lastCommandId += 1;
  return ok(next);
}

function applyAtlasSavedQuerySave(state, payload) {
  const projectId = trimString(payload?.projectId);
  const savedQueryId = trimString(payload?.savedQueryId);
  const name = trimString(payload?.name);
  const reportType = trimString(payload?.reportType) || 'overview';
  const sourceHash = trimString(payload?.sourceHash);
  const filter = normalizeAtlasSavedQueryFilter(payload?.filter);

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'atlas.savedQuery.save', 'PROJECT_ID_REQUIRED');
  }
  if (!savedQueryId) {
    return fail(state, 'E_ATLAS_SAVED_QUERY_ID_REQUIRED', 'atlas.savedQuery.save', 'SAVED_QUERY_ID_REQUIRED', { projectId });
  }
  if (!name) {
    return fail(state, 'E_ATLAS_SAVED_QUERY_NAME_REQUIRED', 'atlas.savedQuery.save', 'SAVED_QUERY_NAME_REQUIRED', { projectId, savedQueryId });
  }
  if (!['overview', 'entity', 'relation', 'matrix', 'heatmap'].includes(reportType)) {
    return fail(state, 'E_ATLAS_SAVED_QUERY_REPORT_TYPE_INVALID', 'atlas.savedQuery.save', 'REPORT_TYPE_INVALID', { projectId, savedQueryId, reportType });
  }
  if (!sourceHash) {
    return fail(state, 'E_ATLAS_SAVED_QUERY_SOURCE_HASH_REQUIRED', 'atlas.savedQuery.save', 'SOURCE_HASH_REQUIRED', { projectId, savedQueryId });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'atlas.savedQuery.save', 'PROJECT_NOT_FOUND', { projectId });
  }

  const next = cloneJson(state);
  const nextProject = next.data.projects[projectId];
  const nextAtlas = ensureAtlasAuthorData(nextProject);
  if (!isPlainObject(nextAtlas.savedQueries)) nextAtlas.savedQueries = {};
  const existing = isPlainObject(nextAtlas.savedQueries[savedQueryId])
    ? nextAtlas.savedQueries[savedQueryId]
    : null;
  const commandSeq = next.data.lastCommandId + 1;
  nextAtlas.savedQueries[savedQueryId] = {
    id: savedQueryId,
    name,
    reportType,
    filter,
    sourceHash,
    createdByCommandSeq: Number.isInteger(existing?.createdByCommandSeq) ? existing.createdByCommandSeq : commandSeq,
    updatedByCommandSeq: commandSeq,
  };
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
  let preserved = {};
  try {
    const cloned = cloneJson(value);
    preserved = isPlainObject(cloned) ? cloned : {};
  } catch {
    preserved = {};
  }
  return {
    ...preserved,
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

function entitySnapshotHash(entity) {
  return hashCanonicalValue(isPlainObject(entity) ? entity : null);
}

function uniqueStringList(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => trimString(value))
    .filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }));
}

function validateExpectedEntityHash({ state, entity, expectedHash, op, reasonDetails }) {
  const normalizedExpectedHash = trimString(expectedHash);
  if (!normalizedExpectedHash) return null;
  const actualHash = entitySnapshotHash(entity);
  if (actualHash === normalizedExpectedHash) return null;
  return fail(state, 'E_ATLAS_ENTITY_STALE', op, 'ENTITY_STALE', {
    ...reasonDetails,
    expectedHash: normalizedExpectedHash,
    actualHash,
  });
}

function validateEvidenceStillMatchesScene({ state, project, sceneId, evidenceAnchor, op, reasonDetails }) {
  const sceneText = typeof project?.scenes?.[sceneId]?.text === 'string' ? project.scenes[sceneId].text : '';
  const startOffset = Number(evidenceAnchor?.startOffset);
  const endOffset = Number(evidenceAnchor?.endOffset);
  const quote = typeof evidenceAnchor?.quote === 'string' ? evidenceAnchor.quote : '';
  const currentQuote = sceneText.slice(startOffset, endOffset);
  const currentSceneTextHash = hashCanonicalValue(sceneText);
  const currentQuoteHash = hashCanonicalValue(currentQuote);
  if (currentSceneTextHash !== evidenceAnchor.sceneTextHash || currentQuoteHash !== evidenceAnchor.quoteHash || currentQuote !== quote) {
    return fail(state, 'E_ATLAS_EVIDENCE_STALE', op, 'EVIDENCE_STALE', {
      ...reasonDetails,
      sceneId,
      anchorId: evidenceAnchor.anchorId,
      expectedSceneTextHash: evidenceAnchor.sceneTextHash,
      actualSceneTextHash: currentSceneTextHash,
      expectedQuoteHash: evidenceAnchor.quoteHash,
      actualQuoteHash: currentQuoteHash,
    });
  }
  return null;
}

function normalizeAtlasEvidenceSourceKind(value) {
  const kind = trimString(value);
  if (kind === 'decision' || kind === 'suppression' || kind === 'reassignment') return kind;
  return '';
}

function getAtlasEvidenceSourceRecord(atlas, sourceRecordKind, sourceRecordId) {
  if (sourceRecordKind === 'decision') return isPlainObject(atlas.decisions?.[sourceRecordId]) ? atlas.decisions[sourceRecordId] : null;
  if (sourceRecordKind === 'suppression') return isPlainObject(atlas.suppressions?.[sourceRecordId]) ? atlas.suppressions[sourceRecordId] : null;
  if (sourceRecordKind === 'reassignment') return isPlainObject(atlas.reassignments?.[sourceRecordId]) ? atlas.reassignments[sourceRecordId] : null;
  return null;
}

function evidenceAnchorMatches(a, b) {
  return hashCanonicalValue(isPlainObject(a) ? a : null) === hashCanonicalValue(isPlainObject(b) ? b : null);
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

function applyAtlasObservationSuppress(state, payload) {
  const projectId = trimString(payload?.projectId);
  const sceneId = trimString(payload?.sceneId);
  const entityId = trimString(payload?.entityId);
  const observationId = trimString(payload?.observationId);
  const mentionId = trimString(payload?.mentionId);
  const reason = trimString(payload?.reason);
  const evidenceAnchor = normalizeEvidenceAnchor(payload?.evidenceAnchor);
  const suppressionId = trimString(payload?.suppressionId) || `atlas-suppression:${hashCanonicalValue({
    projectId,
    sceneId,
    entityId,
    observationId,
    mentionId,
    anchorId: evidenceAnchor?.anchorId || '',
  })}`;

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'atlas.observation.suppress', 'PROJECT_ID_REQUIRED');
  }
  if (!sceneId) {
    return fail(state, 'E_CORE_SCENE_ID_REQUIRED', 'atlas.observation.suppress', 'SCENE_ID_REQUIRED', { projectId });
  }
  if (!entityId) {
    return fail(state, 'E_ATLAS_ENTITY_ID_REQUIRED', 'atlas.observation.suppress', 'ENTITY_ID_REQUIRED', { projectId, sceneId });
  }
  if (!observationId && !mentionId) {
    return fail(state, 'E_ATLAS_OBSERVATION_ID_REQUIRED', 'atlas.observation.suppress', 'OBSERVATION_ID_REQUIRED', { projectId, sceneId, entityId });
  }
  if (!evidenceAnchor) {
    return fail(state, 'E_ATLAS_EVIDENCE_ANCHOR_REQUIRED', 'atlas.observation.suppress', 'EVIDENCE_ANCHOR_REQUIRED', { projectId, sceneId, entityId, observationId, mentionId });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'atlas.observation.suppress', 'PROJECT_NOT_FOUND', { projectId });
  }
  if (!project.scenes || !project.scenes[sceneId]) {
    return fail(state, 'E_CORE_SCENE_NOT_FOUND', 'atlas.observation.suppress', 'SCENE_NOT_FOUND', { projectId, sceneId });
  }
  const atlas = normalizeAtlasAuthorData(project.atlas);
  if (!atlas.entities[entityId]) {
    return fail(state, 'E_ATLAS_ENTITY_NOT_FOUND', 'atlas.observation.suppress', 'ENTITY_NOT_FOUND', { projectId, entityId });
  }
  if (evidenceAnchor.sceneId && evidenceAnchor.sceneId !== sceneId) {
    return fail(state, 'E_ATLAS_EVIDENCE_SCENE_MISMATCH', 'atlas.observation.suppress', 'EVIDENCE_SCENE_MISMATCH', { sceneId, evidenceSceneId: evidenceAnchor.sceneId });
  }
  if (evidenceAnchor.entityId && evidenceAnchor.entityId !== entityId) {
    return fail(state, 'E_ATLAS_EVIDENCE_ENTITY_MISMATCH', 'atlas.observation.suppress', 'EVIDENCE_ENTITY_MISMATCH', { entityId, evidenceEntityId: evidenceAnchor.entityId });
  }
  if (atlas.suppressions && atlas.suppressions[suppressionId]) {
    return fail(state, 'E_ATLAS_SUPPRESSION_ALREADY_EXISTS', 'atlas.observation.suppress', 'SUPPRESSION_ALREADY_EXISTS', { projectId, suppressionId });
  }

  const next = cloneJson(state);
  const nextProject = next.data.projects[projectId];
  const nextAtlas = ensureAtlasAuthorData(nextProject);
  if (!isPlainObject(nextAtlas.suppressions)) nextAtlas.suppressions = {};
  nextAtlas.suppressions[suppressionId] = {
    id: suppressionId,
    suppressionKind: 'observation.suppress',
    projectId,
    sceneId,
    entityId,
    observationId,
    mentionId,
    reason,
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

function applyAtlasEntityMerge(state, payload) {
  const projectId = trimString(payload?.projectId);
  const sourceEntityId = trimString(payload?.sourceEntityId);
  const targetEntityId = trimString(payload?.targetEntityId);
  const reason = trimString(payload?.reason);
  const operationId = trimString(payload?.operationId) || `atlas-entity-merge:${hashCanonicalValue({
    projectId,
    sourceEntityId,
    targetEntityId,
  })}`;

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'atlas.entity.merge', 'PROJECT_ID_REQUIRED');
  }
  if (!sourceEntityId) {
    return fail(state, 'E_ATLAS_SOURCE_ENTITY_ID_REQUIRED', 'atlas.entity.merge', 'SOURCE_ENTITY_ID_REQUIRED', { projectId });
  }
  if (!targetEntityId) {
    return fail(state, 'E_ATLAS_TARGET_ENTITY_ID_REQUIRED', 'atlas.entity.merge', 'TARGET_ENTITY_ID_REQUIRED', { projectId, sourceEntityId });
  }
  if (sourceEntityId === targetEntityId) {
    return fail(state, 'E_ATLAS_ENTITY_MERGE_SELF_INVALID', 'atlas.entity.merge', 'ENTITY_MERGE_SELF_INVALID', { projectId, sourceEntityId, targetEntityId });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'atlas.entity.merge', 'PROJECT_NOT_FOUND', { projectId });
  }
  const atlas = normalizeAtlasAuthorData(project.atlas);
  const sourceEntity = atlas.entities[sourceEntityId];
  const targetEntity = atlas.entities[targetEntityId];
  if (!sourceEntity) {
    return fail(state, 'E_ATLAS_ENTITY_NOT_FOUND', 'atlas.entity.merge', 'SOURCE_ENTITY_NOT_FOUND', { projectId, sourceEntityId });
  }
  if (!targetEntity) {
    return fail(state, 'E_ATLAS_ENTITY_NOT_FOUND', 'atlas.entity.merge', 'TARGET_ENTITY_NOT_FOUND', { projectId, targetEntityId });
  }
  if (sourceEntity.mergeState === 'MERGED') {
    return fail(state, 'E_ATLAS_ENTITY_ALREADY_MERGED', 'atlas.entity.merge', 'SOURCE_ENTITY_ALREADY_MERGED', { projectId, sourceEntityId, mergedIntoEntityId: sourceEntity.mergedIntoEntityId || '' });
  }
  if (atlas.entityOperations && atlas.entityOperations[operationId]) {
    return fail(state, 'E_ATLAS_OPERATION_ALREADY_EXISTS', 'atlas.entity.merge', 'OPERATION_ALREADY_EXISTS', { projectId, operationId });
  }
  const staleSource = validateExpectedEntityHash({
    state,
    entity: sourceEntity,
    expectedHash: payload?.expectedSourceEntityHash,
    op: 'atlas.entity.merge',
    reasonDetails: { projectId, entityId: sourceEntityId },
  });
  if (staleSource) return staleSource;
  const staleTarget = validateExpectedEntityHash({
    state,
    entity: targetEntity,
    expectedHash: payload?.expectedTargetEntityHash,
    op: 'atlas.entity.merge',
    reasonDetails: { projectId, entityId: targetEntityId },
  });
  if (staleTarget) return staleTarget;

  const next = cloneJson(state);
  const commandSeq = next.data.lastCommandId + 1;
  const nextProject = next.data.projects[projectId];
  const nextAtlas = ensureAtlasAuthorData(nextProject);
  if (!isPlainObject(nextAtlas.entityOperations)) nextAtlas.entityOperations = {};
  const nextSource = nextAtlas.entities[sourceEntityId];
  const nextTarget = nextAtlas.entities[targetEntityId];
  const beforeSourceEntity = cloneJson(nextSource);
  const beforeTargetEntity = cloneJson(nextTarget);
  nextSource.mergeState = 'MERGED';
  nextSource.mergedIntoEntityId = targetEntityId;
  nextSource.mergeOperationId = operationId;
  nextSource.mergedByCommandSeq = commandSeq;
  nextSource.updatedByCommandSeq = commandSeq;
  nextTarget.mergedSourceEntityIds = uniqueStringList([...(nextTarget.mergedSourceEntityIds || []), sourceEntityId]);
  nextTarget.updatedByCommandSeq = commandSeq;
  nextAtlas.entityOperations[operationId] = {
    id: operationId,
    operationKind: 'entity.merge',
    projectId,
    sourceEntityId,
    targetEntityId,
    reason,
    beforeSourceEntity,
    beforeTargetEntity,
    afterSourceEntity: cloneJson(nextSource),
    afterTargetEntity: cloneJson(nextTarget),
    createdByCommandSeq: commandSeq,
    restoredByCommandSeq: 0,
    restoreOperationId: '',
  };
  next.data.lastCommandId += 1;
  return ok(next);
}

function applyAtlasEntitySplitRestore(state, payload) {
  const projectId = trimString(payload?.projectId);
  const operationId = trimString(payload?.operationId);
  const restoreOperationId = trimString(payload?.restoreOperationId) || `atlas-entity-split-restore:${hashCanonicalValue({ projectId, operationId })}`;

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'atlas.entity.splitRestore', 'PROJECT_ID_REQUIRED');
  }
  if (!operationId) {
    return fail(state, 'E_ATLAS_OPERATION_ID_REQUIRED', 'atlas.entity.splitRestore', 'OPERATION_ID_REQUIRED', { projectId });
  }
  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'atlas.entity.splitRestore', 'PROJECT_NOT_FOUND', { projectId });
  }
  const atlas = normalizeAtlasAuthorData(project.atlas);
  const operation = atlas.entityOperations && atlas.entityOperations[operationId];
  if (!operation || operation.operationKind !== 'entity.merge') {
    return fail(state, 'E_ATLAS_OPERATION_NOT_FOUND', 'atlas.entity.splitRestore', 'MERGE_OPERATION_NOT_FOUND', { projectId, operationId });
  }
  if (operation.restoredByCommandSeq) {
    return fail(state, 'E_ATLAS_OPERATION_ALREADY_RESTORED', 'atlas.entity.splitRestore', 'MERGE_OPERATION_ALREADY_RESTORED', { projectId, operationId });
  }
  const sourceEntity = atlas.entities[operation.sourceEntityId];
  const targetEntity = atlas.entities[operation.targetEntityId];
  if (!sourceEntity || !targetEntity) {
    return fail(state, 'E_ATLAS_ENTITY_NOT_FOUND', 'atlas.entity.splitRestore', 'MERGE_ENTITY_NOT_FOUND', { projectId, operationId, sourceEntityId: operation.sourceEntityId, targetEntityId: operation.targetEntityId });
  }
  if (entitySnapshotHash(sourceEntity) !== entitySnapshotHash(operation.afterSourceEntity) || entitySnapshotHash(targetEntity) !== entitySnapshotHash(operation.afterTargetEntity)) {
    return fail(state, 'E_ATLAS_OPERATION_STALE', 'atlas.entity.splitRestore', 'MERGE_OPERATION_STALE', {
      projectId,
      operationId,
      sourceEntityId: operation.sourceEntityId,
      targetEntityId: operation.targetEntityId,
    });
  }
  const next = cloneJson(state);
  const commandSeq = next.data.lastCommandId + 1;
  const nextProject = next.data.projects[projectId];
  const nextAtlas = ensureAtlasAuthorData(nextProject);
  nextAtlas.entities[operation.sourceEntityId] = cloneJson(operation.beforeSourceEntity);
  nextAtlas.entities[operation.targetEntityId] = cloneJson(operation.beforeTargetEntity);
  nextAtlas.entityOperations[operationId] = {
    ...nextAtlas.entityOperations[operationId],
    restoredByCommandSeq: commandSeq,
    restoreOperationId,
  };
  next.data.lastCommandId += 1;
  return ok(next);
}

function applyAtlasObservationReassign(state, payload) {
  const projectId = trimString(payload?.projectId);
  const sceneId = trimString(payload?.sceneId);
  const sourceEntityId = trimString(payload?.sourceEntityId || payload?.entityId);
  const targetEntityId = trimString(payload?.targetEntityId);
  const observationId = trimString(payload?.observationId);
  const mentionId = trimString(payload?.mentionId);
  const reason = trimString(payload?.reason);
  const evidenceAnchor = normalizeEvidenceAnchor(payload?.evidenceAnchor);
  const reassignmentId = trimString(payload?.reassignmentId) || `atlas-reassignment:${hashCanonicalValue({
    projectId,
    sceneId,
    sourceEntityId,
    targetEntityId,
    observationId,
    mentionId,
    anchorId: evidenceAnchor?.anchorId || '',
  })}`;

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'atlas.observation.reassign', 'PROJECT_ID_REQUIRED');
  }
  if (!sceneId) {
    return fail(state, 'E_CORE_SCENE_ID_REQUIRED', 'atlas.observation.reassign', 'SCENE_ID_REQUIRED', { projectId });
  }
  if (!sourceEntityId) {
    return fail(state, 'E_ATLAS_SOURCE_ENTITY_ID_REQUIRED', 'atlas.observation.reassign', 'SOURCE_ENTITY_ID_REQUIRED', { projectId, sceneId });
  }
  if (!targetEntityId) {
    return fail(state, 'E_ATLAS_TARGET_ENTITY_ID_REQUIRED', 'atlas.observation.reassign', 'TARGET_ENTITY_ID_REQUIRED', { projectId, sceneId, sourceEntityId });
  }
  if (sourceEntityId === targetEntityId) {
    return fail(state, 'E_ATLAS_OBSERVATION_REASSIGN_SELF_INVALID', 'atlas.observation.reassign', 'OBSERVATION_REASSIGN_SELF_INVALID', { projectId, sceneId, sourceEntityId, targetEntityId });
  }
  if (!observationId && !mentionId) {
    return fail(state, 'E_ATLAS_OBSERVATION_ID_REQUIRED', 'atlas.observation.reassign', 'OBSERVATION_ID_REQUIRED', { projectId, sceneId, sourceEntityId, targetEntityId });
  }
  if (!evidenceAnchor) {
    return fail(state, 'E_ATLAS_EVIDENCE_ANCHOR_REQUIRED', 'atlas.observation.reassign', 'EVIDENCE_ANCHOR_REQUIRED', { projectId, sceneId, sourceEntityId, targetEntityId, observationId, mentionId });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'atlas.observation.reassign', 'PROJECT_NOT_FOUND', { projectId });
  }
  if (!project.scenes || !project.scenes[sceneId]) {
    return fail(state, 'E_CORE_SCENE_NOT_FOUND', 'atlas.observation.reassign', 'SCENE_NOT_FOUND', { projectId, sceneId });
  }
  const atlas = normalizeAtlasAuthorData(project.atlas);
  if (!atlas.entities[sourceEntityId]) {
    return fail(state, 'E_ATLAS_ENTITY_NOT_FOUND', 'atlas.observation.reassign', 'SOURCE_ENTITY_NOT_FOUND', { projectId, sourceEntityId });
  }
  if (!atlas.entities[targetEntityId]) {
    return fail(state, 'E_ATLAS_ENTITY_NOT_FOUND', 'atlas.observation.reassign', 'TARGET_ENTITY_NOT_FOUND', { projectId, targetEntityId });
  }
  if (evidenceAnchor.sceneId && evidenceAnchor.sceneId !== sceneId) {
    return fail(state, 'E_ATLAS_EVIDENCE_SCENE_MISMATCH', 'atlas.observation.reassign', 'EVIDENCE_SCENE_MISMATCH', { sceneId, evidenceSceneId: evidenceAnchor.sceneId });
  }
  if (evidenceAnchor.entityId && evidenceAnchor.entityId !== sourceEntityId) {
    return fail(state, 'E_ATLAS_EVIDENCE_ENTITY_MISMATCH', 'atlas.observation.reassign', 'EVIDENCE_ENTITY_MISMATCH', { sourceEntityId, evidenceEntityId: evidenceAnchor.entityId });
  }
  const staleEvidence = validateEvidenceStillMatchesScene({
    state,
    project,
    sceneId,
    evidenceAnchor,
    op: 'atlas.observation.reassign',
    reasonDetails: { projectId, sourceEntityId, targetEntityId, observationId, mentionId },
  });
  if (staleEvidence) return staleEvidence;
  if (atlas.reassignments && atlas.reassignments[reassignmentId]) {
    return fail(state, 'E_ATLAS_REASSIGNMENT_ALREADY_EXISTS', 'atlas.observation.reassign', 'REASSIGNMENT_ALREADY_EXISTS', { projectId, reassignmentId });
  }
  const staleSource = validateExpectedEntityHash({
    state,
    entity: atlas.entities[sourceEntityId],
    expectedHash: payload?.expectedSourceEntityHash,
    op: 'atlas.observation.reassign',
    reasonDetails: { projectId, entityId: sourceEntityId },
  });
  if (staleSource) return staleSource;
  const staleTarget = validateExpectedEntityHash({
    state,
    entity: atlas.entities[targetEntityId],
    expectedHash: payload?.expectedTargetEntityHash,
    op: 'atlas.observation.reassign',
    reasonDetails: { projectId, entityId: targetEntityId },
  });
  if (staleTarget) return staleTarget;

  const next = cloneJson(state);
  const commandSeq = next.data.lastCommandId + 1;
  const nextProject = next.data.projects[projectId];
  const nextAtlas = ensureAtlasAuthorData(nextProject);
  if (!isPlainObject(nextAtlas.reassignments)) nextAtlas.reassignments = {};
  nextAtlas.reassignments[reassignmentId] = {
    id: reassignmentId,
    operationKind: 'observation.reassign',
    projectId,
    sceneId,
    sourceEntityId,
    targetEntityId,
    observationId,
    mentionId,
    reason,
    evidenceAnchor,
    createdByCommandSeq: commandSeq,
  };
  nextAtlas.entities[sourceEntityId].updatedByCommandSeq = commandSeq;
  nextAtlas.entities[targetEntityId].updatedByCommandSeq = commandSeq;
  next.data.lastCommandId += 1;
  return ok(next);
}

function applyAtlasEvidenceReattach(state, payload) {
  const projectId = trimString(payload?.projectId);
  const sourceRecordKind = normalizeAtlasEvidenceSourceKind(payload?.sourceRecordKind);
  const sourceRecordId = trimString(payload?.sourceRecordId);
  const staleEvidenceAnchor = normalizeEvidenceAnchor(payload?.staleEvidenceAnchor || payload?.oldEvidenceAnchor);
  const newEvidenceAnchor = normalizeEvidenceAnchor(payload?.newEvidenceAnchor);
  const reason = trimString(payload?.reason);
  const reattachmentId = trimString(payload?.reattachmentId) || `atlas-evidence-reattach:${hashCanonicalValue({
    projectId,
    sourceRecordKind,
    sourceRecordId,
    oldAnchorId: staleEvidenceAnchor?.anchorId || '',
    newAnchorId: newEvidenceAnchor?.anchorId || '',
  })}`;

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'atlas.evidence.reattach', 'PROJECT_ID_REQUIRED');
  }
  if (!sourceRecordKind) {
    return fail(state, 'E_ATLAS_EVIDENCE_SOURCE_KIND_REQUIRED', 'atlas.evidence.reattach', 'SOURCE_RECORD_KIND_REQUIRED', { projectId });
  }
  if (!sourceRecordId) {
    return fail(state, 'E_ATLAS_EVIDENCE_SOURCE_ID_REQUIRED', 'atlas.evidence.reattach', 'SOURCE_RECORD_ID_REQUIRED', { projectId, sourceRecordKind });
  }
  if (!staleEvidenceAnchor) {
    return fail(state, 'E_ATLAS_STALE_EVIDENCE_ANCHOR_REQUIRED', 'atlas.evidence.reattach', 'STALE_EVIDENCE_ANCHOR_REQUIRED', { projectId, sourceRecordKind, sourceRecordId });
  }
  if (!newEvidenceAnchor) {
    return fail(state, 'E_ATLAS_NEW_EVIDENCE_ANCHOR_REQUIRED', 'atlas.evidence.reattach', 'NEW_EVIDENCE_ANCHOR_REQUIRED', { projectId, sourceRecordKind, sourceRecordId });
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'atlas.evidence.reattach', 'PROJECT_NOT_FOUND', { projectId });
  }
  if (!project.scenes || !project.scenes[newEvidenceAnchor.sceneId]) {
    return fail(state, 'E_CORE_SCENE_NOT_FOUND', 'atlas.evidence.reattach', 'NEW_EVIDENCE_SCENE_NOT_FOUND', { projectId, sceneId: newEvidenceAnchor.sceneId });
  }
  const atlas = normalizeAtlasAuthorData(project.atlas);
  const sourceRecord = getAtlasEvidenceSourceRecord(atlas, sourceRecordKind, sourceRecordId);
  if (!sourceRecord) {
    return fail(state, 'E_ATLAS_EVIDENCE_SOURCE_NOT_FOUND', 'atlas.evidence.reattach', 'SOURCE_RECORD_NOT_FOUND', { projectId, sourceRecordKind, sourceRecordId });
  }
  if (!evidenceAnchorMatches(sourceRecord.evidenceAnchor, staleEvidenceAnchor)) {
    return fail(state, 'E_ATLAS_EVIDENCE_SOURCE_MISMATCH', 'atlas.evidence.reattach', 'SOURCE_EVIDENCE_MISMATCH', { projectId, sourceRecordKind, sourceRecordId });
  }
  const expectedSourceRecordHash = trimString(payload?.expectedSourceRecordHash);
  const actualSourceRecordHash = hashCanonicalValue(sourceRecord);
  if (expectedSourceRecordHash && expectedSourceRecordHash !== actualSourceRecordHash) {
    return fail(state, 'E_ATLAS_SOURCE_RECORD_STALE', 'atlas.evidence.reattach', 'SOURCE_RECORD_STALE', {
      projectId,
      sourceRecordKind,
      sourceRecordId,
      expectedSourceRecordHash,
      actualSourceRecordHash,
    });
  }
  const staleNewEvidence = validateEvidenceStillMatchesScene({
    state,
    project,
    sceneId: newEvidenceAnchor.sceneId,
    evidenceAnchor: newEvidenceAnchor,
    op: 'atlas.evidence.reattach',
    reasonDetails: { projectId, sourceRecordKind, sourceRecordId },
  });
  if (staleNewEvidence) return staleNewEvidence;
  if (atlas.evidenceReattachments && atlas.evidenceReattachments[reattachmentId]) {
    return fail(state, 'E_ATLAS_REATTACHMENT_ALREADY_EXISTS', 'atlas.evidence.reattach', 'REATTACHMENT_ALREADY_EXISTS', { projectId, reattachmentId });
  }

  const next = cloneJson(state);
  const commandSeq = next.data.lastCommandId + 1;
  const nextProject = next.data.projects[projectId];
  const nextAtlas = ensureAtlasAuthorData(nextProject);
  if (!isPlainObject(nextAtlas.evidenceReattachments)) nextAtlas.evidenceReattachments = {};
  nextAtlas.evidenceReattachments[reattachmentId] = {
    id: reattachmentId,
    operationKind: 'evidence.reattach',
    projectId,
    sourceRecordKind,
    sourceRecordId,
    sourceRecordHash: actualSourceRecordHash,
    staleEvidenceAnchor,
    newEvidenceAnchor,
    reason,
    createdByCommandSeq: commandSeq,
  };
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
  if (type === CORE_COMMAND_IDS.ATLAS_OBSERVATION_SUPPRESS) {
    return applyAtlasObservationSuppress(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.ATLAS_ENTITY_MERGE) {
    return applyAtlasEntityMerge(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.ATLAS_ENTITY_SPLIT_RESTORE) {
    return applyAtlasEntitySplitRestore(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.ATLAS_OBSERVATION_REASSIGN) {
    return applyAtlasObservationReassign(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.ATLAS_EVIDENCE_REATTACH) {
    return applyAtlasEvidenceReattach(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.ATLAS_SAVED_QUERY_SAVE) {
    return applyAtlasSavedQuerySave(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET) {
    return applyAtlasLanguageTagSet(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_CLEAR) {
    return applyAtlasLanguageTagClear(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.ATLAS_SERIES_PORTABILITY_APPLY) {
    return applyAtlasSeriesPortabilityApply(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.ATLAS_SERIES_PORTABILITY_ROLLBACK) {
    return applyAtlasSeriesPortabilityRollback(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.ATLAS_CALENDAR_DEFINE) {
    return applyAtlasCalendarDefine(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET) {
    return applyAtlasSceneTemporalAnchorSet(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.ATLAS_CONTINUITY_FACT_RECORD) {
    return applyAtlasContinuityFactRecord(state, command.payload || {});
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
  if (type === CORE_COMMAND_IDS.MANUAL_MAP_NODE_UPDATE) {
    return applyManualMapNodeUpdate(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.MANUAL_MAP_NODE_DELETE) {
    return applyManualMapNodeDelete(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.MANUAL_MAP_EDGE_ADD) {
    return applyManualMapEdgeAdd(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.MANUAL_MAP_EDGE_UPDATE) {
    return applyManualMapEdgeUpdate(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.MANUAL_MAP_EDGE_DELETE) {
    return applyManualMapEdgeDelete(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.MANUAL_MAP_GROUP_CREATE) {
    return applyManualMapGroupCreate(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.MANUAL_MAP_GROUP_UPDATE) {
    return applyManualMapGroupUpdate(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.MANUAL_MAP_GROUP_DELETE) {
    return applyManualMapGroupDelete(state, command.payload || {});
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
