# COREX v2 — YALKEN / Writer-Editor

STATUS: FROZEN
ROLE: PHILOSOPHY_TARGET_ARCHITECTURE_LONG_HORIZON
PREVIOUS_VERSION: COREX.v1.md

COREX описывает сущность продукта, устойчивую целевую архитектуру и законы
эволюции. Он не является текущим ТЗ и не доказывает наличие runtime-функции.

## 0. Authority и граница утверждений

Порядок истины:

1. `docs/OPS/STATUS/CANON_STATUS.json` и указанный active execution canon.
2. `CANON.md` как repo change-control canon.
3. Текущая версия COREX через `docs/corex/COREX.md`.
4. `docs/BIBLE.md` как product map.
5. Factual docs, exact code, exact-head tests и physical evidence.

Более низкий документ не переопределяет более высокий. Историческая надпись
`ACTIVE`, receipt или roadmap не создаёт authority сама по себе.

```text
CURRENT_CLAIM_REQUIRES_EXACT_HEAD_EVIDENCE
TARGET_ARCHITECTURE_IS_NOT_LIVE_RUNTIME
```

## 1. Сущность Yalken

Yalken — локальная среда мышления, письма и редакторской работы. Текст — живое
авторское состояние, а не побочный продукт UI. Интерфейс должен раскрывать
сложность постепенно и никогда не угрожать сохранности рукописи.

Базовые ценности:

- максимальная гибкость при минимальной хрупкости;
- локальная и восстанавливаемая истина;
- прозрачные, обратимые изменения;
- спокойная форма без скрытой власти над текстом;
- расширение только через явные контракты;
- доказанная текущая реальность отдельно от целевого горизонта.

## 2. Главная архитектурная формула

```text
PRODUCT_TRUTH + COMMAND_MEANING + COMPUTED_INTERFACE_FORM = YALKEN
```

### 2.1 Product Core

Product Core владеет:

- Project, Scene, Document, Node, Revision и domain identity;
- schemas, invariants, validation, migrations и compatibility;
- canonical product state и authoring working-state contracts;
- atomic persistence, readable recovery, replay и provenance;
- domain operations независимо от UI и платформы.

Core не «вечен» в смысле неизменяемых байтов. Он контролируемо эволюционирует
через versioned schema, migration, compatibility, rollback и recovery evidence.

### 2.2 Command Kernel

Command Kernel владеет:

- stable command identifiers и их смыслом;
- availability и capability policy;
- dispatch, validation, routing и effect reservation;
- единственным разрешённым путём product mutation;
- typed result, event, receipt, idempotency и replay truth.

Renderer visibility, menu state и shell layout не могут дать capability. Kernel
повторно проверяет authority в момент dispatch.

### 2.3 Design OS

Design OS владеет вычисляемой формой:

- surfaces, typed slots и representations;
- layout, visibility, progressive disclosure и navigation form;
- shell modes, profiles, tokens, typography и themes;
- platform projection, fallback и accessibility presentation;
- immutable projections of command and product capabilities.

Design OS не владеет рукописью, domain semantics, filesystem write, IPC
authority, command meaning или product recovery.

### 2.4 Renderer и platform adapters

Renderer читает immutable revision-bound projections и отправляет intent. Он
не вычисляет semantic truth и не пишет напрямую в Core, storage или platform.

Filesystem, dialogs, OS integration, processes и external formats доступны
только через named product ports и platform adapters. Отсутствующий adapter
означает unavailable или degraded capability, а не разрешение на обход.

## 3. Типизированная модель взаимодействий

Формула COREX v1 «всё = команда» заменена точной моделью:

- `COMMAND` — намерение изменить governed state;
- `QUERY` — read-only получение projection/capability;
- `EVENT` — уже случившийся доменный факт;
- `EFFECT` — внешний I/O, разрешённый port и выполненный adapter-ом;
- `BACKGROUND_JOB` — отменяемая derived-работа с bounded queue;
- `PROJECTION` — immutable read model с identity и revision binding.

Command может породить Event и зарезервировать Effect. Query не мутирует
truth. Event не является скрытой командой. Worker не получает write authority.

## 4. Классы состояния

### 4.1 PROJECT_STATE

Долговечная каноническая истина проекта: manifest, scenes, structure, metadata,
domain events, revision lineage и recovery anchors.

### 4.2 AUTHORING_WORKING_STATE

Несохранённый текст, composition, selection-relevant edit context и pending
authoring transaction. Это product-plane state с no-loss duty, а не disposable
UI state. Save, reopen, crash и shell reset обязаны иметь определённый маршрут.

### 4.3 DERIVED_STATE

Перестраиваемые индексы, maps, graphs, diagnostics, analysis и caches. Derived
state не заменяет source state и публикуется только при совпадении project,
entity, source revision и generation.

### 4.4 SHELL_STATE

Presentation workspace: layout, panels, viewport, shell mode, profile, window
placement и last-stable shell snapshot. Shell reset не меняет рукопись.

### 4.5 TRANSIENT_STATE

Hover, animation, ephemeral decoration, temporary popup и другой безопасно
отбрасываемый UI state. Unsaved authoring content сюда не относится.

## 5. Product plane и interface plane

