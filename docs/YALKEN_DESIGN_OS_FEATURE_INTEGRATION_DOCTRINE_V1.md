# Yalken Design OS Feature Integration Doctrine V1

DOCTRINE_ID: YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1
STATUS: ACTIVE_AGENT_INTEGRATION_GUIDE
ROLE: BOUNDARY_AND_INTEGRATION_DOCTRINE
AUTHORITY: SUBORDINATE_TO_ACTIVE_CANON_AND_REPO_CANON

Этот документ объясняет человеку и агенту, как встраивать в Yalken новые
функции, процессы, анализаторы, импортеры, экспортеры, фоновые workers и
интерфейсные поверхности без смешивания Product Core, Command Kernel и
Yalken Design OS.

Документ не создаёт новый release scope, не открывает plugin runtime и не
объявляет целевую архитектуру уже реализованной. При конфликте приоритет имеют
active execution canon, `CANON.md`, COREX и BIBLE в установленном порядке.

## 1. Формула системы

```text
PRODUCT_TRUTH + COMMAND_MEANING + COMPUTED_INTERFACE_FORM = YALKEN
```

Yalken состоит из трёх центров ответственности:

1. **Product Core** хранит смысл продукта: рукопись, сущности, связи,
   инварианты, операции, миграции, recovery и каноническое состояние.
2. **Command Kernel** хранит смысл действий: command IDs, availability,
   capability policy, routing и единственный разрешённый путь мутаций.
3. **MIK внутри Design OS** вычисляет форму интерфейса: surfaces, slots,
   layout, profiles, workspaces, visibility, platform projection и fallback.

```text
PRODUCT_AUTHORITY: DATA_SEMANTICS_OPERATIONS_STORAGE_RECOVERY
COMMAND_AUTHORITY: ACTION_MEANING_AVAILABILITY_ROUTING
DESIGN_AUTHORITY: FORM_VISIBILITY_LAYOUT_PROJECTION_FALLBACK
```

Design OS является мозгом формы интерфейса, но не мозгом продуктового смысла.

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
  -> Command Port
  -> Domain Port
  -> Surface Manifest
  -> MIK Solver
  -> Resolved Snapshot
  -> Shell Projection Port
  -> Renderer Adapter
```

Канонические порты Design OS:

- `CommandPort` передаёт каталог, representations и availability verdict.
- `DomainPort` передаёт project, selection, workspace и document context.
- `ViewportPort` передаёт размеры, DPI, safe areas и topology мониторов.
- `ShellStatePersistencePort` сохраняет только shell state и snapshots.
- `ShellProjectionPort` проецирует resolved snapshot в renderer.
- `DiagnosticsPort` отдаёт validation, traces и snapshot diffs.
- `ExtensionPort` регистрирует manifests и встроенные packs без исполнения
  произвольного кода.

Design OS ports не должны становиться обходом Product Core или Command Kernel.

## 3. Нормативные маршруты

### 3.1 Маршрут записи

```text
Surface Intent
  -> Command Port
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
requiredProductPorts
adapterRequirements
surfaceManifests
slotRequirements
supportedWorkspaces
platformAvailability
accessibilityRequirements
fallbacks
persistenceClass
migrations
recovery
performanceBudget
securityBoundary
lifecycle
```

Если поле неприменимо, оно получает явное `NOT_APPLICABLE` с причиной. Поле
нельзя молча пропускать.

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
accessibilityContract
performanceClass
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
DERIVED_STATE: REBUILDABLE_VERSIONED_GENERATIONS
SHELL_STATE: DESIGN_OS_AUTHORITY
TRANSIENT_STATE: SESSION_ONLY_NOT_TRUTH
```

```text
PERSISTENCE_LAW: PROJECT_PERSISTENCE_AND_SHELL_PERSISTENCE_NEVER_SHARE_AUTHORITY
```

- Project state сохраняется только каноническим storage path.
- Derived cache можно удалить и детерминированно пересобрать.
- Shell state хранит layout, profile, visibility и last stable snapshot.
- Safe reset Design OS не может менять рукопись или product metadata.
- Product recovery не может зависеть от наличия shell snapshot.

Имена product и shell ports должны различаться. Запрещены неоднозначные имена
вроде общего `PersistencePort` или общего `ProjectionPort` без authority prefix.

## 8. Производительность

```text
HOT_PATH_LAW: TYPING_NEVER_RUNS_FULL_ANALYSIS_LAYOUT_OR_PERSISTENCE
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

## 9. Платформы, доступность и деградация

- Domain semantics одинаковы на всех платформах.
- Платформенные различия живут только в adapters и capability policy.
- Недоступная surface получает явный fallback.
- Отсутствующий adapter означает unavailable или degraded capability, а не
  разрешение обратиться к платформе напрямую.
- Graph surface обязана иметь keyboard, list или matrix parity.
- Reduced motion, focus visibility и screen-reader semantics входят в manifest.

## 10. Текущая реальность и целевой горизонт

```text
CURRENT_REALITY_LAW: TARGET_ARCHITECTURE_MUST_NOT_BE_REPORTED_AS_LIVE_RUNTIME
```

Сейчас в репозитории реально существуют command surface и узкие Design OS
ports для preview, commit, safe reset, restore last stable, text input и runtime
snapshot. Общие Core ports и registry остаются частичным каркасом. Полный MIK,
Host Pack, Surface Protocol и универсальная feature integration pipeline ещё не
должны объявляться полностью реализованными без отдельного machine evidence.

Внедрение выполняется bounded vertical contours. Не требуется big-bang rewrite:
новая фича использует доктрину сразу, а существующий участок переводится на неё
только когда его реально касается принятый contour.

## 11. Порядок интеграции новой фичи

1. Определить product intent и владельца данных.
2. Разделить authoritative, derived, shell и transient state.
3. Зафиксировать commands, events, queries и capabilities.
4. Назвать product ports и adapters для внешних эффектов.
5. Описать `FEATURE_INTEGRATION_MANIFEST_V1`.
6. Описать surfaces, typed slots, representations и fallbacks.
7. Провести все мутации через Command Kernel.
8. Подать UI только immutable projections и domain context.
9. Разнести project persistence и shell persistence.
10. Добавить negative tests на bypass, authority leak и missing fallback.
11. Проверить recovery, performance, accessibility и active platform scope.
12. Зафиксировать, что реализовано реально, а что осталось target only.

## 12. Быстрый алгоритм для агента

Перед изменением ответить по порядку:

1. Меняется продуктовый смысл или только форма?
2. Кто владеет изменяемым состоянием?
3. Какая каноническая command operation выполняет изменение?
4. Какой product port нужен для внешнего эффекта?
5. Какая projection отдаёт данные интерфейсу?
6. Какая surface и какой slot показывают функцию?
7. Каков fallback на другой платформе или при отсутствии capability?
8. Что восстанавливается после сбоя?
9. Что запрещено запускать в typing hot path?
10. Какой negative test доказывает отсутствие обхода?

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
STOP_UI_COMPUTES_SEMANTIC_TRUTH
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
- feature pack не создаёт частную архитектуру;
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
