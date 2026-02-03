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
