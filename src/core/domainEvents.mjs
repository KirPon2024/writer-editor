import { canonicalSerialize, hashCanonicalValue } from './browser-safe-hash.mjs';

export const CORE_EVENT_SCHEMA_VERSION = 'core.event.v1';
export const CORE_EVENT_FACT_KIND = 'OBSERVED_FACT';
export const CORE_EVENT_EMPTY_DIGEST = hashCanonicalValue([]);

const SHA256_HEX_RE = /^[0-9a-f]{64}$/u;
const CORE_EVENT_TOP_LEVEL_KEYS = Object.freeze([
  'schemaVersion',
  'type',
  'factKind',
  'sourceBinding',
  'payload',
]);
const CORE_EVENT_SOURCE_BINDING_KEYS = Object.freeze([
  'boundary',
  'commandType',
  'commandSeq',
  'previousStateHash',
  'nextStateHash',
  'causedByCommandType',
]);
const PAYLOAD_FORBIDDEN_AUTHORITY_KEYS = Object.freeze([
  'action',
  'actions',
  'bridge',
  'command',
  'commandId',
  'commands',
  'commandType',
  'dispatch',
  'dispatcher',
  'executor',
  'handler',
  'handlers',
  'ipc',
  'ipcRenderer',
  'kernel',
  'rpc',
  'storage',
  'writeAuthority',
]);

export const CORE_EVENT_IDS = Object.freeze({
  SCENE_CHANGED: 'SceneChanged',
  SCENE_ORDER_CHANGED: 'SceneOrderChanged',
  ENTITY_CREATED: 'EntityCreated',
  ENTITY_MERGED: 'EntityMerged',
  ENTITY_SPLIT: 'EntitySplit',
  ALIAS_CHANGED: 'AliasChanged',
  MAP_CHANGED: 'MapChanged',
  MAP_NODE_PROMOTED: 'MapNodePromoted',
  DECISION_COMMITTED: 'DecisionCommitted',
  CALENDAR_CHANGED: 'CalendarChanged',
  TIME_RANGE_CHANGED: 'TimeRangeChanged',
  CONTINUITY_DECISION_COMMITTED: 'ContinuityDecisionCommitted',
  PROJECTION_INVALIDATED: 'ProjectionInvalidated',
  DERIVED_GENERATION_PUBLISHED: 'DerivedGenerationPublished',
  DERIVED_GENERATION_REJECTED_AS_STALE: 'DerivedGenerationRejectedAsStale',
  LANGUAGE_CAPABILITY_CHANGED: 'LanguageCapabilityChanged',
  MIGRATION_PREPARED: 'MigrationPrepared',
  MIGRATION_COMMITTED: 'MigrationCommitted',
  MIGRATION_ROLLED_BACK: 'MigrationRolledBack',
});

export const CORE_EVENT_ID_LIST = Object.freeze(Object.values(CORE_EVENT_IDS));

export const CORE_EVENT_EMISSION_BOUNDARIES = Object.freeze({
  [CORE_EVENT_IDS.SCENE_CHANGED]: 'coreReducer',
  [CORE_EVENT_IDS.SCENE_ORDER_CHANGED]: 'sceneOrderProjection',
  [CORE_EVENT_IDS.ENTITY_CREATED]: 'coreReducer',
  [CORE_EVENT_IDS.ENTITY_MERGED]: 'coreReducer',
  [CORE_EVENT_IDS.ENTITY_SPLIT]: 'coreReducer',
  [CORE_EVENT_IDS.ALIAS_CHANGED]: 'coreReducer',
  [CORE_EVENT_IDS.MAP_CHANGED]: 'coreReducer',
  [CORE_EVENT_IDS.MAP_NODE_PROMOTED]: 'manualMapPromotionCommand',
  [CORE_EVENT_IDS.DECISION_COMMITTED]: 'coreReducer',
  [CORE_EVENT_IDS.CALENDAR_CHANGED]: 'coreReducer',
  [CORE_EVENT_IDS.TIME_RANGE_CHANGED]: 'coreReducer',
  [CORE_EVENT_IDS.CONTINUITY_DECISION_COMMITTED]: 'coreReducer',
  [CORE_EVENT_IDS.PROJECTION_INVALIDATED]: 'projectionInvalidationPort',
  [CORE_EVENT_IDS.DERIVED_GENERATION_PUBLISHED]: 'derivedProjectionWorker',
  [CORE_EVENT_IDS.DERIVED_GENERATION_REJECTED_AS_STALE]: 'derivedProjectionWorker',
  [CORE_EVENT_IDS.LANGUAGE_CAPABILITY_CHANGED]: 'coreReducer',
  [CORE_EVENT_IDS.MIGRATION_PREPARED]: 'migrationPreviewAdapter',
  [CORE_EVENT_IDS.MIGRATION_COMMITTED]: 'coreReducer',
  [CORE_EVENT_IDS.MIGRATION_ROLLED_BACK]: 'coreReducer',
});

