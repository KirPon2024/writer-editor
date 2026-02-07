# CONTOUR_C

STATUS: CLOSED
CLOSED_AT: 2026-02-07

This directory stores machine-readable Contour C control artifacts.

- `P0_INVARIANTS.json` — fixed P0 invariant IDs for Contour C.
- `WARN_TARGET.v1.json` — target warn-id set and baseline for `WARN_DELTA_TARGET`.
- `WAIVED_GATES.json` — temporary gate waivers with TTL and HO owner.
- `EXIT_LEDGER.json` — append-only ledger managed by `scripts/contour-c-ledger.mjs`.

Manual edits to `EXIT_LEDGER.json` are forbidden.

Any further Contour C changes are allowed only via explicit contour transition or ADR.

## REQUIRED_GATES

Single source of truth list for `C-P0-03-RULE-001`.
Format per line: `GATE_ID|kind|target`

- `C-GATE-001|script|scripts/doctor.mjs`
- `C-GATE-002|script|scripts/guards/ops-current-wave-stop.mjs`
- `C-GATE-003|script|scripts/guards/ops-mvp-boundary.mjs`
- `C-GATE-004|script|scripts/contour-c-run.mjs`
- `C-GATE-005|script|scripts/contour-c-ledger.mjs`
