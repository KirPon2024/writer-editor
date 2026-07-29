# Yalken Design OS Feature Integration Doctrine V1

DOCTRINE_ID: YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1
STATUS: ACTIVE_AGENT_INTEGRATION_GUIDE
ROLE: BOUNDARY_AND_INTEGRATION_DOCTRINE
AUTHORITY: SUBORDINATE_TO_ACTIVE_CANON_AND_REPO_CANON
REVISION: 2026-07-29.2

Этот документ объясняет человеку и агенту, как встраивать в Yalken новые
функции, процессы, анализаторы, импортеры, экспортеры, фоновые workers и
интерфейсные поверхности без смешивания Product Core, Command Kernel и
Yalken Design OS.

Документ не создаёт новый release scope, не открывает plugin runtime и не
объявляет целевую архитектуру уже реализованной. При конфликте сначала
разрешается `CANON_STATUS.json` и читается указанный им active execution canon,
затем применяются `CANON.md`, COREX и BIBLE в установленном порядке.

## 1. Формула системы

```text
PRODUCT_TRUTH + COMMAND_MEANING + COMPUTED_INTERFACE_FORM = YALKEN
```

Yalken состоит из трёх центров ответственности:

1. **Product Core** хранит смысл продукта: рукопись, сущности, связи,
   инварианты, операции, миграции, recovery и каноническое состояние.
2. **Command Kernel** хранит смысл действий: command IDs, availability,
   capability policy, routing и единственный разрешённый путь мутаций.
3. **Design OS resolver, условно MIK**, вычисляет форму интерфейса: surfaces,
   slots, layout, profiles, workspaces, visibility, platform projection и
   fallback.

```text
PRODUCT_AUTHORITY: DATA_SEMANTICS_OPERATIONS_STORAGE_RECOVERY
COMMAND_AUTHORITY: ACTION_MEANING_AVAILABILITY_ROUTING
DESIGN_AUTHORITY: FORM_VISIBILITY_LAYOUT_PROJECTION_FALLBACK
```

Design OS является мозгом формы интерфейса, но не мозгом продуктового смысла.

### 1.1 Короткий словарь

- **MIK** — условное имя целевого resolver-а Design OS. Он принимает manifests,
  контекст и ограничения и возвращает resolved snapshot. Это не второй Core,
  не command bus и не доказательство того, что полный resolver уже live.
- **Product port** — контракт внешнего эффекта или инфраструктуры со стороны
  продукта. Его реализует adapter.
- **Design OS port** — направленный контракт доставки каталога, контекста,
  snapshot или диагностики между host и Design OS. Он не даёт product write.
- **Projection** — неизменяемое представление данных с identity и revision,
  подготовленное владельцем смысла для чтения.
- **Surface** — декларативно описанная интерфейсная зона.
- **Typed slot** — типизированная точка размещения surface, а не произвольный
  DOM-контейнер.
- **Capability** — проверяемая возможность выполнить действие. Видимость
  элемента интерфейса не является capability и не заменяет её проверку.
- **Adapter** — платформенная или инфраструктурная реализация port без права
  менять доменную семантику.

## 2. Главный закон двух контуров

Каждая новая фича подключается к Yalken дважды и через разные семейства
контрактов. Эти контуры нельзя объединять в один универсальный port.

```text
DUAL_PLANE_LAW: EVERY_FEATURE_HAS_PRODUCT_PLANE_AND_INTERFACE_PLANE
```

### 2.1 Product plane

Product plane отвечает за то, **что фича означает и что она делает**.

```text
Domain Model
  -> Commands
  -> Events
  -> Queries and Product Projections
  -> Product Ports
  -> Platform or Infrastructure Adapters
```

Примеры product ports:

- `ProjectPort`
- `TextPort`
- `ProjectPersistencePort`
- `AnalysisPort`
- `LanguageServicePort`
- `ExportPort`
- `WorkerPort`
- `UiNotificationPort`

Product port описывает внешний эффект или инфраструктурную зависимость. Он не
описывает расположение панели, цвет, видимость кнопки или форму surface.

### 2.2 Interface plane

