## PURPOSE
NOTE: This document is a VIEW / historical artifact. Source of truth for invariants MUST be `docs/OPS/INVARIANTS_REGISTRY.json`. Debt MUST be sourced only from `docs/OPS/DEBT_REGISTRY.json`. Resolvable `checkId` tokens MUST be sourced only from `docs/OPS/AUDIT_CHECKS.json`.

Фиксирует нормативный язык OPS-документов: какие формулировки разрешены, а какие запрещены.

## ALLOWED
Разрешённые нормативные маркеры:
- MUST
- MUST NOT
- FAIL → STOP

## FORBIDDEN
Запрещённые формулировки (как нормативные инструкции):
- `should` (lowercase token)
- `may` (lowercase token)
- желательно
- рекомендуется

## RULE
- В OPS-доках и HARD‑ТЗ наличие запрещённых формулировок = FAIL.
