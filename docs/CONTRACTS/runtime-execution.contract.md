# runtime-execution.contract (CANON)

## STATUS
STATUS: DRAFT

## SCOPE
This contract defines runtime execution semantics for CONTOUR-C: execution lifecycle, boundary rules for Core transitions, single-writer per orderingKey linkage, determinism constraints, and required trace or diagnostics linkage.

## DEFINITIONS
- Execution: Runtime handling of one command through Core transitions and effect attempts until a terminalStatus is assigned.
- orderingKey: A key that partitions execution into a single sequential stream.
- Core transitions: Domain state changes produced by Core and invoked by runtime.
- No-bypass-Core: A boundary rule that prohibits runtime from mutating domain state directly and requires Core transitions for domain state changes.

## NORMATIVE REQUIREMENTS
- No-bypass-Core: Runtime MUST NOT bypass Core.
- Domain state changes MUST occur only via Core transitions invoked by runtime.
- For a single orderingKey, runtime MUST NOT execute concurrent apply of Core transitions.
- All runtime-visible decisions MUST be deterministic with respect to:
  - scenario inputs
  - orderingKey
  - runtime policy configuration

## EXECUTION LIFECYCLE
Execution MUST be representable as an ordered sequence:
- command accepted
- core transition applied
- effect attempts executed
- terminalStatus assigned

terminalStatus MUST be one of: success, failure, abandoned.
If terminalStatus=failure, errorCode MUST exist and be non-empty (see docs/CONTRACTS/runtime-trace.contract.md).

## BOUNDARY RULES
- Runtime MUST NOT mutate domain state directly.
- Core transitions MUST be the only mechanism for domain state changes.
- Single-writer per orderingKey is enforced by queue semantics in: docs/CONTRACTS/runtime-queue.contract.md.

## TRACE / DIAGNOSTICS LINKAGE
- Execution and effect attempts MUST be traceable using the canon shapes defined by:
  - docs/CONTRACTS/runtime-trace.contract.md
  - docs/CONTRACTS/runtime-effects.contract.md
- Canonical contour invariants are defined in: docs/OPS/OPS-CONTOUR-C-INVARIANTS.md.

## OUT OF SCOPE
- UI and UX rules
- Public contracts and schema evolution outside declared runtime contracts
- Storage format changes beyond declared inventories

## FINAL RULE
If any ambiguity or conflict is discovered → STOP.
