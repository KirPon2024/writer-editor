⚠️ Work in progress (writer v1). APIs and behavior may change.
# Yalken

Спокойный локальный редактор для письма и редактуры текста.

Yalken развивается как desktop-first и offline-first writer tool с приоритетом на:
- надёжный primary editor path,
- предсказуемое восстановление текста,
- локальное хранение,
- минимальную хрупкость интерфейса и процесса.

## Канон
- Active execution canon: `docs/OPS/STATUS/CANON_STATUS.json`
- Верхний repo canon: `CANON.md`
- COREX: `docs/corex/COREX.v1.md`
- Product map: `docs/BIBLE.md`
- Factual context: `docs/CONTEXT.md`
- Process: `docs/PROCESS.md`
- Handoff: `docs/HANDOFF.md`
- Feature integration: `docs/YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md`

## Архитектура интеграции

- Product Core владеет данными и доменным смыслом.
- Command Kernel владеет действиями и availability.
- Design OS владеет вычисляемой формой интерфейса.
- Новая фича подключает product plane и interface plane раздельно.
- Мутации идут через canonical Commands, внешние эффекты — через product ports
  и adapters, интерфейс — через surface manifests и typed slots.
- UI, workers и feature packs не получают прямой доступ к project storage.
- Несохранённый текст является authoring working state с no-loss duty и не
  принадлежит shell-state.
- Видимость команды вычисляет Design OS, но capability при dispatch всегда
  повторно проверяет Command Kernel.
- Manifests сначала фиксируются в ТЗ; они не создают speculative runtime
  registry или feature pack автоматически.

## Writer V1

Текущий ориентир версии:
- strict data core,
- reliable primary editor path,
- zero-bypass command surface,
- safe reset and restore,
- bounded spatial containers,
- mutable design that never threatens text truth.

## Current State

Сейчас merged repair wave уже подтверждена как repo-wide closed state на main:
- earlier closure claims не считаются достаточным доказательством полного repo-level closure,
- repo-wide done уже подтвержден на main после merge gate и post-merge reconfirm,
- Phase 03 blocker уже закрыт на main через merged repair wave,
- true Phase 04 design-layer baseline уже закрыт на main через merged repair wave,
- Phase 05 bounded spatial shell chain уже закрыт на main через merged repair wave,
- Phase 06 explicit skip contour уже закрыт на main через merged repair wave,
- Phase 07 required closure set уже закрыт на main через post-merge reconfirm,
- branch-local closure остаётся историческим этапом и не является текущим repo-wide состоянием,
- broader freedom не открывается автоматически после repair closure.

Это не означает автоматический переход к новой обязательной версии:
- broader freedom остаётся только post-version-one evaluation axis,
- future expansion не переоткрывает закрытый `Writer v1`,
- evaluation-only работа не считается новой release law сама по себе.

## MVP Invariants
- desktop-first
- offline-first
- сцены как отдельные сущности
- atomic write и recovery обязательны
- DOCX first export
- без cloud truth и network truth в `v1`
- без executable plugin runtime в `v1`

## Не входит в текущий scope
- аккаунты и авторизация
- синхронизация и облачное хранение
- social layer
- executable plugin ecosystem
- platform-first expansion

## Запуск
```bash
npm install
npm run dev
```

## Проверка зависимостей
- `npm run oss:policy`

## Сборка macOS
- `npm run build:mac`

## Где хранятся данные
- Основная папка: `~/Documents/craftsman/`
- Дополнительные настройки: `app.getPath('userData')`

## Лицензия
- AGPL-3.0-or-later
