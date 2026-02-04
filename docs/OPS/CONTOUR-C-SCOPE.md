
# CONTOUR-C — Runtime Execution & Causality

## STATUS
- Mode: TRANSITIONAL
- Depends on: OPS_CANON v1.2 (FROZEN marker present)
- Governance changes: FORBIDDEN in v1.2; allowed only via OPS_CANON v1.3+ pack
- UI / UX: OUT OF SCOPE

## DEFINITIONS
Runtime Execution: deterministic runtime layer that schedules and executes commands and effects, producing checkable outcomes and diagnostics without UI dependency.
Causality: deterministic ordering rules that define which runtime-visible outcomes can follow which inputs for a given orderingKey.
orderingKey: stable key that defines a single-writer execution lane for causality and deterministic ordering.
effect: external action requested by runtime as part of command execution, expressed as a typed intent and executed outside Core policy.
attempt: single execution try of an effect, identified by a monotonically increasing counter starting at 1.
backpressure: deterministic runtime behavior that limits work-in-flight and defines what happens when queues reach capacity.
overflow outcome: deterministic and explicit result when a queue cannot accept more work (reject, drop, or degrade with diagnostics).

## IN SCOPE
- Deterministic queue ordering per orderingKey.
- Deterministic overflow outcomes.
- Effect attempt accounting and terminal statuses (success | failure | abandoned).
- Structured trace/diagnostics emission (headless, replayable).
- no-bypass-Core runtime boundary: runtime invokes Core transitions; runtime does not mutate domain state directly.

## OUT OF SCOPE
- UI logic and UX rules.
- Public contracts/schema evolution not explicitly introduced via OPS_CANON v1.3+ pack.
- Storage format evolution beyond declared inventories.
- Editor behavior changes (IME/undo and related).
- Feature work unrelated to runtime causality/execution.

## NON-GOALS
- Provide runtime implementation details.
- Define UI behaviors or user flows.
- Introduce new OPS governance rules or versions.
- Specify platform APIs, SDKs, or external services.
- Define roadmap commitments beyond runtime causality/execution scope.

## SUCCESS SIGNALS
- Phase 1 artifacts set is limited to:
- docs/OPS/CONTOUR-C-SCOPE.md
- docs/OPS/OPS-CONTOUR-C-INVARIANTS.md
- docs/OPS/OPS-RUNTIME-GLOSSARY.md
- docs/OPS/OPS-RUNTIME-TRACE-MIN-CANON.md
- docs/OPS/CONTOUR-C-IMPLEMENTATION-PLAN.md
- docs/OPS/CONTOUR-C-PHASE-1-INDEX.md
- This step changes only docs/OPS/CONTOUR-C-SCOPE.md (task allowlist).
- Runtime trace/diagnostics shapes are fixed in docs/OPS/OPS-RUNTIME-TRACE-MIN-CANON.md (Phase 1.4).

## BANNED LANGUAGE
- Forbidden tokens as standalone words: `may`, `should`, `could`, `prefer`, `ideally`.
