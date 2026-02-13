# Governance Change Protocol v1.0

## Purpose
This protocol enforces explicit approval for governance-layer modifications to prevent silent OPS drift.

## Governance Layer
The governance layer includes:
- `docs/OPS/**`
- `scripts/ops/**`
- `scripts/doctor.mjs`
- `test/contracts/**` (OPS enforcement contracts)

## Approval Flag
If governance-layer changes are present relative to `origin/main`, the PR/branch must set:
- `GOVERNANCE_CHANGE_APPROVED=1`

Without the flag:
- STRICT mode: fail (`GOVERNANCE_CHANGE_OK=0`)
- DEV mode: warn (`GOVERNANCE_CHANGE_OK=0`)

## Required Validation Steps
For governance-modifying changes, all checks must pass:
1. `GOVERNANCE_CHANGE_APPROVED=1 CHECKS_BASELINE_VERSION=v1.3 EFFECTIVE_MODE=STRICT node scripts/doctor.mjs`
2. `node scripts/ops/ops-governance-baseline-state.mjs --json`
3. `node scripts/ops/token-catalog-immutability-state.mjs --json`
4. `npm test`

## Baseline Regeneration
When governance files change and baseline fingerprint must be refreshed:
1. Apply intended governance changes.
2. Recompute baseline:
   - `node scripts/ops/ops-governance-baseline-state.mjs --write-baseline --json`
3. Re-run strict checks with explicit governance approval flag.

## Prohibited Patterns
- Silent OPS doc edits without explicit governance approval.
- Partial baseline updates where changed governed files are not reflected in baseline.
- Manual lock/baseline tampering that bypasses state scripts.

## Notes
- This protocol does not allow weakening namespace strictness or token governance policies.
- Runtime `src/**` behavior is out of scope for this gate.
