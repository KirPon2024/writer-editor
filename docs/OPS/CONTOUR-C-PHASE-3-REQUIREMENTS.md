VIEW_ONLY: CONTOUR_C_PHASE_3

# Phase 3 wiring requirements (snapshot)
This document is a VIEW-only snapshot used to coordinate Phase 3 wiring work.

## Inputs (already present on main)
- `docs/OPS/CONTOUR-C-PHASE-3-PLAN.md`
- `scripts/doctor.mjs`
- `docs/OPS/INVENTORY_INDEX.json`
- `docs/OPS/INVARIANTS_REGISTRY.json`
- `docs/OPS/CONTOUR-C-ENFORCEMENT.json`
- `scripts/run-tests.js`

## Phase 3 wiring touchpoints (paths only)
- `scripts/doctor.mjs` (wiring outputs and tokens only; no schema redesign)
- `scripts/run-tests.js` (test wiring only)
- `docs/OPS/INVENTORY_INDEX.json`
- `docs/OPS/INVARIANTS_REGISTRY.json`
- `docs/OPS/CONTOUR-C-ENFORCEMENT.json`
- `docs/OPS/AUDIT_CHECKS.json` (only if needed by existing repo logic)

Phase 3 intends to connect existing checks to existing registry and enforcement entries; no new domains are introduced here.

## Acceptance signals (evidence-only)
- `npm test` stays green
- doctor strict baseline v1.3 stays green
- any Phase-3-specific doctor evidence lines (if they appear later) are printed deterministically

## Non-goals
- not defining enforcement semantics
- not changing truth-source artifacts
- not adding new checks in this step
