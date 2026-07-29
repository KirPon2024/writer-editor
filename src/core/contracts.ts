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
}

export type AtlasAuthorDataState = {
  schemaVersion: "atlas.author.v1"
  entities: Record<string, AtlasEntityState>
}

export type CoreProjectState = {
  id: string
  title: string
  atlas?: AtlasAuthorDataState
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