const CORE_REDUCER_COMMANDS = Object.freeze({
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

export const CORE_EVENT_SYSTEM_SOURCE_TYPES = Object.freeze({
  SCENE_ORDER_PUBLISH: 'system.sceneOrder.publish',
  PROJECTION_INVALIDATE: 'system.projection.invalidate',
  DERIVED_PUBLISH: 'system.derived.publish',
  DERIVED_REJECT_STALE: 'system.derived.rejectStale',
  MIGRATION_PREPARE: 'system.migration.prepare',
  MANUAL_MAP_NODE_PROMOTE: 'manualMap.node.promote',
});

function freezeRule(boundary, commandTypes, causedByCommandTypes = [], minCommandSeq = 1) {
  return Object.freeze({
    boundary,
    commandTypes: Object.freeze([...commandTypes]),
    causedByCommandTypes: Object.freeze([...causedByCommandTypes]),
    minCommandSeq,
  });
}

export const CORE_EVENT_SOURCE_RULES = Object.freeze({
  [CORE_EVENT_IDS.SCENE_CHANGED]: freezeRule('coreReducer', [
    CORE_REDUCER_COMMANDS.PROJECT_CREATE,
    CORE_REDUCER_COMMANDS.PROJECT_APPLY_TEXT_EDIT,
  ]),
  [CORE_EVENT_IDS.SCENE_ORDER_CHANGED]: freezeRule('sceneOrderProjection', [
    CORE_EVENT_SYSTEM_SOURCE_TYPES.SCENE_ORDER_PUBLISH,
  ], [], 0),
  [CORE_EVENT_IDS.ENTITY_CREATED]: freezeRule('coreReducer', [
    CORE_REDUCER_COMMANDS.ATLAS_ENTITY_CREATE,
  ]),
  [CORE_EVENT_IDS.ENTITY_MERGED]: freezeRule('coreReducer', [
    CORE_REDUCER_COMMANDS.ATLAS_ENTITY_MERGE,
  ]),
  [CORE_EVENT_IDS.ENTITY_SPLIT]: freezeRule('coreReducer', [
    CORE_REDUCER_COMMANDS.ATLAS_ENTITY_SPLIT_RESTORE,
  ]),
  [CORE_EVENT_IDS.ALIAS_CHANGED]: freezeRule('coreReducer', [
    CORE_REDUCER_COMMANDS.ATLAS_ALIAS_ADD,
  ]),
  [CORE_EVENT_IDS.MAP_CHANGED]: freezeRule('coreReducer', [
    CORE_REDUCER_COMMANDS.MANUAL_MAP_CREATE,
    CORE_REDUCER_COMMANDS.MANUAL_MAP_NODE_ADD,
    CORE_REDUCER_COMMANDS.MANUAL_MAP_NODE_UPDATE,
    CORE_REDUCER_COMMANDS.MANUAL_MAP_NODE_DELETE,
    CORE_REDUCER_COMMANDS.MANUAL_MAP_EDGE_ADD,
    CORE_REDUCER_COMMANDS.MANUAL_MAP_EDGE_UPDATE,
    CORE_REDUCER_COMMANDS.MANUAL_MAP_EDGE_DELETE,
    CORE_REDUCER_COMMANDS.MANUAL_MAP_GROUP_CREATE,
    CORE_REDUCER_COMMANDS.MANUAL_MAP_GROUP_UPDATE,
    CORE_REDUCER_COMMANDS.MANUAL_MAP_GROUP_DELETE,
    CORE_REDUCER_COMMANDS.MANUAL_MAP_ATTACHMENT_ADD,
    CORE_REDUCER_COMMANDS.MANUAL_MAP_PORTAL_ADD,
    CORE_REDUCER_COMMANDS.MANUAL_MAP_TEMPLATE_APPLY,
  ]),
  [CORE_EVENT_IDS.MAP_NODE_PROMOTED]: freezeRule('manualMapPromotionCommand', [
    CORE_EVENT_SYSTEM_SOURCE_TYPES.MANUAL_MAP_NODE_PROMOTE,
  ], [
    CORE_REDUCER_COMMANDS.MANUAL_MAP_NODE_ADD,
    CORE_REDUCER_COMMANDS.MANUAL_MAP_NODE_UPDATE,
  ]),
  [CORE_EVENT_IDS.DECISION_COMMITTED]: freezeRule('coreReducer', [
    CORE_REDUCER_COMMANDS.ATLAS_MENTION_CONFIRM,
    CORE_REDUCER_COMMANDS.ATLAS_OBSERVATION_SUPPRESS,
    CORE_REDUCER_COMMANDS.ATLAS_OBSERVATION_REASSIGN,
    CORE_REDUCER_COMMANDS.ATLAS_EVIDENCE_REATTACH,
  ]),
  [CORE_EVENT_IDS.CALENDAR_CHANGED]: freezeRule('coreReducer', [
    CORE_REDUCER_COMMANDS.ATLAS_CALENDAR_DEFINE,
  ]),
  [CORE_EVENT_IDS.TIME_RANGE_CHANGED]: freezeRule('coreReducer', [
    CORE_REDUCER_COMMANDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET,
  ]),
  [CORE_EVENT_IDS.CONTINUITY_DECISION_COMMITTED]: freezeRule('coreReducer', [
    CORE_REDUCER_COMMANDS.ATLAS_CONTINUITY_FACT_RECORD,
  ]),
  [CORE_EVENT_IDS.PROJECTION_INVALIDATED]: freezeRule('projectionInvalidationPort', [
    CORE_EVENT_SYSTEM_SOURCE_TYPES.PROJECTION_INVALIDATE,
  ], Object.values(CORE_REDUCER_COMMANDS)),
  [CORE_EVENT_IDS.DERIVED_GENERATION_PUBLISHED]: freezeRule('derivedProjectionWorker', [
    CORE_EVENT_SYSTEM_SOURCE_TYPES.DERIVED_PUBLISH,
  ], [], 0),
  [CORE_EVENT_IDS.DERIVED_GENERATION_REJECTED_AS_STALE]: freezeRule('derivedProjectionWorker', [
    CORE_EVENT_SYSTEM_SOURCE_TYPES.DERIVED_REJECT_STALE,
  ], [], 0),
  [CORE_EVENT_IDS.LANGUAGE_CAPABILITY_CHANGED]: freezeRule('coreReducer', [
    CORE_REDUCER_COMMANDS.ATLAS_LANGUAGE_TAG_SET,
    CORE_REDUCER_COMMANDS.ATLAS_LANGUAGE_TAG_CLEAR,
  ]),
  [CORE_EVENT_IDS.MIGRATION_PREPARED]: freezeRule('migrationPreviewAdapter', [
    CORE_EVENT_SYSTEM_SOURCE_TYPES.MIGRATION_PREPARE,
  ], [], 0),
  [CORE_EVENT_IDS.MIGRATION_COMMITTED]: freezeRule('coreReducer', [
    CORE_REDUCER_COMMANDS.ATLAS_SERIES_PORTABILITY_APPLY,
  ]),
  [CORE_EVENT_IDS.MIGRATION_ROLLED_BACK]: freezeRule('coreReducer', [
    CORE_REDUCER_COMMANDS.ATLAS_SERIES_PORTABILITY_ROLLBACK,
  ]),
});

export const CORE_EVENT_RUNTIME_CATALOG = Object.freeze(
  CORE_EVENT_ID_LIST.map((eventId) => Object.freeze({
    eventId,
    schemaVersion: CORE_EVENT_SCHEMA_VERSION,
    factKind: CORE_EVENT_FACT_KIND,
    boundary: CORE_EVENT_SOURCE_RULES[eventId].boundary,
    commandTypes: CORE_EVENT_SOURCE_RULES[eventId].commandTypes,
    causedByCommandTypes: CORE_EVENT_SOURCE_RULES[eventId].causedByCommandTypes,
  })),
);

const PROJECTION_KINDS = Object.freeze([
  'atlas',
  'manualMap',
  'plot',
  'idea',
  'meaning',
  'timeline',
  'continuity',
]);

const CORE_EVENT_PAYLOAD_KEYS = Object.freeze({
  [CORE_EVENT_IDS.SCENE_CHANGED]: Object.freeze(['projectId', 'sceneId', 'changeKind']),
  [CORE_EVENT_IDS.SCENE_ORDER_CHANGED]: Object.freeze(['projectId', 'sceneIds', 'changeKind']),
  [CORE_EVENT_IDS.ENTITY_CREATED]: Object.freeze(['projectId', 'entityId', 'entityKind', 'name']),
  [CORE_EVENT_IDS.ENTITY_MERGED]: Object.freeze(['projectId', 'sourceEntityId', 'targetEntityId', 'operationId']),
  [CORE_EVENT_IDS.ENTITY_SPLIT]: Object.freeze(['projectId', 'operationId', 'restoreOperationId']),
  [CORE_EVENT_IDS.ALIAS_CHANGED]: Object.freeze(['projectId', 'entityId', 'aliasId', 'changeKind']),
  [CORE_EVENT_IDS.MAP_CHANGED]: Object.freeze(['projectId', 'mapId', 'changeKind']),
  [CORE_EVENT_IDS.MAP_NODE_PROMOTED]: Object.freeze(['projectId', 'mapId', 'nodeId', 'targetKind', 'targetId', 'promotionKind']),
  [CORE_EVENT_IDS.DECISION_COMMITTED]: Object.freeze(['projectId', 'decisionKind', 'decisionId', 'subjectId']),
  [CORE_EVENT_IDS.CALENDAR_CHANGED]: Object.freeze(['projectId', 'calendarId', 'changeKind']),
  [CORE_EVENT_IDS.TIME_RANGE_CHANGED]: Object.freeze(['projectId', 'sceneId', 'anchorId', 'changeKind']),
  [CORE_EVENT_IDS.CONTINUITY_DECISION_COMMITTED]: Object.freeze(['projectId', 'ledgerKind', 'factId', 'subjectEntityId']),
  [CORE_EVENT_IDS.PROJECTION_INVALIDATED]: Object.freeze(['projectId', 'projectionKinds', 'reason']),
  [CORE_EVENT_IDS.DERIVED_GENERATION_PUBLISHED]: Object.freeze(['projectId', 'generationId', 'projectionKind', 'sourceRevision']),
  [CORE_EVENT_IDS.DERIVED_GENERATION_REJECTED_AS_STALE]: Object.freeze(['projectId', 'generationId', 'projectionKind', 'sourceRevision', 'currentRevision']),
  [CORE_EVENT_IDS.LANGUAGE_CAPABILITY_CHANGED]: Object.freeze(['projectId', 'scopeKind', 'tagId', 'changeKind']),
  [CORE_EVENT_IDS.MIGRATION_PREPARED]: Object.freeze(['projectId', 'migrationId', 'sourceSchemaVersion', 'targetSchemaVersion']),
  [CORE_EVENT_IDS.MIGRATION_COMMITTED]: Object.freeze(['projectId', 'migrationId', 'sourceSchemaVersion', 'targetSchemaVersion']),
  [CORE_EVENT_IDS.MIGRATION_ROLLED_BACK]: Object.freeze(['projectId', 'migrationId', 'rollbackOperationId']),
});

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) {
      deepFreeze(item);
    }
  }
  return value;
}

