# SECTOR M Checks

## M0
- CHECK_M0_SOT_SCHEMA: `docs/OPS/STATUS/SECTOR_M.json` matches `sector-m-status.v1` and valid value domains.
- CHECK_M0_RUNNER_ARTIFACT: `scripts/sector-m-run.mjs --pack fast` produces deterministic artifact `sector-m-run.v1`.
- CHECK_M0_DOCTOR_TOKENS: doctor emits `SECTOR_M_*` and `M0_*` tokens.
- CHECK_M0_NO_SCOPE_LEAK: branch diff vs `origin/main` stays within phase allowlist.

## M1
- CHECK_M1_CONTRACT_DOCS_PRESENT: `docs/FORMAT/MARKDOWN_MODE_SPEC_v1.md`, `docs/FORMAT/MARKDOWN_LOSS_POLICY_v1.md`, `docs/FORMAT/MARKDOWN_SECURITY_POLICY_v1.md` exist.
- CHECK_M1_CONTRACT_DOCS_COMPLETE: required contract headings are present.
- CHECK_M1_NO_SPLIT_BRAIN_ENTRYPOINT: `CANON_ENTRYPOINT_SPLIT_BRAIN_DETECTED=0`.
- CHECK_M1_POLICIES_NON_AMBIGUOUS: doctor emits `M1_CONTRACT_OK=1` and policy tokens.

## M2
- CHECK_M2_TRANSFORM_FILES_PRESENT: `src/export/markdown/v1/*` transform files and M2 tests exist.
- CHECK_M2_ROUNDTRIP_PROOFS: roundtrip tests pass and doctor emits `M2_ROUNDTRIP_OK=1`.
- CHECK_M2_SECURITY_ENFORCEMENT: security tests pass and doctor emits `M2_SECURITY_ENFORCEMENT_OK=1`.
- CHECK_M2_LIMITS_ENFORCEMENT: limits tests pass and doctor emits `M2_LIMITS_OK=1`.

## M3
- CHECK_M3_COMMAND_WIRING: markdown import/export commands are registered in renderer and wired through preload/main IPC.
- CHECK_M3_TYPED_ERRORS: doctor emits `M3_TYPED_ERRORS_OK=1` and command failures stay typed/deterministic.
- CHECK_M3_SECURITY_VIA_COMMANDS: security violations from transform surface propagate through command path as typed errors.

FULL policy:
- M0, M1, M2, and M3 use FAST-equivalent checks only; no additional full-only checks are required yet.
