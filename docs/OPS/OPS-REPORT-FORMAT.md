# OPS-REPORT-FORMAT (CANON)

This file defines a canonical, repo-backed report format for task execution evidence.

## REQUIRED FIELDS (MUST)

- STEP_ID: <string>
  - STEP_ID must be unique across steps in a report.
- CHANGED: <files>
- CHECK: <checks, each with CMD/OUT/PASS|FAIL>
- OUT: <write/commit + post-commit proofs>
- ASSUMPTIONS: (empty)
- FAIL_REASON:
- EVIDENCE:
- REQUIRED_INPUT:
- OUT_MODE: `EXECUTION | RE-CHECK`
  - If `OUT_MODE=RE-CHECK`, use `CHANGED: (none)` and state that no new commit was created.

## CHECK ORDER (MUST)

- PRE-CHANGE check MUST exist:
  - CMD: `git status --porcelain --untracked-files=all`
  - PASS: OUT is `(empty)`
- PRE-COMMIT check MUST exist:
  - CMD: `git status --porcelain --untracked-files=all`
  - PASS: OUT matches expected staged/unstaged state for the step
- POST-COMMIT proof checks MUST exist (after COMMIT and before POST-COMMIT clean status):
  - CHECK_XX_COMMIT_CONTENT_EXACT $begin:math:text$POST-COMMIT PROOF$end:math:text$
    - CMD: `git show --name-only --pretty=format: HEAD`
    - OUT: <paths>
    - PASS|FAIL
  - CHECK_XX_NAME_STATUS_MATCHES_INTENT $begin:math:text$POST-COMMIT PROOF$end:math:text$
    - CMD: `git show --name-status --pretty=format: HEAD`
    - OUT: <A|M|D paths>
    - PASS|FAIL

## SRC-ONLY STEPS (MUST)

- A baseline doctor evidence check MUST exist:
  - CMD: `CHECKS_BASELINE_VERSION=v1.3 node scripts/doctor.mjs`
  - PASS: command exits 0 and prints deterministic tokens

## POST-COMMIT PROOFS (MUST)

- POST-COMMIT proof MUST include name-only:
  - POST-COMMIT CMD: `git show --name-only --pretty=format: HEAD`
  - POST-COMMIT OUT: <paths>
- POST-COMMIT proof MUST include name-status:
  - POST-COMMIT CMD: `git show --name-status --pretty=format: HEAD`
  - POST-COMMIT OUT:
```
D  example/deleted-file.txt
M  example/modified-file.txt
```
- POST-COMMIT proof MUST include clean worktree:
  - POST-COMMIT CMD: `git status --porcelain --untracked-files=all`
  - POST-COMMIT OUT: `(empty)`

## POST-COMMIT BLOB PROOF (MUST)

## COMMAND TEMPLATES (MUST)

- `CMD_TEMPLATE_BLOB_POST`: `git cat-file -t HEAD:<path>`
- `CMD_TEMPLATE_BLOB_PRE`: `git cat-file -t HEAD^:<path>`

- POST-COMMIT BLOB PROOF:
  - CMD: `CMD_TEMPLATE_BLOB_POST`
  - OUT: `blob`
  - PASS|FAIL

Rule: this block MUST appear for each committed file path in the step.

## MODIFICATION BLOB PROOF (MUST)

For each path that appears as `M` in POST-COMMIT `git show --name-status --pretty=format: HEAD` output:

- PRE-COMMIT BLOB PROOF (MODIFIED PATH):
  - CMD: `CMD_TEMPLATE_BLOB_PRE`
  - OUT: `blob`
  - PASS|FAIL
- POST-COMMIT BLOB PROOF (MODIFIED PATH):
  - CMD: `CMD_TEMPLATE_BLOB_POST`
  - OUT: `blob`
  - PASS|FAIL

For each path that appears as `D` in POST-COMMIT `git show --name-status --pretty=format: HEAD` output:

- PRE-COMMIT BLOB PROOF (DELETED PATH):
  - CMD: `CMD_TEMPLATE_BLOB_PRE`
  - OUT: `blob`
  - PASS|FAIL
- POST-COMMIT PATH REMOVED PROOF (DELETED PATH):
  - CMD: `CMD_TEMPLATE_BLOB_POST`
  - OUT: (exit != 0)
  - PASS|FAIL

