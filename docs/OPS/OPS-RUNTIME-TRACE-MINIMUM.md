VIEW_ONLY: CONTOUR_C_PHASE_1

# Runtime trace (minimum format)

This note describes a small, structured runtime trace format for two record types: `CommandTrace` and `EffectTrace`. The intent is to support replay-oriented testing and headless validation by recording ordering, outcomes, and error facts in a consistent shape.

## CommandTrace

Fields (minimum):
- `executionId`: string, non-empty
- `commandId`: string, non-empty
- `orderingKey`: string, non-empty
- `logicalTimestamp`: number or string; monotonic within one `orderingKey`
- `terminalStatus`: `success` | `failure` | `abandoned`
- `errorCode`: string; present when `terminalStatus` is `failure`
- `attemptCount`: integer, 1 or greater

## EffectTrace

Fields (minimum):
- `executionId`: string, non-empty
- `effectId`: string, non-empty
- `effectType`: string, non-empty
- `attempt`: integer, 1 or greater
- `orderingKey`: string, non-empty
- `logicalTimestamp`: same domain as `CommandTrace.logicalTimestamp`
- `terminalStatus`: `success` | `failure` | `abandoned`
- `errorCode`: string; present when `terminalStatus` is `failure`
- `idempotencyKey`: string; present for non-idempotent effects
- `retryable`: boolean; present when `terminalStatus` is `failure`

## logicalTimestamp notes

The `logicalTimestamp` field is an ordering token used for deterministic ordering of trace records.
- It is not wall-clock time.
- Monotonicity is defined within one `orderingKey`.
- Comparisons are meaningful only within the same `orderingKey`.
- The value domain is wide enough to express a deterministic order for records within one `orderingKey`.

## Diagnostics

Diagnostics refers to structured records such as `CommandTrace` and `EffectTrace` (and related structured diagnostic records). It is distinct from free-form logs.

## Trace sink / replay (future evidence locator)

Trace records can be written to a repository-backed sink to support tests and replay validation. A later inventory can reference a repo path locator such as `test/**` or `test/fixtures/**` where trace artifacts live for headless verification.

