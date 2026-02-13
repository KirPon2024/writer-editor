# Governance Freeze Profile v1.0

## Purpose
`FREEZE_PROFILE=governance` activates release-grade freeze mode for the governance layer.

## Scope
Freeze mode applies to governance-layer paths:
- `docs/OPS/**`
- `scripts/ops/**`
- `scripts/doctor.mjs`
- `test/contracts/**` (OPS enforcement contracts)

## Rule
When `FREEZE_PROFILE=governance`:
- any governance-layer change is forbidden
- `GOVERNANCE_CHANGE_APPROVED=1` does not override freeze
- expected token: `GOVERNANCE_FREEZE_OK=1`

## Release Pipeline Usage
Run strict doctor with freeze profile:

`FREEZE_PROFILE=governance CHECKS_BASELINE_VERSION=v1.3 EFFECTIVE_MODE=STRICT node scripts/doctor.mjs`

If governance changes are present, strict doctor must fail.

## Dev vs Release
- Dev mode: freeze is inactive unless explicitly enabled.
- Release mode: freeze should be enabled for final governance-stable verification.

## Required Companion Checks
For release-grade governance verification:
1. `node scripts/ops/governance-freeze-state.mjs --json`
2. `node scripts/ops/governance-change-detection.mjs --json`
3. `node scripts/ops/ops-governance-baseline-state.mjs --json`
4. `node scripts/ops/token-catalog-immutability-state.mjs --json`
5. strict doctor command with `FREEZE_PROFILE=governance`

## Explicit Policy Statement
No governance changes are allowed in freeze mode, including changes that would normally be accepted with `GOVERNANCE_CHANGE_APPROVED=1`.
