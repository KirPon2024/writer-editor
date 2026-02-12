# CODEX_DELIVERY_TEMPLATE_v1.0

## STATUS
- VERSION: `v1.0`
- MODE: `CANON-ALIGNED / LOW-RISK / STRUCTURAL`
- PR_MODE: `CLI_CREATE` (default)
- PR_MODE (optional): `CLI_CREATE_AND_AUTOMERGE_OPS_ONLY`
- SAFE_AUTOMERGE_OPS_ONLY: `true`

## EXECUTOR
- GPT:
  - Формирует ТЗ и policy-рамку.
  - Уточняет только high-impact неопределенности.
- CODEX:
  - Реализует файлы и tests в allowlist scope.
  - Выполняет checks, commit/push, PR create.
  - По умолчанию оставляет merge человеку (human merge).
  - Может выполнить `gh pr merge --merge` только при PASS всех safe gates.

## ACCOUNT BOOTSTRAP-PERMISSIONS (MANDATORY PREFLIGHT)
1. `git --version`
2. `node -v`
3. `npm -v`
4. `gh --version`
5. `git status --porcelain --untracked-files=all`
6. `git fetch origin`
7. `git ls-remote origin`
8. `gh auth status --hostname github.com`
9. `gh api /rate_limit`

Правило:
- Любой FAIL в `1..9` -> `STOP_REQUIRED=1`.

## PRECONDITIONS
- Рабочая ветка: `codex/<task-id>`.
- Scope только OPS-layer:
  - `docs/OPERATIONS/**`
  - `scripts/guards/**`
  - `test/contracts/**`
- Deny:
  - `src/**`
  - `.github/**`
  - `docs/OPS/**`
  - `package.json`
  - `*lock*`
- `FREEZE_READY_OK` не должен измениться.

## REQUIRED CHECKS (BEFORE COMMIT)
1. `node --test test/contracts/safe-automerge-eligibility.contract.test.js`
2. `node --test test/contracts/safe-automerge-ops-only.contract.test.js`
3. `npm test`
4. `node scripts/contracts/check-codex-prompt-mode.mjs`

Expected:
- Все checks `PASS`.
- `PROMPT_DETECTION=NOT_DETECTED`.

## PR CREATE (CLI)
- `gh pr create --repo KirPon2024/writer-editor --base main --head <BRANCH> --title "<TITLE>" --body "<FACTS_ONLY_BODY>"`

Policy:
- CLI-only PR creation.
- Facts-only body.

## SAFE_AUTOMERGE GATES (OPS-ONLY)
Single source of truth:
- `docs/OPERATIONS/STATUS/SAFE_AUTOMERGE_OPS_ONLY_PROFILE.json`
- Guard must read this profile; OPS-only path rules are not duplicated in code/docs.

1. OPS-only diff:
   - `git diff --name-only origin/main...HEAD` содержит только allowlist OPS paths из SoT-профиля.
2. Base:
   - `baseRefName == "main"`.
3. Head SHA:
   - `headRefOid == EXPECTED_HEAD_SHA`.
4. Checks:
   - `statusCheckRollup == SUCCESS` (все required checks зелёные).
5. Merge method:
   - только `gh pr merge --merge`.
   - запрет `squash`, `rebase`, `--admin`.
6. Mandatory eligibility guard before merge:
   - `node scripts/guards/check-safe-automerge-eligibility.mjs --pr <PR_NUMBER> --repo <OWNER/REPO> --expected-head-sha <EXPECTED_HEAD_SHA> --merge-method merge`
   - только при `ok=true` разрешен `gh pr merge --merge`.

Если любой gate FAIL:
- `STOP_REQUIRED=1`
- human merge через UI (последний клик человеком).

## POST-MERGE STRICT VERIFY 1→13
NETWORK GATE (MUST, before 1→13):
- STEP_01: `git fetch origin` MUST PASS.
- STEP_02: `git ls-remote origin` MUST PASS.
- STEP_03: `git rev-parse --verify origin/main` MUST PASS.
- Recommended guard command: `node scripts/guards/check-post-merge-origin-availability.mjs --json`.
- If any network gate step fails: `STOP_REQUIRED=1`, `FAIL_REASON=NETWORK_ORIGIN_UNAVAILABLE`.
- Запрещено засчитывать verify при fallback на локальные SHA/кэш.

1. `git --version`
2. `node -v`
3. `npm -v`
4. `gh --version`
5. `git status --porcelain --untracked-files=all`
6. `git fetch origin`
7. `git ls-remote origin`
8. `gh auth status --hostname github.com`
9. `gh api /rate_limit`
10. `node scripts/guards/check-safe-automerge-eligibility.mjs --pr <PR_NUMBER> --repo <OWNER/REPO> --expected-head-sha <MERGE_EXPECTED_HEAD_SHA> --merge-method merge`
11. `node --test test/contracts/safe-automerge-eligibility.contract.test.js`
12. `npm test`
13. `node scripts/contracts/check-codex-prompt-mode.mjs`

Expected:
- `PASS` по всем `1..13`.
- `PROMPT_DETECTION=NOT_DETECTED`.

## STOP REGISTRY
- `BOOTSTRAP_FAIL`: любой FAIL в bootstrap `1..9`.
- `SCOPE_VIOLATION`: diff за пределами allowlist OPS.
- `SAFE_AUTOMERGE_GATES_FAIL`: любой FAIL по gates.
- `CHECKS_FAIL`: любой FAIL required checks.
- `POST_MERGE_VERIFY_FAIL`: любой FAIL strict verify `1..13`.
- `PROMPT_DETECTED`: `PROMPT_DETECTION!=NOT_DETECTED`.

## DONE DEFINITION
- PR создан через CLI.
- Safe auto-merge прошел только при PASS всех gates.
- Post-merge strict verify `1..13` завершен с PASS.
- `PROMPT_DETECTION=NOT_DETECTED`.
- `FREEZE_READY_OK` без изменений.
