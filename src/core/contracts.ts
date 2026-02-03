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
 * Reference:
 * - docs/ADR/ADR-CONTRACTS-TOPOLOGY.md
 */

export type CoreState = { version: string; data: Record<string, unknown>; };
export type CoreCommand = { type: string };
export type CoreEvent = { type: string };
