# ТЗ для Codex: <название задачи>

> Шаблон под наш стиль: “Контекст/ограничения → Проблема → Цель → Что сделать → Приёмка → Промежуточные тестирования”.
> Держим MVP стабильным: offline‑first (без сети), без новых зависимостей без явного разрешения, по канону `CANON.md` и `docs/BIBLE.md`.

## Контекст / ограничения
- Технологии: Electron + vanilla HTML/CSS/JS
- Оффлайн, без сетевых запросов
- Истина: `CANON_STATUS.json` и resolved active canon → `CANON.md` → COREX → `docs/BIBLE.md`
- Формат данных: см. `docs/BIBLE.md` (project format v1; обязательны recovery/бэкапы/атомарная запись)
- Без новых зависимостей
- Изменения: (только стили / UI тулбара / editor.js / и т.п.)
- Diff budget: (ограничение масштаба правок: строки/блоки/файлы; запрет на рефакторинг/форматирование)
- Не ломать: save/open, бэкапы, темы, focus-mode, wrap, word count; если трогаем ввод/редактор — `Cmd/Ctrl+C/V/X/A`, undo/redo

## Feature integration preflight

> Обязателен для новой фичи, процесса, worker, import, export, analysis или UI
> surface. Источник методики:
> `docs/YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md`.

- `FEATURE_INTEGRATION_MANIFEST_V1`: приложен или `NOT_APPLICABLE` с причиной
- `PRODUCT_AUTHORITY`: канонические данные и их владелец
- `DERIVED_DATA`: пересобираемые поколения и evidence
- `COMMAND_AUTHORITY`: command IDs единственного write path
- `WRITE_PATH`: intent → dispatch → command → use case → mutation → event
- `READ_PATH`: source → revision-bound projection → Design OS → surface
- `EVENTS_AND_QUERIES`: события, queries и immutable projections
- `PRODUCT_PORTS`: внешние эффекты и требуемые adapters
- `DESIGN_OS_PORTS`: read-only catalogs и projections, intent-only dispatch
- `DESIGN_OS_CONTRIBUTION`: surfaces, typed slots и representations
- `STATE_CLASSES`: project, authoring working, derived, shell, transient
- `IDENTITY_GUARDS`: project, entity, revision и generation
- `SECURITY_BOUNDARY`: validation, normalization, size и path-authority limits
- `PLATFORM_FALLBACKS`: unavailable и degraded behavior
- `ACCESSIBILITY_AND_LOCALE`: keyboard parity, reduced motion, RTL, CJK и IME границы
- `RECOVERY`: atomicity, rollback и restore path
- `MIGRATIONS_AND_COMPATIBILITY`: versioning, downgrade и preservation
- `PERFORMANCE_BUDGET`: измеримый threshold и способ проверки
- `HOT_PATH_BOUNDARY`: что запрещено запускать при вводе
- `NEGATIVE_BYPASS_CHECKS`: прямой UI, worker, storage, IPC и private bus bypass
- `CURRENT_REALITY`: live, partial, planned и target-only границы
- `EVIDENCE_BINDINGS`: код, tests и proof для каждого live claim
- `MATERIALIZATION`: `EXISTING_SEAM`, `NEW_PORT` или `TARGET_ONLY`; manifest не создаёт speculative registry

Если создаётся новая визуальная зона:

- `SURFACE_MANIFEST_V1`: приложен
- `SURFACE_KIND`: …
- `SLOT_MAP`: …
- `PROJECTION_ADAPTER`: …
- `FALLBACK_SURFACE`: …

## Маршрутизатор дизайн-инструментов
> По умолчанию `NOT_APPLICABLE`. Ставить `APPLIED` только если задача меняет дизайн-контракт продуктового интерфейса. Доступность инструмента сама по себе не является триггером.

- `DESIGN_TOOL_ROUTER: NOT_APPLICABLE | APPLIED`

При `NOT_APPLICABLE` остановить этот блок: остальные поля не заполнять и не
запускать Lazyweb, A1 Gallery, Figma, Penpot, OpenPencil, Leonardo или другие
дизайн-инструменты.

Только при `APPLIED` заполнить:

