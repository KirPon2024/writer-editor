# Reference: novelWriter

- URL: https://github.com/vkbo/novelWriter
- License: GPL-3.0-only
- Tags: multi-file, project-format, markdown, metadata, project-tree, outline, global-search, find-in-project, autosave, version-control
- Last checked: 2026-01-23

## Summary (1–3 bullets)
- Plain-text редактор романов: проект из множества документов + минимальная разметка (Markdown‑like) + метаданные.
- Сильный референс по **формату проекта** (дружит с git/синком) и по “Find in Project”.
- GPL → код не копируем, используем как источник идей/UX и как “что пользователи ожидают”.

## Relevant parts (where to look)
- Проектный формат/хранение: `docs/source/technical/storage.rst`
- Поиск по проекту: `novelwriter/gui/search.py` (также искать `Find in Project`)
- Меню/вызовы: `novelwriter/gui/mainmenu.py`

## MVP Now (что можно взять прямо сейчас)
- UX “Find in Project”: формат выдачи, ограничения, подсветка/переход к результату (идеи).
- Подход “минимальной разметки” поверх plain text (концепт совместим с `.txt`).

## Later (идеи на будущее, без внедрения сейчас)
- Формат проекта (папка/файлы/индекс) как основа multi-document режима.
- Метаданные в тексте (комментарии/синопсис/ссылки) — как расширяемая идея.

## License / usage notes
- Можно ли копировать код? **Нет** (GPL-3.0-only).
- Можно описать формат/паттерны своими словами и реализовать собственно.

## Risks / pitfalls
- “Проектный” формат сильно меняет модель приложения — внедрять только после стабилизации MVP.
- Много “писательских сущностей” (заметки/метаданные) → легко раздувает scope.

## How to adapt in Craftsman (конкретно)
- Для multi-file: хранить `content/*.txt` + простой индекс (JSON/INI) + человекочитаемые имена.
- Для поиска: отдельная панель результатов + переход по “документ:позиция”.

