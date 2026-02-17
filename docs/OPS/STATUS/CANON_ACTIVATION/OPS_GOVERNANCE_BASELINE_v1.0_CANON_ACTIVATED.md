VERSION: v1.0
STATUS: ACTIVE CANON
SCOPE: OPS_GOVERNANCE_LAYER
SOURCE_PR: https://github.com/KirPon2024/writer-editor/pull/137
MERGE_COMMIT: 690b65c4fe4014caa399bd5e3b7440ed00c7852b
DATE: 2026-02-13

## Summary
OPS_GOVERNANCE_BASELINE_v1.0 is merged and activated on `main` as a governance hardening control point: OPS governance artifacts are fingerprinted via baseline snapshot, token catalog immutability remains locked, and strict doctor enforcement now validates both invariants.

## Enforcement Layer
- Token immutability active (`TOKEN_CATALOG_IMMUTABLE_OK=1` via token catalog lock state).
- Governance baseline active (`OPS_GOVERNANCE_BASELINE_OK=1` via baseline fingerprint state).
- Doctor STRICT enforcement active (mismatch in either invariant is blocking).

## Active Invariants
- `TOKEN_CATALOG_IMMUTABLE_OK=1`
- `OPS_GOVERNANCE_BASELINE_OK=1`

## Evidence
- `node scripts/ops/token-catalog-immutability-state.mjs --json` on `main` -> PASS.
- `node scripts/ops/ops-governance-baseline-state.mjs --json` on `main` -> PASS.
- `CHECKS_BASELINE_VERSION=v1.3 EFFECTIVE_MODE=STRICT node scripts/doctor.mjs` on `main` -> PASS.
- `npm test` on `main` -> PASS.
