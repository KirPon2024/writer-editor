# Agent Start Protocol

STATUS: ACTIVE_REPOSITORY_NATIVE_BOOTSTRAP
AUDIENCE: ANY_MODEL_ANY_AGENT_SURFACE

Цель: агент с одной обычной пользовательской задачей восстанавливает контекст
из репозитория без отдельного архитектурного промта и не начинает write до
детерминированного preflight.

## 1. Bootstrap

Из корня репозитория:

```text
npm run agent:bootstrap -- --objective "one sentence objective"
```

Bootstrap обязан:

- найти Git root и exact HEAD;
- разрешить active canon только через CANON_STATUS;
- проверить active COREX pointer и frozen v1 digest;
- проверить обязательные entrypoints и architecture manifest;
- показать dirty state, branch и origin/main;
- вывести ordered reading list и следующий gate;
- ничего не писать на диск и не менять Git refs/index.

Не продолжать при fail-signal.

## 2. Read order

1. `docs/OPS/STATUS/CANON_STATUS.json` и resolved active execution canon.
2. `CANON.md`.
3. `docs/corex/COREX.md` и current `docs/corex/COREX.v2.md`.
4. `docs/BIBLE.md`.
5. `docs/ARCHITECTURE_ONE_PAGE.md` и `docs/PRODUCT_GLOSSARY.md`.
6. `docs/DOCUMENTATION_CONSTITUTION.md`.
7. `docs/CONTEXT.md`, `docs/PROCESS.md`, `docs/HANDOFF.md`.
8. Task-relevant source, tests, schemas и exact-head evidence.

Архитектурная детализация обязательна через
`docs/YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md`; этот protocol не
создаёт сокращённую альтернативную архитектуру.

Читать не значит доверять любому тексту одинаково. Документ применяется только
в своей declared role и не расширяет claims более высокого authority.

## 3. Task classification

Классифицировать ровно один основной тип:

- `REPORT_ONLY` — чтение, аудит, diagnosis, status; repo write запрещён.
- `DOCS_ONLY` — канон/архитектура/process без product runtime mutation.
- `PRODUCT_CODE` — Core, commands, persistence, import/export, derived.
- `PRODUCT_UI` — design contract, surface, flow, component state или tokens.
- `OPS_GOVERNANCE` — machine evidence, gates, policies, delivery machinery.
- `HYGIENE_ISOLATION` — отдельный контур для безопасной изоляции чужого WIP.

Если задача содержит несколько независимых результатов, разрезать её на
последовательные bounded contours; одна branch/PR может содержать только
согласованный vertical slice с одним rollback.

## 4. Repository truth snapshot

До write зафиксировать:

- `BINDING_BASE_SHA` и `HEAD_SHA_AT_START`;
- `ORIGIN_MAIN_SHA` после fetch, когда network-authority разрешена;
- branch/worktree path, clean/dirty и владельца dirty files;
- active canon path и version;
- current COREX version;
- exact current code/evidence для затронутого claim;
- текущий writer lock и соседние незавершённые delivery chains.

Чужой dirty state не перемещать через stash/reset/clean. Создать или найти
изолированный linked worktree самостоятельно.

## 5. Architecture declaration

Создать temporary JSON по шаблону
`AGENT_TASK_ARCHITECTURE_DECLARATION_V1.json`. Затем:

```text
npm run agent:preflight -- --declaration temporary-declaration.json
```

Обязательные решения:

- objective, exact scope in/out и base SHA;
- product, command и design authority;
- typed operations;
- write path и read/projection path;
- product ports, Design OS ports и adapters;
- state classes и identity guards;
- capability revalidation;
- fallbacks, recovery и negative checks;
- current reality и target-only items;
- UI design router;
- dependency/network/security boundary;
- commit, push, PR и merge policy;
- rollback.

`NOT_APPLICABLE` допустим только с typed reason, например
`NOT_APPLICABLE_DOCS_ONLY`. Пустая строка или пропуск поля — fail.

## 6. Execution

- Выполнять один конкретный defect/acceptance gap.
- Сначала negative reproducer для defect, затем surgical fix.
- После fix: focused negative, affected-chain regression, baseline при нужде.
- Не расширять архитектуру, dependency set, runtime network или capability claim.
- Не считать UI, screenshot, renderer log или self-authored receipt достаточным
  oracle для product mutation.
- При третьем одинаковом failure остановить loop и записать expected, actual,
  seed, exact HEAD, hashes и одну следующую hypothesis.

## 7. Delivery

Default write policy:

```text
COMMIT_REQUIRED=true
PUSH_REQUIRED=true
PR_REQUIRED=true
MERGE_REQUIRED=true
```

После semantic closure немедленно commit. До следующего contour завершить push,
PR, required CI, merge и exact-head post-merge verification или вернуть STOP.

Base drift, unmergeable PR, missing permission или protected workflow — явный
STOP, а не разрешение на silent rebase/bypass.

## 8. Acceptance report

Final report содержит:

- task id и status;
- base, before, after, commit и merged SHA;
- changed basenames и scope proof;
- tests с numerator/denominator и skipped/todo truth;
- push, PR, CI и merge outcomes;
- current capability claim и ограничения;
- evidence hashes/oracles для physical claims;
- rollback;
- ровно один next action.

`PASS` без exact SHA, scope, numerator/denominator и independent authority там,
где она требуется, считается `UNKNOWN`, а не успехом.
