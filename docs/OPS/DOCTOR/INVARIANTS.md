# Doctor Invariants

This file records OPS doctor invariants and enforcement mode.

## STRICT REQUIRED
- `TOKEN_CATALOG_IMMUTABLE_OK=1` - Token catalog immutability lock matches `TOKEN_CATALOG_LOCK.json`
- `OPS_GOVERNANCE_BASELINE_OK=1` - OPS governance baseline fingerprint matches `OPS_GOVERNANCE_BASELINE_v1.0.json`

## DEV OPTIONAL
- `TOKEN_CATALOG_IMMUTABLE_OK=1` - advisory in dev mode (warn on mismatch)
- `OPS_GOVERNANCE_BASELINE_OK=1` - advisory in dev mode (warn on mismatch)
