# Agent Instructions (Craftsman vNext)

Этот файл определяет правила работы агента с продуктом `Yalken`. Имя
`craftsman` сохраняется в части package и legacy-путей до отдельного rename и
не означает другой продукт.

## Приоритет источников (“что является истиной”)
1) `docs/OPS/STATUS/CANON_STATUS.json` и указанный им active execution canon.
2) `CANON.md` — верхний repo canon решений и change control.
3) `docs/corex/COREX.v1.md` — философия, целевая архитектура, долгий горизонт (указатель: `docs/corex/COREX.md`; будущие версии: `COREX.vN.md`).
4) `docs/BIBLE.md` — product map и roadmap.
5) `README.md` — короткое описание и ссылки.
6) `docs/CONTEXT.md` — фактическое текущее состояние и инварианты.
7) `docs/PROCESS.md` — как работаем (ChatGPT → Codex, diff‑budget, проверки).
8) `docs/HANDOFF.md` — последний срез для быстрого входа.

Нельзя заменять шаг 1 запомненным именем active canonical document: сначала
прочитать resolver, затем именно тот документ, на который он указывает.

Если active execution canon, `CANON.md`, COREX и `docs/BIBLE.md` после сверки с
репозиторием не дают точного ответа — задать 1–3 уточняющих вопроса только по
high-impact неоднозначности и остановиться до ответа.

## Общие принципы
- Проект — инди без бюджета
- MVP важнее идеальной архитектуры
- Простые и надёжные решения предпочтительнее сложных
- Минимизировать зависимости и сложные фреймворки без прямого запроса
- Не закладывать архитектуру “на будущее” вне канона

## Обязательная доктрина интеграции фич
- Перед добавлением новой функции, процесса, worker, импорта, экспорта, анализа,
  панели, карты или другого обвеса прочитать
  `docs/YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md`.
- У каждой фичи два разных подключения: product plane отвечает за данные,
  Commands, Events, Queries, product ports и adapters; interface plane отвечает
  за Host contribution, surfaces, typed slots и проекцию через Design OS.
- Product Core владеет данными и смыслом; Command Kernel владеет действиями и
  availability; Design OS владеет только вычисляемой формой интерфейса.
- UI, surface, menu, toolbar, worker и feature pack не могут напрямую менять
  project truth, обращаться к storage или создавать частный command bus.
- Любая продуктовая мутация проходит через canonical command authority. Любой
  внешний эффект проходит через product port и adapter.
- Project persistence и shell-state persistence всегда раздельны. Safe reset
  оболочки не имеет права менять рукопись.
- Несохранённый editor buffer является `AUTHORING_WORKING_STATE` с no-loss
  duty, а не discardable transient UI-state; shell reset не может его терять.
- Command catalog для Design OS read-only, dispatch intent-only, а Command
  Kernel повторно проверяет capability независимо от видимости UI.
- Новая UI-зона требует `SURFACE_MANIFEST_V1` и типизированного slot. Вставка в
  случайный DOM запрещена.
- Manifest сначала является контрактным блоком ТЗ. Он не разрешает создавать
  speculative registry, новый feature pack или runtime infrastructure без
  отдельного принятого architecture contour.
- Целевая модель не считается текущим runtime без machine evidence. Текущий
  общий Core port layer остаётся частичным каркасом.
- Для feature-contour в ТЗ обязательны `FEATURE_INTEGRATION_MANIFEST_V1`,
  authority map, write path, read path, ports, fallbacks, recovery и negative
  bypass checks. Отсутствие этих данных означает STOP до уточнения контракта.

## Обязательные ограничения (MVP vNext)
- Desktop‑first, offline‑first: **никаких сетевых запросов**, аккаунтов, авторизации, облаков и синхронизации.
- Данные хранятся локально и не “запираются”:
  - формат проекта v1 (manifest/styles/scenes + assets/backups)
  - **обязательный recovery** (читаемый слепок)
  - **атомарная запись** на диск (existing `writeFileAtomic` / аналог)
