# runtime-effects.contract.md

## STATUS
STATUS: DRAFT

## SCOPE
This contract defines the canonical requirements for runtime EffectTrace records: required fields, idempotency requirements for non-idempotent effects, and failure semantics.

## NON-GOALS
- Defining effect implementations or platform adapters
- Defining UI behavior or UI-facing error presentation
- Defining retry scheduling, backoff, or queue policies
- Defining how effectType values are enumerated or registered

## EFFECT TRACE FIELDS (CANON)
EffectTrace MUST include the following fields:
- `executionId`: string, non-empty
- `effectId`: string, non-empty
- `effectType`: string, non-empty
- `attempt`: integer, >= 1
- `orderingKey`: string, non-empty
- `logicalTimestamp`: number OR string; same domain as trace canon; MUST NOT be wall-clock; MUST be monotonic per `orderingKey`
- `terminalStatus`: one of `success`, `failure`, `abandoned`
- `errorCode`: string, non-empty; REQUIRED iff `terminalStatus=failure`
- `retryable`: boolean; REQUIRED iff `terminalStatus=failure`
- `idempotencyKey`: string, non-empty; REQUIRED for non-idempotent effects

## IDEMPOTENCY (NON-IDEMPOTENT EFFECTS)
- A non-idempotent effect MUST provide `idempotencyKey`.
- `idempotencyKey` MUST be stable across re-attempts for the same `(orderingKey, effectId)`.
- The uniqueness strategy for `idempotencyKey` is runtime-defined and MUST be deterministic.

## FAILURE SEMANTICS
- On failure, EffectTrace MUST set `terminalStatus=failure` and MUST include `errorCode` (non-empty) and `retryable` (boolean).
- If `terminalStatus=abandoned`, EffectTrace MUST NOT include `errorCode` and MUST NOT include `retryable`.

## EVIDENCE / REFERENCES
CANON_TRACE: docs/OPS/OPS-RUNTIME-TRACE-MIN-CANON.md

## FINAL RULE
If any ambiguity or conflict is discovered → STOP.
