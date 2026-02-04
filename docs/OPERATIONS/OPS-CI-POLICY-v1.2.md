# TITLE
OPS CI Policy v1.2 for doctor output (TRANSITIONAL)

## SCOPE
- This policy MUST apply only when `Effective mode = TRANSITIONAL` and `opsCanonVersion = v1.2`.
- This policy MUST apply to:
  - task-runs with `CHECKS_BASELINE_VERSION >= v1.2`, AND
  - standalone-runs where baseline is `INVARIANTS_REGISTRY.opsCanonVersion` and equals `v1.2`.
- This policy MUST NOT be used to retroactively invalidate previously closed contours or historical baselines.

## STATUS TOKENS
- CI MUST treat the doctor output as authoritative and MUST parse the exact tokens:
  - `DOCTOR_OK`
  - `DOCTOR_WARN`
  - `DOCTOR_FAIL`
  - `ENFORCED_INVARIANTS=`
  - `PLACEHOLDER_INVARIANTS=`
  - `NO_SOURCE_INVARIANTS=`

## CI REACTION MATRIX
- `DOCTOR_OK` MUST result in CI PASS.
- `DOCTOR_WARN` MUST result in CI PASS only under the constraints defined in MERGE POLICY and WARN ESCALATION.
- `DOCTOR_FAIL` MUST result in CI FAIL.

## MERGE POLICY
- A changeset with `DOCTOR_WARN` MUST be merge-eligible only if:
  - `ENFORCED_INVARIANTS=` indicates no enforced invariant failures (no `DOCTOR_FAIL`), AND
  - WARN is attributable exclusively to:
    - `PLACEHOLDER_INVARIANTS=`, OR
    - `NO_SOURCE_INVARIANTS=`, AND
  - `WARN_MISSING_DEBT` count equals `0`, AND
  - `DEBT_TTL_EXPIRED` count equals `0` (if the token is present in doctor output), AND
  - `CHECKID_DANGLING_IMPLEMENTED` count equals `0` (if the token is present in doctor output).

## WARN ESCALATION
- `DOCTOR_WARN` MUST be treated as CI FAIL if any of the following is true:
  - `WARN_MISSING_DEBT` count is greater than `0`, OR
  - `DEBT_TTL_EXPIRED` count is greater than `0` (if the token is present in doctor output), OR
  - `CHECKID_DANGLING_IMPLEMENTED` count is greater than `0` (if the token is present in doctor output).
- CI MUST compute each “count” as the number of exact substring occurrences in the full doctor output.

## LOGGING
- CI MUST preserve the full, raw stdout/stderr of doctor in the job logs.
- CI MUST NOT truncate the doctor output.

## NON-RETROACTIVE
- This policy MUST apply only to v1.2 baseline evaluation as defined in SCOPE.
- This policy MUST NOT be used to reinterpret older baselines (`CHECKS_BASELINE_VERSION < v1.2`).
