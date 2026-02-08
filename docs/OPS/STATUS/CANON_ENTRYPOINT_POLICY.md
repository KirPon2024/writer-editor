# CANON Entrypoint Policy (P0)

TASK_ID=OPS-P0-SECTOR-M-PREP-001
ENTRYPOINT_POLICY_SCHEMA=entrypoint-policy.v1
ENTRYPOINT_MUST=CANON.md
ENTRYPOINT_SECOND_MUST_ALLOWED=0
ENTRYPOINT_SECOND_MUST_FILE=docs/CRAFTSMAN.md
ENTRYPOINT_SECOND_MUST_MARKER=ENTRYPOINT_MUST=1
ENTRYPOINT_SPLIT_BRAIN_FAIL_REASON=E_CANON_ENTRYPOINT_SPLIT_BRAIN

Rule:
- Until a dedicated canon PR says otherwise, the only MUST entrypoint is `CANON.md`.
- `docs/CRAFTSMAN.md` may exist as reference text, but MUST-level status is forbidden.
- If two MUST entrypoints are detected, stop with `E_CANON_ENTRYPOINT_SPLIT_BRAIN`.
