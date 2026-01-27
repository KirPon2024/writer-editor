# ТЗ‑002: Канон vNext в репо (CANON + BIBLE + синхронизация docs)

> Статус: выполнено в репо (2026-01-27). Файл оставлен как канонический “вертикальный срез” для повторения/проверки.

## Контекст / инварианты
- Верхний канон решений/изменений: `CANON.md`.
- Канон проекта и дорожная карта: `docs/BIBLE.md`.
- Offline‑first, без сети/аккаунтов/облака в MVP.
- Дизайн/UI геометрию не меняем (в этой задаче вообще не трогаем `src/**`).
- Anti‑paywall: запрет `@tiptap-pro/*`, `@tiptap-cloud/*`, `registry.tiptap.dev`, `TIPTAP_PRO_TOKEN`.

## Ограничения
- Разрешено менять/добавлять только:
  - `docs/**`
  - `README.md`
  - `agents.md`
- Запрещено менять:
  - `src/**`, `test/**`, `scripts/**`, `.github/**`, `package.json`
- Diff budget:
  - ≤ 2 новых файла (`docs/BIBLE.md`, при необходимости доп. доки канона)
  - ≤ 10 изменённых файлов

## Что сделать (детерминированно)
0) Создать `CANON.md` как верхний источник истины (управление изменениями) и сослаться на него из `docs/BIBLE.md`, `README.md`, `agents.md`.
1) Создать `docs/BIBLE.md` и зафиксировать:
   - дорожную карту vNext
   - инварианты (UI/архитектура/offline/anti‑paywall)
   - финальный пакет политик: DOCX v1, SECURITY_POLICY, DEPENDENCY_POLICY, YJS FALLBACK, PERFORMANCE, CODEX_CHECKLIST, ARCH_DIFF_LOG, DoD.
2) Обновить “нормативные” документы под vNext и убрать закрепление legacy `.txt` как MVP‑истины:
   - `README.md`
   - `agents.md`
   - `docs/CONTEXT.md`
   - `docs/HANDOFF.md`
   - `docs/templates/*` (минимум: `FEATURE_TZ.md`, `EDITOR_CORE_TZ.md`, `REGRESSION_CHECKLIST.md`)
   - `docs/references/ROADMAP.md` (пометка, что канон — `CANON.md` / `docs/BIBLE.md`)
3) Добавить `docs/WORKLOG.md` запись по дате.

## Acceptance criteria (DoD)
- [ ] `CANON.md` существует и является верхним источником истины по процессу/изменениям.
- [ ] `docs/BIBLE.md` существует и содержит канон + финальные политики.
- [ ] `README.md`, `agents.md`, `docs/CONTEXT.md`, `docs/HANDOFF.md` не закрепляют legacy `.txt` как MVP‑истину.
- [ ] Шаблоны `docs/templates/*` синхронизированы с vNext.
- [ ] `docs/WORKLOG.md` обновлён.
- [ ] `src/**` не изменён.

## Проверки
- Ручная: быстрый поиск по репо на “формат хранения: `.txt`” в нормативных docs (README/agents/CONTEXT/templates) — не должно остаться как “канон”.

## Output contract
- Изменённые файлы: список + `path:line` ключевых мест.
- Подтверждение: `src/**` не трогал.
- Если какие-то legacy `.txt` упоминания оставлены намеренно (например в старых `docs/tasks/*`) — перечислить где и почему.
