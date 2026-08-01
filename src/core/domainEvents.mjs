import { canonicalSerialize, hashCanonicalValue } from './browser-safe-hash.mjs';

export const CORE_EVENT_SCHEMA_VERSION = 'core.event.v1';
export const CORE_EVENT_FACT_KIND = 'OBSERVED_FACT';

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
  [CORE_EVENT_IDS.PROJECTION_INVALIDATED]: 'coreReducer',
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

const PROJECTION_KINDS = Object.freeze([
  'atlas',
  'manualMap',
  'plot',
  'idea',
  'meaning',
  'timeline',
  'continuity',
]);

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(text).filter(Boolean))].sort();
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
    && Number.isSafeInteger(payload.sourceRevision),
  [CORE_EVENT_IDS.DERIVED_GENERATION_REJECTED_AS_STALE]: (payload) => requiredString(payload, 'projectId')
    && requiredString(payload, 'generationId')
    && requiredString(payload, 'projectionKind')
    && Number.isSafeInteger(payload.sourceRevision)
    && Number.isSafeInteger(payload.currentRevision),
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

function validateSourceBinding(sourceBinding) {
  return isObjectRecord(sourceBinding)
    && Object.values(CORE_EVENT_EMISSION_BOUNDARIES).includes(sourceBinding.boundary)
    && requiredString(sourceBinding, 'commandType')
    && Number.isSafeInteger(sourceBinding.commandSeq)
    && requiredString(sourceBinding, 'previousStateHash')
    && requiredString(sourceBinding, 'nextStateHash');
}

export function validateCoreDomainEvent(event) {
  if (!isObjectRecord(event)) return { ok: false, reason: 'EVENT_OBJECT_REQUIRED' };
  if (event.schemaVersion !== CORE_EVENT_SCHEMA_VERSION) return { ok: false, reason: 'EVENT_SCHEMA_VERSION_INVALID' };
  if (event.factKind !== CORE_EVENT_FACT_KIND) return { ok: false, reason: 'EVENT_FACT_KIND_INVALID' };
  if (!isCoreDomainEventType(event.type)) return { ok: false, reason: 'EVENT_TYPE_UNKNOWN' };
  if (!validateSourceBinding(event.sourceBinding)) return { ok: false, reason: 'EVENT_SOURCE_BINDING_INVALID' };
  if (!isObjectRecord(event.payload)) return { ok: false, reason: 'EVENT_PAYLOAD_OBJECT_REQUIRED' };
  const validatePayload = PAYLOAD_VALIDATORS[event.type];
  if (typeof validatePayload !== 'function' || !validatePayload(event.payload)) {
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
  return { ok: true, reason: '', event: parsed };
}

function sourceBindingFor({ type, command, commandSeq, previousState, result }) {
  return {
    boundary: CORE_EVENT_EMISSION_BOUNDARIES[type],
    commandType: text(command?.type),
    commandSeq,
    previousStateHash: hashCanonicalValue(previousState),
    nextStateHash: text(result?.stateHash) || hashCanonicalValue(result?.state),
  };
}

function eventFor({ type, payload, command, commandSeq, previousState, result }) {
  const event = {
    schemaVersion: CORE_EVENT_SCHEMA_VERSION,
    type,
    factKind: CORE_EVENT_FACT_KIND,
    sourceBinding: sourceBindingFor({ type, command, commandSeq, previousState, result }),
    payload,
  };
  const validation = validateCoreDomainEvent(event);
  if (!validation.ok) {
    throw new Error(`INVALID_CORE_DOMAIN_EVENT:${validation.reason}:${type}`);
  }
  return event;
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

export function emitCoreDomainEventsForCommandResult({ previousState, command, result }) {
  if (!result?.ok || !isObjectRecord(command)) return [];
  const commandType = text(command.type);
  const payload = isObjectRecord(command.payload) ? command.payload : {};
  const commandSeq = Number(result?.state?.data?.lastCommandId);
  if (!Number.isSafeInteger(commandSeq) || commandSeq < 1) return [];
  return commandFacts(commandType, payload)
    .filter((candidate) => isCoreDomainEventType(candidate.type))
    .map((candidate) => eventFor({
      type: candidate.type,
      payload: candidate.payload,
      command,
      commandSeq,
      previousState,
      result,
    }));
}