Interface plane отвечает за то, **как фича присутствует в интерфейсе**.

```text
Host Feature Contribution
  -> Command Catalog Projection
  -> Domain Projection
  -> Surface Manifest
  -> MIK Solver
  -> Resolved Snapshot
  -> Shell Projection Port
  -> Renderer Adapter
```

Направленные interface ports:

- `CommandCatalogPort` только читает каталог, representations и availability
  verdict из Command Kernel для resolver-а.
- `CommandDispatchPort` передаёт только намерение пользователя в canonical
  host dispatch. Это host bridge, а не authority Design OS: resolver только
  связывает representation со stable command ID.
- `DomainProjectionPort` передаёт project, selection, workspace и document
  context как immutable projections.
- `ViewportPort` передаёт размеры, DPI, safe areas и topology мониторов.
- `ShellStatePersistencePort` сохраняет только shell state и snapshots.
- `ShellProjectionPort` проецирует resolved snapshot в renderer.
- `DiagnosticsPort` отдаёт validation, traces и snapshot diffs.
- `ExtensionPort` регистрирует manifests и встроенные packs без исполнения
  произвольного кода.

Design OS ports не должны становиться обходом Product Core или Command Kernel.

```text
PORT_DIRECTION_LAW: CATALOG_AND_PROJECTION_ARE_READ_ONLY_DISPATCH_IS_INTENT_ONLY
CAPABILITY_LAW: VISIBILITY_NEVER_ENFORCES_CAPABILITY_COMMAND_KERNEL_REVALIDATES_ON_DISPATCH
```

Скрытая или отключённая кнопка не является защитой. Command Kernel повторно
проверяет capability при каждом dispatch независимо от решения Design OS.

## 3. Нормативные маршруты

### 3.1 Маршрут записи

```text
Surface Intent
  -> Host Command Dispatch Port
  -> Command Kernel
  -> Validated Command
  -> Domain Use Case
  -> Product Port and Adapter when needed
  -> Atomic Core Mutation
  -> Domain Event
  -> Projection Invalidation
```

```text
COMMAND_LAW: EVERY_PRODUCT_MUTATION_GOES_THROUGH_CANONICAL_COMMAND_AUTHORITY
```

Surface, renderer, worker, menu, toolbar и feature pack не могут напрямую
записывать project truth.

Editor transaction может менять authoring working state между сохранениями,
но не получает storage authority: no-loss buffer привязан к canonical
save, autosave и recovery route и не пишет project files напрямую.

### 3.2 Маршрут чтения

```text
Core State or Domain Event
  -> Projection Engine
  -> Immutable Product Projection
  -> Domain Port
  -> MIK Solver
  -> Resolved Surface Snapshot
  -> Renderer Adapter
```

```text
PROJECTION_LAW: UI_CONSUMES_PROJECTIONS_AND_NEVER_INVENTS_PRODUCT_TRUTH
```

UI может локально вычислять только presentation state: hover, focus,
selection paint, transient drag preview и другие неканонические детали.

### 3.3 Маршрут анализа и фоновых процессов

```text
Domain Event or Explicit Command
  -> Scheduler
  -> Worker Port
  -> Analysis or Language Port
  -> Immutable Derived Generation
  -> Evidence and Diagnostics
  -> Projection Invalidation
```

Анализатор не меняет рукопись. Его результат является derived data, пока
пользователь не подтвердит отдельную каноническую command operation.

## 4. Паспорт интеграции фичи

До реализации каждая новая фича обязана иметь
`FEATURE_INTEGRATION_MANIFEST_V1` со следующими полями:

```text
featureId
featureVersion
domainOwner
authoritativeData
derivedData
commandIds
eventTypes
queryIds
productProjectionIds
capabilityIds
authorityMap
identityKeys
revisionPolicy
writePath
readPath
requiredProductPorts
requiredDesignOsPorts
adapterRequirements
surfaceManifests
slotRequirements
supportedWorkspaces
platformAvailability
accessibilityRequirements
fallbacks
stateClasses
persistenceClass
migrations
recovery
rollback
performanceBudget
securityBoundary
lifecycle
negativeBypassChecks
evidenceBindings
currentReality
```

