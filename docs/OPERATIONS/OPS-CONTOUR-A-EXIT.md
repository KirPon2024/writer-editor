# CONTOUR-A Exit Criteria

NOTE: This document is a VIEW / historical artifact. Source of truth for invariants MUST be `docs/OPS/INVARIANTS_REGISTRY.json`. Debt MUST be sourced only from `docs/OPS/DEBT_REGISTRY.json`. Resolvable `checkId` tokens MUST be sourced only from `docs/OPS/AUDIT_CHECKS.json`.

## Purpose
- Capture a shared, checkable understanding of what “exit from CONTOUR-A” means.
- Reduce drift by keeping exit conditions explicit and stable.

## Scope
- Applies to work scoped to CONTOUR-A.
- Describes criteria and state flags only.

## Active Invariants
- CORE_PURITY_NO_EFFECT_TOKENS
- SMOKE_A4_SCRIPT_AVAILABLE

## Required Artifacts
- A complete public contracts export surface.
- A repeatable smoke check covering the contour baseline.
- A documented record of the chosen contracts topology.

## Forbidden Changes
- Introducing platform-facing behavior into CORE.
- Allowing contract shapes to drift without a single export surface.
- Treating non-executable roadmap notes as executable constraints.

## Exit Signals
- [ ] Worktree is clean before execution steps.
- [ ] Baseline ops-gate passes.
- [ ] Public contracts export surface is complete.
- [ ] Smoke check passes on a clean tree.
- [ ] Traceability record exists for the stabilization outcome.

## Non-Goals
- This document does not define implementation steps.
- This document does not prescribe release mechanics.
- This document does not introduce new invariants.
