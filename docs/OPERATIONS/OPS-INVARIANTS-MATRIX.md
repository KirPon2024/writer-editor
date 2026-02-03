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
