# Reference: Manuskript

- URL: https://github.com/olivierkes/manuskript
- License: GPL-3.0-or-later
- Tags: outline, corkboard, index-cards, project-tree, scenes, focus-mode, export, spellcheck, backup, autosave, stats
- Last checked: 2026-01-23

## Summary (1–3 bullets)
- “Комбайн писателя” на Python/PyQt: outline + index cards, персонажи/мир, фокус‑режим.
- Интересен как UX‑референс для “проект/сцены/структура” и хранения человекочитаемыми файлами.
- GPL → код не копируем, берём только идеи и UX‑паттерны.

## Relevant parts (where to look)
- Проектный формат/сохранение: `manuskript/load_save/version_1.py`
- Конвертеры/экспорт/импорт: `manuskript/converters/`, `manuskript/importer/`
- Паттерны по структуре: поиск по репо `outline`, `index cards`, `corkboard`, `distraction`

## MVP Now (что можно взять прямо сейчас)
- UX‑идеи: режимы “outline/index cards”, подход к структуре книги (сцены/главы).
- Подход к “устойчивому” хранению (plain text + метаданные рядом) как ориентир.

## Later (идеи на будущее, без внедрения сейчас)
- Проект из множества файлов/сцен + экспорт (ePub/DocX/HTML и т.п.) — как ориентир UX.
- Встроенные инструменты анализа/статистики (частотный анализ и т.п.) — как идеи.

## License / usage notes
- Можно ли копировать код? **Нет** (GPL-3.0-or-later).
- Берём только идеи/паттерны: формат проекта, UX структуры, термины/привычки пользователей.

## Risks / pitfalls
- Слишком большой “комбайн”: легко перетянуть в Craftsman ненужные сущности.
- Отличается стек (PyQt) → переносим только UX/структуру, не реализацию.

## How to adapt in Craftsman (конкретно)
- Если пойдём в multi-file проект: сцены/заметки как отдельные `.txt` + простой индекс/метаданные.
- Для UI: sidebar “структура” + режим “карточки” как отдельное представление (позже).

