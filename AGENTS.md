# Yalken Agent Router

STATUS: ACTIVE_REPOSITORY_ENTRYPOINT
SCOPE: ALL_HUMAN_AND_AUTONOMOUS_AGENTS

Этот файл — обязательная точка входа в репозиторий. Он не является полной
энциклопедией: он заставляет агента детерминированно найти действующий канон,
понять архитектуру, объявить границы задачи и только потом менять файлы.

Если агент получил только обычную цель без отдельного ТЗ, этого достаточно:
контекст и ограничения он обязан восстановить из репозитория по протоколу ниже.

## 1. Нулевой шаг

До любых изменений выполнить из корня репозитория:

```text
npm run agent:bootstrap -- --objective "краткая цель задачи"
```

Команда read-only. Если она завершается ошибкой, работа останавливается с её
fail-signal. Нельзя обходить bootstrap ручным выбором старого канона.

После bootstrap прочитать в указанном им порядке:

1. `docs/OPS/STATUS/CANON_STATUS.json`.
2. Документ из `canonicalDocPath` resolver-а.
3. `CANON.md`.
4. `docs/corex/COREX.md` и указанную там текущую версию.
5. `docs/BIBLE.md`.
6. `docs/ARCHITECTURE_ONE_PAGE.md`.
7. `docs/PRODUCT_GLOSSARY.md`.
8. `docs/DOCUMENTATION_CONSTITUTION.md`.
9. `docs/CONTEXT.md`, `docs/PROCESS.md`, `docs/HANDOFF.md`.
10. Точные текущие код, тесты и evidence для затронутого контура.

Исторический receipt, roadmap или комментарий никогда не сильнее текущего кода,
exact-head evidence и более высокого источника истины.

Проект инди и без отдельного инфраструктурного бюджета. MVP важнее идеальной
архитектуры; простое надёжное решение предпочтительнее speculative framework.
Новые зависимости, абстракции «на будущее» и расширение release scope без
прямого canon/owner решения запрещены.

## 2. Архитектура, которую нельзя смешивать

```text
PRODUCT_TRUTH + COMMAND_MEANING + COMPUTED_INTERFACE_FORM = YALKEN
```

- Product Core владеет данными, доменной семантикой, идентичностью, схемами,
  миграциями, atomic persistence и recovery.
- Command Kernel владеет Commands, availability, capability policy, routing,
  effect reservation и единственным разрешённым путём product mutation.
- Design OS владеет только вычисляемой формой: surfaces, slots, layout,
  representation, visibility, shell modes, profiles и platform fallback.
- Renderer потребляет immutable revision-bound projections и отправляет intent.
  Он не вычисляет semantic truth и не пишет в Core, storage или platform API.
- Platform effects проходят через явно названный product port и adapter.
- Derived workers публикуют результат только при совпадении project, entity,
  source revision и generation.

Полный контракт находится в
`docs/YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md`.

## 3. Типы операций

Не использовать формулу «всё является командой» буквально.

- `COMMAND` — запрошенное намерение изменить product или governed shell state.
- `QUERY` — read-only чтение projection или capability; не создаёт truth.
- `EVENT` — уже случившийся доменный факт; не является просьбой выполнить write.
- `EFFECT` — filesystem, dialog, process или platform I/O через port и adapter.
- `BACKGROUND_JOB` — отменяемая derived-работа с identity/revision/generation guard.

UI может инициировать Command, но Command Kernel заново проверяет capability при
dispatch. Видимость кнопки или пункта меню никогда не является enforcement.

## 4. Классы состояния

- `PROJECT_STATE` — долговечная каноническая истина проекта.
- `AUTHORING_WORKING_STATE` — несохранённый текст и редактирование с no-loss duty.
- `DERIVED_STATE` — перестраиваемые индексы, графы, анализ и projections.
- `SHELL_STATE` — layout, panels, workspace presentation, profile и mode.
- `TRANSIENT_STATE` — hover, ephemeral selection decoration, animation и draft UI.

Нельзя хранить project truth в shell state, считать unsaved text transient или
делать Design OS reset способом изменения рукописи.

## 5. Каноническая терминология

- Product workspaces: `WRITE`, `PLAN`, `REVIEW`.
- Shell modes: `CALM_DOCKED`, `COMPACT_DOCKED`, `SPATIAL_ADVANCED`,
  `SAFE_RECOVERY`.
- Profiles: `BASELINE`, `SAFE`, `FOCUS`, `COMPACT`.
- В Writer v1 нет executable plugin runtime. Допустим только declarative
  internal feature pack без собственного Core, bus, storage writer или SDK.
- `CURRENT` означает доказанное exact-head runtime/evidence. `TARGET` означает
  целевую архитектуру и не может быть заявлен как live.

## 6. Обязательная декларация перед write

До первого edit агент обязан сформировать `TASK_ARCHITECTURE_DECLARATION_V1` по
шаблону `docs/templates/AGENT_TASK_ARCHITECTURE_DECLARATION_V1.json` и проверить:

```text
npm run agent:preflight -- --declaration <temporary-json-file>
```

Декларация может жить во временной директории и не обязана засорять repo. Она
фиксирует exact base SHA, scope, authority, write/read paths, ports, projections,
state classes, fallbacks, negative checks, current-vs-target и delivery policy.

Для docs-only задачи архитектурные поля не пропускаются: в них явно пишется
`NOT_APPLICABLE_DOCS_ONLY` с причиной. Пустое поле не считается решением.

## 7. Feature integration gate

Для новой фичи, процесса, worker-а, import/export, анализа или UI surface до
кода обязательны:

