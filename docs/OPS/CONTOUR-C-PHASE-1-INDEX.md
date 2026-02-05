VIEW_ONLY: CONTOUR_C_PHASE_1

## Purpose
Этот файл служит входной точкой в Phase 1 для Contour C. Он перечисляет docs-only описания, которые уже находятся в репозитории, и помогает читать их в понятном порядке. Текст здесь описательный: он не является источником истины, не задаёт проверок и не описывает реализацию.

## Phase-1 artifacts (current)
- `docs/OPS/CONTOUR-C-SCOPE.md`
  Краткое описание границ Contour C и области рассмотрения Phase 1.
- `docs/OPS/OPS-CONTOUR-C-INVARIANTS.md`
  Концептуальный список инвариантов runtime исполнения, причинности, очередей и исходов.
- `docs/OPS/OPS-RUNTIME-GLOSSARY.md`
  Словарь терминов runtime: command, intent, execution, effect, orderingKey, backpressure, overflow, terminalStatus, attempt, idempotencyKey.
- `docs/OPS/OPS-RUNTIME-TRACE-MINIMUM.md`
  Минимальный формат trace (CommandTrace и EffectTrace) и набор ключевых полей для последующего реплея и диагностики.
- `docs/OPS/OPS-RUNTIME-TRACE-SINK.md`
  Описание “sink” для trace и связи с headless реплеем и валидацией без UI.

## How to read (suggested)
- `docs/OPS/CONTOUR-C-SCOPE.md`
- `docs/OPS/OPS-RUNTIME-GLOSSARY.md`
- `docs/OPS/OPS-CONTOUR-C-INVARIANTS.md`
- `docs/OPS/OPS-RUNTIME-TRACE-MINIMUM.md`
- `docs/OPS/OPS-RUNTIME-TRACE-SINK.md`

Набор рассчитан на ориентирование в терминах и границах, без зависимости от текущего кода и без требований к выполнению шагов.

## Non-goals
- Не определяет правила или требования к runtime.
- Не определяет проверки, команды или критерии прохождения.
- Не описывает изменения в JSON инвентарях и их схемах.
- Не добавляет новые источники истины или ответственности.
- Не описывает UI, UX или публичные интерфейсы.