function cloneAndFreeze(value) {
  return deepFreeze(cloneJson(value));
}

function objectKeysClosed(value, allowedKeys) {
  if (!isObjectRecord(value)) return false;
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function containsForbiddenAuthorityKey(value) {
  if (Array.isArray(value)) return value.some((item) => containsForbiddenAuthorityKey(item));
  if (!isObjectRecord(value)) return false;
  for (const key of Object.keys(value)) {
    if (PAYLOAD_FORBIDDEN_AUTHORITY_KEYS.includes(key)) return true;
    if (containsForbiddenAuthorityKey(value[key])) return true;
  }
  return false;
}

function requiredHash(value) {
  return SHA256_HEX_RE.test(text(value));
}

function nonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value.map(text).filter(Boolean)) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function inferredLanguageTagId(payload) {
  const projectId = text(payload?.projectId);
  const scopeKind = text(payload?.scopeKind || payload?.scope);
  const sceneId = text(payload?.sceneId);
  const blockId = text(payload?.blockId);
  const startOffset = Number(payload?.startOffset);
  const endOffset = Number(payload?.endOffset);
  if (scopeKind === 'project') return `atlas-language-tag:project:${projectId}`;
  if (scopeKind === 'scene') return `atlas-language-tag:scene:${projectId}:${sceneId}`;
  if (scopeKind === 'block') return `atlas-language-tag:block:${projectId}:${sceneId}:${blockId}`;
  return `atlas-language-tag:range:${hashCanonicalValue({ projectId, sceneId, startOffset, endOffset })}`;
}

function requiredString(payload, key) {
  return typeof payload?.[key] === 'string' && payload[key].trim().length > 0;
}

function requiredStringArray(payload, key) {
  return Array.isArray(payload?.[key]) && payload[key].every((item) => typeof item === 'string' && item.length > 0);
}