Если поле неприменимо, оно получает явное `NOT_APPLICABLE` с причиной. Поле
нельзя молча пропускать.

```text
MANIFEST_MATERIALIZATION_LAW: CONTRACT_FIRST_NO_SPECULATIVE_RUNTIME_REGISTRY
```

`FEATURE_INTEGRATION_MANIFEST_V1` сначала является нормативным блоком ТЗ или
плана. Он не обязан становиться отдельным JSON-файлом, feature pack или новым
runtime registry. Если в текущем runtime ещё нет подходящего registry, поля
привязываются к существующим seams, коду и тестам. Новый registry создаётся
только отдельным принятым architecture contour, а не ради заполнения шаблона.

Для каждой реализации явно указывается один integration mode:

```text
EXISTING_SEAM: BOUND_TO_CURRENT_APPROVED_ENTRYPOINTS
NEW_PORT: ADDS_ONE_EXPLICIT_PORT_AND_ADAPTER
TARGET_ONLY: DOCUMENTED_NOT_RUNTIME_WIRED
```

## 5. Паспорт поверхности

Каждая новая визуальная зона обязана иметь `SURFACE_MANIFEST_V1`:

```text
surfaceId
surfaceKind
featureId
allowedPostures
allowedTransforms
slotMap
platformAvailability
fallbackSurface
designBindings
projectionAdapter
inputIntents
commandRepresentations
contextRequirements
readProjectionIds
stateOwnership
interactionStates
accessibilityContract
responsiveContract
performanceClass
evidenceBindings
```

```text
SURFACE_LAW: EVERY_UI_ZONE_IS_A_MANIFEST_DRIVEN_SURFACE
SLOT_LAW: NEW_UI_ENTERS_ONLY_THROUGH_TYPED_SLOTS
```

Toolbar, menu, sidebar, inspector, overlay, timeline и mind map являются
разными surface kinds одного протокола. Они не создают собственные UI engines.

Новая функция не вставляется в случайное место DOM. Если подходящего slot нет,
сначала проектируется и принимается новый типизированный slot или отдельная
surface. Dormant slot допустим только как декларативная точка будущего
расширения без скрытого runtime.

## 6. Feature packs и обвесы

Встроенный feature pack является организационной границей, а не независимым
приложением и не executable plugin.

Наличие `FEATURE_INTEGRATION_MANIFEST_V1` не означает, что фиче нужен feature
pack. Сначала используются существующие product contracts, command config,
surface config и shell config; pack вводится только при доказанной отдельной
организационной границе.

Feature pack может объявлять:

- domain records;
- commands и events;
- queries и projections;
- capability requirements;
- surface manifests;
- command representations;
- workspace contributions;
- diagnostics и fallbacks.

Feature pack не может создавать:

- второй Product Core;
- частный Command Kernel;
- частный command bus или event bus;
- собственный project storage writer;
- прямой IPC канал;
- прямой доступ к Electron, файловой системе или renderer internals;
- отдельный mini Design OS;
- auto-loaded executable plugin runtime.

Импорт, экспорт, шифрование, backup, collab transport, AI и другие обвесы
подчиняются тем же правилам. Их внешние эффекты идут через product ports и
adapters, а интерфейсное присутствие — через Design OS contribution.

## 7. Разделение состояний и сохранения

```text
PROJECT_STATE: PRODUCT_CORE_AUTHORITY
AUTHORING_WORKING_STATE: PRODUCT_PLANE_UNSAVED_BUFFER_WITH_NO_LOSS_DUTY
DERIVED_STATE: REBUILDABLE_VERSIONED_GENERATIONS
SHELL_STATE: DESIGN_OS_AUTHORITY
TRANSIENT_STATE: SESSION_ONLY_NOT_TRUTH
```

```text
PERSISTENCE_LAW: PROJECT_PERSISTENCE_AND_SHELL_PERSISTENCE_NEVER_SHARE_AUTHORITY
AUTHORING_STATE_LAW: UNSAVED_TEXT_IS_NOT_SHELL_STATE_AND_UI_RESET_MUST_NOT_DROP_IT
```

