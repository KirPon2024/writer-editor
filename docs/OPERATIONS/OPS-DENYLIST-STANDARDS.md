## PURPOSE
Фиксирует канонический стандарт секции DENYLIST для HARD-ТЗ (CONTOUR-A) и устраняет неявные допущения о “разрешённых по умолчанию” действиях.

## NORMATIVE
DENYLIST обязателен в каждом HARD-ТЗ.
DENYLIST имеет приоритет над ALLOWLIST.
Если действие не разрешено явно — оно запрещено (default-deny).
Запрещены по умолчанию: git stash, git reset, git checkout, git clean.
Запрещены по умолчанию: rebase, commit --amend.
При нарушении PRECONDITION или DENYLIST: FAIL → STOP (без попыток чинить git-состояние).

## NOTES
- Любая попытка “починить” git-состояние запрещёнными командами (stash/reset/checkout/clean) не допускается: CHECK должен завершаться FAIL → STOP.
- Если CHECK требует clean worktree, а git-операции для исправления состояния запрещены — это не повод “обходить” правило; это сигнал остановиться и запросить человека.
