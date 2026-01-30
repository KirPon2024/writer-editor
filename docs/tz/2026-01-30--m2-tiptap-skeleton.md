# M2: Tiptap skeleton (feature-flag), UI no-diff

## Scope
- Только "скелет": инициализация editor state, базовый pipeline, адаптеры.
- Без миграции формата данных.
- Без новых фич (undo/redo, headings, footnotes, images — позже отдельными ТЗ).

## Allowlist (ONLY)
- docs/tz/2026-01-30--m2-tiptap-skeleton.md
- src/renderer/editor.js
- src/renderer/index.html (только если нужен скрытый feature-flag; визуальный diff = 0)
- src/main.js (только если нужно прокинуть env-флаг, без иных правок)

## Forbidden
- любые “улучшения поведения” (caret/selection, debounce, input pipeline и т.п.) вне явного ТЗ
- новые зависимости (Tiptap уже в package.json; больше ничего)
- изменения форматов данных / файлов проекта / IPC

## Definition of Done
- `USE_TIPTAP=0`: UI/поведение без изменений.
- `USE_TIPTAP=1`: Tiptap инициализируется в editor surface; ввод текста работает; undo/redo НЕ делаем в этом M2.