const PAYLOAD_VALIDATORS = Object.freeze({
  [CORE_EVENT_IDS.SCENE_CHANGED]: (payload) => requiredString(payload, 'projectId')
    && requiredString(payload, 'sceneId')
    && ['created', 'textEdited', 'imported', 'reordered'].includes(payload.changeKind),
  [CORE_EVENT_IDS.SCENE_ORDER_CHANGED]: (payload) => requiredString(payload, 'projectId')
    && requiredStringArray(payload, 'sceneIds')
    && payload.changeKind === 'reordered',
  [CORE_EVENT_IDS.ENTITY_CREATED]: (payload) => requiredString(payload, 'projectId')
    && requiredString(payload, 'entityId')
    && requiredString(payload, 'entityKind')
    && requiredString(payload, 'name'),
  [CORE_EVENT_IDS.ENTITY_MERGED]: (payload) => requiredString(payload, 'projectId')
    && requiredString(payload, 'sourceEntityId')
    && requiredString(payload, 'targetEntityId')
    && requiredString(payload, 'operationId'),
  [CORE_EVENT_IDS.ENTITY_SPLIT]: (payload) => requiredString(payload, 'projectId')
    && requiredString(payload, 'operationId')
    && requiredString(payload, 'restoreOperationId'),
  [CORE_EVENT_IDS.ALIAS_CHANGED]: (payload) => requiredString(payload, 'projectId')
    && requiredString(payload, 'entityId')
    && requiredString(payload, 'aliasId')
    && ['added', 'updated', 'removed'].includes(payload.changeKind),
  [CORE_EVENT_IDS.MAP_CHANGED]: (payload) => requiredString(payload, 'projectId')
    && requiredString(payload, 'mapId')
    && requiredString(payload, 'changeKind'),
  [CORE_EVENT_IDS.MAP_NODE_PROMOTED]: (payload) => requiredString(payload, 'projectId')
    && requiredString(payload, 'mapId')
    && requiredString(payload, 'nodeId')
    && requiredString(payload, 'targetKind')
    && requiredString(payload, 'targetId'),
  [CORE_EVENT_IDS.DECISION_COMMITTED]: (payload) => requiredString(payload, 'projectId')
    && requiredString(payload, 'decisionKind')
    && requiredString(payload, 'decisionId')
    && requiredString(payload, 'subjectId'),
  [CORE_EVENT_IDS.CALENDAR_CHANGED]: (payload) => requiredString(payload, 'projectId')
    && requiredString(payload, 'calendarId')
    && ['defined', 'updated'].includes(payload.changeKind),
  [CORE_EVENT_IDS.TIME_RANGE_CHANGED]: (payload) => requiredString(payload, 'projectId')
    && requiredString(payload, 'sceneId')
    && requiredString(payload, 'anchorId')
    && ['set', 'updated'].includes(payload.changeKind),
  [CORE_EVENT_IDS.CONTINUITY_DECISION_COMMITTED]: (payload) => requiredString(payload, 'projectId')
    && requiredString(payload, 'ledgerKind')
    && requiredString(payload, 'factId')
    && requiredString(payload, 'subjectEntityId'),
  [CORE_EVENT_IDS.PROJECTION_INVALIDATED]: (payload) => requiredString(payload, 'projectId')
    && requiredStringArray(payload, 'projectionKinds')
    && requiredString(payload, 'reason'),
  [CORE_EVENT_IDS.DERIVED_GENERATION_PUBLISHED]: (payload) => requiredString(payload, 'projectId')
    && requiredString(payload, 'generationId')
    && requiredString(payload, 'projectionKind')
    && nonNegativeSafeInteger(payload.sourceRevision),
  [CORE_EVENT_IDS.DERIVED_GENERATION_REJECTED_AS_STALE]: (payload) => requiredString(payload, 'projectId')
    && requiredString(payload, 'generationId')
    && requiredString(payload, 'projectionKind')
    && nonNegativeSafeInteger(payload.sourceRevision)
    && nonNegativeSafeInteger(payload.currentRevision),
  [CORE_EVENT_IDS.LANGUAGE_CAPABILITY_CHANGED]: (payload) => requiredString(payload, 'projectId')
    && requiredString(payload, 'scopeKind')
    && requiredString(payload, 'tagId')
    && ['set', 'cleared'].includes(payload.changeKind),
  [CORE_EVENT_IDS.MIGRATION_PREPARED]: (payload) => requiredString(payload, 'projectId')
    && requiredString(payload, 'migrationId')
    && requiredString(payload, 'sourceSchemaVersion')
    && requiredString(payload, 'targetSchemaVersion'),
  [CORE_EVENT_IDS.MIGRATION_COMMITTED]: (payload) => requiredString(payload, 'projectId')
    && requiredString(payload, 'migrationId')
    && requiredString(payload, 'sourceSchemaVersion')
    && requiredString(payload, 'targetSchemaVersion'),
  [CORE_EVENT_IDS.MIGRATION_ROLLED_BACK]: (payload) => requiredString(payload, 'projectId')
    && requiredString(payload, 'migrationId')
    && requiredString(payload, 'rollbackOperationId'),
});

export function isCoreDomainEventType(type) {
  return CORE_EVENT_ID_LIST.includes(type);
}

function validateSourceBinding(eventType, sourceBinding) {
  if (!isObjectRecord(sourceBinding) || !objectKeysClosed(sourceBinding, CORE_EVENT_SOURCE_BINDING_KEYS)) return false;
  const rule = CORE_EVENT_SOURCE_RULES[eventType];
  if (!rule) return false;
  if (sourceBinding.boundary !== rule.boundary) return false;
  if (!rule.commandTypes.includes(sourceBinding.commandType)) return false;
  if (!Number.isSafeInteger(sourceBinding.commandSeq) || sourceBinding.commandSeq < rule.minCommandSeq) return false;
  if (!requiredHash(sourceBinding.previousStateHash) || !requiredHash(sourceBinding.nextStateHash)) return false;
  const hasCausedBy = Object.prototype.hasOwnProperty.call(sourceBinding, 'causedByCommandType');
  if (rule.causedByCommandTypes.length > 0) {
    return hasCausedBy && rule.causedByCommandTypes.includes(sourceBinding.causedByCommandType);
  }
  return !hasCausedBy;
}

