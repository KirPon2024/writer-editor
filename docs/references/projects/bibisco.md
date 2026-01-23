# Reference: bibisco

- URL: https://github.com/andreafeccomandi/bibisco
- License: GPL-3.0-only
- Tags: electron, contenteditable, treeview, sidebar, project, search, find-replace, backup, autosave, stats, export
- Last checked: 2026-01-23

## Summary (1–3 bullets)
- Писательское приложение (проект/персонажи/главы) с web‑UI внутри десктопа; есть contenteditable и дерево.
- Интересно как “похожий стек” (HTML/CSS/JS) и как организованы сервисы: поиск/счётчики/бэкапы.
- GPL → код не копируем; используем только идеи/структуру.

## Relevant parts (where to look)
- Contenteditable: `bibisco/app/directives/contenteditable.js`
- Treeview: `bibisco/app/directives/treeview.js`
- Поиск: `bibisco/app/services/SearchService.js`
- Бэкапы/проект: `bibisco/app/services/ProjectService.js` (искать `backup`)
- DOM find/replace: `bibisco/app/custom_node_modules/findAndReplaceDOMText.js`

## MVP Now (что можно взять прямо сейчас)
- Идеи по поиску/подсветке в contenteditable (подходы, UX паттерны).
- Идеи по организации авто‑бэкапов и сервисов вокруг редактора.

## Later (идеи на будущее, без внедрения сейчас)
- Проектная модель (главы/сцены/сущности) как ориентир UX для “книга‑режима”.
- Экспортные пайплайны (ePub и др.) — как ориентир UX.

## License / usage notes
- Можно ли копировать код? **Нет** (GPL-3.0-only).
- Разрешено: описать паттерны, переосмыслить и реализовать самостоятельно.

## Risks / pitfalls
- Внутри bibisco много своего фреймворка/слоёв — не переносить структуру 1:1.

## How to adapt in Craftsman (конкретно)
- Для поиска: “сервис поиска” + визуальная подсветка в редакторе, но без заимствования кода.
- Для дерева: отдельный модуль sidebar “проект/структура” (позже).

