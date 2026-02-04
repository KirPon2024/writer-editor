
# OPS-RUNTIME-TRACE-MIN-CANON (CONTOUR-C)

## STATUS
Mode: TRANSITIONAL

## PURPOSE
Fix a minimal canonical trace and diagnostics vocabulary for CONTOUR-C that is checkable, headless, and replayable.

## NON-GOALS
- Define UI/UX behavior.
- Define storage format evolution beyond declared inventories.
- Define public contracts and schema evolution outside future runtime contracts.

## DEFINITIONS
Diagnostics: structured, machine-checkable trace records that describe execution outcomes and boundary-relevant facts without UI dependency.
Trace sink: defined storage or emission target for trace records that supports headless production and replayable test validation.

## CommandTrace (MUST fields)
- executionId: string, non-empty.
- commandId: string, non-empty.
- orderingKey: string, non-empty.
- logicalTimestamp: ordering token sufficient to deterministically order records within one orderingKey.
- terminalStatus: enum token.
- attemptCount: integer number >= 1.
- errorCode: string, required when terminalStatus = failure.

## EffectTrace (MUST fields)
- executionId: string, non-empty.
- effectId: string, non-empty.
- effectType: string, non-empty.
- orderingKey: string, non-empty.
- logicalTimestamp: ordering token sufficient to deterministically order records within one orderingKey.
- terminalStatus: enum token.
- attempt: integer number >= 1.
- errorCode: string, required when terminalStatus = failure.
- idempotencyKey: string, required for non-idempotent effects.
- retryable: boolean, required when terminalStatus = failure.

## logicalTimestamp rules (MUST)
- NOT wall-clock time.
- Monotonic within a single orderingKey.
- No global compare across different orderingKey.
- Sufficient to deterministically order trace records within one orderingKey.

## Diagnostics definition (MUST)
Diagnostics are structured trace records, not free-form logs.

## Trace sink rule (MUST)
Trace records MUST have a defined Trace sink that supports headless production and replayable test validation without UI.

success
failure
abandoned
