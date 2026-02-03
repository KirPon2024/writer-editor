## HEADER
TASK_ID: CORE-A4-BOOTSTRAP-001
MILESTONE: A4
TYPE: CORE
STATUS: EXECUTABLE
CANON_VERSION: v1.0
CHECKS_BASELINE_VERSION: v1.0

## MICRO_GOAL
Создать минимальный каркас CORE-слоя как точки входа проектной работы A4 без реализации логики и без архитектурных решений.

## ARTIFACT
- src/core/README.md
- src/core/index.ts

## ALLOWLIST
- src/core/README.md
- src/core/index.ts

## DENYLIST
- git stash
- git reset
- git checkout
- git clean
- rebase
- commit --amend
- любые изменения вне ALLOWLIST

## CONTRACT / SHAPES
- CANON_VERSION: v1.0
- CHECKS_BASELINE_VERSION: v1.0
- CORE не зависит от UI, платформы, persistence.
- Файл index.ts не содержит реализации, только комментарий-контракт.
- README.md описывает назначение CORE и его границы, без деталей реализации.

## IMPLEMENTATION_STEPS
0) CHECK_01 выполняется ДО любых изменений; CHECK_02+ выполняются ПОСЛЕ.
1) Убедиться, что директория `src/core/` существует (создать если отсутствует).
2) Создать `src/core/index.ts` с пустым экспортом и комментариями о роли CORE.
3) Создать `src/core/README.md` с описанием:
   - что такое CORE в YALKEN;
   - что CORE является source of truth;
   - что всё вне CORE — replaceable.
4) Не добавлять код, зависимости, логику, типы или импорты.

## CHECKS
CHECK_01 выполняется ДО любых изменений; CHECK_02+ выполняются ПОСЛЕ.

Baseline (WRITE): использовать `ONLY_ALLOWED_CHANGE_NODE_HARD` (см. `docs/OPERATIONS/OPS-HARD-TZ-TEMPLATE-CHECKS.md`) с allowlist из секции ALLOWLIST.

CHECK_01_PRECONDITION_CLEAN_WORKTREE
CMD: test -z "$(git status --porcelain --untracked-files=all)" && echo OK
PASS: OUT == OK

CHECK_02_ONLY_ALLOWED_CHANGE_NODE_HARD
CMD: node -e 'const {execSync}=require("node:child_process");const allow=new Set(process.argv.slice(2));if(!allow.size){console.error("ALLOWLIST is empty");process.exit(2);}const out=execSync("git status --porcelain --untracked-files=all",{encoding:"utf8"}).trimEnd();if(!out){console.error("Working tree is clean");process.exit(1);}const changed=new Set(out.split("\n").map((line)=>{const p=line.slice(3);const parts=p.split(" -> ");return parts[parts.length-1];}));if(changed.size!==allow.size){console.error("Changed paths set != allowlist");process.exit(1);}for(const p of changed){if(!allow.has(p)){console.error(`Disallowed change: ${p}`);process.exit(1);}}for(const p of allow){if(!changed.has(p)){console.error(`Missing expected change: ${p}`);process.exit(1);}}process.exit(0);' src/core/README.md src/core/index.ts
PASS: exit 0

CHECK_03_NO_IMPORTS_IN_CORE_ENTRY
CMD: ! rg -n "^\\s*import\\b" src/core/index.ts >/dev/null && echo OK
PASS: OUT == OK

CHECK_04_README_HAS_SOURCE_OF_TRUTH
CMD: grep -F "CORE is the source of truth" src/core/README.md >/dev/null
PASS: exit 0

## STOP_CONDITION
- PASS всех CHECK → STOP.
- FAIL любого CHECK → STOP без исправлений.

## REPORT_FORMAT
- CHANGED
- CHECK
- OUT
- ASSUMPTIONS (пусто)

## FAIL_PROTOCOL
- Любой FAIL → немедленный STOP.
- Никаких auto-fix, обхода precondition или расширения ALLOWLIST.
