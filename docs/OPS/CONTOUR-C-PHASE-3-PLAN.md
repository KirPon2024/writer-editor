VIEW_ONLY: CONTOUR_C_PHASE_3

# Contour C — Phase 3 plan (doctor checks wiring)

Phase 1 is done (docs). Phase 2 is already landed (no diff). This document starts the Phase 3 plan.

## What Phase 3 will wire
- Doctor outputs for Contour-C invariants: per-invariant status summary.
- Visibility for placeholder and no_source: a warn-like signal described as part of the output.
- CheckId resolvability surfacing as part of the output.
- Exit threshold tracking for implemented runtime P0 invariants.

## Planned artifacts
- `docs/OPS/INVARIANTS_REGISTRY.json` (future: add or adjust Contour-C invariants metadata if needed)
- `docs/OPS/AUDIT_CHECKS.json` (future: checkId registration if introduced)
- `scripts/doctor.mjs` (future: add wiring for Contour-C checks summary)
- `test/**` (future: replay and evidence locators)

## Verification plan (commands)
- `npm test`
- `node scripts/doctor.mjs` (strict baseline v1.3 via environment variables)
- `git diff --name-only`

## Non-goals
- No changes to policies, inventories, or enforcement.
- No runtime changes.
- No new checks are introduced by this document.

