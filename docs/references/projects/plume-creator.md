# Reference: Skribisto (ex Plume Creator)

- URL: https://github.com/ParaplegicRacehorse/plume-creator
- License: GPL-3.0-only
- Tags: projects, items, folders, plugins, autosave, backup, export, stats, search, mobile, accessibility
- Last checked: 2026-01-23

## Summary (1–3 bullets)
- Наследник Plume Creator: “проект из items/folders” + планы на whiteboard/динамические лэйауты.
- Есть много “будущих” для нас тем: backup paths, snapshots, export, mobile‑friendly UI.
- GPL → код не копируем.

## Relevant parts (where to look)
- Описание целей/частей в README (C++ Qt + QML; проект = SQLite).
- Плагины/интерфейсы: папка `plugins/` (для понимания UX/возможностей).

## MVP Now (что можно взять прямо сейчас)
- Только идеи UX: структура проекта “items/folders”, доступность, режимы UI.

## Later (идеи на будущее, без внедрения сейчас)
- Snapshot/история версий по документам.
- Backup в несколько путей.
- Адаптивный UI под мобильные устройства.

## License / usage notes
- Можно ли копировать код? **Нет** (GPL-3.0-only).

## Risks / pitfalls
- Другой стек (Qt/QML) и хранилище (SQLite) → переносим только продуктовые идеи.

## How to adapt in Craftsman (конкретно)
- Для “проектного” режима: дерево items/folders в sidebar + “страницы” разных типов (позже).

