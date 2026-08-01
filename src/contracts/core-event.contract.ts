export type CoreEventSchemaVersion = "core.event.v1"
export type CoreEventFactKind = "OBSERVED_FACT"

export type CoreEventSourceBinding = {
  boundary:
    | "coreReducer"
    | "sceneOrderProjection"
    | "manualMapPromotionCommand"
    | "derivedProjectionWorker"
    | "migrationPreviewAdapter"
  commandType: string
  commandSeq: number
  previousStateHash: string
  nextStateHash: string
}

export type SceneChangedEvent = {
  schemaVersion: CoreEventSchemaVersion
  type: "SceneChanged"
  factKind: CoreEventFactKind
  sourceBinding: CoreEventSourceBinding
  payload: {
    projectId: string
    sceneId: string
    changeKind: "created" | "textEdited" | "imported" | "reordered"
  }
}

export type SceneOrderChangedEvent = {
  schemaVersion: CoreEventSchemaVersion
  type: "SceneOrderChanged"
  factKind: CoreEventFactKind
  sourceBinding: CoreEventSourceBinding
  payload: {
    projectId: string
    sceneIds: string[]
    changeKind: "reordered"
  }
}

export type EntityCreatedEvent = {
  schemaVersion: CoreEventSchemaVersion
  type: "EntityCreated"
  factKind: CoreEventFactKind
  sourceBinding: CoreEventSourceBinding
  payload: {
    projectId: string
    entityId: string
    entityKind: string
    name: string
  }
}

export type EntityMergedEvent = {
  schemaVersion: CoreEventSchemaVersion
  type: "EntityMerged"
  factKind: CoreEventFactKind
  sourceBinding: CoreEventSourceBinding
  payload: {
    projectId: string
    sourceEntityId: string
    targetEntityId: string
    operationId: string
  }
}

export type EntitySplitEvent = {
  schemaVersion: CoreEventSchemaVersion
  type: "EntitySplit"
  factKind: CoreEventFactKind
  sourceBinding: CoreEventSourceBinding
  payload: {
    projectId: string
    operationId: string
    restoreOperationId: string
  }
}

export type AliasChangedEvent = {
  schemaVersion: CoreEventSchemaVersion
  type: "AliasChanged"
  factKind: CoreEventFactKind
  sourceBinding: CoreEventSourceBinding
  payload: {
    projectId: string
    entityId: string
    aliasId: string
    changeKind: "added" | "updated" | "removed"
  }
}

export type MapChangedEvent = {
  schemaVersion: CoreEventSchemaVersion
  type: "MapChanged"
  factKind: CoreEventFactKind
  sourceBinding: CoreEventSourceBinding
  payload: {
    projectId: string
    mapId: string
    changeKind: string
  }
}

export type MapNodePromotedEvent = {
  schemaVersion: CoreEventSchemaVersion
  type: "MapNodePromoted"
  factKind: CoreEventFactKind
  sourceBinding: CoreEventSourceBinding
  payload: {
    projectId: string
    mapId: string
    nodeId: string
    targetKind: string
    targetId: string
    promotionKind: "explicitAuthorPromotion"
  }
}

export type DecisionCommittedEvent = {
  schemaVersion: CoreEventSchemaVersion
  type: "DecisionCommitted"
  factKind: CoreEventFactKind
  sourceBinding: CoreEventSourceBinding
  payload: {
    projectId: string
    decisionKind: string
    decisionId: string
    subjectId: string
  }
}

export type CalendarChangedEvent = {
  schemaVersion: CoreEventSchemaVersion
  type: "CalendarChanged"
  factKind: CoreEventFactKind
  sourceBinding: CoreEventSourceBinding
  payload: {
    projectId: string
    calendarId: string
    changeKind: "defined" | "updated"
  }
}

export type TimeRangeChangedEvent = {
  schemaVersion: CoreEventSchemaVersion
  type: "TimeRangeChanged"
  factKind: CoreEventFactKind
  sourceBinding: CoreEventSourceBinding
  payload: {
    projectId: string
    sceneId: string
    anchorId: string
    changeKind: "set" | "updated"
  }
}

export type ContinuityDecisionCommittedEvent = {
  schemaVersion: CoreEventSchemaVersion
  type: "ContinuityDecisionCommitted"
  factKind: CoreEventFactKind
  sourceBinding: CoreEventSourceBinding
  payload: {
    projectId: string
    ledgerKind: string
    factId: string
    subjectEntityId: string
  }
}

export type ProjectionInvalidatedEvent = {
  schemaVersion: CoreEventSchemaVersion
  type: "ProjectionInvalidated"
  factKind: CoreEventFactKind
  sourceBinding: CoreEventSourceBinding
  payload: {
    projectId: string
    projectionKinds: string[]
    reason: string
  }
}

export type DerivedGenerationPublishedEvent = {
  schemaVersion: CoreEventSchemaVersion
  type: "DerivedGenerationPublished"
  factKind: CoreEventFactKind
  sourceBinding: CoreEventSourceBinding
  payload: {
    projectId: string
    generationId: string
    projectionKind: string
    sourceRevision: number
  }
}

export type DerivedGenerationRejectedAsStaleEvent = {
  schemaVersion: CoreEventSchemaVersion
  type: "DerivedGenerationRejectedAsStale"
  factKind: CoreEventFactKind
  sourceBinding: CoreEventSourceBinding
  payload: {
    projectId: string
    generationId: string
    projectionKind: string
    sourceRevision: number
    currentRevision: number
  }
}

export type LanguageCapabilityChangedEvent = {
  schemaVersion: CoreEventSchemaVersion
  type: "LanguageCapabilityChanged"
  factKind: CoreEventFactKind
  sourceBinding: CoreEventSourceBinding
  payload: {
    projectId: string
    scopeKind: string
    tagId: string
    changeKind: "set" | "cleared"
  }
}

export type MigrationPreparedEvent = {
  schemaVersion: CoreEventSchemaVersion
  type: "MigrationPrepared"
  factKind: CoreEventFactKind
  sourceBinding: CoreEventSourceBinding
  payload: {
    projectId: string
    migrationId: string
    sourceSchemaVersion: string
    targetSchemaVersion: string
  }
}

export type MigrationCommittedEvent = {
  schemaVersion: CoreEventSchemaVersion
  type: "MigrationCommitted"
  factKind: CoreEventFactKind
  sourceBinding: CoreEventSourceBinding
  payload: {
    projectId: string
    migrationId: string
    sourceSchemaVersion: string
    targetSchemaVersion: string
  }
}

export type MigrationRolledBackEvent = {
  schemaVersion: CoreEventSchemaVersion
  type: "MigrationRolledBack"
  factKind: CoreEventFactKind
  sourceBinding: CoreEventSourceBinding
  payload: {
    projectId: string
    migrationId: string
    rollbackOperationId: string
  }
}

export type CoreEvent =
  | SceneChangedEvent
  | SceneOrderChangedEvent
  | EntityCreatedEvent
  | EntityMergedEvent
  | EntitySplitEvent
  | AliasChangedEvent
  | MapChangedEvent
  | MapNodePromotedEvent
  | DecisionCommittedEvent
  | CalendarChangedEvent
  | TimeRangeChangedEvent
  | ContinuityDecisionCommittedEvent
  | ProjectionInvalidatedEvent
  | DerivedGenerationPublishedEvent
  | DerivedGenerationRejectedAsStaleEvent
  | LanguageCapabilityChangedEvent
  | MigrationPreparedEvent
  | MigrationCommittedEvent
  | MigrationRolledBackEvent
