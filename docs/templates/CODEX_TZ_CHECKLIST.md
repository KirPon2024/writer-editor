# Codex TЗ Checklist (короткий)

> Цель: сделать ТЗ детерминированным, чтобы агент не “обобщал” и не приходилось переделывать много раз.

- [ ] **Один запрос = одно действие** (одна цель, без “заодно”)
- [ ] **Маршрутизатор дизайна**: указан `APPLIED` или `NOT_APPLICABLE`; при `NOT_APPLICABLE` дизайн-инструменты не запускались
- [ ] **Feature doctrine**: для новой фичи или процесса прочитан `YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md`
- [ ] **Два plane**: product plane и interface plane описаны раздельно
- [ ] **Authority map**: Product Core, Command Kernel и Design OS не смешаны
- [ ] **Manifest**: приложен `FEATURE_INTEGRATION_MANIFEST_V1`; для новой UI-зоны также `SURFACE_MANIFEST_V1`
- [ ] **Materialization**: указан `EXISTING_SEAM`, `NEW_PORT` или `TARGET_ONLY`; speculative registry не создаётся
- [ ] **No bypass**: UI, worker и feature pack не пишут напрямую в Core, storage, IPC или platform API
- [ ] **State split**: project, authoring working, derived, shell и transient state разделены
- [ ] **No-loss authoring**: unsaved editor content не теряется при shell reset или fallback
- [ ] **Port direction**: catalogs и projections read-only, dispatch intent-only
- [ ] **Capability**: Command Kernel повторно проверяет capability независимо от UI visibility
- [ ] **Async identity**: project, entity, revision и generation guards определены
- [ ] **External input**: validation, normalization, size limits и path authority определены
- [ ] **Fallback и recovery**: определены degraded path, rollback и negative checks
- [ ] **Evidence**: каждый live claim привязан к коду, тесту или machine proof
- [ ] **Минимальность дизайн-инструментов**: при `APPLIED` назван один визуальный вопрос и выбран только необходимый набор по матрице
- [ ] **Файлы**: перечислены явно; всё остальное запрещено
- [ ] **Diff budget**: ограничение масштаба (строки/блоки/файлы), запрет на форматирование/рефакторинг
- [ ] **Источник правды**: что считать идеалом (скрин/Figma/node-id/описание) + приоритет источников
- [ ] **Инварианты**: 3–7 пунктов “что не меняется” (поведение/геометрия/состояния)
- [ ] **Числа**: где нужно — px/переменные/формулы вместо “чуть/примерно”
- [ ] **Хуки**: на какие селекторы/атрибуты/классы опираться; что можно добавить минимально
- [ ] **Глоссарий UI**: термины “toggle/root/leaf/полка/вертикаль/…” определены однозначно (если задача про UI)
- [ ] **Запрещённые решения**: 3–5 пунктов “не делать так”
- [ ] **Матрица состояний**: 4–6 режимов проверки (collapsed/expanded, selected, hover, light/dark, widths)
- [ ] **Приёмка**: чек‑лист [ ] с измеримыми критериями
- [ ] **Тесты**: точные шаги “клик/команда → ожидаемый результат”
- [ ] **Шорткаты**: перечислить “не ломать” (Cmd/Ctrl+C/V/X/A/Z + zoom) и добавить ручную проверку
- [ ] **Output contract**: один блок `text`, строки `KEY: VALUE`, `CHANGED_BASENAMES` без путей и URL, проверки и delivery outcomes
- [ ] **Стоп‑протокол**: если данных не хватает — остановиться и задать 1–3 high‑impact вопроса
