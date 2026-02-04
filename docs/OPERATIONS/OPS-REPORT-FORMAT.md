## PURPOSE
Определяет минимальный единый формат OPS-отчётов для контура B.
## REPORT_FORMAT
- CHANGED:
- CHECK:
- CHECK: final `git status --porcelain --untracked-files=all` (after commit) PASS: (empty)
- OUT:
- ASSUMPTIONS: (empty)
- FAIL_REASON:
- EVIDENCE:
- REQUIRED_INPUT:
## STOP_RULE
Any FAIL → immediate STOP
