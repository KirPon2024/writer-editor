# ADR-CORESTATE-VERSION

## STATUS
STATUS: ACCEPTED

## CONTEXT (Repo-backed)
Факт дрейфа типов зафиксирован в репозитории:
- `src/core/contracts.ts` содержит `version: string`
- `src/contracts/core-state.contract.ts` содержит `version: number`

Это создаёт риск расхождения “internal state ↔ public snapshot”, а также риск неоднозначной интерпретации `version` в проверках и миграциях.

## DECISION
Единая семантика и тип:
- `CoreState.version = number` (integer, `schemaVersion`)
- `CoreStateSnapshot.version = number` (integer, та же семантика `schemaVersion`)

## RATIONALE
Причины выбора integer `number` как `schemaVersion`:
- Миграции описываются проще: изменение схемы → инкремент версии, без парсинга строковых форматов.
- Детерминизм: сравнение и порядок версий определяются числовыми правилами, без скрытых правил строкового сравнения.
- Replay-friendly: версия схемы отделена от времени и окружения, что снижает риск недетерминизма.

## COMPATIBILITY / MIGRATION POLICY
- `version` означает версию схемы (schemaVersion) формы CoreState/CoreStateSnapshot.
- Правило сравнения: числовое сравнение целых значений (равенство и порядок по integer).
- Политика изменения: `version` увеличивается только при несовместимом изменении shape (схемы) состояния/снапшота.
- Переходное чтение legacy:
  - legacy `version` в виде строки трактуется как base-10 integer (например через `parseInt` на стороне чтения),
  - нечисловое значение трактуется как ошибка несовместимости данных.

## NON-GOALS
Запрещено:
- использование semver (или любых “x.y.z” форматов) в `version`
- использование wall-clock времени или timestamps как `version`
- сравнение `version` как строки

## FOLLOW-UP TASKS (Blocked until executed)
- SRC-only: привести `src/core/contracts.ts` к `version: number` и убрать `version: string`.
- SRC-only: добавить или обновить contract-level тест(ы) согласованности типов `CoreState` ↔ `CoreStateSnapshot` (если применимо в текущей тестовой структуре).

