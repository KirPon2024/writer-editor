# Yalken Product Glossary

STATUS: ACTIVE_CANONICAL_TERMINOLOGY
CLAIM_BOUNDARY: TERMS_NOT_CAPABILITY_EVIDENCE

## Architecture

`Product Core` — владелец product truth, domain semantics, schemas, identity,
migrations, persistence и recovery.

`Command Kernel` — владелец command meaning, availability, capability policy,
dispatch, routing и mutation authority.

`Design OS` — система вычисляемой формы: surfaces, slots, representations,
layout, shell modes, profiles, visibility и fallback.

`Renderer` — presentation consumer of projections и emitter of intent. Не
authority для product truth.

`Product port` — интерфейс одного внешнего эффекта, требуемого product logic.

`Platform adapter` — реализация product port для конкретной среды.

`Design OS port` — read-only contract каталога, projection или snapshot,
нужного для вычисления формы. Не product effect port.

`Projection` — immutable read model, связанная с identity и revision.

`Surface` — именованная UI representation с manifest и lifecycle.

`Typed slot` — разрешённая точка contribution в surface. Не произвольный DOM.

`Feature pack` — declarative internal contribution через существующие
contracts. В Writer v1 не исполняет произвольный код и не имеет private Core.

`Plugin` — executable third-party extension с permissions/sandbox/lifecycle.
Не является capability Writer v1.

## Operations

`Command` — намерение изменить governed state через Command Kernel.

`Query` — read-only запрос projection или capability.

`Event` — неизменяемый факт уже совершённого domain transition.

`Effect` — разрешённый внешний I/O через product port и adapter.

`Background Job` — отменяемая derived computation с bounded queue и guards.

`Capability` — право и техническая возможность выполнить command/effect в
текущем context. UI visibility не создаёт capability.

`Availability` — допускается ли command по product state и policy сейчас.

`Intent` — пользовательский запрос от renderer; ещё не авторизованная mutation.

## State

`PROJECT_STATE` — canonical durable project truth.

`AUTHORING_WORKING_STATE` — unsaved authoring content с no-loss duty.

`DERIVED_STATE` — rebuildable analysis/index/projection data.

`SHELL_STATE` — presentation workspace, layout, panels, modes и profiles.

`TRANSIENT_STATE` — безопасно отбрасываемое ephemeral UI state.

`Recovery` — readable and tested restoration path, не просто backup file.

`Revision` — версия canonical source, к которой привязаны projections/effects.

`Generation` — версия derived computation для stale-result rejection.

## Product form

`Workspace` — product context работы. Canonical values: `WRITE`, `PLAN`,
`REVIEW`.

`Shell mode` — правило вычисления shell form. Canonical values:
`CALM_DOCKED`, `COMPACT_DOCKED`, `SPATIAL_ADVANCED`, `SAFE_RECOVERY`.

`Profile` — declarative preset. Canonical values: `BASELINE`, `SAFE`, `FOCUS`,
`COMPACT`.

`Minimal`, `Workbench`, `Studio` — historical philosophical metaphors, не
canonical runtime identifiers.

## Truth and evidence

`Active execution canon` — единственный document, выбранный CANON_STATUS.

`Repo canon` — CANON change-control and interpretation law.

`COREX` — versioned philosophy and target architecture, not current evidence.

`Current` — доказано на exact current head в названном scope.

`Target` — архитектурная цель, ещё не обязательно реализованная.

`Candidate` — branch-local state, не merged truth.

`Historical` — truth/evidence старого SHA или этапа.

`Exact-head evidence` — evidence, чьи SHA, artifacts и execution code совпадают
с проверяемым head.

`Independent oracle` — проверка результата authority, не создававшей claimed
output. Self-authored count или screenshot не является независимым oracle.

## Process

`Bounded contour` — один конкретный результат, один scope и один rollback.

`Delivery chain` — commit, push, PR, required CI, merge, post-merge verify.

`Fail closed` — отказ без частичной mutation или повышения claim.

`False green` — PASS при missing/stale/skipped/self-authored evidence.

`Scope drift` — изменение вне declared scope без нового owner decision.

`Architecture declaration` — pre-write JSON с authority, paths, state, guards,
current/target, delivery и rollback.
