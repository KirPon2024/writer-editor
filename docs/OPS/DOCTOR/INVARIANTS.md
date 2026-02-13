# Doctor Invariants

This file records OPS doctor invariants and enforcement mode.

## STRICT REQUIRED
- `GOVERNANCE_FREEZE_OK=1` - Required when `FREEZE_PROFILE=governance`; any governance-layer change is blocked
- `TOKEN_CATALOG_IMMUTABLE_OK=1` - Token catalog immutability lock matches `TOKEN_CATALOG_LOCK.json`
- `OPS_GOVERNANCE_BASELINE_OK=1` - OPS governance baseline fingerprint matches `OPS_GOVERNANCE_BASELINE_v1.0.json`
- `GOVERNANCE_CHANGE_OK=1` - Governance-layer changes require explicit `GOVERNANCE_CHANGE_APPROVED=1`

## DEV OPTIONAL
- `GOVERNANCE_FREEZE_OK=1` - advisory in dev mode (freeze enforced only when explicitly activated)
- `TOKEN_CATALOG_IMMUTABLE_OK=1` - advisory in dev mode (warn on mismatch)
- `OPS_GOVERNANCE_BASELINE_OK=1` - advisory in dev mode (warn on mismatch)
- `GOVERNANCE_CHANGE_OK=1` - advisory in dev mode (warn when approval flag is missing)
