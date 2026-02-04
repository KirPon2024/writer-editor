# OPS-CONTOUR-C-INVARIANTS — v0 (DOCS-ONLY VIEW)

## STATUS
Mode: TRANSITIONAL
Governance: OPS_CANON v1.2 (FROZEN); v1.3+ required for new invariants/checkIds/inventories

## DEPENDS ON
- `docs/OPS/CONTOUR-C-SCOPE.md`

## DEFINITIONS (BOUNDARY TERMS)
Runtime: execution layer that schedules and performs command and effect execution as deterministic runtime behavior.
Core: decision layer that computes domain transitions from commands and returns updated domain state.
orderingKey: stable key that defines a single-writer runtime execution lane.
Command: request to Core to compute a domain transition.
Effect: external action invoked by runtime as part of executing a command outcome.
Backpressure: deterministic capacity and throttling behavior applied by runtime queues.
Overflow: explicit and deterministic outcome when a runtime queue cannot accept more work.

## INVARIANTS (DECLARATIVE)
- INV: SINGLE_WRITER_PER_ORDERING_KEY
  - Scope: runtime execution for a single orderingKey.
  - Violation: more than one concurrent execution stream runs for the same orderingKey.
  - Signal: non-deterministic outcomes or ordering-dependent divergence for identical inputs.
  - Enforcement (v1.3): placeholder initially.

- INV: DETERMINISTIC_QUEUE_ORDER
  - Scope: runtime queue ordering for a single orderingKey.
  - Violation: execution order differs for identical inputs, orderingKey, and policy configuration.
  - Signal: replay produces different traces or results with the same inputs.
  - Enforcement (v1.3): placeholder initially.

- INV: NO_BYPASS_CORE
  - Scope: runtime boundary between runtime execution and Core transitions.
  - Violation: runtime changes domain state without invoking Core transitions.
  - Signal: domain changes exist without a corresponding Core transition.
  - Enforcement (v1.3): placeholder initially.

- INV: NO_CONCURRENT_CORE_APPLY_SAME_KEY
  - Scope: Core transition apply for a single orderingKey.
  - Violation: Core transitions are applied concurrently for the same orderingKey.
  - Signal: ordering-dependent divergence or conflicting domain state updates.
  - Enforcement (v1.3): placeholder initially.

- INV: EFFECT_ATTEMPT_ACCOUNTING
  - Scope: effect execution attempts and outcomes.
  - Violation: effects execute without attempt accounting or without terminal status.
  - Signal: missing or ambiguous effect outcomes in diagnostics.
  - Enforcement (v1.3): placeholder initially.

- INV: OVERFLOW_OUTCOME_EXPLICIT
  - Scope: runtime queue overflow behavior.
  - Violation: overflow causes silent drops or non-explicit outcomes.
  - Signal: lost work without an explicit rejection, drop record, or degrade record.
  - Enforcement (v1.3): placeholder initially.

- INV: DIAGNOSTICS_ARE_STRUCTURED_TRACE
  - Scope: diagnostics for runtime execution outcomes.
  - Violation: diagnostics are only free-form logs or cannot be replayed headless.
  - Signal: inability to reconstruct deterministic execution traces without UI dependency.
  - Enforcement (v1.3): placeholder initially.

## OUT OF SCOPE
- UI/UX.
- Changes to public contracts/schemas outside future runtime contracts in Phase 4.
- Storage evolution beyond declared inventories.

## EVIDENCE RULE (FUTURE v1.3)
Evidence MUST be machine-checkable.
Evidence MUST have repo path locators (tests/fixtures/inventories).
No “exists in history” claims are allowed at exit.

## NOTES (NON-NORMATIVE)
This document defines a minimal declarative invariant set for CONTOUR-C Phase 1 and does not introduce new governance beyond OPS_CANON v1.2.

