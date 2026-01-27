# HANDOFF (Craftsman)

_Generated: 2026-01-27_

## Start Here
- Canon (top): `CANON.md`
- Project bible: `docs/BIBLE.md`
- Read: `docs/CONTEXT.md`
- Process: `docs/PROCESS.md`
- Recent changes: `docs/WORKLOG.md`
- Agent prompt: `docs/AGENT_START_PROMPT.md`

## Working Agreement (important)
- Mode 1 — ChatGPT (Чат): готовим ТЗ/план/проверки, задаём до 3 уточняющих вопросов. **Файлы репозитория не меняем**.
- Mode 2 — Codex (Агент): по готовому ТЗ **правит репозиторий по умолчанию**, этапами, с проверками.
- Commits/push: делает пользователь вручную, если явно не попросили агента сделать commit/push.

## Snapshot: Проект
- Название: `craftsman` (десктоп‑редактор для писателей)
- Технологии: Electron + HTML/CSS (с сохранением текущей UI‑геометрии)
- Режим: desktop‑first, offline‑first
- Канон: `docs/BIBLE.md`
- Данные (цель vNext): проект‑папка v1 (manifest/styles/scenes/recovery/assets/backups), сцены как сущности, Yjs per scene
- Важно: кодовая база в переходе; в текущей реализации ещё могут встречаться legacy‑решения

## Snapshot: MVP правила
- Никаких аккаунтов/авторизации
- Никаких сетевых запросов/облаков/синхронизаций
- Anti‑paywall: запрещены `@tiptap-pro/*`, `@tiptap-cloud/*`, `registry.tiptap.dev`, `TIPTAP_PRO_TOKEN`
- Минимум зависимостей и “архитектуры на будущее”
- Любые крупные изменения — поэтапно, с минимальным риском регрессий

## Snapshot: Следующие шаги
1) Milestone 1: сборка renderer (esbuild bundling) без изменения UI.
2) Milestone 2: минимальный Tiptap editor (OSS) + undo/redo.
3) Milestone 3–4: project format v1 + scene storage + Yjs per scene + recovery.

## Snapshot: Перспектива (после MVP)
Зафиксированное видение (2026-01-23). Это **не** меняет ограничения MVP и не оправдывает “архитектуру на будущее” в текущем коде — только ориентир.

- Аудитория: автор + широкая аудитория.
- Платформы (возможная последовательность): довести macOS до “идеала” → web‑версия → мобильная версия → остальные платформы (Windows/Linux/Android/iOS).
- После MVP: сеть/облако/синхронизация → аккаунты → совместное редактирование (как в Google Docs).
- Экспорт: несколько форматов (после MVP).
- Масштаб текста: от 1 страницы до ~1000+; избегаем искусственных ограничений.
- Формат работы с файлами: один файл или много файлов — выбирается пользователем в настройках (после MVP / уточнить UX).
- Структура “проект/книга” в sidebar — опционально; планируются интеллект‑карты/майнд‑мэпы.

Ближайшие функциональные цели (MVP+):
- Глобальный поиск по проекту/документам — нужен уже на этапе MVP.
- История версий документа — нужна (точный объём/UX уточнить).
- Метрики/прогресс письма: цели, тайминг активности, средняя скорость печати (и т.п.).

## Recent WORKLOG (2026-01-27)
- Canon: добавлен `docs/BIBLE.md` (Craftsman vNext) и зафиксирован финальный пакет политик (security/deps/yjs fallback/perf/codex checklist).
- CI: добавлен OSS‑guard `scripts/check-no-paid-tiptap.mjs` + workflow `.github/workflows/oss-policy.yml` (pre/post install) + `npm audit`.
- Docs: синхронизированы `README.md`, `agents.md`, `docs/CONTEXT.md`, `docs/HANDOFF.md`, шаблоны и `docs/references/ROADMAP.md` под vNext; добавлен `docs/AGENT_START_PROMPT.md`.

## Tasks
- `docs/tasks/2026-01-24--sidebar-roman-sections-tree.md`
- `docs/tasks/2026-01-26--keyboard-shortcuts-guard-test.md`
- `docs/tasks/2026-01-26--page-size-calibration.md`
- `docs/tasks/2026-01-27--tz-001-oss-guard-ci.md`
- `docs/tasks/2026-01-27--tz-002-vnext-canon-docs.md`

## Brain Commands
- `npm run brain:status`
- `npm run brain:handoff`
- `npm run brain:log -- "..."`
- `npm run brain:new-task -- "..."`
- `npm run brain:savepoint -- "..."`
- `npm run brain:refs -- "..."`