- Сцены — отдельные сущности (изолированное редактирование).
- Экспорт: DOCX v1 первым (одна JS‑библиотека, без CLI/бинарей).

## Инварианты UI/дизайна
- Не менять структуру `src/renderer/index.html` и базовые классы без отдельного ТЗ.
- Новые стили добавлять только точечно и в рамках канона (обычно в конце CSS и для `.ProseMirror`/новых виджетов).
- Не подключать UI‑frameworks/компонент‑паки, которые навязывают внешний вид.

## Обязательный маршрут для задач интерфейса
- Состояние по умолчанию — `DESIGN_TOOL_ROUTER: NOT_APPLICABLE`. Сам факт наличия, установки или статуса `ACTIVE` у дизайн-инструмента не является причиной его запускать.
- Маршрут включается при создании нового продуктового экрана или заметном изменении существующего: композиции, пользовательского сценария, модели состояний компонента, типографики, палитры, токенов, системы отступов или утверждённого визуального эталона.
- Если текущая задача не меняет дизайн-контракт интерфейса, не запускать Lazyweb, A1 Gallery, Figma, Penpot, OpenPencil, Leonardo, дизайн-аудиты и другие инструменты матрицы. Исключение — явно запрошенная владельцем проверка конкретного интерфейсного артефакта.
- Перед ТЗ и реализацией прочитать `docs/YALKEN_DESIGN_OS_CHANGE_GUIDE_V2_2.md` и `docs/references/YALKEN_DESIGN_TOOL_MATRIX_V1.md`, затем выполнить `npm run brain:refs -- "ключевые слова задачи"`.
- Для продуктового UI начать исследование с Lazyweb, а остальные инструменты выбирать только по триггерам матрицы. Запускать весь пул в каждой задаче не требуется.
- Выбирать минимальный достаточный набор: один инструмент — один сформулированный вопрос — один проверяемый артефакт. Не открывать инструмент «на всякий случай» и не дублировать одинаковую проверку несколькими сервисами без причины.
- Если направление ещё не утверждено владельцем, сначала подготовить не более трёх проверяемых вариантов; переносить решение в код только после выбора одного направления.
- Матрица является внешним рабочим маршрутизатором: она не переопределяет `CANON.md`, актуальный Design OS, утверждённый скрин/Figma и решение владельца; не расширяет allowlist, diff budget, зависимости или runtime продукта.
- `docs/references/YALKEN_DESIGN_TOOL_RESERVE_V1.md` не является списком установок. Открывать резерв только когда в матрице нет подходящего средства; установка или включение кандидата из резерва требует отдельного обоснования и явного разрешения владельца.
- Маршрут остаётся `NOT_APPLICABLE` для backend/CLI/infra/docs-only задач и для механической визуальной правки без изменения дизайн-контракта. Изменение системных цвета, типографики, отступов, состояний или эталонного снимка всегда включает маршрут, даже если diff мал.
- Перед закрытием UI-контура применить релевантные проверки из матрицы и зафиксировать в отчёте: использованные источники, выбранное направление, выполненные аудиты и осознанно пропущенные инструменты.
- Запрещено превращать справочный инструмент, внешний дизайн-системный пакет, облачный сервис или MCP в зависимость приложения без отдельного ТЗ и явного решения владельца.

## SECURITY_POLICY (канон)
Electron:
- CSP обязателен
- navigation blocked
- new-window blocked
- no remote code

IPC:
- allowlist каналов
- payload validation
- запрет путей/команд

## DEPENDENCY_POLICY (канон)
Allowlist (MVP):
- `esbuild`
- `@tiptap/*` (OSS)
- `yjs`
- DOCX lib (одна)

Forbidden:
- `@tiptap-pro/*`, `@tiptap-cloud/*`
- UI frameworks
- state managers

CI:
- `npm audit`
- OSS‑guard: `npm run oss:policy`

