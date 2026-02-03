## HEADER
TASK_ID: OPS-A4-CHECK-ROBUST-INDEX-001
MILESTONE: A4
TYPE: OPS_WRITE
STATUS: EXECUTABLE
CANON_VERSION: v1.0
CHECKS_BASELINE_VERSION: v1.0

## ALLOWLIST
- docs/tasks/OPS-A4-CHECK-ROBUST-INDEX-001.md

## DENYLIST
- git stash
- git reset
- git checkout
- git clean
- rebase
- commit --amend
- любые изменения вне ALLOWLIST

## CONTRACT / SHAPES
- Цель: заменить хрупкую проверку CHECK_01, зависящую от точного текста/позиции строки `git status`, на каноническую проверку множества изменённых путей.
- Проверка должна быть устойчива к пробелам, порядку строк и форматам porcelain.
- Проверяется инвариант: изменён ровно один файл `src/core/index.ts`.
- Запрещены count-based проверки (`wc -l`, `grep -x N`) и парсинг по “первой строке”.

## IMPLEMENTATION_STEPS
0) CHECK_01 выполняется ДО любых изменений; CHECK_02+ выполняются ПОСЛЕ.
1) В текущем HARD-ТЗ заменить CHECK_01_PRECONDITION_DIRTY_EXPECTED на проверку множества путей.
2) Использовать Node one-liner с `.trimEnd()` и извлечением путей через `line.slice(3)` и обработкой rename (`a -> b`).
3) Не изменять бизнес-логику, контракты CORE или файлы проекта.
4) Сохранить файл ТЗ.

## CHECKS
CHECK_01 выполняется ДО любых изменений; CHECK_02+ выполняются ПОСЛЕ.

CHECK_01_PRECONDITION_DIRTY_EXPECTED_SET
CMD: node -e 'const {execSync}=require("node:child_process");const out=execSync("git status --porcelain --untracked-files=all",{encoding:"utf8"}).trimEnd();if(!out){console.error("No dirty files");process.exit(2);}const paths=new Set(out.split("\n").map(l=>{const p=l.slice(3);const ps=p.split(" -> ");return ps[ps.length-1];}));if(paths.size!==1){console.error("Expected exactly one changed path");process.exit(3);}if(!paths.has("src/core/index.ts")){console.error("Unexpected changed path");process.exit(4);}process.exit(0);' && echo OK
PASS: OUT == OK

CHECK_02_ONLY_ALLOWED_CHANGE_NODE_HARD
CMD: node -e 'const {execSync}=require("node:child_process");const allow=new Set(process.argv.slice(2));if(!allow.size){console.error("ALLOWLIST is empty");process.exit(2);}const out=execSync("git status --porcelain --untracked-files=all",{encoding:"utf8"}).trimEnd();if(!out){console.error("Working tree is clean");process.exit(1);}const changed=new Set(out.split("\n").map(l=>{const p=l.slice(3);const ps=p.split(" -> ");return ps[ps.length-1];}));if(changed.size!==allow.size){process.exit(1);}for(const p of changed){if(!allow.has(p))process.exit(1);}for(const p of allow){if(!changed.has(p))process.exit(1);}process.exit(0);' src/core/index.ts
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
