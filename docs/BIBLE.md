# Yalken Writer — BIBLE

STATUS: MAP_AND_TARGET_MODEL
ROLE: PRODUCT_SCOPE_AND_TARGET_ARCHITECTURE

Важно:
- blocking execution law определяется active canon,
- этот документ не является самостоятельным machine-bound law source,
- этот документ задаёт product map, north star и устойчивые MVP-инварианты.

Порядок разрешения истины начинается с `CANON_STATUS.json` и указанного им
active execution canon, затем применяются `CANON.md`, COREX и этот product map.

## 1. Product Definition

`Yalken Writer v1` — calm local-first writer tool для письма и редактуры текста.

Центр версии:
- strict data core,
- reliable primary editor path,
- zero-bypass command surface,
- safe reset and restore,
- bounded spatial containers,
- mutable design that never threatens text truth.

## 2. MVP Invariants

### Product
- desktop-first
- offline-first
- scenes as isolated entities
- editing is not final print layout
- data must stay locally recoverable

### Technical
- Tiptap OSS layer for editor surface
- no paywall dependencies
- atomic write required
- recovery required
- DOCX first export

### Process
- no free interpretation against repo canon
- no split-brain source of truth
- no early expansion into shell, spatial or ecosystem scope before gates

## 3. Non Goals For V1
- cloud truth
- network truth
- executable plugin runtime
- marketplace
- public platform extraction
- transport rollout
- broad customization as release criterion

## 4. Architecture Lanes

### Data core
- project format
- scene identity
- document structure
- provenance for export and migrations

### Editor layer
- primary editor path
- stable input
- selection
- undo redo
- save reopen
- recovery smoke

### Command kernel
- stable command ids
- command meaning ownership
- capability-aware routing

### Shell core
- user shell state
- project workspace state
- reset
- safe mode
- last stable restore

### Design layer
- tokens
- typography
- skins
- supported modes

### Spatial layer
- bounded movable containers
- commit-point persistence
- safe degradation

### Feature integration law

Подробный рабочий контракт:
`docs/YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md`.

- Product Core владеет данными и доменным смыслом.
- Command Kernel владеет действиями, availability и routing.
- Design OS владеет формой surfaces, slots, layout и platform projection.
- Любая фича подключает product plane и interface plane раздельно.
- Product mutation идёт только через canonical command authority.
- Внешний эффект идёт только через product port и adapter.
- UI получает immutable projection и не вычисляет semantic truth.
- Новая поверхность описывается manifest и входит через typed slot.
- Project, authoring working, derived, shell и transient state не смешиваются.
- Несохранённый текст является authoring working state с no-loss duty и не
  смешивается с shell или discardable transient state.
- Command catalog читается Design OS, но dispatch и capability enforcement
  остаются в Command Kernel.
- Manifests сначала фиксируют контракт ТЗ и не требуют создавать runtime
  registry или feature pack, которого ещё нет в доказанной архитектуре.
- Встроенный feature pack не создаёт частный Core, bus, storage writer или
  executable plugin runtime.

## 5. Writer V1 Delivery Order

1. primary editor closure
2. factual doc cutover
3. data core and recovery hardening
4. command kernel lock
5. user shell state and project workspace state
6. bounded spatial shell
7. minimal internal pack layer only if justified
8. release hardening
9. post-version-one evaluation only

## 6. Primary Editor Closure Rule

Primary editor closure is the hard gate before major shell and spatial work.

Closure minimum:
- open scene
- type
- selection
- undo redo
- save reopen
- recovery smoke
- DOCX baseline does not regress
- no input loss suite green
- no dependence on legacy editor truth for basic editor actions

Closure authority:
- one machine-carried packet
- one checklist
- one sign-off point
- one evidence set
- one canon reference

## 7. Safe Derived Work Before Closure

Before closure the following are allowed if they do not mutate editor truth:
- export contract work
- markdown work
- mind map work
- comments local-first work
- history local-first work
- platform contract work

This allowance does not authorize early shell runtime or spatial runtime.

## 8. Command And Pack Rules

- command visibility does not equal command availability
- availability belongs only to command kernel and capability policy
- feature pack remains optional
- pack layer is allowed only if a real built-in writer feature cannot be expressed by design pack, profile pack, command config or shell config
- no executable plugin runtime in `v1`

## 9. Shell And Spatial Rules

- bounded spatial freedom, not full internal block freedom
- editor root remains docked in `v1`
- spatial persistence writes only at commit points
- shell reset and last stable restore become blocking only when shell state enters mainline

## 10. Project Identity Rules

- `projectId` is created on project creation or first legacy migration
- `projectId` is stored in project manifest
- `projectId` survives rename and move
- clone or import creates a new `projectId` unless policy preserves it
- workspace binding keys use `projectId`, not path or title

## 11. Factual Docs Rule

После editor closure factual docs должны обновляться одним cutover pass.

Эти документы обязаны описывать post-closure operating reality:
- `CANON.md`
- `BIBLE.md`
- `CONTEXT.md`
- `HANDOFF.md`
- `README.md`

После cutover в активных документах должна оставаться одна active product truth.

## 12. Current Interpretation

На текущем этапе:
- этот документ остаётся product map и target model,
- active canon остаётся binding execution law,
- wide future horizon сохраняется как north star,
- но не становится автоматическим release criterion для `Writer v1`.
- release hardening остаётся последним обязательным runtime axis для текущего `Writer v1`.
- любой broader freedom после него допускается только как post-version-one evaluation only.

## 13. Toolbar Rebaseline Note

Для toolbar configuration subsystem current operating truth зафиксирована как factual rebaseline, а не как literal continuation старого transition текста:
- `LIVE_COUNT = 17`
- `PLANNED_IDS = []`
- `BLOCKED_IDS = [toolbar.insert.image, toolbar.proofing.spellcheck, toolbar.proofing.grammar]`
- `master` profile visible in configurator surface
- ordering runtime realized

Wave C literal wording из старого baseline больше не является current repo truth.
Current closure model для Wave C: `C1 live delivery + explicit blocked decisions`.