## CODEX_CHECKLIST (обязателен в каждой задаче)
- Stage корректен
- Активные правила соблюдены
- Для новой фичи или процесса доктрина интеграции применена, оба plane описаны
- Product authority, Command authority и Design authority не смешаны
- Прямых UI, worker или feature-pack обходов Command Kernel и ports нет
- Unsaved authoring state имеет no-loss route и не смешан с shell/transient state
- Capability повторно проверяется Command Kernel; UI visibility не является enforcement
- Async projections привязаны к project, entity, revision и generation
- `DESIGN_TOOL_ROUTER` выставлен корректно; дизайн-инструменты не запускались вне интерфейсного контура
- UI не изменён (если это не отдельная UI‑задача)
- Новых зависимостей нет (если явно не разрешено)
- Paste policy соблюдена (если трогали редактор)
- Atomic write используется (если трогали запись)
- Recovery создаётся/обновляется (если трогали хранение)
- Тесты проходят (или явно сказано, что не запускалось)
- Diff‑budget соблюдён
- `npm run design-os:doctrine` проходит, если менялись doctrine или связанные entrypoints/templates

## GIT_DELIVERY_ENFORCEMENT (обязателен для всех агентов)
- Любая `write`‑задача обязана иметь явную delivery policy: `COMMIT_REQUIRED`, `PUSH_REQUIRED`, `PR_REQUIRED`, `MERGE_REQUIRED`.
- Если в брифе не указано иное явно, правило по умолчанию жёсткое: сделать commit, push, PR и merge.
- Любая `write`‑задача без `COMMIT_SHA` считается не выполненной.
- Если для задачи `PUSH_REQUIRED: true`, то без push задача считается не выполненной.
- Если для задачи `PR_REQUIRED: true`, то без PR задача считается не выполненной.
- Если для задачи `MERGE_REQUIRED: true`, то без merge задача считается не выполненной.
- Новый `write`‑task запрещён в грязном worktree, если он не является явным hygiene/isolation task.
- Между символическим закрытием текущего контура и открытием следующего нового write-контура нельзя начинать новый write-контур, пока delivery chain предыдущего контура либо не завершён полностью, либо не остановлен явно со статусом STOP и не принят owner.
- После завершения смыслового шага агент обязан сразу делать commit, а не оставлять изменения “на потом”.
- Для `report-only` задач commit/push/PR/merge не требуются, если только отчёт явно не верифицирует исторический run.
- Если любой обязательный шаг delivery цепочки не выполнен, итог задачи должен быть `STOP_NOT_DONE`.
- Если `TARGET_BRANCH` ушёл вперёд от зафиксированного `BINDING_BASE_SHA` и это ломает mergeable-состояние, задача обязана остановиться со статусом `STOP` и запросить новый owner-approved base SHA; тихий rebase запрещён.
- Любой отчёт по `write`‑задаче обязан явно содержать: `TASK_ID`, `HEAD_SHA_BEFORE`, `HEAD_SHA_AFTER`, `COMMIT_SHA`, `CHANGED_BASENAMES`, `STAGED_SCOPE_MATCH`, `COMMIT_OUTCOME`, `PUSH_RESULT`, `PR_RESULT`, `MERGE_RESULT`, `NEXT_STEP`.

## ARCH_DIFF_LOG (исключения)
Любое исключение из канона:
- фиксируется (с причиной)
- записывается в `docs/ARCH_DIFF_LOG.md`
- имеет rollback
- временное

Исключение без записи = ошибка.

## CODEX_OUTPUT_POLICY (обязателен в задачах по ТЗ)
- Финальный ответ должен быть ровно одним code block с языком `text` и без текста вне блока.
- Внутри отчёта использовать формат строк `KEY: VALUE` (чтобы можно было копировать).
- Запрещено: любые URL, markdown-ссылки, а также пути со слэшами (`/` или `\\`).
- Если нужно перечислять файлы — только basename (например `TOKEN_CATALOG.json`), без директорий.
