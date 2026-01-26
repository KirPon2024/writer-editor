# ТЗ для Codex: добавить тест‑предохранитель от поломки Cmd/Ctrl шорткатов (Edit menu roles)

> Цель: чтобы `Cmd+C/V/A/X/Z` на macOS больше не “отваливались” из‑за случайного удаления `Edit` меню/ролей в Electron app menu.
> Решение: добавить **статический** тест (Node `--test`), который проверяет, что в `src/main.js` в меню присутствует `Edit` (`role: 'editMenu'`) или хотя бы набор role‑items `copy/paste/selectAll/cut/undo/redo`.

## Контекст / ограничения
- Проект: Electron desktop app, полностью оффлайн.
- Без новых зависимостей.
- Diff budget: маленький; добавляем **один** тест‑файл в `test/`.
- Не ломать: `npm test`, сборку, запуск приложения.
- Тест должен быть кроссплатформенным (без привязки к macOS в рантайме).

## Почему это нужно (root cause)
На macOS в Electron системные шорткаты редактирования (`Cmd+C/V/A/X/Z`) часто “привязаны” к application menu. Если приложение задаёт кастомный `Menu.setApplicationMenu(...)` и в шаблоне нет `Edit` (`role: 'editMenu'`) или role‑items (`copy/paste/selectAll/...`), шорткаты могут перестать работать даже в `contenteditable`/`input`/`textarea`.

## Что сделать
1) Создать тест `test/keyboard-shortcuts.test.js` (Node test runner, без Electron).
2) Тест читает `src/main.js` как текст и проверяет:
   - Либо присутствует `role: 'editMenu'`,
   - Либо присутствуют **все** роли: `undo`, `redo`, `cut`, `copy`, `paste`, `selectAll`.
3) Если условие не выполнено — тест должен падать с понятным сообщением (“Missing Edit menu roles: copy/paste/selectAll…”, и т.п.).

## Критерии приёмки
- [ ] `npm test` проходит локально.
- [ ] Тест падает, если удалить `Edit`/`Правка` меню или убрать роли `copy/paste/selectAll` из `src/main.js`.
- [ ] Нет новых зависимостей, нет сетевых запросов, тест не запускает Electron.

## Проверки (выполнить реально)
- Команда: `npm test`

## Output contract (ответ Codex)
- Изменённые файлы: только `test/keyboard-shortcuts.test.js:<line>`.
- Проверки: указать, запускался ли `npm test` (если нет — сказать прямо).

