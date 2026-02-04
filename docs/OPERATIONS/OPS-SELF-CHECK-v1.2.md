# TITLE
OPS Self-Check v1.2 (Canonical Baseline)

## SCOPE
- This self-check MUST apply only for `opsCanonVersion = v1.2` in `Effective mode = TRANSITIONAL`.
- This self-check MUST validate that OPS v1.2 governance artifacts are mutually consistent and mechanically interpretable.
- This self-check MUST NOT introduce new governance rules.
- This self-check MUST NOT modify any existing governance semantics.

## CANONICAL INPUTS
The following artifacts MUST be treated as source of truth for the self-check:
- `scripts/doctor.mjs`
- `docs/OPS/INVARIANTS_REGISTRY.json`
- `docs/OPS/DEBT_REGISTRY.json`
- `docs/OPS/AUDIT_CHECKS.json`
- `docs/OPS/INVENTORY_INDEX.json`

## SELF-CHECK SEQUENCE
1) The worktree MUST be clean before running the self-check.
2) The self-check MUST run `node scripts/doctor.mjs` without additional flags.
3) The self-check MUST interpret the final status token as:
   - `DOCTOR_OK` = PASS
   - `DOCTOR_WARN` = PASS with restrictions
   - `DOCTOR_FAIL` = FAIL
4) If `DOCTOR_WARN` is present, merge eligibility MUST follow `docs/OPERATIONS/OPS-CI-POLICY-v1.2.md`.

## EXPECTED TOKENS
Doctor output MUST contain the exact tokens:
- `DOCTOR_OK` OR `DOCTOR_WARN` OR `DOCTOR_FAIL`
- `ENFORCED_INVARIANTS=`
- `PLACEHOLDER_INVARIANTS=`
- `NO_SOURCE_INVARIANTS=`

## FAILURE MODES
The self-check MUST treat the following as failures:
- missing `docs/OPS/INVARIANTS_REGISTRY.json`
- mismatched `opsCanonVersion` across canonical inputs
- undeclared empty inventory (`items: []` without declared emptiness where required by index rules)
- dangling `checkId` (implemented invariant with `checkId` not resolvable in `docs/OPS/AUDIT_CHECKS.json`)
- expired debt (if/when debts are introduced and TTL validation is enabled by doctor)

## NON-RETROACTIVE NOTE
- This self-check MUST apply only to v1.2 baseline evaluation.
- This self-check MUST NOT reinterpret or invalidate baselines older than v1.2.
