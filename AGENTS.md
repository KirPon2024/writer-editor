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

Список ниже остаётся полным authority denominator. После поставки P03,
при восстановлении уже прочитанного контекста той же задачи, допускается
`VALIDATED_CONTEXT_CACHE` по `docs/AGENT_START_PROTOCOL.md`, раздел 2A.
Всегда заново читать этот AGENTS.md, CANON_STATUS и сам startup protocol;
bootstrap заново проверяет HEAD, canon/source bytes и отдельно закреплённые
текущие admission/lease. Checkpoint не создаёт authority и не заменяет
preflight, native StageAdmission, свежую remote-проверку или required gates.
Без валидного checkpoint, при новом scope или любом invalidation — полный
порядок чтения. До terminal delivery P03 действует прежний полный протокол.

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

<!-- MAP_MOVE_PROVE_PROTOCOL_V1:BEGIN -->
## 1A. Универсальный рабочий цикл: MAP → MOVE → PROVE

`MAP_MOVE_PROVE_PROTOCOL_V1`

Этот цикл подчинён active canon, правилам репозитория, архитектурной декларации
и authority конкретной задачи. Он не уменьшает уже выданную агенту автономию:
внутри разрешённого scope агент самостоятельно выбирает методы и инструменты,
исследует, реализует и проверяет результат. Цикл не разрешает самовольно
расширять scope, ставить зависимости, включать network/cloud, использовать
секреты или выполнять destructive, privileged либо external actions.

Evidence и mutation authority — разные контракты:

```text
EVIDENCE_NEVER_CREATES_AUTHORITY

MUTATION_ALLOWED =
  TASK_AUTHORITY
  AND ACTIVE_CANON_COMPATIBLE
  AND REPO_POLICY_COMPATIBLE
  AND (RUNTIME_REVALIDATION_PASSED
       OR (NO_RUNTIME_MUTATION
           AND RUNTIME_REVALIDATION_NOT_APPLICABLE_BY_VALID_DECLARATION))
```

После обязательного bootstrap и чтения канона, но до первого edit, агент держит
минимальный рабочий пакет. Он является краткой формой мышления и не заменяет
`TASK_ARCHITECTURE_DECLARATION_V1` или preflight:

```text
O: observable outcome и acceptance observation
T: source of truth -> decision authority -> actual write/publication path
H: root-cause/solution hypothesis -> predicted observation
B: protected state, invariants, non-goals и rollback
P: cheapest sufficient proof плюс все mandatory gates
I: exact base, target, entity, revision, artifact, build и profile identities,
   где они применимы
```

### MAP

1. После обязательных bootstrap и canon reads расширять контекст прогрессивно,
   начиная с затронутых source, tests и evidence, а не поглощать весь repo без
   причины.
2. Проследить полный путь:
   `input -> validation -> decision -> authority -> mutation -> persistence -> publication -> result`.
3. До edit сформулировать hypothesis и наблюдение, которое подтвердит или
   опровергнет её; diagnosis без предсказуемого evidence не даёт write authority.
4. Зафиксировать защищённое чужое состояние, scope, exact identities, риски,
   rollback и самый дешёвый достаточный proof.

### MOVE

1. Делать одну согласованную концептуальную дельту. Один bounded vertical slice
   может затрагивать несколько слоёв, если у него один outcome и один rollback.
2. Сохранять всё pre-existing и unrelated; cleanup вне scope отделять.
3. UI, visibility, cache, heuristic, stale async result, fixture, screenshot,
   narrative receipt и self-authored count никогда не дают mutation authority.
4. Перед async publication повторно проверять project, lifecycle, entity,
   source revision, generation и текущую capability.
5. Внешний payload проверять до normalization, interpretation и извлечения
   path, command или write authority.
6. Не скрывать failure через silent fallback, swallowed exception, disabled
   test, skip/todo, synthetic success или подмену обязательного oracle.
7. Destructive, external, privileged или irreversible действие выполнять
   только при явной authority задачи и после точного разрешения target.

### PROVE

1. Выполнить cheapest sufficient evidence, покрывающий каждый затронутый
   invariant, и все обязательные repository gates; экономия не отменяет gate.
2. Проверить финальный diff и риск-ориентированные counterexamples: normal,
   boundary/adversarial и, когда применимо, stale/race/recovery/rollback.
3. Exit code `0` является process evidence, а не автоматическим доказательством
   пользовательского outcome.
4. Claim ограничивается exact SHA, build/profile, scope, numerator/denominator,
   artifact hashes и действительно исполненным oracle. Self-PASS запрещён.
5. Missing, stale, skipped, todo, zero-test, self-authored, different-head или
   count-only evidence означает `UNKNOWN` либо `FAIL`, но не `PASS`.
6. После третьего повторения одной failure signature прекратить loop и записать
   expected, actual, seed, exact HEAD, hashes и одну следующую hypothesis.

Сила утверждения определяется слабейшим обязательным звеном:

```text
CLAIM_STRENGTH = min(
  SOURCE_TRUST,
  EXECUTED_COVERAGE,
  ARTIFACT_INTEGRITY,
  SNAPSHOT_FRESHNESS,
  ORACLE_INDEPENDENCE
)
```

Неизвестное обязательное звено не может дать `PASS`.

```text
DONE =
  OUTCOME_OBSERVED
  AND REQUIRED_PROOFS_PASSED
  AND EXACT_IDENTITY_VERIFIED
  AND DIFF_REVIEWED
  AND PRE_EXISTING_WORK_PRESERVED
  AND (REQUIRED_DELIVERY_COMPLETE OR DELIVERY_NOT_APPLICABLE_BY_TASK_POLICY)
  AND NO_OPEN_BLOCKING_FINDING
  AND RESIDUAL_RISK_DECLARED
```

Финальный отчёт остаётся ровно тем, который требует
`AGENT_FINAL_REPORT_V1.schema.json` и раздел 12 ниже; этот цикл не создаёт второй
формат отчёта, новый tracker или альтернативный источник истины.
<!-- MAP_MOVE_PROVE_PROTOCOL_V1:END -->

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

### Universal Design Lab

Для локального UI-эксперимента, A/B-сравнения, исследования typography/spacing
или доканонической visual-проверки использовать глобальный `$design-lab` skill.

- Yalken остаётся read-only source на всём протяжении lab-эксперимента.
- Не копировать в этот репозиторий lab knowledge, runtime state, findings или
  local references.
- Лаборатория только предлагает варианты; owner выбирает treatment и отдельно
  разрешает local reference с причиной и ограничениями.
- Любое изменение Yalken после эксперимента — отдельная явно разрешённая задача
  с обычными bootstrap, declaration, scope и delivery gates этого репозитория.

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
