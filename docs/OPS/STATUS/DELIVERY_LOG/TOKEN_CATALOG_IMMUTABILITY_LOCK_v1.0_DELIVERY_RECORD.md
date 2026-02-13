VERSION: v1.0
STATUS: ACTIVE CANON
KIND: DELIVERY_RECORD
SCOPE: TOKEN_GOVERNANCE_LAYER
DATE: 2026-02-13
SOURCE_PR: https://github.com/KirPon2024/writer-editor/pull/135

## Summary
TOKEN_CATALOG_IMMUTABILITY_LOCK_v1.0 introduces an immutability lock for `TOKEN_DECLARATION.json` using canonical sha256 hashing, wires strict doctor gating to fail on mismatch (while keeping dev mode as warn), and adds a contract test to prove immutability and deterministic behavior.

## Artifacts
- `docs/OPS/TOKENS/TOKEN_CATALOG_LOCK.json`
- `scripts/ops/token-catalog-immutability-state.mjs`
- `test/contracts/token-catalog-immutability.contract.test.js`
- `scripts/doctor.mjs` (updated)

## Git Evidence
- Feature commit SHA: `4f34772ac6ac551f8d002455d98759b737bd2fc7`
- Merge commit SHA: `c0111ed464c05f3681eb28ab87dad4ea2ac3c93b`
- main HEAD SHA: `c0111ed464c05f3681eb28ab87dad4ea2ac3c93b`
- merge mode: regular merge (2 parents)

## Checks Evidence
- `CHECKS_BASELINE_VERSION=v1.3 EFFECTIVE_MODE=STRICT node scripts/doctor.mjs -> PASS`
- `npm test -> PASS`
- `node scripts/ops/token-catalog-immutability-state.mjs --json -> PASS (TOKEN_CATALOG_IMMUTABLE_OK=1)`

## Policy
- Merge policy: regular merge only (no squash, no rebase)
- Remote feature branch deleted: confirmed (HTTP 404)

## Invariants
- `TOKEN_CATALOG_IMMUTABLE_OK=1` (STRICT: REQUIRED; DEV: OPTIONAL)
