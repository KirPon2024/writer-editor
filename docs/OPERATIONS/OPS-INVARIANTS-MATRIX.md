## PURPOSE
Единая матрица инвариантов CONTOUR-A: что именно является правилом, где источник истины, и чем оно обеспечивается.

## MATRIX
| Invariant | Source | Enforced by | Scope |
| --- | --- | --- | --- |
| Write-задачи начинаютcя с precondition clean worktree | PROCESS | CHECK | OPS |
| HARD‑ТЗ без секции DENYLIST невалидно | PROCESS | gate | OPS |
| DENYLIST имеет приоритет над ALLOWLIST | OPS | manual | OPS |
| Write-задачи ограничены allowlist (set equality / allowlist-only) | OPS | CHECK | OPS |
| В CHECK запрещены `wc -l` / `grep -x N` (count-based git status) | OPS | gate | OPS |
| В CHECK запрещён `awk` | OPS | gate | OPS |
| В CHECK запрещено `.trim(` (кроме `.trimEnd(`) | OPS | gate | OPS |
| CORE_PURITY_NO_EFFECT_TOKENS | OPS | gate | src/core/** |
| SMOKE_A4_SCRIPT_AVAILABLE — repeatable A4 sanity checks (clean/ops-gate/contracts exports) | OPS | manual | scripts/smoke-a4.mjs |
| PLATFORM_BASELINE_DOC_PRESENT — Purpose: platform baseline doc is present — ACTIVE_IN_CONTOUR_B | OPS | manual | docs/PLATFORM/CONTOUR-B-BASELINE.md |
| PLATFORM_NO_CORE_PLATFORM_DEPS — Purpose: CORE stays platform-neutral — ACTIVE_IN_CONTOUR_B | OPS | manual | src/core/** |
| PLATFORM_ADAPTERS_DECLARED — Purpose: adapter boundary is explicitly declared — ACTIVE_IN_CONTOUR_B | OPS | manual | Platform / Adapters |
