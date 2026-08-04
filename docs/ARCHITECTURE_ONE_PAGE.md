# Yalken Architecture — One Page

STATUS: ACTIVE_ORIENTATION_MAP
CLAIM_BOUNDARY: ARCHITECTURE_MAP_NOT_RUNTIME_COMPLETENESS_CLAIM

## Core equation

```text
PRODUCT_TRUTH + COMMAND_MEANING + COMPUTED_INTERFACE_FORM = YALKEN
```

| Boundary | Owns | Reads | Must never own |
|---|---|---|---|
| Product Core | domain truth, schemas, identity, migration, persistence, recovery | validated input and ports | UI layout, platform API, visibility |
| Command Kernel | command meaning, availability, capability, dispatch, effect reservation | product context and policy | renderer visibility as authority |
| Design OS | surfaces, slots, layout, modes, profiles, representation, fallback | immutable projections and catalogs | manuscript truth, command meaning, storage write |
| Renderer | presentation and user intent | revision-bound projections | semantic truth, direct Core/storage/platform write |
| Product Adapter | one named external effect | validated effect request | domain policy or private command path |
| Derived Worker | rebuildable analysis | immutable source snapshot | canonical write authority |

## Canonical paths

```text
WRITE
User intent
  -> Renderer intent
  -> Command Kernel dispatch
  -> capability and payload revalidation
  -> Product Core operation
  -> optional reserved Effect
  -> Product Port
  -> Platform Adapter
  -> atomic persistence and recovery
  -> Domain Event and receipt
  -> new immutable Projection

READ
Product or derived truth
  -> revision-bound Projection
  -> Design OS representation and fallback
  -> Renderer
```

Renderer, worker, surface, menu, toolbar и feature pack не имеют бокового write
path. IPC является transport boundary, а не authority source.

## Operation taxonomy

| Type | Meaning | Mutation |
|---|---|---|
| Command | intent to change governed state | only through Command Kernel |
| Query | read-only projection/capability request | forbidden |
| Event | immutable fact that already happened | no hidden command |
| Effect | external I/O through port/adapter | only after reservation |
| Background Job | cancellable derived computation | cannot publish stale result |

## State ownership

| State class | Owner | Persistence | Loss rule |
|---|---|---|---|
| PROJECT_STATE | Product Core | canonical project storage | atomic write plus recovery |
| AUTHORING_WORKING_STATE | Product/editor contract | explicit no-loss route | never discard as UI state |
| DERIVED_STATE | derived subsystem | optional rebuildable cache | source remains authority |
| SHELL_STATE | Design OS/shell | separate shell store | cannot change manuscript |
| TRANSIENT_STATE | renderer | normally none | safe to discard only by definition |

## Product and interface planes

Каждая feature имеет два независимых contracts:

- Product plane: data owner, Commands, Queries, Events, Effects, ports,
  identities, revisions, persistence, recovery, negative behavior.
- Interface plane: surface, typed slot, representation, projections,
  visibility, accessibility и platform fallback.

Связь между plane-ами — только explicit contract. Surface manifest не создаёт
runtime registry автоматически.

## Canonical vocabulary

- Workspaces: `WRITE`, `PLAN`, `REVIEW`.
- Shell modes: `CALM_DOCKED`, `COMPACT_DOCKED`, `SPATIAL_ADVANCED`,
  `SAFE_RECOVERY`.
- Profiles: `BASELINE`, `SAFE`, `FOCUS`, `COMPACT`.
- Extensions in Writer v1: declarative internal packs only.
- Executable plugin runtime: not a Writer v1 capability.

## Current versus target

Directories such as `src/core`, `src/product`, `src/command`, `src/derived`,
`src/renderer/design-os`, `src/ports` and `src/adapters` contain real pieces of
the model, but directory presence does not prove full architectural completion.
`src/main.js` still contains legacy seams. Touched seams must move toward the
model without big-bang rewrite or widened bypass.

Capability status comes from current exact code plus authoritative current
matrices/evidence. COREX and this page describe law/target and never promote a
feature by prose.

Полный интеграционный контракт находится в
`docs/YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md`.

## Non-negotiable negatives

- no direct UI or worker write to Core/storage/platform;
- no private command/event bus;
- no product truth in shell state;
- no authoring text classified as transient;
- no visibility used as capability enforcement;
- no async publication without identity/revision/generation;
- no trusted external payload before validation and bounds;
- no platform surface without fallback;
- no heavy work in typing hot path;
- no target architecture reported as live.
