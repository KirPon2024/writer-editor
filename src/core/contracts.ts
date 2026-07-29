/**
 * CORE-INTERNAL CONTRACTS
 *
 * This file is CORE-internal only.
 * Public contracts (source of truth) live in: src/contracts/*
 *
 * Rules:
 * - Do NOT add new public shapes here.
 * - If a type/shape must be shared across layers, define it in src/contracts/* and re-export from src/contracts/index.ts.
 *
 *
 * Public contracts currently defined (source of truth):
 * - src/contracts/core-state.contract.ts  -> CoreStateSnapshot
 * - src/contracts/core-command.contract.ts -> CoreCommand
 * - src/contracts/core-event.contract.ts   -> CoreEvent
 *
 * Rule:
 * - Any new shared/public shape MUST be defined in src/contracts/* and re-exported from src/contracts/index.ts.
 *
 * Reference:
 * - docs/ADR/ADR-CONTRACTS-TOPOLOGY.md
 */

export type CoreSceneState = {
  id: string
  text: string
}

export type AtlasAliasState = {
  id: string
  value: string
  scope: "project" | "scene"
  sceneId: string
  createdByCommandSeq: number
}

export type AtlasEntityState = {
  id: string
  name: string
  entityKind: string
  aliases: Record<string, AtlasAliasState>
  createdByCommandSeq: number
  updatedByCommandSeq: number
  mergeState?: "ACTIVE" | "MERGED"
  mergedIntoEntityId?: string
  mergeOperationId?: string
  mergedByCommandSeq?: number
  mergedSourceEntityIds?: string[]
}

export type AtlasEvidenceAnchorState = {
  schemaVersion: string
  anchorId: string
  projectId: string
  sceneId: string
  entityId: string
  startOffset: number
  endOffset: number
  quote: string
  quoteHash: string
  sceneTextHash: string
}

export type AtlasDecisionState = {
  id: string
  decisionKind: "mention.confirm"
  trustState: "AUTHOR_CONFIRMED"
  projectId: string
  sceneId: string
  entityId: string
  mentionId: string
  evidenceAnchor: AtlasEvidenceAnchorState
  createdByCommandSeq: number
}

export type AtlasSuppressionState = {
  id: string
  suppressionKind: "observation.suppress"
  projectId: string
  sceneId: string
  entityId: string
  observationId: string
  mentionId: string
  reason: string
  evidenceAnchor: AtlasEvidenceAnchorState
  createdByCommandSeq: number
}

export type AtlasEntityMergeOperationState = {
  id: string
  operationKind: "entity.merge"
  projectId: string
  sourceEntityId: string
  targetEntityId: string
  reason: string
  beforeSourceEntity: AtlasEntityState
  beforeTargetEntity: AtlasEntityState
  afterSourceEntity: AtlasEntityState
  afterTargetEntity: AtlasEntityState
  createdByCommandSeq: number
  restoredByCommandSeq: number
  restoreOperationId: string
}

export type AtlasObservationReassignmentState = {
  id: string
  operationKind: "observation.reassign"
  projectId: string
  sceneId: string
  sourceEntityId: string
  targetEntityId: string
  observationId: string
  mentionId: string
  reason: string
  evidenceAnchor: AtlasEvidenceAnchorState
  createdByCommandSeq: number
}

export type AtlasAuthorDataState = {
  schemaVersion: "atlas.author.v1"
  entities: Record<string, AtlasEntityState>
  decisions?: Record<string, AtlasDecisionState>
  suppressions?: Record<string, AtlasSuppressionState>
  entityOperations?: Record<string, AtlasEntityMergeOperationState>
  reassignments?: Record<string, AtlasObservationReassignmentState>
}

export type ManualMapNodeState = {
  id: string
  label: string
  nodeKind: string
  position: { x: number; y: number }
  target: { kind: string; id: string }
  createdByCommandSeq: number
  updatedByCommandSeq: number
}

export type ManualMapEdgeState = {
  id: string
  fromNodeId: string
  toNodeId: string
  edgeKind: string
  label: string
  createdByCommandSeq: number
}

export type ManualMapState = {
  id: string
  title: string
  nodes: Record<string, ManualMapNodeState>
  edges: Record<string, ManualMapEdgeState>
  createdByCommandSeq: number
  updatedByCommandSeq: number
}

export type ManualMapAuthorDataState = {
  schemaVersion: "manualMap.author.v1"
  maps: Record<string, ManualMapState>
}

export type IdeaOriginRefState = {
  schemaVersion: "idea.originRef.v1"
  kind: string
  sceneId: string
  startOffset: number
  endOffset: number
  sourceHash: string
  targetId: string
}

export type IdeaOriginLinkState = {
  id: string
  ideaId: string
  originRef: IdeaOriginRefState
  createdByCommandSeq: number
}

export type IdeaState = {
  id: string
  title: string
  summary: string
  originLinkIds: string[]
  createdByCommandSeq: number
  updatedByCommandSeq: number
}

