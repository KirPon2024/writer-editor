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

export type CoreState = { version: string; data: Record<string, unknown>; };
export type CoreCommand = { type: string };
export type CoreEvent = { type: string };