- product plane и interface plane;
- canonical Commands, Queries, Events и Effects;
- product ports и Design OS read-only ports;
- immutable projections и identity guards;
- `FEATURE_INTEGRATION_MANIFEST_V1`;
- `SURFACE_MANIFEST_V1` для новой визуальной зоны;
- capability fallback, recovery, performance, accessibility;
- negative tests на bypass, stale publication и authority leak.

Manifest — контракт, а не разрешение создать speculative runtime registry.

## 8. Hard stop signals

Немедленно остановиться при любом из условий:

- active canon не разрешается или расходится с repo truth;
- base SHA, branch, scope или worktree authority неоднозначны;
- dirty worktree содержит чужие изменения;
- UI/worker/pack пишет напрямую в Core, storage, IPC или platform API;
- отсутствует Command Kernel revalidation;
- смешаны product, authoring, derived, shell или transient state;
- внешний payload получил authority до validation/normalization/bounds;
- async result не имеет identity, revision и generation guard;
- target architecture выдаётся за live;
- обязательный test/evidence/CI пропущен, stale или self-authored;
- задача требует secret, destructive authority, real private data, dependency,
  network/cloud truth или расширение security boundary без явного решения owner.

Машинный реестр и точные коды находятся в
`docs/architecture/AGENT_ARCHITECTURE_MANIFEST_V1.json`.

## 9. MVP, security и dependencies

- Desktop-first, offline-first; product runtime не получает network/cloud truth.
- Локальные данные не запираются; atomic write и readable recovery обязательны.
- Сцены — отдельные сущности; editor surface не является source of truth.
- Electron: CSP, blocked navigation/new-window, no remote code.
- IPC: allowlist, payload validation, no path/command authority from renderer.
- Project format сохраняет manifest, styles, отдельные scenes, assets/backups;
  запись атомарна, recovery читаем и реально проверяется.
- Разрешённый MVP dependency set: `esbuild`, OSS `@tiptap/*`, `yjs` и одна
  DOCX-библиотека. Запрещены Tiptap Pro/Cloud, UI frameworks, state managers и
  executable plugin SDK для Writer v1.
- Dependency checks: `npm audit` и `npm run oss:policy`.

## 10. UI router

По умолчанию `DESIGN_TOOL_ROUTER: NOT_APPLICABLE` для backend, CLI, infra,
docs-only и механических правок без изменения design contract.

Для нового или существенно изменённого product UI сначала применить Lazyweb и
прочитать `docs/YALKEN_DESIGN_OS_CHANGE_GUIDE_V2_2.md` и
`docs/references/YALKEN_DESIGN_TOOL_MATRIX_V1.md`. Один инструмент отвечает на
один сформулированный вопрос; внешний сервис не становится runtime dependency.

- Router включается для нового экрана или изменения композиции, flow, component
  state model, typography, palette, tokens, spacing system или visual baseline.
- Вне такого контура не запускать Lazyweb, Figma, Penpot, OpenPencil, A1,
  design audit или другой инструмент только потому, что он доступен.
- До UI-ТЗ выполнить `npm run brain:refs -- "ключевые слова задачи"`.
- До owner choice показывать максимум три проверяемых направления.
- Reserve-инструмент требует обоснования и отдельного разрешения на установку.
- Не менять структуру `src/renderer/index.html`, базовые классы или системные
  стили без отдельного UI scope; точечные editor styles не создают новый visual
  language.

## 11. Worktree и delivery

- Не менять грязный owner checkout. Использовать существующий изолированный
  worktree или создать linked worktree на проверенном T7-Secure.
- Owner выбирает только canonical repo; агент сам находит branch worktree через
  `git worktree list --porcelain` и не просит owner переключать project.
- Для external task worktree проверить `/Volumes/T7-Secure`: mounted, writable,
  encrypted и UUID `D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2`. При mismatch — STOP.
- Не делать reset, stash, clean, silent rebase, force-push или удаление чужого WIP.
- Один bounded contour — один rollback — одна delivery chain.
- Default для write-задачи: `COMMIT_REQUIRED`, `PUSH_REQUIRED`, `PR_REQUIRED`,
  `MERGE_REQUIRED` равны `true`.
- Write без `COMMIT_SHA`, required push/PR/merge или clean scope proof имеет
  итог `STOP_NOT_DONE`. Новый write contour до closure текущей цепочки запрещён.
- Если target branch ушёл от binding base и mergeability нарушена, остановиться;
  silent rebase или незаявленный перенос base запрещён.
- После merge обязательны fetch exact `origin/main`, clean detached/worktree
  verification и повтор релевантных проверок на merged SHA.
- Self-PASS запрещён; claim не шире numerator, denominator, SHA и evidence.

## 12. Финальная проверка

Обязательный checklist:

- stage и changed scope совпадают с декларацией;
- active rules, architecture planes, state classes и current/target соблюдены;
- `DESIGN_TOOL_ROUTER` корректен, UI не изменён вне UI scope;
- новых зависимостей и runtime network нет без owner decision;
- paste policy соблюдена, если затронут editor;
- atomic write и recovery сохранены, если затронуто persistence;
- focused negative, affected-chain и required baseline реально прошли;
- skips, todo, zero-test и stale evidence не выданы за green;
- diff budget, rollback и full delivery chain соблюдены.

Любое временное исключение из канона требует причины, rollback и записи в
`docs/ARCH_DIFF_LOG.md`. Исключение без записи считается нарушением.

Перед завершением выполнить:

```text
npm run agent:guardrails
```

И отчитаться: task id, before/after/merged SHA, `CHANGED_BASENAMES`, tests,
commit outcome, push, PR, CI, merge, exact-head verification, открытые
ограничения и один следующий шаг.

Для задач по ТЗ действует `CODEX_OUTPUT_POLICY`: ровно один `text` code block,
строки `KEY: VALUE`, без URL и путей со slash; файлы только basenames.