export type IdeaAuthorDataState = {
  schemaVersion: "idea.author.v1"
  ideas: Record<string, IdeaState>
  originLinks: Record<string, IdeaOriginLinkState>
}

export type MeaningPromotionSourceState =
  | { kind: "idea"; ideaId: string }
  | { kind: "sceneOriginRef"; originRef: IdeaOriginRefState }

export type MeaningState = {
  id: string
  title: string
  interpretation: string
  source: MeaningPromotionSourceState
  promotionKind: "explicitAuthorPromotion"
  createdByCommandSeq: number
  updatedByCommandSeq: number
}

export type MeaningAuthorDataState = {
  schemaVersion: "meaning.author.v1"
  meanings: Record<string, MeaningState>
}

export type CoreProjectState = {
  id: string
  title: string
  atlas?: AtlasAuthorDataState
  ideas?: IdeaAuthorDataState
  meanings?: MeaningAuthorDataState
  manualMaps?: ManualMapAuthorDataState
  scenes: Record<string, CoreSceneState>
}

export type CoreState = {
  version: number
  data: {
    projects: Record<string, CoreProjectState>
    lastCommandId: number
  }
}

export type CoreCommand =
  | {
      type: "project.create"
      payload: { projectId: string; title?: string; sceneId?: string }
    }
  | {
      type: "project.applyTextEdit"
      payload: { projectId: string; sceneId: string; text: string }
    }
  | {
      type: "atlas.entity.create"
      payload: { projectId: string; entityId: string; name: string; entityKind?: string }
    }
  | {
      type: "atlas.alias.add"
      payload: { projectId: string; entityId: string; aliasId: string; value: string; scope?: "project" | "scene"; sceneId?: string }
    }
  | {
      type: "atlas.mention.confirm"
      payload: { projectId: string; sceneId: string; entityId: string; mentionId: string; evidenceAnchor: AtlasEvidenceAnchorState; decisionId?: string }
    }
  | {
      type: "atlas.observation.suppress"
      payload: { projectId: string; sceneId: string; entityId: string; observationId?: string; mentionId?: string; evidenceAnchor: AtlasEvidenceAnchorState; suppressionId?: string; reason?: string }
    }
  | {
      type: "atlas.entity.merge"
      payload: { projectId: string; sourceEntityId: string; targetEntityId: string; operationId?: string; reason?: string; expectedSourceEntityHash?: string; expectedTargetEntityHash?: string }
    }
  | {
      type: "atlas.entity.splitRestore"
      payload: { projectId: string; operationId: string; restoreOperationId?: string }
    }
  | {
      type: "atlas.observation.reassign"
      payload: { projectId: string; sceneId: string; sourceEntityId: string; targetEntityId: string; observationId?: string; mentionId?: string; evidenceAnchor: AtlasEvidenceAnchorState; reassignmentId?: string; reason?: string; expectedSourceEntityHash?: string; expectedTargetEntityHash?: string }
    }
  | {
      type: "idea.create"
      payload: { projectId: string; ideaId: string; title: string; summary?: string }
    }
  | {
      type: "idea.originLink.add"
      payload: { projectId: string; ideaId: string; linkId?: string; originRef: IdeaOriginRefState }
    }
  | {
      type: "meaning.promote"
      payload: { projectId: string; meaningId: string; title: string; interpretation: string; source: MeaningPromotionSourceState }
    }
  | {
      type: "manualMap.create"
      payload: { projectId: string; mapId: string; title?: string }
    }
  | {
      type: "manualMap.node.add"
      payload: { projectId: string; mapId: string; nodeId: string; label: string; nodeKind?: string; position?: { x?: number; y?: number }; targetKind?: string; targetId?: string }
    }
  | {
      type: "manualMap.edge.add"
      payload: { projectId: string; mapId: string; edgeId: string; fromNodeId: string; toNodeId: string; edgeKind?: string; label?: string }
    }
  | {
      type: "manualMap.attachment.add"
      payload: { projectId: string; mapId: string; nodeId: string; attachmentId: string; label: string; attachmentKind?: string; source: { name?: string; mediaType?: string; sourceHash: string; byteLength?: number } }
    }
  | {
      type: "manualMap.portal.add"
      payload: { projectId: string; mapId: string; portalId: string; fromNodeId: string; targetMapId: string; targetNodeId?: string; label?: string }
    }
  | {
      type: "manualMap.template.apply"
      payload: { projectId: string; mapId: string; templateInstanceId: string; templateId: string; templateName?: string; nodes: Array<{ nodeId: string; label: string; nodeKind?: string; position?: { x?: number; y?: number }; targetKind?: string; targetId?: string }>; edges?: Array<{ edgeId: string; fromNodeId: string; toNodeId: string; edgeKind?: string; label?: string }> }
    }
  | {
      type: string
      payload?: Record<string, unknown>
    };

export type CoreTypedError = {
  code: string
  op: string
  reason: string
  details?: Record<string, unknown>
}

export type CoreReduceResult = {
  ok: boolean
  state: CoreState
  stateHash: string
  error?: CoreTypedError
}

export type CoreEvent = { type: string };
