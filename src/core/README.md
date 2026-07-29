# Product Core

Product Core owns product semantics and canonical state transitions. Its
feature-integration boundary is defined by
`YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md`.

## Authority
- Core owns domain rules, identity, migrations, recovery semantics and
  authoritative operations.
- Command Kernel owns action meaning, availability and canonical mutation
  routing.
- Design OS owns computed interface form and never becomes product truth.
- Unsaved editor content is authoring working state with no-loss duty, not
  shell or discardable transient state.

## Boundaries
- Core does not depend on UI, Electron, platform implementations or concrete
  persistence.
- External effects cross product ports and adapters.
- UI and workers consume revision-bound projections and cannot write Core or
  storage directly.
- Async results must match project, entity, source revision and generation.

## Current reality
This directory contains a real but partial core foundation: contracts,
registry, reducer, engine, runtime primitives and bounded product helpers.
It does not prove that all current product behavior has migrated into one
universal Core. New work follows the doctrine without a big-bang rewrite.
