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

## M4
- CHECK_M4_UI_PATH_MINIMAL: renderer exposes minimal user path for markdown import/export via command layer only.
- CHECK_M4_UI_NO_DIRECT_PLATFORM_BYPASS: editor wiring uses `dispatchUiCommand(...)` and does not call markdown IPC directly.
- CHECK_M4_UI_FEEDBACK: user receives deterministic success/error status messages for markdown import/export actions.

## M5
- CHECK_M5_RELIABILITY_FILES_PRESENT: markdown IO reliability modules exist under `src/io/markdown/*`.
- CHECK_M5_ATOMIC_WRITE: export path uses atomic write (`temp -> fsync -> rename`) with deterministic cleanup.
- CHECK_M5_RECOVERY_SNAPSHOT: export path creates bounded recovery snapshot before overwrite.
- CHECK_M5_CORRUPTION_HANDLING: corrupt/invalid markdown input returns typed deterministic error.
- CHECK_M5_LIMITS_ENFORCED: oversized markdown input is rejected with typed deterministic error.
- CHECK_M5_TYPED_ERRORS: command layer preserves typed error codes and does not expose raw stack.

## M6
- CHECK_M6_RECOVERY_UX: markdown IO typed errors are mapped to deterministic user-facing guidance with recovery actions.
- CHECK_M6_SAFETY_CONFIG: export command path accepts deterministic safety mode (`strict|compat`) and keeps default safe.
- CHECK_M6_DETERMINISTIC_LOG: markdown IO failures produce deterministic local log records with stable schema.
- CHECK_M6_RELIABILITY: M6 aggregate token is green only when M6 UX/config/log checks are green and M5 reliability remains green.

FULL policy:
- FULL extends FAST with full-only checks; it must not duplicate FAST commands.
- CHECK_M_FULL_SCOPE_MAP_INTEGRITY (FULL-only):
  - validates `scripts/ops/sector-m-scope-map.json` schema/phase coverage (M0..M6,DONE)
  - validates runbook/network-gate markers for delivery fallback
- Enforcement token: `SECTOR_M_FAST_FULL_DIVERGENCE_OK=1`.
