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

## M7
- CHECK_M7_PHASE_KICKOFF: SoT is updated to `phase=M7` and `goTag=GO:SECTOR_M_M7_NEXT_DONE`.
- CHECK_M7_PHASE_READY: doctor emits `M7_PHASE_READY_OK=1` with `SECTOR_M_PHASE=M7`.
- CHECK_M7_FAST_PATH: `test:sector-m`, `sector-m-run --pack fast`, and doctor critical tokens stay green.
- CHECK_M7_FLOW_VIEW: flow mode opens combined read view over roman scene files with unified scroll.
- CHECK_M7_FLOW_EDIT: flow mode save path writes edits back to scene files and supports boundary caret transitions.
- CHECK_M7_FLOW_UX: flow mode shows deterministic status hints and supports `ArrowUp/ArrowDown` boundary navigation.
- CHECK_M7_CORE: aggregate token is green only when M7 flow view/edit checks and M7 phase-ready are green.
- CHECK_M7_NEXT: aggregate token is green only when `M7_CORE_OK=1` and `M7_FLOW_UX_OK=1`.

## M8
- CHECK_M8_PHASE_CORE: SoT stays at `phase=M8` and `goTag` is one of `GO:SECTOR_M_M8_DONE|GO:SECTOR_M_M8_NEXT_DONE`.
- CHECK_M8_PHASE_READY: doctor emits `M8_PHASE_READY_OK=1` with `SECTOR_M_PHASE=M8`.
- CHECK_M8_KICKOFF_HOOK: flow mode status wiring uses `buildFlowModeKickoffStatus(...)` and keeps deterministic status messages.
- CHECK_M8_CORE_HOOK: flow mode edit path marks dirty state with `buildFlowModeCoreStatus(...)`.
- CHECK_M8_NEXT_HOOK: flow mode open path blocks reopen when unsaved (`dirty`) and emits deterministic status guidance.
- CHECK_M8_FAST_PATH: `test:sector-m`, `sector-m-run --pack fast`, and doctor critical tokens stay green.
- CHECK_M8_KICKOFF: aggregate token is green only when `M8_PHASE_READY_OK=1` and kickoff hook markers/tests are present.
- CHECK_M8_CORE: aggregate token is green only when `M8_KICKOFF_OK=1` and core hook markers/tests are present.
- CHECK_M8_NEXT: aggregate token is green only when `M8_CORE_OK=1` and M8 next hook markers/tests are present.
- CHECK_M8_CLOSE: aggregate token is green only when `M8_NEXT_OK=1` and SoT close goTag is `GO:SECTOR_M_M8_DONE`.

## M9
- CHECK_M9_PHASE_READY: SoT is updated to `phase=M9` and doctor emits `M9_PHASE_READY_OK=1`.
- CHECK_M9_KICKOFF_HOOK: flow mode status wiring uses `buildFlowModeM9KickoffStatus(...)` with deterministic output.
- CHECK_M9_CORE_HOOK: flow mode save payload validation maps deterministic reason-specific status via `buildFlowModeM9CoreSaveErrorStatus(...)`.
- CHECK_M9_NEXT_HOOK: flow mode save path blocks no-op save when unchanged and emits deterministic status via `buildFlowModeM9NextNoopSaveStatus(...)`.
- CHECK_M9_FAST_PATH: `test:sector-m`, `sector-m-run --pack fast`, and doctor critical tokens stay green.
- CHECK_M9_KICKOFF: aggregate token is green only when `M8_CLOSE_OK=1`, `M9_PHASE_READY_OK=1`, and M9 kickoff hook markers/tests are present.
- CHECK_M9_CORE: aggregate token is green only when `M9_KICKOFF_OK=1`, `M9_CORE_HOOK` markers/tests are present, and SoT goTag is `GO:SECTOR_M_M9_CORE_DONE|GO:SECTOR_M_M9_NEXT_DONE|GO:SECTOR_M_M9_DONE`.
- CHECK_M9_NEXT: aggregate token is green only when `M9_CORE_OK=1`, `M9_NEXT_HOOK` markers/tests are present, and SoT goTag is `GO:SECTOR_M_M9_NEXT_DONE|GO:SECTOR_M_M9_DONE`.

FULL policy:
- FULL extends FAST with full-only checks; it must not duplicate FAST commands.
- CHECK_M_FULL_SCOPE_MAP_INTEGRITY (FULL-only):
  - validates `scripts/ops/sector-m-scope-map.json` schema/phase coverage (M0..M9,DONE)
  - validates runbook/network-gate markers for delivery fallback
- Enforcement token: `SECTOR_M_FAST_FULL_DIVERGENCE_OK=1`.
