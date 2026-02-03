## MICRO_GOAL
Убрать count-based проверки из сценарного шага и обеспечить проверку точного множества SCN-ID через node set-equality.

## ARTIFACT
- docs/core/SCENARIOS.md
- docs/core/SCENARIOS.index.json

## ALLOWLIST
- docs/core/SCENARIOS.md
- docs/core/SCENARIOS.index.json

## DENYLIST
- git stash
- git reset
- git checkout
- git clean
- rebase
- commit --amend
- wc -l
- grep -x
- awk
- .trim(

## CONTRACT / SHAPES
- Ровно 3 сценария: SCN-01, SCN-02, SCN-03
- SCENARIOS.index.json содержит точное множество этих ID
- Проверки выполняются через node set-equality (без count-based паттернов)

## IMPLEMENTATION_STEPS
1. PRE: clean worktree
2. Обеспечить, что `docs/core/SCENARIOS.md` содержит упоминания SCN-01..03
3. Обеспечить, что `docs/core/SCENARIOS.index.json` содержит `["SCN-01","SCN-02","SCN-03"]`
4. POST: прогнать CHECKS

## CHECKS
### CHECK_01_PRE_CLEAN_WORKTREE
CMD: test -z "$(git status --porcelain --untracked-files=all)" && echo OK
EXPECT: OK

### CHECK_02_POST_SCN_ID_SET_EQUALITY
CMD: node -e 'const fs=require("fs");const md=fs.readFileSync("docs/core/SCENARIOS.md","utf8");const ids=[...md.matchAll(/\bSCN-0[1-3]\b/g)].map(m=>m[0]);const mdSet=new Set(ids);const idx=JSON.parse(fs.readFileSync("docs/core/SCENARIOS.index.json","utf8"));const idxSet=new Set(idx);const exp=new Set(["SCN-01","SCN-02","SCN-03"]);const eq=(a,b)=>a.size===b.size&&[...a].every(x=>b.has(x));if(!eq(mdSet,exp)||!eq(idxSet,exp)){console.error("SCN_SET_MISMATCH");console.error("MD:",[...mdSet].sort().join(","));console.error("IDX:",[...idxSet].sort().join(","));process.exit(1);}console.log("OK");'
EXPECT: OK

### CHECK_03_POST_ONLY_ALLOWED_CHANGE_HARD
CMD: node -e 'const cp=require("child_process");const s=cp.execSync("git diff --name-only",{encoding:"utf8"}).split("\n").filter(Boolean);const set=new Set(s);const allow=new Set(process.argv.slice(1));const eq=set.size===allow.size&&[...set].every(x=>allow.has(x));if(!eq){console.error("CHANGED_SET != ALLOWLIST");console.error([...set].sort().join("\n")||"(none)");process.exit(1);}console.log("OK");' docs/core/SCENARIOS.md docs/core/SCENARIOS.index.json
EXPECT: OK

## STOP_CONDITION
Любой FAIL любого CHECK → STOP

## REPORT_FORMAT
- CHECK_01/02/03: PASS/FAIL + stdout/stderr
- WRITE: список выполненных write-команд
- ASSUMPTIONS: (empty)

## FAIL_PROTOCOL
FAIL → STOP; не менять файлы вне ALLOWLIST; не использовать DENYLIST
