# OPS — PROCESS CEILING + OPS FREEZE
STATUS: FINAL / EXECUTABLE / FROZEN_UNTIL_M6
MODE: OPS_PROTOCOL
FORMAT_CANON: ONE_RAW_MD_BLOCK_ONLY

PROCESS_CEILING_SCHEMA=process-ceiling-freeze.v1
OPS_FREEZE_UNTIL=M6
OPS_BLOCKING_GATES_MAX=4
OPS_BLOCKING_GATES_SET=NETWORK,TESTS,RUNNER_FAST,DOCTOR
OPS_NON_BLOCKING_DEFAULT=ADVISORY
OPS_SSOT_REQUIRED=1
OPS_RATIO_RULE=OPS_1_PER_PRODUCT_3
OPS_TWO_STRIKES_RULE=2_STRIKES_1_FIX_FREEZE

---

## PURPOSE
- Keep delivery practical and deterministic.
- Prevent process complexity from growing faster than product delivery.
- Keep local work unblocked by external network issues.

## OPS FREEZE (UNTIL M6)
- OPS changes are forbidden while `SECTOR_M_PHASE` is in `M0..M6`, except P0 carveouts.
- P0 carveouts only:
- security break or critical vulnerability
- data loss / corruption risk
- hard CI deadlock that blocks product delivery
- SoT↔doctor mismatch on `origin/main` (critical token regression)
- blocking delivery outage (push/PR/merge impossible)

## BLOCKING GATES (MAX 4)
Only these four checks may block delivery:
1. `NETWORK` (delivery-only)
2. `TESTS` (`npm run test:<sector>`)
3. `RUNNER_FAST` (`<sector>-run --pack fast`)
4. `DOCTOR` (critical tokens only)

Everything else is advisory and MUST NOT produce stop by itself.

## SSOT RULE
- Scope/allowlist/phase-map must exist in a single source of truth (SSOT).
- Runner and no-scope-leak tests must read the same SSOT file.
- Duplicated allowlist logic is forbidden.

## FLOW LIMITS
- Ratio rule: max `1 OPS PR` per `3 product PR` (P0 carveouts excluded).
- Two-strikes rule: allow one narrow OPS fix only after the same stop reason appears twice consecutively; then return to freeze.

## DELIVERY MODE BOUNDARY
- `NETWORK` gate applies only in delivery mode.
- Local mode remains offline-capable and must not be blocked by network checks.
