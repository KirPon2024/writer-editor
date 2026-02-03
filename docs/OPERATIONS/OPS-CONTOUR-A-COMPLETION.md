# CONTOUR-A Completion Marker

## Purpose
- Provide a single, unambiguous marker for when CONTOUR-A is considered closed.
- Keep the definition artifact/invariant-based to minimize interpretation drift.

## Scope
- Applies to CONTOUR-A only.
- Describes closure as a formal state, not as a plan.

## Preconditions
- Work has been executed under CONTOUR-A constraints.
- Active invariants are in effect for the scope.
- Required artifacts for traceability exist.

## Completion Criteria
- CORE_PURITY_NO_EFFECT_TOKENS is satisfied.
- CONTRACTS_EXPORT_SURFACE_COMPLETE is satisfied.
- SMOKE_A4_SCRIPT_AVAILABLE is satisfied.
- The stabilization record exists as an artifact in history.

## Signals of Closure
- [ ] Working tree is clean before verification.
- [ ] Baseline gate passes.
- [ ] Contracts export surface is complete.
- [ ] Smoke check passes on a clean tree.
- [ ] Closure is recorded in an executable, allowlist-bounded change.

## What Is Explicitly Out of Scope
- Platform specifics.
- Interface details.
- Future sequencing notes and roadmap planning.