- `DESIGN_VISUAL_QUESTION`: один конкретный вопрос, который нужно решить
- `DESIGN_SOURCE_OF_TRUTH`: канон, утверждённый скрин, Figma или решение владельца
- `DESIGN_RESEARCH_SOURCES`: только реально использованные источники
- `DESIGN_SELECTED_DIRECTION`: выбранное направление
- `DESIGN_AUDIT_TOOLS`: только реально выполненные проверки
- `DESIGN_TOOL_DEVIATIONS`: осознанно пропущенные инструменты и причина

Инструменты выбирать минимально по
`docs/references/YALKEN_DESIGN_TOOL_MATRIX_V1.md`.

## Референсы (скрины/видео/описание)
- Скрин 1: …
- Скрин 2: …
- Пояснение: …

## Похожие паттерны (из нашей базы знаний)
> Перед реализацией: `npm run brain:refs -- "ключевые слова"` и добавить сюда ссылки.

- Релевантные заметки:
  - …

## Codex TЗ Checklist (перед стартом)
> Отметьте, что ТЗ “детерминированное”: `docs/templates/CODEX_TZ_CHECKLIST.md`.

## Файлы
- …

## Проблема
- Как сейчас: …
- Почему плохо: …

## Цель
- Как должно быть: …

## UI “пиксель‑в‑пиксель” (если применимо)
> Заполняйте этот блок, если задача про микрогеометрию (линии, отступы, ширины, “прыжки” иконок).

### Инварианты (что не должно меняться)
- …

### Глоссарий UI (термины в этом ТЗ)
- toggle:
- root:
- leaf:
- indent column:
- vertical line:
- horizontal stub (“полка”):

### Числа/размеры (конкретные px или CSS переменные)
- Row height: …
- Отступы (padding/gap): …
- Длины линий/полок: …
- Точка обрыва/стыка: …

### Хуки (на что опираться в коде)
- Селекторы/атрибуты: (`data-level`, `.is-last`, `.is-expanded`, …)
- Можно добавить (минимально): …

### Запрещённые решения (чтобы не “обобщать”)
- Не делать: …

### Мини-тест (точные клики/ожидания)
- 1) …
- 2) …

### Матрица состояний (минимум)
- [ ] collapsed / expanded
- [ ] selected / unselected
- [ ] hover
- [ ] light / dark
- [ ] sidebar min / max width

## Что сделать
> Список конкретных изменений. Избегаем “в целом улучшить”.

### Разметка (если нужно)
- …

### Стили (если нужно)
- …

### Логика (если нужно)
- …

### Доступность (минимум)
- aria-label (для кнопок/селектов)
- клавиатура/tab‑order (если есть интерактив)

## Критерии приёмки
- [ ] …
- [ ] …
- [ ] Product, Command и Design authority не смешаны
- [ ] Product mutation проходит только через canonical Command
- [ ] UI получает immutable projection и не пишет в project truth
- [ ] Project persistence и shell-state persistence разделены
- [ ] Прямые обходы и missing fallback покрыты negative checks
- [ ] Unsaved authoring state не теряется при reset, fallback или crash route
- [ ] Capability повторно проверяется Command Kernel при dispatch
- [ ] Async result не публикуется при stale identity, revision или generation
- [ ] Target-only элементы не описаны как live runtime

## Промежуточные тестирования (после каждого шага)
> Если изменение “ядра” (редактор/рендер/сохранение/undo) — обязательно этапами (минимум 2–4 этапа).

Тест 1 — после шага 1:
- Команда: `npm run dev`
- Проверить: …

Тест 2 — после шага 2:
- …

Тест 3 — после шага 3:
- …

Тест 4 — регрессии:
- Использовать `docs/templates/REGRESSION_CHECKLIST.md`.

## Output contract (формат ответа Codex)
- Ровно один code block `text`; внутри только строки `KEY: VALUE`.
- `CHANGED_BASENAMES`: только имена файлов без директорий; URL, пути и `path:line` запрещены.
- Проверки: какие команды/ручные клики реально выполнены; если что-то не проверено — сказать явно.
- Инварианты/приёмка: отметить, что выполнено, и где остались риски/сомнения.
- Delivery: `COMMIT_SHA`, `PUSH_RESULT`, `PR_RESULT`, `MERGE_RESULT`, `NEXT_STEP`.
- Без “улучшений”: если потребовался рефакторинг — остановиться и спросить.

## Уточнения (максимум 3 вопроса, только high‑impact)
Q1:
Q2:
Q3:

## Риски и откат
- Что может сломаться:
- Как быстро откатить (минимальный rollback‑план):
