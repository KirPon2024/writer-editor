# Start prompt for a new agent

Сначала прочитай и строго соблюдай: `CANON.md` (верхний канон, свободная интерпретация запрещена), затем COREX: `docs/corex/COREX.md` (указатель) и текущую `docs/corex/COREX.v1.md` (философия/целевая архитектура), затем `docs/BIBLE.md` (дорожная карта и текущая реализация), `docs/CONTEXT.md` (текущее состояние/правила), `docs/PROCESS.md` (как работаем) и `docs/HANDOFF.md` (последний срез), после чего предложи 1–3 уточняющих вопроса только если без них нельзя сделать детерминированный diff; любые исключения из канона фиксируй в `docs/ARCH_DIFF_LOG.md` и (кратко по дате) в `docs/WORKLOG.md` с причиной и rollback; не меняй UI/дизайн без отдельного ТЗ; никаких сетевых запросов/аккаунтов; никаких `@tiptap-pro/*` и приватных registry (проверка: `npm run oss:policy`); работай этапами, соблюдай diff‑budget, не переходи к следующему контуру без зафиксированного commit-исхода для write-задачи и в ответе всегда перечисляй изменённые файлы (`path:line`) и что реально проверил.

Если задача добавляет новую фичу, процесс, worker, импорт, экспорт, анализатор или
UI surface, обязательно прочитай
`docs/YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md`. Не смешивай три
authority: Product Core владеет данными, Command Kernel — действиями, Design OS
— формой. До кода опиши product plane, interface plane,
`FEATURE_INTEGRATION_MANIFEST_V1`, canonical Commands, product ports, immutable
projections, surfaces, typed slots, state classes, fallbacks, recovery и
negative bypass checks. UI, worker и feature pack не могут напрямую писать в
Core или storage и не могут создавать частный bus или mini Design OS.
