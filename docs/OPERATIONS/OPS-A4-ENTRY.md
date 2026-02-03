## STATUS
A4: OPEN

CANON_VERSION: v1.0
CHECKS_BASELINE_VERSION: v1.0

## PRECONDITION
- Этап A4 может начинаться только после A3: DONE — см. `docs/OPERATIONS/OPS-A3-SPEC-HARDENING-DONE.md`.

## GUARANTEES
- A1–A3 остаются read-only.
- OPS-инварианты A1–A3 не пересматриваются в A4.

## ALLOWED_TYPES (A4)
- CORE
- UI
- IO
- QA

## OPS_CANON_CHANGE
- Любые изменения OPS-канона требуют нового этапа (A5+).
