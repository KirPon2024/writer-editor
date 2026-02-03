## PURPOSE
Фиксирует версионирование OPS-канона и baseline версию CHECK-инвариантов для CONTOUR-A.

## BASELINE
CANON_VERSION: v1.0
CHECKS_BASELINE_VERSION: v1.0

## RULES
- Версии указываются в формате `vX.Y`.
- В каждом HARD‑ТЗ MODE A MUST быть явно указаны `CANON_VERSION` и `CHECKS_BASELINE_VERSION`.
- Новые CHECK и инварианты применяются только к задачам с `CHECKS_BASELINE_VERSION` ≥ версии введения правила.
- Ретроактивное применение новых инвариантов запрещено: существующие задачи и OPS-доки не “перепроверяются” по новым правилам автоматически.
