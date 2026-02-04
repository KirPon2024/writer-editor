# runtime-queue.contract (CANON)

## STATUS
STATUS: DRAFT

## SCOPE
This contract defines runtime execution queue semantics for CONTOUR-C: sequential execution per orderingKey, deterministic ordering, deterministic Overflow outcomes, and required diagnostics linkage.

## DEFINITIONS
- orderingKey: A key that partitions runtime execution into a single sequential stream.
- Single-writer: A rule that exactly one command execution is active per orderingKey at any point in time.
- Overflow: An outcome when queue capacity limits are reached under backpressure.
- Silent drop: A loss of work without an explicit outcome and without structured diagnostics.

## NORMATIVE REQUIREMENTS
- The queue MUST execute commands strictly sequentially per orderingKey (Single-writer per orderingKey).
- Parallel execution across different orderingKey values is allowed only when Single-writer per orderingKey remains true for each orderingKey.
- Ordering and all queue-visible outcomes MUST be Deterministic with respect to:
  - input commands or intents
  - orderingKey
  - runtime policy configuration
- Overflow and backpressure outcomes MUST be explicit outcomes from a fixed set defined by runtime policy, such as: reject, retry, drop, abandon.
- Silent drop MUST NOT exist.
- Any Overflow, reject, retry, drop, or abandon outcome MUST produce structured diagnostics compatible with the trace canon.

## POLICY LOCATORS (REPO-BACKED)
- Canonical queue policy inventory: docs/OPS/QUEUE_POLICIES.json
- Canonical contour invariants: docs/OPS/OPS-CONTOUR-C-INVARIANTS.md
- Canonical contour plan: docs/OPS/CONTOUR-C-IMPLEMENTATION-PLAN.md

## TRACE / DIAGNOSTICS LINKAGE
- Diagnostics MUST be representable as structured trace records aligned with: docs/CONTRACTS/runtime-trace.contract.md

## OUT OF SCOPE
- UI and UX rules
- Public contracts and schema evolution outside declared runtime contracts
- Storage format changes beyond declared inventories

## FINAL RULE
If any ambiguity or conflict is discovered → STOP.
