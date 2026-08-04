# Yalken Writer — Repo Canon

STATUS: ACTIVE_REPO_CHANGE_CONTROL_CANON
ROLE: ENTRYPOINT_AND_INTERPRETATION_LAYER

## 0. Назначение

Этот документ фиксирует:
- как в репозитории определяется источник истины,
- какие правила считаются обязательными на уровне change control,
- как читать product-track и factual docs без split-brain.

Machine-bound blocking law определяется не этим документом сам по себе, а через active execution canon.

## 1. Источник истины

Порядок чтения:
1. `CANON_STATUS.json` и active canonical execution document.
2. Этот `CANON.md` как верхний repo entrypoint и change-control canon.
3. `docs/corex/COREX.md` как resolver текущего COREX и `docs/corex/COREX.v2.md` как философия и target architecture.
4. `docs/BIBLE.md` как product map и target model.
5. `docs/CONTEXT.md` и `docs/HANDOFF.md` как factual operational docs.

Правила:
- blocking решения принимаются только от active canon;
- product map не может сам по себе создавать blocking law;
- factual docs не могут переопределять active canon;
- split-brain между несколькими активными truth surfaces запрещён.

## 1.1 Repository-Native Agent Bootstrap

Любой агент начинает работу через `AGENTS.md` и
`docs/AGENT_START_PROTOCOL.md`. До первого write он обязан:

1. Выполнить read-only `npm run agent:bootstrap -- --objective "<one concrete outcome>"`.
2. Прочитать выданный bootstrap-ом authority order и точные task sources.
3. Для write-задачи создать архитектурную декларацию по machine schema и
   выполнить `npm run agent:preflight -- --declaration <file>`.
4. Считать `current runtime` и `target architecture` разными классами истины.
5. Остановиться при конфликте authority, неполном scope, грязном writer
   worktree, неизвестном владельце state/write path или невалидном preflight.

Отдельный вводный архитектурный промт не является источником истины и не нужен,
если агент имеет доступ к репозиторию. Репозиторий обязан сам выдавать
достаточный контекст через entrypoint, resolver, manifest и детерминированные
проверки. Автоматизированный или cross-thread state-changing dispatch всё ещё
требует отдельный execution ticket по active bootstrap policy.

## 2. Active Canon Resolution

1. Active execution canon определяется только через `docs/OPS/STATUS/CANON_STATUS.json`.
2. Repo обязан иметь один must-entrypoint active canon.
3. Любое обновление active canon требует синхронной проверки bridge layer и factual docs.
4. Устаревшие milestone narratives не считаются действующим law только потому, что они когда-то были каноном.

## 3. Writer V1 Product Direction

`Yalken Writer v1` — это calm local-first writer tool со следующими обязательными ориентирами:
- strict data core,
- reliable primary editor path,
- zero-bypass command surface,
- safe reset and restore,
- bounded spatial containers,
- mutable design that never threatens text truth.

Не считаются `v1 release criteria`:
- platform-first expansion,
- executable plugin ecosystem,
- cloud truth,
- transport rollout,
- broad shell freedom,
- ecosystem breadth без прямой пользы для writing safety и recovery.

## 4. Hard Gates And Sequencing

1. `PRIMARY_EDITOR_PATH` — жёсткий stop gate для major shell и spatial work.
2. До closure разрешены только:
   - editor closure work,
   - data safety work,
   - command surface work,
   - safe derived work, не меняющий editor truth.
3. Closure должен быть подтверждён одним machine-carried packet с checklist, sign-off, evidence set и canon reference.
4. После editor closure выполняется один factual doc cutover pass.
5. После factual doc cutover в активных документах должна остаться одна active product truth.

## 5. MVP Invariants

Обязательные инварианты `Writer v1`:
- desktop-first,
- offline-first,
- локальная истина без cloud или network truth,
- сцены как отдельные сущности,
- editor surface не источник истины,
- atomic write и recovery обязательны,
- DOCX first export,
- никаких paywall-зависимостей,
- никаких executable plugins в `v1`.

## 5.1 Feature Integration Interpretation

Методическая детализация этой границы находится в
`docs/YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md`. Доктрина подчинена
active canon и этому документу; она не открывает новый release scope.

Обязательная интерпретация для новых фич и процессов:

1. Product Core владеет product truth, доменной семантикой, recovery и
   каноническими операциями.
2. Command Kernel владеет command meaning, availability, capability policy и
   единственным разрешённым маршрутом продуктовых мутаций.
