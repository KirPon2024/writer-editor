## PURPOSE
Фиксирует канонические типы задач (TYPE) для CONTOUR-A и базовые правила их применения.

## ALLOWED_TYPES
- OPS_WRITE
- OPS_REPORT
- AUDIT
- CORE
- UI

## RULES
- TYPE обязателен в каждом HARD‑ТЗ.
- TYPE определяет допустимые CHECK‑пакеты и ограничения исполнения (например: OPS_REPORT = report-only, OPS_WRITE = write-intent).

## CANONICAL TASK SHAPE (MODE A)
MODE A (HARD‑ТЗ) — это канонический формат задачи в `docs/tasks/*.md`.

**Ровно 10 H2 секций, порядок обязателен, лишние H2 запрещены:**
1. `## MICRO_GOAL`
2. `## ARTIFACT`
3. `## ALLOWLIST`
4. `## DENYLIST`
5. `## CONTRACT / SHAPES`
6. `## IMPLEMENTATION_STEPS`
7. `## CHECKS`
8. `## STOP_CONDITION`
9. `## REPORT_FORMAT`
10. `## FAIL_PROTOCOL`

Нарушение любого правила → FAIL → STOP:
- отсутствующая секция
- секция вне порядка
- любая дополнительная H2 секция (`## ...`)

## CHECK PHASES (PRE/POST)
- Для `TYPE != OPS_REPORT`: MUST иметь минимум один `CHECK_XX_PRE_...` и минимум один `CHECK_XX_POST_...`.
- Для `TYPE = OPS_REPORT`: допускается отсутствие `PRE_`, но `POST_` MUST exist.
