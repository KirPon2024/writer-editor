# FULL Policy No Duplication (P0)

TASK_ID=OPS-P0-SECTOR-M-PREP-001
FULL_POLICY_SCHEMA=full-policy.v1
FULL_ONLY=1
NO_DUPLICATION=1
ENFORCE_TOKEN=FULL_POLICY_NO_DUPLICATION_OK
FAIL_REASON=E_FULL_POLICY_NO_DUPLICATION_MISSING

Rule:
- FULL pack must add full-only checks.
- Repeating the same FAST checks in FULL is forbidden unless explicitly justified in checks docs.
- Sector runners and doctor tokens must keep this policy machine-checkable.
