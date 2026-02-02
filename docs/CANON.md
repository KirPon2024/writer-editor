# YALKEN — Canonical Architecture v1.1 (FROZEN)

STATUS: CANON

## PURPOSE
- This document defines the frozen architectural invariant of YALKEN v1.1.
- The statements in this document use RFC-style keywords: MUST / SHOULD / MAY.
- Any change MUST be introduced only by creating a new canonical version (v1.2, v2.0, ...).

## ARCHITECTURE FORMULA
Core
→ Ports (contracts)
→ Command Model
→ Event Bus
→ Registries
→ Plugins
→ Modes
→ UI Runtime
→ Skin / Theme

## GLOBAL LAWS
- The Core MUST be the single source of truth for domain state.
- The UI Runtime MUST NOT be a source of truth.
- The Core MUST NOT depend on UI, platform, or persistence mechanisms.
- Platform and UI MUST interact with the Core only through Ports.
- All state change MUST happen only via Commands.
- All observable consequences SHOULD be represented as Events.
- Extensions MUST be isolated, reversible, and explicitly declared.
- Architecture MUST be expressible as data and compiled deterministically.

## CORE
- The Core MUST define the domain model and invariants.
- The Core MUST own canonical representations of projects, documents, and scenes.
- The Core MUST expose only Ports and Command execution, not internal structures.
- The Core SHOULD be deterministic for identical inputs.
- The Core MUST treat Scenes as isolated editing domains.

## TEXT HANDLING
- Text MUST be represented and transformed in the Core, not in UI.
- Text transformations MUST be explicit and reversible where semantics are preserved.
- Hidden conversions MUST NOT exist (no silent format changes).
- Paste and external input MUST enter the system through explicit Ports and validation rules.
- Rendering MAY use derived views, but derived views MUST NOT mutate canonical text directly.

## PORTS (v1.1)
- A Port MUST be a stable contract between the Core and the outside world.
- Ports MUST be versioned at the contract level when breaking changes occur.
- Ports MUST NOT leak platform primitives into the Core.
- Ports SHOULD be grouped by capability:
  - Project Port (open, close, snapshot, recover)
  - Text Port (read, write, transform, query)
  - Scene Port (create, load, edit, isolate)
  - Persistence Port (atomic commit, list, restore)
  - Export Port (produce artifacts from canonical state)
  - UI Port (notify, request focus, surface state)

## IPC
- IPC MUST be treated as a transport, not as a domain boundary.
- IPC payloads MUST be validated against the Port contracts.
- IPC MUST be explicit and allowlisted by contract name.
- IPC MUST NOT allow direct execution of arbitrary actions outside the Command Model.

## REGISTRIES
- A Registry MUST be a declarative index of capabilities available at runtime.
- Registries MUST be buildable from Architecture Compiler inputs.
- Registries SHOULD be readable and serializable for debugging and recovery.
- Minimal required registries in v1.1:
  - Port Registry
  - Command Registry
  - Event Registry
  - Plugin Registry
  - Mode Registry

## ARCHITECTURE COMPILER
- The Architecture Compiler MUST take declarative architecture data and produce registries.
- Compilation MUST be deterministic.
- Compilation MUST fail fast on invalid declarations.
- The compiler output MUST be sufficient to construct runtime wiring without hidden rules.

## COMMAND MODEL
- A Command MUST be the only way to request a state change in the Core.
- A Command MUST have a stable name, a version, and a validated payload.
- Command execution MUST be atomic from the Core perspective (all-or-nothing).
- A Command SHOULD produce Events describing the change.
- Queries MUST NOT mutate state and MAY be executed separately from Commands.

## EVENT BUS
- An Event MUST represent an immutable fact about something that happened.
- Events MUST be emitted only as a result of successful Command execution.
- Event delivery SHOULD be ordered per originating scene or document.
- Subscribers MUST NOT be able to mutate the Core directly; they MAY only issue Commands.

## PLUGINS
- A Plugin MUST be a declarative extension that contributes to Registries.
- A Plugin MAY provide Commands, UI surfaces, and derived tools through contracts.
- A Plugin MUST NOT depend on Core internals; it MUST interact only via Ports.
- Plugin failure MUST be isolated from the Core state.

## MODES
- A Mode MUST be a declarative profile that selects capabilities and presentation.
- A Mode MUST define:
  - which Plugins are enabled
  - which Commands are available
  - which UI surfaces are visible
- Switching Modes MUST be reversible and MUST NOT corrupt Core state.

## ARCHITECTURE OF CHANGE
- Architectural change MUST be represented as versioned data.
- Migration MUST be explicit and reversible where possible.
- Any evolution MUST preserve the GLOBAL LAWS.
- Changes MAY extend Ports, Commands, Events, Plugins, and Modes without breaking the Core.

## RELEASE GATES
- A version MAY be considered valid only if the following remain true:
  - GLOBAL LAWS are not violated
  - Ports are complete enough to avoid direct Core coupling
  - Command and Event contracts are versioned and validated
  - Architecture Compiler output fully explains runtime wiring
  - Scenes remain isolated editing domains

## FINAL INVARIANT
YALKEN v1.1 is a deterministic Core with explicit Ports, Commands, and Events; everything outside the Core (platform, UI, plugins, and modes) is replaceable and MUST not become a source of truth.