## NO DUPLICATE CMD RULE (MUST)

- Within a single report, the exact `CMD:` string MUST NOT appear more than once.
- Exception: the report CAN repeat the same command only if:
  - the repetition is explicitly labeled as distinct semantic phases: `PRE-CHANGE`, `PRE-COMMIT`, `POST-COMMIT`, and
  - the expected `OUT:` is explicitly different and phase-bound.
- If the same command is repeated without meeting the exception, the report is invalid.

Example (invalid):

```
- CHECK:
  - CMD: `git status --porcelain --untracked-files=all`
  - OUT: `(empty)`
  - PASS
  - CMD: `git status --porcelain --untracked-files=all`
  - OUT: `(empty)`
  - PASS
```

Example (valid):

```
- CHECK:
  - CMD: `git status --porcelain --untracked-files=all` (PRE-CHANGE)
  - OUT: `(empty)`
  - PASS
  - CMD: `git status --porcelain --untracked-files=all` (PRE-COMMIT)
  - OUT: ` M path/to/file`
  - PASS
```

## POST-COMMIT OUT SECTION (MUST)

- OUT MUST NOT duplicate any `CMD:` strings already used in CHECK blocks.
- OUT MUST reference post-commit proofs by CHECK id and can repeat only the outputs:
  - `POST-COMMIT OUT (name-only): ...`
  - `POST-COMMIT OUT (name-status): ...`
  - `POST-COMMIT OUT (clean status): (empty)` (spell as `OUT: (empty)` only inside inline code)

## Execution Ticket (copy-paste template)

```md
EXECUTION TICKET
TICKET_ID: <id>
MODEL: Codex 5.3
ROLE: CODE
PERMISSIONS_PROFILE: PROFILE_CODE
APPROVED_BY: <name/handle>
APPROVED_AT: <iso8601>
BASE_SHA: <sha>
BASE_REF_WITH_TEMPLATE: <ref|none>
TARGET_SECTION_ANCHOR: <regex|literal>
PUSH_BRANCH: <branch>
PR_MODE: URL_ONLY

ALLOWLIST_PATHS_MODE: EXACT
ALLOWLIST_PATHS:
- FILE:<path-1>
- FILE:<path-2>

ALLOW_NEW_FILES: false

GOAL:
- <short task goal>

CHECKS:
- STATUS_CLEAN_PRE: `git status --porcelain --untracked-files=all`
- BASELINE_BINDING_PRE: `git rev-parse HEAD`
- WORKTREE_SCOPE: `git diff --name-status -M -C`
- STAGED_SCOPE: `git diff --cached --name-status -M -C`
- UNTRACKED_SCOPE: `git ls-files --others --exclude-standard`
- CHECK_06_SCOPE: `NEW_LINES_ONLY`
- CHECK_06_ENFORCED: `git diff -U0 --no-color HEAD~1..HEAD -- <ALLOWLISTED_FILES> | rg -n "<FORBIDDEN_TOKEN_REGEX>" || true`
- CHECK_06_ENFORCED_OUT: `(empty)`
- DOCTOR_STRICT: `node scripts/doctor.mjs` (run in strict baseline mode from project policy)
- NPM_TEST: `npm test`
- COMMIT_BINDING:
  - PRE: `git rev-parse HEAD`
  - PUSH: `git push -u origin <PUSH_BRANCH>`
  - POST: `git fetch origin`
  - POST: `git rev-parse origin/<PUSH_BRANCH>`
- CHECK_03/04/09 OUT: explicit list of changed paths

REPORT_FORMAT: docs/OPS/OPS-REPORT-FORMAT.md
POLICY: docs/OPS/CODEX-5.3-DOCS-vs-CODE-POLICY-v1.0-FROZEN.md
NETWORK_REQUIRED: false
SECRETS_REQUIRED: false
```

## RAW_OUT semantics (no fake empty)

For commands that may legitimately print nothing or may print variable output (examples: `git fetch`, `git push`, `git remote prune origin`, `git add`), record `OUT` using exactly one of:

- OUT: `(empty)` if the command produced no stdout/stderr
- `OUT: <PASTE_RAW>` if the command produced output (paste it verbatim)

