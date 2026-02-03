# CONTOUR-B — Platform Adapter Catalog

## Purpose
This document defines the **catalog of adapters** for Contour B as a platform: what adapter types exist, what each category is responsible for, and what boundaries must remain intact.

It is intentionally descriptive: it does not describe implementations, APIs, libraries, or SDK choices.

## Scope
In scope:
- A platform-level view of adapter categories that connect CORE to the outside world.
- A minimal required set of adapters for the macOS delivery target (as a catalog, not as implementation).
- Behavioral constraints that prevent platform drift and protect CORE purity.

Out of scope:
- Feature definitions, UI/UX decisions, or product behavior.
- Any change to contracts, invariants, operational gates, or scripts.
- Any adapter implementation details or technology selection.

## Adapter Categories
Adapters are the platform-facing boundary that translates between CORE concepts and a specific environment. The catalog uses categories to keep responsibility explicit and non-overlapping.

Core categories:
- **Storage adapter**: reads and writes project data and related local assets using the platform’s local storage capabilities, while preserving “data is not locked” expectations (readable recovery, stable formats, and atomicity rules as defined elsewhere).
- **Workspace & paths adapter**: resolves and normalizes local paths, directories, and user-selected locations into a stable representation used by CORE and higher layers.
- **UI boundary adapter**: mediates user-intent signals and presentation needs without turning UI into a source of truth; it translates UI events into stable CORE-level intents and maps CORE outputs back to the UI layer.
- **Lifecycle adapter**: provides application lifecycle signals (startup, shutdown, suspend/resume) as platform events without embedding platform rules into CORE.
- **Permissions & policy adapter**: represents platform constraints as explicit allow/deny decisions and policy outcomes (not platform calls) to keep security posture and offline-first posture enforceable.
- **Interop adapter**: mediates controlled interactions with external system surfaces that are not part of CORE (for example: opening user-visible resources, importing/exporting via defined pipelines, or invoking platform-provided dialogs) without coupling CORE to those surfaces.
- **Observability adapter**: records diagnostics and operational signals locally in a way that supports troubleshooting without introducing network dependencies.

## Required Adapters (macOS)
For the macOS delivery target, the platform baseline requires the following adapters to be explicitly declared in the catalog and kept conceptually separate:
- **Local storage adapter**: local project persistence and local asset access; no network dependency.
- **File selection & workspace adapter**: user-directed selection of local locations and consistent path handling across the application.
- **App lifecycle adapter**: startup/shutdown and recovery-safe shutdown behavior, expressed as lifecycle signals for higher layers.
- **Window & focus adapter**: window-level lifecycle and focus signals needed for a desktop experience, without embedding platform rules into CORE.
- **Clipboard & share-surface adapter**: controlled exchange of user-selected content with the outside world, without making CORE dependent on platform-specific surfaces.
- **System policy adapter**: enforces “no remote code”, blocked navigation, and blocked new-window behaviors via policy outcomes, not via CORE logic.

## Forbidden Adapter Behaviors
Adapters must not:
- Become a second CORE by re-implementing domain rules or inventing new domain semantics.
- Change or reinterpret existing public contracts “to fit the platform”.
- Introduce network dependency for baseline operation or persistence.
- Store project data in a way that locks it to a platform-specific mechanism or opaque representation.
- Leak platform-specific assumptions into CORE (CORE must remain platform-neutral).
- Expand IPC or external interaction surfaces without explicit, separate contract work and validation.
- Hide failures by silently dropping writes or skipping recovery-related steps; failures must remain observable to higher layers.

## Stability Guarantees
This catalog is a platform baseline for Contour B:
- Categories define responsibilities and boundaries, not implementations.
- Adapter expansion is allowed only by adding new catalog entries or clarifying responsibilities, while keeping CORE/platform separation intact.
- The catalog does not change existing invariants; it points to them by boundary and responsibility.

## Explicit Non-Goals
- Specifying how adapters are implemented or which platform APIs are used.
- Selecting libraries, SDKs, packaging tools, or build systems.
- Defining UI, UX flows, visuals, or feature behavior.
- Introducing new invariants or modifying existing operational gates or scripts.
