# Reference: ghostwriter (KDE)

- URL: https://github.com/KDE/ghostwriter
- License: GPL-3.0-only
- Tags: markdown, focus-mode, distraction-free, find-replace, outline, sidebar, export, preview, spellcheck
- Last checked: 2026-01-23

## Summary (1–3 bullets)
- Markdown‑редактор с “distraction free” режимом, сайдбаром/outline и Find/Replace.
- Полезен как UX‑референс для: фокус‑режим, поиск/замена, структура документа.
- GPL → код не копируем.

## Relevant parts (where to look)
- Find/Replace: `src/findreplace.*`
- Sidebar/outline: `src/sidebar.*`, `src/outlinewidget.*`
- Документ‑менеджмент: `src/documentmanager.*`

## MVP Now (что можно взять прямо сейчас)
- UX “Find/Replace”: диалог/панель, подсветка совпадений, навигация.
- Идеи distraction‑free: скрытие лишнего UI, режим “только текст”.

## Later (идеи на будущее, без внедрения сейчас)
- Экспорт через внешние процессоры (Pandoc и др.) — как идея пайплайна экспорта.
- Live preview/HTML — если когда‑то понадобится “preview режим” (не сейчас).

## License / usage notes
- Можно ли копировать код? **Нет** (GPL-3.0-only).
- Можно перенять UX‑идеи и реализовать своими средствами.

## Risks / pitfalls
- Проект Markdown‑ориентирован: у нас `.txt` + свои маркеры → переносим только UX.

## How to adapt in Craftsman (конкретно)
- Поиск: панель с результатами + управление из клавиатуры.
- Outline: простая навигация по заголовкам (`#`, `##`, `###`) из текущего текста (MVP+).

