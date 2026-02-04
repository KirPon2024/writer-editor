# CONTOUR-B — Platform Baseline

## Purpose
Contour B defines the **platform layer**: a stable, non-feature foundation that enables multiple adapters and delivery targets without drifting CORE or public contracts.

This document fixes the baseline for Contour B (Platform / Adapters) and clarifies what Contour B is responsible for, what it can extend, and what it must not change.

## Scope
In scope:
- Platform concerns around **adapters** and integration boundaries (how external environments connect to the system).
- Repeatable, platform-level conventions that keep CORE and exported contracts stable while adapters evolve.
- Operationalization of platform work (documentation, checklists, future checks), without changing existing gates now.

Out of scope:
- Shipping product features.
- UI/UX decisions, flows, and visuals.
- Any change to existing contracts, existing invariants, ops-gates, or smoke scripts.

## Responsibilities
Contour B is responsible for:
- Keeping a clean separation between CORE and environment-specific code (adapters).
- Providing a predictable integration surface for adapters while preserving existing contracts and CORE purity.
- Ensuring platform work remains compatible with project-wide constraints (offline-first, local data, security posture) as already defined by the canon and existing policies.

Contour B is not responsible for:
- Defining or implementing feature behavior.
- Redefining contracts or “moving responsibilities” between CORE and UI.

## Explicit Non-Goals
- Adding or describing concrete features.
- Introducing new project invariants.
- Free-form architecture redesign or refactors not required by platform boundaries.
- Locking data into proprietary formats or workflows.
- Any network-dependent platform behavior.

## Stability Guarantees
Contour B does **not** change project-wide invariants. It activates a small set of platform baseline invariants for Contour B, and it re-states stability guarantees already enforced by the canon and existing operational rules.

### Active invariants
- PLATFORM_BASELINE_DOC_PRESENT
- PLATFORM_NO_CORE_PLATFORM_DEPS
- PLATFORM_ADAPTERS_DECLARED

Stable inputs (MUST NOT change within Contour B without a separate, explicit canon change task):
- Project invariants from `CANON.md` (desktop-first, offline-first, scenes as isolated entities, recovery requirement, etc.).
- Existing public contracts and export surface established in Contour A.
- Existing operational gates and scripts (including OPS-gate and smoke scripts).
- Existing security posture and “no remote code / no navigation / no new-window” expectations for the desktop shell.
- Existing local-first storage posture (local data, readable recovery, atomic writes) as already defined elsewhere.

Extensible space (MAY expand within Contour B while keeping the above stable):
- New adapter implementations and adapter-specific configuration, provided they do not change existing contracts.
- Additional platform documentation and operational guidance.
- Additional platform checks and validations introduced later as explicit follow-up steps (not silently added to gates).

## Exit Criteria
- This baseline document exists and matches the required structure.
- The `A → B` transition document explicitly states what remains active and what checks are planned later (but are not active now).
- No changes outside the approved documentation allowlist for this task.

### Gate: invariants present in matrix
- Platform baseline invariants are present in docs/OPERATIONS/OPS-INVARIANTS-MATRIX.md and marked ACTIVE_IN_CONTOUR_B.
