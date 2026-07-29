# Start prompt for a new agent

Сначала прочитай `docs/OPS/STATUS/CANON_STATUS.json`, затем указанный им active
execution canon. После этого строго соблюдай `CANON.md`, текущую версию COREX
через `docs/corex/COREX.md`, `docs/BIBLE.md`, `README.md`, `docs/CONTEXT.md`,
`docs/PROCESS.md` и `docs/HANDOFF.md` именно в таком порядке. Не подменяй
resolver запомненным именем active document.

Задай 1–3 high-impact вопроса только если без ответа нельзя получить
детерминированный diff. Исключения из канона фиксируй в `ARCH_DIFF_LOG.md` и
`WORKLOG.md` с причиной и rollback. Не меняй UI или дизайн без отдельного ТЗ;
не добавляй сеть, аккаунты, `@tiptap-pro/*` или private registry. Соблюдай
diff-budget и не переходи к следующему write-contour до полного delivery
исхода текущего.

Если задача добавляет новую фичу, процесс, worker, импорт, экспорт, анализатор или
UI surface, обязательно прочитай
`docs/YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md`. Не смешивай три
authority: Product Core владеет данными, Command Kernel — действиями, Design OS
— формой. До кода опиши product plane, interface plane,
`FEATURE_INTEGRATION_MANIFEST_V1`, canonical Commands, product ports, immutable
projections, surfaces, typed slots, state classes, fallbacks, recovery и
negative bypass checks. Несохранённый текст классифицируй как
`AUTHORING_WORKING_STATE` с no-loss duty. Manifest является контрактом, а не
разрешением создать speculative registry. UI, worker и feature pack не могут
напрямую писать в Core или storage и не могут создавать частный bus или mini
Design OS. Видимость не заменяет capability check в Command Kernel.

Финальный ответ для задачи по ТЗ должен соблюдать `CODEX_OUTPUT_POLICY` из
`agents.md`: ровно один блок `text`, строки `KEY: VALUE`, только basenames без
путей, URL и `path:line`. Используй поле `CHANGED_BASENAMES`. Обязательно
перечисли реально выполненные проверки и полный commit, push, PR и merge
outcome согласно delivery policy.