3. Design OS владеет вычисляемой формой: surfaces, slots, layout, profiles,
   visibility, projection и platform fallback.
4. Каждая фича имеет отдельные product-plane и interface-plane контракты.
5. Product ports и Design OS ports нельзя смешивать или называть неоднозначно.
6. UI, worker и feature pack не получают прямой write-доступ к Core, storage,
   IPC или platform APIs.
7. Project persistence и shell-state persistence остаются разными authority.
8. Target architecture нельзя выдавать за live runtime без machine evidence.
9. Несохранённый текст является product-plane authoring working state с
   no-loss duty; Design OS reset не может считать его disposable UI-state.
10. UI visibility не обеспечивает capability: Command Kernel повторно
    проверяет availability и capability при dispatch.
11. Feature и surface manifests сначала являются контрактами ТЗ и не создают
    runtime registry, feature pack или plugin system автоматически.
12. Async derived results публикуются только при совпадении project, entity,
    source revision и generation.

## 6. Process Invariants

1. Один bounded contour — один осмысленный vertical slice.
2. Write-contour не считается закрытым без commit-исхода или явно допустимого deferred-исхода для read-only OPS.
3. False-green, stale-green и scope drift запрещены.
4. Factual docs обновляются одним pass после closure, а не фрагментами “когда получится”.
5. Merge идёт только через approved PR path и действующую automation policy.
6. `ROLE_CONTRACT_OPS_PROTOCOL` обязателен; источник исполнения этого контракта — `docs/PROCESS.md`.

## 7. Repo Interpretation Rules

1. `docs/BIBLE.md` описывает product map и north star.
2. `docs/CONTEXT.md` описывает фактическое текущее состояние.
3. `docs/HANDOFF.md` нужен для быстрого входа следующего агента.
4. `docs/PROCESS.md` задаёт рабочий протокол исполнения.
5. Если factual docs и map docs расходятся, repo обязан выполнить cutover или reconciliation, а не жить в двух истинах.

## 8. Current Cutover Reality

Текущая активная реальность репозитория:
- active execution canon уже содержит writer-specific narrowing и factual doc cutover rules,
- текущий repo-level repair drift закрыт на main после merge gate и post-merge reconfirm,
- factual docs должны оставаться согласованными с post-merge repo-wide machine truth на main,
- Phase 03 blocker закрыт на main через merged repair wave,
- true Phase 04 design-layer baseline закрыт на main через merged repair wave,
- Phase 05 bounded spatial shell chain закрыт на main через merged repair wave,
- Phase 06 explicit skip contour закрыт на main через merged repair wave,
- Phase 07 required closure set закрыт на main через merged repair wave и post-merge reconfirm,
- branch-local closure остаётся историческим предшественником repo-wide done, а не текущим финальным состоянием,
- overall repair wave считается repo-level closed после merge gate и post-merge reconfirm,
- broader freedom и post-version-one evaluation не открываются автоматически после repair closure.

После release hardening:
- broader freedom не становится автоматическим продолжением `Writer v1`,
- post-version-one exploration допускается только как отдельный evaluation-only axis,
- этот evaluation-only axis не переоткрывает закрытые `Writer v1` gates сам по себе.

## 9. Owner-Approved Toolbar Visual Baseline

`TOOLBAR_LIGHTWEIGHT_CONTROL_TEXT_300_004` принят владельцем как действующий визуальный baseline главного форматирующего тулбара.

Обязательный контракт baseline:
- видимые текстовые значения контролов в горизонтальном и вертикальном тулбаре используют единый `--toolbar-chrome-control-font-weight: 300`;
- прежняя смесь весов `400` и `500` для этих значений считается superseded;
- Phosphor-иконки сохраняют собственные stroke/weight-настройки и не наследуют текстовый вес;
- popup menu typography, editor typography, left system toolbar и боковые панели не наследуют это решение автоматически;
- геометрия, размеры, spacing, radii, width-scale, orientation projection и DPR-snapped metric rendering остаются отдельными каналами и не меняются этим baseline;
- `transform: scale`, shell `zoom` и blur-based имитация резкости для главного тулбара запрещены ранее принятым native-fluency contract.

Этот baseline может быть заменён только отдельным owner-approved UI contour с контролируемым A/B-сравнением. Рефакторинг, унификация типографики или работа над боковыми панелями не могут изменить его по касательной.
