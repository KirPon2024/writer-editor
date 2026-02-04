# ADR-CONTRACTS-TOPOLOGY

## STATUS
SUPERSEDED by `docs/ADR/ADR-CONTRACTS-TOPOLOGY-v2.md`.

## CONTEXT
В проекте фигурировали два потенциальных направления для контрактов:
- `src/contracts/*`
- `packages/contracts/*`

На текущем этапе репозиторий не содержит `packages/` и не содержит `src/contracts/`.
Фактические контракты существуют рядом с CORE:
- `src/core/contracts.ts` (и потенциальные расширения в `src/core/contracts/*`)

Это создаёт риск дрейфа “source of truth” при росте проекта и появлении параллельных топологий.

## DECISION
**Source of truth for contracts: `src/contracts/*`**

## CONSEQUENCES
- Все новые контракты (public types/shapes) создаются в `src/contracts/*`
- Контракты внутри `src/core/*` считаются CORE-внутренними (или временными), но не “каноническим каталогом контрактов”
- Любые будущие tooling/проверки ориентируются на `src/contracts/*`
- `packages/contracts/*` запрещён как топология до отдельного этапа (A5+) и отдельного ADR

## MIGRATION_NOTE
- Immediate migration: none (каталог будет создан при первом переносе/выделении контрактов)
- Next planned action (separate task): вынести/синхронизировать существующие контракты из `src/core/contracts.ts` в `src/contracts/*` без изменения поведения
