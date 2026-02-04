# runtime-trace.contract (v1)

## STATUS
- Mode: TRANSITIONAL
- Source canon: `docs/OPS/OPS-RUNTIME-TRACE-MIN-CANON.md`

## SCOPE
This contract defines the canonical runtime trace record shapes used for headless diagnostics and replayable validation.

## DEFINITIONS
- CommandTrace: a structured record that represents the execution lifecycle of a command.
- EffectTrace: a structured record that represents an execution attempt of an effect.
- Diagnostics: structured trace records (CommandTrace/EffectTrace and related structured diagnostic records), not free-form logs.

## COMMANDTRACE (CANON SHAPE)
CommandTrace MUST include the following fields:
- `executionId` (string, non-empty)
- `commandId` (string, non-empty)
- `orderingKey` (string, non-empty)
- `logicalTimestamp` (number OR string)
- `terminalStatus` (`success` | `failure` | `abandoned`)
- `errorCode` (string; REQUIRED when `terminalStatus=failure`)
- `attemptCount` (integer >= 1)

## EFFECTTRACE (CANON SHAPE)
EffectTrace MUST include the following fields:
- `executionId` (string, non-empty)
- `effectId` (string, non-empty)
- `effectType` (string, non-empty)
- `attempt` (integer >= 1)
- `orderingKey` (string, non-empty)
- `logicalTimestamp` (same domain as CommandTrace)
- `terminalStatus` (`success` | `failure` | `abandoned`)
- `errorCode` (string; REQUIRED when `terminalStatus=failure`)
- `idempotencyKey` (string; REQUIRED for non-idempotent effects)
- `retryable` (boolean; REQUIRED when `terminalStatus=failure`)

## LOGICALTIMESTAMP RULES
- MUST NOT be wall-clock time.
- MUST be monotonic within a single `orderingKey`.
- MUST NOT be globally compared across different `orderingKey`.
- MUST be sufficient to deterministically order trace records for a given `orderingKey`.

## DIAGNOSTICS DEFINITION
- “Diagnostics” = structured trace records (CommandTrace/EffectTrace and related structured diagnostic records), not free-form logs.

## TRACE SINK (EVIDENCE LOCATOR)
EVIDENCE_PATH: test/fixtures/runtime/trace/

Trace sink is a repo-backed locator used as an evidence anchor for headless validation of trace records.

## NON-GOALS
- UI/UX behavior
- Public contract versioning beyond this contract
- Storage format evolution beyond declared inventories
- Non-runtime feature work
- Platform-specific implementation details
