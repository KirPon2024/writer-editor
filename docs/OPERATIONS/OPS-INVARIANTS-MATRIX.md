## PURPOSE
NOTE: This document is a VIEW / historical artifact. Source of truth for invariants MUST be `docs/OPS/INVARIANTS_REGISTRY.json`. Debt MUST be sourced only from `docs/OPS/DEBT_REGISTRY.json`. Resolvable `checkId` tokens MUST be sourced only from `docs/OPS/AUDIT_CHECKS.json`.

Единая матрица инвариантов (VIEW) для быстрой навигации. Этот документ не определяет истину и не является нормативным источником.

## MATRIX
| Invariant | Source | Enforced by | Scope |
| --- | --- | --- | --- |
| CORE_PURITY_NO_EFFECT_TOKENS | OPS | gate | src/core/** |
| SMOKE_A4_SCRIPT_AVAILABLE — repeatable A4 sanity checks (clean/ops-gate/contracts exports) | OPS | manual | scripts/smoke-a4.mjs |
| PLATFORM_BASELINE_DOC_PRESENT — Purpose: platform baseline doc is present — ACTIVE_IN_CONTOUR_B | OPS | manual | docs/PLATFORM/CONTOUR-B-BASELINE.md |
| PLATFORM_NO_CORE_PLATFORM_DEPS — Purpose: CORE stays platform-neutral — ACTIVE_IN_CONTOUR_B | OPS | manual | src/core/** |
| PLATFORM_ADAPTERS_DECLARED — Purpose: adapter boundary is explicitly declared — ACTIVE_IN_CONTOUR_B | OPS | manual | Platform / Adapters |
| PLATFORM_ADAPTERS_LIST_COMPLETE — Purpose: adapters catalog is complete — DECLARED_NOT_ACTIVE | OPS | manual | docs/PLATFORM/CONTOUR-B-ADAPTERS.md |
| PLATFORM_ADAPTERS_NO_CORE_DEP — Purpose: adapters do not make CORE platform-dependent — DECLARED_NOT_ACTIVE | OPS | manual | src/core/** |
| PLATFORM_ADAPTERS_NO_UI_LOGIC — Purpose: adapters do not absorb UI logic — DECLARED_NOT_ACTIVE | OPS | manual | Platform / Adapters |