- Project state сохраняется только каноническим storage path.
- Authoring working state содержит ещё не сохранённый текст, привязан к
  project, document и revision и имеет no-loss duty. Он может жить в editor
  transaction layer, но сохраняется или восстанавливается только через
  канонический product path.
- Derived cache можно удалить и детерминированно пересобрать.
- Shell state хранит layout, profile, visibility и last stable snapshot.
- Safe reset Design OS не может менять рукопись, product metadata или терять
  authoring working state.
- Product recovery не может зависеть от наличия shell snapshot.

Имена product и shell ports должны различаться. Запрещены неоднозначные имена
вроде общего `PersistencePort` или общего `ProjectionPort` без authority prefix.

## 8. Производительность

```text
HOT_PATH_LAW: TYPING_NEVER_RUNS_FULL_ANALYSIS_LAYOUT_OR_PERSISTENCE
IDENTITY_LAW: ASYNC_RESULTS_BIND_TO_PROJECT_ENTITY_REVISION_AND_GENERATION
```

На каждый ввод символа запрещено запускать:

- полный Design OS resolver;
- graph layout;
- языковой анализ всего проекта;
- сериализацию shell state;
- запись derived generations;
- тяжёлую project persistence.

Фоновые процессы используют debounce, cancellation, coalescing, priority,
generation guards и bounded queues. Устаревший результат не публикуется.
Результат worker-а без совпадения project identity, entity identity, source
revision и generation отбрасывается до публикации projection.

## 9. Платформы, доступность и деградация

- Domain semantics одинаковы на всех платформах.
- Платформенные различия живут только в adapters и capability policy.
- Stable IDs не зависят от языка интерфейса, locale, имени файла или display
  text. Локализуются labels, а не command, entity, surface и slot identities.
- Unicode normalization, grapheme boundaries, RTL, CJK и IME являются
  product или platform contracts, а не эвристиками отдельной surface.
- Недоступная surface получает явный fallback.
- Отсутствующий adapter означает unavailable или degraded capability, а не
  разрешение обратиться к платформе напрямую.
- Graph surface обязана иметь keyboard, list или matrix parity.
- Reduced motion, focus visibility и screen-reader semantics входят в manifest.

## 10. Текущая реальность и целевой горизонт

```text
CURRENT_REALITY_LAW: TARGET_ARCHITECTURE_MUST_NOT_BE_REPORTED_AS_LIVE_RUNTIME
LEGACY_TOUCH_LAW: TOUCHED_LEGACY_SEAMS_MUST_NOT_WIDEN_BYPASS_OR_AUTHORITY_LEAK
```

Сейчас в репозитории реально существуют command surface и узкие Design OS
ports для preview, commit, safe reset, restore last stable, text input и runtime
snapshot. Общие Core ports и registry остаются частичным каркасом. Полный MIK,
Host Pack, Surface Protocol и универсальная feature integration pipeline ещё не
должны объявляться полностью реализованными без отдельного machine evidence.

Внедрение выполняется bounded vertical contours. Не требуется big-bang rewrite:
новая фича использует доктрину сразу, а существующий участок переводится на неё
только когда его реально касается принятый contour.

Если bounded contour касается legacy seam, допустима поэтапная миграция: новый
код не расширяет обход, фиксирует существующую границу, добавляет проверяемый
adapter или command entry и оставляет явный follow-up только для незатронутого
участка. Доктрина не требует big-bang rewrite и не разрешает закреплять новый
legacy bypass.

## 10.1 Внешние входы

```text
EXTERNAL_INPUT_LAW: EXTERNAL_BYTES_AND_PAYLOADS_ARE_UNTRUSTED_UNTIL_VALIDATED_NORMALIZED_AND_BOUNDED
```

Import, DOCX, Markdown, архивы, collab transport, AI, плагины и platform IPC
проходят schema validation, size limits, identity checks и normalization на
границе adapter-а. Внешний payload не получает path authority, command
authority или project write authority по факту своего происхождения.

## 11. Порядок интеграции новой фичи