Каждая функция подключается двумя отдельными контрактами.

Product plane определяет:

- owner канонических данных;
- Commands, Queries, Events и Effects;
- product ports и adapters;
- identity, revisions, persistence, recovery и negative paths.

Interface plane определяет:

- surface и typed slot;
- representation и immutable projection;
- visibility, availability hint и explicit fallback;
- keyboard, accessibility, locale и platform parity.

Plane-ы соединяются только через explicit contracts. Feature не может получить
private Core, private bus, storage writer или mini Design OS.

## 6. Workspaces, modes и profiles

Термины не взаимозаменяемы:

- `WRITE`, `PLAN`, `REVIEW` — product workspaces, то есть контекст работы.
- `CALM_DOCKED`, `COMPACT_DOCKED`, `SPATIAL_ADVANCED`, `SAFE_RECOVERY` — shell
  modes, то есть правила вычисления формы оболочки.
- `BASELINE`, `SAFE`, `FOCUS`, `COMPACT` — profiles, то есть декларативные
  presets доступной формы и поведения.

Исторические `Minimal`, `Workbench`, `Studio` остаются философскими образами
progressive disclosure, но не являются текущими canonical runtime identifiers.

## 7. Extension model Writer v1

Writer v1 не содержит executable plugin runtime, marketplace или public SDK.

Допустим declarative internal feature pack, который:

- объявляет contributions через существующие contracts;
- использует canonical Command Kernel;
- читает разрешённые projections;
- не имеет собственного Core, bus, storage writer или platform access;
- может быть отключён без потери project truth.

Executable plugins, sandbox/permissions/lifecycle и ecosystem являются только
post-v1 evaluation axis и требуют отдельного canon decision.

## 8. Data safety и security

- Desktop-first и offline-first для Writer v1.
- Local truth не зависит от account, cloud или network.
- Project writes атомарны; recovery читаем и проверяем.
- Сцены — отдельные сущности с устойчивой identity.
- Внешние bytes/payloads недоверенные до schema validation, normalization,
  size bounds, path isolation и authority checks.
- Renderer не получает filesystem path или arbitrary command authority.
- Electron применяет CSP, navigation/new-window block и no remote code.
- Security boundary расширяется только отдельным owner-approved contour.

## 9. Performance и async law

На typing hot path запрещены full-project analysis, graph layout, heavy
serialization, persistence of derived generations и полный Design OS resolve.

Background work использует debounce, cancellation, coalescing, priorities,
bounded queues и generation guards. Stale result отбрасывается до projection.

## 10. Кроссплатформенность

Domain semantics и stable IDs одинаковы на платформах. Различия живут в
adapters, capability policy и Design OS fallback.

Locale изменяет labels, но не command/entity/surface/slot identity. Unicode,
grapheme boundaries, IME, RTL и CJK являются product/platform contracts.

Платформа без surface получает явный fallback, включая keyboard, list или
matrix parity для spatial/graph representations.

## 11. Архитектура как управляемые данные

Конфигурация формы может быть declarative и versioned, но не вся архитектура
является произвольной пользовательской конфигурацией.

Изменяемо:

- shell layout, profiles, themes, supported surfaces и shortcuts;
- declarative internal contributions в рамках capabilities.

Защищено contracts/migrations:

- product schemas, identity, command meaning, security boundaries;
- persistence, recovery, provenance и compatibility.

Любое изменение имеет migration/rollback и не превращает старые документы в
второй active truth source.

## 12. Current и target

COREX задаёт target architecture. Реально существующим считается только то,
что подтверждено current code и exact-head evidence.

Полный universal port layer, generic feature pipeline, executable plugin
runtime, cloud collaboration, web/mobile parity и public ecosystem нельзя
заявлять live без отдельного machine evidence и active-canon allowance.

Legacy seam мигрируется bounded vertical contour-ами. Новый код не расширяет
bypass; big-bang rewrite не требуется и не разрешается по умолчанию.

## 13. Законы агента

Перед реализацией агент обязан ответить:

1. Какой источник истины активен на exact HEAD?
2. Кто владеет изменяемым state?
3. Это Command, Query, Event, Effect или Background Job?
4. Каков единственный write path?
5. Каков immutable read/projection path?
6. Какие ports и adapters нужны?
7. Какие state classes затронуты?
8. Где capability revalidation?
9. Каков fallback и recovery?
10. Какие negatives доказывают отсутствие bypass/stale publication?
11. Что CURRENT, а что TARGET?
12. Каков rollback и delivery chain?

Если ответа нет, write не начинается.

## 14. Итоговая формула

```text
PRODUCT_CORE_OWNS_TRUTH
COMMAND_KERNEL_OWNS_ACTION_MEANING_AND_MUTATION_AUTHORITY
DESIGN_OS_OWNS_COMPUTED_FORM
RENDERER_CONSUMES_PROJECTIONS_AND_EMITS_INTENT
PLATFORM_EFFECTS_USE_PORTS_AND_ADAPTERS
STATE_CLASSES_NEVER_COLLAPSE_INTO_EACH_OTHER
CURRENT_REQUIRES_EVIDENCE
EVOLUTION_REQUIRES_MIGRATION_RECOVERY_AND_ROLLBACK
```