Do not invent output. If stdout/stderr were empty, record `OUT: (empty)` and nothing else.

Examples of commands where the observed output is often empty:

- `git status --porcelain --untracked-files=all`
- `git ls-files --others --exclude-standard`
- `git diff --name-status ...` (when there are no changes)

## STEP_PATCH_APPLIED

If `# CHANGED` lists any paths (not `(none)`), `# CHECK` includes:

- `STEP_PATCH_APPLIED`
  - OUT: <1-2 short bullets describing what changed>
  - PASS|FAIL

If `# CHANGED` is `(none)`, this step does not appear.

## ANCHOR_SCOPE for discovery/template checks

When a check depends on the presence of a specific section/template, the report records:

- `BASE_REF_WITH_TEMPLATE: <ref|none>`
- `TARGET_SECTION_ANCHOR: <regex|literal>`

If the template/section is not present on `main`, the execution uses `BASE_REF_WITH_TEMPLATE` as the base ref, or adds the missing section when allowlist permits.

The report includes a base-ref confirmation check:

- `CHECK_BASE_REF`
  - CMD: `git rev-parse HEAD`
  - OUT: <PASTE_SHA>
  - PASS|FAIL

## Section-bounded checks (no global rg)

Checks like "exactly one heading", "exactly one fenced md block", and "placeholder present" are verified within the target section only (example: within `### PR_MERGE_DUMP_BLOCK`), not by a global `rg` over the entire file.

In `CMD`, prefer a deterministic, section-bounded approach, for example:

- find anchor line numbers with `rg -n`, extract only that section with `sed -n`, then validate within the extracted text as a separate step.

## REPORT TEMPLATE

### PR_MERGE_DUMP_BLOCK

Use this block as a standalone markdown snippet in PR comments/descriptions when the task reaches a merge/re-check/post-merge stage.

# PR_BODY (md)
```md
# CHANGED
- (none)

# CHECK
- CHECK_01_STATUS_CLEAN_PRE
  - CMD: `git status --porcelain --untracked-files=all`
  - OUT: <PASTE>
  - PASS|FAIL
- CHECK_02_BASELINE_BINDING_PRE
  - CMD: `git rev-parse HEAD`
  - OUT: <PASTE>
  - PASS|FAIL
- CHECK_03_WORKTREE_SCOPE
  - CMD: `git diff --name-status -M -C`
  - OUT: <PASTE>
  - PASS|FAIL
- CHECK_04_STAGED_SCOPE
  - CMD: `git diff --cached --name-status -M -C`
  - OUT: <PASTE>
  - PASS|FAIL
- CHECK_05_UNTRACKED_SCOPE
  - CMD: `git ls-files --others --exclude-standard`
  - OUT: <PASTE>
  - PASS|FAIL
- CHECK_06_TIGHTEN_EVIDENCE
  - CMD: `rg -n "OUT: \\(empty\\)$|OUT: \\(no output\\)$" docs/OPS/OPS-REPORT-FORMAT.md || true`
  - OUT: `(empty)`
  - PASS|FAIL
- CHECK_09_POST_COMMIT_PROOF
  - CMD: `git show --name-status -M -C --pretty=format: HEAD`
  - OUT: <PASTE>
  - PASS|FAIL
  - CMD: `git status --porcelain --untracked-files=all`
  - OUT: <PASTE>
  - PASS|FAIL
- CHECK_10_COMMIT_BINDING
  - CMD: `git rev-parse HEAD`
  - OUT: <PASTE>
  - PASS|FAIL
  - CMD: `git fetch origin`
  - OUT: <PASTE>
  - PASS|FAIL
  - CMD: `git rev-parse origin/<branch>`
  - OUT: <PASTE>
  - PASS|FAIL

# OUT
- mode: <EXECUTION|RE-CHECK|POST-MERGE VERIFY + CLEANUP>
- committed: <SHA|none>
- pushed ref: <origin/branch|none>
- PR create URL: <URL|none>
- PR: <PASTE_PR_URL|none>

# FAIL_REASON
- (empty|<TEXT>)

# EVIDENCE
- (empty|<BULLETS>)

# REQUIRED_INPUT
- (empty|<BULLETS>)
```
