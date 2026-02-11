# XPLAT_UNIFIED_MASTER_EXECUTION_CONTRACT_v1.0

## Scope
- SSOT-only bootstrap contract.
- no runtime wiring, no product/runtime behavior changes.
- Defines deterministic OPS evidence tokens for cross-platform master execution contract visibility.

## Required tokens
- `XPLAT_CONTRACT_PRESENT`
- `XPLAT_CONTRACT_SHA256`
- `XPLAT_CONTRACT_OK`

## PASS criteria
- Contract file exists at `docs/OPS/STATUS/XPLAT_UNIFIED_MASTER_EXECUTION_CONTRACT_v1.0.md`.
- Token `XPLAT_CONTRACT_PRESENT=1`.
- Token `XPLAT_CONTRACT_OK=1`.
- Token `XPLAT_CONTRACT_SHA256` equals sha256 of this file content.
- Tokens are emitted by:
  - `node scripts/ops/extract-truth-table.mjs --json`
  - `node scripts/ops/emit-ops-summary.mjs`
  - `DOCTOR_MODE=delivery node scripts/doctor.mjs`

## BLOCKED criteria
- Contract file missing or unreadable.
- Any required token missing.
- `XPLAT_CONTRACT_OK=0`.
- Any sha256 mismatch between emitted token and actual file hash.

## Deterministic hash rule
- Hash algorithm: `sha256`.
- Input bytes: exact raw bytes of this file on disk (UTF-8 content, no normalization).
- Rule: all emitters must compute hash directly from file content at runtime; hardcoded hash literals are forbidden.
