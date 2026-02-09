# SECTOR M Checks (M0)

- CHECK_M0_SOT_SCHEMA: `docs/OPS/STATUS/SECTOR_M.json` matches `sector-m-status.v1` minimal schema and M0 values.
- CHECK_M0_RUNNER_ARTIFACT: `scripts/sector-m-run.mjs --pack fast` produces deterministic artifact `sector-m-run.v1`.
- CHECK_M0_DOCTOR_TOKENS: doctor emits `SECTOR_M_*` and `M0_*` tokens.
- CHECK_M0_NO_SCOPE_LEAK: branch diff vs `origin/main` stays within M0 allowlist.

FULL policy for M0:
- FULL is intentionally same as FAST at bootstrap stage.
- No markdown implementation checks are part of M0.
