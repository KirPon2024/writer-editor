## HEADER
TASK_ID:
MILESTONE:
TYPE:
STATUS:

## MICRO_GOAL

## ARTIFACT

## ALLOWLIST

## DENYLIST

## CONTRACT / SHAPES

Перед любым write сначала разрешить `CANON_STATUS.json`, прочитать active canon,
затем `CANON.md`, COREX и BIBLE. Запомненный путь active canon не использовать.

Если задача добавляет feature, process, worker, import, export, analysis или UI
surface, приложить contract block по
`docs/YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md`:

- `FEATURE_INTEGRATION_MANIFEST_V1`
- product authority
- canonical Commands and Events
- product ports and adapters
- immutable projections
- Design OS surfaces and typed slots
- project, authoring working, derived, shell and transient state classes
- command catalog and dispatch direction
- capability revalidation and async identity guards
- materialization mode: `EXISTING_SEAM`, `NEW_PORT` или `TARGET_ONLY`
- fallbacks
- recovery and negative bypass checks
- current reality boundary

## IMPLEMENTATION_STEPS

## CHECKS
CHECK_01 выполняется ДО любых изменений; CHECK_02+ выполняются ПОСЛЕ.

Baseline (WRITE): использовать `ONLY_ALLOWED_CHANGE_NODE_HARD` (см. `docs/OPERATIONS/OPS-HARD-TZ-TEMPLATE-CHECKS.md`) с allowlist из секции ALLOWLIST.

## STOP_CONDITION

## REPORT_FORMAT

Ровно один code block `text`; только `KEY: VALUE`. Обязательны `TASK_ID`,
`HEAD_SHA_BEFORE`, `HEAD_SHA_AFTER`, `COMMIT_SHA`, `CHANGED_BASENAMES`,
`STAGED_SCOPE_MATCH`, `COMMIT_OUTCOME`, `PUSH_RESULT`, `PR_RESULT`,
`MERGE_RESULT`, `NEXT_STEP`. Пути, URL и `path:line` запрещены.

## FAIL_PROTOCOL
