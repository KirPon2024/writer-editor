
# CONTOUR-C — Scope (Runtime Execution & Causality)

## STATUS
Draft scope note for CONTOUR-C Phase 1.

## DEFINITIONS
Runtime execution: the runtime layer that schedules and runs command and effect work, producing observable outcomes and structured diagnostics without UI dependency.
Causality: ordering rules that define which runtime-visible outcomes can follow which inputs for a given orderingKey.
orderingKey: a stable key that defines a single-writer execution lane for causality and ordering.
effect: an external action invoked by runtime as part of executing a command outcome.
attempt: one try of running an effect, tracked by a monotonically increasing counter starting at 1.
backpressure: runtime behavior that limits work in flight via queue capacity rules.
overflow outcome: an explicit result when a queue cannot accept more work (for example: reject, drop, or degrade with diagnostics).

## IN SCOPE
- Queue ordering within one orderingKey lane.
- Overflow and backpressure outcomes for runtime queues.
- Effect attempt accounting and terminal outcomes (success | failure | abandoned).
- Structured trace/diagnostics emission that is usable headless and replay-friendly.
- Runtime boundary between Core transitions and external effects.

## OUT OF SCOPE
- UI logic and UX rules.
- Public API changes and schema evolution not tied to runtime execution semantics.
- Storage format evolution beyond already declared inventories.
- Editor behavior changes (IME, undo, rendering).
- Feature work unrelated to runtime execution, ordering, and outcomes.

## NON-GOALS
- Runtime implementation details.
- Platform-specific APIs and integrations.
- Roadmap commitments beyond the scope above.
