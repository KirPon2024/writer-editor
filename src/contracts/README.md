# Contracts (Source of Truth)

## Purpose
`src/contracts/*` is the single source of truth for **public contracts** (types/shapes) shared across layers.

Feature boundaries and port families follow
`YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md`.

## Rules
- Public contracts MUST live in `src/contracts/*`.
- CORE may depend on `src/contracts/*`.
- `src/contracts/*` MUST NOT depend on CORE (`src/core/*`) or any platform/runtime code.
- No side effects, no runtime logic: contracts are types/shapes only.
- Product ports and Design OS ports MUST declare authority and direction and
  MUST NOT share an ambiguous generic persistence or projection name.
- Command catalog contracts are read-only; dispatch contracts carry intent
  only and do not implement command authority.
- Projection shapes bind identity and revision when their data can become
  stale asynchronously.

## Scope
- Public, stable shapes: commands/events/state snapshots/IO request-response shapes.
- Platform adapters implement behavior elsewhere; contracts only define expectations.

## Notes
- CORE-internal helper types may exist in `src/core/*`, but are not considered public contracts.
- Moving existing shapes into `src/contracts/*` is a separate, explicit task.

## Naming
- Public contract files MUST be named `*.contract.ts`.

## Export surface
- Every public contract MUST be re-exported from `src/contracts/index.ts`.
- `src/contracts/index.ts` MUST remain free of runtime logic.

## Representative current contracts
- `core-command.contract.ts`
- `core-event.contract.ts`
- `core-state.contract.ts`
- `scene-document.contract.ts`
- `scene-block.contract.ts`
- `scene-inline-range.contract.ts`
- `scene.contract.ts`
- `longform-project.contract.ts`
- `block.contract.ts`
- `inline-range.contract.ts`
- `runtime` barrel with:
  - `runtime-execution.contract.ts`
  - `runtime-effects.contract.ts`
  - `runtime-queue.contract.ts`
  - `runtime-trace.contract.ts`

## Out of minimal root barrel
- `dialog-port.contract.ts`
- `filesystem-port.contract.ts`
- `platform-info-port.contract.ts`

This list is navigational, not a completeness claim. The barrel and current
tree remain the factual export surface.