function validatePayloadClosed(eventType, payload) {
  const allowedKeys = CORE_EVENT_PAYLOAD_KEYS[eventType];
  if (!allowedKeys || !objectKeysClosed(payload, allowedKeys)) return false;
  if (containsForbiddenAuthorityKey(payload)) return false;
  const validatePayload = PAYLOAD_VALIDATORS[eventType];
  return typeof validatePayload === 'function' && validatePayload(payload);
}

export function validateCoreDomainEvent(event) {
  if (!isObjectRecord(event)) return { ok: false, reason: 'EVENT_OBJECT_REQUIRED' };
  if (!objectKeysClosed(event, CORE_EVENT_TOP_LEVEL_KEYS)) return { ok: false, reason: 'EVENT_KEYS_INVALID' };
  if (event.schemaVersion !== CORE_EVENT_SCHEMA_VERSION) return { ok: false, reason: 'EVENT_SCHEMA_VERSION_INVALID' };
  if (event.factKind !== CORE_EVENT_FACT_KIND) return { ok: false, reason: 'EVENT_FACT_KIND_INVALID' };
  if (!isCoreDomainEventType(event.type)) return { ok: false, reason: 'EVENT_TYPE_UNKNOWN' };
  if (!validateSourceBinding(event.type, event.sourceBinding)) return { ok: false, reason: 'EVENT_SOURCE_BINDING_INVALID' };
  if (!isObjectRecord(event.payload)) return { ok: false, reason: 'EVENT_PAYLOAD_OBJECT_REQUIRED' };
  if (!validatePayloadClosed(event.type, event.payload)) {
    return { ok: false, reason: 'EVENT_PAYLOAD_INVALID', eventType: event.type };
  }
  return { ok: true, reason: '' };
}

export function serializeCoreDomainEvent(event) {
  const validation = validateCoreDomainEvent(event);
  if (!validation.ok) {
    throw new Error(`INVALID_CORE_DOMAIN_EVENT:${validation.reason}`);
  }
  return canonicalSerialize(event);
}

export function deserializeCoreDomainEvent(serialized) {
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return { ok: false, reason: 'EVENT_SERIALIZATION_INVALID', event: null };
  }
  const validation = validateCoreDomainEvent(parsed);
  if (!validation.ok) return { ...validation, event: null };
  return { ok: true, reason: '', event: cloneAndFreeze(parsed) };
}

function sourceBindingFor({ type, command, commandSeq, previousStateHash, nextStateHash }) {
  const rule = CORE_EVENT_SOURCE_RULES[type];
  const commandType = text(command?.type);
  const sourceBinding = {
    boundary: rule.boundary,
    commandType,
    commandSeq,
    previousStateHash,
    nextStateHash,
  };
  if (type === CORE_EVENT_IDS.PROJECTION_INVALIDATED) {
    sourceBinding.commandType = CORE_EVENT_SYSTEM_SOURCE_TYPES.PROJECTION_INVALIDATE;
    sourceBinding.causedByCommandType = commandType;
  }
  if (type === CORE_EVENT_IDS.MAP_NODE_PROMOTED) {
    sourceBinding.commandType = CORE_EVENT_SYSTEM_SOURCE_TYPES.MANUAL_MAP_NODE_PROMOTE;
    sourceBinding.causedByCommandType = commandType;
  }
  return sourceBinding;
}

function eventFor({ type, payload, command, commandSeq, previousStateHash, nextStateHash, sourceBinding }) {
  const event = {
    schemaVersion: CORE_EVENT_SCHEMA_VERSION,
    type,
    factKind: CORE_EVENT_FACT_KIND,
    sourceBinding: sourceBinding || sourceBindingFor({ type, command, commandSeq, previousStateHash, nextStateHash }),
    payload: cloneJson(payload),
  };
  const validation = validateCoreDomainEvent(event);
  if (!validation.ok) {
    throw new Error(`INVALID_CORE_DOMAIN_EVENT:${validation.reason}:${type}`);
  }
  return cloneAndFreeze(event);
}

function normalizeHashInput(value, fallbackSeed) {
  const hash = text(value);
  return SHA256_HEX_RE.test(hash) ? hash : hashCanonicalValue(fallbackSeed);
}

function normalizeCommandSeqInput(value, fallback = 0) {
  const seq = Number(value);
  return Number.isSafeInteger(seq) && seq >= 0 ? seq : fallback;
}

function requireHashInput(value, key) {
  const hash = text(value);
  if (!SHA256_HEX_RE.test(hash)) throw new Error(`INVALID_CORE_DOMAIN_EVENT_PROVENANCE:${key}`);
  return hash;
}

function requireNonNegativeSafeIntegerInput(value, key) {
  const seq = Number(value);
  if (!Number.isSafeInteger(seq) || seq < 0) {
    throw new Error(`INVALID_CORE_DOMAIN_EVENT_PROVENANCE:${key}`);
  }
  return seq;
}

function boundaryEvent(type, payload, input, commandType) {
  const commandSeq = requireNonNegativeSafeIntegerInput(input?.commandSeq, 'commandSeq');
  const previousStateHash = requireHashInput(input?.previousStateHash, 'previousStateHash');
  const nextStateHash = requireHashInput(input?.nextStateHash, 'nextStateHash');
  return eventFor({
    type,
    payload,
    sourceBinding: {
      boundary: CORE_EVENT_SOURCE_RULES[type].boundary,
      commandType,
      commandSeq,
      previousStateHash,
      nextStateHash,
    },
  });
}

export function buildSceneOrderChangedEvent(input = {}) {
  return boundaryEvent(
    CORE_EVENT_IDS.SCENE_ORDER_CHANGED,
    {
      projectId: text(input.projectId),
      sceneIds: stringArray(input.sceneIds),
      changeKind: 'reordered',
    },
    input,
    CORE_EVENT_SYSTEM_SOURCE_TYPES.SCENE_ORDER_PUBLISH,
  );
}

