# OPS — CONTOUR-B Exit & Closure Protocol

## Purpose
This document defines the repository- and documentation-level conditions for declaring **CONTOUR-B (Platform Boundary)** complete, including the logical closure of **MICROSTEP-CONTOUR-B-AUDIT**, while keeping the audit system in **TRANSITIONAL** mode and keeping **STRICT** enforcement disabled.

## Scope
In scope:
- Declarative closure criteria expressed as verifiable repository facts.
- The required documentation set that must exist to consider CONTOUR-B closed.
- A list of invariants that are checked in TRANSITIONAL mode and are not escalated to STRICT enforcement within CONTOUR-B.

Out of scope:
- Any implementation steps or execution instructions.
- Any changes to code, contracts, or operational gates.

## Preconditions
CONTOUR-B may be evaluated for closure only when:
- The repository is in a clean state (no pending changes).
- The platform boundary is documented as a baseline and as an adapter catalog.
- OPS audit artifacts exist and the matrix mode is explicitly declared as `TRANSITIONAL`.
- The transition into the platform contour is documented and remains consistent with existing constraints.

## Required Artifacts
The following documents MUST exist and be considered the source of truth for CONTOUR-B closure:
- `docs/PLATFORM/CONTOUR-B-BASELINE.md`
- `docs/PLATFORM/CONTOUR-B-ADAPTERS.md`
- `docs/OPERATIONS/OPS-INVARIANTS-MATRIX.md`
- `docs/OPERATIONS/OPS-CONTOUR-TRANSITIONS.md`
- `docs/OPERATIONS/OPS-CONTOUR-B-EXIT.md`
- `docs/OPS/AUDIT-MATRIX-v1.1.md`
- `docs/OPS/DEBT_REGISTRY.json`
- `docs/OPS/CAPABILITIES_MATRIX.json`
- `docs/OPS/PUBLIC_SURFACE.json`
- `docs/OPS/DOMAIN_EVENTS_BASELINE.json`
- `docs/OPS/TEXT_SNAPSHOT_SPEC.json`
- `docs/OPS/EFFECT_KINDS.json`
- `docs/OPS/ONDISK_ARTIFACTS.json`

Queue policy inventory MUST exist under `docs/OPS/` as a canonical registry (file name is intentionally not repeated here).

## Active Invariants
The following invariants are present as OPS audit guardrails and are evaluated in **TRANSITIONAL** mode (STRICT is not enabled in CONTOUR-B):
- `CORE-BOUNDARY-001`
- `CORE-DET-001`
- `CORE-DET-002`
- `EVENTS-APPEND-ONLY-001`
- `OPS-SNAPSHOT-001`
- `OPS-EFFECTS-IDEMP-001`
- `OPS-QUEUE-001`
- `OPS-CAPABILITIES-001`
- `OPS-PUBLIC-SURFACE-001`
- `OPS-ONDISK-001`

The following platform-level invariants are declared in `docs/OPERATIONS/OPS-INVARIANTS-MATRIX.md` and are **not activated**:
- `PLATFORM_ADAPTERS_LIST_COMPLETE`
- `PLATFORM_ADAPTERS_NO_CORE_DEP`
- `PLATFORM_ADAPTERS_NO_UI_LOGIC`

## Forbidden Changes
Closure of CONTOUR-B MUST NOT be accompanied by:
- Any changes outside the CONTOUR-B documentation set.
- Any change to code, contracts, or adapter implementations.
- Any modification of existing CONTOUR-A documents.
- Any escalation to STRICT mode.
- Any references to UI decisions, feature logic, or user scenarios.
- Any references to external execution contexts or external processes.

## Exit Signals
CONTOUR-B is considered closed when the following facts are true:
- All required artifacts listed in this document exist in the repository.
- The adapter catalog describes categories, required adapters, and forbidden behaviors at a boundary level (without implementation detail).
- Platform-level invariants listed in this document are present in the invariants matrix as declared (not activated).
- OPS audit mode is `TRANSITIONAL`, and `STRICT` enforcement is not enabled.
- All audited invariants listed in this document report a final status of `OK` under TRANSITIONAL mode.
- The repository is clean and contains only documentation changes attributable to CONTOUR-B work.
- Further work proceeds in **CONTOUR-C** (or an integration contour), not within CONTOUR-B.

## Non-Goals
- Proving or enforcing the invariants by executable enforcement.
- Introducing new invariants or changing the meaning of existing ones.
- Defining delivery behavior, UI behavior, or feature-level outcomes.
