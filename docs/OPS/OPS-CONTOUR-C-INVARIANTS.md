# OPS-CONTOUR-C-INVARIANTS — Phase 1 (docs-only)

## STATUS
Draft invariant list for CONTOUR-C Phase 1.

## DEPENDS ON
- `docs/OPS/CONTOUR-C-SCOPE.md`
- `docs/OPS/OPS-RUNTIME-GLOSSARY.md`

## INVARIANTS (DECLARATIVE)
The items below describe runtime properties that are used as shared vocabulary for design and review. This file does not define checks, identifiers, or inventory rules.

- SINGLE_WRITER_PER_ORDERING_KEY
  - Description: within one orderingKey lane there is one active execution stream at a time.
  - Failure shape: concurrent execution for the same orderingKey produces ordering-dependent divergence.

- DETERMINISTIC_ORDERING_PER_ORDERING_KEY
  - Description: given identical inputs, orderingKey, and runtime policy configuration, the observed order is stable.
  - Failure shape: replay with the same inputs yields different trace order or different outcomes.

- NO_BYPASS_CORE
  - Description: domain state changes are explained by Core transitions rather than direct runtime mutation.
  - Failure shape: state changes appear without a corresponding Core transition boundary event.

- NO_CONCURRENT_CORE_APPLY_PER_ORDERING_KEY
  - Description: Core transition apply work is serialized per orderingKey lane.
  - Failure shape: concurrent Core apply for one orderingKey leads to conflicting updates or order-dependent results.

- EFFECT_ATTEMPT_ACCOUNTING
  - Description: effect work is represented as attempts with a terminal outcome classification.
  - Failure shape: an effect executes with missing attempt tracking or missing terminal outcome.

- OVERFLOW_OUTCOME_IS_EXPLICIT
  - Description: overflow and backpressure outcomes are visible and explicit in runtime diagnostics.
  - Failure shape: work is silently dropped or outcomes are ambiguous under overflow.

- TRACEABILITY_OF_OUTCOMES
  - Description: runtime outcomes can be reconstructed from structured trace/diagnostics without UI dependency.
  - Failure shape: outcomes exist but the supporting trace records are incomplete or not replay-friendly.

## OUT OF SCOPE
- UI and UX behavior.
- Public contract evolution beyond future runtime contract work.
- Storage evolution beyond declared inventories.
