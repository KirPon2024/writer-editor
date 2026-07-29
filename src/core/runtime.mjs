import { hashCanonicalValue } from './browser-safe-hash.mjs';

export const CORE_COMMAND_IDS = Object.freeze({
  PROJECT_CREATE: 'project.create',
  PROJECT_APPLY_TEXT_EDIT: 'project.applyTextEdit',
  ATLAS_ENTITY_CREATE: 'atlas.entity.create',
  ATLAS_ALIAS_ADD: 'atlas.alias.add',
  ATLAS_MENTION_CONFIRM: 'atlas.mention.confirm',
});

const ATLAS_AUTHOR_SCHEMA_VERSION = 'atlas.author.v1';

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