1. Определить product intent и владельца данных.
2. Разделить project, authoring working, derived, shell и transient state.
3. Зафиксировать identity, revisions, no-loss route, commands, events, queries
   и capabilities.
5. Назвать product ports, Design OS ports и adapters по направлению.
6. Описать `FEATURE_INTEGRATION_MANIFEST_V1` и integration mode.
7. Описать surfaces, typed slots, representations и fallbacks.
8. Провести все мутации через Command Kernel.
9. Подать UI только immutable projections и domain context.
10. Привязать project, authoring, derived и shell persistence к разным
    разрешённым маршрутам; transient state не сохранять как truth.
11. Добавить negative tests на bypass, authority leak, stale async result,
    capability revalidation и missing fallback.
12. Проверить recovery, performance, accessibility и active platform scope.
13. Зафиксировать evidence bindings: что реализовано реально, а что осталось
    target only.

## 12. Быстрый алгоритм для агента

Перед изменением ответить по порядку:

1. Меняется продуктовый смысл или только форма?
2. Кто владеет изменяемым состоянием?
3. Не является ли это несохранённым authoring working state?
4. Какая каноническая command operation выполняет изменение?
5. Какой product port нужен для внешнего эффекта?
6. Какая revision-bound projection отдаёт данные интерфейсу?
7. Какая surface и какой slot показывают функцию?
8. Где повторно проверяется capability при dispatch?
9. Каков fallback на другой платформе или при отсутствии capability?
10. Что восстанавливается после сбоя?
11. Что запрещено запускать в typing hot path?
12. Какой negative test доказывает отсутствие обхода или stale publication?

Если хотя бы на один вопрос нет ответа, реализация не начинается. Сначала
закрывается контрактная неоднозначность в ТЗ или owner decision.

## 13. Обязательные стоп-сигналы

```text
STOP_DIRECT_CORE_WRITE_FROM_UI
STOP_DIRECT_STORAGE_WRITE_FROM_FEATURE_PACK
STOP_PRIVATE_COMMAND_OR_EVENT_BUS
STOP_PLATFORM_ACCESS_OUTSIDE_ADAPTER
STOP_RANDOM_DOM_INSERTION
STOP_PRODUCT_TRUTH_IN_SHELL_STATE
STOP_SHELL_STATE_IN_PROJECT_TRUTH
STOP_AUTHORING_TEXT_CLASSIFIED_AS_DISCARDABLE_TRANSIENT_STATE
STOP_UI_COMPUTES_SEMANTIC_TRUTH
STOP_VISIBILITY_USED_AS_CAPABILITY_ENFORCEMENT
STOP_ASYNC_RESULT_WITHOUT_IDENTITY_AND_REVISION_GUARD
STOP_EXTERNAL_PAYLOAD_TRUSTED_BEFORE_ADAPTER_VALIDATION
STOP_MISSING_PLATFORM_FALLBACK
STOP_HEAVY_WORK_IN_TYPING_PATH
STOP_TARGET_ARCHITECTURE_REPORTED_AS_LIVE
```

## 14. Минимальная приёмка

Фича архитектурно принята только если:

- существует один владелец product truth;
- все мутации идут через canonical command authority;
- внешние эффекты идут через product ports и adapters;
- UI читает immutable projections;
- surfaces и slots описаны декларативно;
- shell state отделён от project state;
- unsaved authoring state имеет no-loss route и не принадлежит shell;
- feature pack не создаёт частную архитектуру;
- Command Kernel повторно проверяет capability при dispatch;
- async results имеют identity, revision и generation guards;
- внешние входы валидируются и ограничиваются на adapter boundary;
- platform fallback и accessibility определены;
- typing hot path не утяжелён;
- recovery и negative bypass checks доказаны;
- factual docs не завышают текущую готовность.

## 15. Короткая формула

```text
FUNCTIONS_BELONG_TO_PRODUCT
ACTIONS_BELONG_TO_COMMAND_KERNEL
FORM_BELONGS_TO_DESIGN_OS
LAYERS_CONNECT_ONLY_THROUGH_EXPLICIT_CONTRACTS_AND_PORTS
```