export function buildDerivedGenerationPublishedEvent(input = {}) {
  return boundaryEvent(
    CORE_EVENT_IDS.DERIVED_GENERATION_PUBLISHED,
    {
      projectId: text(input.projectId),
      generationId: text(input.generationId),
      projectionKind: text(input.projectionKind),
      sourceRevision: requireNonNegativeSafeIntegerInput(input.sourceRevision, 'sourceRevision'),
    },
    input,
    CORE_EVENT_SYSTEM_SOURCE_TYPES.DERIVED_PUBLISH,
  );
}

export function buildDerivedGenerationRejectedAsStaleEvent(input = {}) {
  return boundaryEvent(
    CORE_EVENT_IDS.DERIVED_GENERATION_REJECTED_AS_STALE,
    {
      projectId: text(input.projectId),
      generationId: text(input.generationId),
      projectionKind: text(input.projectionKind),
      sourceRevision: requireNonNegativeSafeIntegerInput(input.sourceRevision, 'sourceRevision'),
      currentRevision: requireNonNegativeSafeIntegerInput(input.currentRevision, 'currentRevision'),
    },
    input,
    CORE_EVENT_SYSTEM_SOURCE_TYPES.DERIVED_REJECT_STALE,
  );
}

export function buildMigrationPreparedEvent(input = {}) {
  return boundaryEvent(
    CORE_EVENT_IDS.MIGRATION_PREPARED,
    {
      projectId: text(input.projectId),
      migrationId: text(input.migrationId),
      sourceSchemaVersion: text(input.sourceSchemaVersion),
      targetSchemaVersion: text(input.targetSchemaVersion),
    },
    input,
    CORE_EVENT_SYSTEM_SOURCE_TYPES.MIGRATION_PREPARE,
  );
}

export function serializeCoreDomainEvents(events = []) {
  if (!Array.isArray(events)) throw new Error('INVALID_CORE_DOMAIN_EVENTS:EVENTS_ARRAY_REQUIRED');
  const frozen = events.map((event) => {
    const validation = validateCoreDomainEvent(event);
    if (!validation.ok) throw new Error(`INVALID_CORE_DOMAIN_EVENTS:${validation.reason}`);
    return cloneAndFreeze(event);
  });
  return canonicalSerialize(frozen);
}

export function hashCoreDomainEvents(events = []) {
  return hashCanonicalValue(JSON.parse(serializeCoreDomainEvents(events)));
}

function projectionInvalidated(payload, reason, projectionKinds = PROJECTION_KINDS) {
  const projectId = text(payload?.projectId);
  if (!projectId) return [];
  return [{
    type: CORE_EVENT_IDS.PROJECTION_INVALIDATED,
    payload: {
      projectId,
      projectionKinds: stringArray(projectionKinds),
      reason,
    },
  }];
}

function mapChanged(payload, changeKind) {
  const projectId = text(payload?.projectId);
  const mapId = text(payload?.mapId);
  if (!projectId || !mapId) return [];
  return [{
    type: CORE_EVENT_IDS.MAP_CHANGED,
    payload: {
      projectId,
      mapId,
      changeKind,
    },
  }];
}

function mapNodePromotion(payload) {
  const projectId = text(payload?.projectId);
  const mapId = text(payload?.mapId);
  const nodeId = text(payload?.nodeId);
  const targetKind = text(payload?.targetKind);
  const targetId = text(payload?.targetId);
  if (!projectId || !mapId || !nodeId || !targetKind || !targetId) return [];
  return [{
    type: CORE_EVENT_IDS.MAP_NODE_PROMOTED,
    payload: {
      projectId,
      mapId,
      nodeId,
      targetKind,
      targetId,
      promotionKind: 'explicitAuthorPromotion',
    },
  }];
}

function commandFacts(commandType, payload) {
  switch (commandType) {
    case CORE_REDUCER_COMMANDS.PROJECT_CREATE:
      return [
        {
          type: CORE_EVENT_IDS.SCENE_CHANGED,
          payload: {
            projectId: text(payload?.projectId),
            sceneId: text(payload?.sceneId) || 'scene-1',
            changeKind: 'created',
          },
        },
        ...projectionInvalidated(payload, 'projectCreated'),
      ];
    case CORE_REDUCER_COMMANDS.PROJECT_APPLY_TEXT_EDIT:
      return [
        {
          type: CORE_EVENT_IDS.SCENE_CHANGED,
          payload: {
            projectId: text(payload?.projectId),
            sceneId: text(payload?.sceneId),
            changeKind: 'textEdited',
          },
        },
        ...projectionInvalidated(payload, 'sceneTextEdited'),
      ];
    case CORE_REDUCER_COMMANDS.ATLAS_ENTITY_CREATE:
      return [
        {
          type: CORE_EVENT_IDS.ENTITY_CREATED,
          payload: {
            projectId: text(payload?.projectId),
            entityId: text(payload?.entityId),
            entityKind: text(payload?.entityKind) || 'entity',
            name: text(payload?.name),
          },
        },
        ...projectionInvalidated(payload, 'atlasEntityCreated', ['atlas', 'manualMap', 'plot', 'idea', 'meaning']),
      ];
    case CORE_REDUCER_COMMANDS.ATLAS_ALIAS_ADD:
      return [
        {
          type: CORE_EVENT_IDS.ALIAS_CHANGED,
          payload: {
            projectId: text(payload?.projectId),
            entityId: text(payload?.entityId),
            aliasId: text(payload?.aliasId),
            changeKind: 'added',
          },
        },
        ...projectionInvalidated(payload, 'atlasAliasChanged', ['atlas']),
      ];
    case CORE_REDUCER_COMMANDS.ATLAS_MENTION_CONFIRM:
      return [
        {
          type: CORE_EVENT_IDS.DECISION_COMMITTED,
          payload: {
            projectId: text(payload?.projectId),
            decisionKind: 'mention.confirm',
            decisionId: text(payload?.decisionId) || text(payload?.mentionId),
            subjectId: text(payload?.entityId),
          },
        },
        ...projectionInvalidated(payload, 'atlasDecisionCommitted', ['atlas', 'continuity']),
      ];
    case CORE_REDUCER_COMMANDS.ATLAS_OBSERVATION_SUPPRESS:
      return [
        {
          type: CORE_EVENT_IDS.DECISION_COMMITTED,
          payload: {
            projectId: text(payload?.projectId),
            decisionKind: 'observation.suppress',
            decisionId: text(payload?.suppressionId) || text(payload?.observationId) || text(payload?.mentionId),
            subjectId: text(payload?.entityId),
          },
        },
        ...projectionInvalidated(payload, 'atlasDecisionCommitted', ['atlas']),
      ];
    case CORE_REDUCER_COMMANDS.ATLAS_ENTITY_MERGE:
      return [
        {
          type: CORE_EVENT_IDS.ENTITY_MERGED,
          payload: {
            projectId: text(payload?.projectId),
            sourceEntityId: text(payload?.sourceEntityId),
            targetEntityId: text(payload?.targetEntityId),
            operationId: text(payload?.operationId) || `atlas-entity-merge:${hashCanonicalValue({
              projectId: text(payload?.projectId),
              sourceEntityId: text(payload?.sourceEntityId),
              targetEntityId: text(payload?.targetEntityId),
            })}`,
          },
        },
        ...projectionInvalidated(payload, 'atlasEntityMerged', ['atlas', 'manualMap', 'plot', 'idea', 'meaning']),
      ];
    case CORE_REDUCER_COMMANDS.ATLAS_ENTITY_SPLIT_RESTORE:
      return [
        {
          type: CORE_EVENT_IDS.ENTITY_SPLIT,
          payload: {
            projectId: text(payload?.projectId),
            operationId: text(payload?.operationId),
            restoreOperationId: text(payload?.restoreOperationId) || `atlas-entity-split-restore:${hashCanonicalValue({
              projectId: text(payload?.projectId),
              operationId: text(payload?.operationId),
            })}`,
          },
        },
        ...projectionInvalidated(payload, 'atlasEntitySplit', ['atlas', 'manualMap', 'plot', 'idea', 'meaning']),
      ];
    case CORE_REDUCER_COMMANDS.ATLAS_OBSERVATION_REASSIGN:
      return [
        {
          type: CORE_EVENT_IDS.DECISION_COMMITTED,
          payload: {
            projectId: text(payload?.projectId),
            decisionKind: 'observation.reassign',
            decisionId: text(payload?.reassignmentId) || text(payload?.observationId) || text(payload?.mentionId),
            subjectId: text(payload?.targetEntityId),
          },
        },
        ...projectionInvalidated(payload, 'atlasDecisionCommitted', ['atlas']),
      ];
    case CORE_REDUCER_COMMANDS.ATLAS_EVIDENCE_REATTACH:
      return [
        {
          type: CORE_EVENT_IDS.DECISION_COMMITTED,
          payload: {
            projectId: text(payload?.projectId),
            decisionKind: 'evidence.reattach',
            decisionId: text(payload?.reattachmentId) || text(payload?.sourceRecordId),
            subjectId: text(payload?.sourceRecordId),
          },
        },
        ...projectionInvalidated(payload, 'atlasEvidenceReattached', ['atlas']),
      ];
    case CORE_REDUCER_COMMANDS.ATLAS_SAVED_QUERY_SAVE:
      return projectionInvalidated(payload, 'atlasSavedQueryChanged', ['atlas']);
    case CORE_REDUCER_COMMANDS.ATLAS_LANGUAGE_TAG_SET:
    case CORE_REDUCER_COMMANDS.ATLAS_LANGUAGE_TAG_CLEAR:
      return [
        {
          type: CORE_EVENT_IDS.LANGUAGE_CAPABILITY_CHANGED,
          payload: {
            projectId: text(payload?.projectId),
            scopeKind: text(payload?.scopeKind || payload?.scope),
            tagId: text(payload?.tagId) || inferredLanguageTagId(payload),
            changeKind: commandType === CORE_REDUCER_COMMANDS.ATLAS_LANGUAGE_TAG_SET ? 'set' : 'cleared',
          },
        },
        ...projectionInvalidated(payload, 'languageCapabilityChanged', ['atlas', 'timeline', 'continuity']),
      ];
    case CORE_REDUCER_COMMANDS.ATLAS_SERIES_PORTABILITY_APPLY:
      return [
        {
          type: CORE_EVENT_IDS.MIGRATION_COMMITTED,
          payload: {
            projectId: text(payload?.projectId || payload?.previewPlan?.projectId),
            migrationId: text(payload?.operationId || payload?.previewPlan?.operationId)
              || `atlas-series-portability:${text(payload?.previewHash || payload?.expectedPreviewHash)}`,
            sourceSchemaVersion: 'atlas.author.v1',
            targetSchemaVersion: 'atlas.author.v1',
          },
        },
        ...projectionInvalidated({ projectId: text(payload?.projectId || payload?.previewPlan?.projectId) }, 'atlasSeriesPortabilityApplied', ['atlas']),
      ];
    case CORE_REDUCER_COMMANDS.ATLAS_SERIES_PORTABILITY_ROLLBACK:
      return [
        {
          type: CORE_EVENT_IDS.MIGRATION_ROLLED_BACK,
          payload: {
            projectId: text(payload?.projectId),
            migrationId: text(payload?.operationId),
            rollbackOperationId: text(payload?.rollbackOperationId) || `atlas-series-portability-rollback:${hashCanonicalValue({
              projectId: text(payload?.projectId),
              operationId: text(payload?.operationId),
            })}`,
          },
        },
        ...projectionInvalidated(payload, 'atlasSeriesPortabilityRolledBack', ['atlas']),
      ];
    case CORE_REDUCER_COMMANDS.ATLAS_CALENDAR_DEFINE:
      return [
        {
          type: CORE_EVENT_IDS.CALENDAR_CHANGED,
          payload: {
            projectId: text(payload?.projectId),
            calendarId: text(payload?.calendarId),
            changeKind: 'defined',
          },
        },
        ...projectionInvalidated(payload, 'atlasCalendarChanged', ['timeline', 'continuity']),
      ];
    case CORE_REDUCER_COMMANDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET:
      return [
        {
          type: CORE_EVENT_IDS.TIME_RANGE_CHANGED,
          payload: {
            projectId: text(payload?.projectId),
            sceneId: text(payload?.sceneId),
            anchorId: text(payload?.anchorId) || `atlas-scene-temporal-anchor:${hashCanonicalValue({
              projectId: text(payload?.projectId),
              sceneId: text(payload?.sceneId),
            })}`,
            changeKind: 'set',
          },
        },
        ...projectionInvalidated(payload, 'atlasTimeRangeChanged', ['timeline', 'continuity']),
      ];
    case CORE_REDUCER_COMMANDS.ATLAS_CONTINUITY_FACT_RECORD:
      return [
        {
          type: CORE_EVENT_IDS.CONTINUITY_DECISION_COMMITTED,
          payload: {
            projectId: text(payload?.projectId),
            ledgerKind: text(payload?.ledgerKind),
            factId: text(payload?.factId) || `atlas-continuity-fact:${hashCanonicalValue({
              projectId: text(payload?.projectId),
              ledgerKind: text(payload?.ledgerKind),
              sceneId: text(payload?.sceneId),
              subjectEntityId: text(payload?.subjectEntityId || payload?.entityId),
              factLabel: text(payload?.factLabel || payload?.label),
            })}`,
            subjectEntityId: text(payload?.subjectEntityId || payload?.entityId),
          },
        },
        ...projectionInvalidated(payload, 'atlasContinuityDecisionCommitted', ['continuity']),
      ];
    case CORE_REDUCER_COMMANDS.IDEA_CREATE:
    case CORE_REDUCER_COMMANDS.IDEA_ORIGIN_LINK_ADD:
    case CORE_REDUCER_COMMANDS.MEANING_PROMOTE:
      return projectionInvalidated(payload, 'semanticAuthorProjectionChanged', ['plot', 'idea', 'meaning']);
    case CORE_REDUCER_COMMANDS.MANUAL_MAP_CREATE:
      return [
        ...mapChanged(payload, 'created'),
        ...projectionInvalidated(payload, 'manualMapChanged', ['manualMap']),
      ];
    case CORE_REDUCER_COMMANDS.MANUAL_MAP_NODE_ADD:
      return [
        ...mapChanged(payload, 'nodeAdded'),
        ...mapNodePromotion(payload),
        ...projectionInvalidated(payload, 'manualMapChanged', ['manualMap']),
      ];
    case CORE_REDUCER_COMMANDS.MANUAL_MAP_NODE_UPDATE:
      return [
        ...mapChanged(payload, 'nodeUpdated'),
        ...mapNodePromotion(payload),
        ...projectionInvalidated(payload, 'manualMapChanged', ['manualMap']),
      ];
    case CORE_REDUCER_COMMANDS.MANUAL_MAP_NODE_DELETE:
      return [
        ...mapChanged(payload, 'nodeDeleted'),
        ...projectionInvalidated(payload, 'manualMapChanged', ['manualMap']),
      ];
    case CORE_REDUCER_COMMANDS.MANUAL_MAP_EDGE_ADD:
      return [
        ...mapChanged(payload, 'edgeAdded'),
        ...projectionInvalidated(payload, 'manualMapChanged', ['manualMap']),
      ];
    case CORE_REDUCER_COMMANDS.MANUAL_MAP_EDGE_UPDATE:
      return [
        ...mapChanged(payload, 'edgeUpdated'),
        ...projectionInvalidated(payload, 'manualMapChanged', ['manualMap']),
      ];
    case CORE_REDUCER_COMMANDS.MANUAL_MAP_EDGE_DELETE:
      return [
        ...mapChanged(payload, 'edgeDeleted'),
        ...projectionInvalidated(payload, 'manualMapChanged', ['manualMap']),
      ];
    case CORE_REDUCER_COMMANDS.MANUAL_MAP_GROUP_CREATE:
      return [
        ...mapChanged(payload, 'groupCreated'),
        ...projectionInvalidated(payload, 'manualMapChanged', ['manualMap']),
      ];
    case CORE_REDUCER_COMMANDS.MANUAL_MAP_GROUP_UPDATE:
      return [
        ...mapChanged(payload, 'groupUpdated'),
        ...projectionInvalidated(payload, 'manualMapChanged', ['manualMap']),
      ];
    case CORE_REDUCER_COMMANDS.MANUAL_MAP_GROUP_DELETE:
      return [
        ...mapChanged(payload, 'groupDeleted'),
        ...projectionInvalidated(payload, 'manualMapChanged', ['manualMap']),
      ];
    case CORE_REDUCER_COMMANDS.MANUAL_MAP_ATTACHMENT_ADD:
      return [
        ...mapChanged(payload, 'attachmentAdded'),
        ...projectionInvalidated(payload, 'manualMapChanged', ['manualMap']),
      ];
    case CORE_REDUCER_COMMANDS.MANUAL_MAP_PORTAL_ADD:
      return [
        ...mapChanged(payload, 'portalAdded'),
        ...projectionInvalidated(payload, 'manualMapChanged', ['manualMap']),
      ];
    case CORE_REDUCER_COMMANDS.MANUAL_MAP_TEMPLATE_APPLY:
      return [
        ...mapChanged(payload, 'templateApplied'),
        ...projectionInvalidated(payload, 'manualMapChanged', ['manualMap']),
      ];
    default:
      return [];
  }
}

export function emitCoreDomainEventsForCommandResult({
  previousState,
  previousStateHash,
  command,
  result,
  nextStateHash,
}) {
  if (!result?.ok || !isObjectRecord(command)) return [];
  const commandType = text(command.type);
  const payload = isObjectRecord(command.payload) ? command.payload : {};
  const commandSeq = Number(result?.state?.data?.lastCommandId);
  if (!Number.isSafeInteger(commandSeq) || commandSeq < 1) return [];
  const previousHash = normalizeHashInput(previousStateHash, previousState);
  const nextHash = normalizeHashInput(nextStateHash || result?.stateHash, result?.state);
  return commandFacts(commandType, payload)
    .filter((candidate) => isCoreDomainEventType(candidate.type))
    .map((candidate) => eventFor({
      type: candidate.type,
      payload: candidate.payload,
      command,
      commandSeq,
      previousStateHash: previousHash,
      nextStateHash: nextHash,
    }));
}
